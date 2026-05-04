import Docker from 'dockerode';
import { Writable } from 'stream';

let docker: Docker | null = null;
try {
  docker = new Docker();
  console.log('[containerStreams] Docker client initialised');
} catch (err) {
  console.warn('[containerStreams] Docker not available — shell/logs require Docker socket');
}

function requireDocker(): Docker {
  if (!docker) throw new Error('Docker socket not available. Is Docker running?');
  return docker;
}

// ── Log streaming ─────────────────────────────────────────────────────────────

export async function streamLogs(
  containerName: string,
  onLine: (line: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const d = requireDocker();
  const container = d.getContainer(containerName);
  await container.inspect(); // throws if container doesn't exist

  const logStream = await container.logs({
    follow: true,
    stdout: true,
    stderr: true,
    timestamps: true,
    tail: 200,
  }) as unknown as NodeJS.ReadableStream;

  signal.addEventListener('abort', () => (logStream as NodeJS.ReadableStream & { destroy(): void }).destroy());

  let buf = '';
  const writer = new Writable({
    write(chunk: Buffer, _enc, cb) {
      buf += chunk.toString('utf8');
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) onLine(line);
      }
      cb();
    },
  });

  d.modem.demuxStream(logStream, writer, writer);

  return new Promise((resolve, reject) => {
    logStream.on('end', resolve);
    logStream.on('error', reject);
    signal.addEventListener('abort', () => resolve());
  });
}

// ── Shell (PTY via docker exec) ───────────────────────────────────────────────

export interface ShellHandle {
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
}

export async function openShell(
  containerName: string,
  onData: (data: string) => void,
  signal: AbortSignal,
): Promise<ShellHandle> {
  const d = requireDocker();
  const container = d.getContainer(containerName);
  await container.inspect();

  const exec = await container.exec({
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    Cmd: ['/bin/sh'],
  });

  const stream = await exec.start({ hijack: true, stdin: true });

  stream.on('data', (chunk: Buffer) => onData(chunk.toString('utf8')));
  stream.on('error', (err: Error) =>
    onData(`\r\n\x1b[31mStream error: ${err.message}\x1b[0m\r\n`),
  );

  signal.addEventListener('abort', () => (stream as { destroy(): void }).destroy());

  return {
    write: (data: string) => stream.write(data),
    resize: async (cols: number, rows: number) => {
      try { await exec.resize({ w: cols, h: rows }); } catch { /* ignore */ }
    },
  };
}

// ── Stats streaming ───────────────────────────────────────────────────────────

export interface NodeStats {
  cpu: number;        // percent
  memUsed: number;    // bytes
  memTotal: number;   // bytes
  netInRate: number;  // bytes/s
  netOutRate: number; // bytes/s
  uptime: number;     // seconds
  processes: { pid: string; cmd: string }[];
}

export async function streamStats(
  containerName: string,
  onStats: (stats: NodeStats) => void,
  signal: AbortSignal,
): Promise<void> {
  const d = requireDocker();
  const container = d.getContainer(containerName);
  const info = await container.inspect();
  const startedAt = new Date(info.State.StartedAt).getTime();

  const statsStream = await container.stats({ stream: true }) as unknown as NodeJS.ReadableStream;
  signal.addEventListener('abort', () => (statsStream as NodeJS.ReadableStream & { destroy(): void }).destroy());

  let processes: NodeStats['processes'] = [];

  async function pollTop() {
    try {
      const top = await container.top({});
      const pidIdx  = (top.Titles as string[]).indexOf('PID');
      const cmdIdx  = (top.Titles as string[]).findIndex((t: string) => t === 'CMD' || t === 'COMMAND');
      processes = ((top.Processes ?? []) as string[][]).map(row => ({
        pid: row[pidIdx] ?? '?',
        cmd: row[cmdIdx] ?? row[row.length - 1],
      }));
    } catch { /* ignore */ }
  }
  pollTop();
  const topTimer = setInterval(pollTop, 3000);
  signal.addEventListener('abort', () => clearInterval(topTimer));

  let prevNetIn = 0, prevNetOut = 0;
  let buf = '';

  statsStream.on('data', (chunk: Buffer) => {
    buf += chunk.toString('utf8');
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);

        // CPU — use Docker's own precpu_stats for delta
        const cpuDelta = (r.cpu_stats?.cpu_usage?.total_usage ?? 0)
                       - (r.precpu_stats?.cpu_usage?.total_usage ?? 0);
        const sysDelta  = (r.cpu_stats?.system_cpu_usage ?? 0)
                        - (r.precpu_stats?.system_cpu_usage ?? 0);
        const numCpus   = r.cpu_stats?.online_cpus ?? 1;
        // Skip first frame — precpu_stats has no baseline yet so sysDelta=0
        if (sysDelta === 0) continue;
        const cpu = Math.min(100, (cpuDelta / sysDelta) * numCpus * 100);

        // Memory
        const memUsed  = Math.max(0, (r.memory_stats?.usage ?? 0) - (r.memory_stats?.stats?.cache ?? 0));
        const memTotal = r.memory_stats?.limit ?? 1;

        // Network rates (bytes/s since last tick)
        const nets    = Object.values(r.networks ?? {}) as { rx_bytes: number; tx_bytes: number }[];
        const netIn   = nets.reduce((s, n) => s + (n.rx_bytes ?? 0), 0);
        const netOut  = nets.reduce((s, n) => s + (n.tx_bytes ?? 0), 0);
        // Skip first net sample — prevNetIn/Out=0, so delta would be total bytes not a rate
        const netInRate  = prevNetIn  > 0 ? Math.max(0, netIn  - prevNetIn)  : 0;
        const netOutRate = prevNetOut > 0 ? Math.max(0, netOut - prevNetOut) : 0;
        prevNetIn  = netIn;
        prevNetOut = netOut;

        const uptime = Math.floor((Date.now() - startedAt) / 1000);

        onStats({ cpu, memUsed, memTotal, netInRate, netOutRate, uptime, processes });
      } catch { /* malformed chunk */ }
    }
  });

  return new Promise((resolve, reject) => {
    statsStream.on('end',   () => { clearInterval(topTimer); resolve(); });
    statsStream.on('error', (err: Error) => { clearInterval(topTimer); reject(err); });
    signal.addEventListener('abort', () => { clearInterval(topTimer); resolve(); });
  });
}
