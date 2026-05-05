import Dockerode from 'dockerode';

const docker = new Dockerode({ socketPath: '/var/run/docker.sock' });

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
