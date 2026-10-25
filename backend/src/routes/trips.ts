import type { FastifyInstance } from 'fastify';
import { canTransition, findCity, liveEta, nearestCity, optimizeRoute, predictEta, requireCity, roadKm, shortCode, tripPnl, VEHICLE_CLASSES, type ShipmentStatus, type VehicleType } from '@suraj/shared';
import { z } from 'zod';
import type { DB } from '../db/client';
import { drivers, gpsPings, loads, shipments, tripExpenses, trips, vehicles } from '../db/schema';
import { FILE_PREFIX, saveDataUrl, signedFileUrl } from '../lib/files';
import { and, desc, eq, inArray } from '../lib/deps';
import { orgSettings } from '../lib/snapshot';
import { badRequest, forDriver, HttpError, me, notFound, requireRole, ser } from '../lib/util';
import { applyStatus, assertDriverOwnsTrip } from './shipments';

const CreateTrip = z.object({
  vehicleId: z.string().uuid(),
  driverId: z.string().uuid(),
  originCity: z.string(),
  destCity: z.string(),
  freightAmount: z.number().int().min(0).default(0),
  driverAdvance: z.number().int().min(0).default(0),
  shipmentIds: z.array(z.string().uuid()).max(500).default([]),
  plannedStart: z.string().datetime({ offset: true }).optional(),
  loadId: z.string().uuid().optional(),
  /** Lorry hire for an attached truck: what its owner is paid, and the advance at loading. */
  hireAmount: z.number().int().min(0).max(5_000_000).optional(),
  hireAdvance: z.number().int().min(0).max(5_000_000).optional(),
});

const Ping = z.object({ lat: z.number().min(6).max(38), lng: z.number().min(68).max(98), speedKmph: z.number().min(0).max(160).default(0) });

export async function tripRoutes(app: FastifyInstance) {
  const { db } = app;
  const staff = [app.authenticate, requireRole('admin', 'ops')];

  app.get('/api/trips', { preHandler: staff }, async (req) => {
    const q = z.object({ status: z.string().optional() }).parse(req.query);
    const orgId = me(req).orgId;
    const where = [eq(trips.orgId, orgId)];
    if (q.status) where.push(inArray(trips.status, q.status.split(',')));
    const rows = await db
      .select({ trip: trips, regNo: vehicles.regNo, vehicleType: vehicles.type, driverName: drivers.name, driverPhone: drivers.phone })
      .from(trips)
      .innerJoin(vehicles, eq(vehicles.id, trips.vehicleId))
      .innerJoin(drivers, eq(drivers.id, trips.driverId))
      .where(and(...where))
      .orderBy(desc(trips.createdAt));
    return rows.map((r) => ({ ...ser(r.trip), regNo: r.regNo, vehicleType: r.vehicleType, driverName: r.driverName, driverPhone: r.driverPhone, pnl: tripPnl(r.trip) }));
  });

  app.post('/api/trips', { preHandler: staff }, async (req, reply) => {
    const b = CreateTrip.parse(req.body);
    const orgId = me(req).orgId;
    const row = await createTrip(db, orgId, b);
    reply.status(201);
    return ser(row);
  });

  /** Lorry hire for an attached truck: set the amount and advance, or mark the balance paid. */
  app.post('/api/trips/:id/hire', { preHandler: staff }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const b = z.object({ hireAmount: z.number().int().min(0).max(5_000_000).optional(), hireAdvance: z.number().int().min(0).max(5_000_000).optional(), settled: z.boolean().optional() }).parse(req.body);
    const u = me(req);
    const t = await getTrip(db, u.orgId, id);
    const amount = b.hireAmount ?? t.hireAmount;
    const advance = b.hireAdvance ?? t.hireAdvance ?? 0;
    if (amount === null || amount === undefined) throw badRequest('Set the lorry hire first');
    if (advance > amount) throw badRequest('The advance cannot be more than the hire');
    const patch: Partial<typeof trips.$inferInsert> = { hireAmount: amount, hireAdvance: advance };
    if (b.settled === true) {
      if (t.status !== 'COMPLETED') throw badRequest('Pay the balance after the trip is complete');
      patch.hireSettledAt = new Date();
    } else if (b.settled === false) patch.hireSettledAt = null;
    const [row] = await db.update(trips).set(patch).where(eq(trips.id, id)).returning();
    app.bus.emit(u.orgId, 'trip.status', { id, tripNo: row!.tripNo, status: row!.status, hire: true });
    return { ...ser(row), pnl: tripPnl(row!) };
  });

  app.get('/api/trips/:id', { preHandler: app.authenticate }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const u = me(req);
    if (u.role === 'driver') await assertDriverOwnsTrip(db, u.orgId, id, u.sub);
    else if (!['admin', 'ops'].includes(u.role)) throw new HttpError(403, 'You do not have access to this', 'forbidden');
    const t = await getTrip(db, u.orgId, id);
    const [v] = await db.select().from(vehicles).where(eq(vehicles.id, t.vehicleId));
    const [d] = await db.select().from(drivers).where(eq(drivers.id, t.driverId));
    const sh = await db.select().from(shipments).where(and(eq(shipments.tripId, id), eq(shipments.orgId, u.orgId)));
    const pings = await db.select().from(gpsPings).where(eq(gpsPings.tripId, id)).orderBy(desc(gpsPings.at)).limit(200);
    const out = {
      ...ser(t),
      vehicle: ser(v),
      driver: ser(d),
      shipments: sh.map((s) => {
        const o = ser(s);
        delete o.deliveryOtp;
        return u.role === 'driver' ? forDriver(o) : o;
      }),
      pings: ser(pings.reverse()),
      pnl: tripPnl(t),
      expenses: await listExpenses(db, app.fileSecret, id),
    };
    return u.role === 'driver' ? forDriver(out) : out;
  });

  /** Diesel, toll, food, repairs: what the driver spends on the road, with a bill photo if there is one. */
  app.post('/api/trips/:id/expenses', { preHandler: app.authenticate }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const b = z
      .object({
        kind: z.enum(['DIESEL', 'TOLL', 'FOOD', 'REPAIR', 'LOADING', 'OTHER']),
        amount: z.number().positive('Enter the amount spent').max(500000, 'That amount looks too large'),
        note: z.string().trim().max(200).optional(),
        photo: z.string().max(2_200_000).optional(),
      })
      .parse(req.body);
    const u = me(req);
    if (u.role === 'driver') await assertDriverOwnsTrip(db, u.orgId, id, u.sub);
    else if (!['admin', 'ops'].includes(u.role)) throw new HttpError(403, 'You do not have access to this', 'forbidden');
    const t = await getTrip(db, u.orgId, id);
    if (t.status === 'CANCELLED') throw badRequest('This trip was cancelled');
    const who = u.sub.startsWith('apikey:') ? null : u.sub;
    const ref = b.photo ? await saveDataUrl(db, u.orgId, 'expense_bill', b.photo, who) : null;
    const [e] = await db
      .insert(tripExpenses)
      .values({ orgId: u.orgId, tripId: id, kind: b.kind, amount: Math.round(b.amount), note: b.note || null, photoFileId: ref ? ref.slice(FILE_PREFIX.length) : null, createdBy: who })
      .returning();
    reply.status(201);
    return { id: e!.id, tripId: id, kind: e!.kind, amount: e!.amount, note: e!.note, photoUrl: signedFileUrl(app.fileSecret, ref), at: e!.at.toISOString() };
  });

  app.post('/api/trips/:id/start', { preHandler: app.authenticate }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const u = me(req);
    if (u.role === 'driver') await assertDriverOwnsTrip(db, u.orgId, id, u.sub);
    else if (!['admin', 'ops'].includes(u.role)) throw new HttpError(403, 'You do not have access to this', 'forbidden');
    const t = await getTrip(db, u.orgId, id);
    if (t.status !== 'PLANNED') throw badRequest('Only a planned trip can be started');
    const [v] = await db.select().from(vehicles).where(eq(vehicles.id, t.vehicleId));
    const now = new Date();
    const eta = predictEta({ service: 'FTL', distanceKm: t.plannedKm, vehicleType: v!.type as VehicleType, departAt: now, destination: requireCity(t.destCity) });
    const [row] = await db.update(trips).set({ status: 'IN_TRANSIT', startedAt: now, etaAt: new Date(eta.arriveAt), promisedAt: new Date(eta.arriveAt) }).where(eq(trips.id, id)).returning();
    await db.update(vehicles).set({ status: 'ON_TRIP' }).where(eq(vehicles.id, t.vehicleId));
    await db.update(drivers).set({ status: 'ON_TRIP' }).where(eq(drivers.id, t.driverId));
    const onTrip = await db.select().from(shipments).where(and(eq(shipments.tripId, id), eq(shipments.orgId, u.orgId)));
    for (let s of onTrip) {
      if (s.status === 'BOOKED') s = await applyStatus(db, s, 'PICKED_UP', { city: t.originCity });
      if (canTransition(s.service as any, s.status as ShipmentStatus, 'IN_TRANSIT')) await applyStatus(db, s, 'IN_TRANSIT', { note: `Departed on trip ${t.tripNo}`, city: t.originCity });
    }
    app.bus.emit(u.orgId, 'trip.status', { id, tripNo: t.tripNo, status: 'IN_TRANSIT' });
    return ser(row);
  });

  app.post('/api/trips/:id/ping', { preHandler: app.authenticate }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const b = Ping.parse(req.body);
    const u = me(req);
    if (u.role === 'driver') await assertDriverOwnsTrip(db, u.orgId, id, u.sub);
    else if (!['admin', 'ops'].includes(u.role)) throw new HttpError(403, 'You do not have access to this', 'forbidden');
    const t = await getTrip(db, u.orgId, id);
    if (t.status !== 'IN_TRANSIT') throw badRequest('Trip is not in transit');
    return recordPing(app, t, b);
  });

  app.post('/api/trips/:id/complete', { preHandler: app.authenticate }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const b = z.object({ actualKm: z.number().int().min(0).optional(), fuelCost: z.number().int().min(0).optional(), tollCost: z.number().int().min(0).optional(), otherCost: z.number().int().min(0).optional() }).parse(req.body ?? {});
    const u = me(req);
    if (u.role === 'driver') await assertDriverOwnsTrip(db, u.orgId, id, u.sub);
    else if (!['admin', 'ops'].includes(u.role)) throw new HttpError(403, 'You do not have access to this', 'forbidden');
    const t = await getTrip(db, u.orgId, id);
    if (t.status !== 'IN_TRANSIT') throw badRequest('Only a trip in transit can be completed');
    const now = new Date();
    const [row] = await db
      .update(trips)
      .set({ status: 'COMPLETED', completedAt: now, progress: 1, currentLat: t.destLat, currentLng: t.destLng, actualKm: b.actualKm ?? t.plannedKm, fuelCost: b.fuelCost ?? t.fuelCost, tollCost: b.tollCost ?? t.tollCost, otherCost: b.otherCost ?? t.otherCost })
      .where(eq(trips.id, id))
      .returning();
    await db.update(vehicles).set({ status: 'IDLE', city: t.destCity, lat: t.destLat, lng: t.destLng, lastPingAt: now }).where(eq(vehicles.id, t.vehicleId));
    await db.update(drivers).set({ status: 'AVAILABLE' }).where(eq(drivers.id, t.driverId));
    // Parcels and part loads reach the destination hub; full loads wait for proof of delivery.
    const onTrip = await db.select().from(shipments).where(and(eq(shipments.tripId, id), eq(shipments.orgId, u.orgId)));
    for (const s of onTrip) {
      if (s.service !== 'FTL' && canTransition(s.service as any, s.status as ShipmentStatus, 'AT_HUB')) await applyStatus(db, s, 'AT_HUB', { city: t.destCity, note: `Unloaded at ${t.destCity} from ${t.tripNo}` });
    }
    app.bus.emit(u.orgId, 'trip.status', { id, tripNo: t.tripNo, status: 'COMPLETED' });
    return { ...ser(row), pnl: tripPnl(row!) };
  });

  app.post('/api/routes/optimize', { preHandler: staff }, async (req) => {
    const b = z.object({ start: z.string(), stops: z.array(z.string()).min(1).max(200), returnToStart: z.boolean().default(false) }).parse(req.body);
    const start = requireCity(b.start);
    const stops = b.stops.map((name, i) => {
      const c = findCity(name);
      if (!c) throw badRequest(`Unknown city: ${name}`);
      return { id: `${i}:${c.name}`, label: c.name, lat: c.lat, lng: c.lng };
    });
    const plan = optimizeRoute(start, stops, b.returnToStart);
    return { ...plan, order: plan.stops.map((s) => s.label) };
  });
}

/** Expenses on a trip, newest first, with bill photos behind signed links. */
export async function listExpenses(db: DB, fileSecret: string, tripId: string) {
  const rows = await db.select().from(tripExpenses).where(eq(tripExpenses.tripId, tripId)).orderBy(desc(tripExpenses.at));
  return rows.map((e) => ({ id: e.id, tripId: e.tripId, kind: e.kind, amount: e.amount, note: e.note, photoUrl: e.photoFileId ? signedFileUrl(fileSecret, FILE_PREFIX + e.photoFileId) : null, at: e.at.toISOString() }));
}

export async function getTrip(db: DB, orgId: string, id: string) {
  const [t] = await db.select().from(trips).where(and(eq(trips.id, id), eq(trips.orgId, orgId)));
  if (!t) throw notFound('Trip not found');
  return t;
}

export async function createTrip(db: DB, orgId: string, b: z.infer<typeof CreateTrip>) {
  const a = findCity(b.originCity);
  const z2 = findCity(b.destCity);
  if (!a || !z2) throw badRequest('Unknown origin or destination city');
  const [v] = await db.select().from(vehicles).where(and(eq(vehicles.id, b.vehicleId), eq(vehicles.orgId, orgId)));
  if (!v) throw badRequest('Vehicle not found');
  if (v.status !== 'IDLE') throw badRequest(`${v.regNo} is not free (${v.status.toLowerCase()})`);
  const [d] = await db.select().from(drivers).where(and(eq(drivers.id, b.driverId), eq(drivers.orgId, orgId)));
  if (!d) throw badRequest('Driver not found');
  if (d.status !== 'AVAILABLE') throw badRequest(`${d.name} is not available`);
  if (d.licenseExpiry < new Date().toISOString().slice(0, 10)) throw badRequest(`${d.name}'s driving licence has expired`);
  let attach: (typeof shipments.$inferSelect)[] = [];
  if (b.shipmentIds.length) {
    attach = await db.select().from(shipments).where(and(eq(shipments.orgId, orgId), inArray(shipments.id, b.shipmentIds)));
    if (attach.length !== b.shipmentIds.length) throw badRequest('Some shipments were not found');
    const busy = attach.find((s) => s.tripId);
    if (busy) throw badRequest(`${busy.awb} is already on another trip`);
    const kg = attach.reduce((s, x) => s + x.weightKg, 0);
    if (kg > v.capacityKg) throw badRequest(`Load ${Math.round(kg)} kg is above ${v.regNo}'s capacity of ${v.capacityKg} kg`);
  }
  const settings = await orgSettings(db, orgId);
  const vc = VEHICLE_CLASSES[v.type as VehicleType];
  const km = roadKm(a, z2);
  const start = b.plannedStart ? new Date(b.plannedStart) : new Date();
  const eta = predictEta({ service: 'FTL', distanceKm: km, vehicleType: v.type as VehicleType, departAt: start, destination: z2 });
  const freight = b.freightAmount || attach.reduce((s, x) => s + Math.round((x.price * 100) / (100 + x.gstRate)), 0);
  const [row] = await db
    .insert(trips)
    .values({
      orgId,
      tripNo: shortCode('TRP', Math.random, 5),
      vehicleId: v.id,
      driverId: d.id,
      status: 'PLANNED',
      originCity: a.name,
      originLat: a.lat,
      originLng: a.lng,
      destCity: z2.name,
      destLat: z2.lat,
      destLng: z2.lng,
      plannedKm: km,
      freightAmount: freight,
      fuelCost: Math.round((km / vc.kmpl) * settings.dieselPrice),
      tollCost: Math.round(km * vc.tollPerKm),
      driverAdvance: b.driverAdvance,
      currentLat: a.lat,
      currentLng: a.lng,
      progress: 0,
      etaAt: new Date(eta.arriveAt),
      promisedAt: new Date(eta.arriveAt),
      loadId: b.loadId ?? null,
      plannedStart: start,
      hireAmount: b.hireAmount ?? null,
      hireAdvance: b.hireAmount !== undefined ? Math.min(b.hireAdvance ?? 0, b.hireAmount) : null,
    })
    .returning();
  if (attach.length) await db.update(shipments).set({ tripId: row!.id, vehicleType: v.type, updatedAt: new Date() }).where(inArray(shipments.id, attach.map((s) => s.id)));
  if (b.loadId) await db.update(loads).set({ tripId: row!.id }).where(and(eq(loads.id, b.loadId), eq(loads.orgId, orgId)));
  return row!;
}

/** Store a GPS fix, move the truck on the map, refresh the live ETA and tell the control tower. */
export async function recordPing(app: FastifyInstance, t: typeof trips.$inferSelect, p: { lat: number; lng: number; speedKmph: number }) {
  const { db } = app;
  const [v] = await db.select().from(vehicles).where(eq(vehicles.id, t.vehicleId));
  const now = new Date();
  const remaining = roadKm(p, { lat: t.destLat, lng: t.destLng });
  const progress = Math.min(0.99, Math.max(t.progress, 1 - remaining / Math.max(1, t.plannedKm)));
  const eta = liveEta(p, { lat: t.destLat, lng: t.destLng }, v!.type as VehicleType, now);
  await db.insert(gpsPings).values({ orgId: t.orgId, tripId: t.id, vehicleId: t.vehicleId, lat: p.lat, lng: p.lng, speedKmph: p.speedKmph, at: now });
  const [row] = await db.update(trips).set({ currentLat: p.lat, currentLng: p.lng, progress, etaAt: new Date(eta.arriveAt) }).where(eq(trips.id, t.id)).returning();
  await db.update(vehicles).set({ lat: p.lat, lng: p.lng, city: nearestCity(p).name, lastPingAt: now }).where(eq(vehicles.id, t.vehicleId));
  await db.update(shipments).set({ currentLat: p.lat, currentLng: p.lng, etaAt: new Date(eta.arriveAt), updatedAt: now }).where(and(eq(shipments.tripId, t.id), eq(shipments.status, 'IN_TRANSIT')));
  app.bus.emit(t.orgId, 'trip.ping', { id: t.id, tripNo: t.tripNo, vehicleId: t.vehicleId, lat: p.lat, lng: p.lng, speedKmph: p.speedKmph, progress, etaAt: eta.arriveAt, late: new Date(eta.arriveAt).getTime() > t.promisedAt.getTime() + 2 * 3600_000 });
  return { ...ser(row), remainingKm: remaining, eta };
}
