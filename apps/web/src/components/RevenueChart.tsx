import { useEffect, useRef, useState } from 'react';
import { inrShort } from '../lib/format';

/** Daily booked revenue as bars from zero, today highlighted. Drawn in real pixels so text stays readable on phones. */
export function RevenueChart({ days }: { days: { date: string; revenue: number; shipments: number }[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((e) => setW(Math.max(260, Math.round(e[0]!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 210;
  const left = 4;
  const bottom = 26;
  const top = 24;
  const max = Math.max(1, ...days.map((d) => d.revenue));
  const band = (W - left * 2) / Math.max(1, days.length);
  const bw = Math.max(5, band * 0.62);
  const every = W < 420 ? 4 : 2;
  const yv = (v: number) => H - bottom - (v / max) * (H - bottom - top);
  const peak = days.reduce((a, d) => (d.revenue > a.revenue ? d : a), days[0] ?? { date: '', revenue: 0, shipments: 0 });
  const lbl = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return (
    <div ref={box} className="w-full">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full" role="img" aria-label="Booked revenue per day, last 14 days">
        <line x1={left} x2={W - left} y1={H - bottom} y2={H - bottom} stroke="var(--line)" />
        {days.map((d, i) => {
          const today = i === days.length - 1;
          const cx = left + i * band + band / 2;
          return (
            <g key={d.date}>
              <rect x={cx - bw / 2} y={yv(d.revenue)} width={bw} height={Math.max(0, H - bottom - yv(d.revenue))} rx={3} fill={today ? 'var(--accent)' : 'var(--route)'} opacity={today ? 1 : 0.55}>
                <title>{`${lbl(d.date)}: ${inrShort(d.revenue)} from ${d.shipments} shipments`}</title>
              </rect>
              {((days.length - 1 - i) % every === 0 && !today && i > 0) || today ? (
                <text x={cx} y={H - 8} textAnchor="middle" fontSize={12} fill={today ? 'var(--ink)' : 'var(--muted)'} fontWeight={today ? 600 : 400}>
                  {today ? 'Today' : lbl(d.date)}
                </text>
              ) : null}
              {d === peak && d.revenue > 0 && (
                <text x={Math.min(W - 30, Math.max(30, cx))} y={yv(d.revenue) - 7} textAnchor="middle" fontSize={12.5} fill="var(--ink)" fontWeight={600}>
                  {inrShort(d.revenue)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
