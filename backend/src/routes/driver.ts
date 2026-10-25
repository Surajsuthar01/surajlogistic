import type { FastifyInstance } from 'fastify';
import { nextStatuses, type ShipmentStatus } from '@suraj/shared';
import { drivers, shipments, trips, vehicles } from '../db/schema';
import { and, desc, eq, inArray } from '../lib/deps';
import { forDriver, me, notFound, requireRole, ser } from '../lib/util';
import { listExpenses } from './trips';

export async function driverRoutes(app: FastifyInstance) {
  const { db } = app;

  /** Everything the driver app needs on one screen. */
  app.get('/api/driver/me', { preHandler: [app.authenticate, requireRole('driver')] }, async (req) => {
    const u = me(req);
    const [d] = await db.select().from(drivers).where(and(eq(drivers.orgId, u.orgId), eq(drivers.userId, u.sub)));
    if (!d) throw notFound('No driver profile is linked to this login. Ask your dispatcher.');
    const myTrips = await db.select().from(trips).where(and(eq(trips.orgId, u.orgId), eq(trips.driverId, d.id))).orderBy(desc(trips.createdAt)).limit(20);
    const active = myTrips.find((t) => t.status === 'IN_TRANSIT') ?? myTrips.find((t) => t.status === 'PLANNED') ?? null;
    let vehicle = null;
    let stops: unknown[] = [];
    if (active) {
      [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, active.vehicleId));
      const sh = await db.select().from(shipments).where(and(eq(shipments.tripId, active.id), inArray(shipments.status, ['BOOKED', 'PICKED_UP', 'IN_TRANSIT', 'AT_HUB', 'OUT_FOR_DELIVERY', 'NDR'])));
      stops = sh.map((s) => ({
        id: s.id,
        awb: s.awb,
        service: s.service,
        status: s.status,
        consigneeName: s.consigneeName,
        consigneePhone: s.consigneePhone,
        consigneeAddress: s.consigneeAddress,
        destCity: s.destCity,
        paymentMode: s.paymentMode,
        codAmount: s.codAmount,
        packages: s.packages,
        weightKg: s.weightKg,
        nextStatuses: nextStatuses(s.service as any, s.status as ShipmentStatus),
      }));
    }
    const done = myTrips.filter((t) => t.status === 'COMPLETED');
    return {
      driver: ser(d),
      activeTrip: active ? forDriver(ser(active)) : null,
      vehicle: vehicle ? ser(vehicle) : null,
      stops,
      expenses: active ? await listExpenses(db, app.fileSecret, active.id) : [],
      history: done.slice(0, 10).map((t) => ({ id: t.id, tripNo: t.tripNo, lane: `${t.originCity}–${t.destCity}`, km: t.actualKm ?? t.plannedKm, completedAt: t.completedAt?.toISOString(), advance: t.driverAdvance })),
      stats: { tripsDone: done.length, kmDriven: done.reduce((a, t) => a + (t.actualKm ?? t.plannedKm), 0), rating: d.rating },
    };
  });
}
