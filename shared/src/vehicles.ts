/**
 * Common Indian goods-vehicle classes with default commercial assumptions.
 * Every number here is a starting rate card that each tenant can override.
 */
export interface VehicleClass {
  type: VehicleType;
  label: string;
  capacityKg: number;
  /** Market FTL rate in ₹ per loaded km at the base diesel price. */
  ratePerKm: number;
  /** Typical diesel mileage, km per litre (bike uses petrol-equivalent). */
  kmpl: number;
  /** Average running speed on highways including short halts, km/h. */
  avgKmph: number;
  /** Estimated toll in ₹ per km on tolled national highways. */
  tollPerKm: number;
  /** Heavy vehicles face city no-entry windows in many metros. */
  heavy: boolean;
}

export const VEHICLE_TYPES = [
  'BIKE',
  'TATA_ACE',
  'PICKUP_1_5T',
  'LCV_14FT',
  'TRUCK_19FT',
  'TRUCK_22FT',
  'CONTAINER_32FT_SXL',
  'CONTAINER_32FT_MXL',
  'TRAILER_40FT',
] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const VEHICLE_CLASSES: Record<VehicleType, VehicleClass> = {
  BIKE: { type: 'BIKE', label: '2-wheeler', capacityKg: 20, ratePerKm: 9, kmpl: 45, avgKmph: 25, tollPerKm: 0, heavy: false },
  TATA_ACE: { type: 'TATA_ACE', label: 'Mini truck (Tata Ace class)', capacityKg: 750, ratePerKm: 16, kmpl: 16, avgKmph: 35, tollPerKm: 0.9, heavy: false },
  PICKUP_1_5T: { type: 'PICKUP_1_5T', label: 'Pickup 1.5 t', capacityKg: 1500, ratePerKm: 20, kmpl: 13, avgKmph: 40, tollPerKm: 1.2, heavy: false },
  LCV_14FT: { type: 'LCV_14FT', label: '14 ft LCV (4 t)', capacityKg: 4000, ratePerKm: 32, kmpl: 8, avgKmph: 42, tollPerKm: 2.0, heavy: false },
  TRUCK_19FT: { type: 'TRUCK_19FT', label: '19 ft truck (7 t)', capacityKg: 7000, ratePerKm: 42, kmpl: 6, avgKmph: 42, tollPerKm: 2.6, heavy: true },
  TRUCK_22FT: { type: 'TRUCK_22FT', label: '22 ft truck (10 t)', capacityKg: 10000, ratePerKm: 50, kmpl: 5, avgKmph: 40, tollPerKm: 3.0, heavy: true },
  CONTAINER_32FT_SXL: { type: 'CONTAINER_32FT_SXL', label: '32 ft container SXL (7 t)', capacityKg: 7500, ratePerKm: 58, kmpl: 4.5, avgKmph: 40, tollPerKm: 3.4, heavy: true },
  CONTAINER_32FT_MXL: { type: 'CONTAINER_32FT_MXL', label: '32 ft container MXL (15 t)', capacityKg: 15000, ratePerKm: 70, kmpl: 3.8, avgKmph: 38, tollPerKm: 4.2, heavy: true },
  TRAILER_40FT: { type: 'TRAILER_40FT', label: '40 ft trailer (25 t)', capacityKg: 25000, ratePerKm: 90, kmpl: 3, avgKmph: 35, tollPerKm: 5.5, heavy: true },
};

/** Smallest truck that can carry the weight (bike is only for local courier). */
export function pickVehicle(weightKg: number, allowBike = false): VehicleClass {
  const order = VEHICLE_TYPES.filter((t) => allowBike || t !== 'BIKE');
  for (const t of order) {
    const v = VEHICLE_CLASSES[t];
    if (v.capacityKg >= weightKg) return v;
  }
  return VEHICLE_CLASSES.TRAILER_40FT;
}

/** Can a vehicle of this class legally take the load? No overloading allowed. */
export function canCarry(type: VehicleType, weightKg: number): boolean {
  return VEHICLE_CLASSES[type].capacityKg >= weightKg;
}

export function isVehicleType(v: unknown): v is VehicleType {
  return typeof v === 'string' && (VEHICLE_TYPES as readonly string[]).includes(v);
}
