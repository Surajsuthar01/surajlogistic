import { courierZone, requireCity, roadKm, type Zone } from './geo';
import { predictEta } from './eta';
import type { PaymentMode, Service } from './types';
import { pickVehicle, VEHICLE_CLASSES, type VehicleType } from './vehicles';

export const BASE_DIESEL = 90; // ₹ per litre the default rate cards assume

export interface GstConfig {
  /** Courier / express services. */
  courier: number;
  /** Goods transport (PTL, FTL). Confirm the right rate for your registration with a CA. */
  transport: number;
}
export const DEFAULT_GST: GstConfig = { courier: 18, transport: 5 };

export interface QuoteInput {
  service: Service;
  origin: string;
  destination: string;
  weightKg: number;
  packages?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  vehicleType?: VehicleType;
  declaredValue?: number;
  paymentMode?: PaymentMode;
  codAmount?: number;
  dieselPrice?: number;
  /** Market tightness on this lane: 1 = normal, above 1 = more loads than trucks. */
  laneDemand?: number;
  /** 0–1 chance the truck finds a paying load back from the destination. */
  returnLoadScore?: number;
  gst?: GstConfig;
}

export interface QuoteLine {
  code: string;
  label: string;
  amount: number;
}

export interface Quote {
  service: Service;
  origin: string;
  destination: string;
  distanceKm: number;
  zone?: Zone;
  chargeableKg: number;
  vehicleType?: VehicleType;
  lines: QuoteLine[];
  subtotal: number;
  gstRate: number;
  gst: number;
  total: number;
  etaHours: number;
  etaAt: string;
  notes: string[];
}

const COURIER_FIRST: Record<Zone, number> = { A: 30, B: 40, C: 52, D: 60, E: 75 };
const COURIER_EXTRA: Record<Zone, number> = { A: 25, B: 33, C: 45, D: 52, E: 65 };
const COURIER_PER_KG: Record<Zone, number> = { A: 18, B: 24, C: 30, D: 36, E: 45 };

const rupees = (n: number) => Math.round(n);

export function volumetricKg(lengthCm = 0, widthCm = 0, heightCm = 0, packages = 1, divisor = 5000): number {
  if (!lengthCm || !widthCm || !heightCm) return 0;
  return ((lengthCm * widthCm * heightCm) / divisor) * Math.max(1, packages);
}

function codFee(mode: PaymentMode | undefined, cod: number | undefined): number {
  if (mode !== 'COD' || !cod) return 0;
  return Math.max(35, cod * 0.0175);
}

function riskFee(declared: number | undefined): number {
  if (!declared || declared <= 2500) return 0;
  return declared * 0.002;
}

/**
 * Dynamic quote for any service. Transparent line items so the customer and the
 * ops team can see exactly why a price is what it is.
 */
export function quote(input: QuoteInput): Quote {
  const from = requireCity(input.origin);
  const to = requireCity(input.destination);
  const diesel = input.dieselPrice ?? BASE_DIESEL;
  const gstCfg = input.gst ?? DEFAULT_GST;
  const distanceKm = Math.max(5, roadKm(from, to));
  const lines: QuoteLine[] = [];
  const notes: string[] = [];
  const vol = volumetricKg(input.lengthCm, input.widthCm, input.heightCm, input.packages);
  let chargeableKg = Math.max(input.weightKg, vol);
  let zone: Zone | undefined;
  let vehicleType: VehicleType | undefined;

  if (input.service === 'COURIER') {
    zone = courierZone(from, to);
    chargeableKg = Math.max(0.5, Math.ceil(chargeableKg * 2) / 2);
    let freight: number;
    if (chargeableKg <= 5) {
      const slabs = Math.ceil(chargeableKg / 0.5);
      freight = COURIER_FIRST[zone] + (slabs - 1) * COURIER_EXTRA[zone];
    } else {
      freight = COURIER_FIRST[zone] + 9 * COURIER_EXTRA[zone] + (chargeableKg - 5) * COURIER_PER_KG[zone];
    }
    lines.push({ code: 'FREIGHT', label: `Zone ${zone} freight, ${chargeableKg} kg`, amount: rupees(freight) });
    lines.push({ code: 'FUEL', label: 'Fuel surcharge', amount: rupees(freight * 0.1 * (diesel / BASE_DIESEL)) });
    if (vol > input.weightKg) notes.push(`Billed on volumetric weight (${vol.toFixed(1)} kg) because the box is light for its size.`);
  } else if (input.service === 'PTL') {
    chargeableKg = Math.max(20, Math.ceil(chargeableKg));
    const perKg = 4 + 0.006 * distanceKm;
    const freight = Math.max(800, chargeableKg * perKg);
    lines.push({ code: 'FREIGHT', label: `${chargeableKg} kg at ₹${perKg.toFixed(2)}/kg`, amount: rupees(freight) });
    lines.push({ code: 'DOCKET', label: 'Docket (LR) charge', amount: 100 });
    lines.push({ code: 'HANDLING', label: 'Loading and unloading', amount: rupees(chargeableKg * 0.5) });
    lines.push({ code: 'FUEL', label: 'Fuel surcharge', amount: rupees(freight * 0.12 * (diesel / BASE_DIESEL)) });
  } else {
    const vc = input.vehicleType ? VEHICLE_CLASSES[input.vehicleType] : pickVehicle(input.weightKg);
    vehicleType = vc.type;
    if (input.weightKg > vc.capacityKg) notes.push(`Weight is above a ${vc.label}'s capacity; choose a bigger vehicle.`);
    const billableKm = Math.max(100, distanceKm);
    const base = billableKm * vc.ratePerKm;
    lines.push({ code: 'FREIGHT', label: `${vc.label}, ${billableKm} km at ₹${vc.ratePerKm}/km`, amount: rupees(base) });
    const fuelAdj = base * 0.4 * ((diesel - BASE_DIESEL) / BASE_DIESEL);
    if (Math.abs(fuelAdj) >= 1) lines.push({ code: 'FUEL', label: `Diesel adjustment (₹${diesel}/L vs ₹${BASE_DIESEL})`, amount: rupees(fuelAdj) });
    const demand = input.laneDemand ?? 1;
    if (Math.abs(demand - 1) > 0.01) {
      lines.push({ code: 'DEMAND', label: demand > 1 ? 'High demand on this lane' : 'Low demand on this lane', amount: rupees(base * (demand - 1)) });
    }
    const ret = input.returnLoadScore ?? 0;
    if (ret > 0.05) {
      lines.push({ code: 'RETURN', label: 'Return-load discount', amount: -rupees(base * 0.08 * ret) });
      notes.push('Cheaper because the truck is likely to find a paying load back.');
    }
    lines.push({ code: 'TOLL', label: 'Estimated tolls', amount: rupees(distanceKm * vc.tollPerKm) });
    lines.push({ code: 'LOADING', label: 'Loading and paperwork', amount: vc.heavy ? 600 : 300 });
    notes.push('Detention after 24 hours at loading or unloading is billed extra.');
  }

  const cod = codFee(input.paymentMode, input.codAmount);
  if (cod) lines.push({ code: 'COD', label: 'Cash-on-delivery handling', amount: rupees(cod) });
  const risk = riskFee(input.declaredValue);
  if (risk) lines.push({ code: 'RISK', label: "Carrier's risk cover (0.2%)", amount: rupees(risk) });
  if ((input.declaredValue ?? 0) > 50000) notes.push('E-way bill needed: declared value is above ₹50,000.');

  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const gstRate = input.service === 'COURIER' ? gstCfg.courier : gstCfg.transport;
  const gst = rupees((subtotal * gstRate) / 100);
  const eta = predictEta({ service: input.service, distanceKm, vehicleType, destination: to });

  return {
    service: input.service,
    origin: from.name,
    destination: to.name,
    distanceKm,
    zone,
    chargeableKg,
    vehicleType,
    lines,
    subtotal,
    gstRate,
    gst,
    total: subtotal + gst,
    etaHours: eta.hours,
    etaAt: eta.arriveAt,
    notes,
  };
}

/** Rupee formatting in the Indian system (1,23,456). */
export function inr(n: number, decimals = 0): string {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
