import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DEMO_PASSWORD, isValidAwb } from '@suraj/core';
import { buildApp } from '../src/app';
import { openDatabase, type Database } from '../src/db/client';
import { recentMessages } from '../src/integrations';
import { seedDemo } from '../src/seed';

let database: Database;
let app: FastifyInstance;
let admin = '';
let orgId = '';

async function call(method: string, url: string, token?: string, body?: unknown) {
  const res = await app.inject({ method: method as any, url, headers: token ? { authorization: `Bearer ${token}` } : {}, payload: body as any });
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
}

async function login(email: string, password = DEMO_PASSWORD) {
  const r = await call('POST', '/api/auth/login', undefined, { email, password });
  expect(r.status).toBe(200);
  return r.body.token as string;
}

beforeAll(async () => {
  // TEST_DATABASE_URL=postgres://... runs the same suite against a real PostgreSQL (use an empty database).
  database = await openDatabase(process.env.TEST_DATABASE_URL ?? 'memory');
  const seeded = await seedDemo(database.db);
  orgId = seeded.orgId;
  app = await buildApp({ db: database.db, jwtSecret: 'test-secret-test-secret-test-secret-1234' });
  admin = await login('admin@surajlogistic.in');
}, 60_000);

afterAll(async () => {
  await app?.close();
  await database?.close();
});

describe('auth', () => {
  it('rejects a wrong password and unauthenticated calls', async () => {
    expect((await call('POST', '/api/auth/login', undefined, { email: 'admin@surajlogistic.in', password: 'nope' })).status).toBe(401);
    expect((await call('GET', '/api/dashboard')).status).toBe(401);
  });
  it('returns the logged-in user and org without the password hash', async () => {
    const r = await call('GET', '/api/me', admin);
    expect(r.status).toBe(200);
    expect(r.body.user.role).toBe('admin');
    expect(r.body.user.passwordHash).toBeUndefined();
    expect(r.body.org.name).toBe('Suraj Logistic');
  });
});

describe('control tower', () => {
  it('serves KPIs, exceptions and map data', async () => {
    const r = await call('GET', '/api/dashboard', admin);
    expect(r.status).toBe(200);
    expect(r.body.kpis.fleetSize).toBe(12);
    expect(r.body.exceptions.length).toBeGreaterThan(3);
    expect(r.body.map.trips.length).toBe(5);
  });
  it('answers the copilot in Hinglish and English', async () => {
    const a = await call('POST', '/api/copilot', admin, { message: 'Aaj ka summary batao' });
    expect(a.status).toBe(200);
    expect(a.body.lang).toBe('hi');
    expect(a.body.text).toMatch(/Aaj/);
    const b = await call('POST', '/api/copilot', admin, { message: 'Which trucks are idle near Jaipur?' });
    expect(b.body.intent).toBe('IDLE_VEHICLES');
    expect(b.body.facts).toBeUndefined();
  });
});

describe('shipment lifecycle', () => {
  let id = '';
  let awb = '';

  it('validates input', async () => {
    const r = await call('POST', '/api/shipments', admin, { service: 'COURIER', originCity: 'Atlantis', destCity: 'Jaipur', weightKg: 1, consigneeName: 'X Y', consigneePhone: '9876543210', consigneeAddress: '12 Main Road', shipperName: 'Test' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('validation');
  });

  it('quotes and books a COD parcel with a valid AWB, risk score and WhatsApp message', async () => {
    const q = await call('POST', '/api/quotes', admin, { service: 'COURIER', originCity: 'Jaipur', destCity: 'Indore', weightKg: 1.4, paymentMode: 'COD', codAmount: 1500 });
    expect(q.status).toBe(200);
    expect(q.body.quote.total).toBeGreaterThan(0);
    const r = await call('POST', '/api/shipments', admin, {
      service: 'COURIER', originCity: 'Jaipur', destCity: 'Indore', weightKg: 1.4, paymentMode: 'COD', codAmount: 1500, declaredValue: 1500,
      shipperName: 'BharatKart (online seller)', consigneeName: 'Test Receiver', consigneePhone: '9826000099', consigneeAddress: '45 Vijay Nagar, Scheme 54, Indore 452010',
    });
    expect(r.status).toBe(201);
    id = r.body.id;
    awb = r.body.awb;
    expect(isValidAwb(awb)).toBe(true);
    expect(r.body.price).toBe(q.body.quote.total);
    expect(r.body.deliveryOtp).toBeUndefined();
    expect(recentMessages(orgId).some((m) => m.text.includes(awb))).toBe(true);
  });

  it('refuses an impossible status jump', async () => {
    const r = await call('POST', `/api/shipments/${id}/status`, admin, { status: 'DELIVERED' });
    expect(r.status).toBe(400);
  });

  it('moves through the network and needs the OTP to deliver', async () => {
    for (const status of ['PICKED_UP', 'IN_TRANSIT', 'AT_HUB', 'OUT_FOR_DELIVERY']) {
      const r = await call('POST', `/api/shipments/${id}/status`, admin, { status });
      expect(r.status, status).toBe(200);
    }
    expect((await call('POST', `/api/shipments/${id}/status`, admin, { status: 'DELIVERED', otp: '0000' })).status).toBe(400);
    const detail = await call('GET', `/api/shipments/${id}`, admin);
    const otp = detail.body.deliveryOtp;
    expect(otp).toMatch(/^\d{4}$/);
    const ok = await call('POST', `/api/shipments/${id}/status`, admin, { status: 'DELIVERED', otp, receiverName: 'Test Receiver' });
    expect(ok.status).toBe(200);
    expect(ok.body.codCollected).toBe(true);
  });

  it('public tracking works without login and hides personal data', async () => {
    const r = await call('GET', `/api/track/${awb}`);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('DELIVERED');
    expect(r.body.events.length).toBe(6);
    const text = JSON.stringify(r.body);
    expect(text).not.toContain('9826000099');
    expect(text).not.toContain('Vijay Nagar');
    expect(r.body.deliveryOtp).toBeUndefined();
  });

  it('generates an e-way bill number', async () => {
    const list = await call('GET', '/api/shipments?status=BOOKED&limit=5', admin);
    const target = list.body.items[0];
    const r = await call('POST', `/api/shipments/${target.id}/ewaybill`, admin);
    expect(r.status).toBe(200);
    expect(r.body.ewbNo).toMatch(/^\d{12}$/);
  });
});

describe('tenant isolation', () => {
  let other = '';
  it('a second company sees none of the first one’s data', async () => {
    const reg = await call('POST', '/api/auth/register', undefined, { orgName: 'Marwar Transport Co.', name: 'Bhanwar Lal', email: 'owner@marwar.example', password: 'strongpass123' });
    expect(reg.status).toBe(201);
    other = reg.body.token;
    const mine = await call('GET', '/api/shipments', admin);
    const theirs = await call('GET', '/api/shipments', other);
    expect(mine.body.total).toBeGreaterThan(30);
    expect(theirs.body.total).toBe(0);
    const peek = await call('GET', `/api/shipments/${mine.body.items[0].id}`, other);
    expect(peek.status).toBe(404);
    const vehicles = await call('GET', '/api/vehicles', other);
    expect(vehicles.body).toHaveLength(0);
  });

  it('can still see and bid on public marketplace loads; the poster accepts', async () => {
    const open = await call('GET', '/api/loads?scope=open', other);
    const load = open.body.find((l: any) => l.originCity === 'Mumbai' && l.destCity === 'Indore');
    expect(load).toBeTruthy();
    expect(load.mine).toBe(false);
    const bid = await call('POST', `/api/loads/${load.id}/bids`, other, { amount: 34000, etaHours: 20 });
    expect(bid.status).toBe(201);
    expect((await call('POST', `/api/loads/${load.id}/accept`, other, { bidId: bid.body.id })).status).toBe(403);
    const acc = await call('POST', `/api/loads/${load.id}/accept`, admin, { bidId: bid.body.id });
    expect(acc.status).toBe(200);
    expect(acc.body.status).toBe('BOOKED');
    const detail = await call('GET', `/api/loads/${load.id}`, admin);
    expect(detail.body.bids.filter((b: any) => b.status === 'ACCEPTED')).toHaveLength(1);
    expect(detail.body.bids.filter((b: any) => b.status === 'REJECTED').length).toBeGreaterThan(0);
  });
});

describe('trucking', () => {
  it('plans, starts, tracks and completes a trip with its shipments', async () => {
    const vehicles = (await call('GET', '/api/vehicles', admin)).body;
    const drivers = (await call('GET', '/api/drivers', admin)).body;
    const truck = vehicles.find((v: any) => v.regNo === 'RJ27 GB 1189');
    const driver = drivers.find((d: any) => d.name === 'Harish Rathore');
    const ship = await call('POST', '/api/shipments', admin, { service: 'PTL', originCity: 'Udaipur', destCity: 'Ahmedabad', weightKg: 3000, declaredValue: 90000, paymentMode: 'PREPAID', shipperName: 'Udaipur Marble House', consigneeName: 'Ahmedabad Tiles', consigneePhone: '9824000011', consigneeAddress: 'Plot 3, Naroda GIDC, Ahmedabad 382330' });
    expect(ship.body.ewaybillRequired).toBe(true);
    const tooHeavy = await call('POST', '/api/trips', admin, { vehicleId: vehicles.find((v: any) => v.regNo === 'MP43 C 3390').id, driverId: driver.id, originCity: 'Udaipur', destCity: 'Ahmedabad', shipmentIds: [ship.body.id] });
    expect(tooHeavy.status).toBe(400);
    const trip = await call('POST', '/api/trips', admin, { vehicleId: truck.id, driverId: driver.id, originCity: 'Udaipur', destCity: 'Ahmedabad', shipmentIds: [ship.body.id], freightAmount: 21000 });
    expect(trip.status).toBe(201);
    expect(trip.body.plannedKm).toBeGreaterThan(200);
    const started = await call('POST', `/api/trips/${trip.body.id}/start`, admin);
    expect(started.body.status).toBe('IN_TRANSIT');
    const s1 = await call('GET', `/api/shipments/${ship.body.id}`, admin);
    expect(s1.body.status).toBe('IN_TRANSIT');
    const ping = await call('POST', `/api/trips/${trip.body.id}/ping`, admin, { lat: 23.9, lng: 73.3, speedKmph: 45 });
    expect(ping.status).toBe(200);
    expect(ping.body.progress).toBeGreaterThan(0);
    expect(ping.body.remainingKm).toBeLessThan(trip.body.plannedKm);
    const done = await call('POST', `/api/trips/${trip.body.id}/complete`, admin, { actualKm: 270 });
    expect(done.body.status).toBe('COMPLETED');
    expect(done.body.pnl.profit).toBeLessThan(21000);
    const s2 = await call('GET', `/api/shipments/${ship.body.id}`, admin);
    expect(s2.body.status).toBe('AT_HUB');
    const v = (await call('GET', '/api/vehicles', admin)).body.find((x: any) => x.id === truck.id);
    expect(v.status).toBe('IDLE');
    expect(v.city).toBe('Ahmedabad');
  });

  it('flags document expiry on vehicles', async () => {
    const vehicles = (await call('GET', '/api/vehicles', admin)).body;
    const ace = vehicles.find((v: any) => v.regNo === 'MP43 C 3390');
    expect(ace.alerts[0].doc).toBe('insurance');
  });

  it('optimises a multi-drop route', async () => {
    const r = await call('POST', '/api/routes/optimize', admin, { start: 'Jaipur', stops: ['Kota', 'Ajmer', 'Udaipur', 'Jodhpur', 'Bhilwara'] });
    expect(r.status).toBe(200);
    expect(r.body.totalKm).toBeLessThanOrEqual(r.body.originalKm);
  });
});

describe('driver app', () => {
  it('shows the driver their trip and blocks office screens', async () => {
    const driver = await login('driver@surajlogistic.in');
    const me = await call('GET', '/api/driver/me', driver);
    expect(me.status).toBe(200);
    expect(me.body.activeTrip.destCity).toBe('Ahmedabad');
    expect(me.body.stops.length).toBeGreaterThan(0);
    expect(JSON.stringify(me.body)).not.toContain('deliveryOtp');
    expect((await call('GET', '/api/dashboard', driver)).status).toBe(403);
    // A shipment that is not on Ramesh's trip.
    const other = (await call('GET', '/api/shipments?status=BOOKED', admin)).body.items.find((s: any) => !s.tripId);
    expect((await call('POST', `/api/shipments/${other.id}/status`, driver, { status: 'PICKED_UP' })).status).toBe(403);
  });
});

describe('warehouse', () => {
  it('moves stock in and out and refuses negative stock', async () => {
    const wh = await login('warehouse@surajlogistic.in');
    const items = (await call('GET', '/api/inventory', wh)).body;
    const item = items.find((i: any) => i.sku === 'BK-BTL-1L');
    expect(item.lowStock).toBe(true);
    expect((await call('POST', `/api/inventory/${item.id}/move`, wh, { type: 'OUTBOUND', qty: 9999 })).status).toBe(400);
    const r = await call('POST', `/api/inventory/${item.id}/move`, wh, { type: 'INBOUND', qty: 200, ref: 'GRN-9001' });
    expect(r.body.item.qty).toBe(item.qty + 200);
    expect(r.body.item.lowStock).toBe(false);
  });
});

describe('billing', () => {
  it('invoices delivered shipments for one customer with an FY-based number', async () => {
    const unbilled = (await call('GET', '/api/billing/unbilled', admin)).body;
    const group = unbilled.find((g: any) => g.shipments.length >= 1);
    expect(group).toBeTruthy();
    const inv = await call('POST', '/api/invoices', admin, { shipmentIds: group.shipments.map((s: any) => s.id) });
    expect(inv.status).toBe(201);
    expect(inv.body.invoiceNo).toMatch(/^SL\/\d{4}-\d{2}\/\d{5}$/);
    expect(inv.body.total).toBe(group.total);
    expect(inv.body.subtotal + inv.body.gst).toBe(inv.body.total);
    const again = await call('POST', '/api/invoices', admin, { shipmentIds: group.shipments.map((s: any) => s.id) });
    expect(again.status).toBe(400);
  });
});
