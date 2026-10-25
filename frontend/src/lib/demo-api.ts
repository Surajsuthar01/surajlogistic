// In-browser stand-in for the API, used by the demo build. Same routes, same shapes,
// same @suraj/shared engines — data lives in memory and resets on reload.
// Each company (the demo one, plus any made through sign-up) gets its own store.
import {
  answerQuery,
  buildDemoData,
  canTransition,
  CITIES,
  computeDashboard,
  computeReport,
  COPILOT_SUGGESTIONS,
  daysUntil,
  DEFAULT_GST,
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
  MODULES,
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
  type Role,
  type Service,
  type ShipmentRec,
  type ShipmentStatus,
  type TripRec,
  type UserRec,
} from '@suraj/shared';
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

interface Msg {
  id: string;
  to: string;
  template: string;
  text: string;
  at: string;
  channel: 'whatsapp' | 'sms';
  status: 'SENT' | 'DELIVERED' | 'FAILED';
}
interface Expense {
  id: string;
  tripId: string;
  kind: string;
  amount: number;
  note: string | null;
  photoUrl: string | null;
  at: string;
}
interface Store {
  d: DemoDataset;
  outbox: Msg[];
  expenses: Expense[];
  passwords: Map<string, string>;
  /** Passwords people chose when they asked to join, until the owner approves them. */
  joinPasswords: Map<string, string>;
  keys: { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null }[];
  hooks: { id: string; url: string; events: string[]; active: boolean; lastStatus: number | null; lastAt: string | null; createdAt: string; secret: string }[];
}

const stores: Store[] = [];
const listeners = new Set<(e: LiveEvent) => void>();
let simTimer: ReturnType<typeof setInterval> | null = null;

const uid = () => (typeof globalThis.crypto?.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const now = () => new Date().toISOString();
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const H = 3600_000;

function boot() {
  if (stores.length) return;
  const d = buildDemoData(new Date());
  const s: Store = { d, outbox: [], expenses: [], passwords: new Map(), joinPasswords: new Map(), keys: [], hooks: [] };
  // A believable history of messages and a few things the screens would otherwise show empty.
  const recent = [...d.shipments].filter((x) => x.status !== 'REQUESTED').sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 14);
  for (const sh of recent.reverse()) {
    s.outbox.unshift({ id: uid(), to: sh.consigneePhone, template: 'booking_confirmed', text: `Namaste ${sh.consigneeName}, your shipment ${sh.awb} from ${sh.originCity} is booked with ${d.org.name}. Track it: surajlogistic.in/track/${sh.awb}`, at: sh.createdAt, channel: 'whatsapp', status: 'DELIVERED' });
    if (sh.status === 'OUT_FOR_DELIVERY') s.outbox.unshift({ id: uid(), to: sh.consigneePhone, template: 'out_for_delivery', text: `${sh.awb} is out for delivery in ${sh.destCity} today. Share OTP ${sh.deliveryOtp} only at handover.`, at: ago(2 * H), channel: 'whatsapp', status: 'DELIVERED' });
    if (sh.status === 'NDR') s.outbox.unshift({ id: uid(), to: sh.consigneePhone, template: 'ndr_reschedule', text: `We could not deliver ${sh.awb}. Pick a new day: surajlogistic.in/track/${sh.awb}`, at: ago(5 * H), channel: 'whatsapp', status: 'SENT' });
  }
  const ramesh = d.drivers.find((x) => x.userId === d.users.find((u) => u.role === 'driver')?.id);
  const active = d.trips.find((t) => t.driverId === ramesh?.id && t.status === 'IN_TRANSIT');
  if (active) {
    s.expenses.push({ id: uid(), tripId: active.id, kind: 'DIESEL', amount: 9200, note: 'Shahpura pump, 100 litres', photoUrl: null, at: ago(6 * H) });
    s.expenses.push({ id: uid(), tripId: active.id, kind: 'TOLL', amount: 1340, note: 'FASTag, 3 plazas', photoUrl: null, at: ago(3 * H) });
  }
  s.keys.push({ id: uid(), name: 'BharatKart order system', prefix: 'sl_live_7Qm2', createdAt: ago(40 * 24 * H), lastUsedAt: ago(2 * H), revokedAt: null });
  stores.push(s);
  startSim();
}

function storeOf(token: string | null): { s: Store; u: UserRec } {
  boot();
  for (const s of stores) {
    const u = s.d.users.find((x) => x.id === token);
    if (u) return { s, u };
  }
  throw new DemoError(401, 'Please log in again');
}

const emit = (type: string, payload: Record<string, unknown>) => listeners.forEach((l) => l({ type, payload, at: now() }));

function notify(s: Store, to: string, template: string, text: string) {
  const on = s.d.org.settings.notify ?? {};
  const key = template === 'booking_confirmed' ? 'booked' : template === 'out_for_delivery' ? 'outForDelivery' : template === 'delivered' ? 'delivered' : template === 'ndr_reschedule' ? 'failed' : null;
  if (key && on[key as keyof typeof on] === false) return;
  s.outbox.unshift({ id: uid(), to, template, text, at: now(), channel: 'whatsapp', status: 'SENT' });
  if (s.outbox.length > 300) s.outbox.length = 300;
}

function startSim() {
  if (simTimer || typeof window === 'undefined') return;
  simTimer = setInterval(() => {
    for (const st of stores) {
      const d = st.d;
      for (const t of d.trips) {
        if (t.status !== 'IN_TRANSIT' || t.progress >= 0.97) continue;
        const v = d.vehicles.find((x) => x.id === t.vehicleId)!;
        const speed = VEHICLE_CLASSES[v.type].avgKmph * (0.75 + Math.random() * 0.5);
        t.progress = Math.min(0.97, t.progress + speed / 6 / Math.max(1, t.plannedKm));
        const p = lerpPoint({ lat: t.originLat, lng: t.originLng }, { lat: t.destLat, lng: t.destLng }, t.progress);
        t.currentLat = p.lat;
        t.currentLng = p.lng;
        t.etaAt = liveEta(p, { lat: t.destLat, lng: t.destLng }, v.type).arriveAt;
        Object.assign(v, { lat: p.lat, lng: p.lng, city: nearestCity(p).name, lastPingAt: now() });
        for (const sh of d.shipments) if (sh.tripId === t.id && sh.status === 'IN_TRANSIT') Object.assign(sh, { currentLat: p.lat, currentLng: p.lng, etaAt: t.etaAt });
        emit('trip.ping', { id: t.id, tripNo: t.tripNo, vehicleId: v.id, lat: p.lat, lng: p.lng, speedKmph: Math.round(speed), progress: t.progress, etaAt: t.etaAt });
      }
    }
  }, 4000);
}

export function demoSubscribe(fn: (e: LiveEvent) => void) {
  boot();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const strip = (s: ShipmentRec, keep = false) => {
  const { deliveryOtp: otp, ...rest } = s;
  return keep ? { ...rest, deliveryOtp: otp } : rest;
};
const need = (u: UserRec, ...roles: Role[]) => {
  if (!roles.includes(u.role)) throw new DemoError(403, 'Your login does not allow this');
};
const STAFF: Role[] = ['admin', 'ops'];
const city = (name: string) => {
  const c = findCity(name);
  if (!c) throw new DemoError(400, `"${name}" is not in the list of cities we serve`);
  return c;
};
const asMatch = (l: DemoDataset['loads'][number]): MatchLoad => ({ id: l.id, origin: { lat: l.originLat, lng: l.originLng, city: l.originCity }, destination: { lat: l.destLat, lng: l.destLng, city: l.destCity }, weightKg: l.weightKg, vehicleType: l.vehicleType, pickupDate: l.pickupDate, targetPrice: l.targetPrice });
const publicUser = (u: UserRec) => {
  const { passwordHash: _p, ...rest } = u;
  return rest;
};

function signals(d: DemoDataset, service: Service, origin: string, destination: string) {
  if (service !== 'FTL') return { laneDemand: 1, returnLoadScore: 0 };
  const a = requireCity(origin);
  const b = requireCity(destination);
  const open = d.loads.filter((l) => l.status === 'OPEN');
  const near = (p: { lat: number; lng: number }, c: { lat: number; lng: number }) => haversineKm(p, c) <= 150;
  return {
    laneDemand: laneDemand(open.filter((l) => near({ lat: l.originLat, lng: l.originLng }, a)).length, d.vehicles.filter((v) => v.status === 'IDLE' && near(v, a)).length),
    returnLoadScore: returnLoadScore(open.filter((l) => near({ lat: l.originLat, lng: l.originLng }, b)).length),
  };
}

function applyStatus(st: Store, s: ShipmentRec, status: ShipmentStatus, extra: { note?: string; city?: string; receiverName?: string } = {}) {
  const d = st.d;
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
  if (status === 'DELIVERED') Object.assign(s, { deliveredAt: now(), podReceiver: extra.receiverName ?? s.consigneeName, attempts: s.attempts + 1, codCollected: s.paymentMode === 'COD' });
  d.events.push({ id: uid(), orgId: s.orgId, shipmentId: s.id, status, note: extra.note ?? STATUS_LABEL[status], city: cityName ?? null, lat: pos.lat, lng: pos.lng, at: now() });
  emit('shipment.status', { id: s.id, awb: s.awb, status });
  return s;
}

function createShipment(st: Store, u: UserRec | null, b: any, opts: { status?: 'BOOKED' | 'REQUESTED'; note?: string } = {}) {
  const d = st.d;
  if (!b.consigneeName || !b.consigneePhone || !b.consigneeAddress) throw new DemoError(400, 'Receiver name, phone and address are needed');
  if (!/^[6-9]\d{9}$/.test(String(b.consigneePhone))) throw new DemoError(400, 'Receiver mobile must be a 10-digit Indian number');
  if (!(Number(b.weightKg) > 0)) throw new DemoError(400, 'Weight must be more than zero');
  const from = city(b.originCity);
  const to = city(b.destCity);
  const customerId = u?.role === 'customer' ? (u.customerId ?? null) : (b.customerId ?? null);
  const cust = customerId ? d.customers.find((c) => c.id === customerId) : undefined;
  const shipperName = b.shipperName || cust?.name;
  if (!shipperName) throw new DemoError(400, 'Shipper name is needed');
  const sig = signals(d, b.service, from.name, to.name);
  const q = quote({ ...b, origin: from.name, destination: to.name, dieselPrice: d.org.settings.dieselPrice, gst: d.org.settings.gst, ...sig });
  const hist = d.shipments.filter((s) => s.consigneePhone === b.consigneePhone);
  const risk = rtoRisk({ paymentMode: b.paymentMode, codAmount: b.codAmount, consigneePhone: b.consigneePhone, address: b.consigneeAddress, destination: to.name, history: { delivered: hist.filter((s) => s.status === 'DELIVERED').length, returned: hist.filter((s) => s.status.startsWith('RTO')).length }, orderHour: new Date().getHours() });
  const eta = predictEta({ service: b.service, distanceKm: q.distanceKm, vehicleType: q.vehicleType, destination: to });
  const s: ShipmentRec = {
    id: uid(), orgId: d.org.id, awb: makeAwb(), service: b.service, status: opts.status ?? 'BOOKED', customerId, shipperName, shipperPhone: b.shipperPhone ?? cust?.phone ?? null,
    consigneeName: b.consigneeName, consigneePhone: b.consigneePhone, consigneeAddress: b.consigneeAddress, pickupAddress: b.pickupAddress ?? null, contents: b.contents ?? null, shipperInvoiceNo: b.shipperInvoiceNo ?? null,
    originCity: from.name, originLat: from.lat, originLng: from.lng, destCity: to.name, destLat: to.lat, destLng: to.lng, weightKg: b.weightKg, packages: b.packages ?? 1, declaredValue: b.declaredValue ?? 0, paymentMode: b.paymentMode ?? 'PREPAID',
    codAmount: b.paymentMode === 'COD' ? (b.codAmount ?? 0) : 0, codCollected: false, price: q.total, priceBreakup: q.lines, gstRate: q.gstRate, distanceKm: q.distanceKm,
    co2Kg: shipmentCo2Kg(b.service, q.distanceKm, q.chargeableKg, q.vehicleType), rtoScore: risk.score, rtoLevel: risk.level, ewaybillRequired: (b.declaredValue ?? 0) > 50000,
    ewaybillNo: null, vehicleType: q.vehicleType ?? null, tripId: null, invoiceId: null, deliveryOtp: deliveryOtp(), attempts: 0, currentLat: from.lat, currentLng: from.lng,
    promisedAt: eta.arriveAt, etaAt: eta.arriveAt, podReceiver: null, podPhotoUrl: null, podSignatureUrl: null, deliveredAt: null, createdAt: now(), updatedAt: now(),
  };
  d.shipments.unshift(s);
  d.events.push({ id: uid(), orgId: d.org.id, shipmentId: s.id, status: s.status, note: opts.note ?? `Booked at ₹${q.total.toLocaleString('en-IN')}; return risk ${risk.score}/100`, city: from.name, lat: from.lat, lng: from.lng, at: now() });
  if (s.status === 'REQUESTED') {
    emit('shipment.requested', { id: s.id, awb: s.awb, originCity: s.originCity, destCity: s.destCity, senderName: s.shipperName });
    return s;
  }
  announce(st, s);
  return s;
}

function announce(st: Store, s: ShipmentRec) {
  notify(st, s.consigneePhone, 'booking_confirmed', `Namaste ${s.consigneeName}, your shipment ${s.awb} from ${s.originCity} is booked with ${st.d.org.name}. Track it: surajlogistic.in/track/${s.awb}`);
  emit('shipment.created', { id: s.id, awb: s.awb });
}

type Ctx = { m: RegExpMatchArray; b: any; q: URLSearchParams; token: string | null };
type Handler = (c: Ctx) => unknown;
const routes: [string, RegExp, Handler][] = [];
const on = (method: string, pattern: string, h: Handler) => routes.push([method, new RegExp(`^${pattern.replace(/:(\w+)/g, '([^/]+)')}$`), h]);
const auth = (c: Ctx, ...roles: Role[]) => {
  const r = storeOf(c.token);
  if (roles.length) need(r.u, ...roles);
  return { ...r, d: r.s.d };
};

/* ---------- Auth and company ---------- */

on('POST', '/api/auth/login', ({ b }) => {
  boot();
  const id = String(b.email ?? '').trim().toLowerCase();
  const phone = id.replace(/\D/g, '').slice(-10);
  for (const s of stores) {
    const u = s.d.users.find((x) => x.email === id || (!id.includes('@') && phone.length === 10 && x.phone?.replace(/\D/g, '').slice(-10) === phone));
    if (!u) continue;
    const pw = s.passwords.get(u.id) ?? DEMO_PASSWORD;
    if (b.password !== pw) throw new DemoError(401, 'Wrong email, mobile number or password');
    return { token: u.id, user: publicUser(u), org: s.d.org };
  }
  // Someone who asked to join is told where their request stands, once the password matches.
  for (const s of stores) {
    const r = [...s.d.joinRequests].reverse().find((x) => x.email === id || (!id.includes('@') && phone.length === 10 && x.phone === phone));
    if (!r || r.status === 'APPROVED') continue;
    if (b.password !== (s.joinPasswords.get(r.id) ?? DEMO_PASSWORD)) break;
    if (r.status === 'PENDING') throw new DemoError(403, 'Your request to join is waiting for approval. We will message you when your login is ready.');
    throw new DemoError(403, `Your request to join was not approved${r.note ? `: ${r.note}` : ''}. Call us if you think this is a mistake.`);
  }
  throw new DemoError(401, 'Wrong email, mobile number or password');
});
on('POST', '/api/auth/register', () => {
  throw new DemoError(403, 'New company accounts are closed. Ask to join as a truck owner, driver, customer or warehouse staff instead.');
});
on('GET', '/api/me', (c) => {
  const { u, d } = auth(c);
  return { user: publicUser(u), org: d.org };
});
on('PATCH', '/api/me', (c) => {
  const { u, d } = auth(c);
  const b = c.b;
  if (b.name !== undefined && String(b.name).trim().length < 2) throw new DemoError(400, 'Enter your name');
  let phone: string | null | undefined;
  if (b.phone !== undefined) {
    const p = String(b.phone).replace(/\D/g, '').slice(-10);
    if (b.phone && !/^[6-9]\d{9}$/.test(p)) throw new DemoError(400, 'Mobile number should be 10 digits');
    if (p && d.users.some((x) => x.id !== u.id && x.phone === p)) throw new DemoError(409, 'Another login already uses this mobile number');
    phone = p || null;
  }
  if (b.name) u.name = String(b.name).trim();
  if (phone !== undefined) u.phone = phone;
  if (b.lang === 'en' || b.lang === 'hi') u.lang = b.lang;
  return publicUser(u);
});
on('POST', '/api/me/password', (c) => {
  const { s, u } = auth(c);
  const cur = s.passwords.get(u.id) ?? DEMO_PASSWORD;
  if (String(c.b.current ?? '') !== cur) throw new DemoError(400, 'Your current password is not right');
  const next = String(c.b.next ?? '');
  if (next.length < 8) throw new DemoError(400, 'Use at least 8 characters');
  if (next === cur) throw new DemoError(400, 'Pick a password different from the current one');
  s.passwords.set(u.id, next);
  return { changed: true };
});
on('GET', '/api/meta', () => ({ cities: CITIES, vehicleClasses: Object.values(VEHICLE_CLASSES), statuses: SHIPMENT_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })), copilotSuggestions: COPILOT_SUGGESTIONS }));
on('PATCH', '/api/org/settings', (c) => {
  const { d } = auth(c, 'admin');
  const o = d.org;
  const b = c.b;
  if (b.name) o.name = String(b.name);
  if (b.gstin !== undefined) {
    if (b.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(b.gstin)) throw new DemoError(400, 'GSTIN should look like 08ABCDE1234F1Z5');
    o.gstin = b.gstin || null;
  }
  if (b.dieselPrice) o.settings.dieselPrice = b.dieselPrice;
  if (b.gstCourier !== undefined || b.gstTransport !== undefined) o.settings.gst = { courier: b.gstCourier ?? o.settings.gst.courier, transport: b.gstTransport ?? o.settings.gst.transport };
  if (b.profile) o.settings.profile = { ...o.settings.profile, ...b.profile };
  if (b.bank) o.settings.bank = { ...o.settings.bank, ...b.bank };
  if (b.notify) o.settings.notify = { ...o.settings.notify, ...b.notify };
  if (b.paymentTermsDays) o.settings.paymentTermsDays = b.paymentTermsDays;
  if (b.modules) o.modules = b.modules;
  return o;
});
on('GET', '/api/org/export', (c) => {
  const { s, d } = auth(c, 'admin');
  return { exportedAt: now(), org: d.org, users: d.users.map(publicUser), customers: d.customers, vehicles: d.vehicles, drivers: d.drivers, trips: d.trips, shipments: d.shipments.map((x) => strip(x)), events: d.events, loads: d.loads, bids: d.bids, facilities: d.facilities, inventory: d.items, stockMoves: d.moves, invoices: d.invoices, messages: s.outbox, expenses: s.expenses };
});
on('DELETE', '/api/org', (c) => {
  const { s, d } = auth(c, 'admin');
  if (String(c.b.confirm ?? '').trim() !== d.org.name) throw new DemoError(400, 'Type the company name exactly to confirm');
  stores.splice(stores.indexOf(s), 1);
  return { deleted: true };
});

/* ---------- People ---------- */

on('GET', '/api/users', (c) => {
  const { d } = auth(c, 'admin');
  return d.users.map((u) => ({ ...publicUser(u), customerName: u.customerId ? (d.customers.find((x) => x.id === u.customerId)?.name ?? null) : null }));
});
on('POST', '/api/users', (c) => {
  const { s, d } = auth(c, 'admin');
  const b = c.b;
  const email = String(b.email ?? '').toLowerCase();
  if (!b.name || String(b.name).length < 2) throw new DemoError(400, 'Name is needed');
  if (!email.includes('@')) throw new DemoError(400, 'Enter a valid email');
  if (!b.password || String(b.password).length < 8) throw new DemoError(400, 'Password needs at least 8 characters');
  if (stores.some((x) => x.d.users.some((u) => u.email === email))) throw new DemoError(409, 'An account with this email already exists');
  if (b.phone && b.role === 'driver' && stores.some((x) => x.d.users.some((u) => u.phone?.replace(/\D/g, '').slice(-10) === String(b.phone).replace(/\D/g, '').slice(-10)))) throw new DemoError(409, 'This mobile number already has a login');
  const u: UserRec = { id: uid(), orgId: d.org.id, name: b.name, email, phone: b.phone ?? null, role: b.role, lang: b.lang ?? 'en', customerId: b.customerId ?? null, createdAt: now() };
  d.users.push(u);
  s.passwords.set(u.id, b.password);
  if (b.role === 'driver' && b.driverId) {
    const dr = d.drivers.find((x) => x.id === b.driverId);
    if (dr) dr.userId = u.id;
  }
  return publicUser(u);
});
on('PATCH', '/api/users/:id', (c) => {
  const { s, d } = auth(c, 'admin');
  const u = d.users.find((x) => x.id === c.m[1]);
  if (!u) throw new DemoError(404, 'Person not found');
  if (c.b.password) {
    if (String(c.b.password).length < 8) throw new DemoError(400, 'Password needs at least 8 characters');
    s.passwords.set(u.id, c.b.password);
  }
  if (c.b.role) u.role = c.b.role;
  return publicUser(u);
});
on('DELETE', '/api/users/:id', (c) => {
  const { d, u: me } = auth(c, 'admin');
  if (c.m[1] === me.id) throw new DemoError(400, 'You cannot remove your own login');
  const i = d.users.findIndex((x) => x.id === c.m[1]);
  if (i < 0) throw new DemoError(404, 'Person not found');
  d.drivers.forEach((dr) => dr.userId === c.m[1] && (dr.userId = null));
  d.users.splice(i, 1);
  return { removed: true };
});

/* ---------- Control tower ---------- */

on('GET', '/api/dashboard', (c) => computeDashboard(auth(c, ...STAFF).d));
on('POST', '/api/copilot', (c) => {
  const { d } = auth(c, ...STAFF);
  const parsed = parseQuery(String(c.b.message ?? ''));
  const { facts: _f, ...rest } = answerQuery(parsed, d, { dieselPrice: d.org.settings.dieselPrice, gst: d.org.settings.gst });
  return { ...rest, parsed: { intent: parsed.intent, cities: parsed.cities, lang: parsed.lang } };
});
on('GET', '/api/notifications', (c) => auth(c, ...STAFF).s.outbox);
on('GET', '/api/search', (c) => {
  const { u, d } = auth(c);
  const term = (c.q.get('q') ?? '').trim().toLowerCase();
  if (term.length < 2) return { shipments: [], trips: [], vehicles: [], customers: [] };
  const compact = term.replace(/\s+/g, '');
  if (u.role === 'partner' || u.role === 'driver' || u.role === 'warehouse') return { shipments: [], trips: [], vehicles: [], customers: [] };
  const mine = u.role === 'customer' ? d.shipments.filter((s) => s.customerId === u.customerId) : d.shipments;
  const staff = u.role === 'admin' || u.role === 'ops';
  return {
    shipments: mine.filter((s) => s.awb.toLowerCase().includes(compact) || s.consigneeName.toLowerCase().includes(term) || s.consigneePhone.includes(compact)).slice(0, 6).map((s) => ({ id: s.id, awb: s.awb, lane: `${s.originCity}–${s.destCity}`, status: s.status, consigneeName: s.consigneeName })),
    trips: staff ? d.trips.filter((t) => t.tripNo.toLowerCase().includes(compact)).slice(0, 4).map((t) => ({ id: t.id, tripNo: t.tripNo, lane: `${t.originCity}–${t.destCity}`, status: t.status, regNo: d.vehicles.find((v) => v.id === t.vehicleId)?.regNo ?? '' })) : [],
    vehicles: staff ? d.vehicles.filter((v) => v.regNo.toLowerCase().replace(/\s+/g, '').includes(compact)).slice(0, 4).map((v) => ({ id: v.id, regNo: v.regNo, city: v.city, status: v.status })) : [],
    customers: staff ? d.customers.filter((x) => x.name.toLowerCase().includes(term) || (x.gstin ?? '').toLowerCase().includes(compact)).slice(0, 4).map((x) => ({ id: x.id, name: x.name, city: x.city })) : [],
  };
});
on('GET', '/api/reports', (c) => {
  const { d } = auth(c, ...STAFF);
  const from = c.q.get('from');
  const to = c.q.get('to');
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new DemoError(400, 'Pick a from and to date');
  return computeReport(d, from, to);
});

/* ---------- Shipments ---------- */

on('POST', '/api/quotes', (c) => {
  const { d } = auth(c);
  const b = c.b;
  city(b.originCity);
  city(b.destCity);
  const sig = signals(d, b.service, b.originCity, b.destCity);
  const q = quote({ ...b, origin: b.originCity, destination: b.destCity, dieselPrice: d.org.settings.dieselPrice, gst: d.org.settings.gst, ...sig });
  return { quote: q, signals: sig, co2Kg: shipmentCo2Kg(b.service, q.distanceKm, q.chargeableKg, q.vehicleType), rtoPreview: rtoRisk({ paymentMode: b.paymentMode ?? 'PREPAID', codAmount: b.codAmount, destination: b.destCity }) };
});
on('POST', '/api/shipments', (c) => {
  const { s, u } = auth(c, ...STAFF, 'customer');
  return strip(createShipment(s, u, c.b));
});
on('POST', '/api/shipments/bulk', (c) => {
  const { s, u, d } = auth(c, ...STAFF, 'customer');
  const rows = (c.b.rows ?? []) as any[];
  if (!rows.length) throw new DemoError(400, 'No rows to book');
  if (rows.length > 500) throw new DemoError(400, 'Upload up to 500 rows at a time');
  const customerId = u.role === 'customer' ? u.customerId : c.b.customerId;
  if (!customerId || !d.customers.some((x) => x.id === customerId)) throw new DemoError(400, 'Choose the shipper for these rows');
  const results = rows.map((r) => {
    try {
      if (c.b.dryRun) {
        city(r.originCity);
        city(r.destCity);
        const q = quote({ ...r, origin: r.originCity, destination: r.destCity, dieselPrice: d.org.settings.dieselPrice, gst: d.org.settings.gst, ...signals(d, r.service, r.originCity, r.destCity) });
        return { row: r.row, ok: true, price: q.total };
      }
      const sh = createShipment(s, u, { ...r, customerId });
      return { row: r.row, ok: true, price: sh.price, id: sh.id, awb: sh.awb };
    } catch (e) {
      return { row: r.row, ok: false, error: e instanceof Error ? e.message : 'Could not book' };
    }
  });
  return { results };
});
const GROUPS: Record<string, ShipmentStatus[]> = { requested: ['REQUESTED'], booked: ['BOOKED'], moving: ['PICKED_UP', 'IN_TRANSIT', 'AT_HUB', 'OUT_FOR_DELIVERY'], action: ['NDR', 'RTO'], delivered: ['DELIVERED'] };
on('GET', '/api/shipments', (c) => {
  const { u, d } = auth(c, ...STAFF, 'customer');
  let list = d.shipments;
  if (u.role === 'customer') list = list.filter((s) => s.customerId === u.customerId);
  const sv = c.q.get('service');
  if (sv) list = list.filter((s) => s.service === sv);
  const trip = c.q.get('tripId');
  if (trip) list = list.filter((s) => s.tripId === trip);
  const term = c.q.get('q')?.toLowerCase();
  if (term) list = list.filter((s) => [s.awb, s.consigneeName, s.shipperName, s.destCity, s.originCity].some((x) => x.toLowerCase().includes(term)));
  const counts = { all: list.length, ...Object.fromEntries(Object.entries(GROUPS).map(([k, v]) => [k, list.filter((s) => v.includes(s.status)).length])) };
  const st = c.q.get('status');
  if (st) {
    const set = new Set(st.split(','));
    list = list.filter((s) => set.has(s.status));
  }
  list = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { items: list.slice(0, Number(c.q.get('limit') ?? 100)).map((s) => strip(s)), total: list.length, counts };
});
on('GET', '/api/shipments/:id', (c) => {
  const { u, d } = auth(c, ...STAFF, 'customer', 'driver');
  const s = d.shipments.find((x) => x.id === c.m[1]);
  if (!s || (u.role === 'customer' && s.customerId !== u.customerId)) throw new DemoError(404, 'Shipment not found');
  const events = d.events.filter((e) => e.shipmentId === s.id).sort((a, b) => a.at.localeCompare(b.at));
  const t = s.tripId ? (d.trips.find((x) => x.id === s.tripId) ?? null) : null;
  return { ...strip(s, u.role === 'admin' || u.role === 'ops'), events, trip: t ? { ...t, regNo: d.vehicles.find((v) => v.id === t.vehicleId)?.regNo } : null, nextStatuses: nextStatuses(s.service, s.status) };
});
on('POST', '/api/shipments/:id/status', (c) => {
  const { s: st, u, d } = auth(c, ...STAFF, 'driver', 'customer');
  const s = d.shipments.find((x) => x.id === c.m[1]);
  if (!s) throw new DemoError(404, 'Shipment not found');
  const b = c.b;
  if (u.role === 'customer' && (s.customerId !== u.customerId || b.status !== 'CANCELLED' || s.status !== 'BOOKED')) throw new DemoError(403, 'You can only cancel your own booking before pickup');
  if (s.status === 'REQUESTED') {
    if (!STAFF.includes(u.role)) throw new DemoError(403, 'Only the office can confirm a website booking');
    if (!canTransition(s.service, s.status, b.status)) throw new DemoError(400, 'Confirm or decline this booking first');
    if (b.status === 'CANCELLED' && !String(b.note ?? '').trim()) throw new DemoError(400, 'Say why you cannot take this booking; we send it to the sender');
    const ok = b.status === 'BOOKED';
    const phone = d.org.settings.profile?.phone;
    if (s.shipperPhone)
      notify(st, s.shipperPhone, ok ? 'booking_accepted' : 'booking_declined', ok ? `Your booking ${s.awb} with ${d.org.name} is confirmed. We will pick up from ${s.pickupAddress ?? s.originCity}. Track it: surajlogistic.in/track/${s.awb}` : `Sorry, ${d.org.name} could not take booking ${s.awb}: ${b.note}.${phone ? ` Call ${phone} for help.` : ''}`);
    applyStatus(st, s, b.status, { note: b.note || (ok ? 'Confirmed by our team; pickup being arranged' : undefined) });
    if (ok) announce(st, s);
    return strip(s);
  }
  if (u.role === 'driver') {
    const dr = d.drivers.find((x) => x.userId === u.id);
    const t = d.trips.find((x) => x.id === s.tripId);
    if (!dr || !t || t.driverId !== dr.id) throw new DemoError(403, 'This shipment is not on your truck');
  }
  if (!canTransition(s.service, s.status, b.status)) throw new DemoError(400, `Cannot go from "${STATUS_LABEL[s.status]}" to "${STATUS_LABEL[b.status as ShipmentStatus]}"`);
  if (b.status === 'DELIVERED' && b.otp !== s.deliveryOtp && !(u.role === 'admin' && b.otp === 'OVERRIDE')) throw new DemoError(400, 'The OTP does not match. Ask the receiver to read it again from the SMS or WhatsApp.');
  if (b.status === 'OUT_FOR_DELIVERY') notify(st, s.consigneePhone, 'out_for_delivery', `${s.awb} is out for delivery in ${s.destCity} today. Share OTP ${s.deliveryOtp} only at handover.`);
  if (b.status === 'NDR') notify(st, s.consigneePhone, 'ndr_reschedule', `We could not deliver ${s.awb}. Pick a new day: surajlogistic.in/track/${s.awb}`);
  if (b.status === 'DELIVERED') notify(st, s.consigneePhone, 'delivered', `${s.awb} was delivered${b.receiverName ? ` to ${b.receiverName}` : ''}. Thank you for choosing ${d.org.name}.`);
  return strip(applyStatus(st, s, b.status, { note: b.note, city: b.city, receiverName: b.receiverName }));
});
on('POST', '/api/shipments/:id/pod', (c) => {
  const { d } = auth(c, ...STAFF, 'driver');
  const s = d.shipments.find((x) => x.id === c.m[1]);
  if (!s) throw new DemoError(404, 'Shipment not found');
  if (s.status !== 'DELIVERED') throw new DemoError(400, 'Record the delivery first');
  if (c.b.photo) s.podPhotoUrl = String(c.b.photo);
  if (c.b.signature) s.podSignatureUrl = String(c.b.signature);
  return { ok: true };
});
on('POST', '/api/shipments/:id/ewaybill', (c) => {
  const { d } = auth(c, ...STAFF);
  const s = d.shipments.find((x) => x.id === c.m[1]);
  if (!s) throw new DemoError(404, 'Shipment not found');
  const valid = new Date();
  valid.setDate(valid.getDate() + Math.max(1, Math.ceil(s.distanceKm / 200)));
  if (s.ewaybillNo) return { ewbNo: s.ewaybillNo, alreadyGenerated: true, validUntil: valid.toISOString() };
  s.ewaybillNo = String(Math.floor(100000000000 + Math.random() * 899999999999));
  return { ewbNo: s.ewaybillNo, generatedAt: now(), validUntil: valid.toISOString(), provider: 'mock-gsp', required: s.ewaybillRequired };
});
function findAwb(awb: string) {
  boot();
  const code = decodeURIComponent(awb).toUpperCase();
  for (const st of stores) {
    const s = st.d.shipments.find((x) => x.awb === code);
    if (s) return { st, s };
  }
  throw new DemoError(404, 'No shipment with this tracking number');
}
on('GET', '/api/track/:awb', (c) => {
  const { st, s } = findAwb(c.m[1]!);
  const events = st.d.events.filter((e) => e.shipmentId === s.id).sort((a, b) => b.at.localeCompare(a.at));
  return {
    awb: s.awb, service: s.service, status: s.status, statusLabel: STATUS_LABEL[s.status], originCity: s.originCity, destCity: s.destCity,
    origin: { lat: s.originLat, lng: s.originLng }, destination: { lat: s.destLat, lng: s.destLng }, current: { lat: s.currentLat, lng: s.currentLng },
    weightKg: s.weightKg, packages: s.packages, etaAt: s.etaAt, promisedAt: s.promisedAt, deliveredAt: s.deliveredAt,
    receivedBy: s.podReceiver ? `${s.podReceiver[0]}***` : null, co2Kg: s.co2Kg, carrier: { name: st.d.org.name, phone: st.d.org.settings.profile?.phone ?? null },
    canReschedule: ['NDR', 'OUT_FOR_DELIVERY'].includes(s.status),
    events: events.map((e) => ({ status: e.status, label: STATUS_LABEL[e.status], note: e.note, city: e.city, at: e.at })),
  };
});
on('POST', '/api/track/:awb/reschedule', (c) => {
  const { st, s } = findAwb(c.m[1]!);
  if (!['NDR', 'OUT_FOR_DELIVERY'].includes(s.status)) throw new DemoError(400, 'This shipment cannot be rescheduled now');
  if (String(c.b.phoneLast4 ?? '') !== s.consigneePhone.slice(-4)) throw new DemoError(400, 'Those digits do not match the mobile number on the booking');
  const day = String(c.b.date ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new DemoError(400, 'Pick a day');
  const note = `Receiver asked for delivery on ${new Date(day + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}${c.b.address ? ' and added a note for the driver' : ''}`;
  st.d.events.push({ id: uid(), orgId: s.orgId, shipmentId: s.id, status: s.status, note, city: s.destCity, lat: null, lng: null, at: now() });
  if (c.b.address) s.consigneeAddress = `${s.consigneeAddress} (${String(c.b.address).slice(0, 160)})`;
  emit('shipment.status', { id: s.id, awb: s.awb, status: s.status });
  return { ok: true };
});

/* ---------- Fleet ---------- */

on('GET', '/api/vehicles', (c) => [...auth(c, ...STAFF).d.vehicles].sort((a, b) => a.regNo.localeCompare(b.regNo)).map((v) => ({ ...v, alerts: docAlerts(v, new Date()) })));
on('GET', '/api/vehicles/:id', (c) => {
  const { d } = auth(c, ...STAFF);
  const v = d.vehicles.find((x) => x.id === c.m[1]);
  if (!v) throw new DemoError(404, 'Vehicle not found');
  return { ...v, alerts: docAlerts(v, new Date()), trips: d.trips.filter((t) => t.vehicleId === v.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10).map((t) => ({ ...t, pnl: tripPnl(t) })) };
});
on('POST', '/api/vehicles', (c) => {
  const { d } = auth(c, ...STAFF);
  const b = c.b;
  const ct = city(b.city);
  const vc = VEHICLE_CLASSES[b.type as keyof typeof VEHICLE_CLASSES];
  if (!vc) throw new DemoError(400, 'Choose a vehicle type');
  const regNo = String(b.regNo ?? '').toUpperCase().replace(/\s+/g, ' ').trim();
  if (regNo.replace(/\s/g, '').length < 6) throw new DemoError(400, 'Enter the registration number');
  if (d.vehicles.some((v) => v.regNo.replace(/\s/g, '') === regNo.replace(/\s/g, ''))) throw new DemoError(409, 'This vehicle is already in your fleet');
  const v = { id: uid(), orgId: d.org.id, regNo, type: vc.type, ownership: b.ownership ?? 'OWN', status: 'IDLE' as const, capacityKg: vc.capacityKg, city: ct.name, lat: ct.lat, lng: ct.lng, kmpl: vc.kmpl, odometerKm: 0, docs: b.docs ?? {}, lastPingAt: null, createdAt: now() };
  d.vehicles.push(v);
  return v;
});
on('PATCH', '/api/vehicles/:id', (c) => {
  const { d } = auth(c, ...STAFF);
  const v = d.vehicles.find((x) => x.id === c.m[1]);
  if (!v) throw new DemoError(404, 'Vehicle not found');
  if (c.b.status) {
    if (v.status === 'ON_TRIP') throw new DemoError(400, 'Close the trip first');
    v.status = c.b.status;
  }
  if (c.b.docs) v.docs = { ...v.docs, ...c.b.docs };
  return v;
});
on('POST', '/api/vehicles/:id/verify', (c) => {
  const { d } = auth(c, ...STAFF);
  const v = d.vehicles.find((x) => x.id === c.m[1]);
  if (!v) throw new DemoError(404, 'Vehicle not found');
  const today = new Date().toISOString().slice(0, 10);
  const names: Record<string, string> = { insurance: 'Insurance', fitness: 'Fitness', permit: 'Permit', puc: 'PUC', roadTax: 'Road tax' };
  return { regNo: v.regNo, verified: true, source: 'VAHAN via ULIP, demo', fitnessUpto: v.docs.fitness, insuranceUpto: v.docs.insurance, permitUpto: v.docs.permit, pucUpto: v.docs.puc, remarks: Object.entries(v.docs).filter(([, x]) => x && x < today).map(([k, x]) => `${names[k] ?? k} expired on ${x}`) };
});
on('GET', '/api/drivers', (c) => [...auth(c, ...STAFF).d.drivers].sort((a, b) => a.name.localeCompare(b.name)).map((x) => ({ ...x, licenseDays: daysUntil(x.licenseExpiry, new Date()) })));
on('POST', '/api/drivers', (c) => {
  const { d } = auth(c, ...STAFF);
  const b = c.b;
  if (!b.name || !b.phone || !b.licenseNo || !b.licenseExpiry) throw new DemoError(400, 'Name, mobile, licence number and expiry are needed');
  const dr = { id: uid(), orgId: d.org.id, userId: null, name: b.name, phone: b.phone, licenseNo: String(b.licenseNo).toUpperCase(), licenseExpiry: b.licenseExpiry, status: 'AVAILABLE' as const, rating: 4.5, lang: b.lang ?? 'hi', createdAt: now() };
  d.drivers.push(dr);
  return dr;
});
on('POST', '/api/drivers/:id/verify', (c) => {
  const { d } = auth(c, ...STAFF);
  const dr = d.drivers.find((x) => x.id === c.m[1]);
  if (!dr) throw new DemoError(404, 'Driver not found');
  const days = daysUntil(dr.licenseExpiry, new Date());
  return { licenseNo: dr.licenseNo, valid: days >= 0, validTill: dr.licenseExpiry, source: 'Sarathi via ULIP, demo', remarks: days < 0 ? [`Expired ${-days} days ago. The driver must not drive until it is renewed.`] : days <= 30 ? [`Ends in ${days} days. Remind the driver to renew.`] : [] };
});

/* ---------- Trips ---------- */

const tripView = (d: DemoDataset, t: TripRec) => {
  const v = d.vehicles.find((x) => x.id === t.vehicleId)!;
  const dr = d.drivers.find((x) => x.id === t.driverId)!;
  return { ...t, regNo: v.regNo, vehicleType: v.type, driverName: dr.name, driverPhone: dr.phone, pnl: tripPnl(t) };
};
on('GET', '/api/trips', (c) => {
  const { d } = auth(c, ...STAFF);
  let list = [...d.trips].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const st = c.q.get('status');
  if (st) list = list.filter((x) => st.split(',').includes(x.status));
  return list.map((t) => tripView(d, t));
});
on('GET', '/api/trips/:id', (c) => {
  const { s, d } = auth(c, ...STAFF, 'driver');
  const t = d.trips.find((x) => x.id === c.m[1]);
  if (!t) throw new DemoError(404, 'Trip not found');
  return { ...t, vehicle: d.vehicles.find((x) => x.id === t.vehicleId), driver: d.drivers.find((x) => x.id === t.driverId), shipments: d.shipments.filter((x) => x.tripId === t.id).map((x) => strip(x)), pings: d.pings.filter((p) => p.tripId === t.id), pnl: tripPnl(t), expenses: s.expenses.filter((e) => e.tripId === t.id) };
});
on('POST', '/api/trips', (c) => {
  const { d } = auth(c, ...STAFF);
  const b = c.b;
  const a = city(b.originCity);
  const z = city(b.destCity);
  const v = d.vehicles.find((x) => x.id === b.vehicleId);
  const dr = d.drivers.find((x) => x.id === b.driverId);
  if (!v || !dr) throw new DemoError(400, 'Choose a truck and a driver');
  if (v.status !== 'IDLE') throw new DemoError(400, `${v.regNo} is not free right now`);
  if (dr.status !== 'AVAILABLE') throw new DemoError(400, `${dr.name} is not available`);
  if (daysUntil(dr.licenseExpiry, new Date()) < 0) throw new DemoError(400, `${dr.name}'s licence has expired`);
  const attach = d.shipments.filter((s) => (b.shipmentIds ?? []).includes(s.id));
  const weight = attach.reduce((s, x) => s + x.weightKg, 0);
  if (weight > v.capacityKg) throw new DemoError(400, `${Math.round(weight)} kg is more than ${v.regNo} can carry (${v.capacityKg} kg)`);
  const km = roadKm(a, z);
  const vc = VEHICLE_CLASSES[v.type];
  const eta = predictEta({ service: 'FTL', distanceKm: km, vehicleType: v.type, destination: z });
  const t: TripRec = {
    id: uid(), orgId: d.org.id, tripNo: shortCode('TRP', Math.random, 5), vehicleId: v.id, driverId: dr.id, status: 'PLANNED', originCity: a.name, originLat: a.lat, originLng: a.lng,
    destCity: z.name, destLat: z.lat, destLng: z.lng, plannedKm: km, actualKm: null, freightAmount: b.freightAmount || attach.reduce((s, x) => s + Math.round((x.price * 100) / (100 + x.gstRate)), 0),
    fuelCost: Math.round((km / vc.kmpl) * d.org.settings.dieselPrice), tollCost: Math.round(km * vc.tollPerKm), driverAdvance: b.driverAdvance ?? 0, otherCost: 0,
    currentLat: a.lat, currentLng: a.lng, progress: 0, etaAt: eta.arriveAt, promisedAt: eta.arriveAt, loadId: b.loadId ?? null, plannedStart: now(), startedAt: null, completedAt: null, createdAt: now(),
    ...(typeof b.hireAmount === 'number' ? { hireAmount: b.hireAmount, hireAdvance: Math.min(b.hireAdvance ?? 0, b.hireAmount), hireSettledAt: null } : {}),
  };
  d.trips.unshift(t);
  attach.forEach((s) => Object.assign(s, { tripId: t.id, vehicleType: v.type }));
  if (b.loadId) {
    const l = d.loads.find((x) => x.id === b.loadId);
    if (l) l.tripId = t.id;
  }
  return t;
});
on('POST', '/api/trips/:id/start', (c) => {
  const { s: st, d } = auth(c, ...STAFF, 'driver');
  const t = d.trips.find((x) => x.id === c.m[1]);
  if (!t || t.status !== 'PLANNED') throw new DemoError(400, 'Only a planned trip can be started');
  const v = d.vehicles.find((x) => x.id === t.vehicleId)!;
  const eta = predictEta({ service: 'FTL', distanceKm: t.plannedKm, vehicleType: v.type, destination: requireCity(t.destCity) });
  Object.assign(t, { status: 'IN_TRANSIT', startedAt: now(), etaAt: eta.arriveAt, promisedAt: eta.arriveAt });
  v.status = 'ON_TRIP';
  d.drivers.find((x) => x.id === t.driverId)!.status = 'ON_TRIP';
  for (const s of d.shipments.filter((x) => x.tripId === t.id)) {
    if (s.status === 'BOOKED') applyStatus(st, s, 'PICKED_UP', { city: t.originCity });
    if (canTransition(s.service, s.status, 'IN_TRANSIT')) applyStatus(st, s, 'IN_TRANSIT', { city: t.originCity, note: `Left ${t.originCity} on trip ${t.tripNo}` });
  }
  emit('trip.status', { id: t.id, tripNo: t.tripNo, status: 'IN_TRANSIT' });
  return t;
});
on('POST', '/api/trips/:id/complete', (c) => {
  const { s: st, d } = auth(c, ...STAFF, 'driver');
  const t = d.trips.find((x) => x.id === c.m[1]);
  if (!t || t.status !== 'IN_TRANSIT') throw new DemoError(400, 'Only a trip on the road can be closed');
  const b = c.b ?? {};
  Object.assign(t, { status: 'COMPLETED', completedAt: now(), progress: 1, currentLat: t.destLat, currentLng: t.destLng, actualKm: b.actualKm ?? t.plannedKm, fuelCost: b.fuelCost ?? t.fuelCost, tollCost: b.tollCost ?? t.tollCost, otherCost: b.otherCost ?? t.otherCost });
  Object.assign(d.vehicles.find((x) => x.id === t.vehicleId)!, { status: 'IDLE', city: t.destCity, lat: t.destLat, lng: t.destLng });
  d.drivers.find((x) => x.id === t.driverId)!.status = 'AVAILABLE';
  for (const s of d.shipments.filter((x) => x.tripId === t.id)) if (s.service !== 'FTL' && canTransition(s.service, s.status, 'AT_HUB')) applyStatus(st, s, 'AT_HUB', { city: t.destCity, note: `Unloaded at ${t.destCity} from ${t.tripNo}` });
  emit('trip.status', { id: t.id, tripNo: t.tripNo, status: 'COMPLETED' });
  return { ...t, pnl: tripPnl(t) };
});
on('POST', '/api/trips/:id/expenses', (c) => {
  const { s, u, d } = auth(c, ...STAFF, 'driver');
  const t = d.trips.find((x) => x.id === c.m[1]);
  if (!t) throw new DemoError(404, 'Trip not found');
  if (u.role === 'driver' && d.drivers.find((x) => x.userId === u.id)?.id !== t.driverId) throw new DemoError(403, 'This is not your trip');
  const amount = Number(c.b.amount);
  if (!(amount > 0) || amount > 500000) throw new DemoError(400, 'Enter the amount spent');
  const e: Expense = { id: uid(), tripId: t.id, kind: String(c.b.kind ?? 'OTHER'), amount: Math.round(amount), note: c.b.note ?? null, photoUrl: c.b.photo ?? null, at: now() };
  s.expenses.unshift(e);
  return e;
});
on('POST', '/api/routes/optimize', (c) => {
  auth(c, ...STAFF);
  const start = city(c.b.start);
  const stops = (c.b.stops as string[]).map((n, i) => ({ id: `${i}:${n}`, label: city(n).name, ...city(n) }));
  if (stops.length < 2) throw new DemoError(400, 'Add at least two stops');
  const plan = optimizeRoute(start, stops, !!c.b.returnToStart);
  return { ...plan, order: plan.stops.map((s) => s.label) };
});

/* ---------- Load board ---------- */

on('GET', '/api/loads', (c) => {
  const { d } = auth(c, ...STAFF);
  let list = [...d.loads].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (c.q.get('scope') === 'open') list = list.filter((l) => l.status === 'OPEN');
  return list.map((l) => {
    const lb = d.bids.filter((b) => b.loadId === l.id);
    return { ...l, mine: true, bidCount: lb.length, bestBid: lb.length ? Math.min(...lb.map((b) => b.amount)) : null, myBid: null };
  });
});
on('GET', '/api/loads/:id', (c) => {
  const { d } = auth(c, ...STAFF);
  const l = d.loads.find((x) => x.id === c.m[1]);
  if (!l) throw new DemoError(404, 'Load not found');
  const idle = d.vehicles.filter((v) => v.status === 'IDLE');
  const sugg = suggestTrucks(asMatch(l), idle.map((v) => ({ id: v.id, type: v.type, at: { lat: v.lat, lng: v.lng } }))).slice(0, 5);
  return { ...l, mine: true, bids: d.bids.filter((b) => b.loadId === l.id).sort((a, b) => a.amount - b.amount), suggestedTrucks: sugg.map((s) => ({ ...s, regNo: idle.find((v) => v.id === s.vehicleId)!.regNo, city: idle.find((v) => v.id === s.vehicleId)!.city })) };
});
on('POST', '/api/loads', (c) => {
  const { d } = auth(c, ...STAFF);
  const b = c.b;
  const a = city(b.originCity);
  const z = city(b.destCity);
  if (!b.material || !b.weightKg || !b.targetPrice) throw new DemoError(400, 'Material, weight and price are needed');
  const l = { id: uid(), orgId: d.org.id, loadNo: shortCode('LD', Math.random, 5), postedBy: b.postedBy || d.org.name, contactPhone: b.contactPhone ?? null, originCity: a.name, originLat: a.lat, originLng: a.lng, destCity: z.name, destLat: z.lat, destLng: z.lng, material: b.material, weightKg: b.weightKg, vehicleType: b.vehicleType ?? null, pickupDate: b.pickupDate, targetPrice: b.targetPrice, status: 'OPEN' as const, isPublic: b.isPublic ?? true, awardedBidId: null, tripId: null, createdAt: now() };
  d.loads.unshift(l);
  emit('load.created', { id: l.id, loadNo: l.loadNo });
  return l;
});
on('POST', '/api/loads/:id/bids', (c) => {
  const { d } = auth(c, ...STAFF);
  const l = d.loads.find((x) => x.id === c.m[1]);
  if (!l || l.status !== 'OPEN') throw new DemoError(400, 'This load is no longer open');
  const v = c.b.vehicleId ? d.vehicles.find((x) => x.id === c.b.vehicleId) : undefined;
  if (v && v.capacityKg < l.weightKg) throw new DemoError(400, `${v.regNo} cannot carry ${l.weightKg} kg`);
  const bid = { id: uid(), loadId: l.id, orgId: d.org.id, carrierName: v ? `${d.org.name} (${v.regNo})` : d.org.name, carrierPhone: null, vehicleId: v?.id ?? null, amount: c.b.amount, etaHours: c.b.etaHours, note: c.b.note ?? null, status: 'PENDING' as const, createdAt: now() };
  d.bids.push(bid);
  emit('load.bid', { id: l.id, loadNo: l.loadNo });
  return bid;
});
on('POST', '/api/loads/:id/accept', (c) => {
  const { d } = auth(c, ...STAFF);
  const l = d.loads.find((x) => x.id === c.m[1]);
  if (!l || l.status !== 'OPEN') throw new DemoError(400, 'This load is no longer open');
  const bid = d.bids.find((x) => x.id === c.b.bidId && x.loadId === l.id);
  if (!bid) throw new DemoError(404, 'Bid not found');
  d.bids.filter((x) => x.loadId === l.id).forEach((x) => (x.status = x.id === bid.id ? 'ACCEPTED' : 'REJECTED'));
  Object.assign(l, { status: 'BOOKED', awardedBidId: bid.id });
  emit('load.booked', { id: l.id, loadNo: l.loadNo });
  return l;
});
on('GET', '/api/vehicles/:id/return-loads', (c) => {
  const { d } = auth(c, ...STAFF);
  const v = d.vehicles.find((x) => x.id === c.m[1]);
  if (!v) throw new DemoError(404, 'Vehicle not found');
  const at = c.q.get('city') ? city(c.q.get('city')!) : v;
  const open = d.loads.filter((l) => l.status === 'OPEN');
  return findReturnLoads({ id: v.id, type: v.type, at: { lat: at.lat, lng: at.lng } }, open.map(asMatch), Number(c.q.get('radiusKm') ?? 150)).map((r) => ({ ...r, load: { ...r.load, loadNo: open.find((l) => l.id === r.load.id)!.loadNo, material: open.find((l) => l.id === r.load.id)!.material } }));
});

/* ---------- Warehouse ---------- */

const WH: Role[] = ['admin', 'ops', 'warehouse'];
on('GET', '/api/facilities', (c) => auth(c, ...WH).d.facilities);
on('POST', '/api/facilities', (c) => {
  const { d } = auth(c, ...STAFF);
  const b = c.b;
  const ct = city(b.city);
  if (!b.name || !b.code) throw new DemoError(400, 'Name and code are needed');
  if (d.facilities.some((f) => f.code === String(b.code).toUpperCase())) throw new DemoError(409, 'That code is already used');
  const f = { id: uid(), orgId: d.org.id, type: b.type ?? 'WAREHOUSE', code: String(b.code).toUpperCase(), name: b.name, city: ct.name, lat: ct.lat, lng: ct.lng, capacitySqft: b.capacitySqft ?? 0, createdAt: now() };
  d.facilities.push(f);
  return f;
});
on('GET', '/api/inventory', (c) => {
  const { d } = auth(c, ...WH);
  let items = [...d.items].sort((a, b) => a.sku.localeCompare(b.sku));
  const fac = c.q.get('facilityId');
  if (fac) items = items.filter((i) => i.facilityId === fac);
  const term = c.q.get('q')?.toLowerCase();
  if (term) items = items.filter((i) => [i.sku, i.name, i.clientName].some((x) => x.toLowerCase().includes(term)));
  return items.map((i) => ({ ...i, lowStock: i.qty < i.reorderLevel }));
});
on('POST', '/api/inventory', (c) => {
  const { d } = auth(c, ...WH);
  const b = c.b;
  if (!d.facilities.some((f) => f.id === b.facilityId)) throw new DemoError(400, 'Choose a warehouse');
  const sku = String(b.sku ?? '').toUpperCase().trim();
  if (sku.length < 2 || !b.name || !b.clientName || !b.bin) throw new DemoError(400, 'SKU, product, client and bin are needed');
  if (d.items.some((i) => i.facilityId === b.facilityId && i.sku === sku)) throw new DemoError(409, 'This SKU already exists in this warehouse');
  const it = { id: uid(), orgId: d.org.id, facilityId: b.facilityId, sku, name: b.name, clientName: b.clientName, qty: b.qty ?? 0, unit: b.unit ?? 'pcs', bin: String(b.bin).toUpperCase(), reorderLevel: b.reorderLevel ?? 0, updatedAt: now() };
  d.items.push(it);
  return it;
});
on('POST', '/api/inventory/:id/move', (c) => {
  const { d } = auth(c, ...WH);
  const it = d.items.find((x) => x.id === c.m[1]);
  if (!it) throw new DemoError(404, 'Item not found');
  const raw = Number(c.b.qty);
  if (!raw) throw new DemoError(400, 'Enter a quantity');
  const delta = c.b.type === 'INBOUND' ? Math.abs(raw) : c.b.type === 'OUTBOUND' ? -Math.abs(raw) : raw;
  if (it.qty + delta < 0) throw new DemoError(400, `Only ${it.qty} ${it.unit} in stock`);
  it.qty += delta;
  it.updatedAt = now();
  const move = { id: uid(), orgId: it.orgId, itemId: it.id, type: c.b.type, qty: delta, ref: c.b.ref ?? null, at: now() };
  d.moves.unshift(move);
  emit('stock.moved', { itemId: it.id, sku: it.sku, qty: it.qty, delta });
  return { item: { ...it, lowStock: it.qty < it.reorderLevel }, move };
});
on('GET', '/api/inventory/:id/moves', (c) => auth(c, ...WH).d.moves.filter((x) => x.itemId === c.m[1]));

/* ---------- Customers and billing ---------- */

const D30 = 30 * 24 * H;
on('GET', '/api/customers', (c) => {
  const { d } = auth(c, ...STAFF);
  const list = [...d.customers].sort((a, b) => a.name.localeCompare(b.name));
  if (!c.q.get('stats')) return list;
  return list.map((x) => {
    const mine = d.shipments.filter((s) => s.customerId === x.id);
    const recent = mine.filter((s) => Date.now() - new Date(s.createdAt).getTime() <= D30 && s.status !== 'CANCELLED');
    return {
      ...x,
      shipments30d: recent.length,
      revenue30d: recent.reduce((a, s) => a + s.price, 0),
      outstanding: d.invoices.filter((i) => (i.customerId === x.id || i.customerName === x.name) && i.status !== 'PAID').reduce((a, i) => a + i.total, 0),
      lastShipmentAt: mine.reduce<string | null>((a, s) => (!a || s.createdAt > a ? s.createdAt : a), null),
      logins: d.users.filter((u) => u.customerId === x.id).length,
    };
  });
});
on('GET', '/api/customers/:id', (c) => {
  const { d } = auth(c, ...STAFF);
  const x = d.customers.find((y) => y.id === c.m[1]);
  if (!x) throw new DemoError(404, 'Customer not found');
  const mine = d.shipments.filter((s) => s.customerId === x.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const recent = mine.filter((s) => Date.now() - new Date(s.createdAt).getTime() <= D30 && s.status !== 'CANCELLED');
  const invoices = d.invoices.filter((i) => i.customerId === x.id || i.customerName === x.name).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { ...x, shipments30d: recent.length, revenue30d: recent.reduce((a, s) => a + s.price, 0), outstanding: invoices.filter((i) => i.status !== 'PAID').reduce((a, i) => a + i.total, 0), lastShipmentAt: mine[0]?.createdAt ?? null, logins: 0, shipments: mine.slice(0, 20).map((s) => strip(s)), invoices, users: d.users.filter((u) => u.customerId === x.id).map(publicUser) };
});
function customerBody(b: any) {
  if (!b.name || String(b.name).trim().length < 2) throw new DemoError(400, 'Business name is needed');
  if (b.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(String(b.gstin))) throw new DemoError(400, 'GSTIN should look like 08ABCDE1234F1Z5');
  const ct = city(b.city);
  return { name: String(b.name).trim(), gstin: b.gstin ?? null, phone: b.phone ?? null, email: b.email ?? null, city: ct.name, address: b.address ?? null, creditDays: b.creditDays ?? null };
}
on('POST', '/api/customers', (c) => {
  const { d } = auth(c, ...STAFF);
  const x = { id: uid(), orgId: d.org.id, ...customerBody(c.b), createdAt: now() };
  d.customers.push(x);
  return x;
});
on('PATCH', '/api/customers/:id', (c) => {
  const { d } = auth(c, ...STAFF);
  const x = d.customers.find((y) => y.id === c.m[1]);
  if (!x) throw new DemoError(404, 'Customer not found');
  Object.assign(x, customerBody({ ...x, ...c.b }));
  return x;
});
on('GET', '/api/invoices', (c) => {
  const { u, d } = auth(c, ...STAFF, 'customer');
  const cust = u.role === 'customer' ? d.customers.find((x) => x.id === u.customerId) : null;
  return [...d.invoices].filter((i) => u.role !== 'customer' || ((i.customerId === u.customerId || i.customerName === cust?.name) && i.status !== 'DRAFT')).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
});
on('GET', '/api/invoices/:id', (c) => {
  const { u, d } = auth(c, ...STAFF, 'customer');
  const inv = d.invoices.find((x) => x.id === c.m[1]);
  const cust = d.customers.find((x) => x.id === inv?.customerId || x.name === inv?.customerName);
  if (!inv || (u.role === 'customer' && (cust?.id !== u.customerId || inv.status === 'DRAFT'))) throw new DemoError(404, 'Invoice not found');
  const lines = d.shipments.filter((s) => inv.shipmentIds.includes(s.id));
  return { ...inv, customerCity: cust?.city ?? null, customerAddress: cust?.address ?? null, lines: lines.map((s) => ({ awb: s.awb, service: s.service, lane: `${s.originCity}–${s.destCity}`, weightKg: s.weightKg, gstRate: s.gstRate, taxable: Math.round((s.price * 100) / (100 + s.gstRate)), total: s.price, deliveredAt: s.deliveredAt })) };
});
on('GET', '/api/billing/unbilled', (c) => {
  const { d } = auth(c, ...STAFF);
  const groups = new Map<string, { shipperName: string; customerId: string | null; shipments: unknown[]; total: number }>();
  for (const s of d.shipments.filter((x) => x.status === 'DELIVERED' && !x.invoiceId)) {
    const key = s.customerId ?? s.shipperName;
    const g = groups.get(key) ?? { shipperName: s.shipperName, customerId: s.customerId, shipments: [], total: 0 };
    g.shipments.push({ id: s.id, awb: s.awb, service: s.service, originCity: s.originCity, destCity: s.destCity, price: s.price, deliveredAt: s.deliveredAt });
    g.total += s.price;
    groups.set(key, g);
  }
  return [...groups.values()];
});
on('POST', '/api/invoices', (c) => {
  const { d } = auth(c, ...STAFF);
  const list = d.shipments.filter((s) => (c.b.shipmentIds ?? []).includes(s.id));
  if (!list.length || list.some((s) => s.status !== 'DELIVERED' || s.invoiceId)) throw new DemoError(400, 'Pick delivered shipments that are not invoiced yet');
  if (new Set(list.map((s) => s.customerId ?? s.shipperName)).size > 1) throw new DemoError(400, 'One invoice can only have one customer');
  const subtotal = list.reduce((a, s) => a + Math.round((s.price * 100) / (100 + s.gstRate)), 0);
  const total = list.reduce((a, s) => a + s.price, 0);
  const cust = d.customers.find((x) => x.id === list[0]!.customerId);
  const days = cust?.creditDays ?? d.org.settings.paymentTermsDays ?? 15;
  const inv = { id: uid(), orgId: d.org.id, invoiceNo: invoiceNumber(d.invoices.length + 1), customerId: cust?.id ?? null, customerName: cust?.name ?? list[0]!.shipperName, customerGstin: cust?.gstin ?? null, shipmentIds: list.map((s) => s.id), subtotal, gstRate: list[0]!.gstRate, gst: total - subtotal, total, status: 'DRAFT' as const, dueDate: new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10), paidAt: null, createdAt: now() };
  d.invoices.unshift(inv);
  list.forEach((s) => (s.invoiceId = inv.id));
  return inv;
});
on('PATCH', '/api/invoices/:id', (c) => {
  const { s, d } = auth(c, ...STAFF);
  const inv = d.invoices.find((x) => x.id === c.m[1]);
  if (!inv) throw new DemoError(404, 'Invoice not found');
  const order = { DRAFT: 0, SENT: 1, PAID: 2 } as const;
  if (order[c.b.status as keyof typeof order] < order[inv.status]) throw new DemoError(400, 'An invoice cannot go back a step');
  inv.status = c.b.status;
  if (c.b.status === 'PAID') inv.paidAt = c.b.paidAt ? new Date(c.b.paidAt + 'T12:00:00+05:30').toISOString() : now();
  if (c.b.status === 'SENT') {
    const cust = d.customers.find((x) => x.id === inv.customerId);
    if (cust?.phone) notify(s, cust.phone, 'invoice_sent', `Invoice ${inv.invoiceNo} for ₹${inv.total.toLocaleString('en-IN')} from ${d.org.name}, due ${inv.dueDate}.`);
  }
  emit('invoice.updated', { id: inv.id, status: inv.status });
  return inv;
});

/* ---------- API keys and webhooks ---------- */

on('GET', '/api/api-keys', (c) => auth(c, 'admin').s.keys);
on('POST', '/api/api-keys', (c) => {
  const { s } = auth(c, 'admin');
  if (!c.b.name || String(c.b.name).length < 2) throw new DemoError(400, 'Give the key a name');
  const raw = 'sl_live_' + Array.from({ length: 32 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'[Math.floor(Math.random() * 57)]).join('');
  s.keys.unshift({ id: uid(), name: c.b.name, prefix: raw.slice(0, 12), createdAt: now(), lastUsedAt: null, revokedAt: null });
  return { key: raw };
});
on('DELETE', '/api/api-keys/:id', (c) => {
  const k = auth(c, 'admin').s.keys.find((x) => x.id === c.m[1]);
  if (!k) throw new DemoError(404, 'Key not found');
  k.revokedAt = now();
  return k;
});
on('GET', '/api/webhooks', (c) => auth(c, 'admin').s.hooks.map(({ secret: _s, ...h }) => h));
on('POST', '/api/webhooks', (c) => {
  const { s } = auth(c, 'admin');
  if (!/^https:\/\/[^\s]+\.[^\s]+/.test(String(c.b.url ?? ''))) throw new DemoError(400, 'The address must start with https://');
  if (!Array.isArray(c.b.events) || !c.b.events.length) throw new DemoError(400, 'Pick at least one event');
  const secret = 'whsec_' + Math.random().toString(36).slice(2, 14);
  s.hooks.unshift({ id: uid(), url: c.b.url, events: c.b.events, active: true, lastStatus: null, lastAt: null, createdAt: now(), secret });
  return { secret };
});
on('DELETE', '/api/webhooks/:id', (c) => {
  const { s } = auth(c, 'admin');
  const i = s.hooks.findIndex((x) => x.id === c.m[1]);
  if (i < 0) throw new DemoError(404, 'Webhook not found');
  s.hooks.splice(i, 1);
  return { deleted: true };
});
on('POST', '/api/webhooks/:id/test', (c) => {
  const h = auth(c, 'admin').s.hooks.find((x) => x.id === c.m[1]);
  if (!h) throw new DemoError(404, 'Webhook not found');
  // The demo runs offline, so the call is simulated.
  Object.assign(h, { lastStatus: 200, lastAt: now() });
  return { status: 200, simulated: true };
});

/* ---------- Driver app ---------- */

on('GET', '/api/driver/me', (c) => {
  const { s, u, d } = auth(c, 'driver');
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
          .filter((x) => x.tripId === active.id && !['DELIVERED', 'RTO_DELIVERED', 'CANCELLED'].includes(x.status))
          .map((x) => ({ id: x.id, awb: x.awb, service: x.service, status: x.status, consigneeName: x.consigneeName, consigneePhone: x.consigneePhone, consigneeAddress: x.consigneeAddress, destCity: x.destCity, paymentMode: x.paymentMode, codAmount: x.codAmount, packages: x.packages, weightKg: x.weightKg, nextStatuses: nextStatuses(x.service, x.status) }))
      : [],
    expenses: active ? s.expenses.filter((e) => e.tripId === active.id) : [],
    history: done.map((x) => ({ id: x.id, tripNo: x.tripNo, lane: `${x.originCity}–${x.destCity}`, km: x.actualKm ?? x.plannedKm, completedAt: x.completedAt, advance: x.driverAdvance })),
    stats: { tripsDone: done.length, kmDriven: done.reduce((a, x) => a + (x.actualKm ?? x.plannedKm), 0), rating: dr.rating },
    /** Demo only: lets the driver screen show the OTP the receiver would read out. */
    demoOtps: active ? Object.fromEntries(d.shipments.filter((x) => x.tripId === active.id).map((x) => [x.id, x.deliveryOtp])) : {},
  };
});

/* ---------- Website: bookings without a login, people asking to join, truck owners ---------- */

const home = () => {
  boot();
  return stores[0]!;
};
const phone10 = (v: unknown, what = 'Mobile') => {
  const p = String(v ?? '').replace(/\D/g, '').slice(-10);
  if (!/^[6-9]\d{9}$/.test(p)) throw new DemoError(400, `${what} must be a 10-digit Indian number`);
  return p;
};
const REG_RE = /^([A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}|\d{2}BH\d{4}[A-Z]{1,2})$/;
const ROLE_WORD: Record<string, string> = { partner: 'truck owner', driver: 'driver', customer: 'customer', warehouse: 'warehouse staff' };

function publicQuote(st: Store, b: any) {
  const from = city(b.originCity);
  const to = city(b.destCity);
  if (!(Number(b.weightKg) > 0)) throw new DemoError(400, 'Weight must be more than zero');
  const service = (b.service ?? 'COURIER') as Service;
  const d = st.d;
  return quote({ service, weightKg: Number(b.weightKg), packages: Number(b.packages ?? 1), declaredValue: Number(b.declaredValue ?? 0), paymentMode: b.paymentMode === 'TO_PAY' ? 'TO_PAY' : 'PREPAID', codAmount: 0, origin: from.name, destination: to.name, dieselPrice: d.org.settings.dieselPrice, gst: d.org.settings.gst, ...signals(d, service, from.name, to.name) });
}
on('POST', '/api/public/quote', ({ b }) => {
  const st = home();
  return { quote: publicQuote(st, b), company: st.d.org.name };
});
on('POST', '/api/public/bookings', ({ b }) => {
  const st = home();
  if (b.agree !== true) throw new DemoError(400, 'Please accept the booking terms');
  if (!String(b.contents ?? '').trim()) throw new DemoError(400, 'Say what is inside');
  if (String(b.pickupAddress ?? '').trim().length < 8) throw new DemoError(400, 'Write the full pickup address');
  if (String(b.receiverAddress ?? '').trim().length < 8) throw new DemoError(400, 'Write the full delivery address');
  if (String(b.senderName ?? '').trim().length < 2 || String(b.receiverName ?? '').trim().length < 2) throw new DemoError(400, 'Enter the sender and receiver names');
  const senderPhone = phone10(b.senderPhone, 'Your mobile');
  const receiverPhone = phone10(b.receiverPhone, 'Receiver mobile');
  publicQuote(st, b);
  const when = b.pickupDate ? new Date(`${b.pickupDate}T00:00:00+05:30`).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' }) : 'as soon as possible';
  const sh = createShipment(
    st,
    null,
    { service: b.service ?? 'COURIER', originCity: b.originCity, destCity: b.destCity, weightKg: Number(b.weightKg), packages: Number(b.packages ?? 1), declaredValue: Number(b.declaredValue ?? 0), paymentMode: b.paymentMode === 'TO_PAY' ? 'TO_PAY' : 'PREPAID', codAmount: 0, shipperName: String(b.senderName).trim(), shipperPhone: senderPhone, consigneeName: String(b.receiverName).trim(), consigneePhone: receiverPhone, consigneeAddress: String(b.receiverAddress).trim(), pickupAddress: String(b.pickupAddress).trim(), contents: String(b.contents).trim() },
    { status: 'REQUESTED', note: `Requested on the website. Pickup wanted ${b.pickupDate ? 'on ' : ''}${when}.` },
  );
  notify(st, senderPhone, 'booking_requested', `Namaste ${sh.shipperName}, we got your booking request ${sh.awb} (${sh.originCity} to ${sh.destCity}, ₹${sh.price.toLocaleString('en-IN')}). ${st.d.org.name} will call you to confirm the pickup. Status: surajlogistic.in/track/${sh.awb}`);
  return { awb: sh.awb, status: sh.status, price: sh.price, originCity: sh.originCity, destCity: sh.destCity, company: st.d.org.name, phone: st.d.org.settings.profile?.phone ?? null };
});

on('POST', '/api/join', ({ b }) => {
  const st = home();
  const d = st.d;
  const role = String(b.role ?? '');
  if (!['partner', 'driver', 'customer', 'warehouse'].includes(role)) throw new DemoError(400, 'Choose how you want to join');
  if (b.agree !== true) throw new DemoError(400, 'Please accept the terms');
  const name = String(b.name ?? '').trim();
  if (name.length < 2) throw new DemoError(400, 'Enter your name');
  const phone = phone10(b.phone);
  const email = b.email ? String(b.email).trim().toLowerCase() : null;
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new DemoError(400, 'Enter a valid email or leave it empty');
  const cityName = String(b.city ?? '').trim();
  if (cityName.length < 2) throw new DemoError(400, 'Enter your city');
  if (String(b.password ?? '').length < 8) throw new DemoError(400, 'Use at least 8 characters for the password');
  const details: Record<string, unknown> = {};
  if (role === 'driver') {
    const lic = String(b.licenseNo ?? '').toUpperCase().replace(/[\s-]/g, '');
    if (!/^[A-Z]{2}\d{2,}[A-Z0-9]{6,16}$/.test(lic)) throw new DemoError(400, 'Licence number looks like RJ1420150034567');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.licenseExpiry ?? ''))) throw new DemoError(400, 'Enter when your licence expires');
    if (String(b.licenseExpiry) < new Date().toISOString().slice(0, 10)) throw new DemoError(400, 'Your licence has expired. Renew it, then apply.');
    Object.assign(details, { licenseNo: lic, licenseExpiry: b.licenseExpiry });
  }
  if (role === 'customer') {
    if (b.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(String(b.gstin).toUpperCase())) throw new DemoError(400, 'GSTIN should look like 23ABCDE1234F1Z5');
    Object.assign(details, { companyName: b.companyName || undefined, gstin: b.gstin ? String(b.gstin).toUpperCase() : undefined, address: b.address || undefined });
  }
  if (role === 'partner') {
    const trucks = (Array.isArray(b.trucks) ? b.trucks : []).map((t: any) => ({ regNo: String(t.regNo ?? '').trim().toUpperCase().replace(/\s+/g, ' '), type: t.type }));
    if (!trucks.length) throw new DemoError(400, 'Add at least one truck');
    for (const t of trucks) {
      if (!REG_RE.test(t.regNo.replace(/[\s-]/g, ''))) throw new DemoError(400, `Vehicle number "${t.regNo}" looks wrong. Write it like MP43 G 5120`);
      if (!VEHICLE_CLASSES[t.type as keyof typeof VEHICLE_CLASSES] || t.type === 'BIKE') throw new DemoError(400, 'Pick a truck type');
    }
    if (new Set(trucks.map((t: any) => t.regNo.replace(/[\s-]/g, ''))).size !== trucks.length) throw new DemoError(400, 'The same truck is listed twice');
    details.trucks = trucks;
  }
  if (b.message) details.message = String(b.message).slice(0, 500);
  if (stores.some((x) => x.d.users.some((u) => u.phone === phone || (email && u.email === email)))) throw new DemoError(409, 'You already have a login. Log in with your mobile number.');
  if (d.joinRequests.some((r) => r.phone === phone && r.status === 'PENDING')) throw new DemoError(409, 'We already have a request from this mobile number. We will call you soon.');
  const r = { id: uid(), orgId: d.org.id, role: role as any, name, phone, email, city: cityName, details, status: 'PENDING' as const, note: null, userId: null, decidedAt: null, createdAt: now() };
  d.joinRequests.push(r);
  st.joinPasswords.set(r.id, String(b.password));
  notify(st, phone, 'join_received', `Namaste ${name}, ${d.org.name} got your request to join as a ${ROLE_WORD[role]}. We will check your details and call you. You can log in with this mobile number once you are approved.`);
  emit('join.requested', { id: r.id, role, name, city: cityName });
  return { id: r.id, status: r.status, company: d.org.name };
});

on('GET', '/api/requests/summary', (c) => {
  const { u, d } = auth(c, ...STAFF);
  return { bookings: d.shipments.filter((x) => x.status === 'REQUESTED').length, joins: u.role === 'admin' ? d.joinRequests.filter((x) => x.status === 'PENDING').length : 0 };
});
on('GET', '/api/join-requests', (c) => {
  const { d } = auth(c, 'admin');
  const st = c.q.get('status') ?? 'PENDING';
  return [...d.joinRequests].filter((x) => st === 'ALL' || x.status === st).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
});
on('POST', '/api/join-requests/:id/approve', (c) => {
  const { s: st, d } = auth(c, 'admin');
  const r = d.joinRequests.find((x) => x.id === c.m[1]);
  if (!r) throw new DemoError(404, 'Request not found');
  if (r.status !== 'PENDING') throw new DemoError(400, `This request was already ${r.status.toLowerCase()}`);
  if (stores.some((x) => x.d.users.some((u) => u.phone === r.phone || (r.email && u.email === r.email)))) throw new DemoError(409, 'Someone already logs in with this mobile number or email');
  const place = findCity(r.city) ?? findCity(d.org.settings.profile?.city ?? '') ?? requireCity('Jaipur');
  let customerId: string | null = null;
  if (r.role === 'customer') {
    if (c.b.customerId) {
      if (!d.customers.some((x) => x.id === c.b.customerId)) throw new DemoError(400, 'Customer not found');
      customerId = c.b.customerId;
    } else {
      const cu = { id: uid(), orgId: d.org.id, name: r.details.companyName || r.name, gstin: r.details.gstin || null, phone: r.phone, email: r.email, city: place.name, address: r.details.address || null, createdAt: now() };
      d.customers.push(cu);
      customerId = cu.id;
    }
  }
  const user: UserRec = { id: uid(), orgId: d.org.id, name: r.name, email: r.email ?? `${r.phone}@${r.role === 'driver' ? 'drivers' : 'members'}.surajlogistic.in`, phone: r.phone, role: r.role, lang: r.role === 'driver' || r.role === 'partner' ? 'hi' : 'en', customerId, createdAt: now() };
  d.users.push(user);
  st.passwords.set(user.id, st.joinPasswords.get(r.id) ?? DEMO_PASSWORD);
  if (r.role === 'driver') d.drivers.push({ id: uid(), orgId: d.org.id, userId: user.id, name: r.name, phone: r.phone, licenseNo: r.details.licenseNo ?? 'PENDING', licenseExpiry: r.details.licenseExpiry ?? now().slice(0, 10), status: 'AVAILABLE', rating: 4.5, lang: 'hi', createdAt: now() });
  if (r.role === 'partner') {
    for (const t of r.details.trucks ?? []) {
      const have = d.vehicles.find((v) => v.regNo === t.regNo);
      if (have) {
        if (!have.partnerId) Object.assign(have, { partnerId: user.id, ownership: 'ATTACHED' });
        continue;
      }
      const vc = VEHICLE_CLASSES[t.type];
      d.vehicles.push({ id: uid(), orgId: d.org.id, regNo: t.regNo, type: t.type, ownership: 'ATTACHED', status: 'IDLE', capacityKg: vc.capacityKg, city: place.name, lat: place.lat, lng: place.lng, kmpl: vc.kmpl, odometerKm: 0, docs: {}, lastPingAt: null, partnerId: user.id, createdAt: now() });
    }
  }
  Object.assign(r, { status: 'APPROVED', userId: user.id, decidedAt: now() });
  notify(st, r.phone, 'join_approved', `Namaste ${r.name}, your ${d.org.name} login is ready. Log in at surajlogistic.in/login with your mobile number ${r.phone} and the password you chose.`);
  emit('join.decided', { id: r.id, status: 'APPROVED', role: r.role });
  return { request: r, user: publicUser(user) };
});
on('POST', '/api/join-requests/:id/reject', (c) => {
  const { s: st, d } = auth(c, 'admin');
  const r = d.joinRequests.find((x) => x.id === c.m[1]);
  if (!r) throw new DemoError(404, 'Request not found');
  if (r.status !== 'PENDING') throw new DemoError(400, `This request was already ${r.status.toLowerCase()}`);
  const note = String(c.b.note ?? '').trim();
  if (note.length < 3) throw new DemoError(400, 'Say why, so we can tell them');
  Object.assign(r, { status: 'REJECTED', note, decidedAt: now() });
  notify(st, r.phone, 'join_declined', `Namaste ${r.name}, ${d.org.name} could not approve your request right now: ${note}`);
  emit('join.decided', { id: r.id, status: 'REJECTED', role: r.role });
  return r;
});

on('GET', '/api/partner/me', (c) => {
  const { u, d } = auth(c, 'partner');
  const trucks = d.vehicles.filter((v) => v.partnerId === u.id).sort((a, b) => a.regNo.localeCompare(b.regNo));
  const ids = new Set(trucks.map((v) => v.id));
  const trips = d.trips
    .filter((t) => ids.has(t.vehicleId) && t.status !== 'CANCELLED')
    .sort((a, b) => b.plannedStart.localeCompare(a.plannedStart))
    .slice(0, 60)
    .map((t) => {
      const dr = d.drivers.find((x) => x.id === t.driverId);
      const hire = typeof t.hireAmount === 'number' ? t.hireAmount : null;
      const adv = t.hireAdvance ?? 0;
      return { id: t.id, tripNo: t.tripNo, regNo: d.vehicles.find((v) => v.id === t.vehicleId)?.regNo ?? '', status: t.status, originCity: t.originCity, destCity: t.destCity, plannedKm: t.plannedKm, plannedStart: t.plannedStart, startedAt: t.startedAt, completedAt: t.completedAt, etaAt: t.etaAt, progress: t.progress, driverName: dr?.name ?? '', driverPhone: dr?.phone ?? '', hireAmount: hire, hireAdvance: hire === null ? null : adv, balance: hire === null ? null : Math.max(0, hire - adv), hireSettledAt: t.hireSettledAt ?? null };
    });
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const thisMonth = trips.filter((t) => new Date(t.plannedStart) >= monthStart);
  const due = trips.filter((t) => t.status === 'COMPLETED' && t.balance !== null && !t.hireSettledAt);
  const today = new Date();
  return {
    partner: { id: u.id, name: u.name, phone: u.phone, lang: u.lang },
    company: { name: d.org.name, phone: d.org.settings.profile?.phone ?? null },
    trucks: trucks.map((v) => ({ ...v, alerts: docAlerts(v, today), docDays: Object.fromEntries(Object.entries(v.docs).map(([k, x]) => [k, x ? daysUntil(x, today) : null])), currentTrip: trips.find((t) => t.regNo === v.regNo && ['PLANNED', 'IN_TRANSIT'].includes(t.status)) ?? null })),
    trips,
    totals: { trucks: trucks.length, onTrip: trucks.filter((v) => v.status === 'ON_TRIP').length, tripsThisMonth: thisMonth.length, hireThisMonth: thisMonth.reduce((a, t) => a + (t.hireAmount ?? 0), 0), balanceDue: due.reduce((a, t) => a + (t.balance ?? 0), 0), tripsDue: due.length },
  };
});
on('POST', '/api/partner/vehicles/:id/free', (c) => {
  const { u, d } = auth(c, 'partner');
  const v = d.vehicles.find((x) => x.id === c.m[1] && x.partnerId === u.id);
  if (!v) throw new DemoError(404, 'Truck not found');
  if (v.status !== 'IDLE') throw new DemoError(400, `${v.regNo} is ${v.status === 'ON_TRIP' ? 'on a trip' : 'in maintenance'} right now`);
  const ct = city(c.b.city);
  Object.assign(v, { city: ct.name, lat: ct.lat, lng: ct.lng });
  emit('vehicle.free', { id: v.id, regNo: v.regNo, city: ct.name, by: 'owner' });
  return v;
});
on('POST', '/api/trips/:id/hire', (c) => {
  const { d } = auth(c, ...STAFF);
  const t = d.trips.find((x) => x.id === c.m[1]);
  if (!t) throw new DemoError(404, 'Trip not found');
  const amount = typeof c.b.hireAmount === 'number' ? c.b.hireAmount : t.hireAmount;
  const advance = typeof c.b.hireAdvance === 'number' ? c.b.hireAdvance : (t.hireAdvance ?? 0);
  if (typeof amount !== 'number') throw new DemoError(400, 'Set the lorry hire first');
  if (advance > amount) throw new DemoError(400, 'The advance cannot be more than the hire');
  t.hireAmount = amount;
  t.hireAdvance = advance;
  if (c.b.settled === true) {
    if (t.status !== 'COMPLETED') throw new DemoError(400, 'Pay the balance after the trip is complete');
    t.hireSettledAt = now();
  } else if (c.b.settled === false) t.hireSettledAt = null;
  emit('trip.status', { id: t.id, tripNo: t.tripNo, status: t.status, hire: true });
  return { ...t, pnl: tripPnl(t) };
});

export async function demoRequest(method: string, fullPath: string, body: unknown, token: string | null): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 110));
  const [path, qs] = fullPath.split('?');
  const q = new URLSearchParams(qs ?? '');
  for (const [m, re, h] of routes) {
    if (m !== method) continue;
    const match = path!.match(re);
    if (!match) continue;
    try {
      return structuredClone(h({ m: match, b: body ?? {}, q, token }));
    } catch (e) {
      if (e instanceof DemoError) throw new ApiError(e.status, e.message);
      throw e;
    }
  }
  throw new ApiError(404, `No demo route for ${method} ${path}`);
}
