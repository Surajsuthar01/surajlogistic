import { haversineKm, roadKm } from './geo';
import type { Point } from './types';
import { canCarry, VEHICLE_CLASSES, type VehicleType } from './vehicles';

export interface MatchLoad {
  id: string;
  origin: Point & { city: string };
  destination: Point & { city: string };
  weightKg: number;
  vehicleType?: VehicleType | null;
  pickupDate: string; // ISO
  targetPrice: number; // ₹ the shipper offers
}

export interface MatchVehicle {
  id: string;
  type: VehicleType;
  /** Where the truck is, or where it will unload next. */
  at: Point;
  availableAt?: string;
}

export interface ReturnLoadMatch {
  load: MatchLoad;
  deadheadKm: number;
  loadedKm: number;
  /** ₹ the truck earns per km it drives, empty km included. */
  earningPerKm: number;
  /** Estimated profit after diesel and tolls for the whole run. */
  estProfit: number;
  score: number;
  why: string[];
}

const DIESEL = 90;

/**
 * Finds paying loads close to where a truck will be empty — the heart of cutting
 * empty kilometres. Ranks by money per km driven, penalising long empty runs.
 */
export function findReturnLoads(vehicle: MatchVehicle, loads: MatchLoad[], maxDeadheadKm = 150): ReturnLoadMatch[] {
  const vc = VEHICLE_CLASSES[vehicle.type];
  const out: ReturnLoadMatch[] = [];
  for (const load of loads) {
    if (!canCarry(vehicle.type, load.weightKg)) continue;
    if (load.vehicleType && VEHICLE_CLASSES[load.vehicleType].capacityKg > vc.capacityKg) continue;
    if (vehicle.availableAt && new Date(load.pickupDate).getTime() + 24 * 3600_000 < new Date(vehicle.availableAt).getTime()) continue;
    const straight = haversineKm(vehicle.at, load.origin);
    if (straight > maxDeadheadKm) continue;
    const deadheadKm = roadKm(vehicle.at, load.origin);
    const loadedKm = roadKm(load.origin, load.destination);
    const totalKm = deadheadKm + loadedKm;
    const fuel = (totalKm / vc.kmpl) * DIESEL;
    const tolls = totalKm * vc.tollPerKm;
    const estProfit = Math.round(load.targetPrice - fuel - tolls);
    const earningPerKm = Math.round((load.targetPrice / totalKm) * 10) / 10;
    const fit = load.weightKg / vc.capacityKg; // 1 = full truck
    const score = Math.round(earningPerKm * 2 + fit * 20 - deadheadKm * 0.15 + Math.max(0, estProfit) / 1000);
    const why = [
      `${deadheadKm} km empty to pickup in ${load.origin.city}`,
      `${Math.round(fit * 100)}% of truck capacity used`,
      `₹${earningPerKm}/km over the whole run`,
    ];
    out.push({ load, deadheadKm, loadedKm, earningPerKm, estProfit, score, why });
  }
  return out.sort((a, b) => b.score - a.score);
}

export interface TruckSuggestion {
  vehicleId: string;
  deadheadKm: number;
  fit: number;
  score: number;
}

/** For a new load, which idle trucks should get the offer first. */
export function suggestTrucks(load: MatchLoad, vehicles: MatchVehicle[]): TruckSuggestion[] {
  return vehicles
    .filter((v) => canCarry(v.type, load.weightKg))
    .map((v) => {
      const deadheadKm = roadKm(v.at, load.origin);
      const fit = load.weightKg / VEHICLE_CLASSES[v.type].capacityKg;
      // Prefer close trucks that the load fills well (a 40 ft trailer for 2 t wastes money).
      const score = Math.round(100 - deadheadKm * 0.25 + fit * 40);
      return { vehicleId: v.id, deadheadKm, fit: Math.round(fit * 100) / 100, score };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Lane demand index from the marketplace: open loads vs idle trucks near the origin.
 * 1.0 = balanced. Used by the pricing engine.
 */
export function laneDemand(openLoadsNearOrigin: number, idleTrucksNearOrigin: number): number {
  const ratio = (openLoadsNearOrigin + 1) / (idleTrucksNearOrigin + 1);
  return Math.round(Math.min(1.25, Math.max(0.9, 0.9 + 0.12 * Math.log2(ratio * 2))) * 100) / 100;
}

/** 0–1 chance of a paying return load, from how many loads leave the destination. */
export function returnLoadScore(loadsLeavingDestination: number): number {
  return Math.round(Math.min(1, loadsLeavingDestination / 6) * 100) / 100;
}
