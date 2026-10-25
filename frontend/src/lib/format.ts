export const inr = (n: number | null | undefined, decimals = 0) =>
  n === null || n === undefined ? '—' : '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** ₹1.2 L / ₹3.4 Cr for big numbers, the way Indian businesses read them. */
export const inrShort = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  if (a >= 1e3) return `₹${(n / 1e3).toFixed(1)}k`;
  return inr(n);
};

const IST: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Kolkata' };

export const dt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('en-IN', { ...IST, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—');

export const time = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { ...IST, hour: 'numeric', minute: '2-digit' }) : '—');

export const dateOnly = (iso: string | null | undefined) => (iso ? new Date(iso.length === 10 ? iso + 'T00:00:00+05:30' : iso).toLocaleDateString('en-IN', { ...IST, day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export function ago(iso: string | null | undefined): string {
  if (!iso) return '—';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  const f = s < 0;
  const a = Math.abs(s);
  const v = a < 60 ? 'a few seconds' : a < 3600 ? `${Math.round(a / 60)} min` : a < 86400 ? `${Math.round(a / 3600)} h` : `${Math.round(a / 86400)} d`;
  return f ? `in ${v}` : `${v} ago`;
}

export const kg = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString('en-IN', { maximumFractionDigits: 1 })} t` : `${n.toLocaleString('en-IN')} kg`);

export const pct = (n: number) => `${Math.round(n)}%`;

export const km = (n: number) => `${Math.round(n).toLocaleString('en-IN')} km`;

/** Lanes are written the way transporters write them: Jaipur–Ahmedabad. */
export const lane = (a: string, b: string) => `${a}–${b}`;

export const SERVICE_LABEL: Record<string, string> = { COURIER: 'Parcel', PTL: 'Part load', FTL: 'Full truck' };
export const svc = (s: string) => SERVICE_LABEL[s] ?? s;

export const PAYMENT_LABEL: Record<string, string> = { PREPAID: 'Prepaid', COD: 'Cash on delivery', TO_PAY: 'To pay' };

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function two(n: number) {
  return n < 20 ? ONES[n]! : `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`;
}
function three(n: number) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', r ? two(r) : ''].filter(Boolean).join(' ');
}

/** Amount in words with lakh and crore, as printed on Indian tax invoices. */
export function inrWords(amount: number): string {
  let n = Math.round(amount);
  if (n === 0) return 'Rupees Zero Only';
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7);
  n %= 1e7;
  const lakh = Math.floor(n / 1e5);
  n %= 1e5;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${crore >= 100 ? three(crore) : two(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (n) parts.push(three(n));
  return `Rupees ${parts.join(' ')} Only`;
}

/**
 * Hand the viewer a file. Inside a claude.ai artifact the browser download is blocked,
 * so it goes through the viewer's downloads capability there; everywhere else it is a
 * normal browser download.
 */
export async function saveFile(filename: string, data: string | Uint8Array, mime: string) {
  const blob = new Blob([data as BlobPart], { type: mime });
  const host = (window as unknown as { claude?: { use?: (n: string) => Promise<{ save: (r: { filename: string; data: string | Blob }) => Promise<unknown> } | null> } }).claude;
  if (host?.use) {
    const d = await host.use('downloads').catch(() => null);
    if (d) {
      await d.save({ filename, data: typeof data === 'string' ? data : blob }).catch(() => undefined);
      return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv(name: string, rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return saveFile(name, '\ufeff' + rows.map((r) => r.map(esc).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
}
