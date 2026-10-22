import { haversineKm } from './geo';
import { findReturnLoads } from './matching';
import type { DriverRec, FacilityRec, InventoryItemRec, InvoiceRec, LoadRec, ShipmentRec, TripRec, VehicleRec } from './records';
import { ACTIVE_STATUSES, type Service, type VehicleDocs } from './types';

/** Everything the control tower and copilot need, for one organisation. */
export interface OpsSnapshot {
  shipments: ShipmentRec[];
  vehicles: VehicleRec[];
  drivers: DriverRec[];
  trips: TripRec[];
  loads: LoadRec[];
  invoices: InvoiceRec[];
  items: InventoryItemRec[];
  facilities: FacilityRec[];
}

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface ExceptionItem {
  id: string;
  kind: 'DELAY' | 'DOC_EXPIRY' | 'LICENSE' | 'NDR' | 'RTO_RISK' | 'RETURN_LOAD' | 'LOW_STOCK' | 'OVERDUE_INVOICE';
  severity: Severity;
  title: string;
  detail: string;
  ref: { type: 'trip' | 'vehicle' | 'driver' | 'shipment' | 'item' | 'invoice'; id: string };
  /** Rough ₹ at stake, used to rank the feed. */
  value: number;
}

export interface Dashboard {
  generatedAt: string;
  kpis: {
    activeShipments: number;
    inTransit: number;
    deliveredToday: number;
    bookedToday: number;
    onTimeRate: number;
    revenue30d: number;
    revenueToday: number;
    codInField: number;
    codCollected: number;
    rtoRate: number;
    fleetSize: number;
    fleetUtilisation: number;
    idleVehicles: number;
    tripsInTransit: number;
    co2Kg30d: number;
    openLoads: number;
    receivables: number;
  };
  exceptions: ExceptionItem[];
  revenueByDay: { date: string; revenue: number; shipments: number }[];
  byService: { service: Service; count: number; revenue: number }[];
  map: {
    vehicles: { id: string; regNo: string; lat: number; lng: number; status: string; city: string; type: string }[];
    trips: { id: string; tripNo: string; from: [number, number]; to: [number, number]; at: [number, number]; late: boolean; vehicleId: string; destCity: string; originCity: string }[];
    facilities: { id: string; code: string; name: string; lat: number; lng: number; type: string }[];
  };
}

const D = 86400_000;
const SEV_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function daysUntil(date: string, now: Date): number {
  return Math.floor((new Date(date + (date.length === 10 ? 'T00:00:00' : '')).getTime() - new Date(now.toDateString()).getTime()) / D);
}

const DOC_LABEL: Record<keyof VehicleDocs, string> = { insurance: 'Insurance', fitness: 'Fitness certificate', permit: 'National permit', puc: 'PUC certificate', roadTax: 'Road tax' };

export function docAlerts(v: VehicleRec, now: Date, withinDays = 30): { doc: keyof VehicleDocs; label: string; days: number }[] {
  const out: { doc: keyof VehicleDocs; label: string; days: number }[] = [];
  for (const [k, date] of Object.entries(v.docs ?? {}) as [keyof VehicleDocs, string | undefined][]) {
    if (!date) continue;
    const days = daysUntil(date, now);
    if (days <= withinDays) out.push({ doc: k, label: DOC_LABEL[k], days });
  }
  return out.sort((a, b) => a.days - b.days);
}

export function isTripLate(t: TripRec): boolean {
  return t.status === 'IN_TRANSIT' && new Date(t.etaAt).getTime() > new Date(t.promisedAt).getTime() + 2 * 3600_000;
}

export function computeExceptions(s: OpsSnapshot, now = new Date()): ExceptionItem[] {
  const ex: ExceptionItem[] = [];
  const vehById = new Map(s.vehicles.map((v) => [v.id, v]));

  for (const t of s.trips) {
    if (!isTripLate(t)) continue;
    const hours = Math.round((new Date(t.etaAt).getTime() - new Date(t.promisedAt).getTime()) / 3600_000);
    const v = vehById.get(t.vehicleId);
    ex.push({ id: `delay-${t.id}`, kind: 'DELAY', severity: hours >= 6 ? 'critical' : 'high', title: `${t.tripNo} to ${t.destCity} running ${hours} h late`, detail: `${v?.regNo ?? 'Vehicle'} · new ETA ${new Date(t.etaAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}. Inform the consignee.`, ref: { type: 'trip', id: t.id }, value: t.freightAmount });
  }

  for (const v of s.vehicles) {
    for (const a of docAlerts(v, now)) {
      const severity: Severity = a.days < 0 ? 'critical' : a.days <= 7 ? 'high' : 'medium';
      ex.push({ id: `doc-${v.id}-${a.doc}`, kind: 'DOC_EXPIRY', severity, title: a.days < 0 ? `${v.regNo}: ${a.label} expired ${-a.days} days ago` : `${v.regNo}: ${a.label} expires in ${a.days} days`, detail: a.days < 0 ? 'Vehicle should not run until renewed; fines and insurance risk.' : 'Renew before expiry to avoid a challan at checkpoints.', ref: { type: 'vehicle', id: v.id }, value: a.days < 0 ? 20000 : 5000 });
    }
  }

  for (const d of s.drivers) {
    const days = daysUntil(d.licenseExpiry, now);
    if (days <= 30) ex.push({ id: `lic-${d.id}`, kind: 'LICENSE', severity: days <= 7 ? 'high' : 'medium', title: `${d.name}'s driving licence ${days < 0 ? 'has expired' : `expires in ${days} days`}`, detail: 'Renew through Sarathi (Parivahan) before assigning long trips.', ref: { type: 'driver', id: d.id }, value: 4000 });
  }

  for (const sh of s.shipments) {
    if (sh.status === 'NDR') ex.push({ id: `ndr-${sh.id}`, kind: 'NDR', severity: 'high', title: `Delivery failed: ${sh.awb} in ${sh.destCity}`, detail: `${sh.consigneeName} not reached (attempt ${sh.attempts}). Call or WhatsApp to reschedule before it turns RTO.`, ref: { type: 'shipment', id: sh.id }, value: sh.codAmount || sh.price });
    if (sh.status === 'BOOKED' && sh.rtoLevel === 'HIGH') ex.push({ id: `rto-${sh.id}`, kind: 'RTO_RISK', severity: 'medium', title: `High RTO risk: ${sh.awb} (${sh.rtoScore}/100)`, detail: `COD ₹${sh.codAmount.toLocaleString('en-IN')} to ${sh.destCity}. Confirm with the receiver before dispatch.`, ref: { type: 'shipment', id: sh.id }, value: sh.codAmount });
  }

  const openLoads = s.loads.filter((l) => l.status === 'OPEN');
  for (const v of s.vehicles) {
    if (v.status !== 'IDLE') continue;
    const matches = findReturnLoads(
      { id: v.id, type: v.type, at: { lat: v.lat, lng: v.lng } },
      openLoads.map((l) => ({ id: l.id, origin: { lat: l.originLat, lng: l.originLng, city: l.originCity }, destination: { lat: l.destLat, lng: l.destLng, city: l.destCity }, weightKg: l.weightKg, vehicleType: l.vehicleType, pickupDate: l.pickupDate, targetPrice: l.targetPrice })),
    );
    const best = matches[0];
    if (best) ex.push({ id: `ret-${v.id}`, kind: 'RETURN_LOAD', severity: 'low', title: `${v.regNo} idle in ${v.city}: ${matches.length} load${matches.length > 1 ? 's' : ''} nearby`, detail: `Best: ${best.load.origin.city} → ${best.load.destination.city}, ₹${best.load.targetPrice.toLocaleString('en-IN')}, ${best.deadheadKm} km empty to pickup.`, ref: { type: 'vehicle', id: v.id }, value: best.load.targetPrice });
  }

  for (const it of s.items) {
    if (it.qty < it.reorderLevel) ex.push({ id: `stock-${it.id}`, kind: 'LOW_STOCK', severity: 'low', title: `Low stock: ${it.name}`, detail: `${it.qty} ${it.unit} left (reorder at ${it.reorderLevel}) for ${it.clientName}.`, ref: { type: 'item', id: it.id }, value: 1000 });
  }

  for (const inv of s.invoices) {
    if (inv.status === 'SENT' && daysUntil(inv.dueDate, now) < 0) ex.push({ id: `inv-${inv.id}`, kind: 'OVERDUE_INVOICE', severity: 'medium', title: `Invoice ${inv.invoiceNo} overdue`, detail: `${inv.customerName} owes ₹${inv.total.toLocaleString('en-IN')} (due ${inv.dueDate}).`, ref: { type: 'invoice', id: inv.id }, value: inv.total });
  }

  return ex.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || b.value - a.value);
}

export function computeDashboard(s: OpsSnapshot, now = new Date()): Dashboard {
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const since30 = now.getTime() - 30 * D;
  const sh = s.shipments.filter((x) => x.status !== 'CANCELLED');
  const recent = sh.filter((x) => new Date(x.createdAt).getTime() >= since30);
  const delivered30 = sh.filter((x) => x.status === 'DELIVERED' && x.deliveredAt && new Date(x.deliveredAt).getTime() >= since30);
  const onTime = delivered30.filter((x) => new Date(x.deliveredAt!).getTime() <= new Date(x.promisedAt).getTime() + 2 * 3600_000);
  const courier30 = recent.filter((x) => x.service === 'COURIER');
  const rto = courier30.filter((x) => x.status === 'RTO' || x.status === 'RTO_DELIVERED').length;
  const closedCourier = courier30.filter((x) => ['DELIVERED', 'RTO', 'RTO_DELIVERED'].includes(x.status)).length;
  const usable = s.vehicles.filter((v) => v.status !== 'MAINTENANCE');
  const onTrip = s.vehicles.filter((v) => v.status === 'ON_TRIP').length;

  const days: Dashboard['revenueByDay'] = [];
  for (let i = 13; i >= 0; i--) {
    const d0 = new Date(startToday.getTime() - i * D);
    const d1 = d0.getTime() + D;
    const list = sh.filter((x) => {
      const t = new Date(x.createdAt).getTime();
      return t >= d0.getTime() && t < d1;
    });
    const y = d0.getFullYear();
    const m = String(d0.getMonth() + 1).padStart(2, '0');
    const dd = String(d0.getDate()).padStart(2, '0');
    days.push({ date: `${y}-${m}-${dd}`, revenue: list.reduce((a, x) => a + x.price, 0), shipments: list.length });
  }

  const services: Service[] = ['COURIER', 'PTL', 'FTL'];

  return {
    generatedAt: now.toISOString(),
    kpis: {
      activeShipments: sh.filter((x) => ACTIVE_STATUSES.includes(x.status)).length,
      inTransit: sh.filter((x) => ['PICKED_UP', 'IN_TRANSIT', 'AT_HUB', 'OUT_FOR_DELIVERY'].includes(x.status)).length,
      deliveredToday: sh.filter((x) => x.deliveredAt && new Date(x.deliveredAt) >= startToday).length,
      bookedToday: sh.filter((x) => new Date(x.createdAt) >= startToday).length,
      onTimeRate: delivered30.length ? Math.round((onTime.length / delivered30.length) * 100) : 100,
      revenue30d: recent.reduce((a, x) => a + x.price, 0),
      revenueToday: sh.filter((x) => new Date(x.createdAt) >= startToday).reduce((a, x) => a + x.price, 0),
      codInField: sh.filter((x) => x.paymentMode === 'COD' && ACTIVE_STATUSES.includes(x.status)).reduce((a, x) => a + x.codAmount, 0),
      codCollected: sh.filter((x) => x.paymentMode === 'COD' && x.codCollected).reduce((a, x) => a + x.codAmount, 0),
      rtoRate: closedCourier ? Math.round((rto / closedCourier) * 100) : 0,
      fleetSize: s.vehicles.length,
      fleetUtilisation: usable.length ? Math.round((onTrip / usable.length) * 100) : 0,
      idleVehicles: s.vehicles.filter((v) => v.status === 'IDLE').length,
      tripsInTransit: s.trips.filter((t) => t.status === 'IN_TRANSIT').length,
      co2Kg30d: Math.round(recent.reduce((a, x) => a + x.co2Kg, 0)),
      openLoads: s.loads.filter((l) => l.status === 'OPEN').length,
      receivables: s.invoices.filter((i) => i.status === 'SENT').reduce((a, i) => a + i.total, 0),
    },
    exceptions: computeExceptions(s, now),
    revenueByDay: days,
    byService: services.map((service) => {
      const list = recent.filter((x) => x.service === service);
      return { service, count: list.length, revenue: list.reduce((a, x) => a + x.price, 0) };
    }),
    map: {
      vehicles: s.vehicles.map((v) => ({ id: v.id, regNo: v.regNo, lat: v.lat, lng: v.lng, status: v.status, city: v.city, type: v.type })),
      trips: s.trips
        .filter((t) => t.status === 'IN_TRANSIT')
        .map((t) => ({ id: t.id, tripNo: t.tripNo, from: [t.originLat, t.originLng], to: [t.destLat, t.destLng], at: [t.currentLat, t.currentLng], late: isTripLate(t), vehicleId: t.vehicleId, destCity: t.destCity, originCity: t.originCity }) as Dashboard['map']['trips'][number]),
      facilities: s.facilities.map((f) => ({ id: f.id, code: f.code, name: f.name, lat: f.lat, lng: f.lng, type: f.type })),
    },
  };
}

/** Vehicles within a radius of a point, nearest first. */
export function vehiclesNear(vehicles: VehicleRec[], p: { lat: number; lng: number }, km = 150): (VehicleRec & { km: number })[] {
  return vehicles
    .map((v) => ({ ...v, km: Math.round(haversineKm(v, p)) }))
    .filter((v) => v.km <= km)
    .sort((a, b) => a.km - b.km);
}

/** Trip profit and loss. */
export function tripPnl(t: Pick<TripRec, 'freightAmount' | 'fuelCost' | 'tollCost' | 'driverAdvance' | 'otherCost' | 'plannedKm' | 'actualKm'>) {
  const cost = t.fuelCost + t.tollCost + t.otherCost;
  const profit = t.freightAmount - cost;
  const km = t.actualKm ?? t.plannedKm;
  return { cost, profit, margin: t.freightAmount ? Math.round((profit / t.freightAmount) * 100) : 0, perKm: km ? Math.round((profit / km) * 10) / 10 : 0 };
}
