import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import cors from 'cors';
import { createRouter } from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import type { FleetRegistry } from './lib/fleetRegistry.js';

export function createApp(registry: FleetRegistry) {
  const app = express();

  app.use(helmet());
  app.use(morgan('dev'));
  app.use(cors());
  app.use(express.json());

  app.use('/api', createRouter(registry));

  app.use(errorHandler);

  return app;
}
