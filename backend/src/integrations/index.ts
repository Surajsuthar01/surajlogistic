// Adapters to outside systems. Each runs in "mock" mode until real credentials and
// contracts are in place, so the product can be demoed and tested end to end.
import type { ShipmentRec, VehicleRec } from '@suraj/shared';
import { STATUS_LABEL } from '@suraj/shared';

// ---------- E-way bill (via a licensed GST Suvidha Provider) ----------
export interface EwayBill {
  ewbNo: string;
  generatedAt: string;
  validUntil: string;
  provider: string;
}

export interface EwayBillProvider {
  name: string;
  generate(s: Pick<ShipmentRec, 'awb' | 'distanceKm' | 'declaredValue' | 'originCity' | 'destCity'>, vehicleRegNo?: string): Promise<EwayBill>;
}

/** Validity for regular cargo is one day per 200 km (or part of it). */
export function ewayValidityDays(distanceKm: number): number {
  return Math.max(1, Math.ceil(distanceKm / 200));
}

export const mockEwayBill: EwayBillProvider = {
  name: 'mock-gsp',
  async generate(s) {
    const now = new Date();
    const valid = new Date(now);
    valid.setDate(valid.getDate() + ewayValidityDays(s.distanceKm));
    valid.setHours(23, 59, 59, 0);
    const ewbNo = String(Math.floor(100000000000 + Math.random() * 899999999999));
    return { ewbNo, generatedAt: now.toISOString(), validUntil: valid.toISOString(), provider: 'mock-gsp' };
  },
};

// ---------- ULIP (Vahan / Sarathi lookups) ----------
export interface VehicleVerification {
  regNo: string;
  verified: boolean;
  source: string;
  fitnessUpto?: string;
  insuranceUpto?: string;
  permitUpto?: string;
  pucUpto?: string;
  remarks: string[];
}

export async function verifyVehicleMock(v: Pick<VehicleRec, 'regNo' | 'docs'>): Promise<VehicleVerification> {
  const valid = /^[A-Z]{2}\s?\d{1,2}\s?[A-Z]{0,3}\s?\d{3,4}$/.test(v.regNo.toUpperCase());
  const remarks: string[] = [];
  if (!valid) remarks.push('Registration number format looks wrong');
  const today = new Date().toISOString().slice(0, 10);
  const names: Record<string, string> = { insurance: 'Insurance', fitness: 'Fitness', permit: 'Permit', puc: 'PUC', roadTax: 'Road tax' };
  for (const [k, d] of Object.entries(v.docs ?? {})) if (d && d < today) remarks.push(`${names[k] ?? k} expired on ${d}`);
  return {
    regNo: v.regNo,
    verified: valid,
    source: 'VAHAN via ULIP (mock)',
    fitnessUpto: v.docs?.fitness,
    insuranceUpto: v.docs?.insurance,
    permitUpto: v.docs?.permit,
    pucUpto: v.docs?.puc,
    remarks,
  };
}

// ---------- WhatsApp / SMS message text ----------
// Sending and the delivery log live in lib/notify.ts.
export function shipmentMessage(
  s: Pick<ShipmentRec, 'awb' | 'status' | 'originCity' | 'destCity' | 'deliveryOtp' | 'consigneeName'>,
  trackUrl: string,
  company = 'SurajLogistic',
): { template: string; text: string } | null {
  switch (s.status) {
    case 'BOOKED':
      return { template: 'booking_confirmed', text: `Namaste ${s.consigneeName}, your shipment ${s.awb} from ${s.originCity} is booked with ${company}. Track it: ${trackUrl}` };
    case 'OUT_FOR_DELIVERY':
      return { template: 'out_for_delivery', text: `${s.awb} is out for delivery in ${s.destCity} today. Share OTP ${s.deliveryOtp} only at handover.` };
    case 'NDR':
      return { template: 'ndr_reschedule', text: `We could not deliver ${s.awb}. Pick a new day: ${trackUrl}` };
    case 'DELIVERED':
      return { template: 'delivered', text: `${s.awb} delivered. Thank you for shipping with ${company}.` };
    default:
      return { template: 'status_update', text: `${s.awb}: ${STATUS_LABEL[s.status]}. Track: ${trackUrl}` };
  }
}
