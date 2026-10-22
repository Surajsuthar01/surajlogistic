import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import type { DB } from './db/client';
import { Bus } from './lib/bus';
import { errorHandler, HttpError, type AuthUser } from './lib/util';
import { authRoutes } from './routes/auth';
import { billingRoutes } from './routes/billing';
import { driverRoutes } from './routes/driver';
import { fleetRoutes } from './routes/fleet';
import { marketplaceRoutes } from './routes/marketplace';
import { opsRoutes } from './routes/ops';
import { shipmentRoutes } from './routes/shipments';
import { tripRoutes } from './routes/trips';
import { warehouseRoutes } from './routes/warehouse';

declare module 'fastify' {
  interface FastifyInstance {
    db: DB;
    bus: Bus;
    publicUrl: string;
    authenticate: (req: FastifyRequest) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthUser;
    user: AuthUser;
  }
}

export interface AppOptions {
  db: DB;
  jwtSecret: string;
  logger?: boolean;
  corsOrigin?: string | string[] | boolean;
  /** Base URL of the web app, used in tracking links sent to customers. */
  publicUrl?: string;
  bus?: Bus;
}

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 2 * 1024 * 1024 });
  app.decorate('db', opts.db);
  app.decorate('bus', opts.bus ?? new Bus());
  app.decorate('publicUrl', opts.publicUrl ?? 'http://localhost:5173');

  await app.register(cors, { origin: opts.corsOrigin ?? true, credentials: true });
  await app.register(jwt, { secret: opts.jwtSecret, sign: { expiresIn: '7d' } });

  app.decorate('authenticate', async (req: FastifyRequest) => {
    // EventSource cannot send headers, so the live stream passes the token as ?token=
    const q = (req.query as Record<string, string> | undefined)?.token;
    if (q && !req.headers.authorization) req.headers.authorization = `Bearer ${q}`;
    try {
      await req.jwtVerify();
    } catch {
      throw new HttpError(401, 'Please log in again', 'unauthorized');
    }
  });

  app.setErrorHandler(errorHandler);

  app.get('/api/health', async () => ({ ok: true, service: 'surajlogistic-api', time: new Date().toISOString() }));

  await app.register(authRoutes);
  await app.register(shipmentRoutes);
  await app.register(fleetRoutes);
  await app.register(tripRoutes);
  await app.register(marketplaceRoutes);
  await app.register(warehouseRoutes);
  await app.register(billingRoutes);
  await app.register(driverRoutes);
  await app.register(opsRoutes);

  return app;
}
