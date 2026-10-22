// Adapters to outside systems. Each runs in "mock" mode until real credentials and
// contracts are in place, so the product can be demoed and tested end to end.
import type { ShipmentRec, VehicleRec } from '@suraj/core';
import { STATUS_LABEL } from '@suraj/core';

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
  for (const [k, d] of Object.entries(v.docs ?? {})) if (d && d < today) remarks.push(`${k} expired on ${d}`);
  return {
    regNo: v.regNo,
    verified: valid,
    source: 'mock-ulip (VAHAN)',
    fitnessUpto: v.docs?.fitness,
    insuranceUpto: v.docs?.insurance,
    permitUpto: v.docs?.permit,
    pucUpto: v.docs?.puc,
    remarks,
  };
}

// ---------- WhatsApp / SMS notifications ----------
export interface OutboundMessage {
  id: string;
  orgId: string;
  channel: 'whatsapp' | 'sms';
  to: string;
  template: string;
  text: string;
  at: string;
}

const outbox: OutboundMessage[] = [];

/** Messages are logged here in mock mode; plug in a WhatsApp Business API provider later. */
export function notify(orgId: string, to: string, template: string, text: string, channel: 'whatsapp' | 'sms' = 'whatsapp'): OutboundMessage {
  const m: OutboundMessage = { id: crypto.randomUUID(), orgId, channel, to, template, text, at: new Date().toISOString() };
  outbox.unshift(m);
  if (outbox.length > 500) outbox.length = 500;
  return m;
}

export function recentMessages(orgId: string, limit = 50): OutboundMessage[] {
  return outbox.filter((m) => m.orgId === orgId).slice(0, limit);
}

export function shipmentMessage(s: Pick<ShipmentRec, 'awb' | 'status' | 'destCity' | 'deliveryOtp' | 'consigneeName'>, trackUrl: string): { template: string; text: string } | null {
  switch (s.status) {
    case 'BOOKED':
      return { template: 'booking_confirmed', text: `Namaste ${s.consigneeName}, your shipment ${s.awb} is booked. Track: ${trackUrl}` };
    case 'OUT_FOR_DELIVERY':
      return { template: 'out_for_delivery', text: `${s.awb} is out for delivery in ${s.destCity} today. Share OTP ${s.deliveryOtp} with the delivery partner only at handover.` };
    case 'NDR':
      return { template: 'ndr_reschedule', text: `We could not deliver ${s.awb}. Reply 1 to reattempt tomorrow, 2 to update address. Track: ${trackUrl}` };
    case 'DELIVERED':
      return { template: 'delivered', text: `${s.awb} delivered. Thank you for shipping with Suraj Logistic.` };
    default:
      return { template: 'status_update', text: `${s.awb}: ${STATUS_LABEL[s.status]}. Track: ${trackUrl}` };
  }
}
