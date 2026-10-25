import bcrypt from 'bcryptjs';
import { buildDemoData, DEMO_PASSWORD } from '@suraj/shared';
import { eq } from 'drizzle-orm';
import type { DB } from './db/client';
import { openDatabase } from './db/client';
import * as t from './db/schema';

const TS_KEYS = new Set(['createdAt', 'updatedAt', 'lastPingAt', 'etaAt', 'promisedAt', 'plannedStart', 'startedAt', 'completedAt', 'at', 'pickupDate', 'deliveredAt', 'paidAt', 'decidedAt', 'hireSettledAt']);

/** ISO strings → Date for timestamp columns. Date-only columns stay as YYYY-MM-DD. */
function dates<T extends object>(rows: T[]): any[] {
  return rows.map((r) => {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r as Record<string, unknown>)) o[k] = TS_KEYS.has(k) && typeof v === 'string' ? new Date(v) : v;
    return o;
  });
}

async function chunked(db: DB, table: any, rows: any[], size = 200) {
  for (let i = 0; i < rows.length; i += size) await db.insert(table).values(rows.slice(i, i + size));
}

/** Inserts the "Suraj Logistic" demo company. Safe to call twice: it skips if present. */
export async function seedDemo(db: DB, now = new Date()): Promise<{ seeded: boolean; orgId: string }> {
  const data = buildDemoData(now);
  const existing = await db.select({ id: t.organizations.id }).from(t.organizations).where(eq(t.organizations.slug, data.org.slug));
  if (existing.length) return { seeded: false, orgId: existing[0]!.id };
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  await db.insert(t.organizations).values(dates([data.org]));
  await chunked(db, t.customers, dates(data.customers));
  await chunked(db, t.users, dates(data.users.map((u) => ({ ...u, passwordHash: hash, customerId: u.customerId ?? null }))));
  await chunked(db, t.vehicles, dates(data.vehicles));
  await chunked(db, t.drivers, dates(data.drivers));
  await chunked(db, t.trips, dates(data.trips));
  await chunked(db, t.gpsPings, dates(data.pings));
  await chunked(db, t.invoices, dates(data.invoices));
  await chunked(db, t.shipments, dates(data.shipments));
  await chunked(db, t.shipmentEvents, dates(data.events));
  await chunked(db, t.loads, dates(data.loads));
  await chunked(db, t.bids, dates(data.bids));
  await chunked(db, t.facilities, dates(data.facilities));
  await chunked(db, t.inventoryItems, dates(data.items));
  await chunked(db, t.stockMoves, dates(data.moves));
  // People waiting for approval can log in with the demo password to see where their request stands.
  if (data.joinRequests.length) await chunked(db, t.joinRequests, dates(data.joinRequests.map((r) => ({ ...r, passwordHash: hash }))));

  // A believable message log and a few road expenses, so those screens are not empty on day one.
  const H = 3600_000;
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const site = (process.env.PUBLIC_URL ?? 'https://surajlogistic.in').replace(/\/$/, '');
  const recent = [...data.shipments].filter((s) => s.status !== 'REQUESTED').sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 14);
  const msgs: (typeof t.messages.$inferInsert)[] = [];
  for (const sh of recent) {
    const base = { orgId: data.org.id, to: sh.consigneePhone, channel: 'whatsapp', shipmentId: sh.id };
    msgs.push({ ...base, template: 'booking_confirmed', text: `Namaste ${sh.consigneeName}, your shipment ${sh.awb} from ${sh.originCity} is booked with ${data.org.name}. Track it: ${site}/track/${sh.awb}`, status: 'DELIVERED', at: new Date(sh.createdAt) });
    if (sh.status === 'OUT_FOR_DELIVERY') msgs.push({ ...base, template: 'out_for_delivery', text: `${sh.awb} is out for delivery in ${sh.destCity} today. Share OTP ${sh.deliveryOtp} only at handover.`, status: 'DELIVERED', at: ago(2 * H) });
    if (sh.status === 'NDR') msgs.push({ ...base, template: 'ndr_reschedule', text: `We could not deliver ${sh.awb}. Pick a new day: ${site}/track/${sh.awb}`, status: 'SENT', at: ago(5 * H) });
  }
  if (msgs.length) await chunked(db, t.messages, msgs);
  const driverUser = data.users.find((u) => u.role === 'driver');
  const ramesh = data.drivers.find((x) => x.userId === driverUser?.id);
  const active = data.trips.find((x) => x.driverId === ramesh?.id && x.status === 'IN_TRANSIT');
  if (active) {
    await db.insert(t.tripExpenses).values([
      { orgId: data.org.id, tripId: active.id, kind: 'DIESEL', amount: 9200, note: 'Shahpura pump, 100 litres', at: ago(6 * H) },
      { orgId: data.org.id, tripId: active.id, kind: 'TOLL', amount: 1340, note: 'FASTag, 3 plazas', at: ago(3 * H) },
    ]);
  }
  return { seeded: true, orgId: data.org.id };
}

// `npm run seed` — seed the database in DATABASE_URL.
if (import.meta.url === `file://${process.argv[1]}`) {
  const database = await openDatabase();
  const res = await seedDemo(database.db);
  console.log(res.seeded ? `Seeded demo company (org ${res.orgId}). Log in as admin@surajlogistic.in / ${DEMO_PASSWORD}` : 'Demo company already present — nothing to do.');
  await database.close();
}
