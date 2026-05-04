import { Router } from 'express';
import { spawn } from 'child_process';
import path from 'path';

const router = Router();

// Project root is one level up from the server/ directory.
const projectRoot = path.resolve(process.cwd(), '..');

function runCompose(args: string[]) {
  const child = spawn('docker', ['compose', '-f', 'docker-compose.chaos.yml', ...args], {
    cwd: projectRoot,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

router.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' }, error: undefined });
});

router.post('/chaos/start', (_req, res) => {
  try {
    runCompose(['up', '--build', '-d']);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.post('/chaos/stop', (_req, res) => {
  try {
    runCompose(['down']);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

export default router;
