import bcrypt from 'bcryptjs';
import { buildDemoData, DEMO_PASSWORD } from '@suraj/core';
import { eq } from 'drizzle-orm';
import type { DB } from './db/client';
import { openDatabase } from './db/client';
import * as t from './db/schema';

const TS_KEYS = new Set(['createdAt', 'updatedAt', 'lastPingAt', 'etaAt', 'promisedAt', 'plannedStart', 'startedAt', 'completedAt', 'at', 'pickupDate', 'deliveredAt']);

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
  return { seeded: true, orgId: data.org.id };
}

// `npm run seed` — seed the database in DATABASE_URL.
if (import.meta.url === `file://${process.argv[1]}`) {
  const database = await openDatabase();
  const res = await seedDemo(database.db);
  console.log(res.seeded ? `Seeded demo company (org ${res.orgId}). Log in as admin@surajlogistic.in / ${DEMO_PASSWORD}` : 'Demo company already present — nothing to do.');
  await database.close();
}
