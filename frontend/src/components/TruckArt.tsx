import { VEHICLE_CLASSES, type VehicleType } from '@suraj/shared';
import type { ReactElement } from 'react';

/** The goods vehicles we draw, smallest first. Two-wheelers are left out of the lineup. */
export type DrawableTruck = Exclude<VehicleType, 'BIKE'>;
export const LINEUP: DrawableTruck[] = ['TATA_ACE', 'PICKUP_1_5T', 'LCV_14FT', 'TRUCK_19FT', 'TRUCK_22FT', 'CONTAINER_32FT_SXL', 'CONTAINER_32FT_MXL', 'TRAILER_40FT'];

interface Spec {
  name: string;
  /** Body (or trailer) length in feet. */
  body: number;
  bodyLabel: string;
  kind: 'open' | 'box' | 'trailer';
  bodyH: number;
  cab: number;
  cabH: number;
  /** Pickups have a bonnet in front of the cab. */
  hood?: number;
  wheel: number;
  /** Rear axles, in feet from the back of the body. */
  rear: number[];
  /** Front axle, in feet back from the nose. */
  front: number;
  use: string;
  short: string;
}

/** Rough real-world proportions in feet, enough to draw each class to the same scale. */
export const TRUCK_SPECS: Record<DrawableTruck, Spec> = {
  TATA_ACE: { name: 'Mini truck', short: 'Mini truck', body: 7, bodyLabel: '7 ft', kind: 'open', bodyH: 1.25, cab: 4.2, cabH: 4.3, wheel: 1.8, rear: [1.7], front: 2.2, use: 'Lanes inside a city, shop restocking, last-mile parcels' },
  PICKUP_1_5T: { name: 'Pickup', short: 'Pickup', body: 8.5, bodyLabel: '8.5 ft', kind: 'open', bodyH: 1.5, cab: 6.6, cabH: 4.4, hood: 2.6, wheel: 2.4, rear: [2.4], front: 1.9, use: 'Short hauls between towns, building material, farm produce' },
  LCV_14FT: { name: '14 ft LCV', short: '14 ft', body: 14, bodyLabel: '14 ft', kind: 'open', bodyH: 2.3, cab: 5.8, cabH: 5.1, wheel: 2.7, rear: [4.4], front: 2.7, use: 'FMCG distribution, furniture, part loads to nearby cities' },
  TRUCK_19FT: { name: '19 ft truck', short: '19 ft', body: 19, bodyLabel: '19 ft', kind: 'open', bodyH: 3.4, cab: 6.6, cabH: 6.1, wheel: 3.2, rear: [5.6], front: 3.1, use: 'Intercity part loads, white goods, packed cartons' },
  TRUCK_22FT: { name: '22 ft truck', short: '22 ft', body: 22, bodyLabel: '22 ft', kind: 'open', bodyH: 3.8, cab: 6.8, cabH: 6.3, wheel: 3.3, rear: [4.9, 8.6], front: 3.2, use: 'Full loads of textiles, FMCG, grain and bagged goods' },
  CONTAINER_32FT_SXL: { name: '32 ft container, single axle', short: '32 ft SXL', body: 32, bodyLabel: '32 ft', kind: 'box', bodyH: 7.8, cab: 6.8, cabH: 6.4, wheel: 3.3, rear: [8.4], front: 3.2, use: 'Light, bulky cargo that must stay dry: e-commerce, electronics' },
  CONTAINER_32FT_MXL: { name: '32 ft container, multi axle', short: '32 ft MXL', body: 32, bodyLabel: '32 ft', kind: 'box', bodyH: 7.8, cab: 6.8, cabH: 6.4, wheel: 3.3, rear: [6.6, 10.3], front: 3.2, use: 'Heavier closed-body loads over long national-highway runs' },
  TRAILER_40FT: { name: '40 ft trailer', short: '40 ft', body: 40, bodyLabel: '40 ft', kind: 'trailer', bodyH: 8.4, cab: 8, cabH: 7, wheel: 3.4, rear: [3.2, 6.8, 10.4], front: 3.2, use: 'Port containers, steel, machinery and project cargo' },
};

export function truckFacts(t: DrawableTruck) {
  const c = VEHICLE_CLASSES[t];
  const s = TRUCK_SPECS[t];
  return { ...s, capacityKg: c.capacityKg, kmpl: c.kmpl, ratePerKm: c.ratePerKm, heavy: c.heavy, label: c.label };
}

interface Geometry {
  length: number;
  top: number;
  bodyEnd: number;
  shapes: ReactElement[];
}

const line = { vectorEffect: 'non-scaling-stroke' as const };

/** Draws the truck in feet, ground at y = 0 and y pointing up (flipped by the caller). */
function geometry(t: DrawableTruck): Geometry {
  const s = TRUCK_SPECS[t];
  const r = s.wheel / 2;
  const shapes: ReactElement[] = [];
  const Y = (y: number) => -y;
  const fillBody = 'color-mix(in srgb, currentColor 7%, transparent)';
  const glass = 'color-mix(in srgb, currentColor 22%, #0a1430)';
  let key = 0;
  const k = () => `s${key++}`;

  let bodyX0 = 0;
  let bodyX1 = s.body;
  let deck = s.wheel * 1.02;
  let cabX0: number;
  let cabX1: number;
  let cabBottom: number;
  const axles: number[] = [];

  if (s.kind === 'trailer') {
    // A tractor head pulling a 40 ft flat trailer with a box on it.
    deck = s.wheel * 1.22;
    cabX0 = 42.4;
    cabX1 = cabX0 + s.cab;
    cabBottom = r * 1.15;
    // Tractor chassis and fifth wheel.
    shapes.push(<rect key={k()} x={36.6} y={Y(s.wheel * 1.02)} width={cabX1 - 36.6} height={0.4} fill="currentColor" opacity={0.9} />);
    shapes.push(<rect key={k()} x={37.6} y={Y(deck)} width={2.6} height={deck - s.wheel * 1.02} fill="currentColor" opacity={0.6} />);
    // Trailer deck, landing legs, the box.
    shapes.push(<rect key={k()} x={0} y={Y(deck + 0.45)} width={40} height={0.45} fill="currentColor" />);
    shapes.push(<rect key={k()} x={28.6} y={Y(deck)} width={0.35} height={deck - 0.9} fill="currentColor" opacity={0.75} />);
    shapes.push(<rect key={k()} x={28.2} y={Y(0.95)} width={1.15} height={0.22} fill="currentColor" opacity={0.75} />);
    bodyX0 = 0.15;
    bodyX1 = 39.85;
    deck += 0.45;
    s.rear.forEach((a) => axles.push(a));
    axles.push(38.1, 41.4, cabX1 - s.front);
  } else {
    cabX0 = s.body + 0.35;
    cabX1 = cabX0 + s.cab;
    cabBottom = r * 1.05;
    shapes.push(<rect key={k()} x={-0.25} y={Y(deck)} width={cabX1 - 0.5} height={0.38} fill="currentColor" opacity={0.55} />);
    s.rear.forEach((a) => axles.push(a));
    axles.push(cabX1 - s.front);
  }

  // The load space.
  const bTop = deck + s.bodyH;
  if (s.kind === 'open') {
    shapes.push(<rect key={k()} x={bodyX0} y={Y(bTop)} width={bodyX1 - bodyX0} height={s.bodyH} fill={fillBody} stroke="currentColor" style={line} />);
    const planks = Math.max(1, Math.round(s.bodyH / 0.62));
    for (let i = 1; i < planks; i++) {
      const y = deck + (s.bodyH * i) / planks;
      shapes.push(<line key={k()} x1={bodyX0} x2={bodyX1} y1={Y(y)} y2={Y(y)} stroke="currentColor" strokeOpacity={0.35} style={line} />);
    }
    const posts = Math.max(1, Math.round((bodyX1 - bodyX0) / 3.6));
    for (let i = 1; i < posts; i++) {
      const x = bodyX0 + ((bodyX1 - bodyX0) * i) / posts;
      shapes.push(<line key={k()} x1={x} x2={x} y1={Y(deck)} y2={Y(bTop)} stroke="currentColor" strokeOpacity={0.55} style={line} />);
    }
    // Top rail.
    shapes.push(<rect key={k()} x={bodyX0 - 0.1} y={Y(bTop + 0.16)} width={bodyX1 - bodyX0 + 0.2} height={0.22} fill="currentColor" />);
  } else {
    shapes.push(<rect key={k()} x={bodyX0} y={Y(bTop)} width={bodyX1 - bodyX0} height={s.bodyH} rx={0.15} fill={fillBody} stroke="currentColor" style={line} />);
    for (let x = bodyX0 + 1.2; x < bodyX1 - 0.6; x += 1.15) {
      shapes.push(<line key={k()} x1={x} x2={x} y1={Y(deck + 0.35)} y2={Y(bTop - 0.35)} stroke="currentColor" strokeOpacity={0.22} style={line} />);
    }
    shapes.push(<line key={k()} x1={bodyX0} x2={bodyX1} y1={Y(bTop - 0.35)} y2={Y(bTop - 0.35)} stroke="currentColor" strokeOpacity={0.5} style={line} />);
    shapes.push(<line key={k()} x1={bodyX0} x2={bodyX1} y1={Y(deck + 0.35)} y2={Y(deck + 0.35)} stroke="currentColor" strokeOpacity={0.5} style={line} />);
    // Rear doors and the brand stripe.
    shapes.push(<line key={k()} x1={bodyX0 + 0.55} x2={bodyX0 + 0.55} y1={Y(deck + 0.35)} y2={Y(bTop - 0.35)} stroke="currentColor" strokeOpacity={0.6} style={line} />);
    shapes.push(<rect key={k()} x={bodyX0 + (bodyX1 - bodyX0) * 0.08} y={Y(deck + s.bodyH * 0.36)} width={(bodyX1 - bodyX0) * 0.5} height={0.32} fill="var(--orange)" />);
  }

  // Cab, with an optional bonnet.
  const cabTop = cabBottom + s.cabH;
  const hood = s.hood ?? 0;
  const front = cabX1 - hood;
  const slopeX = (front - cabX0) * 0.2;
  const slopeY = s.cabH * (hood ? 0.5 : 0.36);
  const d = hood
    ? `M${cabX0} ${Y(cabBottom)} V${Y(cabTop - 0.3)} Q${cabX0} ${Y(cabTop)} ${cabX0 + 0.3} ${Y(cabTop)} H${front - slopeX} L${front} ${Y(cabTop - slopeY)} H${cabX1 - 0.35} Q${cabX1} ${Y(cabTop - slopeY)} ${cabX1} ${Y(cabTop - slopeY - 0.35)} V${Y(cabBottom)} Z`
    : `M${cabX0} ${Y(cabBottom)} V${Y(cabTop - 0.3)} Q${cabX0} ${Y(cabTop)} ${cabX0 + 0.3} ${Y(cabTop)} H${cabX1 - slopeX} L${cabX1} ${Y(cabTop - slopeY)} V${Y(cabBottom)} Z`;
  shapes.push(<path key={k()} d={d} fill="var(--sign)" stroke="currentColor" strokeOpacity={0.5} style={line} />);
  // Side window, its front edge parallel to the windscreen.
  const winTop = cabTop - 0.32;
  const winBottom = cabTop - slopeY * 1.12;
  const windX = (y: number) => front - slopeX + ((cabTop - y) / slopeY) * slopeX - 0.32;
  shapes.push(
    <path
      key={k()}
      d={`M${cabX0 + (front - cabX0) * 0.4} ${Y(winTop)} H${windX(winTop)} L${windX(winBottom)} ${Y(winBottom)} H${cabX0 + (front - cabX0) * 0.4} Z`}
      fill={glass}
      stroke="rgb(255 255 255 / 0.35)"
      style={line}
    />,
  );
  // Door, handle, headlamp, bumper.
  const doorX = cabX0 + (front - cabX0) * 0.34;
  shapes.push(<line key={k()} x1={doorX} x2={doorX} y1={Y(cabBottom + 0.35)} y2={Y(winTop)} stroke="rgb(255 255 255 / 0.4)" style={line} />);
  shapes.push(<rect key={k()} x={doorX + 0.25} y={Y(winBottom - 0.45)} width={0.55} height={0.14} rx={0.07} fill="rgb(255 255 255 / 0.7)" />);
  shapes.push(<rect key={k()} x={cabX1 - 0.16} y={Y(cabBottom + 0.95)} width={0.16} height={0.42} fill="#ffd37a" />);
  shapes.push(<rect key={k()} x={front - (front - cabX0) * 0.45} y={Y(cabBottom)} width={cabX1 - front + (front - cabX0) * 0.45 + 0.2} height={0.36} rx={0.1} fill="currentColor" />);

  // Wheels.
  for (const ax of axles) {
    shapes.push(
      <g key={k()}>
        <circle cx={ax} cy={Y(r)} r={r} fill="#121419" stroke="currentColor" strokeOpacity={0.55} style={line} />
        <circle cx={ax} cy={Y(r)} r={r * 0.5} fill="color-mix(in srgb, currentColor 30%, #121419)" />
        <circle cx={ax} cy={Y(r)} r={r * 0.15} fill="#121419" />
      </g>,
    );
  }

  return { length: cabX1 + 0.2, top: Math.max(bTop + (s.kind === 'open' ? 0.16 : 0), cabTop), bodyEnd: s.kind === 'trailer' ? 40 : s.body, shapes };
}

/** A small side view, drawn to a shared scale so the lineup shows real relative sizes. */
export function TruckThumb({ type, height = 40 }: { type: DrawableTruck; height?: number }) {
  const g = geometry(type);
  const H = 13.4;
  const W = g.length + 0.6;
  return (
    <svg viewBox={`-0.4 ${-H} ${W} ${H + 0.3}`} width={(W * height) / (H + 0.3)} height={height} aria-hidden="true" className="block overflow-visible">
      {g.shapes}
    </svg>
  );
}

/** A large drawing with a dimension line and a person for scale. */
export function TruckDrawing({ type, className = '' }: { type: DrawableTruck; className?: string }) {
  const s = TRUCK_SPECS[type];
  const g = geometry(type);
  const left = -4.2;
  const right = g.length + 1.4;
  const vbW = right - left;
  const fs = Math.max(vbW * 0.017, 0.42);
  const dimY = g.top + fs * 2.2;
  const vbTop = dimY + fs * 2.2;
  const vbH = vbTop + 0.8;
  const tick = fs * 0.7;
  return (
    <svg viewBox={`${left} ${-vbTop} ${vbW} ${vbH}`} preserveAspectRatio="xMidYMax meet" className={`block h-full w-full ${className}`} role="img" aria-label={`${s.name}, ${s.bodyLabel} body, side view`}>
      {/* Ground. */}
      <line x1={left} x2={right} y1={0} y2={0} stroke="currentColor" strokeOpacity={0.35} style={line} />
      {/* Person, 5 ft 7 in, for scale. */}
      <g opacity={0.32} fill="currentColor">
        <circle cx={-2.4} cy={-5.15} r={0.4} />
        <path d="M-2.95 -4.55 h1.1 a0.25 0.25 0 0 1 0.25 0.25 v2.25 h-0.3 v2.05 h-0.4 v-2.05 h-0.2 v2.05 h-0.4 v-2.05 h-0.3 v-2.25 a0.25 0.25 0 0 1 0.25 -0.25z" />
      </g>
      {g.shapes}
      {/* Body length. */}
      <g stroke="currentColor" strokeOpacity={0.55} style={line}>
        <line x1={0} x2={g.bodyEnd} y1={-dimY} y2={-dimY} style={line} />
        <line x1={0} x2={0} y1={-dimY - tick} y2={-dimY + tick} style={line} />
        <line x1={g.bodyEnd} x2={g.bodyEnd} y1={-dimY - tick} y2={-dimY + tick} style={line} />
      </g>
      <text x={g.bodyEnd / 2} y={-dimY - fs * 0.55} textAnchor="middle" fontSize={fs} fill="currentColor" style={{ fontFamily: 'var(--font-display)', fontWeight: 600, letterSpacing: '0.12em' }}>
        {s.bodyLabel.toUpperCase()} {s.kind === 'trailer' ? 'TRAILER' : 'BODY'}
      </text>
    </svg>
  );
}
