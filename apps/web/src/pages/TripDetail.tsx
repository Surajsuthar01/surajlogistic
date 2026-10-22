import { STATUS_LABEL, VEHICLE_CLASSES, type DriverRec, type GpsPingRec, type ShipmentRec, type ShipmentStatus, type TripRec, type VehicleRec } from '@suraj/core';
import { ArrowLeft, Fuel, Phone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { NetworkMap } from '../components/NetworkMap';
import { Badge, Button, ErrorNote, KV, Loading, Panel, StatusBadge } from '../components/ui';
import { api, subscribe } from '../lib/api';
import { ago, dateOnly, dt, inr, kg } from '../lib/format';
import { useAction, useApi } from '../lib/hooks';

interface TripDetailResp extends TripRec {
  vehicle: VehicleRec;
  driver: DriverRec;
  shipments: ShipmentRec[];
  pings: GpsPingRec[];
  pnl: { cost: number; profit: number; margin: number; perKm: number };
}

export function TripDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: t, reload, setData } = useApi<TripDetailResp>(`/api/trips/${id}`);
  const act = useAction();
  const [lastPing, setLastPing] = useState<string | null>(null);

  useEffect(
    () =>
      subscribe((e) => {
        if (e.type === 'trip.ping' && e.payload.id === id) {
          setLastPing(e.at);
          setData((d) => (d ? { ...d, currentLat: e.payload.lat, currentLng: e.payload.lng, progress: e.payload.progress, etaAt: e.payload.etaAt } : d));
        }
      }),
    [id, setData],
  );

  if (!t) return <Loading />;
  const late = t.status === 'IN_TRANSIT' && new Date(t.etaAt).getTime() > new Date(t.promisedAt).getTime() + 2 * 3600_000;
  const vc = VEHICLE_CLASSES[t.vehicle.type];
  const loadKg = t.shipments.reduce((a, s) => a + s.weightKg, 0);

  return (
    <div>
      <Link to="/trips" className="mb-3 inline-flex items-center gap-1 text-[14px] text-muted hover:text-ink">
        <ArrowLeft size={16} /> Trips
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[28px] font-bold">{t.tripNo}</h1>
            <StatusBadge status={t.status} />
            {late && <Badge tone="bad">Late {Math.round((new Date(t.etaAt).getTime() - new Date(t.promisedAt).getTime()) / 3600_000)} h</Badge>}
          </div>
          <p className="mt-1 text-[15px] text-muted">
            {t.originCity} → {t.destCity} · {t.plannedKm.toLocaleString('en-IN')} km · {t.vehicle.regNo} ({vc.label})
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {t.status === 'PLANNED' && (
            <Button variant="primary" disabled={act.busy} onClick={() => act.run(async () => (await api.post(`/api/trips/${t.id}/start`), await reload()))}>
              Start trip
            </Button>
          )}
          {t.status === 'IN_TRANSIT' && (
            <Button variant="primary" disabled={act.busy} onClick={() => act.run(async () => (await api.post(`/api/trips/${t.id}/complete`, {}), await reload()))}>
              Mark arrived at {t.destCity}
            </Button>
          )}
          {t.status === 'COMPLETED' && <Button onClick={() => nav(`/marketplace?vehicle=${t.vehicleId}`)}>Find a return load</Button>}
        </div>
      </div>
      <ErrorNote>{act.error}</ErrorNote>

      <div className="mt-2 grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel title="Live position" action={<span className="text-[13px] text-muted">{lastPing ? `GPS ${ago(lastPing)}` : t.vehicle.lastPingAt ? `GPS ${ago(t.vehicle.lastPingAt)}` : 'No GPS yet'}</span>} bodyClass="p-2">
          <NetworkMap
            compact
            height={340}
            trips={[{ id: t.id, tripNo: t.tripNo, from: [t.originLat, t.originLng], to: [t.destLat, t.destLng], at: [t.currentLat, t.currentLng], late, vehicleId: t.vehicleId, originCity: t.originCity, destCity: t.destCity }]}
            vehicles={[{ id: t.vehicleId, regNo: t.vehicle.regNo, lat: t.currentLat, lng: t.currentLng, status: t.status === 'IN_TRANSIT' ? 'ON_TRIP' : 'IDLE', city: t.vehicle.city }]}
          />
          <div className="grid grid-cols-3 gap-2 px-2 pt-3 pb-1 text-[14px]">
            <div>
              <div className="text-muted">Covered</div>
              <div className="num font-medium">{Math.round(t.progress * 100)}%</div>
            </div>
            <div>
              <div className="text-muted">Promised</div>
              <div className="num font-medium">{dt(t.promisedAt)}</div>
            </div>
            <div>
              <div className="text-muted">Live ETA</div>
              <div className={`num font-medium ${late ? 'text-bad' : ''}`}>{t.status === 'COMPLETED' ? `Arrived ${dt(t.completedAt)}` : dt(t.etaAt)}</div>
            </div>
          </div>
        </Panel>
        <div className="space-y-5">
          <Panel title="Trip profit">
            <div className={`num font-display text-[34px] font-bold leading-none ${t.pnl.profit < 0 ? 'text-bad' : ''}`}>{inr(t.pnl.profit)}</div>
            <p className="mt-1 text-[13.5px] text-muted">
              {t.pnl.margin}% margin · ₹{t.pnl.perKm}/km
            </p>
            <div className="mt-3">
              <KV k="Freight" v={inr(t.freightAmount)} />
              <KV k="Diesel" v={inr(t.fuelCost)} />
              <KV k="Tolls" v={inr(t.tollCost)} />
              <KV k="Other" v={inr(t.otherCost)} />
              <KV k="Advance paid to driver" v={inr(t.driverAdvance)} />
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-muted">
              <Fuel size={14} /> Diesel at {vc.kmpl} km/l for {(t.actualKm ?? t.plannedKm).toLocaleString('en-IN')} km
            </p>
          </Panel>
          <Panel title="Driver">
            <KV k="Name" v={t.driver.name} />
            <KV
              k="Mobile"
              v={
                <span className="inline-flex items-center gap-1">
                  <Phone size={14} /> {t.driver.phone}
                </span>
              }
            />
            <KV k="Licence valid till" v={dateOnly(t.driver.licenseExpiry)} />
            <KV k="Rating" v={`${t.driver.rating} / 5`} />
          </Panel>
        </div>
      </div>

      <Panel className="mt-5" title={`Cargo on this truck · ${kg(loadKg)} of ${kg(t.vehicle.capacityKg)}`} bodyClass="p-0">
        {t.shipments.length === 0 ? (
          <p className="p-4 text-[14px] text-muted">{t.loadId ? 'Running a marketplace load.' : 'No shipments attached.'}</p>
        ) : (
          <div className="scroll-x">
            <table className="data">
              <thead>
                <tr>
                  <th>AWB</th>
                  <th>To</th>
                  <th>Status</th>
                  <th>Weight</th>
                  <th className="text-right">Freight</th>
                </tr>
              </thead>
              <tbody>
                {t.shipments.map((s) => (
                  <tr key={s.id} className="clickable" onClick={() => nav(`/shipments/${s.id}`)}>
                    <td className="awb">{s.awb}</td>
                    <td>
                      {s.destCity} · {s.consigneeName}
                    </td>
                    <td>
                      <StatusBadge status={s.status} label={STATUS_LABEL[s.status as ShipmentStatus]} />
                    </td>
                    <td className="num">{kg(s.weightKg)}</td>
                    <td className="num text-right">
                      {inr(s.price)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
