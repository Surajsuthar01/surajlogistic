import { describe, expect, it } from 'vitest';
import {
  answerQuery,
  buildDemoData,
  canTransition,
  computeDashboard,
  courierZone,
  findReturnLoads,
  financialYear,
  invoiceNumber,
  isValidAwb,
  laneDemand,
  makeAwb,
  mulberry32,
  optimizeRoute,
  parseQuery,
  predictEta,
  quote,
  requireCity,
  roadKm,
  rtoRisk,
  shipmentCo2Kg,
} from '../src';

describe('geo', () => {
  it('estimates road km for a known lane within a sensible band', () => {
    // Jaipur–Ahmedabad is roughly 650–680 km by road.
    const km = roadKm(requireCity('Jaipur'), requireCity('Ahmedabad'));
    expect(km).toBeGreaterThan(560);
    expect(km).toBeLessThan(720);
  });
  it('builds courier zones', () => {
    expect(courierZone(requireCity('Jaipur'), requireCity('Jaipur'))).toBe('A');
    expect(courierZone(requireCity('Jaipur'), requireCity('Ajmer'))).toBe('B');
    expect(courierZone(requireCity('Jaipur'), requireCity('Guwahati'))).toBe('E');
  });
});

describe('pricing', () => {
  it('prices a courier parcel by 0.5 kg slabs with GST and COD fee', () => {
    const q = quote({ service: 'COURIER', origin: 'Jaipur', destination: 'Ajmer', weightKg: 1.2, paymentMode: 'COD', codAmount: 1000 });
    expect(q.zone).toBe('B');
    expect(q.chargeableKg).toBe(1.5);
    const freight = q.lines.find((l) => l.code === 'FREIGHT')!.amount;
    expect(freight).toBe(40 + 2 * 33);
    expect(q.lines.find((l) => l.code === 'COD')!.amount).toBe(35);
    expect(q.gstRate).toBe(18);
    expect(q.total).toBe(q.subtotal + q.gst);
  });
  it('uses volumetric weight for light, bulky boxes', () => {
    const q = quote({ service: 'COURIER', origin: 'Jaipur', destination: 'Delhi', weightKg: 1, lengthCm: 50, widthCm: 40, heightCm: 30 });
    expect(q.chargeableKg).toBe(12);
  });
  it('picks the smallest truck that fits for FTL and applies the diesel adjustment', () => {
    const q = quote({ service: 'FTL', origin: 'Indore', destination: 'Mumbai', weightKg: 5000, dieselPrice: 99 });
    expect(q.vehicleType).toBe('TRUCK_19FT');
    expect(q.lines.find((l) => l.code === 'FUEL')!.amount).toBeGreaterThan(0);
    expect(q.gstRate).toBe(5);
  });
  it('gives a return-load discount', () => {
    const a = quote({ service: 'FTL', origin: 'Indore', destination: 'Mumbai', weightKg: 5000 });
    const b = quote({ service: 'FTL', origin: 'Indore', destination: 'Mumbai', weightKg: 5000, returnLoadScore: 1 });
    expect(b.total).toBeLessThan(a.total);
  });
  it('flags the e-way bill above ₹50,000', () => {
    const q = quote({ service: 'PTL', origin: 'Jaipur', destination: 'Delhi', weightKg: 500, declaredValue: 75000 });
    expect(q.notes.join(' ')).toMatch(/E-way bill/);
  });
});

describe('eta', () => {
  it('adds driver rest on long FTL runs', () => {
    const e = predictEta({ service: 'FTL', distanceKm: 1400, vehicleType: 'TRUCK_19FT', departAt: new Date('2026-10-22T06:00:00+05:30') });
    expect(e.hours).toBeGreaterThan(1400 / 42);
    expect(e.explain.join(' ')).toMatch(/rest/);
  });
});

describe('rto risk', () => {
  it('scores a COD parcel with a bad phone and short address high', () => {
    const r = rtoRisk({ paymentMode: 'COD', codAmount: 4299, consigneePhone: '98451', address: 'Koramangala', destination: 'Bengaluru' });
    expect(r.level).toBe('HIGH');
    expect(r.actions.length).toBeGreaterThan(0);
  });
  it('scores a prepaid parcel with a full address low', () => {
    const r = rtoRisk({ paymentMode: 'PREPAID', consigneePhone: '9826234573', address: '108 Scheme No. 54, Vijay Nagar, Indore 452010', destination: 'Indore' });
    expect(r.level).toBe('LOW');
  });
});

describe('status machine', () => {
  it('lets FTL go from in transit straight to delivered but not courier', () => {
    expect(canTransition('FTL', 'IN_TRANSIT', 'DELIVERED')).toBe(true);
    expect(canTransition('COURIER', 'IN_TRANSIT', 'DELIVERED')).toBe(false);
    expect(canTransition('COURIER', 'NDR', 'RTO')).toBe(true);
  });
});

describe('matching and routing', () => {
  it('finds a return load near where a truck is empty', () => {
    const mumbai = requireCity('Mumbai');
    const indore = requireCity('Indore');
    const res = findReturnLoads({ id: 'v1', type: 'TRUCK_19FT', at: mumbai }, [
      { id: 'l1', origin: { ...mumbai, city: 'Mumbai' }, destination: { ...indore, city: 'Indore' }, weightKg: 6000, pickupDate: new Date().toISOString(), targetPrice: 36000 },
      { id: 'l2', origin: { ...indore, city: 'Indore' }, destination: { ...mumbai, city: 'Mumbai' }, weightKg: 6000, pickupDate: new Date().toISOString(), targetPrice: 36000 },
      { id: 'l3', origin: { ...mumbai, city: 'Mumbai' }, destination: { ...indore, city: 'Indore' }, weightKg: 12000, pickupDate: new Date().toISOString(), targetPrice: 50000 },
    ]);
    expect(res.map((r) => r.load.id)).toEqual(['l1']);
  });
  it('lane demand rises with more loads than trucks', () => {
    expect(laneDemand(10, 1)).toBeGreaterThan(laneDemand(1, 10));
  });
  it('2-opt never makes a route longer', () => {
    const start = requireCity('Jaipur');
    const stops = ['Kota', 'Ajmer', 'Udaipur', 'Jodhpur', 'Bhilwara', 'Chittorgarh'].map((n) => ({ id: n, ...requireCity(n) }));
    const plan = optimizeRoute(start, stops);
    expect(plan.totalKm).toBeLessThanOrEqual(plan.originalKm);
    expect(plan.order).toHaveLength(6);
  });
});

describe('ids', () => {
  it('makes AWBs with a valid check digit and catches typos', () => {
    const awb = makeAwb(mulberry32(7));
    expect(isValidAwb(awb)).toBe(true);
    const typo = awb.slice(0, -2) + String((Number(awb.at(-2)) + 1) % 10) + awb.at(-1);
    expect(isValidAwb(typo)).toBe(false);
  });
  it('uses Indian financial years for invoice numbers', () => {
    expect(financialYear(new Date('2026-10-22'))).toBe('2026-27');
    expect(financialYear(new Date('2027-02-01'))).toBe('2026-27');
    expect(invoiceNumber(7, new Date('2026-10-22'))).toBe('SL/2026-27/00007');
    expect(invoiceNumber(7).length).toBeLessThanOrEqual(16);
  });
});

describe('carbon', () => {
  it('gives FTL the whole truck and parcels a share', () => {
    expect(shipmentCo2Kg('FTL', 600, 7000, 'TRUCK_19FT')).toBeCloseTo((600 / 6) * 2.68, 0);
    expect(shipmentCo2Kg('COURIER', 600, 2)).toBeLessThan(1);
  });
});

describe('copilot', () => {
  const now = new Date('2026-10-22T11:00:00Z');
  const data = buildDemoData(now);
  const snap = { ...data };

  it('parses Hinglish freight questions', () => {
    const q = parseQuery('Indore se Mumbai 5 ton ka bhada kitna?');
    expect(q.intent).toBe('QUOTE');
    expect(q.lang).toBe('hi');
    expect(q.cities).toEqual(['Indore', 'Mumbai']);
    expect(q.weightKg).toBe(5000);
  });
  it('routes risky COD to the RTO intent, not COD totals', () => {
    expect(parseQuery('Risky COD parcels').intent).toBe('RTO_RISK');
    expect(parseQuery('COD outstanding').intent).toBe('COD_OUTSTANDING');
  });
  it('answers idle trucks near Jaipur from data', () => {
    const a = answerQuery(parseQuery('Which trucks are idle near Jaipur?'), snap, { now });
    expect(a.intent).toBe('IDLE_VEHICLES');
    expect(a.table?.rows.length).toBeGreaterThan(0);
  });
  it('tracks a real AWB', () => {
    const awb = data.shipments[0]!.awb;
    const a = answerQuery(parseQuery(`where is ${awb}`), snap, { now });
    expect(a.text).toContain(awb);
  });
  it('finds return loads for the empty Mumbai truck', () => {
    const a = answerQuery(parseQuery('Return load for trucks unloading in Mumbai'), snap, { now });
    expect(a.table?.rows.some((r) => String(r[1]).startsWith('Mumbai'))).toBe(true);
  });
});

describe('demo data and dashboard', () => {
  const now = new Date('2026-10-22T11:00:00Z');
  const data = buildDemoData(now);
  it('is deterministic', () => {
    const again = buildDemoData(now);
    expect(again.shipments.map((s) => s.awb)).toEqual(data.shipments.map((s) => s.awb));
  });
  it('every AWB is unique and valid', () => {
    const awbs = data.shipments.map((s) => s.awb);
    expect(new Set(awbs).size).toBe(awbs.length);
    expect(awbs.every(isValidAwb)).toBe(true);
  });
  it('dashboard finds the late trip, the expired PUC and the idle truck with a return load', () => {
    const d = computeDashboard(data, now);
    const kinds = new Set(d.exceptions.map((e) => e.kind));
    expect(kinds.has('DELAY')).toBe(true);
    expect(kinds.has('DOC_EXPIRY')).toBe(true);
    expect(kinds.has('RETURN_LOAD')).toBe(true);
    expect(d.exceptions[0]!.severity).toBe('critical');
    expect(d.kpis.fleetSize).toBe(12);
    expect(d.revenueByDay).toHaveLength(14);
  });
});
