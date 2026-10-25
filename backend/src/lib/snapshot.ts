import { and, eq, gte, haversineKm, inArray, laneDemand, or, requireCity, returnLoadScore } from './deps';
import type { DB } from '../db/client';
import { facilities, inventoryItems, invoices, loads, organizations, shipments, trips, vehicles, drivers } from '../db/schema';
import type { OpsSnapshot, OrgSettings, Service } from '@suraj/shared';
import { ACTIVE_STATUSES } from '@suraj/shared';
import { ser } from './util';

/**
 * Loads one organisation's live operations for the control tower and copilot.
 * Active work plus the last 45 days of history — fine for SMB fleets; move heavy
 * analytics to ClickHouse when a tenant grows past ~100k shipments a month.
 */
export async function loadSnapshot(db: DB, orgId: string): Promise<OpsSnapshot> {
  const since = new Date(Date.now() - 45 * 86400_000);
  const [sh, vh, dr, tr, ld, inv, it, fac] = await Promise.all([
    db.select().from(shipments).where(and(eq(shipments.orgId, orgId), or(gte(shipments.createdAt, since), inArray(shipments.status, ACTIVE_STATUSES)))),
    db.select().from(vehicles).where(eq(vehicles.orgId, orgId)),
    db.select().from(drivers).where(eq(drivers.orgId, orgId)),
    db.select().from(trips).where(and(eq(trips.orgId, orgId), or(gte(trips.createdAt, since), inArray(trips.status, ['PLANNED', 'IN_TRANSIT'])))),
    db.select().from(loads).where(or(eq(loads.orgId, orgId), and(eq(loads.isPublic, true), eq(loads.status, 'OPEN')))),
    db.select().from(invoices).where(eq(invoices.orgId, orgId)),
    db.select().from(inventoryItems).where(eq(inventoryItems.orgId, orgId)),
    db.select().from(facilities).where(eq(facilities.orgId, orgId)),
  ]);
  return { shipments: ser(sh), vehicles: ser(vh), drivers: ser(dr), trips: ser(tr), loads: ser(ld), invoices: ser(inv), items: ser(it), facilities: ser(fac) };
}

export async function orgSettings(db: DB, orgId: string): Promise<OrgSettings> {
  const [o] = await db.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, orgId));
  return o!.settings;
}

/** Market signals for the pricing engine, read from the marketplace. */
export async function marketSignals(db: DB, orgId: string, service: Service, origin: string, destination: string) {
  if (service !== 'FTL') return { laneDemand: 1, returnLoadScore: 0 };
  const a = requireCity(origin);
  const b = requireCity(destination);
  const open = await db.select({ oLat: loads.originLat, oLng: loads.originLng }).from(loads).where(and(eq(loads.status, 'OPEN'), eq(loads.isPublic, true)));
  // Only this tenant's own trucks count as supply; public loads are market-wide demand.
  const idle = await db.select({ lat: vehicles.lat, lng: vehicles.lng }).from(vehicles).where(and(eq(vehicles.orgId, orgId), eq(vehicles.status, 'IDLE')));
  const near = (p: { lat: number; lng: number }, c: { lat: number; lng: number }) => haversineKm(p, c) <= 150;
  const loadsAtOrigin = open.filter((l) => near({ lat: l.oLat, lng: l.oLng }, a)).length;
  const trucksAtOrigin = idle.filter((v) => near(v, a)).length;
  const loadsAtDest = open.filter((l) => near({ lat: l.oLat, lng: l.oLng }, b)).length;
  return { laneDemand: laneDemand(loadsAtOrigin, trucksAtOrigin), returnLoadScore: returnLoadScore(loadsAtDest) };
}
