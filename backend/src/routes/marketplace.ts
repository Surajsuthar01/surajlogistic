import type { FastifyInstance } from 'fastify';
import { findReturnLoads, requireCity, shortCode, suggestTrucks, VEHICLE_TYPES, type MatchLoad, type VehicleType } from '@suraj/shared';
import { z } from 'zod';
import { bids, loads, organizations, vehicles } from '../db/schema';
import { and, desc, eq, inArray, ne, or } from '../lib/deps';
import { badRequest, forbidden, me, notFound, requireRole, ser } from '../lib/util';
import { createTrip } from './trips';

const PostLoad = z.object({
  originCity: z.string(),
  destCity: z.string(),
  material: z.string().min(2).max(120),
  weightKg: z.number().positive().max(40000),
  vehicleType: z.enum(VEHICLE_TYPES).optional(),
  pickupDate: z.string().datetime({ offset: true }),
  targetPrice: z.number().int().min(500).max(5_000_000),
  postedBy: z.string().min(2).max(120).optional(),
  contactPhone: z.string().max(20).optional(),
  isPublic: z.boolean().default(true),
});

const Bid = z.object({ amount: z.number().int().min(500).max(5_000_000), etaHours: z.number().min(1).max(400), vehicleId: z.string().uuid().optional(), note: z.string().max(300).optional() });

const asMatch = (l: typeof loads.$inferSelect): MatchLoad => ({
  id: l.id,
  origin: { lat: l.originLat, lng: l.originLng, city: l.originCity },
  destination: { lat: l.destLat, lng: l.destLng, city: l.destCity },
  weightKg: l.weightKg,
  vehicleType: (l.vehicleType as VehicleType | null) ?? null,
  pickupDate: l.pickupDate.toISOString(),
  targetPrice: l.targetPrice,
});

export async function marketplaceRoutes(app: FastifyInstance) {
  const { db } = app;
  const staff = [app.authenticate, requireRole('admin', 'ops')];

  app.get('/api/loads', { preHandler: staff }, async (req) => {
    const q = z.object({ scope: z.enum(['open', 'mine', 'all']).default('all') }).parse(req.query);
    const orgId = me(req).orgId;
    const where =
      q.scope === 'mine' ? eq(loads.orgId, orgId) : q.scope === 'open' ? and(eq(loads.status, 'OPEN'), or(eq(loads.isPublic, true), eq(loads.orgId, orgId))) : or(eq(loads.orgId, orgId), and(eq(loads.isPublic, true), eq(loads.status, 'OPEN')));
    const rows = await db.select().from(loads).where(where).orderBy(desc(loads.createdAt));
    const ids = rows.map((r) => r.id);
    const allBids = ids.length ? await db.select().from(bids).where(inArray(bids.loadId, ids)) : [];
    return rows.map((l) => {
      const mine = l.orgId === orgId;
      const lb = allBids.filter((b) => b.loadId === l.id);
      return { ...ser(l), mine, bidCount: lb.length, bestBid: lb.length ? Math.min(...lb.map((b) => b.amount)) : null, myBid: ser(lb.find((b) => b.orgId === orgId && !mine) ?? null) };
    });
  });

  app.post('/api/loads', { preHandler: staff }, async (req, reply) => {
    const b = PostLoad.parse(req.body);
    const orgId = me(req).orgId;
    const a = requireCity(b.originCity);
    const z2 = requireCity(b.destCity);
    const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, orgId));
    const [row] = await db
      .insert(loads)
      .values({ orgId, loadNo: shortCode('LD', Math.random, 5), postedBy: b.postedBy ?? org!.name, contactPhone: b.contactPhone ?? null, originCity: a.name, originLat: a.lat, originLng: a.lng, destCity: z2.name, destLat: z2.lat, destLng: z2.lng, material: b.material, weightKg: b.weightKg, vehicleType: b.vehicleType ?? null, pickupDate: new Date(b.pickupDate), targetPrice: b.targetPrice, isPublic: b.isPublic })
      .returning();
    app.bus.emit(orgId, 'load.created', { id: row!.id, loadNo: row!.loadNo, originCity: a.name, destCity: z2.name });
    reply.status(201);
    return ser(row);
  });

  app.get('/api/loads/:id', { preHandler: staff }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const orgId = me(req).orgId;
    const [l] = await db.select().from(loads).where(eq(loads.id, id));
    if (!l || (l.orgId !== orgId && !l.isPublic)) throw notFound('Load not found');
    const mine = l.orgId === orgId;
    const lb = await db.select().from(bids).where(mine ? eq(bids.loadId, id) : and(eq(bids.loadId, id), eq(bids.orgId, orgId))).orderBy(bids.amount);
    const fleet = await db.select().from(vehicles).where(and(eq(vehicles.orgId, orgId), eq(vehicles.status, 'IDLE')));
    const sugg = suggestTrucks(asMatch(l), fleet.map((v) => ({ id: v.id, type: v.type as VehicleType, at: { lat: v.lat, lng: v.lng } }))).slice(0, 5);
    return { ...ser(l), mine, bids: ser(lb), suggestedTrucks: sugg.map((s) => ({ ...s, regNo: fleet.find((v) => v.id === s.vehicleId)!.regNo, city: fleet.find((v) => v.id === s.vehicleId)!.city })) };
  });

  app.post('/api/loads/:id/bids', { preHandler: staff }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const b = Bid.parse(req.body);
    const orgId = me(req).orgId;
    const [l] = await db.select().from(loads).where(eq(loads.id, id));
    if (!l || (l.orgId !== orgId && !l.isPublic)) throw notFound('Load not found');
    if (l.status !== 'OPEN') throw badRequest('This load is no longer open');
    if (b.vehicleId) {
      const [v] = await db.select().from(vehicles).where(and(eq(vehicles.id, b.vehicleId), eq(vehicles.orgId, orgId)));
      if (!v) throw badRequest('Vehicle not found in your fleet');
      if (v.capacityKg < l.weightKg) throw badRequest(`${v.regNo} cannot carry ${l.weightKg} kg`);
    }
    const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, orgId));
    const [row] = await db.insert(bids).values({ loadId: id, orgId, carrierName: org!.name, carrierPhone: null, vehicleId: b.vehicleId ?? null, amount: b.amount, etaHours: b.etaHours, note: b.note ?? null }).returning();
    app.bus.emit(l.orgId, 'load.bid', { loadId: id, loadNo: l.loadNo, amount: b.amount, carrier: org!.name });
    reply.status(201);
    return ser(row);
  });

  app.post('/api/loads/:id/accept', { preHandler: staff }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const b = z.object({ bidId: z.string().uuid(), driverId: z.string().uuid().optional() }).parse(req.body);
    const orgId = me(req).orgId;
    const [l] = await db.select().from(loads).where(eq(loads.id, id));
    if (!l) throw notFound('Load not found');
    if (l.orgId !== orgId) throw forbidden('Only the poster can accept a bid');
    if (l.status !== 'OPEN') throw badRequest('This load is no longer open');
    const [bid] = await db.select().from(bids).where(and(eq(bids.id, b.bidId), eq(bids.loadId, id)));
    if (!bid) throw notFound('Bid not found');
    let tripId: string | null = null;
    // Own truck won the load: create the trip straight away.
    if (bid.orgId === orgId && bid.vehicleId && b.driverId) {
      const trip = await createTrip(db, orgId, { vehicleId: bid.vehicleId, driverId: b.driverId, originCity: l.originCity, destCity: l.destCity, freightAmount: bid.amount, driverAdvance: 0, shipmentIds: [], plannedStart: l.pickupDate.toISOString(), loadId: l.id });
      tripId = trip.id;
    }
    await db.update(bids).set({ status: 'ACCEPTED' }).where(eq(bids.id, bid.id));
    await db.update(bids).set({ status: 'REJECTED' }).where(and(eq(bids.loadId, id), ne(bids.id, bid.id)));
    const [row] = await db.update(loads).set({ status: 'BOOKED', awardedBidId: bid.id, tripId }).where(eq(loads.id, id)).returning();
    app.bus.emit(orgId, 'load.booked', { id, loadNo: l.loadNo, amount: bid.amount, carrier: bid.carrierName });
    if (bid.orgId !== orgId) app.bus.emit(bid.orgId, 'load.booked', { id, loadNo: l.loadNo, amount: bid.amount, won: true });
    return { ...ser(row), tripId };
  });

  app.get('/api/vehicles/:id/return-loads', { preHandler: staff }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const q = z.object({ city: z.string().optional(), radiusKm: z.coerce.number().min(10).max(500).default(150) }).parse(req.query);
    const orgId = me(req).orgId;
    const [v] = await db.select().from(vehicles).where(and(eq(vehicles.id, id), eq(vehicles.orgId, orgId)));
    if (!v) throw notFound('Vehicle not found');
    const at = q.city ? requireCity(q.city) : { lat: v.lat, lng: v.lng };
    const open = await db.select().from(loads).where(and(eq(loads.status, 'OPEN'), or(eq(loads.isPublic, true), eq(loads.orgId, orgId))));
    return findReturnLoads({ id: v.id, type: v.type as VehicleType, at: { lat: at.lat, lng: at.lng } }, open.map(asMatch), q.radiusKm).map((m) => ({ ...m, load: { ...m.load, loadNo: open.find((l) => l.id === m.load.id)!.loadNo, material: open.find((l) => l.id === m.load.id)!.material } }));
  });
}
