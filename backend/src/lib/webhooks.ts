import { createHash, createHmac, randomBytes } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { FastifyInstance } from 'fastify';
import type { DB } from '../db/client';
import { webhooks } from '../db/schema';
import type { LiveEvent } from './bus';
import { and, eq, sql } from './deps';
import { badRequest } from './util';

export const WEBHOOK_EVENTS = ['shipment.created', 'shipment.status', 'trip.status', 'invoice.updated'] as const;
const MAX_FAILS = 20;

export const newSecret = () => 'whsec_' + randomBytes(24).toString('base64url');
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

function privateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')) return true;
    const mapped = /::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    return mapped ? privateAddress(mapped[1]!) : false;
  }
  const [a, b] = ip.split('.').map(Number) as [number, number];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

/**
 * Only public HTTPS addresses, so a webhook cannot be pointed at our own network.
 * WEBHOOK_ALLOW_PRIVATE=1 relaxes this for local development and tests.
 */
export async function assertSafeUrl(raw: string) {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw badRequest('That is not a valid address');
  }
  const relaxed = process.env.WEBHOOK_ALLOW_PRIVATE === '1';
  if (u.protocol !== 'https:' && !(relaxed && u.protocol === 'http:')) throw badRequest('The address must start with https://');
  if (u.username || u.password) throw badRequest('Do not put a username or password in the address');
  if (relaxed) return u;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw badRequest('Private addresses are not allowed');
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((r) => r.address);
  if (!ips.length) throw badRequest('That address does not resolve');
  if (ips.some(privateAddress)) throw badRequest('Private addresses are not allowed');
  return u;
}

export function signBody(secret: string, body: string, ts: number) {
  return 'sha256=' + createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
}

/** POST one event. Returns the HTTP status, or null when nothing answered. */
export async function deliver(hook: { id: string; url: string; secret: string }, event: { type: string; payload: unknown; at: string; orgId: string }): Promise<number | null> {
  const ts = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({ id: randomBytes(8).toString('hex'), type: event.type, at: event.at, data: event.payload });
  try {
    await assertSafeUrl(hook.url);
    const res = await fetch(hook.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'SurajLogistic-Webhooks/1', 'x-suraj-timestamp': String(ts), 'x-suraj-signature': signBody(hook.secret, body, ts) },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
    });
    return res.status;
  } catch {
    return null;
  }
}

export async function recordResult(db: DB, id: string, status: number | null) {
  const ok = status !== null && status >= 200 && status < 300;
  await db
    .update(webhooks)
    .set({
      lastStatus: status,
      lastAt: new Date(),
      failCount: ok ? 0 : sql`${webhooks.failCount} + 1`,
      active: ok ? true : sql`${webhooks.failCount} + 1 < ${MAX_FAILS}`,
    })
    .where(eq(webhooks.id, id));
}

/** Pushes matching live events to each company's webhooks, in the background. */
export function startWebhookDispatcher(app: FastifyInstance) {
  return app.bus.subscribeAll((e: LiveEvent) => {
    if (!(WEBHOOK_EVENTS as readonly string[]).includes(e.type)) return;
    void (async () => {
      const hooks = await app.db.select().from(webhooks).where(and(eq(webhooks.orgId, e.orgId), eq(webhooks.active, true)));
      for (const h of hooks) {
        if (!h.events.includes(e.type)) continue;
        const status = await deliver(h, e);
        await recordResult(app.db, h.id, status);
      }
    })().catch((err) => app.log.warn({ err }, 'webhook delivery failed'));
  });
}
