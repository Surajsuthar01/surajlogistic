import { CITIES } from '@suraj/shared';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { INDIA_OUTLINE } from './indiaOutline';

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
  /** A planned multi-stop route to draw as one line (route planner). */
  path?: [number, number][];
  compact?: boolean;
  legend?: boolean;
  /** Overlay in the top-left corner, e.g. a live count. */
  hud?: ReactNode;
  /** Show the whole country rather than fitting to the trucks. */
  wholeCountry?: boolean;
}

/*
  Main road corridors between the cities we serve, simplified to straight runs between towns.
  Drawn as faint threads over the dot-matrix country, so the network has shape without tiles.
*/
const CORRIDORS: string[][] = [
  ['Amritsar', 'Ludhiana', 'Chandigarh', 'Delhi'],
  ['Dehradun', 'Delhi'],
  ['Delhi', 'Gurugram', 'Jaipur', 'Ajmer', 'Bhilwara', 'Chittorgarh', 'Udaipur', 'Ahmedabad', 'Vadodara', 'Surat', 'Mumbai', 'Pune', 'Bengaluru', 'Chennai'],
  ['Jodhpur', 'Ajmer'],
  ['Jaipur', 'Agra', 'Kanpur', 'Lucknow'],
  ['Delhi', 'Noida', 'Agra'],
  ['Agra', 'Bhopal', 'Nagpur', 'Hyderabad', 'Bengaluru', 'Mysuru'],
  ['Kanpur', 'Patna', 'Kolkata', 'Guwahati'],
  ['Lucknow', 'Patna'],
  ['Kolkata', 'Bhubaneswar', 'Visakhapatnam', 'Vijayawada', 'Chennai'],
  ['Nagpur', 'Raipur', 'Bhubaneswar'],
  ['Jaipur', 'Kota', 'Ujjain', 'Dewas', 'Indore', 'Nashik', 'Mumbai'],
  ['Ajmer', 'Neemuch', 'Mandsaur', 'Ratlam', 'Indore'],
  ['Indore', 'Bhopal'],
  ['Ahmedabad', 'Rajkot'],
  ['Pune', 'Hyderabad', 'Vijayawada'],
  ['Bengaluru', 'Coimbatore', 'Kochi'],
  ['Nashik', 'Nagpur'],
];

const COS = Math.cos((22 * Math.PI) / 180);
const byName = new Map(CITIES.map((c) => [c.name, c]));
const MONO = { fontFamily: 'var(--font-display)' } as const;

type P = [number, number];
const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
/** Point on a quadratic curve. */
const qAt = (p0: P, p1: P, p2: P, t: number) => lerp(lerp(p0, p1, t), lerp(p1, p2, t), t);

/**
 * Live network on a night screen: India as a field of dots, highway threads, lanes drawn as
 * arcs, trucks riding them. Projected straight from latitude/longitude, so no tiles or keys.
 */
export function NetworkMap({ vehicles = [], trips = [], facilities = [], height = 440, onSelectTrip, onSelectVehicle, focus = [], path, compact, legend = !compact, hud, wholeCountry }: Props) {
  const uid = useId().replace(/:/g, '');
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
    const pts: P[] = wholeCountry
      ? [
          [8, 68],
          [36, 97.5],
        ]
      : [...vehicles.map((v) => [v.lat, v.lng] as P), ...trips.flatMap((t) => [t.from, t.to]), ...facilities.map((f) => [f.lat, f.lng] as P), ...(path ?? []), ...focus];
    if (!pts.length) pts.push([28.6, 77.2], [19.07, 72.88]);
    let minLat = Math.min(...pts.map((p) => p[0]));
    let maxLat = Math.max(...pts.map((p) => p[0]));
    let minLng = Math.min(...pts.map((p) => p[1]));
    let maxLng = Math.max(...pts.map((p) => p[1]));
    const padLat = Math.max(0.7, (maxLat - minLat) * (wholeCountry ? 0.03 : 0.16));
    const padLng = Math.max(0.7, (maxLng - minLng) * (wholeCountry ? 0.03 : 0.14));
    minLat -= padLat;
    maxLat += padLat;
    minLng -= padLng;
    maxLng += padLng;
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
  }, [vehicles, trips, facilities, focus, path, width, height, wholeCountry]);
  const u = frame.u;
  const still = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const x = (lng: number) => (lng - frame.minLng) * COS * frame.sx;
  const y = (lat: number) => (frame.maxLat - lat) * frame.sy;
  const xy = (p: P): P => [x(p[1]), y(p[0])];
  const inView = (c: { lat: number; lng: number }, m = 0) => c.lat >= frame.minLat - m && c.lat <= frame.maxLat + m && c.lng >= frame.minLng - m && c.lng <= frame.maxLng + m;

  const india = 'M' + INDIA_OUTLINE.map(([ln, la]) => `${x(ln).toFixed(1)} ${y(la).toFixed(1)}`).join('L') + 'Z';
  // Dot pitch in screen pixels, so the field looks the same at any zoom.
  const pitch = (compact ? 7 : 8) * u;
  // The country as dots: one path of zero-length strokes with round caps, clipped to the outline.
  const dots = useMemo(() => {
    const px = (ln: number) => (ln - frame.minLng) * COS * frame.sx;
    const py = (la: number) => (frame.maxLat - la) * frame.sy;
    const poly = INDIA_OUTLINE.map(([ln, la]) => [px(ln), py(la)] as P);
    const xs = poly.map((q) => q[0]);
    const ys = poly.map((q) => q[1]);
    const x0 = Math.max(0, Math.min(...xs));
    const x1 = Math.min(frame.W, Math.max(...xs));
    const y0 = Math.max(0, Math.min(...ys));
    const y1 = Math.min(frame.H, Math.max(...ys));
    const inside = (gx: number, gy: number) => {
      let hit = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i]!;
        const [xj, yj] = poly[j]!;
        if (yi > gy !== yj > gy && gx < ((xj - xi) * (gy - yi)) / (yj - yi) + xi) hit = !hit;
      }
      return hit;
    };
    let d = '';
    for (let gy = Math.ceil(y0 / pitch) * pitch + pitch / 2; gy < y1; gy += pitch) {
      for (let gx = Math.ceil(x0 / pitch) * pitch + pitch / 2; gx < x1; gx += pitch) if (inside(gx, gy)) d += `M${gx.toFixed(1)} ${gy.toFixed(1)}h0`;
    }
    return d;
  }, [frame, pitch]);

  const active = new Set([...trips.flatMap((t) => [t.originCity, t.destCity]), ...vehicles.map((v) => v.city), ...facilities.map((f) => nearestName(f.lat, f.lng)), ...(path ?? []).map(([la, ln]) => nearestName(la, ln))]);
  const cities = CITIES.filter((c) => inView(c));
  const labels = new Set<string>();
  const placed: { lat: number; lng: number }[] = [];
  const latPerPx = (frame.maxLat - frame.minLat) / height;
  const lngPerPx = (frame.maxLng - frame.minLng) / width;
  for (const c of [...cities].sort((a, b) => Number(active.has(b.name)) - Number(active.has(a.name)) || a.tier - b.tier)) {
    if (!active.has(c.name) && (compact || c.tier !== 1)) continue;
    if (placed.some((p) => Math.abs(p.lat - c.lat) < 18 * latPerPx && Math.abs(p.lng - c.lng) < 90 * lngPerPx)) continue;
    labels.add(c.name);
    placed.push(c);
  }
  const grid: { lat: number[]; lng: number[] } = { lat: [], lng: [] };
  for (let la = Math.ceil(frame.minLat / 5) * 5; la <= frame.maxLat; la += 5) grid.lat.push(la);
  for (let ln = Math.ceil(frame.minLng / 5) * 5; ln <= frame.maxLng; ln += 5) grid.lng.push(ln);

  const roads = CORRIDORS.map((names) => names.map((n) => byName.get(n)).filter((c): c is NonNullable<typeof c> => !!c)).filter((cs) => cs.some((c) => inView(c, 3)));
  const vehById = new Map(vehicles.map((v) => [v.id, v]));

  /** Each lane is an arc that bows away from the equator, like a flight path. */
  const lanes = trips.map((t) => {
    const a = xy(t.from);
    const b = xy(t.to);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len;
    let ny = dx / len;
    if (ny > 0) {
      nx = -nx;
      ny = -ny;
    }
    const bow = Math.min(len * 0.2, 120 * u);
    const c: P = [(a[0] + b[0]) / 2 + nx * bow, (a[1] + b[1]) / 2 + ny * bow];
    // Where the truck is along the arc: the sample closest to its GPS fix.
    const at = xy(t.at);
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i <= 60; i++) {
      const p = qAt(a, c, b, i / 60);
      const d = (p[0] - at[0]) ** 2 + (p[1] - at[1]) ** 2;
      if (d < bd) {
        bd = d;
        best = i / 60;
      }
    }
    // Split the curve at `best` for the travelled part.
    const c1 = lerp(a, c, best);
    const pos = qAt(a, c, b, best);
    return { t, a, b, c, pos, full: `M${a[0]} ${a[1]}Q${c[0]} ${c[1]} ${b[0]} ${b[1]}`, done: `M${a[0]} ${a[1]}Q${c1[0]} ${c1[1]} ${pos[0]} ${pos[1]}` };
  });
  const posOf = new Map(lanes.map((l) => [l.t.vehicleId, l.pos]));

  // Scale bar: 1° of latitude is about 111 km.
  const kmPerUnit = 111 / frame.sy;
  const scaleKm = [50, 100, 200, 500].find((k) => k / kmPerUnit / u >= 64) ?? 500;
  const scaleW = scaleKm / kmPerUnit;
  const hv = hover ? vehById.get(hover) : undefined;
  const hvPos = hv ? (posOf.get(hv.id) ?? xy([hv.lat, hv.lng])) : undefined;

  return (
    <div ref={box} className="map-slab w-full overflow-hidden" style={{ height }}>
      <svg viewBox={`0 0 ${frame.W} ${frame.H}`} preserveAspectRatio="xMidYMid meet" className="relative h-full w-full" role="img" aria-label="Map of trucks, lanes and hubs">
        <defs>
          <filter id={`glow-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={3.2 * u} result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id={`halo-${uid}`}>
            <stop offset="0" stopColor="#4d8bff" stopOpacity="0.22" />
            <stop offset="1" stopColor="#4d8bff" stopOpacity="0" />
          </radialGradient>
          {lanes.map((l) => (
            <linearGradient key={l.t.id} id={`trail-${uid}-${l.t.id}`} gradientUnits="userSpaceOnUse" x1={l.a[0]} y1={l.a[1]} x2={l.pos[0]} y2={l.pos[1]}>
              <stop offset="0" stopColor={l.t.late ? 'var(--map-late)' : 'var(--map-go)'} stopOpacity="0.05" />
              <stop offset="1" stopColor={l.t.late ? 'var(--map-late)' : 'var(--map-go)'} stopOpacity="1" />
            </linearGradient>
          ))}
        </defs>

        {/* Graticule every 5 degrees. */}
        <g stroke="var(--map-grid)" strokeWidth={u} strokeDasharray={`${1.5 * u} ${5 * u}`}>
          {grid.lat.map((la) => (
            <line key={`la${la}`} x1={0} x2={frame.W} y1={y(la)} y2={y(la)} />
          ))}
          {grid.lng.map((ln) => (
            <line key={`ln${ln}`} y1={0} y2={frame.H} x1={x(ln)} x2={x(ln)} />
          ))}
        </g>

        {/* The country as a field of dots. */}
        <path d={dots} fill="none" stroke="var(--map-land)" strokeWidth={pitch * 0.3} strokeLinecap="round" />
        <path d={india} fill="none" stroke="rgb(255 255 255 / 0.06)" strokeWidth={u} strokeLinejoin="round" />

        {/* Soft light where the lanes are. */}
        {lanes.map((l) => (
          <circle key={`h-${l.t.id}`} cx={l.pos[0]} cy={l.pos[1]} r={70 * u} fill={`url(#halo-${uid})`} />
        ))}

        <g fill="none" stroke="rgb(255 255 255 / 0.075)" strokeWidth={1.1 * u} strokeLinejoin="round" strokeLinecap="round">
          {roads.map((cs, i) => (
            <polyline key={i} points={cs.map((c) => `${x(c.lng)},${y(c.lat)}`).join(' ')} />
          ))}
        </g>

        {cities.map((c) => {
          const on = active.has(c.name);
          return <circle key={c.name} cx={x(c.lng)} cy={y(c.lat)} r={(on ? 2.4 : 1.6) * u} fill={on ? '#ffffff' : 'rgb(255 255 255 / 0.4)'} />;
        })}

        {path && path.length > 1 && (
          <g>
            <polyline points={path.map(([la, ln]) => `${x(ln)},${y(la)}`).join(' ')} fill="none" stroke="var(--map-go)" strokeWidth={2.6 * u} strokeLinejoin="round" strokeLinecap="round" filter={`url(#glow-${uid})`} />
            {path.map(([la, ln], i) => (
              <g key={i}>
                <circle cx={x(ln)} cy={y(la)} r={9.5 * u} fill={i === 0 ? '#ffffff' : '#050608'} stroke={i === 0 ? '#ffffff' : 'var(--map-go)'} strokeWidth={1.6 * u} />
                <text x={x(ln)} y={y(la) + 3.6 * u} textAnchor="middle" fontSize={10 * u} fontWeight={600} fill={i === 0 ? '#050608' : '#ffffff'} style={MONO}>
                  {i === 0 ? 'S' : i}
                </text>
              </g>
            ))}
          </g>
        )}

        {lanes.map((l) => {
          const color = l.t.late ? 'var(--map-late)' : 'var(--map-go)';
          const hot = hover === l.t.id || hover === l.t.vehicleId;
          return (
            <g key={l.t.id} onMouseEnter={() => setHover(l.t.id)} onMouseLeave={() => setHover(null)} onClick={() => onSelectTrip?.(l.t.id)} style={{ cursor: onSelectTrip ? 'pointer' : 'default' }}>
              <path d={l.full} fill="none" stroke="transparent" strokeWidth={20 * u} />
              <path d={l.full} fill="none" stroke={color} strokeWidth={(hot ? 1.6 : 1.1) * u} strokeDasharray={`${2 * u} ${4.5 * u}`} opacity={hot ? 0.8 : 0.45} />
              <path d={l.done} fill="none" stroke={`url(#trail-${uid}-${l.t.id})`} strokeWidth={(hot ? 3.4 : 2.6) * u} strokeLinecap="round" filter={`url(#glow-${uid})`} />
              <circle cx={l.b[0]} cy={l.b[1]} r={5 * u} fill="none" stroke={color} strokeWidth={1.4 * u} opacity={0.9} />
              <title>{`${l.t.tripNo}: ${l.t.originCity} to ${l.t.destCity}${l.t.late ? ', running late' : ''}`}</title>
            </g>
          );
        })}

        {facilities.map((f) => (
          <g key={f.id}>
            <rect x={x(f.lng) - 5.5 * u} y={y(f.lat) - 5.5 * u} width={11 * u} height={11 * u} rx={1.5 * u} fill="#050608" stroke="#ffffff" strokeWidth={1.5 * u} />
            <rect x={x(f.lng) - 1.8 * u} y={y(f.lat) - 1.8 * u} width={3.6 * u} height={3.6 * u} fill="#ffffff" />
            <title>{`${f.name} (${f.code})`}</title>
          </g>
        ))}

        {vehicles.map((v) => {
          const lane = lanes.find((l) => l.t.vehicleId === v.id);
          const [cx, cy] = lane ? lane.pos : xy([v.lat, v.lng]);
          const onTrip = v.status === 'ON_TRIP';
          const color = lane?.t.late ? 'var(--map-late)' : onTrip ? 'var(--map-go)' : v.status === 'IDLE' ? 'var(--map-idle)' : 'var(--map-dim)';
          return (
            <g key={v.id} onClick={() => onSelectVehicle?.(v.id)} style={{ cursor: onSelectVehicle ? 'pointer' : 'default' }} onMouseEnter={() => setHover(v.id)} onMouseLeave={() => setHover(null)}>
              <circle cx={cx} cy={cy} r={14 * u} fill="transparent" />
              {onTrip && !still && (
                <circle cx={cx} cy={cy} r={5 * u} fill="none" stroke={color} strokeWidth={1.2 * u}>
                  <animate attributeName="r" from={5 * u} to={20 * u} dur="2.4s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.8" to="0" dur="2.4s" repeatCount="indefinite" />
                </circle>
              )}
              {onTrip ? (
                <>
                  <circle cx={cx} cy={cy} r={(hover === v.id ? 6.5 : 5.2) * u} fill={color} filter={`url(#glow-${uid})`} />
                  <circle cx={cx} cy={cy} r={2 * u} fill="#ffffff" />
                </>
              ) : (
                <circle cx={cx} cy={cy} r={(hover === v.id ? 5 : 3.8) * u} fill={color} stroke="#050608" strokeWidth={1.4 * u} />
              )}
              <title>{`${v.regNo}, ${v.status === 'ON_TRIP' ? 'on trip' : v.status === 'IDLE' ? 'idle' : 'in workshop'} near ${v.city}`}</title>
            </g>
          );
        })}

        {cities
          .filter((c) => labels.has(c.name))
          .map((c) => {
            const on = active.has(c.name);
            return (
              <text
                key={`l-${c.name}`}
                x={x(c.lng) + 7 * u}
                y={y(c.lat) - 6 * u}
                fontSize={(on ? 10.5 : 9.5) * u}
                fontWeight={on ? 600 : 500}
                letterSpacing={0.08 * 10 * u}
                fill={on ? '#ffffff' : 'rgb(255 255 255 / 0.42)'}
                style={{ ...MONO, textTransform: 'uppercase', paintOrder: 'stroke', stroke: '#050608', strokeWidth: 3.5 * u, strokeLinejoin: 'round' }}
                pointerEvents="none"
              >
                {c.name}
              </text>
            );
          })}

        {hv && hvPos && !compact && <HoverTag x={hvPos[0]} y={hvPos[1]} reg={hv.regNo} city={hv.city} w={frame.W} u={u} />}

        <g transform={`translate(${frame.W - scaleW - 18 * u} ${frame.H - 18 * u})`} pointerEvents="none">
          <path d={`M0 ${-4 * u} V0 H${scaleW} V${-4 * u}`} fill="none" stroke="rgb(255 255 255 / 0.4)" strokeWidth={1.1 * u} />
          <text x={scaleW / 2} y={-8 * u} textAnchor="middle" fontSize={9.5 * u} letterSpacing={0.8 * u} fill="rgb(255 255 255 / 0.5)" style={MONO}>
            {scaleKm} KM
          </text>
        </g>
      </svg>
      {hud && <div className="pointer-events-none absolute top-3.5 left-4 font-display font-[560] text-[12.5px] text-white/70">{hud}</div>}
      {legend && (
        <div className="pointer-events-none absolute bottom-3 left-4 flex flex-wrap gap-x-4 gap-y-1 font-display font-[560] text-[12px] text-white/55">
          <Key color="var(--map-go)" label="On trip" />
          <Key color="var(--map-late)" label="Late" />
          <Key color="var(--map-idle)" label="Idle" />
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-[1px] border-[1.5px] border-white" /> Hub
          </span>
        </div>
      )}
    </div>
  );
}

function HoverTag({ x, y, reg, city, w, u }: { x: number; y: number; reg: string; city: string; w: number; u: number }) {
  const width = (reg.length * 7.4 + city.length * 6.9 + 38) * u;
  const left = Math.min(w - width - 4 * u, Math.max(4 * u, x + 14 * u));
  return (
    <g pointerEvents="none">
      <rect x={left} y={y - 36 * u} width={width} height={26 * u} rx={13 * u} fill="rgb(10 11 14 / 0.92)" stroke="rgb(255 255 255 / 0.14)" strokeWidth={u} />
      <text x={left + 12 * u} y={y - 18.5 * u} fontSize={11.5 * u} fontWeight={600} fill="#f5c400" style={MONO}>
        {reg}
        <tspan fontWeight={400} fill="rgb(255 255 255 / 0.75)" dx={8 * u}>
          {city.toUpperCase()}
        </tspan>
      </text>
    </g>
  );
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} /> {label}
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
