import type { FastifyInstance } from 'fastify';
import { docAlerts, OWNERSHIP, requireCity, VEHICLE_CLASSES, VEHICLE_STATUSES, VEHICLE_TYPES, daysUntil } from '@suraj/core';
import { z } from 'zod';
import { drivers, vehicles } from '../db/schema';
import { verifyVehicleMock } from '../integrations';
import { and, asc, eq } from '../lib/deps';
import { HttpError, me, notFound, requireRole, ser } from '../lib/util';

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
  name: z.string().min(2).max(80),
  phone: z.string().min(10).max(15),
  licenseNo: z.string().min(6).max(20),
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

  app.post('/api/vehicles', { preHandler: staff }, async (req, reply) => {
    const b = VehicleBody.parse(req.body);
    const orgId = me(req).orgId;
    const c = requireCity(b.city);
    const vc = VEHICLE_CLASSES[b.type];
    const dupe = await db.select({ id: vehicles.id }).from(vehicles).where(and(eq(vehicles.orgId, orgId), eq(vehicles.regNo, b.regNo)));
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
    if (b.status) patch.status = b.status;
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
    return rows.map((d) => ({ ...ser(d), licenseDays: daysUntil(d.licenseExpiry, now) }));
  });

  app.post('/api/drivers', { preHandler: staff }, async (req, reply) => {
    const b = DriverBody.parse(req.body);
    const [row] = await db.insert(drivers).values({ ...b, orgId: me(req).orgId, status: 'AVAILABLE' }).returning();
    reply.status(201);
    return ser(row);
  });

  app.patch('/api/drivers/:id', { preHandler: staff }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const b = z.object({ status: z.enum(['AVAILABLE', 'ON_TRIP', 'OFF']).optional(), licenseExpiry: isoDate.optional(), phone: z.string().min(10).max(15).optional() }).parse(req.body);
    const [row] = await db.update(drivers).set(b).where(and(eq(drivers.id, id), eq(drivers.orgId, me(req).orgId))).returning();
    if (!row) throw notFound('Driver not found');
    return ser(row);
  });
}
