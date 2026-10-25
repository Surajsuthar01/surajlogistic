import type { Service } from './types';
import { VEHICLE_CLASSES, type VehicleType } from './vehicles';

/** kg CO2 from burning one litre of diesel (well-known combustion factor). */
export const DIESEL_KG_CO2_PER_LITRE = 2.68;
/** Rough shared-network intensity for parcels and part loads on Indian roads, kg CO2 per tonne-km. */
export const SHARED_ROAD_KG_PER_TKM = 0.09;

/**
 * Estimated CO2 for a shipment. A full truckload owns the whole truck's emissions;
 * parcels and part loads take a share by weight. Estimates for ESG reporting —
 * move to a GLEC-framework calculator for audited numbers.
 */
export function shipmentCo2Kg(service: Service, distanceKm: number, weightKg: number, vehicleType?: VehicleType): number {
  if (service === 'FTL') {
    const vc = VEHICLE_CLASSES[vehicleType ?? 'TRUCK_19FT'];
    return Math.round((distanceKm / vc.kmpl) * DIESEL_KG_CO2_PER_LITRE * 10) / 10;
  }
  return Math.round((weightKg / 1000) * distanceKm * SHARED_ROAD_KG_PER_TKM * 10) / 10;
}

/** Empty kilometres burn diesel too; this is what return-load matching saves. */
export function emptyRunCo2Kg(km: number, vehicleType: VehicleType): number {
  const vc = VEHICLE_CLASSES[vehicleType];
  // An empty truck uses roughly 75% of the fuel of a loaded one.
  return Math.round((km / vc.kmpl) * 0.75 * DIESEL_KG_CO2_PER_LITRE * 10) / 10;
}
