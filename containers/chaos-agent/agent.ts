import Anthropic from '@anthropic-ai/sdk';
import { io } from 'socket.io-client';
import { addToxic, resetProxy } from './toxiproxy.js';
import { stopContainer, restartContainer } from './docker.js';

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

const client = new Anthropic();
const FLEET_URL  = process.env.FLEET_URL       ?? 'http://homebase:5020';
const MIN_MS     = Number(process.env.MIN_INTERVAL_MS ?? 30_000);
const MAX_MS     = Number(process.env.MAX_INTERVAL_MS ?? 120_000);
const PROXY_NAMES = ['s1-upstream', 's2-upstream', 's3-upstream', 's4-upstream'] as const;

let fleetGraph: FleetGraph | null = null;
const recentActions: string[] = [];

const socket = io(FLEET_URL, { reconnectionDelay: 5000 });
socket.on('fleet:graph', (data: FleetGraph) => { fleetGraph = data; });
socket.on('disconnect', () => { fleetGraph = null; });

const tools: Anthropic.Tool[] = [
  {
    name: 'inject_latency',
    description: 'Add latency to a station\'s upstream connection, simulating degraded network (congested switch, lossy cable, overloaded link).',
    input_schema: {
      type: 'object' as const,
      properties: {
        station:    { type: 'string', enum: [...PROXY_NAMES] },
        latency_ms: { type: 'number', description: 'Base latency in milliseconds (50–3000)' },
        jitter_ms:  { type: 'number', description: 'Random jitter added to each packet (0–500)' },
        reason:     { type: 'string', description: 'Realistic real-world cause for this failure' },
      },
      required: ['station', 'latency_ms', 'reason'],
    },
  },
  {
    name: 'inject_packet_loss',
    description: 'Drop a percentage of packets on a station upstream, simulating poor wireless signal or damaged cable.',
    input_schema: {
      type: 'object' as const,
      properties: {
        station: { type: 'string', enum: [...PROXY_NAMES] },
        percent: { type: 'number', description: 'Packet loss percentage (1–75)' },
        reason:  { type: 'string', description: 'Realistic real-world cause' },
      },
      required: ['station', 'percent', 'reason'],
    },
  },
  {
    name: 'inject_bandwidth',
    description: 'Throttle the upstream bandwidth for a station, simulating a saturated or rate-limited link.',
    input_schema: {
      type: 'object' as const,
      properties: {
        station:   { type: 'string', enum: [...PROXY_NAMES] },
        rate_kbps: { type: 'number', description: 'Max bandwidth in KB/s (8–2048)' },
        reason:    { type: 'string', description: 'Realistic real-world cause' },
      },
      required: ['station', 'rate_kbps', 'reason'],
    },
  },
  {
    name: 'reset_network',
    description: 'Remove all active network faults from a station proxy, restoring full connectivity.',
    input_schema: {
      type: 'object' as const,
      properties: {
        station: { type: 'string', enum: [...PROXY_NAMES] },
        reason:  { type: 'string' },
      },
      required: ['station', 'reason'],
    },
  },
  {
    name: 'stop_container',
    description: 'Hard-stop a container (simulates power failure or process crash). Container stays down until manually restarted.',
    input_schema: {
      type: 'object' as const,
      properties: {
        container: { type: 'string', description: 'Exact container name (e.g. s1-controller, s2-game-3, homebase)' },
        reason:    { type: 'string', description: 'Realistic real-world cause' },
      },
      required: ['container', 'reason'],
    },
  },
  {
    name: 'restart_container',
    description: 'Stop a container and restart it after a delay (simulates UPS cutover, watchdog restart, or brief power blip).',
    input_schema: {
      type: 'object' as const,
      properties: {
        container: { type: 'string', description: 'Exact container name' },
        down_ms:   { type: 'number', description: 'How long the container stays down in ms (5000–60000)' },
        reason:    { type: 'string', description: 'Realistic real-world cause' },
      },
      required: ['container', 'down_ms', 'reason'],
    },
  },
  {
    name: 'observe',
    description: 'Skip this cycle and observe the current state without injecting any new faults. Use when the fleet is already stressed or when waiting for a previous fault to take effect.',
    input_schema: {
      type: 'object' as const,
      properties: {
        observation: { type: 'string', description: 'What you observe about the current fleet state and why you\'re waiting' },
      },
      required: ['observation'],
    },
  },
];

async function executeTool(name: string, input: Record<string, unknown>): Promise<void> {
  switch (name) {
    case 'inject_latency': {
      const { station, latency_ms, jitter_ms = 0 } = input as { station: string; latency_ms: number; jitter_ms?: number };
      await addToxic(station, { name: 'latency', type: 'latency', attributes: { latency: latency_ms, jitter: jitter_ms } });
      console.log(`[HAIKU] +latency station=${station} ms=${latency_ms} jitter=${jitter_ms}`);
      break;
    }
    case 'inject_packet_loss': {
      const { station, percent } = input as { station: string; percent: number };
      await addToxic(station, { name: 'packet_loss', type: 'packet_loss', attributes: { percent } });
      console.log(`[HAIKU] +packet_loss station=${station} pct=${percent}`);
      break;
    }
    case 'inject_bandwidth': {
      const { station, rate_kbps } = input as { station: string; rate_kbps: number };
      await addToxic(station, { name: 'bandwidth', type: 'bandwidth', attributes: { rate: rate_kbps } });
      console.log(`[HAIKU] +bandwidth station=${station} kbps=${rate_kbps}`);
      break;
    }
    case 'reset_network': {
      const { station } = input as { station: string };
      await resetProxy(station);
      console.log(`[HAIKU] reset_network station=${station}`);
      break;
    }
    case 'stop_container': {
      const { container } = input as { container: string };
      await stopContainer(container);
      console.log(`[HAIKU] stop_container name=${container}`);
      break;
    }
    case 'restart_container': {
      const { container, down_ms } = input as { container: string; down_ms: number };
      // fire-and-forget — don't block the chaos loop for the full down period
      restartContainer(container, down_ms).catch(err =>
        console.error(`[HAIKU] restart_container failed: ${err}`)
      );
      console.log(`[HAIKU] restart_container name=${container} down=${down_ms}ms`);
      break;
    }
    case 'observe': {
      const { observation } = input as { observation: string };
      console.log(`[HAIKU] observe: ${observation}`);
      break;
    }
    default:
      console.warn(`[HAIKU] unknown tool: ${name}`);
  }
}

function buildFleetSummary(graph: FleetGraph): string {
  return graph.nodes
    .map(n => `  ${n.id} role=${n.role} status=${n.status}${n.alerting ? ' ALERTING' : ''}`)
    .join('\n');
}

async function runChaosStep(): Promise<void> {
  if (!fleetGraph || fleetGraph.isMock || fleetGraph.nodes.length === 0) {
    console.log('[HAIKU] fleet not ready, skipping');
    return;
  }

  const summary     = buildFleetSummary(fleetGraph);
  const recentStr   = recentActions.slice(-3).join(' | ') || 'none';

  const prompt = `You are a chaos engineer running realistic fault injection tests on a distributed kiosk fleet.

Current fleet state:
${summary}

Recent actions (last 3): ${recentStr}

Fleet topology:
- 4 station controllers (s1–s4), each on their own subnet
- Each station has 4 game kiosks (KG) and 2 info kiosks (KI)
- Station controllers connect to homebase through proxies s1-upstream through s4-upstream
- Kiosks connect only to their station controller — no direct homebase access

Network fault tools operate on station→homebase links only.
Container tools can target any container by exact name (e.g. s2-controller, s3-game-1, s1-info-2, homebase).

Rules:
1. Faults must be REALISTIC — simulate actual venue/datacenter failure modes (hardware degradation, congestion, power fluctuation, UPS failure, wireless interference, etc.)
2. Escalate gradually — prefer latency before packet loss before full disconnect; prefer single-station before multi-station
3. Don't repeat the exact same action on the same target consecutively
4. If the fleet is already heavily stressed (multiple nodes dead/alerting), prefer observe or reset_network
5. Provide a specific, plausible real-world reason for every action

Choose exactly ONE action.`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    tools,
    tool_choice: { type: 'any' },
    messages: [{ role: 'user', content: prompt }],
  });

  for (const block of response.content) {
    if (block.type === 'tool_use') {
      const input  = block.input as Record<string, unknown>;
      const reason = (input.reason ?? input.observation ?? '') as string;
      console.log(`[HAIKU] reasoning: "${reason}"`);
      await executeTool(block.name, input);
      recentActions.push(`${block.name}(${JSON.stringify(input)})`);
      if (recentActions.length > 10) recentActions.shift();
    }
  }
}

function rand(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

async function chaosLoop(): Promise<void> {
  await new Promise(r => setTimeout(r, 15_000)); // let fleet settle first

  while (true) {
    try {
      await runChaosStep();
    } catch (err) {
      console.error('[HAIKU] step error:', err);
    }
    const delay = rand(MIN_MS, MAX_MS);
    console.log(`[HAIKU] next action in ${Math.round(delay / 1000)}s`);
    await new Promise(r => setTimeout(r, delay));
  }
}

let started = false;
socket.on('connect', () => {
  console.log('[HAIKU] connected to fleet at', FLEET_URL);
  if (!started) {
    started = true;
    chaosLoop();
  }
});

socket.on('connect_error', (err) => {
  console.error('[HAIKU] connect error:', err.message);
});
