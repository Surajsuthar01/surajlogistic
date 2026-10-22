import type { FastifyInstance } from 'fastify';
import { answerQuery, CITIES, computeDashboard, COPILOT_SUGGESTIONS, parseQuery, SHIPMENT_STATUSES, STATUS_LABEL, VEHICLE_CLASSES } from '@suraj/core';
import { z } from 'zod';
import { polishAnswer } from '../integrations/llm';
import { recentMessages } from '../integrations';
import { loadSnapshot, orgSettings } from '../lib/snapshot';
import { me, requireRole } from '../lib/util';

export async function opsRoutes(app: FastifyInstance) {
  const { db } = app;
  const staff = [app.authenticate, requireRole('admin', 'ops')];

  app.get('/api/meta', async () => ({
    cities: CITIES.map((c) => ({ name: c.name, state: c.state, lat: c.lat, lng: c.lng, tier: c.tier, hi: c.hi })),
    vehicleClasses: Object.values(VEHICLE_CLASSES),
    statuses: SHIPMENT_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
    copilotSuggestions: COPILOT_SUGGESTIONS,
  }));

  app.get('/api/dashboard', { preHandler: staff }, async (req) => {
    const snap = await loadSnapshot(db, me(req).orgId);
    return computeDashboard(snap);
  });

  app.post('/api/copilot', { preHandler: staff }, async (req) => {
    const b = z.object({ message: z.string().min(1).max(500) }).parse(req.body);
    const orgId = me(req).orgId;
    const [snap, settings] = await Promise.all([loadSnapshot(db, orgId), orgSettings(db, orgId)]);
    const parsed = parseQuery(b.message);
    const answer = answerQuery(parsed, snap, { dieselPrice: settings.dieselPrice, gst: settings.gst });
    const polished = await polishAnswer(b.message, answer);
    const { facts: _facts, ...rest } = polished;
    return { ...rest, parsed: { intent: parsed.intent, cities: parsed.cities, lang: parsed.lang } };
  });

  app.get('/api/notifications', { preHandler: staff }, async (req) => recentMessages(me(req).orgId));

  // Live control tower feed (Server-Sent Events).
  app.get('/api/stream', { preHandler: app.authenticate }, async (req, reply) => {
    const orgId = me(req).orgId;
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': (req.headers.origin as string) ?? '*',
    });
    reply.raw.write(`event: hello\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
    const unsub = app.bus.subscribe(orgId, (e) => reply.raw.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`));
    const beat = setInterval(() => reply.raw.write(`: keep-alive\n\n`), 20000);
    req.raw.on('close', () => {
      clearInterval(beat);
      unsub();
    });
    reply.hijack();
  });
}
