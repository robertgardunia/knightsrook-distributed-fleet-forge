import Anthropic from '@anthropic-ai/sdk';
import { io } from 'socket.io-client';
import { addToxic, resetProxy, listToxics } from './toxiproxy.js';
import { stopContainer, restartContainer, hangProcess } from './docker.js';

interface FleetNode {
  id: string;
  name: string;
  role: string;
  status: string;
  alerting?: boolean;
  parentId?: string;
}

interface FleetGraph {
  nodes: FleetNode[];
  links: Array<{ source: string; target: string }>;
  isMock?: boolean;
}

interface StationSituation {
  id: string;
  proxyName: string;
  controllerId: string;
  controllerStatus: string;
  controllerAlerting: boolean;
  kiosks: { total: number; alive: number; alerting: number; dead: number };
  activeFaults: string;
  history: string[];
}

const STATIONS = ['s1', 's2', 's3', 's4'] as const;
const PROXY_NAMES = STATIONS.map(s => `${s}-upstream`) as unknown as readonly string[];

const client    = new Anthropic();
const FLEET_URL = process.env.FLEET_URL          ?? 'http://homebase:5020';
const MIN_MS    = Number(process.env.MIN_INTERVAL_MS ?? 30_000);
const MAX_MS    = Number(process.env.MAX_INTERVAL_MS ?? 120_000);

let fleetGraph: FleetGraph | null = null;

// Per-station action history — keyed by station ID ("s1", "s2", ...)
const stationHistory = new Map<string, string[]>();

function stationKey(target: string): string | null {
  const m = target.match(/^(s\d+)/);
  return m ? m[1] : null;
}

function recordAction(target: string, summary: string): void {
  const key = stationKey(target);
  if (!key) return;
  const h = stationHistory.get(key) ?? [];
  h.push(summary);
  if (h.length > 5) h.shift();
  stationHistory.set(key, h);
}

async function buildSituations(graph: FleetGraph): Promise<StationSituation[]> {
  return Promise.all(
    STATIONS.map(async (id) => {
      const proxyName    = `${id}-upstream`;
      const controllerId = `${id}-controller`;
      const controller   = graph.nodes.find(n => n.id === controllerId);
      const kiosks       = graph.nodes.filter(n => n.parentId === controllerId);

      const alive    = kiosks.filter(n => n.status !== 'dead').length;
      const alerting = kiosks.filter(n => !!n.alerting).length;
      const dead     = kiosks.filter(n => n.status === 'dead').length;

      let activeFaults = 'none';
      try {
        const toxics = await listToxics(proxyName);
        if (toxics.length > 0) {
          activeFaults = toxics.map(t => {
            const a = t.attributes;
            if (t.type === 'latency')     return `latency ${a.latency}ms jitter ${a.jitter ?? 0}ms`;
            if (t.type === 'packet_loss') return `packet_loss ${a.percent}%`;
            if (t.type === 'bandwidth')   return `bandwidth_cap ${a.rate}KB/s`;
            return t.type;
          }).join(', ');
        }
      } catch {
        activeFaults = 'unknown (proxy unreachable)';
      }

      return {
        id,
        proxyName,
        controllerId,
        controllerStatus:   controller?.status   ?? 'unknown',
        controllerAlerting: controller?.alerting ?? false,
        kiosks: { total: kiosks.length, alive, alerting, dead },
        activeFaults,
        history: stationHistory.get(id) ?? [],
      };
    })
  );
}

function buildPrompt(situations: StationSituation[], forced: boolean): string {
  const blocks = situations.map(s => {
    const ctrl    = `controller=${s.controllerStatus}${s.controllerAlerting ? ' ALERTING' : ''}`;
    const kStatus = s.kiosks.alive === s.kiosks.total
      ? `kiosks=${s.kiosks.total}/${s.kiosks.total} alive`
      : `kiosks=${s.kiosks.alive}/${s.kiosks.total} alive` +
        (s.kiosks.alerting ? `, ${s.kiosks.alerting} alerting` : '') +
        (s.kiosks.dead     ? `, ${s.kiosks.dead} dead`         : '');
    const hist = s.history.length > 0 ? s.history.join(' → ') : 'no recent actions';

    return `[${s.id.toUpperCase()} — ${s.proxyName}]  ${ctrl}  ${kStatus}
  Active faults : ${s.activeFaults}
  History       : ${hist}`;
  }).join('\n\n');

  // For forced/manual triggers, find the most recently targeted station so we
  // can explicitly tell Haiku to go elsewhere.
  let forcedAddendum = '';
  if (forced) {
    const allHistory = situations.flatMap(s => s.history.map(h => ({ station: s.id, h })));
    const lastEntry  = allHistory[allHistory.length - 1];
    const avoidHint  = lastEntry
      ? `The most recent action targeted ${lastEntry.station.toUpperCase()} (${lastEntry.h}). Do NOT act on ${lastEntry.station.toUpperCase()} again this cycle.`
      : 'All stations are clean — start fresh incidents on multiple stations.';

    forcedAddendum = `

⚡ MANUAL DEMO TRIGGER — SPREAD MODE: Override constraints 2 and 3. Do NOT deepen an existing story or re-target the same node. Your job right now is to demonstrate that failures happen INDEPENDENTLY across the fleet. Pick the station with the least recent activity and start a brand new, unrelated incident there. ${avoidHint} Use a different fault category than the last action if possible.`;
  }

  return `You are a chaos engineer stress-testing a distributed kiosk fleet deployed across four physical stations. Each station is a separate venue installation that can fail in its own way for its own reasons. Your job is to create realistic, independent failure narratives — not uniform chaos.

Current situation per station:

${blocks}

Topology:
- Station controllers reach homebase through their named proxy (s1-upstream … s4-upstream)
- Each station has 4 game kiosks (sN-game-1…4) and 2 info kiosks (sN-info-1…2) that connect only to their station controller
- Container names follow the pattern exactly: s1-controller, s2-game-3, s4-info-1, homebase, etc.

Fault categories — each tells a different kind of story:
  NETWORK  — inject_latency, inject_packet_loss, inject_bandwidth, reset_network
             Affects the station→homebase link. Kiosks stay up but their controller loses homebase visibility.
             Stories: congested uplink, damaged cable, WiFi interference, ISP throttling, overloaded switch.
  POWER    — stop_container (hard failure, stays down), restart_container (self-recovering blip)
             The node actually dies. Stories: pulled power, UPS failure, breaker trip, watchdog reboot.
  CODE     — hang_process (container alive, process frozen — the silent failure)
             Container looks healthy to Docker but the agent stops heartbeating. Stories: GC freeze,
             deadlock on a connection pool, blocking I/O, runaway thread, memory pressure stall.
             Code failures are not station-specific — they can hit any node anywhere independently.

Constraints:
1. Each station has its own independent story. S2 having intermittent packet loss and S3 having a hung kiosk are separate situations with separate causes — don't treat the fleet as a unit.
2. Let a story develop before starting another. Escalate within a station before touching a new one.
3. If a station already has active faults or dead/alerting nodes, that story is still unfolding — decide whether to escalate, hold, or let it breathe.
4. A station with no history is a candidate for a new story beginning — start with something small and specific.
5. Code failures (hang_process) are universal — they can be layered on top of any station situation or start a new story on a clean station. A hung kiosk on top of a degraded network is a compound failure.
6. Use observe when you're waiting for a fault to show up in node status before deciding the next move.

Choose exactly ONE action. The reason field should read like a plausible incident report — what specifically is happening in the real world right now.${forcedAddendum}`;
}

const tools: Anthropic.Tool[] = [
  {
    name: 'inject_latency',
    description: 'Add latency to a station upstream connection — the first sign of network degradation (congested switch, long routing path, overloaded uplink, marginal cable).',
    input_schema: {
      type: 'object' as const,
      properties: {
        station:    { type: 'string', enum: [...PROXY_NAMES] },
        latency_ms: { type: 'number', description: 'Base added latency in ms (50–3000)' },
        jitter_ms:  { type: 'number', description: 'Per-packet random jitter in ms (0–500)' },
        reason:     { type: 'string', description: 'Specific real-world failure mode' },
      },
      required: ['station', 'latency_ms', 'reason'],
    },
  },
  {
    name: 'inject_packet_loss',
    description: 'Drop a percentage of packets — simulates wireless interference, damaged cable, or a switch with bad memory.',
    input_schema: {
      type: 'object' as const,
      properties: {
        station: { type: 'string', enum: [...PROXY_NAMES] },
        percent: { type: 'number', description: 'Loss percentage (1–75)' },
        reason:  { type: 'string', description: 'Specific real-world failure mode' },
      },
      required: ['station', 'percent', 'reason'],
    },
  },
  {
    name: 'inject_bandwidth',
    description: 'Cap the upstream bandwidth — simulates a saturated ISP link, rate-limited port, or shared connection with heavy competing traffic.',
    input_schema: {
      type: 'object' as const,
      properties: {
        station:   { type: 'string', enum: [...PROXY_NAMES] },
        rate_kbps: { type: 'number', description: 'Max throughput in KB/s (8–2048)' },
        reason:    { type: 'string', description: 'Specific real-world failure mode' },
      },
      required: ['station', 'rate_kbps', 'reason'],
    },
  },
  {
    name: 'reset_network',
    description: 'Remove all network faults from a station proxy — the issue resolved itself (tech fixed the cable, congestion cleared, ISP restored, etc.).',
    input_schema: {
      type: 'object' as const,
      properties: {
        station: { type: 'string', enum: [...PROXY_NAMES] },
        reason:  { type: 'string', description: 'Why the fault cleared' },
      },
      required: ['station', 'reason'],
    },
  },
  {
    name: 'stop_container',
    description: 'Hard-stop a container — simulates power failure, process crash, or pulled cable. Stays down until the recovery agent or an operator intervenes. Do NOT target chaos-agent or homebase.',
    input_schema: {
      type: 'object' as const,
      properties: {
        container: { type: 'string', description: 'Exact container name (never chaos-agent)' },
        reason:    { type: 'string', description: 'Specific real-world failure mode' },
      },
      required: ['container', 'reason'],
    },
  },
  {
    name: 'restart_container',
    description: 'Stop a container and restart it after a delay — simulates UPS cutover, watchdog-triggered reboot, or brief power blip where the machine self-recovers. Do NOT target chaos-agent or homebase.',
    input_schema: {
      type: 'object' as const,
      properties: {
        container: { type: 'string', description: 'Exact container name (never chaos-agent)' },
        down_ms:   { type: 'number', description: 'Downtime in ms (5000–60000)' },
        reason:    { type: 'string', description: 'Specific real-world failure mode' },
      },
      required: ['container', 'down_ms', 'reason'],
    },
  },
  {
    name: 'hang_process',
    description: 'Pause the main process inside a container via SIGSTOP without stopping the container — simulates a software deadlock, hung I/O wait, infinite loop, or garbage collection freeze. The container appears running and healthy to Docker, but the agent stops heartbeating. Automatically resumes after hang_ms via SIGCONT (the "thaw"). Do NOT target chaos-agent or homebase.',
    input_schema: {
      type: 'object' as const,
      properties: {
        container: { type: 'string', description: 'Exact container name (never chaos-agent)' },
        hang_ms:   { type: 'number', description: 'How long the process stays frozen in ms (10000–120000)' },
        reason:    { type: 'string', description: 'Specific code-level failure mode (e.g. GC pause, deadlock on DB connection pool, blocking I/O)' },
      },
      required: ['container', 'hang_ms', 'reason'],
    },
  },
  {
    name: 'observe',
    description: 'Hold this cycle without injecting anything — waiting for a recent fault to propagate into node status, or monitoring an unfolding situation before deciding next action.',
    input_schema: {
      type: 'object' as const,
      properties: {
        observation: { type: 'string', description: 'What you observe and why you are waiting' },
      },
      required: ['observation'],
    },
  },
];

// homebase is the fleet socket server — stopping it kills the dashboard connection
const SELF_CONTAINERS = new Set(['chaos-agent', 'homebase']);

async function executeTool(name: string, input: Record<string, unknown>): Promise<void> {
  const reason = (input.reason ?? input.observation ?? '') as string;

  const container = input.container as string | undefined;
  if (container && SELF_CONTAINERS.has(container)) {
    console.warn(`[HAIKU] blocked self-targeting: ${name}(${container})`);
    return;
  }

  // Broadcast to dashboard clients before executing
  const target = (input.container ?? input.station ?? '') as string;
  if (name !== 'observe') {
    socket.emit('chaos:action', { tool: name, target, reason });
  }

  switch (name) {
    case 'inject_latency': {
      const { station, latency_ms, jitter_ms = 0 } = input as { station: string; latency_ms: number; jitter_ms?: number };
      await addToxic(station, { name: 'latency', type: 'latency', attributes: { latency: latency_ms, jitter: jitter_ms } });
      console.log(`[HAIKU] +latency station=${station} ms=${latency_ms} jitter=${jitter_ms}`);
      recordAction(station, `latency ${latency_ms}ms (${reason})`);
      break;
    }
    case 'inject_packet_loss': {
      const { station, percent } = input as { station: string; percent: number };
      await addToxic(station, { name: 'packet_loss', type: 'packet_loss', attributes: { percent } });
      console.log(`[HAIKU] +packet_loss station=${station} pct=${percent}`);
      recordAction(station, `packet_loss ${percent}% (${reason})`);
      break;
    }
    case 'inject_bandwidth': {
      const { station, rate_kbps } = input as { station: string; rate_kbps: number };
      await addToxic(station, { name: 'bandwidth', type: 'bandwidth', attributes: { rate: rate_kbps } });
      console.log(`[HAIKU] +bandwidth station=${station} kbps=${rate_kbps}`);
      recordAction(station, `bandwidth_cap ${rate_kbps}KB/s (${reason})`);
      break;
    }
    case 'reset_network': {
      const { station } = input as { station: string };
      await resetProxy(station);
      console.log(`[HAIKU] reset_network station=${station}`);
      recordAction(station, `network restored (${reason})`);
      break;
    }
    case 'stop_container': {
      const { container } = input as { container: string };
      await stopContainer(container);
      console.log(`[HAIKU] stop_container name=${container}`);
      recordAction(container, `${container} stopped (${reason})`);
      break;
    }
    case 'restart_container': {
      const { container, down_ms } = input as { container: string; down_ms: number };
      restartContainer(container, down_ms).catch(err =>
        console.error(`[HAIKU] restart_container failed: ${err}`)
      );
      console.log(`[HAIKU] restart_container name=${container} down=${down_ms}ms`);
      recordAction(container, `${container} restarted down=${Math.round(down_ms / 1000)}s (${reason})`);
      break;
    }
    case 'hang_process': {
      const { container, hang_ms } = input as { container: string; hang_ms: number };
      hangProcess(container, hang_ms);
      console.log(`[HAIKU] hang_process name=${container} hang=${hang_ms}ms`);
      recordAction(container, `${container} hung ${Math.round(hang_ms / 1000)}s (${reason})`);
      break;
    }
    case 'observe': {
      console.log(`[HAIKU] observe: ${reason}`);
      break;
    }
    default:
      console.warn(`[HAIKU] unknown tool: ${name}`);
  }
}

async function runChaosStep(forced = false): Promise<void> {
  if (!fleetGraph || fleetGraph.isMock || fleetGraph.nodes.length === 0) {
    console.log('[HAIKU] fleet not ready, skipping');
    return;
  }

  const situations  = await buildSituations(fleetGraph);
  const prompt      = buildPrompt(situations, forced);
  // Manual trigger: exclude observe — user clicked the button expecting something to happen
  const activeTools = forced ? tools.filter(t => t.name !== 'observe') : tools;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    tools: activeTools,
    tool_choice: { type: 'any' },
    messages: [{ role: 'user', content: prompt }],
  });

  for (const block of response.content) {
    if (block.type === 'tool_use') {
      const input  = block.input as Record<string, unknown>;
      const reason = (input.reason ?? input.observation ?? '') as string;
      console.log(`[HAIKU] reasoning: "${reason}"`);
      await executeTool(block.name, input);
    }
  }
}

function rand(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

async function chaosLoop(): Promise<void> {
  await new Promise(r => setTimeout(r, 15_000));

  while (true) {
    try {
      await runWithLock(false);
    } catch (err) {
      console.error('[HAIKU] step error:', err);
    }
    const delay = rand(MIN_MS, MAX_MS);
    console.log(`[HAIKU] next action in ${Math.round(delay / 1000)}s`);
    await new Promise(r => setTimeout(r, delay));
  }
}

// Serialise all step execution — prevents concurrent Haiku calls from reading
// the same fleet state / history and making identical decisions.
let stepInFlight = false;

async function runWithLock(forced: boolean): Promise<void> {
  if (stepInFlight) return;
  stepInFlight = true;
  try {
    await runChaosStep(forced);
  } finally {
    stepInFlight = false;
  }
}

let started = false;
const socket = io(FLEET_URL, { reconnectionDelay: 5000 });
socket.on('fleet:graph', (data: FleetGraph) => { fleetGraph = data; });
socket.on('disconnect', () => { fleetGraph = null; });
socket.on('connect', () => {
  console.log('[HAIKU] connected to fleet at', FLEET_URL);
  if (!started) { started = true; chaosLoop(); }
});
socket.on('chaos:trigger', () => {
  if (stepInFlight) {
    console.log('[HAIKU] trigger received while step in flight — dropping duplicate');
    return;
  }
  console.log('[HAIKU] manual trigger received — running step now (forced, no observe)');
  runWithLock(true).catch(err => console.error('[HAIKU] trigger step error:', err));
});
socket.on('connect_error', (err) => {
  console.error('[HAIKU] connect error:', err.message);
});
