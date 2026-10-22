/** Luhn check digit, so a mistyped AWB number is caught before a lookup. */
export function luhnDigit(digits: string): number {
  let sum = 0;
  let double = true;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return (10 - (sum % 10)) % 10;
}

/** AWB / LR number: "SL" + 10 digits + check digit, e.g. SL40213958771. */
export function makeAwb(rand: () => number = Math.random): string {
  let body = String(1 + Math.floor(rand() * 9));
  for (let i = 0; i < 9; i++) body += String(Math.floor(rand() * 10));
  return `SL${body}${luhnDigit(body)}`;
}

export function isValidAwb(awb: string): boolean {
  const m = /^SL(\d{10})(\d)$/.exec(awb.trim().toUpperCase());
  if (!m) return false;
  return luhnDigit(m[1]!) === Number(m[2]);
}

/** Indian financial year label for a date: Apr 2026–Mar 2027 → "2026-27". */
export function financialYear(d = new Date()): string {
  const y = d.getFullYear();
  const start = d.getMonth() >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** GST-friendly invoice number: max 16 chars, unique per financial year. */
export function invoiceNumber(seq: number, d = new Date()): string {
  return `SL/${financialYear(d)}/${String(seq).padStart(5, '0')}`;
}

export function shortCode(prefix: string, rand: () => number = Math.random, len = 6): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < len; i++) s += alphabet[Math.floor(rand() * alphabet.length)];
  return `${prefix}-${s}`;
}

/** Four-digit OTP the receiver gives the driver at delivery. */
export function deliveryOtp(rand: () => number = Math.random): string {
  return String(Math.floor(1000 + rand() * 9000));
}

/** Small deterministic PRNG so demo data is the same every run. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** UUID v4 from a PRNG (for demo data); real records use crypto.randomUUID(). */
export function uuidFrom(rand: () => number): string {
  const hex = (n: number) => {
    let s = '';
    for (let i = 0; i < n; i++) s += Math.floor(rand() * 16).toString(16);
    return s;
  };
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${(8 + Math.floor(rand() * 4)).toString(16)}${hex(3)}-${hex(12)}`;
}
