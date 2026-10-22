import { CITIES, VEHICLE_CLASSES, type DriverRec, type ShipmentRec, type TripRec, type VehicleRec } from '@suraj/core';
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, Button, Empty, ErrorNote, Field, Input, Loading, Modal, PageHeader, Panel, Select, StatusBadge, Tabs } from '../components/ui';
import { api } from '../lib/api';
import { dt, inr, kg } from '../lib/format';
import { useAction, useApi } from '../lib/hooks';

export type TripRow = TripRec & { regNo: string; vehicleType: string; driverName: string; driverPhone: string; pnl: { cost: number; profit: number; margin: number; perKm: number } };

export function Trips() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [tab, setTab] = useState<'IN_TRANSIT' | 'PLANNED' | 'COMPLETED' | 'all'>('IN_TRANSIT');
  const { data, loading, reload } = useApi<TripRow[]>('/api/trips', { liveTypes: ['trip.status', 'trip.ping'], debounceMs: 3000 });
  const [planOpen, setPlanOpen] = useState(sp.get('new') === '1');
  const list = (data ?? []).filter((t) => tab === 'all' || t.status === tab);

  return (
    <div>
      <PageHeader
        title="Trips"
        sub="Every truck run with its live position, ETA and profit after diesel and tolls"
        actions={
          <Button variant="primary" onClick={() => setPlanOpen(true)}>
            <Plus size={17} /> Plan a trip
          </Button>
        }
      />
      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'IN_TRANSIT', label: `On the road (${(data ?? []).filter((t) => t.status === 'IN_TRANSIT').length})` },
            { value: 'PLANNED', label: 'Planned' },
            { value: 'COMPLETED', label: 'Completed' },
            { value: 'all', label: 'All' },
          ]}
        />
      </div>
      <Panel bodyClass="p-0">
        {loading && !data ? (
          <Loading />
        ) : !list.length ? (
          <Empty title="No trips here">Plan a trip to put a truck, a driver and shipments together.</Empty>
        ) : (
          <div className="scroll-x">
            <table className="data">
              <thead>
                <tr>
                  <th>Trip</th>
                  <th>Truck and driver</th>
                  <th>Lane</th>
                  <th>Progress</th>
                  <th>ETA</th>
                  <th className="text-right">Freight</th>
                  <th className="text-right">Profit</th>
                </tr>
              </thead>
              <tbody>
                {list.map((t) => {
                  const late = t.status === 'IN_TRANSIT' && new Date(t.etaAt).getTime() > new Date(t.promisedAt).getTime() + 2 * 3600_000;
                  return (
                    <tr key={t.id} className="clickable" onClick={() => nav(`/trips/${t.id}`)}>
                      <td className="whitespace-nowrap">
                        <div className="font-medium">{t.tripNo}</div>
                        <StatusBadge status={t.status} />
                      </td>
                      <td className="whitespace-nowrap">
                        <div className="awb">{t.regNo}</div>
                        <div className="text-[12.5px] text-muted">{t.driverName}</div>
                      </td>
                      <td className="whitespace-nowrap">
                        {t.originCity} → {t.destCity}
                        <div className="text-[12.5px] text-muted">{t.plannedKm.toLocaleString('en-IN')} km</div>
                      </td>
                      <td className="min-w-[120px]">
                        <div className="h-2 rounded-full bg-panel-2">
                          <div className="h-2 rounded-full" style={{ width: `${Math.round(t.progress * 100)}%`, background: late ? 'var(--bad)' : 'var(--route)' }} />
                        </div>
                        <div className="num mt-1 text-[12.5px] text-muted">{Math.round(t.progress * 100)}%</div>
                      </td>
                      <td className="whitespace-nowrap">
                        {t.status === 'COMPLETED' ? <span className="text-muted">Done {dt(t.completedAt)}</span> : dt(t.etaAt)}
                        {late && (
                          <div>
                            <Badge tone="bad">Late {Math.round((new Date(t.etaAt).getTime() - new Date(t.promisedAt).getTime()) / 3600_000)} h</Badge>
                          </div>
                        )}
                      </td>
                      <td className="num text-right">{inr(t.freightAmount)}</td>
                      <td className={`num text-right ${t.pnl.profit < 0 ? 'text-bad' : ''}`}>
                        {inr(t.pnl.profit)}
                        <div className="text-[12.5px] text-muted">{t.pnl.margin}%</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <PlanTrip
        open={planOpen}
        onClose={() => {
          setPlanOpen(false);
          if (sp.get('new')) setSp({});
        }}
        onDone={(id) => {
          setPlanOpen(false);
          void reload();
          nav(`/trips/${id}`);
        }}
      />
    </div>
  );
}

const cityNames = [...CITIES].map((c) => c.name).sort();

export function PlanTrip({ open, onClose, onDone, preset }: { open: boolean; onClose: () => void; onDone: (id: string) => void; preset?: { originCity?: string; destCity?: string; freight?: number; loadId?: string } }) {
  const { data: vehicles } = useApi<VehicleRec[]>(open ? '/api/vehicles' : null);
  const { data: drivers } = useApi<(DriverRec & { licenseDays: number })[]>(open ? '/api/drivers' : null);
  const { data: booked } = useApi<{ items: ShipmentRec[] }>(open ? '/api/shipments?status=BOOKED&limit=200' : null);
  const [f, setF] = useState({ vehicleId: '', driverId: '', originCity: preset?.originCity ?? 'Jaipur', destCity: preset?.destCity ?? 'Ahmedabad', freightAmount: preset?.freight ? String(preset.freight) : '', driverAdvance: '3000' });
  const [picked, setPicked] = useState<string[]>([]);
  const act = useAction();

  useEffect(() => {
    if (preset) setF((x) => ({ ...x, originCity: preset.originCity ?? x.originCity, destCity: preset.destCity ?? x.destCity, freightAmount: preset.freight ? String(preset.freight) : x.freightAmount }));
  }, [preset]);

  const idle = (vehicles ?? []).filter((v) => v.status === 'IDLE');
  const free = (drivers ?? []).filter((d) => d.status === 'AVAILABLE' && d.licenseDays >= 0);
  const candidates = (booked?.items ?? []).filter((s) => !s.tripId && s.originCity === f.originCity);
  const vehicle = idle.find((v) => v.id === f.vehicleId);
  const load = useMemo(() => candidates.filter((s) => picked.includes(s.id)).reduce((a, s) => a + s.weightKg, 0), [candidates, picked]);
  const fill = vehicle ? Math.round((load / vehicle.capacityKg) * 100) : 0;

  const submit = () =>
    act.run(async () => {
      const t = await api.post<{ id: string }>('/api/trips', {
        vehicleId: f.vehicleId,
        driverId: f.driverId,
        originCity: f.originCity,
        destCity: f.destCity,
        freightAmount: Number(f.freightAmount) || 0,
        driverAdvance: Number(f.driverAdvance) || 0,
        shipmentIds: picked,
        ...(preset?.loadId ? { loadId: preset.loadId } : {}),
      });
      onDone(t.id);
    });

  return (
    <Modal open={open} onClose={onClose} title="Plan a trip" wide>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From" htmlFor="pt-from">
            <Select id="pt-from" value={f.originCity} onChange={(e) => setF({ ...f, originCity: e.target.value })}>
              {cityNames.map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="To" htmlFor="pt-to">
            <Select id="pt-to" value={f.destCity} onChange={(e) => setF({ ...f, destCity: e.target.value })}>
              {cityNames.map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Truck (idle only)" htmlFor="pt-veh">
            <Select id="pt-veh" value={f.vehicleId} onChange={(e) => setF({ ...f, vehicleId: e.target.value })} required>
              <option value="">Choose a truck</option>
              {idle.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.regNo} · {VEHICLE_CLASSES[v.type].label} · at {v.city}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Driver (available)" htmlFor="pt-drv">
            <Select id="pt-drv" value={f.driverId} onChange={(e) => setF({ ...f, driverId: e.target.value })} required>
              <option value="">Choose a driver</option>
              {free.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} · {d.phone}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Freight for this trip (₹)" hint="Leave empty to total the attached shipments" htmlFor="pt-fr">
            <Input id="pt-fr" type="number" min="0" value={f.freightAmount} onChange={(e) => setF({ ...f, freightAmount: e.target.value })} />
          </Field>
          <Field label="Driver advance (₹)" htmlFor="pt-adv">
            <Input id="pt-adv" type="number" min="0" value={f.driverAdvance} onChange={(e) => setF({ ...f, driverAdvance: e.target.value })} />
          </Field>
        </div>
        <div>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[16px] font-semibold">Shipments waiting at {f.originCity}</h3>
            {vehicle && (
              <span className={`num text-[13.5px] ${fill > 100 ? 'text-bad' : 'text-muted'}`}>
                {kg(load)} of {kg(vehicle.capacityKg)} · {fill}% full
              </span>
            )}
          </div>
          {candidates.length === 0 ? (
            <p className="text-[14px] text-muted">No booked shipments waiting here. You can still run the trip for a marketplace load.</p>
          ) : (
            <ul className="max-h-56 divide-y divide-line overflow-y-auto rounded-[10px] border border-line">
              {candidates.map((s) => (
                <li key={s.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-panel-2">
                    <input type="checkbox" checked={picked.includes(s.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, s.id] : p.filter((x) => x !== s.id)))} />
                    <span className="awb text-[13.5px]">{s.awb}</span>
                    <span className="min-w-0 flex-1 truncate text-[14px]">
                      → {s.destCity} · {s.consigneeName}
                    </span>
                    <span className="num text-[13px] text-muted">{kg(s.weightKg)}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <ErrorNote>{act.error}</ErrorNote>
        <Button variant="primary" type="submit" disabled={act.busy || !f.vehicleId || !f.driverId}>
          {act.busy ? 'Planning…' : 'Plan trip'}
        </Button>
      </form>
    </Modal>
  );
}
