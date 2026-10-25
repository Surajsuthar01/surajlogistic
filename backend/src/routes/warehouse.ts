import type { FastifyInstance } from 'fastify';
import { requireCity, STOCK_MOVE_TYPES } from '@suraj/shared';
import { z } from 'zod';
import { facilities, inventoryItems, stockMoves } from '../db/schema';
import { and, asc, desc, eq, ilike, or } from '../lib/deps';
import { badRequest, HttpError, me, notFound, requireRole, ser } from '../lib/util';

export async function warehouseRoutes(app: FastifyInstance) {
  const { db } = app;
  const wh = [app.authenticate, requireRole('admin', 'ops', 'warehouse')];

  app.get('/api/facilities', { preHandler: wh }, async (req) => {
    const rows = await db.select().from(facilities).where(eq(facilities.orgId, me(req).orgId)).orderBy(asc(facilities.code));
    return ser(rows);
  });

  app.post('/api/facilities', { preHandler: [app.authenticate, requireRole('admin', 'ops')] }, async (req, reply) => {
    const b = z.object({ type: z.enum(['HUB', 'WAREHOUSE']), code: z.string().min(2).max(12), name: z.string().min(2).max(120), city: z.string(), capacitySqft: z.number().int().min(0).default(0) }).parse(req.body);
    const c = requireCity(b.city);
    const [row] = await db.insert(facilities).values({ ...b, code: b.code.toUpperCase(), orgId: me(req).orgId, city: c.name, lat: c.lat, lng: c.lng }).returning();
    reply.status(201);
    return ser(row);
  });

  app.get('/api/inventory', { preHandler: wh }, async (req) => {
    const q = z.object({ facilityId: z.string().uuid().optional(), q: z.string().max(60).optional(), low: z.coerce.boolean().optional() }).parse(req.query);
    const where = [eq(inventoryItems.orgId, me(req).orgId)];
    if (q.facilityId) where.push(eq(inventoryItems.facilityId, q.facilityId));
    if (q.q) where.push(or(ilike(inventoryItems.sku, `%${q.q}%`), ilike(inventoryItems.name, `%${q.q}%`), ilike(inventoryItems.clientName, `%${q.q}%`))!);
    const rows = await db.select().from(inventoryItems).where(and(...where)).orderBy(asc(inventoryItems.sku));
    const out = rows.map((r) => ({ ...ser(r), lowStock: r.qty < r.reorderLevel }));
    return q.low ? out.filter((r) => r.lowStock) : out;
  });

  app.post('/api/inventory', { preHandler: wh }, async (req, reply) => {
    const b = z
      .object({ facilityId: z.string().uuid(), sku: z.string().min(2).max(40), name: z.string().min(2).max(160), clientName: z.string().min(2).max(120), qty: z.number().int().min(0).default(0), unit: z.string().max(12).default('pcs'), bin: z.string().min(1).max(20), reorderLevel: z.number().int().min(0).default(0) })
      .parse(req.body);
    const orgId = me(req).orgId;
    const [f] = await db.select().from(facilities).where(and(eq(facilities.id, b.facilityId), eq(facilities.orgId, orgId)));
    if (!f) throw badRequest('Facility not found');
    const dupe = await db.select({ id: inventoryItems.id }).from(inventoryItems).where(and(eq(inventoryItems.facilityId, b.facilityId), eq(inventoryItems.sku, b.sku.toUpperCase())));
    if (dupe.length) throw new HttpError(409, 'This SKU already exists in this facility', 'conflict');
    const [row] = await db.insert(inventoryItems).values({ ...b, sku: b.sku.toUpperCase(), orgId }).returning();
    reply.status(201);
    return ser(row);
  });

  app.post('/api/inventory/:id/move', { preHandler: wh }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const b = z.object({ type: z.enum(STOCK_MOVE_TYPES), qty: z.number().int().refine((n) => n !== 0, 'Quantity cannot be zero'), ref: z.string().max(60).optional() }).parse(req.body);
    const orgId = me(req).orgId;
    const [it] = await db.select().from(inventoryItems).where(and(eq(inventoryItems.id, id), eq(inventoryItems.orgId, orgId)));
    if (!it) throw notFound('Item not found');
    const delta = b.type === 'INBOUND' ? Math.abs(b.qty) : b.type === 'OUTBOUND' ? -Math.abs(b.qty) : b.qty;
    if (it.qty + delta < 0) throw badRequest(`Only ${it.qty} ${it.unit} in stock`);
    const [row] = await db.update(inventoryItems).set({ qty: it.qty + delta, updatedAt: new Date() }).where(eq(inventoryItems.id, id)).returning();
    const [move] = await db.insert(stockMoves).values({ orgId, itemId: id, type: b.type, qty: delta, ref: b.ref ?? null }).returning();
    app.bus.emit(orgId, 'stock.moved', { itemId: id, sku: it.sku, qty: row!.qty, delta });
    return { item: { ...ser(row), lowStock: row!.qty < row!.reorderLevel }, move: ser(move) };
  });

  app.get('/api/inventory/:id/moves', { preHandler: wh }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const rows = await db.select().from(stockMoves).where(and(eq(stockMoves.itemId, id), eq(stockMoves.orgId, me(req).orgId))).orderBy(desc(stockMoves.at)).limit(100);
    return ser(rows);
  });
}
