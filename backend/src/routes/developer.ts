import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { apiKeys, files, webhooks } from '../db/schema';
import { and, desc, eq } from '../lib/deps';
import { verifyFileSig } from '../lib/files';
import { HttpError, me, notFound, requireRole, ser } from '../lib/util';
import { assertSafeUrl, deliver, newSecret, recordResult, sha256, WEBHOOK_EVENTS } from '../lib/webhooks';

/** API keys, webhooks and signed photo links. */
export async function developerRoutes(app: FastifyInstance) {
  const { db } = app;
  const admin = [app.authenticate, requireRole('admin')];
  const noKeys = async (req: { user?: unknown }) => {
    if (String((req.user as { sub?: string } | undefined)?.sub ?? '').startsWith('apikey:')) throw new HttpError(403, 'An API key cannot manage keys or webhooks', 'forbidden');
  };

  app.get('/api/api-keys', { preHandler: [...admin, noKeys] }, async (req) => {
    const rows = await db.select().from(apiKeys).where(eq(apiKeys.orgId, me(req).orgId)).orderBy(desc(apiKeys.createdAt));
    return rows.map(({ keyHash: _h, ...k }) => ser(k));
  });

  app.post('/api/api-keys', { preHandler: [...admin, noKeys] }, async (req, reply) => {
    const b = z.object({ name: z.string().trim().min(2).max(80) }).parse(req.body);
    const u = me(req);
    const key = 'sl_live_' + randomBytes(24).toString('base64url');
    const [row] = await db.insert(apiKeys).values({ orgId: u.orgId, name: b.name, prefix: key.slice(0, 12), keyHash: sha256(key), createdBy: u.sub }).returning();
    reply.status(201);
    // The full key is shown this once; only its hash is stored.
    return { id: row!.id, name: row!.name, prefix: row!.prefix, key };
  });

  app.delete('/api/api-keys/:id', { preHandler: [...admin, noKeys] }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const [row] = await db.update(apiKeys).set({ revokedAt: new Date() }).where(and(eq(apiKeys.id, id), eq(apiKeys.orgId, me(req).orgId))).returning();
    if (!row) throw notFound('Key not found');
    const { keyHash: _h, ...k } = row;
    return ser(k);
  });

  app.get('/api/webhooks', { preHandler: [...admin, noKeys] }, async (req) => {
    const rows = await db.select().from(webhooks).where(eq(webhooks.orgId, me(req).orgId)).orderBy(desc(webhooks.createdAt));
    return rows.map(({ secret: _s, ...h }) => ser(h));
  });

  app.post('/api/webhooks', { preHandler: [...admin, noKeys] }, async (req, reply) => {
    const b = z.object({ url: z.string().max(500), events: z.array(z.enum(WEBHOOK_EVENTS)).min(1) }).parse(req.body);
    await assertSafeUrl(b.url);
    const secret = newSecret();
    const [row] = await db.insert(webhooks).values({ orgId: me(req).orgId, url: b.url, events: [...new Set(b.events)], secret }).returning();
    reply.status(201);
    // The signing secret is shown once.
    return { id: row!.id, url: row!.url, events: row!.events, secret };
  });

  app.delete('/api/webhooks/:id', { preHandler: [...admin, noKeys] }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const rows = await db.delete(webhooks).where(and(eq(webhooks.id, id), eq(webhooks.orgId, me(req).orgId))).returning({ id: webhooks.id });
    if (!rows.length) throw notFound('Webhook not found');
    return { deleted: true };
  });

  app.post('/api/webhooks/:id/test', { preHandler: [...admin, noKeys] }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const u = me(req);
    const [h] = await db.select().from(webhooks).where(and(eq(webhooks.id, id), eq(webhooks.orgId, u.orgId)));
    if (!h) throw notFound('Webhook not found');
    const status = await deliver(h, { type: 'test', orgId: u.orgId, at: new Date().toISOString(), payload: { message: 'Test from SurajLogistic' } });
    await recordResult(db, h.id, status);
    return { status };
  });

  /** Photos behind signed, expiring links: <img> tags cannot send a login header. */
  app.get('/api/files/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const q = z.object({ exp: z.coerce.number(), sig: z.string().max(100) }).parse(req.query);
    if (!verifyFileSig(app.fileSecret, id, q.exp, q.sig)) throw new HttpError(403, 'This link has expired. Open the page again.', 'forbidden');
    const [f] = await db.select().from(files).where(eq(files.id, id));
    if (!f) throw notFound('File not found');
    reply.header('content-type', f.mime).header('cache-control', 'private, max-age=3600').header('x-content-type-options', 'nosniff');
    return reply.send(Buffer.from(f.data));
  });
}
