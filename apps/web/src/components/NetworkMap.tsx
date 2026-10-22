import { CITIES } from '@suraj/core';
import { useEffect, useMemo, useRef, useState } from 'react';

export interface MapVehicle {
  id: string;
  regNo: string;
  lat: number;
  lng: number;
  status: string;
  city: string;
  type?: string;
}
export interface MapTrip {
  id: string;
  tripNo: string;
  from: [number, number];
  to: [number, number];
  at: [number, number];
  late: boolean;
  vehicleId: string;
  originCity: string;
  destCity: string;
}
export interface MapFacility {
  id: string;
  code: string;
  name: string;
  lat: number;
  lng: number;
  type: string;
}

interface Props {
  vehicles?: MapVehicle[];
  trips?: MapTrip[];
  facilities?: MapFacility[];
  height?: number;
  onSelectTrip?: (id: string) => void;
  onSelectVehicle?: (id: string) => void;
  /** Extra lat/lng points to keep in frame. */
  focus?: [number, number][];
  compact?: boolean;
}

const COS = Math.cos((22 * Math.PI) / 180);

/**
 * A schematic route board: cities as stations, lanes as lines, trucks as live dots.
 * Projected straight from latitude/longitude so it needs no map tiles or keys; swap
 * for MapLibre with road tiles when real road geometry matters.
 */
export function NetworkMap({ vehicles = [], trips = [], facilities = [], height = 440, onSelectTrip, onSelectVehicle, focus = [], compact }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((e) => setWidth(Math.max(240, e[0]!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const frame = useMemo(() => {
    const pts: [number, number][] = [
      ...vehicles.map((v) => [v.lat, v.lng] as [number, number]),
      ...trips.flatMap((t) => [t.from, t.to]),
      ...facilities.map((f) => [f.lat, f.lng] as [number, number]),
      ...focus,
    ];
    if (!pts.length) pts.push([28.6, 77.2], [19.07, 72.88]);
    let minLat = Math.min(...pts.map((p) => p[0]));
    let maxLat = Math.max(...pts.map((p) => p[0]));
    let minLng = Math.min(...pts.map((p) => p[1]));
    let maxLng = Math.max(...pts.map((p) => p[1]));
    const padLat = Math.max(0.6, (maxLat - minLat) * 0.12);
    const padLng = Math.max(0.6, (maxLng - minLng) * 0.12);
    minLat -= padLat;
    maxLat += padLat;
    minLng -= padLng;
    maxLng += padLng;
    // Grow the shorter side so the map fills its box at true proportions.
    const R = width / height;
    let spanX = (maxLng - minLng) * COS;
    let spanY = maxLat - minLat;
    if (spanX / spanY < R) {
      const extra = (spanY * R) / COS - (maxLng - minLng);
      minLng -= extra / 2;
      maxLng += extra / 2;
      spanX = spanY * R;
    } else {
      const extra = spanX / R - spanY;
      minLat -= extra / 2;
      maxLat += extra / 2;
      spanY = spanX / R;
    }
    const W = 1000;
    const H = W / R;
    return { minLat, maxLat, minLng, maxLng, W, H, sx: W / spanX, sy: H / spanY, u: W / width };
  }, [vehicles, trips, facilities, focus, width, height]);
  const u = frame.u;
  const still = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const x = (lng: number) => (lng - frame.minLng) * COS * frame.sx;
  const y = (lat: number) => (frame.maxLat - lat) * frame.sy;

  const active = new Set([...trips.flatMap((t) => [t.originCity, t.destCity]), ...vehicles.map((v) => v.city), ...facilities.map((f) => nearestName(f.lat, f.lng))]);
  const cities = CITIES.filter((c) => c.lat >= frame.minLat && c.lat <= frame.maxLat && c.lng >= frame.minLng && c.lng <= frame.maxLng);
  // Label busy cities first, then big ones, skipping any that would sit on top of a label already placed.
  const labels = new Set<string>();
  const placed: { lat: number; lng: number }[] = [];
  const minGap = (frame.maxLat - frame.minLat) / 28;
  for (const c of [...cities].sort((a, b) => Number(active.has(b.name)) - Number(active.has(a.name)) || a.tier - b.tier)) {
    if (!active.has(c.name) && (compact || c.tier !== 1)) continue;
    if (placed.some((p) => Math.abs(p.lat - c.lat) < minGap && Math.abs(p.lng - c.lng) < minGap * 3)) continue;
    labels.add(c.name);
    placed.push(c);
  }
  const gridLat: number[] = [];
  for (let la = Math.ceil(frame.minLat / 2) * 2; la <= frame.maxLat; la += 2) gridLat.push(la);
  const gridLng: number[] = [];
  for (let ln = Math.ceil(frame.minLng / 2) * 2; ln <= frame.maxLng; ln += 2) gridLng.push(ln);

  const vehById = new Map(vehicles.map((v) => [v.id, v]));
  const curve = (a: [number, number], b: [number, number]) => {
    const x1 = x(a[1]);
    const y1 = y(a[0]);
    const x2 = x(b[1]);
    const y2 = y(b[0]);
    const mx = (x1 + x2) / 2 - (y2 - y1) * 0.08;
    const my = (y1 + y2) / 2 + (x2 - x1) * 0.08;
    return { d: `M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}`, x1, y1, x2, y2, mx, my };
  };

  return (
    <div ref={box} className="relative w-full overflow-hidden rounded-[12px] bg-panel-2" style={{ height }}>
      <svg viewBox={`0 0 ${frame.W} ${frame.H}`} preserveAspectRatio="xMidYMid meet" className="h-full w-full" role="img" aria-label="Live network map of trucks, lanes and hubs">
        <g stroke="var(--map-grid)" strokeWidth={u}>
          {gridLat.map((la) => (
            <line key={`la${la}`} x1={0} x2={frame.W} y1={y(la)} y2={y(la)} />
          ))}
          {gridLng.map((ln) => (
            <line key={`ln${ln}`} y1={0} y2={frame.H} x1={x(ln)} x2={x(ln)} />
          ))}
        </g>
        {!compact &&
          gridLat.map((la) => (
            <text key={`tl${la}`} x={6 * u} y={y(la) - 4 * u} fontSize={11 * u} fill="var(--muted)" opacity={0.8}>
              {la}°N
            </text>
          ))}

        {cities.map((c) => {
          const on = active.has(c.name);
          const labelled = labels.has(c.name);
          return (
            <g key={c.name}>
              <circle cx={x(c.lng)} cy={y(c.lat)} r={(on ? 3.5 : 2.2) * u} fill={on ? 'var(--ink)' : 'var(--muted)'} opacity={on ? 0.8 : 0.4} />
              {labelled && (
                <text x={x(c.lng) + 7 * u} y={y(c.lat) - 6 * u} fontSize={12.5 * u} fontWeight={on ? 600 : 400} fill={on ? 'var(--ink)' : 'var(--muted)'} style={{ paintOrder: 'stroke', stroke: 'var(--panel-2)', strokeWidth: 3.5 * u }}>
                  {c.name}
                </text>
              )}
            </g>
          );
        })}

        {trips.map((t) => {
          const c = curve(t.from, t.to);
          const color = t.late ? 'var(--bad)' : 'var(--route)';
          const hot = hover === t.id;
          return (
            <g key={t.id} onMouseEnter={() => setHover(t.id)} onMouseLeave={() => setHover(null)} onClick={() => onSelectTrip?.(t.id)} style={{ cursor: onSelectTrip ? 'pointer' : 'default' }}>
              <path d={c.d} fill="none" stroke="transparent" strokeWidth={16 * u} />
              <path d={c.d} fill="none" stroke={color} strokeWidth={(hot ? 2.5 : 1.6) * u} strokeDasharray={`${5 * u} ${5 * u}`} opacity={0.6} />
              <path d={partial(c, t)} fill="none" stroke={color} strokeWidth={(hot ? 4 : 3) * u} strokeLinecap="round" />
              <title>{`${t.tripNo}: ${t.originCity} → ${t.destCity}${t.late ? ' (running late)' : ''}`}</title>
            </g>
          );
        })}

        {facilities.map((f) => (
          <g key={f.id}>
            <rect x={x(f.lng) - 5.5 * u} y={y(f.lat) - 5.5 * u} width={11 * u} height={11 * u} rx={2.5 * u} fill="var(--panel)" stroke="var(--accent)" strokeWidth={2.5 * u} />
            <title>{`${f.name} (${f.code})`}</title>
          </g>
        ))}

        {vehicles.map((v) => {
          const onTrip = v.status === 'ON_TRIP';
          const trip = trips.find((t) => t.vehicleId === v.id);
          const lat = trip ? trip.at[0] : v.lat;
          const lng = trip ? trip.at[1] : v.lng;
          const color = trip?.late ? 'var(--bad)' : onTrip ? 'var(--route)' : v.status === 'IDLE' ? 'var(--accent)' : 'var(--muted)';
          return (
            <g key={v.id} onClick={() => onSelectVehicle?.(v.id)} style={{ cursor: onSelectVehicle ? 'pointer' : 'default' }} onMouseEnter={() => setHover(v.id)} onMouseLeave={() => setHover(null)}>
              {onTrip && !still && (
                <circle cx={x(lng)} cy={y(lat)} r={5 * u} fill="none" stroke={color} strokeWidth={2 * u}>
                  <animate attributeName="r" from={5 * u} to={16 * u} dur="2.4s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.7" to="0" dur="2.4s" repeatCount="indefinite" />
                </circle>
              )}
              <circle cx={x(lng)} cy={y(lat)} r={(hover === v.id ? 7.5 : 6) * u} fill={color} stroke="var(--panel)" strokeWidth={2 * u} />
              <title>{`${v.regNo} · ${v.status.replace('_', ' ').toLowerCase()} · near ${v.city}`}</title>
            </g>
          );
        })}
        {hover && vehById.get(hover) && !compact && (
          <HoverTag x={x(vehById.get(hover)!.lng)} y={y(vehById.get(hover)!.lat)} text={`${vehById.get(hover)!.regNo} · ${vehById.get(hover)!.city}`} w={frame.W} u={u} />
        )}
      </svg>
      {!compact && (
        <div className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap gap-x-3 gap-y-1 rounded-[8px] bg-panel/90 px-2.5 py-1.5 text-[12.5px] text-muted">
          <Legend color="var(--route)" label="On trip" />
          <Legend color="var(--bad)" label="Running late" />
          <Legend color="var(--accent)" label="Idle truck" />
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-[2px] border-2" style={{ borderColor: 'var(--accent)' }} /> Hub / warehouse
          </span>
        </div>
      )}
    </div>
  );

  function partial(c: ReturnType<typeof curve>, t: MapTrip) {
    // Solid line from origin to the truck: the part of the lane already covered.
    const ax = x(t.at[1]);
    const ay = y(t.at[0]);
    return `M${c.x1} ${c.y1} Q${(c.x1 + ax) / 2 - (ay - c.y1) * 0.08} ${(c.y1 + ay) / 2 + (ax - c.x1) * 0.08} ${ax} ${ay}`;
  }
}

function HoverTag({ x, y, text, w, u }: { x: number; y: number; text: string; w: number; u: number }) {
  const width = (text.length * 7 + 16) * u;
  const left = Math.min(w - width - 4 * u, Math.max(4 * u, x + 10 * u));
  return (
    <g pointerEvents="none">
      <rect x={left} y={y - 32 * u} width={width} height={24 * u} rx={5 * u} fill="var(--ink)" />
      <text x={left + 8 * u} y={y - 15.5 * u} fontSize={12.5 * u} fill="var(--panel)">
        {text}
      </text>
    </g>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} /> {label}
    </span>
  );
}

function nearestName(lat: number, lng: number) {
  let best = '';
  let bd = Infinity;
  for (const c of CITIES) {
    const d = (c.lat - lat) ** 2 + (c.lng - lng) ** 2;
    if (d < bd) {
      bd = d;
      best = c.name;
    }
  }
  return best;
}
