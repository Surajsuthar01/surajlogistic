import { requireCity, roadKm, VEHICLE_CLASSES, VEHICLE_TYPES, type VehicleType } from '@suraj/shared';
import { Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NetworkMap } from '../components/NetworkMap';
import { Button, Check, ErrorNote, Fact, Field, PageHeader, Select, Sheet } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { inr } from '../lib/format';
import { useAction } from '../lib/hooks';
import { cityNames } from './NewShipment';
import { PlanTrip } from './Trips';

interface Plan {
  order: string[];
  stops: { id: string; label?: string; lat: number; lng: number }[];
  totalKm: number;
  originalKm: number;
  savedKm: number;
}

/** Multi-drop planner: put the stops in any order, get the shortest sensible sequence. */
export function RoutePlanner() {
  const nav = useNavigate();
  const { org } = useAuth();
  const [start, setStart] = useState('Jaipur');
  const [stops, setStops] = useState<string[]>(['Udaipur', 'Ajmer', 'Bhilwara', 'Chittorgarh', 'Kota']);
  const [add, setAdd] = useState('');
  const [back, setBack] = useState(true);
  const [vt, setVt] = useState<VehicleType>('TRUCK_19FT');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [trip, setTrip] = useState(false);
  const act = useAction();

  const run = () =>
    act.run(async () => {
      setPlan(await api.post<Plan>('/api/routes/optimize', { start, stops, returnToStart: back }));
    });

  const vc = VEHICLE_CLASSES[vt];
  const seq = plan ? [start, ...plan.order, ...(back ? [start] : [])] : [];
  const legs = seq.slice(1).map((c, i) => ({ from: seq[i]!, to: c, km: roadKm(requireCity(seq[i]!), requireCity(c)) }));
  const hours = plan ? plan.totalKm / vc.avgKmph : 0;
  const days = Math.ceil(hours / 11);
  const diesel = plan ? Math.round((plan.totalKm / vc.kmpl) * (org?.settings.dieselPrice ?? 90)) : 0;
  const tolls = plan ? Math.round(plan.totalKm * vc.tollPerKm) : 0;
  const preset = useMemo(() => ({ originCity: start, destCity: plan?.order[plan.order.length - 1] ?? stops[0] }), [start, plan, stops]);
  const path: [number, number][] = seq.map((c) => {
    const x = requireCity(c);
    return [x.lat, x.lng];
  });

  return (
    <div>
      <PageHeader title="Route planner" sub="For milk runs and multi-drop trips. Add the towns in any order; we find the shortest sequence and cost it for the truck you pick." />
      <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <Sheet title="Stops">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run();
            }}
          >
            <Field label="Start from" htmlFor="rp-start">
              <Select id="rp-start" value={start} onChange={(e) => (setStart(e.target.value), setPlan(null))}>
                {cityNames.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <div>
              <p className="mb-1.5 text-[14px] font-[560]">Drop at</p>
              {stops.length === 0 && <p className="text-[14px] text-muted">Add at least two towns.</p>}
              <ul className="flex flex-wrap gap-1.5">
                {stops.map((s) => (
                  <li key={s} className="inline-flex h-8 items-center gap-1 rounded-full border border-line-strong bg-sheet pr-1 pl-3 text-[14.5px]">
                    {s}
                    <button type="button" aria-label={`Remove ${s}`} onClick={() => (setStops((x) => x.filter((y) => y !== s)), setPlan(null))} className="grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-sheet-2 hover:text-ink">
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex gap-2">
                <Select id="rp-add" aria-label="Add a stop" value={add} onChange={(e) => setAdd(e.target.value)}>
                  <option value="">Add a town</option>
                  {cityNames
                    .filter((c) => c !== start && !stops.includes(c))
                    .map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                </Select>
                <Button disabled={!add || stops.length >= 12} onClick={() => (setStops((x) => [...x, add]), setAdd(''), setPlan(null))} aria-label="Add stop">
                  <Plus size={16} />
                </Button>
              </div>
            </div>
            <Check id="rp-back" checked={back} onChange={(v) => (setBack(v), setPlan(null))} label={`Come back to ${start}`} />
            <Field label="Truck" htmlFor="rp-vt" hint="Used for diesel, tolls and driving time">
              <Select id="rp-vt" value={vt} onChange={(e) => setVt(e.target.value as VehicleType)}>
                {VEHICLE_TYPES.filter((t) => t !== 'BIKE').map((t) => (
                  <option key={t} value={t}>
                    {VEHICLE_CLASSES[t].label}
                  </option>
                ))}
              </Select>
            </Field>
            <ErrorNote>{act.error}</ErrorNote>
            <Button variant="primary" type="submit" disabled={act.busy || stops.length < 2} className="w-full">
              {act.busy ? 'Working it out…' : 'Find the shortest order'}
            </Button>
          </form>
        </Sheet>

        <div className="min-w-0 space-y-5">
          <NetworkMap compact height={380} focus={[start, ...stops].map((c) => [requireCity(c).lat, requireCity(c).lng] as [number, number])} path={plan ? path : undefined} />
          {!plan ? (
            <p className="text-[15px] text-muted">Press “Find the shortest order” to see the sequence, distance and cost.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                <Fact k="Total distance" v={<span className="t-fig text-[30px]">{plan.totalKm.toLocaleString('en-IN')} km</span>} />
                <Fact k="Saved against your order" v={<span className={`t-fig text-[30px] ${plan.savedKm > 0 ? 'text-go' : ''}`}>{plan.savedKm.toLocaleString('en-IN')} km</span>} />
                <Fact k="Driving time" v={<span className="t-fig text-[30px]">{Math.round(hours)} h</span>} />
                <Fact k="Diesel and tolls" v={<span className="t-fig text-[30px]">{inr(diesel + tolls)}</span>} />
              </div>
              <p className="text-[14px] text-muted">
                About {days} {days === 1 ? 'day' : 'days'} at 11 hours of driving a day. Diesel at {inr(org?.settings.dieselPrice ?? 90)} a litre and {vc.kmpl} km a litre comes to {inr(diesel)}; tolls about {inr(tolls)}.
              </p>
              <div className="sheet">
                <table className="data tight">
                  <thead>
                    <tr>
                      <th>Leg</th>
                      <th>From</th>
                      <th>To</th>
                      <th className="text-right">Km</th>
                      <th className="text-right">Running total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {legs.map((l, i) => (
                      <tr key={i}>
                        <td className="num text-muted">{i + 1}</td>
                        <td>{l.from}</td>
                        <td className="font-[560]">{l.to}</td>
                        <td className="num text-right">{l.km.toLocaleString('en-IN')}</td>
                        <td className="num text-right text-muted">{legs.slice(0, i + 1).reduce((a, x) => a + x.km, 0).toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" onClick={() => setTrip(true)}>
                  Plan a trip on this route
                </Button>
                <Button variant="ghost" onClick={() => nav('/shipments?view=booked')}>
                  See shipments waiting
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
      <PlanTrip open={trip} onClose={() => setTrip(false)} onDone={(id) => nav(`/trips/${id}`)} preset={preset} />
    </div>
  );
}
