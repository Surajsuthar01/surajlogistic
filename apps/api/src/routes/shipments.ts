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
} from '@suraj/core';
import { z } from 'zod';
import type { DB } from '../db/client';
import { customers, drivers, shipmentEvents, shipments, trips } from '../db/schema';
import { mockEwayBill, notify, shipmentMessage } from '../integrations';
import { and, desc, eq, ilike, inArray, or, sql } from '../lib/deps';
import { marketSignals, orgSettings } from '../lib/snapshot';
import { badRequest, forbidden, me, notFound, requireRole, ser } from '../lib/util';

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

const CreateBody = QuoteBody.extend({
  customerId: z.string().uuid().optional(),
  shipperName: z.string().min(2).max(120).optional(),
  shipperPhone: z.string().max(20).optional(),
  consigneeName: z.string().min(2).max(120),
  consigneePhone: z.string().min(6).max(20),
  consigneeAddress: z.string().min(5).max(400),
  ewaybillNo: z.string().regex(/^\d{12}$/).optional(),
});

const StatusBody = z.object({
  status: z.enum(SHIPMENT_STATUSES),
  note: z.string().max(300).optional(),
  city: z.string().optional(),
  otp: z.string().optional(),
  receiverName: z.string().max(120).optional(),
  podPhotoUrl: z.string().max(2_000_000).optional(),
});

const STAFF = ['admin', 'ops', 'driver'] as const;

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
    const msg = shipmentMessage(ser(row), `${app.publicUrl}/track/${row.awb}`);
    if (msg) notify(u.orgId, row.consigneePhone, msg.template, msg.text);
    app.bus.emit(u.orgId, 'shipment.created', { id: row.id, awb: row.awb, service: row.service, originCity: row.originCity, destCity: row.destCity });
    reply.status(201);
    return stripOtp(row);
  });

  app.get('/api/shipments', { preHandler: app.authenticate }, async (req) => {
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
    if (q.status) {
      const list = q.status.split(',').filter((s): s is ShipmentStatus => (SHIPMENT_STATUSES as readonly string[]).includes(s));
      if (list.length) where.push(inArray(shipments.status, list));
    }
    if (q.service) where.push(eq(shipments.service, q.service));
    if (q.tripId) where.push(eq(shipments.tripId, q.tripId));
    if (q.q) {
      const like = `%${q.q}%`;
      where.push(or(ilike(shipments.awb, like), ilike(shipments.consigneeName, like), ilike(shipments.shipperName, like), ilike(shipments.destCity, like), ilike(shipments.originCity, like))!);
    }
    const rows = await db.select().from(shipments).where(and(...where)).orderBy(desc(shipments.createdAt)).limit(q.limit).offset(q.offset);
    const [{ count }] = (await db.select({ count: sql<number>`count(*)::int` }).from(shipments).where(and(...where))) as [{ count: number }];
    return { items: rows.map((r) => stripOtp(r)), total: count };
  });

  app.get('/api/shipments/:id', { preHandler: app.authenticate }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const u = me(req);
    const s = await getShipment(db, u.orgId, id);
    if (u.role === 'customer' && s.customerId !== u.customerId) throw notFound('Shipment not found');
    const events = await db.select().from(shipmentEvents).where(eq(shipmentEvents.shipmentId, id)).orderBy(shipmentEvents.at);
    const trip = s.tripId ? (await db.select().from(trips).where(and(eq(trips.id, s.tripId), eq(trips.orgId, u.orgId))))[0] : undefined;
    return { ...stripOtp(s, u.role === 'admin' || u.role === 'ops'), events: ser(events), trip: trip ? ser(trip) : null, nextStatuses: nextStatuses(s.service as any, s.status as ShipmentStatus) };
  });

  app.post('/api/shipments/:id/status', { preHandler: [app.authenticate, requireRole(...STAFF)] }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const b = StatusBody.parse(req.body);
    const u = me(req);
    const s = await getShipment(db, u.orgId, id);
    if (!canTransition(s.service as any, s.status as ShipmentStatus, b.status)) {
      throw badRequest(`Cannot move from "${STATUS_LABEL[s.status as ShipmentStatus]}" to "${STATUS_LABEL[b.status]}" for ${s.service}`);
    }
    if (b.status === 'DELIVERED' && b.otp !== s.deliveryOtp) {
      // Admins may override (e.g. receiver lost their phone); everyone else needs the OTP.
      if (!(u.role === 'admin' && b.otp === 'OVERRIDE')) throw badRequest('Delivery OTP does not match');
    }
    if (u.role === 'driver') await assertDriverOwnsTrip(db, u.orgId, s.tripId, u.sub);
    const updated = await applyStatus(db, s, b.status, { note: b.note, city: b.city, receiverName: b.receiverName, podPhotoUrl: b.podPhotoUrl });
    const msg = shipmentMessage(ser(updated), `${app.publicUrl}/track/${updated.awb}`);
    if (msg && ['OUT_FOR_DELIVERY', 'NDR', 'DELIVERED'].includes(updated.status)) notify(u.orgId, updated.consigneePhone, msg.template, msg.text);
    app.bus.emit(u.orgId, 'shipment.status', { id: updated.id, awb: updated.awb, status: updated.status, city: b.city ?? null });
    return stripOtp(updated);
  });

  app.post('/api/shipments/:id/ewaybill', { preHandler: [app.authenticate, requireRole('admin', 'ops')] }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const u = me(req);
    const s = await getShipment(db, u.orgId, id);
    if (s.ewaybillNo) return { ewbNo: s.ewaybillNo, alreadyGenerated: true };
    const ewb = await mockEwayBill.generate(s);
    await db.update(shipments).set({ ewaybillNo: ewb.ewbNo, updatedAt: new Date() }).where(eq(shipments.id, id));
    return { ...ewb, required: s.ewaybillRequired };
  });

  // Public tracking: no login, no personal data.
  app.get('/api/track/:awb', async (req) => {
    const { awb } = z.object({ awb: z.string().min(5).max(20) }).parse(req.params);
    const [s] = await db.select().from(shipments).where(eq(shipments.awb, awb.toUpperCase()));
    if (!s) throw notFound('No shipment with this tracking number');
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
      events: events.map((e) => ({ status: e.status, label: STATUS_LABEL[e.status as ShipmentStatus], note: e.note, city: e.city, at: e.at.toISOString() })),
    };
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
  ewaybillNo?: string;
  tripId?: string | null;
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
      status: 'BOOKED',
      customerId: b.customerId,
      shipperName: b.shipperName,
      shipperPhone: b.shipperPhone,
      consigneeName: b.consigneeName,
      consigneePhone: b.consigneePhone,
      consigneeAddress: b.consigneeAddress,
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
  await db.insert(shipmentEvents).values({ orgId, shipmentId: row!.id, status: 'BOOKED', note: `Booked at ₹${q.total.toLocaleString('en-IN')}; RTO risk ${risk.score}/100`, city: from.name, lat: from.lat, lng: from.lng, at: now });
  return row!;
}

export async function applyStatus(
  db: DB,
  s: ShipmentRow,
  status: ShipmentStatus,
  extra: { note?: string; city?: string; receiverName?: string; podPhotoUrl?: string } = {},
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
    patch.podPhotoUrl = extra.podPhotoUrl ?? null;
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
