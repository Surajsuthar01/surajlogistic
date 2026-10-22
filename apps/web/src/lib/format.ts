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

export const dt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-IN', { ...IST, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—';

export const dateOnly = (iso: string | null | undefined) => (iso ? new Date(iso.length === 10 ? iso + 'T00:00:00+05:30' : iso).toLocaleDateString('en-IN', { ...IST, day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export function ago(iso: string | null | undefined): string {
  if (!iso) return '—';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  const f = s < 0;
  const a = Math.abs(s);
  const v = a < 60 ? `${Math.round(a)}s` : a < 3600 ? `${Math.round(a / 60)} min` : a < 86400 ? `${Math.round(a / 3600)} h` : `${Math.round(a / 86400)} d`;
  return f ? `in ${v}` : `${v} ago`;
}

export const kg = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString('en-IN', { maximumFractionDigits: 1 })} t` : `${n.toLocaleString('en-IN')} kg`);

export const pct = (n: number) => `${Math.round(n)}%`;
