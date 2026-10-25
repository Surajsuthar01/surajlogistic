import { findCity } from './geo';
import type { PaymentMode } from './types';

export interface RtoRiskInput {
  paymentMode: PaymentMode;
  codAmount?: number;
  consigneePhone?: string;
  address?: string;
  destination?: string;
  /** Past deliveries to this phone number: how many, and how many came back. */
  history?: { delivered: number; returned: number };
  /** Hour the order was placed (0–23). Late-night impulse orders return more often. */
  orderHour?: number;
}

export interface RtoRisk {
  score: number; // 0–100
  level: 'LOW' | 'MEDIUM' | 'HIGH';
  reasons: string[];
  actions: string[];
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/**
 * Return-to-origin risk for a parcel before it is dispatched.
 * A transparent logistic score with hand-set weights; retrain the weights on your own
 * delivered/returned history once you have a few thousand parcels.
 */
export function rtoRisk(input: RtoRiskInput): RtoRisk {
  const reasons: string[] = [];
  let x = -2.6; // prepaid, clean address, known customer ≈ 7%

  if (input.paymentMode === 'COD') {
    x += 1.5;
    reasons.push('Cash on delivery');
    const cod = input.codAmount ?? 0;
    if (cod > 3000) {
      x += 0.6;
      reasons.push('COD above ₹3,000');
    } else if (cod > 1500) {
      x += 0.3;
      reasons.push('COD above ₹1,500');
    }
  } else if (input.paymentMode === 'TO_PAY') {
    x += 0.6;
    reasons.push('Freight to be paid by receiver');
  }

  const phone = (input.consigneePhone ?? '').replace(/\D/g, '');
  const validPhone = /^(91)?[6-9]\d{9}$/.test(phone);
  if (!validPhone) {
    x += 1.1;
    reasons.push('Phone number looks invalid');
  }

  const addr = (input.address ?? '').trim();
  if (addr.length < 25) {
    x += 0.7;
    reasons.push('Address is very short');
  }
  if (addr && !/\d/.test(addr)) {
    x += 0.4;
    reasons.push('No house or plot number in address');
  }

  const city = findCity(input.destination);
  if (city?.tier === 3) {
    x += 0.35;
    reasons.push('Smaller-town delivery');
  }

  const h = input.history;
  if (h && h.delivered + h.returned > 0) {
    const rate = h.returned / (h.delivered + h.returned);
    x += (rate - 0.15) * 4;
    if (rate > 0.3) reasons.push(`This customer returned ${Math.round(rate * 100)}% of past parcels`);
    if (rate === 0 && h.delivered >= 2) reasons.push('Repeat customer with clean history');
  } else if (input.paymentMode === 'COD') {
    x += 0.3;
    reasons.push('First-time customer');
  }

  if (input.orderHour !== undefined && (input.orderHour >= 23 || input.orderHour < 5)) {
    x += 0.3;
    reasons.push('Order placed late at night');
  }

  const score = Math.round(sigmoid(x) * 100);
  const level = score >= 45 ? 'HIGH' : score >= 22 ? 'MEDIUM' : 'LOW';
  const actions: string[] = [];
  if (level !== 'LOW') actions.push('Send WhatsApp confirmation before dispatch');
  if (reasons.includes('Phone number looks invalid') || reasons.includes('Address is very short')) actions.push('Ask the receiver to confirm the address');
  if (level === 'HIGH' && input.paymentMode === 'COD') actions.push('Offer a small prepaid discount or take partial COD');
  return { score, level, reasons, actions };
}
