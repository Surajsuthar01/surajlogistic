import type { FastifyInstance } from 'fastify';
import {
  canTransition,
  deliveryOtp,
  findCity,
  isVehicleType,
  makeAwb,
  nextStatuses,
  PAYMENT_MODES,
  predictEta,
  quote,
  requireCity,
  rtoRisk,
  SERVICES,
  SHIPMENT_STATUSES,
  shipmentCo2Kg,
  STATUS_LABEL,
  VEHICLE_TYPES,
  type ShipmentStatus,
} from '@suraj/shared';
import { z } from 'zod';
import type { DB } from '../db/client';
import { customers, drivers, organizations, shipmentEvents, shipments, trips, vehicles } from '../db/schema';
import { mockEwayBill, shipmentMessage } from '../integrations';
import { saveDataUrl, signedFileUrl } from '../lib/files';
import { sendMessage } from '../lib/notify';
import { limiter } from '../lib/ratelimit';
import { and, desc, eq, ilike, inArray, or, sql } from '../lib/deps';
import { marketSignals, orgSettings } from '../lib/snapshot';
import { badRequest, forbidden, forDriver, HttpError, me, notFound, requireRole, ser } from '../lib/util';

const cityName = z.string().min(2).refine((c) => !!findCity(c), { message: 'City is not in the serviceable list' });

const QuoteBody = z.object({
  service: z.enum(SERVICES),
  originCity: cityName,
  destCity: cityName,
  weightKg: z.number().positive().max(40000),
  packages: z.number().int().min(1).max(500).default(1),
  lengthCm: z.number().positive().max(1500).optional(),
  widthCm: z.number().positive().max(300).optional(),
  heightCm: z.number().positive().max(300).optional(),
  vehicleType: z.enum(VEHICLE_TYPES).optional(),
  declaredValue: z.number().min(0).max(100_000_000).default(0),
  paymentMode: z.enum(PAYMENT_MODES).default('PREPAID'),
  codAmount: z.number().min(0).max(500000).default(0),
});

const phone10 = z
  .string()
  .transform((p) => p.replace(/\D/g, '').slice(-10))
  .refine((p) => /^[6-9]\d{9}$/.test(p), 'Receiver mobile must be a 10-digit Indian number');

const CreateBody = QuoteBody.extend({
  customerId: z.string().uuid().optional(),
  shipperName: z.string().trim().min(2).max(120).optional(),
  shipperPhone: z.string().max(20).optional(),
  consigneeName: z.string().trim().min(2).max(120),
  consigneePhone: phone10,
  consigneeAddress: z.string().trim().min(5).max(400),
  pickupAddress: z.string().trim().max(300).optional(),
  contents: z.string().trim().max(160).optional(),
  shipperInvoiceNo: z.string().trim().max(40).optional(),
  ewaybillNo: z.string().regex(/^\d{12}$/).optional(),
});

const GROUPS: Record<string, ShipmentStatus[]> = {
  requested: ['REQUESTED'],
  booked: ['BOOKED'],
  moving: ['PICKED_UP', 'IN_TRANSIT', 'AT_HUB', 'OUT_FOR_DELIVERY'],
  action: ['NDR', 'RTO'],
  delivered: ['DELIVERED'],
};

// Public endpoints: per-address limits so tracking numbers cannot be farmed.
const trackLimit = limiter(120, 60_000);
const rescheduleLimit = limiter(5, 60 * 60_000);

const StatusBody = z.object({
  status: z.enum(SHIPMENT_STATUSES),
  note: z.string().max(300).optional(),
  city: z.string().optional(),
  otp: z.string().optional(),
  receiverName: z.string().max(120).optional(),
});

const STAFF = ['admin', 'ops', 'driver', 'customer'] as const;
/** What a driver may record from the road; cancelling and returns are office decisions. */
const DRIVER_STATUSES: ShipmentStatus[] = ['PICKED_UP', 'IN_TRANSIT', 'AT_HUB', 'OUT_FOR_DELIVERY', 'DELIVERED', 'NDR'];

export async function shipmentRoutes(app: FastifyInstance) {
  const { db } = app;

  app.post('/api/quotes', { preHandler: app.authenticate }, async (req) => {
    const b = QuoteBody.parse(req.body);
    const u = me(req);
    const settings = await orgSettings(db, u.orgId);
    const signals = await marketSignals(db, u.orgId, b.service, b.originCity, b.destCity);
    const q = quote({ ...b, origin: b.originCity, destination: b.destCity, dieselPrice: settings.dieselPrice, gst: settings.gst, ...signals });
    const risk = rtoRisk({ paymentMode: b.paymentMode, codAmount: b.codAmount, destination: b.destCity });
    return { quote: q, signals, co2Kg: shipmentCo2Kg(b.service, q.distanceKm, q.chargeableKg, q.vehicleType) , rtoPreview: risk };
  });

  app.post('/api/shipments', { preHandler: [app.authenticate, requireRole('admin', 'ops', 'customer')] }, async (req, reply) => {
    const b = CreateBody.parse(req.body);
    const u = me(req);
    let customerId = b.customerId ?? null;
    if (u.role === 'customer') customerId = u.customerId ?? null;
    let shipperName = b.shipperName;
    let shipperPhone = b.shipperPhone ?? null;
    if (customerId) {
      const [c] = await db.select().from(customers).where(and(eq(customers.id, customerId), eq(customers.orgId, u.orgId)));
      if (!c) throw badRequest('Customer not found');
      shipperName ??= c.name;
      shipperPhone ??= c.phone;
    }
    if (!shipperName) throw badRequest('Shipper name is required');
    const row = await createShipment(db, u.orgId, { ...b, customerId, shipperName, shipperPhone });
    await announceBooking(row);
    reply.status(201);
    return stripOtp(row);
  });

  async function announceBooking(row: ShipmentRow) {
    const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, row.orgId));
    const msg = shipmentMessage(ser(row), `${app.publicUrl}/track/${row.awb}`, org?.name);
    if (msg) await sendMessage(db, row.orgId, row.consigneePhone, msg.template, msg.text, { shipmentId: row.id });
    app.bus.emit(row.orgId, 'shipment.created', { id: row.id, awb: row.awb, service: row.service, originCity: row.originCity, destCity: row.destCity });
  }

  /** Book many at once from a spreadsheet. dryRun prices the rows without booking. */
  app.post('/api/shipments/bulk', { preHandler: [app.authenticate, requireRole('admin', 'ops', 'customer')] }, async (req) => {
    const b = z.object({ dryRun: z.boolean().default(false), customerId: z.string().uuid().optional(), rows: z.array(z.object({ row: z.number().int() }).passthrough()).min(1).max(500) }).parse(req.body);
    const u = me(req);
    const customerId = u.role === 'customer' ? u.customerId : b.customerId;
    if (!customerId) throw badRequest('Choose the shipper for these rows');
    const [c] = await db.select().from(customers).where(and(eq(customers.id, customerId), eq(customers.orgId, u.orgId)));
    if (!c) throw badRequest('Customer not found');
    const settings = await orgSettings(db, u.orgId);
    const results: { row: number; ok: boolean; error?: string; price?: number; id?: string; awb?: string }[] = [];
    for (const r of b.rows) {
      const parsed = CreateBody.safeParse(r);
      if (!parsed.success) {
        results.push({ row: r.row, ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.') || 'row'}: ${i.message}`).join('; ') });
        continue;
      }
      const x = parsed.data;
      if (b.dryRun) {
        const signals = await marketSignals(db, u.orgId, x.service, x.originCity, x.destCity);
        const q = quote({ ...x, origin: x.originCity, destination: x.destCity, dieselPrice: settings.dieselPrice, gst: settings.gst, ...signals });
        results.push({ row: r.row, ok: true, price: q.total });
        continue;
      }
      const row = await createShipment(db, u.orgId, { ...x, customerId: c.id, shipperName: c.name, shipperPhone: c.phone });
      await announceBooking(row);
      results.push({ row: r.row, ok: true, price: row.price, id: row.id, awb: row.awb });
    }
    return { results };
  });

  app.get('/api/shipments', { preHandler: [app.authenticate, requireRole('admin', 'ops', 'customer')] }, async (req) => {
    const q = z
      .object({
        status: z.string().optional(),
        service: z.enum(SERVICES).optional(),
        q: z.string().max(60).optional(),
        tripId: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(500).default(100),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(req.query);
    const u = me(req);
    const where = [eq(shipments.orgId, u.orgId)];
    if (u.role === 'customer') where.push(eq(shipments.customerId, u.customerId ?? '00000000-0000-0000-0000-000000000000'));
    const statusClause: unknown[] = [];
    if (q.status) {
      const list = q.status.split(',').filter((s): s is ShipmentStatus => (SHIPMENT_STATUSES as readonly string[]).includes(s));
      if (list.length) {
        const c = inArray(shipments.status, list);
        statusClause.push(c);
        where.push(c);
      }
    }
    if (q.service) where.push(eq(shipments.service, q.service));
    if (q.tripId) where.push(eq(shipments.tripId, q.tripId));
    if (q.q) {
      const like = `%${q.q}%`;
      where.push(or(ilike(shipments.awb, like), ilike(shipments.consigneeName, like), ilike(shipments.shipperName, like), ilike(shipments.destCity, like), ilike(shipments.originCity, like))!);
    }
    // Counts per tab use the same filters except status.
    const base = where.filter((w) => !statusClause.includes(w));
    const [cnt] = await db
      .select({
        all: sql<number>`count(*)::int`,
        requested: sql<number>`count(*) filter (where ${inArray(shipments.status, GROUPS.requested!)})::int`,
        booked: sql<number>`count(*) filter (where ${inArray(shipments.status, GROUPS.booked!)})::int`,
        moving: sql<number>`count(*) filter (where ${inArray(shipments.status, GROUPS.moving!)})::int`,
        action: sql<number>`count(*) filter (where ${inArray(shipments.status, GROUPS.action!)})::int`,
        delivered: sql<number>`count(*) filter (where ${inArray(shipments.status, GROUPS.delivered!)})::int`,
      })
      .from(shipments)
      .where(and(...base));
    const rows = await db.select().from(shipments).where(and(...where)).orderBy(desc(shipments.createdAt)).limit(q.limit).offset(q.offset);
    const [{ count }] = (await db.select({ count: sql<number>`count(*)::int` }).from(shipments).where(and(...where))) as [{ count: number }];
    return { items: rows.map((r) => stripOtp(r)), total: count, counts: cnt };
  });

  app.get('/api/shipments/:id', { preHandler: [app.authenticate, requireRole('admin', 'ops', 'customer', 'driver')] }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const u = me(req);
    const s = await getShipment(db, u.orgId, id);
    if (u.role === 'customer' && s.customerId !== u.customerId) throw notFound('Shipment not found');
    if (u.role === 'driver') await assertDriverOwnsTrip(db, u.orgId, s.tripId, u.sub);
    const events = await db.select().from(shipmentEvents).where(eq(shipmentEvents.shipmentId, id)).orderBy(shipmentEvents.at);
    const trip = s.tripId ? (await db.select({ t: trips, regNo: vehicles.regNo }).from(trips).innerJoin(vehicles, eq(vehicles.id, trips.vehicleId)).where(and(eq(trips.id, s.tripId), eq(trips.orgId, u.orgId))))[0] : undefined;
    const driver = u.role === 'driver';
    // Customers see their own booking but not what the truck costs us.
    const tripOut = trip ? (u.role === 'admin' || u.role === 'ops' ? { ...ser(trip.t), regNo: trip.regNo } : forDriver({ ...ser(trip.t), regNo: trip.regNo, fuelCost: undefined, tollCost: undefined, otherCost: undefined, driverAdvance: undefined })) : null;
    const out = {
      ...stripOtp(s, u.role === 'admin' || u.role === 'ops'),
      podPhotoUrl: signedFileUrl(app.fileSecret, s.podPhotoUrl),
      podSignatureUrl: signedFileUrl(app.fileSecret, s.podSignatureUrl),
      events: ser(events),
      trip: tripOut,
      nextStatuses: nextStatuses(s.service as any, s.status as ShipmentStatus),
    };
    return driver ? forDriver(out) : out;
  });

  app.post('/api/shipments/:id/status', { preHandler: [app.authenticate, requireRole(...STAFF)] }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const b = StatusBody.parse(req.body);
    const u = me(req);
    const s = await getShipment(db, u.orgId, id);
    if (u.role === 'customer' && (s.customerId !== u.customerId || b.status !== 'CANCELLED' || s.status !== 'BOOKED')) throw forbidden('You can cancel your own booking before pickup; for anything else, call us');
    if (s.status === 'REQUESTED' && !['admin', 'ops'].includes(u.role)) throw forbidden('Only the office can confirm a website booking');
    if (s.status === 'REQUESTED' && b.status === 'CANCELLED' && !b.note?.trim()) throw badRequest('Say why you cannot take this booking; we send it to the sender');
    if (u.role === 'driver') {
      await assertDriverOwnsTrip(db, u.orgId, s.tripId, u.sub);
      if (!DRIVER_STATUSES.includes(b.status)) throw forbidden('Only the office can cancel or return a shipment. Call your dispatcher.');
    }
    if (!canTransition(s.service as any, s.status as ShipmentStatus, b.status)) {
      throw badRequest(`Cannot move from "${STATUS_LABEL[s.status as ShipmentStatus]}" to "${STATUS_LABEL[b.status]}" for ${s.service}`);
    }
    if (b.status === 'DELIVERED' && b.otp !== s.deliveryOtp) {
      // Admins may override (e.g. receiver lost their phone); everyone else needs the OTP.
      if (!(u.role === 'admin' && b.otp === 'OVERRIDE')) throw badRequest('The OTP does not match. Ask the receiver to read it again from the SMS or WhatsApp.');
    }
    const confirming = s.status === 'REQUESTED' && b.status === 'BOOKED';
    const declining = s.status === 'REQUESTED' && b.status === 'CANCELLED';
    const updated = await applyStatus(db, s, b.status, { note: b.note ?? (confirming ? 'Confirmed by our team; pickup being arranged' : undefined), city: b.city, receiverName: b.receiverName });
    if (confirming || declining) {
      const [org] = await db.select({ name: organizations.name, settings: organizations.settings }).from(organizations).where(eq(organizations.id, u.orgId));
      const company = org?.name ?? 'SurajLogistic';
      if (s.shipperPhone) {
        const text = confirming
          ? `Your booking ${s.awb} with ${company} is confirmed. We will pick up from ${s.pickupAddress ?? s.originCity}. Track it: ${app.publicUrl}/track/${s.awb}`
          : `Sorry, ${company} could not take booking ${s.awb}: ${b.note}.${org?.settings.profile?.phone ? ` Call ${org.settings.profile.phone} for help.` : ''}`;
        await sendMessage(db, u.orgId, s.shipperPhone, confirming ? 'booking_accepted' : 'booking_declined', text, { shipmentId: s.id });
      }
      if (confirming) await announceBooking(updated);
      app.bus.emit(u.orgId, 'shipment.status', { id: updated.id, awb: updated.awb, status: updated.status, city: null });
      return stripOtp(updated);
    }
    if (['OUT_FOR_DELIVERY', 'NDR', 'DELIVERED'].includes(updated.status)) {
      const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, u.orgId));
      const msg = shipmentMessage(ser(updated), `${app.publicUrl}/track/${updated.awb}`, org?.name);
      if (msg) await sendMessage(db, u.orgId, updated.consigneePhone, msg.template, msg.text, { shipmentId: updated.id });
    }
    app.bus.emit(u.orgId, 'shipment.status', { id: updated.id, awb: updated.awb, status: updated.status, city: b.city ?? null });
    return stripOtp(updated);
  });

  /** Photo and signature taken at the door, after the OTP-verified delivery. */
  app.post('/api/shipments/:id/pod', { preHandler: [app.authenticate, requireRole('admin', 'ops', 'driver')] }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const b = z.object({ photo: z.string().max(2_200_000).optional(), signature: z.string().max(600_000).optional() }).parse(req.body);
    if (!b.photo && !b.signature) throw badRequest('Send a photo, a signature or both');
    const u = me(req);
    const s = await getShipment(db, u.orgId, id);
    if (u.role === 'driver') await assertDriverOwnsTrip(db, u.orgId, s.tripId, u.sub);
    if (s.status !== 'DELIVERED') throw badRequest('Record the delivery with the OTP first');
    const patch: Partial<typeof shipments.$inferInsert> = { updatedAt: new Date() };
    if (b.photo) patch.podPhotoUrl = await saveDataUrl(db, u.orgId, 'pod_photo', b.photo, u.sub.startsWith('apikey:') ? null : u.sub);
    if (b.signature) patch.podSignatureUrl = await saveDataUrl(db, u.orgId, 'pod_signature', b.signature, u.sub.startsWith('apikey:') ? null : u.sub);
    const [row] = await db.update(shipments).set(patch).where(eq(shipments.id, id)).returning();
    return { ok: true, podPhotoUrl: signedFileUrl(app.fileSecret, row!.podPhotoUrl), podSignatureUrl: signedFileUrl(app.fileSecret, row!.podSignatureUrl) };
  });

  app.post('/api/shipments/:id/ewaybill', { preHandler: [app.authenticate, requireRole('admin', 'ops')] }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const u = me(req);
    const s = await getShipment(db, u.orgId, id);
    if (s.ewaybillNo) return { ewbNo: s.ewaybillNo, alreadyGenerated: true, validUntil: new Date(s.createdAt.getTime() + Math.max(1, Math.ceil(s.distanceKm / 200)) * 86400_000).toISOString() };
    const ewb = await mockEwayBill.generate(s);
    await db.update(shipments).set({ ewaybillNo: ewb.ewbNo, updatedAt: new Date() }).where(eq(shipments.id, id));
    return { ...ewb, required: s.ewaybillRequired };
  });

  // Public tracking: no login, no personal data.
  app.get('/api/track/:awb', async (req) => {
    if (!trackLimit.hit(req.ip)) throw new HttpError(429, 'Too many lookups. Wait a minute and try again.', 'rate_limited');
    const { awb } = z.object({ awb: z.string().min(5).max(20) }).parse(req.params);
    const [s] = await db.select().from(shipments).where(eq(shipments.awb, awb.toUpperCase()));
    if (!s) throw notFound('No shipment with this tracking number');
    const [org] = await db.select({ name: organizations.name, settings: organizations.settings }).from(organizations).where(eq(organizations.id, s.orgId));
    const events = await db.select().from(shipmentEvents).where(eq(shipmentEvents.shipmentId, s.id)).orderBy(desc(shipmentEvents.at));
    return {
      awb: s.awb,
      service: s.service,
      status: s.status,
      statusLabel: STATUS_LABEL[s.status as ShipmentStatus],
      originCity: s.originCity,
      destCity: s.destCity,
      origin: { lat: s.originLat, lng: s.originLng },
      destination: { lat: s.destLat, lng: s.destLng },
      current: { lat: s.currentLat, lng: s.currentLng },
      weightKg: s.weightKg,
      packages: s.packages,
      etaAt: s.etaAt.toISOString(),
      promisedAt: s.promisedAt.toISOString(),
      deliveredAt: s.deliveredAt?.toISOString() ?? null,
      receivedBy: s.podReceiver ? s.podReceiver.replace(/^(.).*?(\s.*)?$/, (_m, a, rest) => `${a}***${rest ?? ''}`) : null,
      co2Kg: s.co2Kg,
      carrier: { name: org?.name ?? 'SurajLogistic', phone: org?.settings.profile?.phone || null },
      canReschedule: ['NDR', 'OUT_FOR_DELIVERY'].includes(s.status),
      events: events.map((e) => ({ status: e.status, label: STATUS_LABEL[e.status as ShipmentStatus], note: e.note, city: e.city, at: e.at.toISOString() })),
    };
  });

  /** The receiver picks another day. They prove it is them with the last 4 digits of their mobile. */
  app.post('/api/track/:awb/reschedule', async (req) => {
    const { awb } = z.object({ awb: z.string().min(5).max(20) }).parse(req.params);
    const key = `${req.ip}|${awb.toUpperCase()}`;
    if (!rescheduleLimit.hit(key)) throw new HttpError(429, 'Too many tries. Call us to reschedule.', 'rate_limited');
    const b = z.object({ phoneLast4: z.string().regex(/^\d{4}$/), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), address: z.string().trim().max(160).optional() }).parse(req.body);
    const [s] = await db.select().from(shipments).where(eq(shipments.awb, awb.toUpperCase()));
    if (!s) throw notFound('No shipment with this tracking number');
    if (!['NDR', 'OUT_FOR_DELIVERY'].includes(s.status)) throw badRequest('This shipment cannot be rescheduled now');
    if (b.phoneLast4 !== s.consigneePhone.slice(-4)) throw badRequest('Those digits do not match the mobile number on the booking');
    const day = new Date(`${b.date}T00:00:00+05:30`);
    const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00+05:30');
    if (day.getTime() <= today.getTime() - 86400_000 || day.getTime() > today.getTime() + 14 * 86400_000) throw badRequest('Pick a day in the next two weeks');
    const label = day.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' });
    await db.insert(shipmentEvents).values({ orgId: s.orgId, shipmentId: s.id, status: s.status, note: `Receiver asked for delivery on ${label}${b.address ? ' and added a note for the driver' : ''}`, city: s.destCity, at: new Date() });
    if (b.address) await db.update(shipments).set({ consigneeAddress: `${s.consigneeAddress} (${b.address})`.slice(0, 600), updatedAt: new Date() }).where(eq(shipments.id, s.id));
    rescheduleLimit.reset(key);
    app.bus.emit(s.orgId, 'shipment.status', { id: s.id, awb: s.awb, status: s.status, rescheduledFor: b.date });
    return { ok: true };
  });
}

type ShipmentRow = typeof shipments.$inferSelect;

/** Drivers may only touch shipments on a trip assigned to them. */
export async function assertDriverOwnsTrip(db: DB, orgId: string, tripId: string | null, userId: string) {
  if (!tripId) throw forbidden('This shipment is not on your trip');
  const rows = await db
    .select({ id: trips.id })
    .from(trips)
    .innerJoin(drivers, eq(drivers.id, trips.driverId))
    .where(and(eq(trips.id, tripId), eq(trips.orgId, orgId), eq(drivers.userId, userId)));
  if (!rows.length) throw forbidden('This shipment is not on your trip');
}

function stripOtp(s: ShipmentRow, keep = false) {
  const out = ser(s);
  if (!keep) delete out.deliveryOtp;
  return out;
}

export async function getShipment(db: DB, orgId: string, id: string): Promise<ShipmentRow> {
  const [s] = await db.select().from(shipments).where(and(eq(shipments.id, id), eq(shipments.orgId, orgId)));
  if (!s) throw notFound('Shipment not found');
  return s;
}

interface CreateInput extends z.infer<typeof QuoteBody> {
  customerId: string | null;
  shipperName: string;
  shipperPhone: string | null;
  consigneeName: string;
  consigneePhone: string;
  consigneeAddress: string;
  pickupAddress?: string;
  contents?: string;
  shipperInvoiceNo?: string;
  ewaybillNo?: string;
  tripId?: string | null;
  /** Website bookings start as REQUESTED until the office confirms them. */
  status?: 'BOOKED' | 'REQUESTED';
  note?: string;
}

export async function createShipment(db: DB, orgId: string, b: CreateInput): Promise<ShipmentRow> {
  const settings = await orgSettings(db, orgId);
  const signals = await marketSignals(db, orgId, b.service, b.originCity, b.destCity);
  const from = requireCity(b.originCity);
  const to = requireCity(b.destCity);
  const q = quote({ ...b, origin: b.originCity, destination: b.destCity, dieselPrice: settings.dieselPrice, gst: settings.gst, ...signals });
  // Delivery history for this phone number feeds the RTO model.
  const hist = (await db
    .select({
      delivered: sql<number>`count(*) filter (where ${shipments.status} = 'DELIVERED')::int`,
      returned: sql<number>`count(*) filter (where ${shipments.status} in ('RTO','RTO_DELIVERED'))::int`,
    })
    .from(shipments)
    .where(and(eq(shipments.orgId, orgId), eq(shipments.consigneePhone, b.consigneePhone)))) as [{ delivered: number; returned: number }];
  const risk = rtoRisk({ paymentMode: b.paymentMode, codAmount: b.codAmount, consigneePhone: b.consigneePhone, address: b.consigneeAddress, destination: b.destCity, history: hist[0], orderHour: new Date().getHours() });
  const eta = predictEta({ service: b.service, distanceKm: q.distanceKm, vehicleType: q.vehicleType, destination: to });
  const vehicleType = q.vehicleType ?? (b.vehicleType && isVehicleType(b.vehicleType) ? b.vehicleType : null);

  let awb = makeAwb();
  for (let i = 0; i < 3; i++) {
    const clash = await db.select({ id: shipments.id }).from(shipments).where(eq(shipments.awb, awb));
    if (!clash.length) break;
    awb = makeAwb();
  }
  const now = new Date();
  const [row] = await db
    .insert(shipments)
    .values({
      orgId,
      awb,
      service: b.service,
      status: b.status ?? 'BOOKED',
      customerId: b.customerId,
      shipperName: b.shipperName,
      shipperPhone: b.shipperPhone,
      consigneeName: b.consigneeName,
      consigneePhone: b.consigneePhone,
      consigneeAddress: b.consigneeAddress,
      pickupAddress: b.pickupAddress || null,
      contents: b.contents || null,
      shipperInvoiceNo: b.shipperInvoiceNo || null,
      originCity: from.name,
      originLat: from.lat,
      originLng: from.lng,
      destCity: to.name,
      destLat: to.lat,
      destLng: to.lng,
      weightKg: b.weightKg,
      packages: b.packages,
      declaredValue: b.declaredValue,
      paymentMode: b.paymentMode,
      codAmount: b.paymentMode === 'COD' ? b.codAmount : 0,
      price: q.total,
      priceBreakup: q.lines,
      gstRate: q.gstRate,
      distanceKm: q.distanceKm,
      co2Kg: shipmentCo2Kg(b.service, q.distanceKm, q.chargeableKg, vehicleType ?? undefined),
      rtoScore: risk.score,
      rtoLevel: risk.level,
      ewaybillRequired: b.declaredValue > 50000,
      ewaybillNo: b.ewaybillNo ?? null,
      vehicleType,
      tripId: b.tripId ?? null,
      deliveryOtp: deliveryOtp(),
      currentLat: from.lat,
      currentLng: from.lng,
      promisedAt: new Date(eta.arriveAt),
      etaAt: new Date(eta.arriveAt),
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  await db.insert(shipmentEvents).values({ orgId, shipmentId: row!.id, status: b.status ?? 'BOOKED', note: b.note ?? `Booked at ₹${q.total.toLocaleString('en-IN')}; RTO risk ${risk.score}/100`, city: from.name, lat: from.lat, lng: from.lng, at: now });
  return row!;
}

export async function applyStatus(
  db: DB,
  s: ShipmentRow,
  status: ShipmentStatus,
  extra: { note?: string; city?: string; receiverName?: string } = {},
): Promise<ShipmentRow> {
  const now = new Date();
  let pos = { lat: s.currentLat, lng: s.currentLng };
  let city = extra.city ? findCity(extra.city)?.name : undefined;
  if (extra.city && findCity(extra.city)) pos = findCity(extra.city)!;
  else if (['OUT_FOR_DELIVERY', 'DELIVERED', 'NDR'].includes(status)) {
    pos = { lat: s.destLat, lng: s.destLng };
    city = s.destCity;
  } else if (status === 'RTO_DELIVERED' || status === 'PICKED_UP') {
    pos = { lat: s.originLat, lng: s.originLng };
    city = s.originCity;
  }
  const patch: Partial<typeof shipments.$inferInsert> = { status, currentLat: pos.lat, currentLng: pos.lng, updatedAt: now };
  if (status === 'NDR') patch.attempts = s.attempts + 1;
  if (status === 'DELIVERED') {
    patch.deliveredAt = now;
    patch.podReceiver = extra.receiverName ?? s.consigneeName;
    patch.attempts = s.attempts + 1;
    if (s.paymentMode === 'COD') patch.codCollected = true;
  }
  const [row] = await db.update(shipments).set(patch).where(eq(shipments.id, s.id)).returning();
  await db.insert(shipmentEvents).values({ orgId: s.orgId, shipmentId: s.id, status, note: extra.note ?? defaultNote(status), city: city ?? null, lat: pos.lat, lng: pos.lng, at: now });
  return row!;
}

function defaultNote(s: ShipmentStatus): string {
  switch (s) {
    case 'PICKED_UP':
      return 'Picked up from shipper';
    case 'IN_TRANSIT':
      return 'In transit';
    case 'AT_HUB':
      return 'Arrived at hub';
    case 'OUT_FOR_DELIVERY':
      return 'Out for delivery';
    case 'DELIVERED':
      return 'Delivered, OTP verified';
    case 'NDR':
      return 'Delivery attempt failed';
    case 'RTO':
      return 'Returning to shipper';
    case 'RTO_DELIVERED':
      return 'Returned to shipper';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return STATUS_LABEL[s];
  }
}
