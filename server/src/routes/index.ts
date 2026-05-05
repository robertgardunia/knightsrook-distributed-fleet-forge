import { Router } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import type { FleetRegistry } from '../lib/fleetRegistry.js';
import { getHistory } from '../lib/telemetry.js';

// Project root is one level up from the server/ directory.
const projectRoot = path.resolve(process.cwd(), '..');

function runCompose(args: string[]) {
  const child = spawn('docker', ['compose', '-f', 'docker-compose.chaos.yml', ...args], {
    cwd: projectRoot,
    stdio: 'pipe',
    windowsHide: true,
  });
  child.stdout?.resume();
  child.stderr?.resume();
  child.unref();
}

export function createRouter(registry: FleetRegistry) {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok' }, error: undefined });
  });

  router.post('/chaos/start', (_req, res) => {
    try {
      registry.clear();
      runCompose(['up', '--build', '-d']);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) });
    }
  });

  router.post('/chaos/stop', (_req, res) => {
    try {
      registry.clear();
      runCompose(['down']);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) });
    }
  });

  router.get('/telemetry/:nodeId', (req, res) => {
    const windowMs = Number(req.query.window) || 300_000;
    res.json(getHistory(req.params.nodeId, windowMs));
  });

  return router;
}
