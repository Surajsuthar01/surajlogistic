import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { sql } from 'drizzle-orm';
import type { DB } from './db/client';
import { apiKeys, users } from './db/schema';
import { Bus } from './lib/bus';
import { eq } from './lib/deps';
import { errorHandler, HttpError, type AuthUser } from './lib/util';
import { sha256, startWebhookDispatcher } from './lib/webhooks';
import { authRoutes } from './routes/auth';
import { billingRoutes } from './routes/billing';
import { communityRoutes } from './routes/community';
import { developerRoutes } from './routes/developer';
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
    homeOrgSlug: string | undefined;
    allowCompanySignup: boolean;
    /** Signs short-lived links to stored photos. */
    fileSecret: string;
    authenticate: (req: FastifyRequest) => Promise<void>;
    /** Drop cached login checks after a person is changed or removed (no id: everyone). */
    forgetUser: (id?: string) => void;
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
  /** Push events to customers' webhooks (on by default). */
  webhooks?: boolean;
  /**
   * Trust X-Forwarded-For from a reverse proxy: a hop count or proxy addresses.
   * Off by default, so a client cannot fake its address to dodge the login limit.
   */
  trustProxy?: TrustProxy;
  /** Which company the public website books for and people join (slug). Default: the first company. */
  homeOrgSlug?: string;
  /** Let anyone create a new company from the sign-up page. Off: the site belongs to one company. */
  allowCompanySignup?: boolean;
}

type TrustProxy = boolean | string | ((address: string, hop: number) => boolean);

/** TRUST_PROXY: unset/0 = off, a number = that many proxy hops, otherwise a comma list of proxy IPs/CIDRs. */
export function parseTrustProxy(v: string | undefined): TrustProxy {
  if (!v || v === '0' || v === 'false') return false;
  if (/^\d+$/.test(v)) {
    const hops = Number(v);
    return (_address, hop) => hop < hops;
  }
  if (v === 'true') return true;
  return v;
}

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  // Request logs never carry the login token that the live stream sends in its address.
  const logger = opts.logger
    ? {
        level: process.env.LOG_LEVEL ?? 'info',
        serializers: {
          req: (r: { method: string; url: string; ip?: string }) => ({ method: r.method, url: r.url.replace(/([?&](token|sig)=)[^&]+/g, '$1***'), ip: r.ip }),
        },
      }
    : false;
  // Room for a phone photo plus a signature in one request.
  const app = Fastify({ logger, bodyLimit: 4 * 1024 * 1024, trustProxy: opts.trustProxy ?? false });
  app.decorate('db', opts.db);
  app.decorate('bus', opts.bus ?? new Bus());
  app.decorate('publicUrl', opts.publicUrl ?? 'http://localhost:5173');
  app.decorate('homeOrgSlug', opts.homeOrgSlug);
  app.decorate('allowCompanySignup', opts.allowCompanySignup ?? false);
  app.decorate('fileSecret', sha256(`files:${opts.jwtSecret}`));

  await app.register(cors, { origin: opts.corsOrigin ?? true, credentials: true });
  await app.register(jwt, { secret: opts.jwtSecret, sign: { expiresIn: '7d' } });

  const keyUse = new Map<string, number>();
  app.decorate('authenticate', async (req: FastifyRequest) => {
    // A customer's own system: x-api-key acts with dispatcher rights for that company.
    const key = req.headers['x-api-key'];
    if (typeof key === 'string' && key.length > 20) {
      const [k] = await opts.db.select().from(apiKeys).where(eq(apiKeys.keyHash, sha256(key)));
      if (!k || k.revokedAt) throw new HttpError(401, 'This API key is not valid', 'unauthorized');
      req.user = { sub: `apikey:${k.id}`, orgId: k.orgId, role: 'ops', name: k.name, customerId: null };
      const last = keyUse.get(k.id) ?? 0;
      if (Date.now() - last > 60_000) {
        keyUse.set(k.id, Date.now());
        await opts.db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, k.id));
      }
      return;
    }
    // EventSource cannot send headers, so the live stream passes the token as ?token=
    const q = (req.query as Record<string, string> | undefined)?.token;
    if (q && !req.headers.authorization) req.headers.authorization = `Bearer ${q}`;
    try {
      await req.jwtVerify();
    } catch {
      throw new HttpError(401, 'Please log in again', 'unauthorized');
    }
    // The token is a claim; the users table is the truth. A removed login stops at once,
    // and a changed role applies on the next request rather than in 7 days.
    const claim = req.user as { sub: string; orgId: string; pv?: number };
    const cur = await currentUser(claim.sub);
    if (!cur || cur.orgId !== claim.orgId) throw new HttpError(401, 'Please log in again', 'unauthorized');
    // Each login carries the password version it was issued under; a password change signs out the rest.
    if (cur.passwordChangedAt && (claim.pv ?? 0) !== cur.passwordChangedAt.getTime()) {
      throw new HttpError(401, 'Your password was changed. Please log in again.', 'unauthorized');
    }
    Object.assign(req.user as object, { role: cur.role, name: cur.name, customerId: cur.customerId });
  });

  // Short cache so a busy screen does not hit the users table on every call.
  const userCache = new Map<string, { at: number; row: { orgId: string; role: string; name: string; customerId: string | null; passwordChangedAt: Date | null } | null }>();
  async function currentUser(id: string) {
    const hit = userCache.get(id);
    if (hit && Date.now() - hit.at < 10_000) return hit.row;
    const [row] = await opts.db.select({ orgId: users.orgId, role: users.role, name: users.name, customerId: users.customerId, passwordChangedAt: users.passwordChangedAt }).from(users).where(eq(users.id, id));
    if (userCache.size > 5000) userCache.clear();
    userCache.set(id, { at: Date.now(), row: row ?? null });
    return row ?? null;
  }
  app.decorate('forgetUser', (id?: string) => void (id ? userCache.delete(id) : userCache.clear()));

  app.setErrorHandler(errorHandler);

  // API answers are personal and change all the time: never cache them, never frame them.
  app.addHook('onSend', async (_req, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'no-referrer');
    reply.header('x-frame-options', 'DENY');
    if (!reply.hasHeader('cache-control')) reply.header('cache-control', 'no-store');
  });

  // Docker and load balancers call this; it fails when the database is unreachable.
  app.get('/api/health', { logLevel: 'warn' }, async (_req, reply) => {
    try {
      await opts.db.execute(sql`select 1`);
      return { ok: true, service: 'surajlogistic-api', database: 'up', time: new Date().toISOString() };
    } catch {
      return reply.status(503).send({ ok: false, service: 'surajlogistic-api', database: 'down', time: new Date().toISOString() });
    }
  });

  await app.register(authRoutes);
  await app.register(shipmentRoutes);
  await app.register(fleetRoutes);
  await app.register(tripRoutes);
  await app.register(marketplaceRoutes);
  await app.register(warehouseRoutes);
  await app.register(billingRoutes);
  await app.register(driverRoutes);
  await app.register(opsRoutes);
  await app.register(developerRoutes);
  await app.register(communityRoutes);

  if (opts.webhooks !== false) {
    const stop = startWebhookDispatcher(app);
    app.addHook('onClose', async () => stop());
  }

  return app;
}
