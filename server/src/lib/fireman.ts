import Anthropic from '@anthropic-ai/sdk';
import Docker from 'dockerode';
import type { FleetGraph } from './mockFleet.js';
import type { NodeHistory } from './telemetry.js';
import {
  openIncident, closeIncident, getPatterns, getNodeIncidentSummary,
  recordPatternResult, type IncidentAction, type PatternEntry,
} from './playbook.js';

const TOXIPROXY = process.env.TOXIPROXY_URL ?? 'http://localhost:8474';
const MAX_ATTEMPTS = 4;
const WAIT_AFTER_ACTION_MS = 20_000;

let docker: Docker | null = null;
try { docker = new Docker(); } catch { /* Docker not available in dev */ }

export interface FiremanContext {
  incidentId:    string;
  nodeId:        string;
  event:         string;
  telemetry:     NodeHistory;
  fleetSnapshot: FleetGraph;
  getNodeStatus: (nodeId: string) => 'alive' | 'dead' | 'alerting' | 'unknown';
  emit:          (event: string, data: unknown) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function nodeToProxy(nodeId: string): string | null {
  const m = nodeId.match(/^(s\d+)-/);
  return m ? `${m[1]}-upstream` : null;
}

function classifyFault(telemetry: NodeHistory): string {
  const events = telemetry.events ?? [];
  const stats  = telemetry.stats  ?? [];

  const networkEvents = events.filter(e => ['latency','packet_loss','bandwidth'].includes(e.event));
  const multiDeath    = events.filter(e => e.event === 'dead').length > 1;

  if (multiDeath)                return 'endemic';
  if (networkEvents.length > 0)  return 'network';
  if (stats.length > 0) {
    const recent = stats.slice(-3);
    const cpuSpike = recent.some(s => s.cpu > 90);
    if (cpuSpike)                return 'code';
  }
  return 'power';
}

function buildPatternSummary(patterns: PatternEntry[]): string {
  if (patterns.length === 0) return 'No patterns yet — this may be the first incident of this type.';
  return patterns.slice(0, 5).map(p => {
    const rate = p.successCount + p.failureCount > 0
      ? Math.round(100 * p.successCount / (p.successCount + p.failureCount))
      : 0;
    return `  ${p.faultSig}: "${p.bestResponse}" — ${p.successCount}✓ ${p.failureCount}✗ ${rate}% success avg ${Math.round(p.avgDurationMs / 1000)}s`;
  }).join('\n');
}

async function resetNetwork(station: string): Promise<string> {
  try {
    const listRes = await fetch(`${TOXIPROXY}/proxies/${station}/toxics`);
    if (!listRes.ok) return `proxy ${station} not reachable (${listRes.status})`;
    const toxics = await listRes.json() as Array<{ name: string }>;
    await Promise.all(toxics.map(t =>
      fetch(`${TOXIPROXY}/proxies/${station}/toxics/${t.name}`, { method: 'DELETE' })
    ));
    return toxics.length > 0 ? `cleared ${toxics.length} toxic(s) from ${station}` : `${station} already clean`;
  } catch (err) {
    return `reset_network failed: ${String(err)}`;
  }
}

async function restartContainer(nodeId: string): Promise<string> {
  if (!docker) return 'Docker not available';
  try {
    const container = docker.getContainer(nodeId);
    await container.stop({ t: 5 }).catch(() => {/* already stopped */});
    await new Promise(r => setTimeout(r, 3_000));
    await container.start().catch((err: { statusCode?: number }) => {
      if (err.statusCode !== 304) throw err;
    });
    return `${nodeId} restarted`;
  } catch (err) {
    return `restart failed: ${String(err)}`;
  }
}

// ── Tool definitions ───────────────────────────────────────────────────────────

const tools: Anthropic.Tool[] = [
  {
    name: 'reset_network',
    description: 'Clear all Toxiproxy faults from a station upstream proxy. Use when telemetry suggests a network fault (latency, packet loss, bandwidth throttle) caused the failure.',
    input_schema: {
      type: 'object' as const,
      properties: {
        station: { type: 'string', description: 'Proxy name: s1-upstream, s2-upstream, s3-upstream, or s4-upstream' },
        reason:  { type: 'string', description: 'Why you believe this is a network fault' },
      },
      required: ['station', 'reason'],
    },
  },
  {
    name: 'restart_container',
    description: 'Docker stop + start a container. Use for power faults (instant death, no network precursors) or code faults (process crash, OOM).',
    input_schema: {
      type: 'object' as const,
      properties: {
        container: { type: 'string', description: 'Exact container name' },
        reason:    { type: 'string', description: 'Why you believe a restart will resolve this' },
      },
      required: ['container', 'reason'],
    },
  },
  {
    name: 'wait',
    description: 'Take no action this round — observe and let things settle. Use when you need more information or when a previous action needs time to propagate.',
    input_schema: {
      type: 'object' as const,
      properties: {
        reason: { type: 'string', description: 'What you are waiting to observe' },
      },
      required: ['reason'],
    },
  },
  {
    name: 'escalate',
    description: 'Surface this incident to the human operator — you cannot resolve it automatically. Use for endemic instability, hardware-level failures, or when multiple recovery attempts have failed.',
    input_schema: {
      type: 'object' as const,
      properties: {
        summary:  { type: 'string', description: 'Plain-language incident summary for the operator' },
        severity: { type: 'string', enum: ['warning', 'critical'], description: 'How urgent is human intervention' },
      },
      required: ['summary', 'severity'],
    },
  },
];

// ── Main worker ────────────────────────────────────────────────────────────────

export async function runFireman(ctx: FiremanContext): Promise<void> {
  const { incidentId, nodeId, event, telemetry, fleetSnapshot, getNodeStatus, emit } = ctx;
  const startMs     = Date.now();
  const baseFault   = classifyFault(telemetry);
  const nodeSummary = getNodeIncidentSummary(nodeId);
  const faultType   = nodeSummary.count >= 2 ? 'endemic' : baseFault;
  const proxy       = nodeToProxy(nodeId);
  const patterns    = getPatterns();
  const faultSig    = `${faultType}:${nodeId}`;

  openIncident(incidentId, nodeId, event);

  const actions: IncidentAction[] = [];
  let outcome: 'resolved' | 'escalated' | 'timeout' = 'timeout';
  let finalNotes = '';

  // ── Playbook fast path — no LLM call ──────────────────────────────────────
  // If we have a high-confidence match for this exact fault signature, execute
  // the known fix directly. Only fall through to the LLM if it fails to resolve.
  const confident = patterns.find(p =>
    p.faultSig === faultSig &&
    p.successCount >= 3 &&
    p.successCount / Math.max(1, p.successCount + p.failureCount) >= 0.8 &&
    p.bestResponse !== 'wait'
  );

  if (confident) {
    const rate   = Math.round(100 * confident.successCount / (confident.successCount + confident.failureCount));
    const reason = `Playbook: "${confident.bestResponse}" — ${confident.successCount}✓ ${confident.failureCount}✗ ${rate}%`;
    emit('fireman:spawned', { incidentId, nodeId, event, faultType, model: 'playbook', priorCount: nodeSummary.count });
    emit('fireman:action',  { incidentId, nodeId, action: confident.bestResponse, reason, attempt: 1 });
    actions.push({ action: confident.bestResponse, reason, ts: Date.now() });
    console.log(`[FIREMAN] ${incidentId} playbook hit: ${reason}`);

    if (confident.bestResponse === 'escalate') {
      finalNotes = `Playbook: "${faultType}" on ${nodeId} consistently requires human intervention.`;
      outcome    = 'escalated';
      emit('fireman:escalated', { incidentId, nodeId, summary: finalNotes, severity: 'warning' });
    } else {
      if (confident.bestResponse === 'reset_network' && proxy) await resetNetwork(proxy);
      else if (confident.bestResponse === 'restart_container')  await restartContainer(nodeId);

      await new Promise(r => setTimeout(r, WAIT_AFTER_ACTION_MS));
      const status = getNodeStatus(nodeId);
      if (status === 'alive' || status === 'alerting') {
        finalNotes = `Playbook resolved via "${confident.bestResponse}" (1 attempt).`;
        outcome    = 'resolved';
        emit('fireman:resolved', { incidentId, nodeId, durationMs: Date.now() - startMs });
      } else {
        console.log(`[FIREMAN] ${incidentId} playbook action did not resolve — falling through to LLM`);
      }
    }

    if (outcome !== 'timeout') {
      closeIncident(incidentId, outcome, Date.now() - startMs, actions, finalNotes, faultType);
      recordPatternResult(faultSig, confident.bestResponse, outcome === 'resolved', Date.now() - startMs);
      return;
    }
  }

  // ── LLM path — novel situation, or playbook action failed ─────────────────
  // Novel → Haiku. Playbook tried and failed → Sonnet (something unexpected).
  const model = actions.length > 0 ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001';
  if (!confident) {
    emit('fireman:spawned', { incidentId, nodeId, event, faultType, model, priorCount: nodeSummary.count });
  }
  console.log(`[FIREMAN] ${incidentId} LLM path model=${model} node=${nodeId} fault=${faultType}`);

  const otherNodes = fleetSnapshot.nodes
    .filter(n => n.id !== nodeId && n.id !== 'homebase')
    .map(n => `  ${n.id} status=${n.status}${n.alerting ? ' ALERTING' : ''}`)
    .join('\n');

  const telemetrySummary = [
    ...((telemetry.events ?? []).slice(-5).map(e => `  ${new Date(e.ts).toISOString()} — ${e.event}${e.meta ? ' ' + JSON.stringify(e.meta) : ''}`)),
    ...((telemetry.stats  ?? []).slice(-3).map(s => `  stats cpu=${s.cpu.toFixed(1)}% mem=${Math.round(s.memUsed / 1e6)}MB`)),
  ].join('\n') || '  (no recent history)';

  const priorHistoryText = nodeSummary.count === 0
    ? '  No prior incidents for this node in the last hour.'
    : nodeSummary.recent.map((r, i) => {
        const ago    = Math.round((Date.now() - r.ts) / 60_000);
        const acts   = r.actions.length > 0 ? r.actions.map(a => a.action).join(' → ') : 'none';
        return `  ${i + 1}. ${ago}m ago — fault=${r.faultType ?? '?'} outcome=${r.outcome ?? 'open'} actions=[${acts}]`;
      }).join('\n');

  const urgencyNote = nodeSummary.count === 0
    ? 'First incident on this node.'
    : nodeSummary.count === 1
      ? `⚠ SECOND incident on this node in the last hour. The previous recovery may not have addressed the root cause. Look for a pattern.`
      : `🚨 ${nodeSummary.count + 1} incidents on this node in the last hour. This is a recurring instability. Prior restarts have not held. Escalate unless you have a specific reason to believe this attempt will be different.`;

  const initialPrompt = `You are the recovery agent (Fireman) for a distributed kiosk fleet.

Incident:
  ID       : ${incidentId}
  Node     : ${nodeId}
  Event    : ${event}
  Fault    : ${faultType} (classified from telemetry)
  ${proxy ? `Proxy    : ${proxy}` : 'Proxy    : (no upstream proxy — homebase-tier node)'}

${urgencyNote}

Prior incidents this node (last hour):
${priorHistoryText}

Telemetry (recent history):
${telemetrySummary}

Other fleet nodes:
${otherNodes || '  (none registered)'}

Playbook patterns (learned from past incidents):
${buildPatternSummary(patterns)}

Fault classification guide:
  network  → latency/packet_loss/bandwidth faults on the upstream proxy → reset_network
  power    → instant death with no network precursors → restart_container
  code     → CPU spike or hang pattern before death → restart_container
  endemic  → multiple deaths in short window → escalate immediately, do not loop

${actions.length > 0
  ? `NOTE: The playbook action "${actions[0].action}" was already attempted and did not resolve the incident. Do not repeat it. Diagnose independently.`
  : `Choose ONE action. Your reason field should reference the incident history — if this is a repeat failure, say so explicitly.`
}`;

  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: initialPrompt },
  ];

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const response = await client.messages.create({
      model,
      max_tokens: 512,
      tools,
      tool_choice: { type: 'any' },
      messages,
    });

    messages.push({ role: 'assistant', content: response.content });
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;

      const input  = block.input as Record<string, unknown>;
      const reason = (input.reason ?? input.summary ?? '') as string;
      console.log(`[FIREMAN] ${incidentId} attempt=${attempt + 1} tool=${block.name} reason="${reason}"`);
      emit('fireman:action', { incidentId, nodeId, action: block.name, reason, attempt: attempt + 1 });
      actions.push({ action: block.name, reason, ts: Date.now() });

      let result = '';
      if (block.name === 'reset_network') {
        result = await resetNetwork(input.station as string);
      } else if (block.name === 'restart_container') {
        result = await restartContainer(input.container as string);
      } else if (block.name === 'wait') {
        result = 'waiting';
      } else if (block.name === 'escalate') {
        finalNotes = `${input.summary} (severity: ${input.severity})`;
        outcome = 'escalated';
        emit('fireman:escalated', { incidentId, nodeId, summary: input.summary, severity: input.severity });
        console.log(`[FIREMAN] ${incidentId} ESCALATED: ${input.summary}`);
      }

      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
    }

    if (outcome === 'escalated') break;

    // Add tool results and wait for action to take effect
    messages.push({ role: 'user', content: toolResults });
    await new Promise(r => setTimeout(r, WAIT_AFTER_ACTION_MS));

    const status = getNodeStatus(nodeId);
    if (status === 'alive' || status === 'alerting') {
      outcome    = 'resolved';
      finalNotes = `Resolved after ${attempt + 1} attempt(s). Node status: ${status}.`;
      console.log(`[FIREMAN] ${incidentId} RESOLVED in ${Date.now() - startMs}ms`);
      emit('fireman:resolved', { incidentId, nodeId, durationMs: Date.now() - startMs });
      break;
    }

    if (attempt < MAX_ATTEMPTS - 1) {
      messages.push({ role: 'user', content: `Node ${nodeId} is still ${status} after that action. Attempt ${attempt + 2} of ${MAX_ATTEMPTS}. What next?` });
    }
  }

  if (outcome === 'timeout') {
    finalNotes = `Unresolved after ${MAX_ATTEMPTS} attempts.`;
    emit('fireman:escalated', { incidentId, nodeId, summary: finalNotes, severity: 'critical' });
    console.log(`[FIREMAN] ${incidentId} TIMEOUT — escalating`);
  }

  const durationMs = Date.now() - startMs;
  const lastAction = actions.at(-1)?.action ?? 'none';

  closeIncident(incidentId, outcome, durationMs, actions, finalNotes, faultType);
  recordPatternResult(faultSig, lastAction, outcome === 'resolved', durationMs);
}
