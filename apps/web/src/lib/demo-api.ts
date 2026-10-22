// In-browser stand-in for the API, used by the demo build. Same routes, same shapes,
// same @suraj/core engines — data lives in memory and resets on reload.
import {
  answerQuery,
  buildDemoData,
  canTransition,
  CITIES,
  computeDashboard,
  COPILOT_SUGGESTIONS,
  daysUntil,
  deliveryOtp,
  DEMO_PASSWORD,
  docAlerts,
  findCity,
  findReturnLoads,
  haversineKm,
  invoiceNumber,
  laneDemand,
  lerpPoint,
  liveEta,
  makeAwb,
  nearestCity,
  nextStatuses,
  optimizeRoute,
  parseQuery,
  predictEta,
  quote,
  requireCity,
  returnLoadScore,
  roadKm,
  rtoRisk,
  SHIPMENT_STATUSES,
  shipmentCo2Kg,
  shortCode,
  STATUS_LABEL,
  suggestTrucks,
  tripPnl,
  VEHICLE_CLASSES,
  type DemoDataset,
  type MatchLoad,
  type Service,
  type ShipmentRec,
  type ShipmentStatus,
  type TripRec,
  type UserRec,
} from '@suraj/core';
import type { LiveEvent } from './api';
import { ApiError } from './errors';

class DemoError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

let data: DemoDataset | null = null;
const outbox: { id: string; to: string; template: string; text: string; at: string; channel: 'whatsapp' }[] = [];
const listeners = new Set<(e: LiveEvent) => void>();
let simTimer: ReturnType<typeof setInterval> | null = null;

function db(): DemoDataset {
  if (!data) {
    data = buildDemoData(new Date());
    startSim();
  }
  return data;
}

const uid = () => (typeof globalThis.crypto?.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const now = () => new Date().toISOString();
const emit = (type: string, payload: Record<string, unknown>) => listeners.forEach((l) => l({ type, payload, at: now() }));
const notify = (to: string, template: string, text: string) => {
  outbox.unshift({ id: uid(), to, template, text, at: now(), channel: 'whatsapp' });
  if (outbox.length > 100) outbox.length = 100;
};

function startSim() {
  if (simTimer || typeof window === 'undefined') return;
  simTimer = setInterval(() => {
    const d = data!;
    for (const t of d.trips) {
      if (t.status !== 'IN_TRANSIT' || t.progress >= 0.97) continue;
      const v = d.vehicles.find((x) => x.id === t.vehicleId)!;
      const speed = VEHICLE_CLASSES[v.type].avgKmph * (0.75 + Math.random() * 0.5);
      const step = speed / 6 / Math.max(1, t.plannedKm);
      t.progress = Math.min(0.97, t.progress + step);
      const p = lerpPoint({ lat: t.originLat, lng: t.originLng }, { lat: t.destLat, lng: t.destLng }, t.progress);
      t.currentLat = p.lat;
      t.currentLng = p.lng;
      t.etaAt = liveEta(p, { lat: t.destLat, lng: t.destLng }, v.type).arriveAt;
      v.lat = p.lat;
      v.lng = p.lng;
      v.city = nearestCity(p).name;
      v.lastPingAt = now();
      for (const s of d.shipments) if (s.tripId === t.id && s.status === 'IN_TRANSIT') Object.assign(s, { currentLat: p.lat, currentLng: p.lng, etaAt: t.etaAt });
      emit('trip.ping', { id: t.id, tripNo: t.tripNo, vehicleId: v.id, lat: p.lat, lng: p.lng, speedKmph: Math.round(speed), progress: t.progress, etaAt: t.etaAt });
    }
  }, 4000);
}

export function demoSubscribe(fn: (e: LiveEvent) => void) {
  db();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function userFrom(token: string | null): UserRec {
  const u = db().users.find((x) => x.email === token);
  if (!u) throw new DemoError(401, 'Please log in again');
  return u;
}

const strip = (s: ShipmentRec, keep = false) => {
  const { deliveryOtp: otp, ...rest } = s;
  return keep ? { ...rest, deliveryOtp: otp } : rest;
};
const staff = (u: UserRec) => {
  if (u.role !== 'admin' && u.role !== 'ops') throw new DemoError(403, 'You do not have access to this');
};
const city = (name: string) => {
  const c = findCity(name);
  if (!c) throw new DemoError(400, `City "${name}" is not in the serviceable list`);
  return c;
};
const asMatch = (l: DemoDataset['loads'][number]): MatchLoad => ({ id: l.id, origin: { lat: l.originLat, lng: l.originLng, city: l.originCity }, destination: { lat: l.destLat, lng: l.destLng, city: l.destCity }, weightKg: l.weightKg, vehicleType: l.vehicleType, pickupDate: l.pickupDate, targetPrice: l.targetPrice });

function signals(service: Service, origin: string, destination: string) {
  if (service !== 'FTL') return { laneDemand: 1, returnLoadScore: 0 };
  const d = db();
  const a = requireCity(origin);
  const b = requireCity(destination);
  const open = d.loads.filter((l) => l.status === 'OPEN');
  const near = (p: { lat: number; lng: number }, c: { lat: number; lng: number }) => haversineKm(p, c) <= 150;
  return {
    laneDemand: laneDemand(open.filter((l) => near({ lat: l.originLat, lng: l.originLng }, a)).length, d.vehicles.filter((v) => v.status === 'IDLE' && near(v, a)).length),
    returnLoadScore: returnLoadScore(open.filter((l) => near({ lat: l.originLat, lng: l.originLng }, b)).length),
  };
}

function applyStatus(s: ShipmentRec, status: ShipmentStatus, extra: { note?: string; city?: string; receiverName?: string } = {}) {
  const d = db();
  let pos = { lat: s.currentLat, lng: s.currentLng };
  let cityName = extra.city ? findCity(extra.city)?.name : undefined;
  if (extra.city && findCity(extra.city)) pos = findCity(extra.city)!;
  else if (['OUT_FOR_DELIVERY', 'DELIVERED', 'NDR'].includes(status)) {
    pos = { lat: s.destLat, lng: s.destLng };
    cityName = s.destCity;
  } else if (status === 'RTO_DELIVERED' || status === 'PICKED_UP') {
    pos = { lat: s.originLat, lng: s.originLng };
    cityName = s.originCity;
  }
  Object.assign(s, { status, currentLat: pos.lat, currentLng: pos.lng, updatedAt: now() });
  if (status === 'NDR') s.attempts += 1;
  if (status === 'DELIVERED') {
    Object.assign(s, { deliveredAt: now(), podReceiver: extra.receiverName ?? s.consigneeName, attempts: s.attempts + 1, codCollected: s.paymentMode === 'COD' });
  }
  d.events.push({ id: uid(), orgId: s.orgId, shipmentId: s.id, status, note: extra.note ?? STATUS_LABEL[status], city: cityName ?? null, lat: pos.lat, lng: pos.lng, at: now() });
  emit('shipment.status', { id: s.id, awb: s.awb, status });
  return s;
}

type Handler = (m: RegExpMatchArray, body: any, q: URLSearchParams, token: string | null) => unknown;
const routes: [string, RegExp, Handler][] = [];
const on = (method: string, pattern: string, h: Handler) => routes.push([method, new RegExp(`^${pattern.replace(/:(\w+)/g, '([^/]+)')}$`), h]);

on('POST', '/api/auth/login', (_m, b) => {
  const u = db().users.find((x) => x.email === String(b.email ?? '').toLowerCase());
  if (!u || b.password !== DEMO_PASSWORD) throw new DemoError(401, 'Wrong email or password');
  return { token: u.email, user: u, org: db().org };
});
on('GET', '/api/me', (_m, _b, _q, t) => ({ user: userFrom(t), org: db().org }));
on('GET', '/api/meta', () => ({ cities: CITIES, vehicleClasses: Object.values(VEHICLE_CLASSES), statuses: SHIPMENT_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })), copilotSuggestions: COPILOT_SUGGESTIONS }));
on('PATCH', '/api/org/settings', (_m, b, _q, t) => {
  if (userFrom(t).role !== 'admin') throw new DemoError(403, 'Only an admin can change settings');
  const o = db().org;
  if (b.dieselPrice) o.settings.dieselPrice = b.dieselPrice;
  o.settings.gst = { courier: b.gstCourier ?? o.settings.gst.courier, transport: b.gstTransport ?? o.settings.gst.transport };
  if (b.modules) o.modules = b.modules;
  return o;
});

on('GET', '/api/dashboard', (_m, _b, _q, t) => {
  staff(userFrom(t));
  return computeDashboard(db());
});
on('POST', '/api/copilot', (_m, b, _q, t) => {
  staff(userFrom(t));
  const parsed = parseQuery(String(b.message ?? ''));
  const { facts: _f, ...rest } = answerQuery(parsed, db(), { dieselPrice: db().org.settings.dieselPrice, gst: db().org.settings.gst });
  return { ...rest, parsed: { intent: parsed.intent, cities: parsed.cities, lang: parsed.lang } };
});
on('GET', '/api/notifications', (_m, _b, _q, t) => {
  staff(userFrom(t));
  return outbox;
});

// Shipments
on('POST', '/api/quotes', (_m, b) => {
  city(b.originCity);
  city(b.destCity);
  const sig = signals(b.service, b.originCity, b.destCity);
  const q = quote({ ...b, origin: b.originCity, destination: b.destCity, dieselPrice: db().org.settings.dieselPrice, gst: db().org.settings.gst, ...sig });
  return { quote: q, signals: sig, co2Kg: shipmentCo2Kg(b.service, q.distanceKm, q.chargeableKg, q.vehicleType), rtoPreview: rtoRisk({ paymentMode: b.paymentMode ?? 'PREPAID', codAmount: b.codAmount, destination: b.destCity }) };
});
on('POST', '/api/shipments', (_m, b, _q, t) => {
  const u = userFrom(t);
  if (!['admin', 'ops', 'customer'].includes(u.role)) throw new DemoError(403, 'You do not have access to this');
  const d = db();
  if (!b.consigneeName || !b.consigneePhone || !b.consigneeAddress) throw new DemoError(400, 'Receiver name, phone and address are required');
  const from = city(b.originCity);
  const to = city(b.destCity);
  const customerId = u.role === 'customer' ? u.customerId ?? null : b.customerId ?? null;
  const cust = customerId ? d.customers.find((c) => c.id === customerId) : undefined;
  const shipperName = b.shipperName || cust?.name;
  if (!shipperName) throw new DemoError(400, 'Shipper name is required');
  const sig = signals(b.service, from.name, to.name);
  const q = quote({ ...b, origin: from.name, destination: to.name, dieselPrice: d.org.settings.dieselPrice, gst: d.org.settings.gst, ...sig });
  const hist = d.shipments.filter((s) => s.consigneePhone === b.consigneePhone);
  const risk = rtoRisk({ paymentMode: b.paymentMode, codAmount: b.codAmount, consigneePhone: b.consigneePhone, address: b.consigneeAddress, destination: to.name, history: { delivered: hist.filter((s) => s.status === 'DELIVERED').length, returned: hist.filter((s) => s.status.startsWith('RTO')).length }, orderHour: new Date().getHours() });
  const eta = predictEta({ service: b.service, distanceKm: q.distanceKm, vehicleType: q.vehicleType, destination: to });
  const s: ShipmentRec = {
    id: uid(), orgId: d.org.id, awb: makeAwb(), service: b.service, status: 'BOOKED', customerId, shipperName, shipperPhone: b.shipperPhone ?? cust?.phone ?? null,
    consigneeName: b.consigneeName, consigneePhone: b.consigneePhone, consigneeAddress: b.consigneeAddress, originCity: from.name, originLat: from.lat, originLng: from.lng,
    destCity: to.name, destLat: to.lat, destLng: to.lng, weightKg: b.weightKg, packages: b.packages ?? 1, declaredValue: b.declaredValue ?? 0, paymentMode: b.paymentMode,
    codAmount: b.paymentMode === 'COD' ? b.codAmount ?? 0 : 0, codCollected: false, price: q.total, priceBreakup: q.lines, gstRate: q.gstRate, distanceKm: q.distanceKm,
    co2Kg: shipmentCo2Kg(b.service, q.distanceKm, q.chargeableKg, q.vehicleType), rtoScore: risk.score, rtoLevel: risk.level, ewaybillRequired: (b.declaredValue ?? 0) > 50000,
    ewaybillNo: null, vehicleType: q.vehicleType ?? null, tripId: null, invoiceId: null, deliveryOtp: deliveryOtp(), attempts: 0, currentLat: from.lat, currentLng: from.lng,
    promisedAt: eta.arriveAt, etaAt: eta.arriveAt, podReceiver: null, podPhotoUrl: null, deliveredAt: null, createdAt: now(), updatedAt: now(),
  };
  d.shipments.unshift(s);
  d.events.push({ id: uid(), orgId: d.org.id, shipmentId: s.id, status: 'BOOKED', note: `Booked at ₹${q.total.toLocaleString('en-IN')}; RTO risk ${risk.score}/100`, city: from.name, lat: from.lat, lng: from.lng, at: now() });
  notify(s.consigneePhone, 'booking_confirmed', `Namaste ${s.consigneeName}, your shipment ${s.awb} is booked. Track it on the SurajLogistic tracking page.`);
  emit('shipment.created', { id: s.id, awb: s.awb });
  return strip(s);
});
on('GET', '/api/shipments', (_m, _b, q, t) => {
  const u = userFrom(t);
  let list = db().shipments;
  if (u.role === 'customer') list = list.filter((s) => s.customerId === u.customerId);
  const st = q.get('status');
  if (st) {
    const set = new Set(st.split(','));
    list = list.filter((s) => set.has(s.status));
  }
  const sv = q.get('service');
  if (sv) list = list.filter((s) => s.service === sv);
  const trip = q.get('tripId');
  if (trip) list = list.filter((s) => s.tripId === trip);
  const term = q.get('q')?.toLowerCase();
  if (term) list = list.filter((s) => [s.awb, s.consigneeName, s.shipperName, s.destCity, s.originCity].some((x) => x.toLowerCase().includes(term)));
  list = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const limit = Number(q.get('limit') ?? 100);
  return { items: list.slice(0, limit).map((s) => strip(s)), total: list.length };
});
on('GET', '/api/shipments/:id', (m, _b, _q, t) => {
  const u = userFrom(t);
  const d = db();
  const s = d.shipments.find((x) => x.id === m[1]);
  if (!s || (u.role === 'customer' && s.customerId !== u.customerId)) throw new DemoError(404, 'Shipment not found');
  const events = d.events.filter((e) => e.shipmentId === s.id).sort((a, b) => a.at.localeCompare(b.at));
  const trip = s.tripId ? d.trips.find((x) => x.id === s.tripId) ?? null : null;
  return { ...strip(s, u.role === 'admin' || u.role === 'ops'), events, trip, nextStatuses: nextStatuses(s.service, s.status) };
});
on('POST', '/api/shipments/:id/status', (m, b, _q, t) => {
  const u = userFrom(t);
  if (!['admin', 'ops', 'driver'].includes(u.role)) throw new DemoError(403, 'You do not have access to this');
  const s = db().shipments.find((x) => x.id === m[1]);
  if (!s) throw new DemoError(404, 'Shipment not found');
  if (!canTransition(s.service, s.status, b.status)) throw new DemoError(400, `Cannot move from "${STATUS_LABEL[s.status]}" to "${STATUS_LABEL[b.status as ShipmentStatus]}" for ${s.service}`);
  if (b.status === 'DELIVERED' && b.otp !== s.deliveryOtp && !(u.role === 'admin' && b.otp === 'OVERRIDE')) throw new DemoError(400, 'Delivery OTP does not match');
  if (b.status === 'OUT_FOR_DELIVERY') notify(s.consigneePhone, 'out_for_delivery', `${s.awb} is out for delivery in ${s.destCity} today. Share OTP ${s.deliveryOtp} only at handover.`);
  if (b.status === 'NDR') notify(s.consigneePhone, 'ndr_reschedule', `We could not deliver ${s.awb}. Reply 1 to reattempt tomorrow, 2 to update address.`);
  return strip(applyStatus(s, b.status, { note: b.note, city: b.city, receiverName: b.receiverName }));
});
on('POST', '/api/shipments/:id/ewaybill', (m, _b, _q, t) => {
  staff(userFrom(t));
  const s = db().shipments.find((x) => x.id === m[1]);
  if (!s) throw new DemoError(404, 'Shipment not found');
  if (s.ewaybillNo) return { ewbNo: s.ewaybillNo, alreadyGenerated: true };
  s.ewaybillNo = String(Math.floor(100000000000 + Math.random() * 899999999999));
  const valid = new Date();
  valid.setDate(valid.getDate() + Math.max(1, Math.ceil(s.distanceKm / 200)));
  return { ewbNo: s.ewaybillNo, generatedAt: now(), validUntil: valid.toISOString(), provider: 'mock-gsp', required: s.ewaybillRequired };
});
on('GET', '/api/track/:awb', (m) => {
  const d = db();
  const s = d.shipments.find((x) => x.awb === decodeURIComponent(m[1]!).toUpperCase());
  if (!s) throw new DemoError(404, 'No shipment with this tracking number');
  const events = d.events.filter((e) => e.shipmentId === s.id).sort((a, b) => b.at.localeCompare(a.at));
  return {
    awb: s.awb, service: s.service, status: s.status, statusLabel: STATUS_LABEL[s.status], originCity: s.originCity, destCity: s.destCity,
    origin: { lat: s.originLat, lng: s.originLng }, destination: { lat: s.destLat, lng: s.destLng }, current: { lat: s.currentLat, lng: s.currentLng },
    weightKg: s.weightKg, packages: s.packages, etaAt: s.etaAt, promisedAt: s.promisedAt, deliveredAt: s.deliveredAt,
    receivedBy: s.podReceiver ? `${s.podReceiver[0]}***` : null, co2Kg: s.co2Kg,
    events: events.map((e) => ({ status: e.status, label: STATUS_LABEL[e.status], note: e.note, city: e.city, at: e.at })),
  };
});

// Fleet
on('GET', '/api/vehicles', (_m, _b, _q, t) => {
  staff(userFrom(t));
  return [...db().vehicles].sort((a, b) => a.regNo.localeCompare(b.regNo)).map((v) => ({ ...v, alerts: docAlerts(v, new Date()) }));
});
on('POST', '/api/vehicles', (_m, b, _q, t) => {
  staff(userFrom(t));
  const c = city(b.city);
  const vc = VEHICLE_CLASSES[b.type as keyof typeof VEHICLE_CLASSES];
  if (!vc) throw new DemoError(400, 'Choose a vehicle type');
  const regNo = String(b.regNo ?? '').toUpperCase().trim();
  if (regNo.length < 6) throw new DemoError(400, 'Enter the registration number');
  if (db().vehicles.some((v) => v.regNo === regNo)) throw new DemoError(409, 'This vehicle is already in your fleet');
  const v = { id: uid(), orgId: db().org.id, regNo, type: vc.type, ownership: b.ownership ?? 'OWN', status: 'IDLE' as const, capacityKg: vc.capacityKg, city: c.name, lat: c.lat, lng: c.lng, kmpl: vc.kmpl, odometerKm: 0, docs: b.docs ?? {}, lastPingAt: null, createdAt: now() };
  db().vehicles.push(v);
  return v;
});
on('PATCH', '/api/vehicles/:id', (m, b, _q, t) => {
  staff(userFrom(t));
  const v = db().vehicles.find((x) => x.id === m[1]);
  if (!v) throw new DemoError(404, 'Vehicle not found');
  if (b.status) v.status = b.status;
  if (b.docs) v.docs = { ...v.docs, ...b.docs };
  return v;
});
on('POST', '/api/vehicles/:id/verify', (m, _b, _q, t) => {
  staff(userFrom(t));
  const v = db().vehicles.find((x) => x.id === m[1]);
  if (!v) throw new DemoError(404, 'Vehicle not found');
  const today = new Date().toISOString().slice(0, 10);
  return { regNo: v.regNo, verified: true, source: 'mock-ulip (VAHAN)', fitnessUpto: v.docs.fitness, insuranceUpto: v.docs.insurance, permitUpto: v.docs.permit, pucUpto: v.docs.puc, remarks: Object.entries(v.docs).filter(([, d]) => d && d < today).map(([k, d]) => `${k} expired on ${d}`) };
});
on('GET', '/api/drivers', (_m, _b, _q, t) => {
  staff(userFrom(t));
  return [...db().drivers].sort((a, b) => a.name.localeCompare(b.name)).map((d) => ({ ...d, licenseDays: daysUntil(d.licenseExpiry, new Date()) }));
});
on('POST', '/api/drivers', (_m, b, _q, t) => {
  staff(userFrom(t));
  if (!b.name || !b.phone || !b.licenseNo || !b.licenseExpiry) throw new DemoError(400, 'Name, phone, licence number and expiry are required');
  const dr = { id: uid(), orgId: db().org.id, userId: null, name: b.name, phone: b.phone, licenseNo: b.licenseNo, licenseExpiry: b.licenseExpiry, status: 'AVAILABLE' as const, rating: 4.5, lang: b.lang ?? 'hi', createdAt: now() };
  db().drivers.push(dr);
  return dr;
});

// Trips
const tripView = (t: TripRec) => {
  const d = db();
  const v = d.vehicles.find((x) => x.id === t.vehicleId)!;
  const dr = d.drivers.find((x) => x.id === t.driverId)!;
  return { ...t, regNo: v.regNo, vehicleType: v.type, driverName: dr.name, driverPhone: dr.phone, pnl: tripPnl(t) };
};
on('GET', '/api/trips', (_m, _b, q, t) => {
  staff(userFrom(t));
  let list = [...db().trips].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const st = q.get('status');
  if (st) list = list.filter((x) => st.split(',').includes(x.status));
  return list.map(tripView);
});
on('GET', '/api/trips/:id', (m, _b, _q, tk) => {
  userFrom(tk);
  const d = db();
  const t = d.trips.find((x) => x.id === m[1]);
  if (!t) throw new DemoError(404, 'Trip not found');
  return { ...t, vehicle: d.vehicles.find((x) => x.id === t.vehicleId), driver: d.drivers.find((x) => x.id === t.driverId), shipments: d.shipments.filter((s) => s.tripId === t.id).map((s) => strip(s)), pings: d.pings.filter((p) => p.tripId === t.id), pnl: tripPnl(t) };
});
on('POST', '/api/trips', (_m, b, _q, tk) => {
  staff(userFrom(tk));
  const d = db();
  const a = city(b.originCity);
  const z = city(b.destCity);
  const v = d.vehicles.find((x) => x.id === b.vehicleId);
  const dr = d.drivers.find((x) => x.id === b.driverId);
  if (!v || !dr) throw new DemoError(400, 'Choose a vehicle and a driver');
  if (v.status !== 'IDLE') throw new DemoError(400, `${v.regNo} is not free (${v.status.toLowerCase()})`);
  if (dr.status !== 'AVAILABLE') throw new DemoError(400, `${dr.name} is not available`);
  const attach = d.shipments.filter((s) => (b.shipmentIds ?? []).includes(s.id));
  const weight = attach.reduce((s, x) => s + x.weightKg, 0);
  if (weight > v.capacityKg) throw new DemoError(400, `Load ${Math.round(weight)} kg is above ${v.regNo}'s capacity of ${v.capacityKg} kg`);
  const km = roadKm(a, z);
  const vc = VEHICLE_CLASSES[v.type];
  const eta = predictEta({ service: 'FTL', distanceKm: km, vehicleType: v.type, destination: z });
  const t: TripRec = {
    id: uid(), orgId: d.org.id, tripNo: shortCode('TRP', Math.random, 5), vehicleId: v.id, driverId: dr.id, status: 'PLANNED', originCity: a.name, originLat: a.lat, originLng: a.lng,
    destCity: z.name, destLat: z.lat, destLng: z.lng, plannedKm: km, actualKm: null, freightAmount: b.freightAmount || attach.reduce((s, x) => s + Math.round((x.price * 100) / (100 + x.gstRate)), 0),
    fuelCost: Math.round((km / vc.kmpl) * d.org.settings.dieselPrice), tollCost: Math.round(km * vc.tollPerKm), driverAdvance: b.driverAdvance ?? 0, otherCost: 0,
    currentLat: a.lat, currentLng: a.lng, progress: 0, etaAt: eta.arriveAt, promisedAt: eta.arriveAt, loadId: b.loadId ?? null, plannedStart: now(), startedAt: null, completedAt: null, createdAt: now(),
  };
  d.trips.unshift(t);
  attach.forEach((s) => Object.assign(s, { tripId: t.id, vehicleType: v.type }));
  return t;
});
on('POST', '/api/trips/:id/start', (m, _b, _q, tk) => {
  userFrom(tk);
  const d = db();
  const t = d.trips.find((x) => x.id === m[1]);
  if (!t || t.status !== 'PLANNED') throw new DemoError(400, 'Only a planned trip can be started');
  const v = d.vehicles.find((x) => x.id === t.vehicleId)!;
  const eta = predictEta({ service: 'FTL', distanceKm: t.plannedKm, vehicleType: v.type, destination: requireCity(t.destCity) });
  Object.assign(t, { status: 'IN_TRANSIT', startedAt: now(), etaAt: eta.arriveAt, promisedAt: eta.arriveAt });
  v.status = 'ON_TRIP';
  d.drivers.find((x) => x.id === t.driverId)!.status = 'ON_TRIP';
  for (const s of d.shipments.filter((x) => x.tripId === t.id)) {
    if (s.status === 'BOOKED') applyStatus(s, 'PICKED_UP', { city: t.originCity });
    if (canTransition(s.service, s.status, 'IN_TRANSIT')) applyStatus(s, 'IN_TRANSIT', { city: t.originCity, note: `Departed on trip ${t.tripNo}` });
  }
  emit('trip.status', { id: t.id, status: 'IN_TRANSIT' });
  return t;
});
on('POST', '/api/trips/:id/complete', (m, b, _q, tk) => {
  userFrom(tk);
  const d = db();
  const t = d.trips.find((x) => x.id === m[1]);
  if (!t || t.status !== 'IN_TRANSIT') throw new DemoError(400, 'Only a trip in transit can be completed');
  Object.assign(t, { status: 'COMPLETED', completedAt: now(), progress: 1, currentLat: t.destLat, currentLng: t.destLng, actualKm: b?.actualKm ?? t.plannedKm, fuelCost: b?.fuelCost ?? t.fuelCost, tollCost: b?.tollCost ?? t.tollCost, otherCost: b?.otherCost ?? t.otherCost });
  Object.assign(d.vehicles.find((x) => x.id === t.vehicleId)!, { status: 'IDLE', city: t.destCity, lat: t.destLat, lng: t.destLng });
  d.drivers.find((x) => x.id === t.driverId)!.status = 'AVAILABLE';
  for (const s of d.shipments.filter((x) => x.tripId === t.id)) if (s.service !== 'FTL' && canTransition(s.service, s.status, 'AT_HUB')) applyStatus(s, 'AT_HUB', { city: t.destCity, note: `Unloaded at ${t.destCity} from ${t.tripNo}` });
  emit('trip.status', { id: t.id, status: 'COMPLETED' });
  return { ...t, pnl: tripPnl(t) };
});
on('POST', '/api/routes/optimize', (_m, b) => {
  const start = city(b.start);
  const stops = (b.stops as string[]).map((n, i) => ({ id: `${i}:${n}`, label: city(n).name, ...city(n) }));
  const plan = optimizeRoute(start, stops, !!b.returnToStart);
  return { ...plan, order: plan.stops.map((s) => s.label) };
});

// Marketplace
on('GET', '/api/loads', (_m, _b, q, t) => {
  staff(userFrom(t));
  const d = db();
  let list = [...d.loads].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (q.get('scope') === 'open') list = list.filter((l) => l.status === 'OPEN');
  return list.map((l) => {
    const lb = d.bids.filter((b) => b.loadId === l.id);
    return { ...l, mine: true, bidCount: lb.length, bestBid: lb.length ? Math.min(...lb.map((b) => b.amount)) : null, myBid: null };
  });
});
on('GET', '/api/loads/:id', (m, _b, _q, t) => {
  staff(userFrom(t));
  const d = db();
  const l = d.loads.find((x) => x.id === m[1]);
  if (!l) throw new DemoError(404, 'Load not found');
  const idle = d.vehicles.filter((v) => v.status === 'IDLE');
  const sugg = suggestTrucks(asMatch(l), idle.map((v) => ({ id: v.id, type: v.type, at: { lat: v.lat, lng: v.lng } }))).slice(0, 5);
  return { ...l, mine: true, bids: d.bids.filter((b) => b.loadId === l.id).sort((a, b) => a.amount - b.amount), suggestedTrucks: sugg.map((s) => ({ ...s, regNo: idle.find((v) => v.id === s.vehicleId)!.regNo, city: idle.find((v) => v.id === s.vehicleId)!.city })) };
});
on('POST', '/api/loads', (_m, b, _q, t) => {
  staff(userFrom(t));
  const a = city(b.originCity);
  const z = city(b.destCity);
  if (!b.material || !b.weightKg || !b.targetPrice) throw new DemoError(400, 'Material, weight and price are required');
  const l = { id: uid(), orgId: db().org.id, loadNo: shortCode('LD', Math.random, 5), postedBy: b.postedBy || db().org.name, contactPhone: b.contactPhone ?? null, originCity: a.name, originLat: a.lat, originLng: a.lng, destCity: z.name, destLat: z.lat, destLng: z.lng, material: b.material, weightKg: b.weightKg, vehicleType: b.vehicleType ?? null, pickupDate: b.pickupDate, targetPrice: b.targetPrice, status: 'OPEN' as const, isPublic: b.isPublic ?? true, awardedBidId: null, tripId: null, createdAt: now() };
  db().loads.unshift(l);
  emit('load.created', { id: l.id, loadNo: l.loadNo });
  return l;
});
on('POST', '/api/loads/:id/bids', (m, b, _q, t) => {
  staff(userFrom(t));
  const d = db();
  const l = d.loads.find((x) => x.id === m[1]);
  if (!l || l.status !== 'OPEN') throw new DemoError(400, 'This load is no longer open');
  const v = b.vehicleId ? d.vehicles.find((x) => x.id === b.vehicleId) : undefined;
  if (v && v.capacityKg < l.weightKg) throw new DemoError(400, `${v.regNo} cannot carry ${l.weightKg} kg`);
  const bid = { id: uid(), loadId: l.id, orgId: d.org.id, carrierName: v ? `${d.org.name} (${v.regNo})` : d.org.name, carrierPhone: null, vehicleId: v?.id ?? null, amount: b.amount, etaHours: b.etaHours, note: b.note ?? null, status: 'PENDING' as const, createdAt: now() };
  d.bids.push(bid);
  return bid;
});
on('POST', '/api/loads/:id/accept', (m, b, _q, t) => {
  staff(userFrom(t));
  const d = db();
  const l = d.loads.find((x) => x.id === m[1]);
  if (!l || l.status !== 'OPEN') throw new DemoError(400, 'This load is no longer open');
  const bid = d.bids.find((x) => x.id === b.bidId && x.loadId === l.id);
  if (!bid) throw new DemoError(404, 'Bid not found');
  d.bids.filter((x) => x.loadId === l.id).forEach((x) => (x.status = x.id === bid.id ? 'ACCEPTED' : 'REJECTED'));
  Object.assign(l, { status: 'BOOKED', awardedBidId: bid.id });
  emit('load.booked', { id: l.id, loadNo: l.loadNo });
  return { ...l, tripId: null };
});
on('GET', '/api/vehicles/:id/return-loads', (m, _b, q, t) => {
  staff(userFrom(t));
  const d = db();
  const v = d.vehicles.find((x) => x.id === m[1]);
  if (!v) throw new DemoError(404, 'Vehicle not found');
  const at = q.get('city') ? city(q.get('city')!) : v;
  const open = d.loads.filter((l) => l.status === 'OPEN');
  return findReturnLoads({ id: v.id, type: v.type, at: { lat: at.lat, lng: at.lng } }, open.map(asMatch), Number(q.get('radiusKm') ?? 150)).map((r) => ({ ...r, load: { ...r.load, loadNo: open.find((l) => l.id === r.load.id)!.loadNo, material: open.find((l) => l.id === r.load.id)!.material } }));
});

// Warehouse
on('GET', '/api/facilities', () => db().facilities);
on('GET', '/api/inventory', (_m, _b, q) => {
  let items = [...db().items].sort((a, b) => a.sku.localeCompare(b.sku));
  const term = q.get('q')?.toLowerCase();
  if (term) items = items.filter((i) => [i.sku, i.name, i.clientName].some((x) => x.toLowerCase().includes(term)));
  return items.map((i) => ({ ...i, lowStock: i.qty < i.reorderLevel }));
});
on('POST', '/api/inventory/:id/move', (m, b, _q, t) => {
  const u = userFrom(t);
  if (!['admin', 'ops', 'warehouse'].includes(u.role)) throw new DemoError(403, 'You do not have access to this');
  const it = db().items.find((x) => x.id === m[1]);
  if (!it) throw new DemoError(404, 'Item not found');
  const qty = Math.abs(Number(b.qty));
  if (!qty) throw new DemoError(400, 'Enter a quantity');
  const delta = b.type === 'INBOUND' ? qty : b.type === 'OUTBOUND' ? -qty : Number(b.qty);
  if (it.qty + delta < 0) throw new DemoError(400, `Only ${it.qty} ${it.unit} in stock`);
  it.qty += delta;
  it.updatedAt = now();
  const move = { id: uid(), orgId: it.orgId, itemId: it.id, type: b.type, qty: delta, ref: b.ref ?? null, at: now() };
  db().moves.unshift(move);
  return { item: { ...it, lowStock: it.qty < it.reorderLevel }, move };
});
on('GET', '/api/inventory/:id/moves', (m) => db().moves.filter((x) => x.itemId === m[1]));

// Billing
on('GET', '/api/customers', () => db().customers);
on('GET', '/api/invoices', () => [...db().invoices].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
on('GET', '/api/invoices/:id', (m) => {
  const d = db();
  const inv = d.invoices.find((x) => x.id === m[1]);
  if (!inv) throw new DemoError(404, 'Invoice not found');
  const lines = d.shipments.filter((s) => inv.shipmentIds.includes(s.id));
  return { ...inv, lines: lines.map((s) => ({ awb: s.awb, service: s.service, lane: `${s.originCity} → ${s.destCity}`, weightKg: s.weightKg, gstRate: s.gstRate, taxable: Math.round((s.price * 100) / (100 + s.gstRate)), total: s.price, deliveredAt: s.deliveredAt })) };
});
on('GET', '/api/billing/unbilled', () => {
  const groups = new Map<string, { shipperName: string; customerId: string | null; shipments: unknown[]; total: number }>();
  for (const s of db().shipments.filter((x) => x.status === 'DELIVERED' && !x.invoiceId)) {
    const key = s.customerId ?? s.shipperName;
    const g = groups.get(key) ?? { shipperName: s.shipperName, customerId: s.customerId, shipments: [], total: 0 };
    g.shipments.push({ id: s.id, awb: s.awb, service: s.service, originCity: s.originCity, destCity: s.destCity, price: s.price, deliveredAt: s.deliveredAt });
    g.total += s.price;
    groups.set(key, g);
  }
  return [...groups.values()];
});
on('POST', '/api/invoices', (_m, b, _q, t) => {
  staff(userFrom(t));
  const d = db();
  const list = d.shipments.filter((s) => (b.shipmentIds ?? []).includes(s.id));
  if (!list.length || list.some((s) => s.status !== 'DELIVERED' || s.invoiceId)) throw new DemoError(400, 'Pick delivered shipments that are not invoiced yet');
  if (new Set(list.map((s) => s.customerId ?? s.shipperName)).size > 1) throw new DemoError(400, 'All shipments on one invoice must be for the same customer');
  const subtotal = list.reduce((a, s) => a + Math.round((s.price * 100) / (100 + s.gstRate)), 0);
  const total = list.reduce((a, s) => a + s.price, 0);
  const cust = d.customers.find((c) => c.id === list[0]!.customerId);
  const inv = { id: uid(), orgId: d.org.id, invoiceNo: invoiceNumber(d.invoices.length + 1), customerName: cust?.name ?? list[0]!.shipperName, customerGstin: cust?.gstin ?? null, shipmentIds: list.map((s) => s.id), subtotal, gstRate: list[0]!.gstRate, gst: total - subtotal, total, status: 'DRAFT' as const, dueDate: new Date(Date.now() + 15 * 86400_000).toISOString().slice(0, 10), createdAt: now() };
  d.invoices.unshift(inv);
  list.forEach((s) => (s.invoiceId = inv.id));
  return inv;
});
on('PATCH', '/api/invoices/:id', (m, b) => {
  const inv = db().invoices.find((x) => x.id === m[1]);
  if (!inv) throw new DemoError(404, 'Invoice not found');
  inv.status = b.status;
  return inv;
});

// Driver app
on('GET', '/api/driver/me', (_m, _b, _q, t) => {
  const u = userFrom(t);
  const d = db();
  const dr = d.drivers.find((x) => x.userId === u.id);
  if (!dr) throw new DemoError(404, 'No driver profile is linked to this login');
  const mine = d.trips.filter((x) => x.driverId === dr.id);
  const active = mine.find((x) => x.status === 'IN_TRANSIT') ?? mine.find((x) => x.status === 'PLANNED') ?? null;
  const done = mine.filter((x) => x.status === 'COMPLETED');
  return {
    driver: dr,
    activeTrip: active ? { ...active, pnl: tripPnl(active) } : null,
    vehicle: active ? d.vehicles.find((v) => v.id === active.vehicleId) : null,
    stops: active
      ? d.shipments
          .filter((s) => s.tripId === active.id && !['DELIVERED', 'RTO_DELIVERED', 'CANCELLED'].includes(s.status))
          .map((s) => ({ id: s.id, awb: s.awb, service: s.service, status: s.status, consigneeName: s.consigneeName, consigneePhone: s.consigneePhone, consigneeAddress: s.consigneeAddress, destCity: s.destCity, paymentMode: s.paymentMode, codAmount: s.codAmount, packages: s.packages, weightKg: s.weightKg, nextStatuses: nextStatuses(s.service, s.status) }))
      : [],
    history: done.map((x) => ({ id: x.id, tripNo: x.tripNo, lane: `${x.originCity} → ${x.destCity}`, km: x.actualKm ?? x.plannedKm, completedAt: x.completedAt, advance: x.driverAdvance })),
    stats: { tripsDone: done.length, kmDriven: done.reduce((a, x) => a + (x.actualKm ?? x.plannedKm), 0), rating: dr.rating },
    /** Demo only: lets the driver screen show the OTP the receiver would read out. */
    demoOtps: active ? Object.fromEntries(d.shipments.filter((s) => s.tripId === active.id).map((s) => [s.id, s.deliveryOtp])) : {},
  };
});

export async function demoRequest(method: string, fullPath: string, body: unknown, token: string | null): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 120));
  const [path, qs] = fullPath.split('?');
  const q = new URLSearchParams(qs ?? '');
  for (const [m, re, h] of routes) {
    if (m !== method) continue;
    const match = path!.match(re);
    if (!match) continue;
    try {
      return structuredClone(h(match, body ?? {}, q, token));
    } catch (e) {
      if (e instanceof DemoError) throw new ApiError(e.status, e.message);
      throw e;
    }
  }
  throw new ApiError(404, `No demo route for ${method} ${path}`);
}
