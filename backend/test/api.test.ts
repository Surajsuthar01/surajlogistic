import { createHmac } from 'node:crypto';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DEMO_PASSWORD, isValidAwb } from '@suraj/shared';
import { buildApp } from '../src/app';
import { openDatabase, type Database } from '../src/db/client';
import { seedDemo } from '../src/seed';

let database: Database;
let app: FastifyInstance;
let admin = '';
let orgId = '';

async function call(method: string, url: string, token?: string, body?: unknown) {
  const res = await app.inject({ method: method as any, url, headers: token ? { authorization: `Bearer ${token}` } : {}, payload: body as any });
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
}

async function raw(method: string, url: string, headers: Record<string, string> = {}, body?: unknown) {
  return app.inject({ method: method as any, url, headers, payload: body as any });
}

// The smallest valid PNG: one transparent pixel.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const parcel = (extra: Record<string, unknown> = {}) => ({
  service: 'COURIER', originCity: 'Jaipur', destCity: 'Indore', weightKg: 1, paymentMode: 'PREPAID', declaredValue: 900,
  shipperName: 'Test Shipper', consigneeName: 'Kavita Joshi', consigneePhone: '9826011122', consigneeAddress: '12 Palasia Square, Indore 452001', ...extra,
});

/** Books a parcel and walks it to the door. Returns its id, AWB and OTP. */
async function outForDelivery(token = admin) {
  const r = await call('POST', '/api/shipments', token, parcel());
  expect(r.status).toBe(201);
  for (const status of ['PICKED_UP', 'IN_TRANSIT', 'AT_HUB', 'OUT_FOR_DELIVERY']) expect((await call('POST', `/api/shipments/${r.body.id}/status`, admin, { status })).status).toBe(200);
  const otp = (await call('GET', `/api/shipments/${r.body.id}`, admin)).body.deliveryOtp as string;
  return { id: r.body.id as string, awb: r.body.awb as string, otp };
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
  // The suite also covers other companies signing up, so company sign-up is switched on here.
  app = await buildApp({ db: database.db, jwtSecret: 'test-secret-test-secret-test-secret-1234', allowCompanySignup: true });
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
    const log = await call('GET', '/api/notifications', admin);
    expect(log.body.some((m: any) => m.text.includes(awb) && m.template === 'booking_confirmed' && m.shipmentId === id)).toBe(true);
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
  it('never shows the driver what the customer pays or what the trip earns', async () => {
    const driver = await login('driver@surajlogistic.in');
    const me = await call('GET', '/api/driver/me', driver);
    for (const k of ['freightAmount', 'pnl', 'hireAmount', 'price', 'priceBreakup']) expect(me.body.activeTrip[k]).toBeUndefined();
    const trip = await call('GET', `/api/trips/${me.body.activeTrip.id}`, driver);
    expect(trip.status).toBe(200);
    expect(trip.body.freightAmount).toBeUndefined();
    expect(trip.body.pnl).toBeUndefined();
    expect(trip.body.shipments.every((s: any) => s.price === undefined && s.deliveryOtp === undefined)).toBe(true);
    const stop = me.body.stops[0];
    const one = await call('GET', `/api/shipments/${stop.id}`, driver);
    expect(one.status).toBe(200);
    expect(one.body.price).toBeUndefined();
    expect(one.body.trip.freightAmount).toBeUndefined();
    // The office still sees the money.
    expect((await call('GET', `/api/trips/${me.body.activeTrip.id}`, admin)).body.pnl).toBeTruthy();
  });
  it('lets the driver record deliveries but not cancel or return a shipment', async () => {
    const driver = await login('driver@surajlogistic.in');
    const me = await call('GET', '/api/driver/me', driver);
    const stop = me.body.stops[0];
    const r = await call('POST', `/api/shipments/${stop.id}/status`, driver, { status: 'CANCELLED', note: 'driver tried' });
    expect(r.status).toBe(403);
    expect((await call('POST', `/api/shipments/${stop.id}/status`, driver, { status: 'RTO' })).status).toBe(403);
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

describe('logins and people', () => {
  it('logs in with a mobile number as well as an email', async () => {
    const r = await call('POST', '/api/auth/login', undefined, { email: '90000 00001', password: DEMO_PASSWORD });
    expect(r.status).toBe(200);
    expect(r.body.user.email).toBe('admin@surajlogistic.in');
  });

  it('slows down password guessing', async () => {
    for (let i = 0; i < 10; i++) expect((await call('POST', '/api/auth/login', undefined, { email: 'guess@nowhere.example', password: `wrong-${i}` })).status).toBe(401);
    const r = await call('POST', '/api/auth/login', undefined, { email: 'guess@nowhere.example', password: 'wrong-again' });
    expect(r.status).toBe(429);
    expect(r.body.error).toBe('rate_limited');
  });

  it('adds a person, changes their role, and a removed login stops working at once', async () => {
    const add = await call('POST', '/api/users', admin, { name: 'Pooja Meena', email: 'pooja@surajlogistic.in', password: 'dispatch123', role: 'ops' });
    expect(add.status).toBe(201);
    expect(add.body.passwordHash).toBeUndefined();
    const pooja = await login('pooja@surajlogistic.in', 'dispatch123');
    expect((await call('GET', '/api/dashboard', pooja)).status).toBe(200);
    const list = await call('GET', '/api/users', admin);
    expect(list.body.some((u: any) => u.email === 'pooja@surajlogistic.in')).toBe(true);
    expect((await call('PATCH', `/api/users/${add.body.id}`, admin, { role: 'warehouse' })).status).toBe(200);
    // Same token, new role: the office screens close immediately.
    expect((await call('GET', '/api/dashboard', pooja)).status).toBe(403);
    expect((await call('GET', '/api/users', pooja)).status).toBe(403);
    expect((await call('DELETE', `/api/users/${add.body.id}`, admin)).status).toBe(200);
    expect((await call('GET', '/api/inventory', pooja)).status).toBe(401);
    const meId = (await call('GET', '/api/me', admin)).body.user.id;
    expect((await call('DELETE', `/api/users/${meId}`, admin)).status).toBe(400);
  });

  it('a customer login needs a customer, and a driver login links to the driver', async () => {
    expect((await call('POST', '/api/users', admin, { name: 'No Company', email: 'x@shipper.example', password: 'password123', role: 'customer' })).status).toBe(400);
    const drivers = (await call('GET', '/api/drivers', admin)).body;
    const free = drivers.find((d: any) => !d.hasLogin);
    const r = await call('POST', '/api/users', admin, { name: free.name, email: 'second.driver@surajlogistic.in', password: 'driver1234', role: 'driver', driverId: free.id, lang: 'hi' });
    expect(r.status).toBe(201);
    const again = (await call('GET', '/api/drivers', admin)).body.find((d: any) => d.id === free.id);
    expect(again.hasLogin).toBe(true);
    expect((await call('POST', '/api/users', admin, { name: 'Twice', email: 'twice@surajlogistic.in', password: 'driver1234', role: 'driver', driverId: free.id })).status).toBe(409);
  });

  it('a person edits their own profile and changes their own password', async () => {
    const add = await call('POST', '/api/users', admin, { name: 'Ravi Saini', email: 'ravi@surajlogistic.in', password: 'firstpass1', role: 'ops' });
    expect(add.status).toBe(201);
    const ravi = await login('ravi@surajlogistic.in', 'firstpass1');
    const edit = await call('PATCH', '/api/me', ravi, { name: 'Ravi K. Saini', phone: '98290 12345', lang: 'hi', role: 'admin' });
    expect(edit.status).toBe(200);
    expect(edit.body).toMatchObject({ name: 'Ravi K. Saini', phone: '9829012345', lang: 'hi', role: 'ops' });
    expect(edit.body.passwordHash).toBeUndefined();
    expect((await call('GET', '/api/me', ravi)).body.user.name).toBe('Ravi K. Saini');
    // Somebody else's mobile number is taken.
    expect((await call('PATCH', '/api/me', ravi, { phone: '9000000001' })).status).toBe(409);
    expect((await call('PATCH', '/api/me', ravi, { phone: '12345' })).status).toBe(400);
    expect((await call('POST', '/api/me/password', ravi, { current: 'wrong-one', next: 'secondpass2' })).status).toBe(400);
    expect((await call('POST', '/api/me/password', ravi, { current: 'firstpass1', next: 'short' })).status).toBe(400);
    const ravi2 = await login('ravi@surajlogistic.in', 'firstpass1');
    const changed = await call('POST', '/api/me/password', ravi, { current: 'firstpass1', next: 'secondpass2' });
    expect(changed.status).toBe(200);
    // This device carries on with a fresh login; the other one is signed out at once.
    expect((await call('GET', '/api/me', changed.body.token)).status).toBe(200);
    expect((await call('GET', '/api/me', ravi2)).status).toBe(401);
    expect((await call('GET', '/api/me', ravi)).status).toBe(401);
    expect((await call('POST', '/api/auth/login', undefined, { email: 'ravi@surajlogistic.in', password: 'firstpass1' })).status).toBe(401);
    const fresh = await login('ravi@surajlogistic.in', 'secondpass2');
    // The owner resets the password: Ravi's logins stop working.
    const ravisId = (await call('GET', '/api/users', admin)).body.find((x: any) => x.email === 'ravi@surajlogistic.in').id;
    expect((await call('PATCH', `/api/users/${ravisId}`, admin, { password: 'ownerset123' })).status).toBe(200);
    expect((await call('GET', '/api/me', fresh)).status).toBe(401);
    await login('ravi@surajlogistic.in', 'ownerset123');
    expect((await call('PATCH', '/api/me', undefined, { name: 'Nobody' })).status).toBe(401);
  });
});

describe('shipments, more', () => {
  it('counts every tab in one call', async () => {
    const r = await call('GET', '/api/shipments?status=DELIVERED', admin);
    expect(r.body.counts.all).toBeGreaterThan(r.body.counts.delivered);
    expect(r.body.total).toBe(r.body.counts.delivered);
    expect(r.body.counts.booked + r.body.counts.moving + r.body.counts.action + r.body.counts.delivered).toBeLessThanOrEqual(r.body.counts.all);
  });

  it('refuses a receiver mobile that is not a real Indian number', async () => {
    expect((await call('POST', '/api/shipments', admin, parcel({ consigneePhone: '12345' }))).status).toBe(400);
    const ok = await call('POST', '/api/shipments', admin, parcel({ consigneePhone: '+91 98260 11122', contents: 'Cotton kurtas', shipperInvoiceNo: 'INV-77' }));
    expect(ok.status).toBe(201);
    expect(ok.body.consigneePhone).toBe('9826011122');
    expect(ok.body.contents).toBe('Cotton kurtas');
  });

  it('books from a spreadsheet: a dry run prices rows and reports bad ones', async () => {
    const customers = (await call('GET', '/api/customers', admin)).body;
    const shree = customers.find((c: any) => c.name.startsWith('Shree Textiles'));
    const rows = [
      { row: 2, ...parcel({ consigneeName: 'Ravi Kumar' }) },
      { row: 3, ...parcel({ destCity: 'Gotham' }) },
      { row: 4, ...parcel({ consigneePhone: '99' }) },
    ];
    const dry = await call('POST', '/api/shipments/bulk', admin, { dryRun: true, customerId: shree.id, rows });
    expect(dry.status).toBe(200);
    expect(dry.body.results[0]).toMatchObject({ row: 2, ok: true });
    expect(dry.body.results[0].price).toBeGreaterThan(0);
    expect(dry.body.results[1].ok).toBe(false);
    expect(dry.body.results[2].ok).toBe(false);
    expect(dry.body.results[2].error).toMatch(/consigneePhone/);
    const real = await call('POST', '/api/shipments/bulk', admin, { dryRun: false, customerId: shree.id, rows: [rows[0]] });
    expect(isValidAwb(real.body.results[0].awb)).toBe(true);
    const booked = await call('GET', `/api/shipments/${real.body.results[0].id}`, admin);
    expect(booked.body.shipperName).toBe(shree.name);
    expect(booked.body.customerId).toBe(shree.id);
  });

  it('keeps the delivery photo and signature behind signed, expiring links', async () => {
    const s = await outForDelivery();
    expect((await call('POST', `/api/shipments/${s.id}/pod`, admin, { photo: PNG })).status).toBe(400); // not delivered yet
    expect((await call('POST', `/api/shipments/${s.id}/status`, admin, { status: 'DELIVERED', otp: s.otp })).status).toBe(200);
    expect((await call('POST', `/api/shipments/${s.id}/pod`, admin, { photo: 'data:image/png;base64,SGVsbG8=' })).status).toBe(400); // not really a PNG
    const pod = await call('POST', `/api/shipments/${s.id}/pod`, admin, { photo: PNG, signature: PNG });
    expect(pod.status).toBe(200);
    const detail = await call('GET', `/api/shipments/${s.id}`, admin);
    expect(detail.body.podPhotoUrl).toMatch(/^\/api\/files\/[0-9a-f-]{36}\?exp=\d+&sig=/);
    const img = await raw('GET', detail.body.podPhotoUrl);
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.rawPayload.subarray(1, 4).toString()).toBe('PNG');
    const forged = detail.body.podPhotoUrl.replace(/sig=.*/, 'sig=AAAA');
    expect((await raw('GET', forged)).statusCode).toBe(403);
    const later = detail.body.podPhotoUrl.replace(/exp=\d+/, `exp=${Math.floor(Date.now() / 1000) + 99999}`);
    expect((await raw('GET', later)).statusCode).toBe(403);
  });

  it('lets the receiver pick a new day after a failed attempt, proving it is them', async () => {
    const s = await outForDelivery();
    expect((await call('POST', `/api/shipments/${s.id}/status`, admin, { status: 'NDR', note: 'Door locked' })).status).toBe(200);
    const t = await call('GET', `/api/track/${s.awb}`);
    expect(t.body.canReschedule).toBe(true);
    expect(t.body.carrier.name).toBe('Suraj Logistic');
    const tomorrow = new Date(Date.now() + 86400_000 + 5.5 * 3600_000).toISOString().slice(0, 10);
    expect((await call('POST', `/api/track/${s.awb}/reschedule`, undefined, { phoneLast4: '0000', date: tomorrow })).status).toBe(400);
    const ok = await call('POST', `/api/track/${s.awb}/reschedule`, undefined, { phoneLast4: '1122', date: tomorrow, address: 'Leave with the guard' });
    expect(ok.status).toBe(200);
    const after = await call('GET', `/api/track/${s.awb}`);
    expect(after.body.events.some((e: any) => /Receiver asked for delivery on .* note for the driver/.test(e.note ?? ''))).toBe(true);
    expect((await call('GET', `/api/shipments/${s.id}`, admin)).body.consigneeAddress).toContain('Leave with the guard');
    expect(JSON.stringify(after.body)).not.toContain('guard'); // address notes stay private
    const log = (await call('GET', '/api/notifications', admin)).body;
    expect(log.some((m: any) => m.template === 'ndr_reschedule' && m.text.includes(s.awb))).toBe(true);
  });

  it('a customer can cancel their own booking before pickup, and nothing else', async () => {
    const shree = await login('shipper@shreetextiles.in');
    const mine = await call('POST', '/api/shipments', shree, parcel());
    expect(mine.status).toBe(201);
    expect((await call('POST', `/api/shipments/${mine.body.id}/status`, shree, { status: 'PICKED_UP' })).status).toBe(403);
    expect((await call('POST', `/api/shipments/${mine.body.id}/status`, shree, { status: 'CANCELLED' })).status).toBe(200);
    const other = (await call('GET', '/api/shipments?status=BOOKED', admin)).body.items.find((x: any) => x.customerId !== mine.body.customerId);
    expect((await call('POST', `/api/shipments/${other.id}/status`, shree, { status: 'CANCELLED' })).status).toBe(403);
    expect((await call('GET', `/api/shipments/${other.id}`, shree)).status).toBe(404);
  });
});

describe('search and reports', () => {
  it('finds shipments, trucks and customers from the top bar', async () => {
    const one = (await call('GET', '/api/shipments?limit=1', admin)).body.items[0];
    const r = await call('GET', `/api/search?q=${one.awb.slice(0, 9)}`, admin);
    expect(r.body.shipments.some((x: any) => x.awb === one.awb)).toBe(true);
    const truck = await call('GET', '/api/search?q=rj27gb', admin);
    expect(truck.body.vehicles[0].regNo).toBe('RJ27 GB 1189');
    const cust = await call('GET', '/api/search?q=shree', admin);
    expect(cust.body.customers.length).toBeGreaterThan(0);
    expect((await call('GET', '/api/search?q=%25', admin)).body.shipments.length).toBe(0);
  });

  it('a customer only finds their own shipments and no trucks', async () => {
    const shree = await login('shipper@shreetextiles.in');
    const r = await call('GET', '/api/search?q=SL', shree);
    expect(r.body.vehicles).toHaveLength(0);
    const mine = (await call('GET', '/api/shipments?limit=500', shree)).body.items.map((s: any) => s.id);
    expect(r.body.shipments.every((s: any) => mine.includes(s.id))).toBe(true);
  });

  it('reports a date range', async () => {
    const to = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
    const from = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    const r = await call('GET', `/api/reports?from=${from}&to=${to}`, admin);
    expect(r.status).toBe(200);
    expect(r.body.summary.shipments).toBeGreaterThan(10);
    expect(r.body.lanes.length).toBeGreaterThan(0);
    expect(r.body.customers.length).toBeGreaterThan(0);
    expect((await call('GET', `/api/reports?from=${to}&to=${from}`, admin)).status).toBe(400);
    expect((await call('GET', `/api/reports?from=2020-01-01&to=${to}`, admin)).status).toBe(400);
  });
});

describe('fleet and trips, more', () => {
  it('shows a truck with its recent trips and will not free a truck that is on a trip', async () => {
    const vehicles = (await call('GET', '/api/vehicles', admin)).body;
    const busy = vehicles.find((v: any) => v.status === 'ON_TRIP');
    const d = await call('GET', `/api/vehicles/${busy.id}`, admin);
    expect(d.body.trips.length).toBeGreaterThan(0);
    expect(d.body.trips[0].pnl).toBeTruthy();
    expect((await call('PATCH', `/api/vehicles/${busy.id}`, admin, { status: 'IDLE' })).status).toBe(400);
  });

  it('checks a driving licence', async () => {
    const drivers = (await call('GET', '/api/drivers', admin)).body;
    const r = await call('POST', `/api/drivers/${drivers[0].id}/verify`, admin);
    expect(r.status).toBe(200);
    expect(r.body.licenseNo).toBe(drivers[0].licenseNo);
    expect(typeof r.body.valid).toBe('boolean');
  });

  it('the driver logs road expenses with a bill photo on their own trip only', async () => {
    const ramesh = await login('driver@surajlogistic.in');
    const me = (await call('GET', '/api/driver/me', ramesh)).body;
    expect(me.expenses.length).toBeGreaterThanOrEqual(2);
    const e = await call('POST', `/api/trips/${me.activeTrip.id}/expenses`, ramesh, { kind: 'TOLL', amount: 415, note: 'Kherwara plaza', photo: PNG });
    expect(e.status).toBe(201);
    expect(e.body.photoUrl).toMatch(/^\/api\/files\//);
    expect((await call('POST', `/api/trips/${me.activeTrip.id}/expenses`, ramesh, { kind: 'TOLL', amount: 0 })).status).toBe(400);
    const others = (await call('GET', '/api/trips', admin)).body.find((t: any) => t.id !== me.activeTrip.id && t.status === 'IN_TRANSIT');
    expect((await call('POST', `/api/trips/${others.id}/expenses`, ramesh, { kind: 'FOOD', amount: 200 })).status).toBe(403);
    const trip = await call('GET', `/api/trips/${me.activeTrip.id}`, admin);
    expect(trip.body.expenses[0]).toMatchObject({ kind: 'TOLL', amount: 415 });
  });
});

describe('customers and invoices, more', () => {
  it('lists customers with their numbers and edits terms', async () => {
    const list = await call('GET', '/api/customers?stats=1', admin);
    const shree = list.body.find((c: any) => c.name.startsWith('Shree Textiles'));
    expect(shree.shipments30d).toBeGreaterThan(0);
    expect(shree.logins).toBe(1);
    expect((await call('PATCH', `/api/customers/${shree.id}`, admin, { gstin: 'NOT-A-GSTIN' })).status).toBe(400);
    const p = await call('PATCH', `/api/customers/${shree.id}`, admin, { creditDays: 21, address: 'Shed 4, Sanganer, Jaipur' });
    expect(p.body.creditDays).toBe(21);
    const d = await call('GET', `/api/customers/${shree.id}`, admin);
    expect(d.body.users[0].email).toBe('shipper@shreetextiles.in');
    expect(d.body.users[0].passwordHash).toBeUndefined();
    expect(d.body.shipments.length).toBeGreaterThan(0);
    expect(JSON.stringify(d.body.shipments)).not.toContain('deliveryOtp');
  });

  it('sends, collects and locks an invoice; the customer sees it once sent', async () => {
    const shreeId = (await call('GET', '/api/customers', admin)).body.find((c: any) => c.name.startsWith('Shree Textiles')).id;
    const s = await outForDelivery();
    // Move this parcel to Shree so the invoice is theirs.
    const shree = await login('shipper@shreetextiles.in');
    const own = await call('POST', '/api/shipments', shree, parcel());
    for (const status of ['PICKED_UP', 'IN_TRANSIT', 'AT_HUB', 'OUT_FOR_DELIVERY']) await call('POST', `/api/shipments/${own.body.id}/status`, admin, { status });
    const otp = (await call('GET', `/api/shipments/${own.body.id}`, admin)).body.deliveryOtp;
    expect((await call('POST', `/api/shipments/${own.body.id}/status`, admin, { status: 'DELIVERED', otp })).status).toBe(200);
    expect((await call('POST', '/api/invoices', admin, { shipmentIds: [own.body.id, s.id] })).status).toBe(400); // two customers
    const inv = await call('POST', '/api/invoices', admin, { shipmentIds: [own.body.id] });
    expect(inv.status).toBe(201);
    expect(inv.body.customerId).toBe(shreeId);
    const due = Math.round((new Date(inv.body.dueDate).getTime() - Date.now()) / 86400_000);
    expect(due).toBeGreaterThanOrEqual(20); // the 21 credit days set above
    expect((await call('GET', `/api/invoices/${inv.body.id}`, shree)).status).toBe(404); // still a draft
    expect((await call('PATCH', `/api/invoices/${inv.body.id}`, admin, { status: 'SENT' })).status).toBe(200);
    const seen = await call('GET', `/api/invoices/${inv.body.id}`, shree);
    expect(seen.status).toBe(200);
    expect(seen.body.customerAddress).toBe('Shed 4, Sanganer, Jaipur');
    expect((await call('GET', '/api/invoices', shree)).body.every((i: any) => i.status !== 'DRAFT')).toBe(true);
    expect((await call('PATCH', `/api/invoices/${inv.body.id}`, shree, { status: 'PAID' })).status).toBe(403);
    const paid = await call('PATCH', `/api/invoices/${inv.body.id}`, admin, { status: 'PAID', paidAt: new Date().toISOString().slice(0, 10), paymentMode: 'NEFT', paymentRef: 'UTR 2290' });
    expect(paid.body).toMatchObject({ status: 'PAID', paymentMode: 'NEFT', paymentRef: 'UTR 2290' });
    expect((await call('PATCH', `/api/invoices/${inv.body.id}`, admin, { status: 'SENT' })).status).toBe(400);
    const log = (await call('GET', '/api/notifications', admin)).body;
    expect(log.some((m: any) => m.template === 'invoice_sent' && m.text.includes(inv.body.invoiceNo))).toBe(true);
  });
});

describe('API keys and webhooks', () => {
  it('an API key works like a dispatcher until it is revoked', async () => {
    const k = await call('POST', '/api/api-keys', admin, { name: 'Order system' });
    expect(k.status).toBe(201);
    expect(k.body.key).toMatch(/^sl_live_/);
    expect(JSON.stringify((await call('GET', '/api/api-keys', admin)).body)).not.toContain(k.body.key);
    const h = { 'x-api-key': k.body.key };
    expect((await raw('GET', '/api/shipments?limit=1', h)).statusCode).toBe(200);
    const booked = await raw('POST', '/api/shipments', h, parcel());
    expect(booked.statusCode).toBe(201);
    expect((await raw('GET', '/api/api-keys', h)).statusCode).toBe(403);
    expect((await raw('GET', '/api/users', h)).statusCode).toBe(403);
    expect((await call('DELETE', `/api/api-keys/${k.body.id}`, admin)).status).toBe(200);
    expect((await raw('GET', '/api/shipments?limit=1', h)).statusCode).toBe(401);
  });

  it('refuses webhook addresses inside our own network', async () => {
    delete process.env.WEBHOOK_ALLOW_PRIVATE;
    expect((await call('POST', '/api/webhooks', admin, { url: 'http://example.com/hook', events: ['shipment.created'] })).status).toBe(400);
    expect((await call('POST', '/api/webhooks', admin, { url: 'https://127.0.0.1/hook', events: ['shipment.created'] })).status).toBe(400);
    expect((await call('POST', '/api/webhooks', admin, { url: 'https://localhost/hook', events: ['shipment.created'] })).status).toBe(400);
  });

  it('signs and delivers events to a webhook', async () => {
    process.env.WEBHOOK_ALLOW_PRIVATE = '1';
    const got: { headers: IncomingMessage['headers']; body: string }[] = [];
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        got.push({ headers: req.headers, body });
        res.writeHead(204).end();
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    try {
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
      const hook = await call('POST', '/api/webhooks', admin, { url, events: ['shipment.created'] });
      expect(hook.status).toBe(201);
      const test = await call('POST', `/api/webhooks/${hook.body.id}/test`, admin);
      expect(test.body.status).toBe(204);
      const s = await call('POST', '/api/shipments', admin, parcel());
      for (let i = 0; i < 50 && !got.some((g) => g.body.includes(s.body.awb)); i++) await new Promise((r) => setTimeout(r, 50));
      const hit = got.find((g) => g.body.includes(s.body.awb))!;
      expect(hit).toBeTruthy();
      const body = JSON.parse(hit.body);
      expect(body.type).toBe('shipment.created');
      expect(body.data.awb).toBe(s.body.awb);
      const ts = hit.headers['x-suraj-timestamp'] as string;
      const want = 'sha256=' + createHmac('sha256', hook.body.secret).update(`${ts}.${hit.body}`).digest('hex');
      expect(hit.headers['x-suraj-signature']).toBe(want);
      const listed = (await call('GET', '/api/webhooks', admin)).body.find((h: any) => h.id === hook.body.id);
      expect(listed.secret).toBeUndefined();
      expect(listed.lastStatus).toBe(204);
    } finally {
      delete process.env.WEBHOOK_ALLOW_PRIVATE;
      server.close();
    }
  });
});

describe('company data', () => {
  it('exports everything and deletes only when the name is typed', async () => {
    const reg = await call('POST', '/api/auth/register', undefined, { orgName: 'Mewar Movers', name: 'Kailash Ji', email: 'owner@mewar.example', password: 'strongpass123', phone: '9414000077' });
    expect(reg.status).toBe(201);
    const t = reg.body.token;
    const v = await call('POST', '/api/vehicles', t, { regNo: 'rj27 ca 4410', type: 'LCV_14FT', city: 'Udaipur' });
    expect(v.status).toBe(201);
    expect((await call('POST', '/api/vehicles', t, { regNo: 'RJ27CA4410', type: 'LCV_14FT', city: 'Udaipur' })).status).toBe(409);
    const exp = await call('GET', '/api/org/export', t);
    expect(exp.body.vehicles).toHaveLength(1);
    expect(JSON.stringify(exp.body)).not.toContain('passwordHash');
    expect((await call('DELETE', '/api/org', t, { confirm: 'mewar' })).status).toBe(400);
    expect((await call('DELETE', '/api/org', t, { confirm: 'Mewar Movers' })).status).toBe(200);
    expect((await call('GET', '/api/me', t)).status).toBe(401);
    expect((await call('GET', '/api/vehicles', t)).status).toBe(401);
    // The demo company is untouched.
    expect((await call('GET', '/api/vehicles', admin)).body.length).toBeGreaterThan(10);
  });
});

describe('website: bookings without a login', () => {
  const booking = (extra: Record<string, unknown> = {}) => ({
    service: 'COURIER', originCity: 'Ratlam', destCity: 'Indore', weightKg: 6, packages: 1, declaredValue: 3000, paymentMode: 'PREPAID',
    contents: 'Sweets and clothes', pickupAddress: '14 Station Road, Ratlam 457001', senderName: 'Meena Joshi', senderPhone: '9752211001',
    receiverName: 'Ritu Joshi', receiverPhone: '9752211002', receiverAddress: '22 Vijay Nagar, Indore 452010', agree: true, ...extra,
  });

  it('prices a parcel and takes a request; the office confirms it and the AWB goes out', async () => {
    const q = await call('POST', '/api/public/quote', undefined, { originCity: 'Ratlam', destCity: 'Indore', weightKg: 6, declaredValue: 3000 });
    expect(q.status).toBe(200);
    expect(q.body.quote.total).toBeGreaterThan(0);
    expect((await call('POST', '/api/public/bookings', undefined, booking({ agree: false }))).status).toBe(400);
    expect((await call('POST', '/api/public/bookings', undefined, booking({ destCity: 'Atlantis' }))).status).toBe(400);
    const r = await call('POST', '/api/public/bookings', undefined, booking());
    expect(r.status).toBe(201);
    expect(isValidAwb(r.body.awb)).toBe(true);
    expect(r.body.status).toBe('REQUESTED');
    expect(r.body.price).toBe(q.body.quote.total);
    const tr = await call('GET', `/api/track/${r.body.awb}`);
    expect(tr.body.status).toBe('REQUESTED');
    expect(tr.body.statusLabel).toBe('Booking requested');
    const sum = await call('GET', '/api/requests/summary', admin);
    expect(sum.body.bookings).toBeGreaterThanOrEqual(1);
    const list = await call('GET', '/api/shipments?status=REQUESTED', admin);
    const mine = list.body.items.find((x: any) => x.awb === r.body.awb);
    expect(mine.customerId).toBeNull();
    expect(mine.pickupAddress).toContain('Station Road');
    expect(list.body.counts.requested).toBeGreaterThanOrEqual(1);
    // The receiver hears nothing until the office confirms.
    let msgs = (await call('GET', '/api/notifications', admin)).body;
    expect(msgs.some((m: any) => m.template === 'booking_requested' && m.to === '9752211001')).toBe(true);
    expect(msgs.some((m: any) => m.to === '9752211002')).toBe(false);
    const ok = await call('POST', `/api/shipments/${mine.id}/status`, admin, { status: 'BOOKED' });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('BOOKED');
    msgs = (await call('GET', '/api/notifications', admin)).body;
    expect(msgs.some((m: any) => m.template === 'booking_accepted' && m.to === '9752211001')).toBe(true);
    expect(msgs.some((m: any) => m.template === 'booking_confirmed' && m.to === '9752211002')).toBe(true);
  });

  it('a declined request needs a reason, and the sender is told', async () => {
    const r = await call('POST', '/api/public/bookings', undefined, booking({ senderPhone: '9752211003', receiverPhone: '9752211004' }));
    const id = (await call('GET', '/api/shipments?status=REQUESTED', admin)).body.items.find((x: any) => x.awb === r.body.awb).id;
    const shipper = await login('shipper@shreetextiles.in');
    expect((await call('POST', `/api/shipments/${id}/status`, shipper, { status: 'CANCELLED' })).status).toBe(403);
    expect((await call('POST', `/api/shipments/${id}/status`, admin, { status: 'CANCELLED' })).status).toBe(400);
    const no = await call('POST', `/api/shipments/${id}/status`, admin, { status: 'CANCELLED', note: 'We do not pick up on Sundays in Ratlam' });
    expect(no.body.status).toBe('CANCELLED');
    const msgs = (await call('GET', '/api/notifications', admin)).body;
    expect(msgs.some((m: any) => m.template === 'booking_declined' && m.to === '9752211003' && m.text.includes('Sundays'))).toBe(true);
  });
});

describe('website: people asking to join', () => {
  const ask = (extra: Record<string, unknown>) => call('POST', '/api/join', undefined, { name: 'Gopal Sharma', phone: '9828055101', city: 'Indore', password: 'ownerpass1', agree: true, ...extra });

  it('a truck owner waits for approval, then sees only their own trucks and lorry hire', async () => {
    expect((await ask({ role: 'partner' })).status).toBe(400);
    expect((await ask({ role: 'partner', trucks: [{ regNo: 'not a number', type: 'TRUCK_19FT' }] })).status).toBe(400);
    const r = await ask({ role: 'partner', trucks: [{ regNo: 'mp09 hg 4410', type: 'TRUCK_19FT' }], message: 'Indore se Mumbai chalata hoon' });
    expect(r.status).toBe(201);
    expect((await ask({ role: 'partner', trucks: [{ regNo: 'MP09 HG 4411', type: 'TRUCK_19FT' }] })).status).toBe(409);
    const early = await call('POST', '/api/auth/login', undefined, { email: '9828055101', password: 'ownerpass1' });
    expect(early.status).toBe(403);
    expect(early.body.error).toBe('pending');
    expect((await call('POST', '/api/auth/login', undefined, { email: '9828055101', password: 'wrong-pass' })).status).toBe(401);
    const ops = await login('ops@surajlogistic.in');
    expect((await call('GET', '/api/join-requests', ops)).status).toBe(403);
    const list = await call('GET', '/api/join-requests', admin);
    const req = list.body.find((x: any) => x.id === r.body.id);
    expect(req.passwordHash).toBeUndefined();
    expect(req.details.trucks[0].regNo).toBe('MP09 HG 4410');
    const ok = await call('POST', `/api/join-requests/${r.body.id}/approve`, admin, {});
    expect(ok.status).toBe(200);
    expect(ok.body.user.role).toBe('partner');
    expect((await call('POST', `/api/join-requests/${r.body.id}/approve`, admin, {})).status).toBe(400);
    const owner = await login('9828055101', 'ownerpass1');
    const mine = await call('GET', '/api/partner/me', owner);
    expect(mine.status).toBe(200);
    expect(mine.body.trucks.map((v: any) => v.regNo)).toEqual(['MP09 HG 4410']);
    expect(mine.body.trucks[0].ownership).toBe('ATTACHED');
    expect((await call('GET', '/api/shipments', owner)).status).toBe(403);
    expect((await call('GET', '/api/dashboard', owner)).status).toBe(403);
    const truck = mine.body.trucks[0];
    const free = await call('POST', `/api/partner/vehicles/${truck.id}/free`, owner, { city: 'Dewas' });
    expect(free.body.city).toBe('Dewas');
    // The office puts the truck on a trip with an agreed lorry hire.
    const drv = (await call('GET', '/api/drivers', admin)).body.find((d: any) => d.status === 'AVAILABLE' && d.licenseExpiry > new Date().toISOString().slice(0, 10));
    const trip = await call('POST', '/api/trips', admin, { vehicleId: truck.id, driverId: drv.id, originCity: 'Dewas', destCity: 'Mumbai', freightAmount: 52000, hireAmount: 45000, hireAdvance: 30000 });
    expect(trip.status).toBe(201);
    expect((await call('POST', `/api/trips/${trip.body.id}/hire`, admin, { settled: true })).status).toBe(400);
    let mineTrips = (await call('GET', '/api/partner/me', owner)).body.trips;
    expect(mineTrips[0]).toMatchObject({ hireAmount: 45000, hireAdvance: 30000, balance: 15000, hireSettledAt: null });
    expect(mineTrips[0].freightAmount).toBeUndefined();
    expect((await call('POST', `/api/trips/${trip.body.id}/start`, admin)).status).toBe(200);
    expect((await call('POST', `/api/trips/${trip.body.id}/complete`, admin, {})).status).toBe(200);
    const due = (await call('GET', '/api/partner/me', owner)).body.totals;
    expect(due.balanceDue).toBeGreaterThanOrEqual(15000);
    const paid = await call('POST', `/api/trips/${trip.body.id}/hire`, admin, { settled: true });
    expect(paid.status).toBe(200);
    expect(paid.body.pnl.profit).toBe(52000 - 45000 - paid.body.otherCost);
    mineTrips = (await call('GET', '/api/partner/me', owner)).body.trips;
    expect(mineTrips.find((t: any) => t.id === trip.body.id).hireSettledAt).not.toBeNull();
    // Another owner cannot touch this truck.
    const other = await login('partner@rathoretrucks.in');
    expect((await call('POST', `/api/partner/vehicles/${truck.id}/free`, other, { city: 'Indore' })).status).toBe(404);
  });

  it('a driver and a customer join; a declined applicant is told why', async () => {
    expect((await ask({ role: 'driver', phone: '9828055102' })).status).toBe(400);
    const d = await ask({ role: 'driver', name: 'Shankar Lal', phone: '9828055102', licenseNo: 'MP09 20180012345', licenseExpiry: '2031-03-31' });
    expect(d.status).toBe(201);
    await call('POST', `/api/join-requests/${d.body.id}/approve`, admin, {});
    const driver = await login('9828055102', 'ownerpass1');
    expect((await call('GET', '/api/driver/me', driver)).status).toBe(200);
    expect((await call('GET', '/api/drivers', admin)).body.some((x: any) => x.name === 'Shankar Lal' && x.hasLogin)).toBe(true);

    const c = await ask({ role: 'customer', name: 'Nisha Jain', phone: '9828055103', companyName: 'Jain Namkeen', gstin: '23ABCDE1234F1Z5', address: 'Freeganj, Ujjain 456010', city: 'Ujjain' });
    expect(c.status).toBe(201);
    await call('POST', `/api/join-requests/${c.body.id}/approve`, admin, {});
    const shipper = await login('9828055103', 'ownerpass1');
    expect((await call('GET', '/api/shipments', shipper)).status).toBe(200);
    expect((await call('GET', '/api/customers', admin)).body.some((x: any) => x.name === 'Jain Namkeen')).toBe(true);

    const w = await ask({ role: 'warehouse', name: 'Arjun Patel', phone: '9828055104' });
    expect((await call('POST', `/api/join-requests/${w.body.id}/reject`, admin, { note: '' })).status).toBe(400);
    expect((await call('POST', `/api/join-requests/${w.body.id}/reject`, admin, { note: 'No opening at the Indore warehouse this month' })).status).toBe(200);
    const no = await call('POST', '/api/auth/login', undefined, { email: '9828055104', password: 'ownerpass1' });
    expect(no.status).toBe(403);
    expect(no.body.error).toBe('rejected');
    expect(no.body.message).toContain('No opening');
    // Someone who already has a login is sent to the login page.
    expect((await ask({ role: 'driver', phone: '9000000001', licenseNo: 'RJ1420150034567', licenseExpiry: '2031-01-01' })).status).toBe(409);
  });

  it('company sign-up is closed unless it is switched on', async () => {
    const closed = await buildApp({ db: database.db, jwtSecret: 'test-secret-test-secret-test-secret-1234', webhooks: false });
    const res = await closed.inject({ method: 'POST', url: '/api/auth/register', payload: { orgName: 'Closed Co', name: 'Nobody Here', email: 'nobody@closed.example', password: 'strongpass123' } });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toBe('signup_closed');
    await closed.close();
  });
});

describe('server', () => {
  it('reports healthy with the database up, and sends safe headers', async () => {
    const r = await raw('GET', '/api/health');
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).database).toBe('up');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['cache-control']).toBe('no-store');
  });

  it('refuses to start in production with example secrets or without PostgreSQL', async () => {
    const { loadConfig } = await import('../src/config');
    const bad = loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'change-me-to-a-long-random-string-of-32-chars', DATABASE_URL: 'pglite:./x', PUBLIC_URL: 'https://surajlogistic.in' });
    expect(bad.problems.length).toBe(2);
    const good = loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'a'.repeat(20) + 'b9f3c1d2e4f5a6b7c8d9', DATABASE_URL: 'postgres://u:p@db:5432/x', PUBLIC_URL: 'https://surajlogistic.in' });
    expect(good.problems).toEqual([]);
    // Production defaults: no demo data, no fake GPS, API answers only its own website.
    expect(good.config.seedDemo).toBe(false);
    expect(good.config.simulate).toBe(false);
    expect(good.config.corsOrigin).toEqual(['https://surajlogistic.in']);
  });

  it('creates the company and its owner on the first start only', async () => {
    const { ensureCompany } = await import('../src/bootstrap');
    const empty = await openDatabase('memory');
    const cfg = { companyName: 'Suraj Logistic', adminName: 'Suraj', adminEmail: 'owner@surajlogistic.in', adminPassword: 'firstpass1', adminPhone: undefined, companyPhone: '9000012345', companyCity: 'Jaipur', companyAddress: undefined, companyGstin: undefined };
    expect(await ensureCompany(empty.db, { ...cfg, adminEmail: undefined })).toBe('missing');
    expect(await ensureCompany(empty.db, cfg)).toBe('created');
    expect(await ensureCompany(empty.db, { ...cfg, adminPassword: 'other-pass-2' })).toBe('exists');
    const fresh = await buildApp({ db: empty.db, jwtSecret: 'test-secret-test-secret-test-secret-1234', webhooks: false });
    const res = await fresh.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'owner@surajlogistic.in', password: 'firstpass1' } });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).org.settings.profile.city).toBe('Jaipur');
    await fresh.close();
    await empty.close();
  });
});
