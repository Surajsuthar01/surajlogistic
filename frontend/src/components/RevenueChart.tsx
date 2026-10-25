import { useEffect, useRef, useState } from 'react';
import { inr, inrShort } from '../lib/format';

interface Day {
  date: string;
  revenue: number;
  shipments: number;
}

/** Booked revenue per day as bars from zero; today in plate yellow. Hover or focus a bar for the figures. */
export function RevenueChart({ days }: { days: Day[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  const [hot, setHot] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((e) => setW(Math.max(260, Math.round(e[0]!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 220;
  const bottom = 28;
  const top = 26;
  const max = Math.max(1, ...days.map((d) => d.revenue));
  const L = 46;
  const band = (W - L) / Math.max(1, days.length);
  const bw = Math.max(6, band - 2 - Math.max(2, band * 0.28));
  const every = W < 440 ? 4 : 2;
  const yv = (v: number) => H - bottom - (v / max) * (H - bottom - top);
  const peakI = days.reduce((bi, d, i) => (d.revenue > (days[bi]?.revenue ?? -1) ? i : bi), 0);
  const lbl = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const last = days.length - 1;
  // Light gridlines at round values.
  const step = niceStep(max / 3);
  const grid = [step, step * 2, step * 3].filter((g) => g < max * 1.02);

  return (
    <div ref={box} className="relative w-full">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full" role="img" aria-label="Booked revenue per day for the last 14 days">
        <defs>
          <linearGradient id="rc-blue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'color-mix(in srgb, var(--sign) 55%, #b6d0ff)' }} />
            <stop offset="1" style={{ stopColor: 'var(--sign)' }} />
          </linearGradient>
          <linearGradient id="rc-gold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffe27a" />
            <stop offset="1" style={{ stopColor: 'var(--plate)' }} />
          </linearGradient>
        </defs>
        {grid.map((g) => (
          <g key={g}>
            <line x1={L} x2={W} y1={yv(g)} y2={yv(g)} stroke="var(--line)" strokeDasharray="2 4" />
            <text x={0} y={yv(g) + 4} fontSize={12} fill="var(--muted)">
              {inrShort(g)}
            </text>
          </g>
        ))}
        <line x1={L} x2={W} y1={H - bottom} y2={H - bottom} stroke="var(--line-strong)" />
        {days.map((d, i) => {
          const today = i === last;
          const cx = L + i * band + band / 2;
          const h = Math.max(d.revenue > 0 ? 2 : 0, H - bottom - yv(d.revenue));
          const yTop = H - bottom - h;
          const r = Math.min(4, bw / 2, h);
          return (
            <g key={d.date} onMouseEnter={() => setHot(i)} onMouseLeave={() => setHot(null)} onFocus={() => setHot(i)} onBlur={() => setHot(null)} tabIndex={0} aria-label={`${lbl(d.date)}: ${inr(d.revenue)} from ${d.shipments} shipments`}>
              <rect x={L + i * band} y={0} width={band} height={H - bottom} fill="transparent" />
              {h > 0 && <path d={`M${cx - bw / 2} ${H - bottom} V${yTop + r} Q${cx - bw / 2} ${yTop} ${cx - bw / 2 + r} ${yTop} H${cx + bw / 2 - r} Q${cx + bw / 2} ${yTop} ${cx + bw / 2} ${yTop + r} V${H - bottom} Z`} fill={today ? 'url(#rc-gold)' : 'url(#rc-blue)'} opacity={hot === null || hot === i ? (today ? 1 : 0.9) : 0.4} />}
              {((last - i) % every === 0 && !today) || today ? (
                <text x={today ? Math.min(cx, W - 2) : cx} y={H - 9} textAnchor={today && cx + 20 > W ? 'end' : 'middle'} fontSize={12.5} fill={today ? 'var(--ink)' : 'var(--muted)'} fontWeight={today ? 600 : 400}>
                  {today ? 'Today' : lbl(d.date)}
                </text>
              ) : null}
              {(i === peakI || today) && d.revenue > 0 && hot === null && (
                <text x={Math.min(W - 28, Math.max(28, cx))} y={yTop - 7} textAnchor="middle" fontSize={13} fill="var(--ink)" fontWeight={600}>
                  {inrShort(d.revenue)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hot !== null && days[hot] && (
        <div className="pointer-events-none absolute z-10 rounded-[18px] border border-line bg-sheet px-3 py-2 text-[13.5px]" style={{ left: Math.min(W - 170, Math.max(0, L + hot * band + band / 2 - 80)), top: Math.max(0, yv(days[hot]!.revenue) - 70), width: 160, boxShadow: 'var(--shadow-pop)' }}>
          <div className="text-muted">{hot === last ? 'Today' : lbl(days[hot]!.date)}</div>
          <div className="num text-[15px] font-semibold">{inr(days[hot]!.revenue)}</div>
          <div className="text-muted">
            {days[hot]!.shipments} {days[hot]!.shipments === 1 ? 'shipment' : 'shipments'}
          </div>
        </div>
      )}
      <div className="sr-only">
      <table>
        <caption>Booked revenue per day</caption>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <th scope="row">{lbl(d.date)}</th>
              <td>{inr(d.revenue)}</td>
              <td>{d.shipments} shipments</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function niceStep(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n < 1.5 ? 1 : n < 3.5 ? 2.5 : n < 7.5 ? 5 : 10) * p;
}
