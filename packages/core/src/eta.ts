import { nearestCity, roadKm, type City } from './geo';
import type { Point, Service } from './types';
import { VEHICLE_CLASSES, type VehicleType } from './vehicles';

export interface EtaInput {
  service: Service;
  distanceKm: number;
  vehicleType?: VehicleType;
  departAt?: Date;
  destination?: City;
  /** Two drivers can keep the truck moving through the night. */
  teamDrivers?: boolean;
}

export interface EtaResult {
  hours: number;
  arriveAt: string;
  /** How sure the model is, 0–1. Rules-based today; learned from trip history later. */
  confidence: number;
  explain: string[];
}

const HOUR = 3600_000;

/**
 * Rules-based ETA. Road speed and halts by vehicle class, a daily driving cap for a
 * single driver, hub dwell for parcel/PTL networks, and metro no-entry windows for
 * heavy trucks. Swap for an ML model once trip history exists — the interface stays.
 */
export function predictEta(input: EtaInput): EtaResult {
  const depart = input.departAt ?? new Date();
  const explain: string[] = [];
  let hours: number;

  if (input.service === 'FTL') {
    const vc = VEHICLE_CLASSES[input.vehicleType ?? 'TRUCK_19FT'];
    const driving = input.distanceKm / vc.avgKmph;
    const dailyCap = input.teamDrivers ? 20 : 11;
    const restDays = Math.floor(driving / dailyCap);
    const rest = restDays * (24 - dailyCap);
    hours = driving + rest + 1.5; // loading & paperwork
    explain.push(`${Math.round(driving)} h driving at ${vc.avgKmph} km/h`);
    if (rest > 0) explain.push(`${Math.round(rest)} h driver rest (${dailyCap} h/day cap)`);
    if (vc.heavy && input.destination?.tier === 1) {
      // Metro no-entry windows are local time, so work in IST whatever the server timezone.
      const arrive = new Date(depart.getTime() + hours * HOUR);
      const ist = (arrive.getUTCHours() + arrive.getUTCMinutes() / 60 + 5.5) % 24;
      if (ist >= 7 && ist < 22) {
        const wait = Math.round((22 - ist) * 10) / 10;
        hours += wait;
        explain.push(`+${Math.round(wait)} h metro no-entry window for heavy trucks`);
      }
    }
  } else if (input.service === 'PTL') {
    const linehaulDays = input.distanceKm / 380;
    hours = 24 + linehaulDays * 24 + 12; // consolidation + linehaul + delivery run
    explain.push('1 day consolidation at origin hub', `${linehaulDays.toFixed(1)} days linehaul`, 'half day last-mile');
  } else {
    // Courier SLAs by distance band, the way parcel networks promise them.
    const d = input.distanceKm;
    const days = d < 40 ? 0.5 : d <= 500 ? 2 : d <= 1000 ? 3 : d <= 1800 ? 4 : 5;
    hours = days * 24;
    if (input.destination?.tier === 3) {
      hours += 24;
      explain.push('+1 day for smaller-town delivery');
    }
    explain.push(`${days} day courier SLA for ${Math.round(d)} km`);
  }

  hours = Math.round(hours * 10) / 10;
  const confidence = input.service === 'FTL' ? 0.78 : input.service === 'PTL' ? 0.7 : 0.82;
  return { hours, arriveAt: new Date(depart.getTime() + hours * HOUR).toISOString(), confidence, explain };
}

/** Live ETA for a moving truck from its current position. */
export function liveEta(current: Point, destination: Point, vehicleType: VehicleType, now = new Date()): EtaResult {
  const km = roadKm(current, destination);
  const result = predictEta({ service: 'FTL', distanceKm: km, vehicleType, departAt: now, destination: nearestCity(destination) });
  // Loading time is already behind a moving truck.
  const hours = Math.max(0.1, Math.round((result.hours - 1.5) * 10) / 10);
  return { ...result, hours, arriveAt: new Date(now.getTime() + hours * HOUR).toISOString() };
}

export type DelayLevel = 'ON_TIME' | 'AT_RISK' | 'LATE';

/** Compare a fresh ETA with the promise made to the customer. */
export function delayLevel(promisedAt: string | Date | null | undefined, predictedAt: string | Date, now = new Date()): DelayLevel {
  if (!promisedAt) return 'ON_TIME';
  const promised = new Date(promisedAt).getTime();
  const predicted = new Date(predictedAt).getTime();
  if (now.getTime() > promised) return 'LATE';
  if (predicted > promised + 2 * HOUR) return 'AT_RISK';
  return 'ON_TIME';
}
