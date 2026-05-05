import Dockerode from 'dockerode';

const docker = new Dockerode({ socketPath: '/var/run/docker.sock' });

async function execSignal(containerName: string, signal: string): Promise<void> {
  const exec = await docker.getContainer(containerName).exec({
    Cmd: ['sh', '-c', `kill ${signal} 1`],
    AttachStdout: false,
    AttachStderr: false,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (exec.start as any)({ Detach: true });
}

export async function stopContainer(name: string): Promise<void> {
  try {
    await docker.getContainer(name).stop({ t: 5 });
  } catch (err: unknown) {
    if ((err as { statusCode?: number }).statusCode !== 304) throw err;
  }
}

export async function restartContainer(name: string, delayMs: number): Promise<void> {
  await stopContainer(name);
  await new Promise(r => setTimeout(r, delayMs));
  try {
    await docker.getContainer(name).start();
  } catch (err: unknown) {
    if ((err as { statusCode?: number }).statusCode !== 304) throw err;
  }
}

export function hangProcess(name: string, hangMs: number): void {
  execSignal(name, '-STOP')
    .then(() => new Promise(r => setTimeout(r, hangMs)))
    .then(() => execSignal(name, '-CONT'))
    .catch(err => console.error(`[HAIKU] hang ${name} failed: ${err}`));
}
