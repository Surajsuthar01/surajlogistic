import { roadKm } from './geo';
import type { Point } from './types';

export interface Stop extends Point {
  id: string;
  label?: string;
}

export interface RoutePlan {
  order: string[];
  stops: Stop[];
  totalKm: number;
  originalKm: number;
  savedKm: number;
}

function pathKm(start: Point, stops: Stop[], returnToStart: boolean): number {
  let km = 0;
  let prev: Point = start;
  for (const s of stops) {
    km += roadKm(prev, s);
    prev = s;
  }
  if (returnToStart && stops.length) km += roadKm(prev, start);
  return km;
}

/**
 * Multi-drop route optimiser: nearest-neighbour start, then 2-opt swaps until no
 * swap shortens the route. Good for up to a few hundred drops per vehicle; use a
 * VRP solver (OR-Tools) with time windows and traffic at scale.
 */
export function optimizeRoute(start: Point, stops: Stop[], returnToStart = false): RoutePlan {
  const originalKm = pathKm(start, stops, returnToStart);
  if (stops.length < 3) {
    return { order: stops.map((s) => s.id), stops, totalKm: originalKm, originalKm, savedKm: 0 };
  }
  // Nearest neighbour.
  const left = [...stops];
  const route: Stop[] = [];
  let cur: Point = start;
  while (left.length) {
    let bi = 0;
    let bd = Infinity;
    left.forEach((s, i) => {
      const d = roadKm(cur, s);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    const [next] = left.splice(bi, 1);
    route.push(next!);
    cur = next!;
  }
  // 2-opt.
  let best = pathKm(start, route, returnToStart);
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 200) {
    improved = false;
    for (let i = 0; i < route.length - 1; i++) {
      for (let k = i + 1; k < route.length; k++) {
        const candidate = [...route.slice(0, i), ...route.slice(i, k + 1).reverse(), ...route.slice(k + 1)];
        const d = pathKm(start, candidate, returnToStart);
        if (d + 0.01 < best) {
          best = d;
          route.splice(0, route.length, ...candidate);
          improved = true;
        }
      }
    }
  }
  const totalKm = Math.round(best);
  return { order: route.map((s) => s.id), stops: route, totalKm, originalKm: Math.round(originalKm), savedKm: Math.max(0, Math.round(originalKm - best)) };
}
