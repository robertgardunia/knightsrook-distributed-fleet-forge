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
