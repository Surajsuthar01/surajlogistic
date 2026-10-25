import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { daysUntil, docAlerts, findCity, JOIN_ROLES, JOIN_STATUSES, quote, SERVICES, VEHICLE_CLASSES, VEHICLE_TYPES, type VehicleDocs } from '@suraj/shared';
import { z } from 'zod';
import type { DB } from '../db/client';
import { customers, drivers, joinRequests, organizations, shipments, trips, users, vehicles } from '../db/schema';
import { and, desc, eq, inArray, or, sql } from '../lib/deps';
import { sendMessage } from '../lib/notify';
import { limiter } from '../lib/ratelimit';
import { marketSignals, orgSettings } from '../lib/snapshot';
import { badRequest, HttpError, me, notFound, requireRole, ser } from '../lib/util';
import { createShipment } from './shipments';

const phone10 = (msg = 'Enter a 10-digit Indian mobile number') =>
  z
    .string()
    .transform((p) => p.replace(/\D/g, '').slice(-10))
    .refine((p) => /^[6-9]\d{9}$/.test(p), msg);

const cityName = z
  .string()
  .trim()
  .min(2)
  .refine((c) => !!findCity(c), { message: 'We do not serve this city yet' });

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

/** Indian registration numbers: MP43 G 5120, RJ14GA4521, or the Bharat series 22 BH 1234 AA. */
export const REG_RE = /^([A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}|\d{2}BH\d{4}[A-Z]{1,2})$/;
const regNo = z
  .string()
  .trim()
  .toUpperCase()
  .transform((s) => s.replace(/\s+/g, ' '))
  .refine((s) => REG_RE.test(s.replace(/[\s-]/g, '')), 'Vehicle number looks like MP43 G 5120');

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const PublicQuote = z.object({
  service: z.enum(SERVICES).default('COURIER'),
  originCity: cityName,
  destCity: cityName,
  weightKg: z.number().positive().max(40000),
  packages: z.number().int().min(1).max(200).default(1),
  declaredValue: z.number().min(0).max(10_000_000).default(0),
  /** Guests pay at pickup (prepaid) or the receiver pays. Cash on delivery is for business accounts. */
  paymentMode: z.enum(['PREPAID', 'TO_PAY']).default('PREPAID'),
});

const PublicBooking = PublicQuote.extend({
  contents: z.string().trim().min(2, 'Say what is inside').max(160),
  pickupAddress: z.string().trim().min(8, 'Write the full pickup address').max(300),
  pickupDate: isoDate.optional(),
  senderName: z.string().trim().min(2).max(120),
  senderPhone: phone10('Your mobile must be a 10-digit Indian number'),
  receiverName: z.string().trim().min(2).max(120),
  receiverPhone: phone10('Receiver mobile must be a 10-digit Indian number'),
  receiverAddress: z.string().trim().min(8, 'Write the full delivery address').max(400),
  agree: z.literal(true, { message: 'Please accept the booking terms' }),
});

const Truck = z.object({ regNo, type: z.enum(VEHICLE_TYPES).refine((t) => t !== 'BIKE', 'Pick a truck type') });

const JoinBody = z.object({
  role: z.enum(JOIN_ROLES),
  name: z.string().trim().min(2).max(80),
  phone: phone10(),
  email: z.union([z.email(), z.literal('')]).optional(),
  city: z.string().trim().min(2).max(60),
  password: z.string().min(8, 'Use at least 8 characters').max(100),
  licenseNo: z
    .string()
    .trim()
    .toUpperCase()
    .transform((s) => s.replace(/[\s-]/g, ''))
    .refine((s) => /^[A-Z]{2}\d{2,}[A-Z0-9]{6,16}$/.test(s), 'Licence number looks like RJ1420150034567')
    .optional(),
  licenseExpiry: isoDate.optional(),
  companyName: z.string().trim().max(120).optional(),
  gstin: z.union([z.string().trim().toUpperCase().regex(GSTIN, 'GSTIN should look like 23ABCDE1234F1Z5'), z.literal('')]).optional(),
  address: z.string().trim().max(300).optional(),
  trucks: z.array(Truck).max(10).optional(),
  message: z.string().trim().max(500).optional(),
  agree: z.literal(true, { message: 'Please accept the terms' }),
});

const ROLE_WORD: Record<string, string> = { partner: 'truck owner', driver: 'driver', customer: 'customer', warehouse: 'warehouse staff' };

// Public forms: tight per-address limits.
const quoteLimit = limiter(60, 60_000);
const bookingLimit = limiter(10, 60 * 60_000);
const joinLimit = limiter(20, 60 * 60_000);

/** The company the public website belongs to: PUBLIC_ORG_SLUG, or the first one created. */
export async function homeOrg(db: DB, slug?: string) {
  const rows = slug
    ? await db.select().from(organizations).where(eq(organizations.slug, slug))
    : await db.select().from(organizations).orderBy(organizations.createdAt).limit(1);
  if (!rows[0]) throw new HttpError(503, 'The company is not set up yet', 'not_ready');
  return rows[0];
}

function publicJoin(r: typeof joinRequests.$inferSelect) {
  const { passwordHash: _hidden, ...rest } = r;
  return ser(rest);
}

/** Bookings without a login, people asking to join, and the truck owner's own page. */
export async function communityRoutes(app: FastifyInstance) {
  const { db } = app;
  const home = () => homeOrg(db, app.homeOrgSlug);

  // ---------- Send a parcel without a login ----------

  app.post('/api/public/quote', async (req) => {
    if (!quoteLimit.hit(req.ip)) throw new HttpError(429, 'Too many price checks. Wait a minute.', 'rate_limited');
    const b = PublicQuote.parse(req.body);
    const org = await home();
    const settings = await orgSettings(db, org.id);
    const signals = await marketSignals(db, org.id, b.service, b.originCity, b.destCity);
    const q = quote({ ...b, codAmount: 0, origin: b.originCity, destination: b.destCity, dieselPrice: settings.dieselPrice, gst: settings.gst, ...signals });
    return { quote: q, company: org.name };
  });

  app.post('/api/public/bookings', async (req, reply) => {
    if (!bookingLimit.hit(req.ip)) throw new HttpError(429, 'Too many bookings from this connection. Call us instead.', 'rate_limited');
    const b = PublicBooking.parse(req.body);
    if (b.pickupDate) {
      const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
      const last = new Date(Date.now() + (5.5 * 3600_000) + 14 * 86400_000).toISOString().slice(0, 10);
      if (b.pickupDate < today || b.pickupDate > last) throw badRequest('Pick a pickup day in the next two weeks');
    }
    const org = await home();
    const when = b.pickupDate ? new Date(`${b.pickupDate}T00:00:00+05:30`).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' }) : 'as soon as possible';
    const row = await createShipment(db, org.id, {
      ...b,
      codAmount: 0,
      customerId: null,
      shipperName: b.senderName,
      shipperPhone: b.senderPhone,
      consigneeName: b.receiverName,
      consigneePhone: b.receiverPhone,
      consigneeAddress: b.receiverAddress,
      pickupAddress: b.pickupAddress,
      contents: b.contents,
      status: 'REQUESTED',
      note: `Requested on the website. Pickup wanted ${b.pickupDate ? 'on ' : ''}${when}.`,
    });
    const site = app.publicUrl.replace(/\/$/, '');
    await sendMessage(db, org.id, b.senderPhone, 'booking_requested', `Namaste ${b.senderName}, we got your booking request ${row.awb} (${row.originCity} to ${row.destCity}, ₹${row.price.toLocaleString('en-IN')}). ${org.name} will call you to confirm the pickup. Status: ${site}/track/${row.awb}`, { shipmentId: row.id });
    app.bus.emit(org.id, 'shipment.requested', { id: row.id, awb: row.awb, originCity: row.originCity, destCity: row.destCity, senderName: b.senderName });
    reply.status(201);
    return { awb: row.awb, status: row.status, price: row.price, originCity: row.originCity, destCity: row.destCity, company: org.name, phone: org.settings.profile?.phone || null };
  });

  // ---------- Ask to join ----------

  app.post('/api/join', async (req, reply) => {
    if (!joinLimit.hit(req.ip)) throw new HttpError(429, 'Too many requests from this connection. Try again later.', 'rate_limited');
    const b = JoinBody.parse(req.body);
    const email = b.email ? b.email.toLowerCase() : null;
    if (b.role === 'driver') {
      if (!b.licenseNo) throw badRequest('Enter your driving licence number');
      if (!b.licenseExpiry) throw badRequest('Enter when your licence expires');
      if (b.licenseExpiry < new Date().toISOString().slice(0, 10)) throw badRequest('Your licence has expired. Renew it, then apply.');
    }
    if (b.role === 'partner' && !b.trucks?.length) throw badRequest('Add at least one truck');
    if (b.trucks) {
      const regs = b.trucks.map((t) => t.regNo.replace(/[\s-]/g, ''));
      if (new Set(regs).size !== regs.length) throw badRequest('The same truck is listed twice');
    }
    const org = await home();
    const clash = await db
      .select({ id: users.id })
      .from(users)
      .where(email ? or(eq(users.phone, b.phone), eq(users.email, email)) : eq(users.phone, b.phone));
    if (clash.length) throw new HttpError(409, 'You already have a login. Log in with your mobile number.', 'conflict');
    const waiting = await db.select({ id: joinRequests.id }).from(joinRequests).where(and(eq(joinRequests.orgId, org.id), eq(joinRequests.phone, b.phone), eq(joinRequests.status, 'PENDING')));
    if (waiting.length) throw new HttpError(409, 'We already have a request from this mobile number. We will call you soon.', 'conflict');
    const details = {
      ...(b.role === 'driver' ? { licenseNo: b.licenseNo, licenseExpiry: b.licenseExpiry } : {}),
      ...(b.role === 'customer' ? { companyName: b.companyName || undefined, gstin: b.gstin || undefined, address: b.address || undefined } : {}),
      ...(b.role === 'partner' ? { trucks: b.trucks } : {}),
      ...(b.message ? { message: b.message } : {}),
    };
    const [row] = await db
      .insert(joinRequests)
      .values({ orgId: org.id, role: b.role, name: b.name, phone: b.phone, email, city: b.city, details, passwordHash: await bcrypt.hash(b.password, 10), status: 'PENDING' })
      .returning();
    await sendMessage(db, org.id, b.phone, 'join_received', `Namaste ${b.name}, ${org.name} got your request to join as a ${ROLE_WORD[b.role]}. We will check your details and call you. You can log in with this mobile number once you are approved.`);
    app.bus.emit(org.id, 'join.requested', { id: row!.id, role: b.role, name: b.name, city: b.city });
    reply.status(201);
    return { id: row!.id, status: row!.status, company: org.name };
  });

  // ---------- The office: what is waiting ----------

  const staff = [app.authenticate, requireRole('admin', 'ops')];
  const owner = [app.authenticate, requireRole('admin')];

  app.get('/api/requests/summary', { preHandler: staff }, async (req) => {
    const u = me(req);
    const [b] = (await db.select({ n: sql<number>`count(*)::int` }).from(shipments).where(and(eq(shipments.orgId, u.orgId), eq(shipments.status, 'REQUESTED')))) as [{ n: number }];
    const [j] = (await db.select({ n: sql<number>`count(*)::int` }).from(joinRequests).where(and(eq(joinRequests.orgId, u.orgId), eq(joinRequests.status, 'PENDING')))) as [{ n: number }];
    return { bookings: b.n, joins: u.role === 'admin' ? j.n : 0 };
  });

  app.get('/api/join-requests', { preHandler: owner }, async (req) => {
    const q = z.object({ status: z.enum([...JOIN_STATUSES, 'ALL']).default('PENDING') }).parse(req.query);
    const u = me(req);
    const where = [eq(joinRequests.orgId, u.orgId)];
    if (q.status !== 'ALL') where.push(eq(joinRequests.status, q.status));
    const rows = await db.select().from(joinRequests).where(and(...where)).orderBy(desc(joinRequests.createdAt)).limit(200);
    return rows.map(publicJoin);
  });

  app.post('/api/join-requests/:id/approve', { preHandler: owner }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const b = z.object({ customerId: z.string().uuid().optional() }).parse(req.body ?? {});
    const u = me(req);
    const [r] = await db.select().from(joinRequests).where(and(eq(joinRequests.id, id), eq(joinRequests.orgId, u.orgId)));
    if (!r) throw notFound('Request not found');
    if (r.status !== 'PENDING') throw badRequest(`This request was already ${r.status.toLowerCase()}`);
    const clash = await db.select({ id: users.id }).from(users).where(r.email ? or(eq(users.phone, r.phone), eq(users.email, r.email)) : eq(users.phone, r.phone));
    if (clash.length) throw new HttpError(409, 'Someone already logs in with this mobile number or email', 'conflict');

    const home = findCity(r.city);
    const [org] = await db.select().from(organizations).where(eq(organizations.id, u.orgId));
    const fallback = findCity(org?.settings.profile?.city ?? '') ?? findCity('Jaipur')!;
    const place = home ?? fallback;
    const email = r.email ?? `${r.phone}@${r.role === 'driver' ? 'drivers' : 'members'}.surajlogistic.in`;
    let customerId: string | null = null;

    if (r.role === 'customer') {
      if (b.customerId) {
        const [c] = await db.select({ id: customers.id }).from(customers).where(and(eq(customers.id, b.customerId), eq(customers.orgId, u.orgId)));
        if (!c) throw badRequest('Customer not found');
        customerId = c.id;
      } else {
        const [c] = await db
          .insert(customers)
          .values({ orgId: u.orgId, name: r.details.companyName || r.name, gstin: r.details.gstin || null, phone: r.phone, email: r.email, city: place.name, address: r.details.address || null })
          .returning();
        customerId = c!.id;
      }
    }

    const [user] = await db
      .insert(users)
      .values({ orgId: u.orgId, name: r.name, email, phone: r.phone, role: r.role, lang: r.role === 'driver' || r.role === 'partner' ? 'hi' : 'en', customerId, passwordHash: r.passwordHash })
      .returning();

    if (r.role === 'driver') {
      await db.insert(drivers).values({ orgId: u.orgId, userId: user!.id, name: r.name, phone: r.phone, licenseNo: r.details.licenseNo ?? 'PENDING', licenseExpiry: r.details.licenseExpiry ?? new Date().toISOString().slice(0, 10), status: 'AVAILABLE', lang: 'hi' });
    }
    if (r.role === 'partner') {
      for (const t of r.details.trucks ?? []) {
        const [existing] = await db.select().from(vehicles).where(and(eq(vehicles.orgId, u.orgId), eq(vehicles.regNo, t.regNo)));
        if (existing) {
          if (existing.partnerId && existing.partnerId !== user!.id) continue;
          await db.update(vehicles).set({ partnerId: user!.id, ownership: 'ATTACHED' }).where(eq(vehicles.id, existing.id));
          continue;
        }
        const vc = VEHICLE_CLASSES[t.type];
        await db.insert(vehicles).values({ orgId: u.orgId, regNo: t.regNo, type: t.type, ownership: 'ATTACHED', status: 'IDLE', capacityKg: vc.capacityKg, city: place.name, lat: place.lat, lng: place.lng, kmpl: vc.kmpl, odometerKm: 0, docs: {}, partnerId: user!.id });
      }
    }

    const [done] = await db.update(joinRequests).set({ status: 'APPROVED', userId: user!.id, decidedBy: u.sub.startsWith('apikey:') ? null : u.sub, decidedAt: new Date() }).where(eq(joinRequests.id, id)).returning();
    const site = app.publicUrl.replace(/\/$/, '');
    await sendMessage(db, u.orgId, r.phone, 'join_approved', `Namaste ${r.name}, your ${org?.name ?? 'SurajLogistic'} login is ready. Log in at ${site}/login with your mobile number ${r.phone} and the password you chose.`);
    app.bus.emit(u.orgId, 'join.decided', { id, status: 'APPROVED', role: r.role });
    const { passwordHash: _h, ...pub } = user!;
    return { request: publicJoin(done!), user: ser(pub) };
  });

  app.post('/api/join-requests/:id/reject', { preHandler: owner }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const b = z.object({ note: z.string().trim().min(3, 'Say why, so we can tell them').max(300) }).parse(req.body ?? {});
    const u = me(req);
    const [r] = await db.select().from(joinRequests).where(and(eq(joinRequests.id, id), eq(joinRequests.orgId, u.orgId)));
    if (!r) throw notFound('Request not found');
    if (r.status !== 'PENDING') throw badRequest(`This request was already ${r.status.toLowerCase()}`);
    const [done] = await db.update(joinRequests).set({ status: 'REJECTED', note: b.note, decidedBy: u.sub.startsWith('apikey:') ? null : u.sub, decidedAt: new Date() }).where(eq(joinRequests.id, id)).returning();
    const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, u.orgId));
    await sendMessage(db, u.orgId, r.phone, 'join_declined', `Namaste ${r.name}, ${org?.name ?? 'we'} could not approve your request right now: ${b.note}`);
    app.bus.emit(u.orgId, 'join.decided', { id, status: 'REJECTED', role: r.role });
    return publicJoin(done!);
  });

  // ---------- The truck owner's page ----------

  const partner = [app.authenticate, requireRole('partner')];

  app.get('/api/partner/me', { preHandler: partner }, async (req) => {
    const u = me(req);
    const [user] = await db.select().from(users).where(eq(users.id, u.sub));
    const [org] = await db.select().from(organizations).where(eq(organizations.id, u.orgId));
    const trucks = await db.select().from(vehicles).where(and(eq(vehicles.orgId, u.orgId), eq(vehicles.partnerId, u.sub))).orderBy(vehicles.regNo);
    const ids = trucks.map((v) => v.id);
    const rows = ids.length
      ? await db
          .select({ t: trips, driverName: drivers.name, driverPhone: drivers.phone })
          .from(trips)
          .innerJoin(drivers, eq(drivers.id, trips.driverId))
          .where(and(eq(trips.orgId, u.orgId), inArray(trips.vehicleId, ids)))
          .orderBy(desc(trips.plannedStart))
          .limit(60)
      : [];
    const regOf = new Map(trucks.map((v) => [v.id, v.regNo]));
    // The owner sees the hire agreed for their truck, not the freight the company charged.
    const tripList = rows
      .filter((r) => r.t.status !== 'CANCELLED')
      .map(({ t, driverName, driverPhone }) => {
        const hire = t.hireAmount ?? null;
        const advance = t.hireAdvance ?? 0;
        return {
          id: t.id,
          tripNo: t.tripNo,
          regNo: regOf.get(t.vehicleId) ?? '',
          status: t.status,
          originCity: t.originCity,
          destCity: t.destCity,
          plannedKm: t.plannedKm,
          plannedStart: t.plannedStart.toISOString(),
          startedAt: t.startedAt?.toISOString() ?? null,
          completedAt: t.completedAt?.toISOString() ?? null,
          etaAt: t.etaAt.toISOString(),
          progress: t.progress,
          driverName,
          driverPhone,
          hireAmount: hire,
          hireAdvance: hire === null ? null : advance,
          balance: hire === null ? null : Math.max(0, hire - advance),
          hireSettledAt: t.hireSettledAt?.toISOString() ?? null,
        };
      });
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const thisMonth = tripList.filter((t) => new Date(t.plannedStart) >= monthStart);
    const due = tripList.filter((t) => t.status === 'COMPLETED' && t.balance !== null && !t.hireSettledAt);
    const truckList = trucks.map((v) => {
      const current = tripList.find((t) => t.regNo === v.regNo && ['PLANNED', 'IN_TRANSIT'].includes(t.status));
      const now = new Date();
      return { ...ser(v), alerts: docAlerts(ser(v), now), docDays: Object.fromEntries(Object.entries(v.docs as VehicleDocs).map(([k, d]) => [k, d ? daysUntil(d, now) : null])), currentTrip: current ?? null };
    });
    return {
      partner: user ? { id: user.id, name: user.name, phone: user.phone, lang: user.lang } : null,
      company: { name: org?.name ?? '', phone: org?.settings.profile?.phone || null },
      trucks: truckList,
      trips: tripList,
      totals: {
        trucks: trucks.length,
        onTrip: trucks.filter((v) => v.status === 'ON_TRIP').length,
        tripsThisMonth: thisMonth.length,
        hireThisMonth: thisMonth.reduce((s, t) => s + (t.hireAmount ?? 0), 0),
        balanceDue: due.reduce((s, t) => s + (t.balance ?? 0), 0),
        tripsDue: due.length,
      },
    };
  });

  /** The owner says a truck is empty in a city, so the office can find it a load. */
  app.post('/api/partner/vehicles/:id/free', { preHandler: partner }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const b = z.object({ city: cityName }).parse(req.body);
    const u = me(req);
    const [v] = await db.select().from(vehicles).where(and(eq(vehicles.id, id), eq(vehicles.orgId, u.orgId), eq(vehicles.partnerId, u.sub)));
    if (!v) throw notFound('Truck not found');
    if (v.status !== 'IDLE') throw badRequest(`${v.regNo} is ${v.status === 'ON_TRIP' ? 'on a trip' : 'in maintenance'} right now`);
    const c = findCity(b.city)!;
    const [row] = await db.update(vehicles).set({ city: c.name, lat: c.lat, lng: c.lng }).where(eq(vehicles.id, id)).returning();
    app.bus.emit(u.orgId, 'vehicle.free', { id, regNo: v.regNo, city: c.name, by: 'owner' });
    return ser(row);
  });
}

