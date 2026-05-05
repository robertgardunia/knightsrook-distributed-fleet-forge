import { Router } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import type { FleetRegistry } from '../lib/fleetRegistry.js';
import { getHistory } from '../lib/telemetry.js';
import { getPatterns, getRecentIncidents } from '../lib/playbook.js';

type EmitFn = (event: string, ...args: unknown[]) => void;
let _emit: EmitFn = () => {};
export function setEmit(fn: EmitFn) { _emit = fn; }

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

  router.get('/chaos/ready', async (_req, res) => {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 1500);
      await fetch('http://127.0.0.1:5025/api/fleet', { signal: ac.signal });
      clearTimeout(timer);
      res.json({ ready: true });
    } catch {
      res.json({ ready: false });
    }
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

  router.post('/chaos/trigger', (_req, res) => {
    _emit('chaos:trigger');
    res.json({ success: true });
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

  router.get('/fleet', (_req, res) => {
    res.json(registry.buildGraph());
  });

  router.get('/playbook/patterns', (_req, res) => {
    res.json(getPatterns());
  });

  router.get('/playbook/incidents', (req, res) => {
    const limit = Number(req.query.limit) || 20;
    res.json(getRecentIncidents(limit));
  });

  router.get('/telemetry/:nodeId', (req, res) => {
    const windowMs = Number(req.query.window) || 300_000;
    res.json(getHistory(req.params.nodeId, windowMs));
  });

  return router;
}
