import type { FastifyInstance } from 'fastify';
import { daysUntil, docAlerts, OWNERSHIP, requireCity, tripPnl, VEHICLE_CLASSES, VEHICLE_STATUSES, VEHICLE_TYPES } from '@suraj/shared';
import { z } from 'zod';
import { drivers, trips, vehicles } from '../db/schema';
import { verifyVehicleMock } from '../integrations';
import { and, asc, desc, eq } from '../lib/deps';
import { badRequest, HttpError, me, notFound, requireRole, ser } from '../lib/util';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const Docs = z.object({ insurance: isoDate.optional(), fitness: isoDate.optional(), permit: isoDate.optional(), puc: isoDate.optional(), roadTax: isoDate.optional() });

const VehicleBody = z.object({
  regNo: z
    .string()
    .min(6)
    .max(16)
    .transform((s) => s.toUpperCase().replace(/\s+/g, ' ').trim()),
  type: z.enum(VEHICLE_TYPES),
  ownership: z.enum(OWNERSHIP).default('OWN'),
  city: z.string(),
  docs: Docs.default({}),
  odometerKm: z.number().int().min(0).default(0),
});

const DriverBody = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z
    .string()
    .transform((p) => p.replace(/\D/g, '').slice(-10))
    .refine((p) => /^[6-9]\d{9}$/.test(p), 'Enter a 10-digit mobile number'),
  licenseNo: z
    .string()
    .trim()
    .min(6)
    .max(20)
    .transform((s) => s.toUpperCase()),
  licenseExpiry: isoDate,
  lang: z.enum(['en', 'hi']).default('hi'),
});

export async function fleetRoutes(app: FastifyInstance) {
  const { db } = app;
  const staff = [app.authenticate, requireRole('admin', 'ops')];

  app.get('/api/vehicles', { preHandler: staff }, async (req) => {
    const rows = await db.select().from(vehicles).where(eq(vehicles.orgId, me(req).orgId)).orderBy(asc(vehicles.regNo));
    const now = new Date();
    return rows.map((v) => ({ ...ser(v), alerts: docAlerts(ser(v), now) }));
  });

  app.get('/api/vehicles/:id', { preHandler: staff }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const orgId = me(req).orgId;
    const [v] = await db.select().from(vehicles).where(and(eq(vehicles.id, id), eq(vehicles.orgId, orgId)));
    if (!v) throw notFound('Vehicle not found');
    const recent = await db.select().from(trips).where(and(eq(trips.orgId, orgId), eq(trips.vehicleId, id))).orderBy(desc(trips.createdAt)).limit(10);
    return { ...ser(v), alerts: docAlerts(ser(v), new Date()), trips: recent.map((t) => ({ ...ser(t), pnl: tripPnl(t) })) };
  });

  app.post('/api/vehicles', { preHandler: staff }, async (req, reply) => {
    const b = VehicleBody.parse(req.body);
    const orgId = me(req).orgId;
    const c = requireCity(b.city);
    const vc = VEHICLE_CLASSES[b.type];
    const compact = b.regNo.replace(/\s/g, '');
    const dupe = (await db.select({ regNo: vehicles.regNo }).from(vehicles).where(eq(vehicles.orgId, orgId))).filter((v) => v.regNo.replace(/\s/g, '') === compact);
    if (dupe.length) throw new HttpError(409, 'This vehicle is already in your fleet', 'conflict');
    const [row] = await db
      .insert(vehicles)
      .values({ orgId, regNo: b.regNo, type: b.type, ownership: b.ownership, status: 'IDLE', capacityKg: vc.capacityKg, city: c.name, lat: c.lat, lng: c.lng, kmpl: vc.kmpl, odometerKm: b.odometerKm, docs: b.docs })
      .returning();
    reply.status(201);
    return ser(row);
  });

  app.patch('/api/vehicles/:id', { preHandler: staff }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const b = z.object({ status: z.enum(VEHICLE_STATUSES).optional(), city: z.string().optional(), docs: Docs.optional() }).parse(req.body);
    const orgId = me(req).orgId;
    const [v] = await db.select().from(vehicles).where(and(eq(vehicles.id, id), eq(vehicles.orgId, orgId)));
    if (!v) throw notFound('Vehicle not found');
    const patch: Partial<typeof vehicles.$inferInsert> = {};
    if (b.status && b.status !== v.status) {
      // A truck on a trip comes back to idle only when its trip is closed.
      if (v.status === 'ON_TRIP' || b.status === 'ON_TRIP') throw badRequest('Close the trip first');
      patch.status = b.status;
    }
    if (b.city) {
      const c = requireCity(b.city);
      Object.assign(patch, { city: c.name, lat: c.lat, lng: c.lng });
    }
    if (b.docs) patch.docs = { ...v.docs, ...b.docs };
    const [row] = await db.update(vehicles).set(patch).where(eq(vehicles.id, id)).returning();
    return ser(row);
  });

  app.post('/api/vehicles/:id/verify', { preHandler: staff }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const [v] = await db.select().from(vehicles).where(and(eq(vehicles.id, id), eq(vehicles.orgId, me(req).orgId)));
    if (!v) throw notFound('Vehicle not found');
    return verifyVehicleMock(v);
  });

  app.get('/api/drivers', { preHandler: staff }, async (req) => {
    const rows = await db.select().from(drivers).where(eq(drivers.orgId, me(req).orgId)).orderBy(asc(drivers.name));
    const now = new Date();
    return rows.map((d) => ({ ...ser(d), hasLogin: !!d.userId, licenseDays: daysUntil(d.licenseExpiry, now) }));
  });

  /** Licence check. Mock until a ULIP (Sarathi) contract is in place; same shape as the real answer. */
  app.post('/api/drivers/:id/verify', { preHandler: staff }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const [d] = await db.select().from(drivers).where(and(eq(drivers.id, id), eq(drivers.orgId, me(req).orgId)));
    if (!d) throw notFound('Driver not found');
    const days = daysUntil(d.licenseExpiry, new Date());
    const formatOk = /^[A-Z]{2}[-\s]?\d{2}[-\s]?\d{4}[-\s]?\d{6,7}$/.test(d.licenseNo.replace(/\s+/g, ' ').trim());
    const remarks: string[] = [];
    if (!formatOk) remarks.push('The licence number format looks wrong. Check it against the card.');
    if (days < 0) remarks.push(`Expired ${-days} days ago. The driver must not drive until it is renewed.`);
    else if (days <= 30) remarks.push(`Ends in ${days} days. Remind the driver to renew.`);
    return { licenseNo: d.licenseNo, valid: days >= 0 && formatOk, validTill: d.licenseExpiry, source: 'Sarathi via ULIP (mock)', remarks };
  });

  app.post('/api/drivers', { preHandler: staff }, async (req, reply) => {
    const b = DriverBody.parse(req.body);
    const orgId = me(req).orgId;
    const same = await db.select({ id: drivers.id }).from(drivers).where(and(eq(drivers.orgId, orgId), eq(drivers.phone, b.phone)));
    if (same.length) throw new HttpError(409, 'A driver with this mobile number is already added', 'conflict');
    const [row] = await db.insert(drivers).values({ ...b, orgId, status: 'AVAILABLE' }).returning();
    reply.status(201);
    return ser(row);
  });

  app.patch('/api/drivers/:id', { preHandler: staff }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const b = z.object({ status: z.enum(['AVAILABLE', 'OFF']).optional(), licenseExpiry: isoDate.optional(), phone: DriverBody.shape.phone.optional() }).parse(req.body);
    const orgId = me(req).orgId;
    const [d] = await db.select().from(drivers).where(and(eq(drivers.id, id), eq(drivers.orgId, orgId)));
    if (!d) throw notFound('Driver not found');
    if (b.status && d.status === 'ON_TRIP') throw badRequest('Close the trip first');
    const [row] = await db.update(drivers).set(b).where(eq(drivers.id, id)).returning();
    return ser(row);
  });
}
