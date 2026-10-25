import { VEHICLE_CLASSES, type DriverRec, type ShipmentRec, type TripRec, type VehicleRec } from '@suraj/shared';
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Empty, ErrorNote, Field, Input, Loading, Modal, PageHeader, Plate, Progress, Select, StatusMark, Tabs } from '../components/ui';
import { api } from '../lib/api';
import { dt, inr, kg, lane } from '../lib/format';
import { useAction, useApi } from '../lib/hooks';
import { cityNames } from './NewShipment';

export type TripRow = TripRec & { regNo: string; vehicleType: string; driverName: string; driverPhone: string; pnl: { cost: number; profit: number; margin: number; perKm: number } };

const lateHours = (t: { etaAt: string; promisedAt: string }) => Math.round((new Date(t.etaAt).getTime() - new Date(t.promisedAt).getTime()) / 3600_000);

export function Trips() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [tab, setTab] = useState<'IN_TRANSIT' | 'PLANNED' | 'COMPLETED' | 'all'>('IN_TRANSIT');
  const { data, loading, reload } = useApi<TripRow[]>('/api/trips', { liveTypes: ['trip.status', 'trip.ping'], debounceMs: 3000 });
  const [planOpen, setPlanOpen] = useState(sp.get('new') === '1');
  const all = data ?? [];
  const list = all.filter((t) => tab === 'all' || t.status === tab);
  const count = (s: string) => all.filter((t) => t.status === s).length;

  return (
    <div>
      <PageHeader
        title="Trips"
        sub="Every truck run with its live position, ETA and what it earns after diesel and tolls."
        actions={
          <Button variant="primary" onClick={() => setPlanOpen(true)}>
            <Plus size={17} /> Plan a trip
          </Button>
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        className="mb-4"
        items={[
          { value: 'IN_TRANSIT', label: 'On the road', count: count('IN_TRANSIT') },
          { value: 'PLANNED', label: 'Planned', count: count('PLANNED') },
          { value: 'COMPLETED', label: 'Completed', count: count('COMPLETED') },
          { value: 'all', label: 'All', count: all.length },
        ]}
      />
      {loading && !data ? (
        <div className="sheet">
          <Loading rows={6} />
        </div>
      ) : !list.length ? (
        <div className="sheet">
          <Empty title={tab === 'IN_TRANSIT' ? 'No trucks on the road' : 'No trips here'} action={<Button variant="primary" onClick={() => setPlanOpen(true)}>Plan a trip</Button>}>
            A trip puts a truck, a driver and shipments together on one lane. Start it and the driver's phone shares location.
          </Empty>
        </div>
      ) : (
        <>
          <ul className="space-y-2 sm:hidden">
            {list.map((t) => {
              const late = t.status === 'IN_TRANSIT' && lateHours(t) > 2;
              return (
                <li key={t.id}>
                  <Link to={`/trips/${t.id}`} className="sheet block px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-[600]">{t.tripNo}</span>
                      <Plate reg={t.regNo} size={12.5} />
                    </div>
                    <div className="mt-1 text-[15.5px] font-[560]">{lane(t.originCity, t.destCity)}</div>
                    <div className="text-[14px] text-muted">{t.driverName}</div>
                    <div className="mt-2">
                      <Progress value={t.progress * 100} tone={late ? 'bad' : 'go'} />
                    </div>
                    <div className="mt-1.5 flex justify-between text-[13.5px]">
                      <StatusMark status={t.status} />
                      <span className={late ? 'font-[560] text-bad' : 'text-muted'}>{t.status === 'COMPLETED' ? `Done ${dt(t.completedAt)}` : late ? `${lateHours(t)} h late` : `Due ${dt(t.etaAt)}`}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="sheet scroll-x hidden sm:block">
            <table className="data">
              <thead>
                <tr>
                  <th>Trip</th>
                  <th>Truck and driver</th>
                  <th>Lane</th>
                  <th className="min-w-[140px]">Progress</th>
                  <th>Due</th>
                  <th className="text-right">Freight</th>
                  <th className="text-right">Earns</th>
                </tr>
              </thead>
              <tbody>
                {list.map((t) => {
                  const late = t.status === 'IN_TRANSIT' && lateHours(t) > 2;
                  return (
                    <tr key={t.id} className="clickable" onClick={() => nav(`/trips/${t.id}`)}>
                      <td className="whitespace-nowrap">
                        <div className="font-[600]">{t.tripNo}</div>
                        <StatusMark status={t.status} className="text-[13.5px]" />
                      </td>
                      <td className="whitespace-nowrap">
                        <Plate reg={t.regNo} size={13} />
                        <div className="mt-1 text-[13.5px] text-muted">{t.driverName}</div>
                      </td>
                      <td className="whitespace-nowrap">
                        {lane(t.originCity, t.destCity)}
                        <div className="num text-[13px] text-muted">{t.plannedKm.toLocaleString('en-IN')} km</div>
                      </td>
                      <td>
                        <Progress value={t.progress * 100} tone={late ? 'bad' : 'go'} />
                        <div className="num mt-1 text-[13px] text-muted">{Math.round(t.progress * 100)}% covered</div>
                      </td>
                      <td className="num whitespace-nowrap">
                        {t.status === 'COMPLETED' ? <span className="text-muted">Done {dt(t.completedAt)}</span> : dt(t.etaAt)}
                        {late && <div className="text-[13px] font-[560] text-bad">{lateHours(t)} h late</div>}
                      </td>
                      <td className="num text-right">{inr(t.freightAmount)}</td>
                      <td className={`num text-right ${t.pnl.profit < 0 ? 'text-bad' : ''}`}>
                        {inr(t.pnl.profit)}
                        <div className="text-[13px] text-muted">{t.pnl.margin}% margin</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
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

export function PlanTrip({ open, onClose, onDone, preset }: { open: boolean; onClose: () => void; onDone: (id: string) => void; preset?: { originCity?: string; destCity?: string; freight?: number; loadId?: string; vehicleId?: string } }) {
  const { data: vehicles } = useApi<VehicleRec[]>(open ? '/api/vehicles' : null);
  const { data: drivers } = useApi<(DriverRec & { licenseDays: number })[]>(open ? '/api/drivers' : null);
  const { data: booked } = useApi<{ items: ShipmentRec[] }>(open ? '/api/shipments?status=BOOKED&limit=200' : null);
  const [f, setF] = useState({ vehicleId: preset?.vehicleId ?? '', driverId: '', originCity: preset?.originCity ?? 'Jaipur', destCity: preset?.destCity ?? 'Ahmedabad', freightAmount: preset?.freight ? String(preset.freight) : '', driverAdvance: '3000' });
  const [picked, setPicked] = useState<string[]>([]);
  const act = useAction();

  useEffect(() => {
    if (preset) setF((x) => ({ ...x, originCity: preset.originCity ?? x.originCity, destCity: preset.destCity ?? x.destCity, freightAmount: preset.freight ? String(preset.freight) : x.freightAmount, vehicleId: preset.vehicleId ?? x.vehicleId }));
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
    <Modal
      open={open}
      onClose={onClose}
      title="Plan a trip"
      wide
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="plan-trip" disabled={act.busy || !f.vehicleId || !f.driverId || fill > 100}>
            {act.busy ? 'Planning…' : 'Plan trip'}
          </Button>
        </>
      }
    >
      <form
        id="plan-trip"
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From" htmlFor="pt-from">
            <Select id="pt-from" value={f.originCity} onChange={(e) => (setF({ ...f, originCity: e.target.value }), setPicked([]))}>
              {cityNames.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="To" htmlFor="pt-to">
            <Select id="pt-to" value={f.destCity} onChange={(e) => setF({ ...f, destCity: e.target.value })}>
              {cityNames.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Truck" hint={vehicles && !idle.length ? 'Every truck is busy or in the workshop.' : 'Only idle trucks are listed.'} htmlFor="pt-veh">
            <Select id="pt-veh" value={f.vehicleId} onChange={(e) => setF({ ...f, vehicleId: e.target.value })} required>
              <option value="">Choose a truck</option>
              {idle.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.regNo}, {VEHICLE_CLASSES[v.type].label}, at {v.city}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Driver" hint={drivers && !free.length ? 'No driver is free with a valid licence.' : 'Available drivers with a valid licence.'} htmlFor="pt-drv">
            <Select id="pt-drv" value={f.driverId} onChange={(e) => setF({ ...f, driverId: e.target.value })} required>
              <option value="">Choose a driver</option>
              {free.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}, {d.phone}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Freight for this trip (₹)" hint="Leave empty to add up the shipments you attach" htmlFor="pt-fr">
            <Input id="pt-fr" type="number" min="0" value={f.freightAmount} onChange={(e) => setF({ ...f, freightAmount: e.target.value })} />
          </Field>
          <Field label="Advance to driver (₹)" hint="Cash for diesel, tolls and food on the way" htmlFor="pt-adv">
            <Input id="pt-adv" type="number" min="0" value={f.driverAdvance} onChange={(e) => setF({ ...f, driverAdvance: e.target.value })} />
          </Field>
        </div>
        <div>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="t-sub">Shipments waiting at {f.originCity}</h3>
            {vehicle && (
              <span className={`num text-[14px] ${fill > 100 ? 'font-[560] text-bad' : 'text-muted'}`}>
                {kg(load)} of {kg(vehicle.capacityKg)}, {fill}% full{fill > 100 ? '. Too heavy for this truck.' : ''}
              </span>
            )}
          </div>
          {vehicle && <Progress value={Math.min(100, fill)} tone={fill > 100 ? 'bad' : fill > 85 ? 'warn' : 'go'} />}
          {candidates.length === 0 ? (
            <p className="mt-2 text-[14.5px] text-muted">No booked shipments are waiting here. You can still run the trip for a load board job.</p>
          ) : (
            <ul className="mt-2 max-h-56 divide-y divide-line overflow-y-auto rounded-[12px] border border-line">
              {candidates.map((s) => (
                <li key={s.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-sheet-2">
                    <input type="checkbox" className="h-4 w-4 accent-[var(--sign)]" checked={picked.includes(s.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, s.id] : p.filter((x) => x !== s.id)))} />
                    <span className="awb text-[14px]">{s.awb}</span>
                    <span className="min-w-0 flex-1 truncate text-[14.5px]">
                      to {s.destCity}, {s.consigneeName}
                    </span>
                    <span className="num text-[13.5px] text-muted">{kg(s.weightKg)}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <ErrorNote>{act.error}</ErrorNote>
      </form>
    </Modal>
  );
}
