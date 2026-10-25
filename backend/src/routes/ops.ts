import type { FastifyInstance } from 'fastify';
import { answerQuery, CITIES, computeDashboard, computeReport, COPILOT_SUGGESTIONS, parseQuery, SHIPMENT_STATUSES, STATUS_LABEL, VEHICLE_CLASSES } from '@suraj/shared';
import { z } from 'zod';
import { customers, drivers, shipments, trips, vehicles } from '../db/schema';
import { polishAnswer } from '../integrations/llm';
import { and, asc, desc, eq, gte, ilike, lte, or, sql } from '../lib/deps';
import { recentMessages } from '../lib/notify';
import { loadSnapshot, orgSettings } from '../lib/snapshot';
import { badRequest, me, requireRole, ser } from '../lib/util';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a from and to date');

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

  app.get('/api/notifications', { preHandler: staff }, async (req) => recentMessages(db, me(req).orgId));

  /** The search box in the top bar: tracking numbers, receivers, trips, trucks and customers. */
  app.get('/api/search', { preHandler: app.authenticate }, async (req) => {
    const q = z.object({ q: z.string().max(80).default('') }).parse(req.query);
    const u = me(req);
    const term = q.q.trim();
    const empty = { shipments: [], trips: [], vehicles: [], customers: [] };
    if (term.length < 2) return empty;
    const compact = term.replace(/\s+/g, '').replace(/[%_\\]/g, '');
    const like = `%${term.replace(/[%_\\]/g, '')}%`;
    const likeC = `%${compact}%`;
    const shipWhere = [eq(shipments.orgId, u.orgId), or(ilike(shipments.awb, likeC), ilike(shipments.consigneeName, like), ilike(shipments.consigneePhone, likeC))!];
    if (u.role === 'customer') {
      if (!u.customerId) return empty;
      shipWhere.push(eq(shipments.customerId, u.customerId));
    } else if (u.role === 'driver' || u.role === 'warehouse' || u.role === 'partner') return empty;
    const staffer = u.role === 'admin' || u.role === 'ops';
    const noSpace = (col: unknown) => sql`replace(${col}, ' ', '')`;
    const [sh, tr, vh, cu] = await Promise.all([
      db.select().from(shipments).where(and(...shipWhere)).orderBy(desc(shipments.createdAt)).limit(6),
      staffer
        ? db.select({ t: trips, regNo: vehicles.regNo }).from(trips).innerJoin(vehicles, eq(vehicles.id, trips.vehicleId)).where(and(eq(trips.orgId, u.orgId), ilike(trips.tripNo, likeC))).orderBy(desc(trips.createdAt)).limit(4)
        : Promise.resolve([]),
      staffer ? db.select().from(vehicles).where(and(eq(vehicles.orgId, u.orgId), sql`${noSpace(vehicles.regNo)} ilike ${likeC}`)).orderBy(asc(vehicles.regNo)).limit(4) : Promise.resolve([]),
      staffer ? db.select().from(customers).where(and(eq(customers.orgId, u.orgId), or(ilike(customers.name, like), ilike(customers.gstin, likeC))!)).orderBy(asc(customers.name)).limit(4) : Promise.resolve([]),
    ]);
    return {
      shipments: sh.map((s) => ({ id: s.id, awb: s.awb, lane: `${s.originCity}–${s.destCity}`, status: s.status, consigneeName: s.consigneeName })),
      trips: tr.map(({ t, regNo }) => ({ id: t.id, tripNo: t.tripNo, lane: `${t.originCity}–${t.destCity}`, status: t.status, regNo })),
      vehicles: vh.map((v) => ({ id: v.id, regNo: v.regNo, city: v.city, status: v.status })),
      customers: cu.map((c) => ({ id: c.id, name: c.name, city: c.city })),
    };
  });

  /** Business report for a date range (IST calendar days). */
  app.get('/api/reports', { preHandler: staff }, async (req) => {
    const q = z.object({ from: day, to: day }).parse(req.query);
    if (q.from > q.to) throw badRequest('The start date is after the end date');
    const from = new Date(`${q.from}T00:00:00+05:30`);
    const to = new Date(`${q.to}T23:59:59.999+05:30`);
    if (to.getTime() - from.getTime() > 400 * 86400_000) throw badRequest('Pick a range of a year or less');
    const orgId = me(req).orgId;
    const [sh, tr, dr, cu] = await Promise.all([
      db
        .select()
        .from(shipments)
        .where(and(eq(shipments.orgId, orgId), or(and(gte(shipments.createdAt, from), lte(shipments.createdAt, to)), and(gte(shipments.deliveredAt, from), lte(shipments.deliveredAt, to)))!)),
      db.select().from(trips).where(and(eq(trips.orgId, orgId), gte(trips.completedAt, from), lte(trips.completedAt, to))),
      db.select().from(drivers).where(eq(drivers.orgId, orgId)),
      db.select().from(customers).where(eq(customers.orgId, orgId)),
    ]);
    return computeReport({ shipments: ser(sh), trips: ser(tr), drivers: ser(dr), customers: ser(cu) }, q.from, q.to);
  });

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
    // Company-wide events are for the office. Drivers, customers and truck owners only get the keep-alive.
    const office = ['admin', 'ops', 'warehouse'].includes(me(req).role);
    const unsub = office ? app.bus.subscribe(orgId, (e) => reply.raw.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)) : () => {};
    const beat = setInterval(() => reply.raw.write(`: keep-alive\n\n`), 20000);
    req.raw.on('close', () => {
      clearInterval(beat);
      unsub();
    });
    reply.hijack();
  });
}
