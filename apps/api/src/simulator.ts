import type { FastifyInstance } from 'fastify';
import { lerpPoint, VEHICLE_CLASSES, type VehicleType } from '@suraj/core';
import { eq } from 'drizzle-orm';
import { trips, vehicles } from './db/schema';
import { recordPing } from './routes/trips';

/**
 * Demo GPS simulator: nudges every in-transit truck along its lane and posts a GPS
 * ping, so the control tower moves live without real devices. Disable with SIMULATE=0;
 * in production the pings come from GPS devices, FASTag trails or the driver app.
 */
export function startSimulator(app: FastifyInstance, intervalMs = Number(process.env.SIM_INTERVAL_MS ?? 15000)) {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const moving = await app.db.select().from(trips).where(eq(trips.status, 'IN_TRANSIT'));
      for (const t of moving) {
        if (t.progress >= 0.97) continue;
        const [v] = await app.db.select({ type: vehicles.type }).from(vehicles).where(eq(vehicles.id, t.vehicleId));
        const speed = VEHICLE_CLASSES[(v?.type ?? 'TRUCK_19FT') as VehicleType].avgKmph * (0.75 + Math.random() * 0.5);
        // Demo time runs fast: each tick covers about 20 minutes of driving.
        const step = (speed / 3) / Math.max(1, t.plannedKm);
        const p = lerpPoint({ lat: t.originLat, lng: t.originLng }, { lat: t.destLat, lng: t.destLng }, Math.min(0.97, t.progress + step));
        const jitter = () => (Math.random() - 0.5) * 0.02;
        await recordPing(app, t, { lat: p.lat + jitter(), lng: p.lng + jitter(), speedKmph: Math.round(speed) });
      }
    } catch (err) {
      app.log.warn({ err }, 'simulator tick failed');
    } finally {
      busy = false;
    }
  };
  const handle = setInterval(tick, intervalMs);
  return () => clearInterval(handle);
}
