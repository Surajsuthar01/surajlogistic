import { STATUS_LABEL, VEHICLE_CLASSES, type DriverRec, type GpsPingRec, type ShipmentRec, type ShipmentStatus, type TripRec, type VehicleRec } from '@suraj/shared';
import { Phone, Repeat2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { NetworkMap } from '../components/NetworkMap';
import { Button, ButtonLink, ErrorNote, Fact, Field, Input, KV, Loading, Modal, Note, PageHeader, Plate, Sheet, StatusMark, useToast } from '../components/ui';
import { api, subscribe } from '../lib/api';
import { ago, dateOnly, dt, inr, kg, lane } from '../lib/format';
import { useAction, useApi } from '../lib/hooks';

interface TripDetailResp extends TripRec {
  vehicle: VehicleRec;
  driver: DriverRec;
  shipments: ShipmentRec[];
  pings: GpsPingRec[];
  pnl: { cost: number; profit: number; margin: number; perKm: number };
  expenses?: { id: string; kind: string; amount: number; note: string | null; photoUrl?: string | null; at: string }[];
}

const EXP_LABEL: Record<string, string> = { DIESEL: 'Diesel', TOLL: 'Toll', FOOD: 'Food', REPAIR: 'Repair', LOADING: 'Loading', OTHER: 'Other' };

export function TripDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { data: t, reload, setData, error } = useApi<TripDetailResp>(`/api/trips/${id}`);
  const act = useAction();
  const [lastPing, setLastPing] = useState<string | null>(null);
  const [finish, setFinish] = useState(false);

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

  if (!t) return error ? <Note tone="warn">{error}</Note> : <Loading rows={8} />;
  const late = t.status === 'IN_TRANSIT' && new Date(t.etaAt).getTime() > new Date(t.promisedAt).getTime() + 2 * 3600_000;
  const lateH = Math.round((new Date(t.etaAt).getTime() - new Date(t.promisedAt).getTime()) / 3600_000);
  const vc = VEHICLE_CLASSES[t.vehicle.type];
  const loadKg = t.shipments.reduce((a, s) => a + s.weightKg, 0);
  const gps = lastPing ?? t.vehicle.lastPingAt;
  const hired = typeof t.hireAmount === 'number';
  const attached = t.vehicle.ownership === 'ATTACHED';
  const costs = hired
    ? [
        { label: 'Lorry hire to the owner', v: t.hireAmount ?? 0, c: 'var(--warn-fill)' },
        { label: 'Other', v: t.otherCost, c: 'var(--faint)' },
        { label: 'Earns', v: Math.max(0, t.pnl.profit), c: 'var(--go)' },
      ]
    : [
        { label: 'Diesel', v: t.fuelCost, c: 'var(--warn-fill)' },
        { label: 'Tolls', v: t.tollCost, c: 'var(--info)' },
        { label: 'Other', v: t.otherCost, c: 'var(--faint)' },
        { label: 'Earns', v: Math.max(0, t.pnl.profit), c: 'var(--go)' },
      ];
  const base = Math.max(t.freightAmount, costs.slice(0, -1).reduce((a, c) => a + c.v, 0), 1);

  return (
    <div>
      <PageHeader
        back={{ to: '/trips', label: 'Trips' }}
        title={
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h1 className="t-fig text-[40px]">{t.tripNo}</h1>
            <StatusMark status={t.status} className="text-[16px] font-[560]" />
            {late && <span className="text-[15px] font-[560] text-bad">{lateH} h late</span>}
          </div>
        }
        sub={
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            {lane(t.originCity, t.destCity)}, {t.plannedKm.toLocaleString('en-IN')} km on <Plate reg={t.vehicle.regNo} size={13} /> {vc.label}
          </span>
        }
        actions={
          <>
            {t.status === 'PLANNED' && (
              <Button variant="primary" disabled={act.busy} onClick={() => act.run(async () => (await api.post(`/api/trips/${t.id}/start`), await reload(), toast(`${t.tripNo} started`)))}>
                Start trip
              </Button>
            )}
            {t.status === 'IN_TRANSIT' && (
              <Button variant="primary" onClick={() => setFinish(true)}>
                Mark arrived at {t.destCity}
              </Button>
            )}
            {t.status === 'COMPLETED' && (
              <ButtonLink to={`/marketplace?vehicle=${t.vehicleId}`}>
                <Repeat2 size={16} /> Find a load back
              </ButtonLink>
            )}
          </>
        }
      />
      <ErrorNote>{act.error}</ErrorNote>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <NetworkMap
            compact
            height={360}
            trips={[{ id: t.id, tripNo: t.tripNo, from: [t.originLat, t.originLng], to: [t.destLat, t.destLng], at: [t.currentLat, t.currentLng], late, vehicleId: t.vehicleId, originCity: t.originCity, destCity: t.destCity }]}
            vehicles={[{ id: t.vehicleId, regNo: t.vehicle.regNo, lat: t.currentLat, lng: t.currentLng, status: t.status === 'IN_TRANSIT' ? 'ON_TRIP' : 'IDLE', city: t.vehicle.city }]}
          />
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Fact k="Covered" v={`${Math.round(t.progress * 100)}%`} />
            <Fact k="Promised" v={dt(t.promisedAt)} />
            <Fact k={t.status === 'COMPLETED' ? 'Arrived' : 'Live ETA'} v={<span className={late ? 'text-bad' : ''}>{t.status === 'COMPLETED' ? dt(t.completedAt) : dt(t.etaAt)}</span>} />
            <Fact k="Last GPS" v={gps ? ago(gps) : 'Not yet'} />
          </div>
        </div>
        <div className="min-w-0 space-y-5">
          <Sheet title="What this trip earns">
            <p className={`t-fig text-[40px] ${t.pnl.profit < 0 ? 'text-bad' : ''}`}>{inr(t.pnl.profit)}</p>
            <p className="mt-1 text-[14px] text-muted">
              {t.pnl.margin}% of {inr(t.freightAmount)} freight, ₹{t.pnl.perKm} per km
            </p>
            <div className="mt-3 flex h-3 gap-[2px] overflow-hidden rounded-full" aria-hidden="true">
              {costs.map((c) => (c.v > 0 ? <span key={c.label} style={{ width: `${(c.v / base) * 100}%`, background: c.c }} /> : null))}
            </div>
            <dl className="m-0 mt-3">
              {costs.slice(0, -1).map((c) => (
                <KV
                  key={c.label}
                  k={
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: c.c }} />
                      {c.label}
                    </span>
                  }
                  v={inr(c.v)}
                />
              ))}
              <KV k="Advance given to driver" v={inr(t.driverAdvance)} />
            </dl>
            <p className="mt-2 text-[13px] text-muted">
              {hired
                ? 'An attached truck: its owner pays the diesel and tolls, and we pay the owner the lorry hire.'
                : `Diesel worked out at ${vc.kmpl} km a litre over ${(t.actualKm ?? t.plannedKm).toLocaleString('en-IN')} km. Enter real figures when the truck arrives.`}
            </p>
          </Sheet>
          {(attached || hired) && <HireSheet t={t} onSaved={reload} />}
          <Sheet title="Driver">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[16px] font-[600]">{t.driver.name}</p>
                <p className="text-[14px] text-muted">
                  Licence valid till {dateOnly(t.driver.licenseExpiry)}, rated {t.driver.rating.toFixed(1)}
                </p>
              </div>
              <a href={`tel:${t.driver.phone}`} className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-line-strong px-3 text-[15px] font-[560] hover:bg-sheet-2">
                <Phone size={16} /> Call
              </a>
            </div>
          </Sheet>
          {!!t.expenses?.length && (
            <Sheet title="Spent by the driver" aside={<span className="num text-[14px] text-muted">{inr(t.expenses.reduce((a, e) => a + e.amount, 0))}</span>}>
              <ul className="divide-y divide-line">
                {t.expenses.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-[14.5px]">
                    <span>
                      {EXP_LABEL[e.kind] ?? e.kind}
                      <span className="block text-[13px] text-muted">
                        {dt(e.at)}
                        {e.note ? `, ${e.note}` : ''}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      {e.photoUrl && (
                        <a href={e.photoUrl} target="_blank" rel="noreferrer" className="text-[13px] text-muted underline">
                          slip
                        </a>
                      )}
                      <span className="num">{inr(e.amount)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Sheet>
          )}
        </div>
      </div>

      <section className="mt-7">
        <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="t-sub">Cargo on this truck</h2>
          <span className="num text-[14px] text-muted">
            {kg(loadKg)} of {kg(t.vehicle.capacityKg)} capacity
          </span>
        </div>
        <div className="sheet">
          {t.shipments.length === 0 ? (
            <p className="px-4 py-5 text-[15px] text-muted">{t.loadId ? 'Carrying a load board job.' : 'No shipments attached to this trip.'}</p>
          ) : (
            <div className="scroll-x">
              <table className="data">
                <thead>
                  <tr>
                    <th>AWB</th>
                    <th>Receiver</th>
                    <th>Status</th>
                    <th className="text-right">Weight</th>
                    <th className="text-right">Freight</th>
                  </tr>
                </thead>
                <tbody>
                  {t.shipments.map((s) => (
                    <tr key={s.id} className="clickable" onClick={() => nav(`/shipments/${s.id}`)}>
                      <td className="awb">
                        <Link to={`/shipments/${s.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                          {s.awb}
                        </Link>
                      </td>
                      <td>
                        {s.consigneeName}
                        <div className="text-[13px] text-muted">{s.destCity}</div>
                      </td>
                      <td>
                        <StatusMark status={s.status} label={STATUS_LABEL[s.status as ShipmentStatus]} />
                      </td>
                      <td className="num text-right">{kg(s.weightKg)}</td>
                      <td className="num text-right">{inr(s.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
      <FinishTrip open={finish} onClose={() => setFinish(false)} t={t} onDone={async () => (setFinish(false), await reload(), toast(`${t.tripNo} closed at ${t.destCity}`))} />
    </div>
  );
}

function FinishTrip({ open, onClose, t, onDone }: { open: boolean; onClose: () => void; t: TripDetailResp; onDone: () => void }) {
  const spent = (k: string[]) => (t.expenses ?? []).filter((e) => k.includes(e.kind)).reduce((a, e) => a + e.amount, 0);
  const diesel = spent(['DIESEL']);
  const toll = spent(['TOLL']);
  const other = spent(['FOOD', 'REPAIR', 'LOADING', 'OTHER']);
  const [f, setF] = useState({ actualKm: String(t.plannedKm), fuelCost: String(diesel || t.fuelCost), tollCost: String(toll || t.tollCost), otherCost: String(other || t.otherCost || '') });
  const act = useAction();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const profit = t.freightAmount - (Number(f.fuelCost) || 0) - (Number(f.tollCost) || 0) - (Number(f.otherCost) || 0);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Close ${t.tripNo} at ${t.destCity}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="finish-trip" disabled={act.busy}>
            Mark arrived
          </Button>
        </>
      }
    >
      <form
        id="finish-trip"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void act.run(async () => {
            await api.post(`/api/trips/${t.id}/complete`, { actualKm: Number(f.actualKm) || t.plannedKm, fuelCost: Number(f.fuelCost) || 0, tollCost: Number(f.tollCost) || 0, otherCost: Number(f.otherCost) || 0 });
            onDone();
          });
        }}
      >
        <p className="text-[15px] text-muted">Put in what was really spent so the trip's profit is right. {t.expenses?.length ? 'Filled from what the driver logged, estimates elsewhere.' : 'These start as our estimates.'} The truck becomes free at {t.destCity}.</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Kilometres driven" htmlFor="ft-km">
            <Input id="ft-km" type="number" min="1" value={f.actualKm} onChange={set('actualKm')} />
          </Field>
          <Field label="Diesel (₹)" htmlFor="ft-fuel">
            <Input id="ft-fuel" type="number" min="0" value={f.fuelCost} onChange={set('fuelCost')} />
          </Field>
          <Field label="Tolls (₹)" hint="FASTag statement total" htmlFor="ft-toll">
            <Input id="ft-toll" type="number" min="0" value={f.tollCost} onChange={set('tollCost')} />
          </Field>
          <Field label="Other (₹)" hint="Loading, police, repairs, food" htmlFor="ft-other">
            <Input id="ft-other" type="number" min="0" value={f.otherCost} onChange={set('otherCost')} />
          </Field>
        </div>
        <p className="text-[15px]">
          Trip earns <b className={`num ${profit < 0 ? 'text-bad' : ''}`}>{inr(profit)}</b> on {inr(t.freightAmount)} freight.
        </p>
        <ErrorNote>{act.error}</ErrorNote>
      </form>
    </Modal>
  );
}

/** Lorry hire for an attached truck: agreed amount, advance at loading, balance after delivery. */
function HireSheet({ t, onSaved }: { t: TripDetailResp; onSaved: () => void }) {
  const toast = useToast();
  const act = useAction();
  const [amount, setAmount] = useState(t.hireAmount != null ? String(t.hireAmount) : '');
  const [advance, setAdvance] = useState(t.hireAdvance != null ? String(t.hireAdvance) : '');
  const set = typeof t.hireAmount === 'number';
  const balance = set ? Math.max(0, (t.hireAmount ?? 0) - (t.hireAdvance ?? 0)) : 0;
  const save = (body: Record<string, unknown>, msg: string) =>
    act.run(async () => {
      await api.post(`/api/trips/${t.id}/hire`, body);
      await onSaved();
      toast(msg);
    });
  return (
    <Sheet title="Lorry hire" aside={t.hireSettledAt ? <StatusMark status="PAID" label={`Paid ${dateOnly(t.hireSettledAt)}`} /> : set && t.status === 'COMPLETED' ? <StatusMark status="NDR" label="Balance due" /> : null}>
      {set && (
        <dl className="m-0 mb-4">
          <KV k="Agreed with the owner" v={inr(t.hireAmount)} strong />
          <KV k="Advance at loading" v={inr(t.hireAdvance ?? 0)} />
          <KV k="Balance after delivery" v={inr(balance)} />
        </dl>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Hire (₹)" htmlFor="hire-amt">
          <Input id="hire-amt" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} placeholder="45000" />
        </Field>
        <Field label="Advance (₹)" htmlFor="hire-adv">
          <Input id="hire-adv" inputMode="numeric" value={advance} onChange={(e) => setAdvance(e.target.value.replace(/\D/g, ''))} placeholder="30000" />
        </Field>
      </div>
      <ErrorNote>{act.error}</ErrorNote>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button size="sm" disabled={act.busy || !amount} onClick={() => save({ hireAmount: Number(amount), hireAdvance: Number(advance || 0) }, 'Lorry hire saved. The owner sees it on their page.')}>
          Save hire
        </Button>
        {set && t.status === 'COMPLETED' && !t.hireSettledAt && (
          <Button size="sm" variant="primary" disabled={act.busy} onClick={() => save({ settled: true }, `Balance of ${inr(balance)} marked paid.`)}>
            Mark balance paid
          </Button>
        )}
        {t.hireSettledAt && (
          <Button size="sm" variant="ghost" disabled={act.busy} onClick={() => save({ settled: false }, 'Marked as not paid.')}>
            Undo paid
          </Button>
        )}
      </div>
    </Sheet>
  );
}
