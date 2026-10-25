import { VEHICLE_CLASSES, VEHICLE_TYPES, type BidRec, type LoadRec, type ReturnLoadMatch, type VehicleRec } from '@suraj/shared';
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Chip, Empty, ErrorNote, Field, Input, KV, Loading, Modal, PageHeader, Plate, Select, StatusMark, Tabs, useToast } from '../components/ui';
import { api } from '../lib/api';
import { dt, inr, kg, lane } from '../lib/format';
import { useAction, useApi } from '../lib/hooks';
import { cityNames } from './NewShipment';
import { PlanTrip } from './Trips';

type LoadRow = LoadRec & { mine: boolean; bidCount: number; bestBid: number | null };
type LoadDetail = LoadRec & { mine: boolean; bids: BidRec[]; suggestedTrucks: { vehicleId: string; regNo: string; city: string; deadheadKm: number; fit: number; score: number }[] };
type Match = ReturnLoadMatch & { load: ReturnLoadMatch['load'] & { loadNo: string; material: string } };

export function Marketplace() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const loads = useApi<LoadRow[]>('/api/loads', { liveTypes: ['load.created', 'load.booked', 'load.bid'] });
  const vehicles = useApi<VehicleRec[]>('/api/vehicles');
  const [vehicleId, setVehicleId] = useState(sp.get('vehicle') ?? '');
  const [radius, setRadius] = useState('200');
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [openLoad, setOpenLoad] = useState<string | null>(null);
  const [post, setPost] = useState(false);
  const [tab, setTab] = useState<'OPEN' | 'BOOKED' | 'all'>('OPEN');
  const [tripFor, setTripFor] = useState<LoadDetail | null>(null);
  const toast = useToast();
  const act = useAction();

  useEffect(() => {
    if (!vehicleId && vehicles.data) {
      const idle = vehicles.data.find((v) => v.status === 'IDLE' && v.city === 'Mumbai') ?? vehicles.data.find((v) => v.status === 'IDLE');
      if (idle) setVehicleId(idle.id);
    }
  }, [vehicles.data, vehicleId]);

  useEffect(() => {
    if (!vehicleId) return;
    setMatches(null);
    void act.run(async () => setMatches(await api.get<Match[]>(`/api/vehicles/${vehicleId}/return-loads?radiusKm=${radius}`)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleId, radius, loads.data]);

  const v = vehicles.data?.find((x) => x.id === vehicleId);
  const all = loads.data ?? [];
  const list = all.filter((l) => tab === 'all' || l.status === tab);
  const preset = useMemo(() => (tripFor ? { originCity: tripFor.originCity, destCity: tripFor.destCity, freight: tripFor.bids.find((b) => b.status === 'ACCEPTED')?.amount ?? tripFor.targetPrice, loadId: tripFor.id, vehicleId: tripFor.bids.find((b) => b.status === 'ACCEPTED')?.vehicleId ?? undefined } : undefined), [tripFor]);

  return (
    <div>
      <PageHeader
        title="Load board"
        sub="Fill empty trucks and stop paying for empty kilometres. Post loads you cannot carry, bid on loads you can."
        actions={
          <Button variant="primary" onClick={() => setPost(true)}>
            <Plus size={17} /> Post a load
          </Button>
        }
      />

      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="t-head">Loads for an empty truck</h2>
            <p className="mt-0.5 text-[14.5px] text-muted">Ranked by what you keep per kilometre, counting the empty run to pickup.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select id="rl-vehicle" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className="!w-auto" aria-label="Truck">
              {(vehicles.data ?? []).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.regNo}, {x.status === 'IDLE' ? 'idle' : x.status === 'ON_TRIP' ? 'on a trip' : 'in workshop'} at {x.city}
                </option>
              ))}
            </Select>
            <Select id="rl-radius" value={radius} onChange={(e) => setRadius(e.target.value)} className="!w-auto" aria-label="Search radius">
              <option value="100">Within 100 km</option>
              <option value="200">Within 200 km</option>
              <option value="350">Within 350 km</option>
            </Select>
          </div>
        </div>
        <div className="sheet">
          {v && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-2.5 text-[14.5px]">
              <Plate reg={v.regNo} size={13} />
              <span className="text-muted">
                {VEHICLE_CLASSES[v.type].label}, {kg(v.capacityKg)}, standing at {v.city}
              </span>
            </div>
          )}
          {!matches ? (
            <Loading rows={3} label="Matching loads" />
          ) : matches.length === 0 ? (
            <Empty title="No loads fit this truck nearby">Try a wider radius, or post the truck's lane as a load you want back.</Empty>
          ) : (
            <div className="scroll-x">
              <table className="data">
                <thead>
                  <tr>
                    <th>Load</th>
                    <th>Lane</th>
                    <th className="text-right">Empty to pickup</th>
                    <th className="text-right">Fills</th>
                    <th className="text-right">Pays</th>
                    <th className="text-right">Per km</th>
                    <th className="text-right">You keep</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((m, i) => (
                    <tr key={m.load.id} className="clickable" onClick={() => setOpenLoad(m.load.id)}>
                      <td className="whitespace-nowrap">
                        <span className="font-[560]">{m.load.loadNo}</span>
                        {i === 0 && (
                          <span className="ml-2">
                            <Chip tone="plate">Best</Chip>
                          </span>
                        )}
                      </td>
                      <td>
                        {lane(m.load.origin.city, m.load.destination.city)}
                        <div className="text-[13px] text-muted">{m.load.material}</div>
                      </td>
                      <td className="num text-right">{m.deadheadKm} km</td>
                      <td className="num text-right">{Math.round((m.load.weightKg / (v?.capacityKg ?? 1)) * 100)}%</td>
                      <td className="num text-right">{inr(m.load.targetPrice)}</td>
                      <td className="num text-right">₹{m.earningPerKm}</td>
                      <td className={`num text-right font-[600] ${m.estProfit < 0 ? 'text-bad' : 'text-go'}`}>{inr(m.estProfit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="t-head mb-2">All loads</h2>
        <Tabs
          value={tab}
          onChange={setTab}
          className="mb-3"
          items={[
            { value: 'OPEN', label: 'Open', count: all.filter((l) => l.status === 'OPEN').length },
            { value: 'BOOKED', label: 'Given to a carrier', count: all.filter((l) => l.status === 'BOOKED').length },
            { value: 'all', label: 'All', count: all.length },
          ]}
        />
        <div className="sheet">
          {!loads.data ? (
            <Loading rows={5} />
          ) : list.length === 0 ? (
            <Empty title="Nothing here" action={<Button onClick={() => setPost(true)}>Post a load</Button>}>
              Loads you post and loads from other transporters show up here.
            </Empty>
          ) : (
            <div className="scroll-x">
              <table className="data">
                <thead>
                  <tr>
                    <th>Load</th>
                    <th>Lane</th>
                    <th>Cargo</th>
                    <th>Truck needed</th>
                    <th>Pickup</th>
                    <th className="text-right">Offered</th>
                    <th>Bids</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((l) => (
                    <tr key={l.id} className="clickable" onClick={() => setOpenLoad(l.id)}>
                      <td className="whitespace-nowrap">
                        <div className="font-[560]">{l.loadNo}</div>
                        <div className="max-w-[180px] truncate text-[13px] text-muted">{l.postedBy}</div>
                      </td>
                      <td className="whitespace-nowrap">{lane(l.originCity, l.destCity)}</td>
                      <td>
                        {l.material}
                        <div className="text-[13px] text-muted">{kg(l.weightKg)}</div>
                      </td>
                      <td className="whitespace-nowrap">{l.vehicleType ? VEHICLE_CLASSES[l.vehicleType].label : 'Any that fits'}</td>
                      <td className="num whitespace-nowrap">{dt(l.pickupDate)}</td>
                      <td className="num text-right">{inr(l.targetPrice)}</td>
                      <td className="num whitespace-nowrap">{l.bidCount ? `${l.bidCount}, lowest ${inr(l.bestBid)}` : <span className="text-faint">None yet</span>}</td>
                      <td>
                        <StatusMark status={l.status} label={l.status === 'BOOKED' ? 'Given out' : undefined} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <LoadModal
        id={openLoad}
        onClose={() => setOpenLoad(null)}
        vehicles={vehicles.data ?? []}
        onChanged={() => void loads.reload()}
        onPlan={(l) => {
          setOpenLoad(null);
          setTripFor(l);
        }}
      />
      <PostLoad open={post} onClose={() => setPost(false)} onDone={() => (setPost(false), void loads.reload(), toast('Load posted on the board'))} />
      <PlanTrip open={!!tripFor} onClose={() => setTripFor(null)} onDone={(id) => nav(`/trips/${id}`)} preset={preset} />
    </div>
  );
}

function LoadModal({ id, onClose, vehicles, onChanged, onPlan }: { id: string | null; onClose: () => void; vehicles: VehicleRec[]; onChanged: () => void; onPlan: (l: LoadDetail) => void }) {
  const { data, reload } = useApi<LoadDetail>(id ? `/api/loads/${id}` : null);
  const [bid, setBid] = useState({ vehicleId: '', amount: '', etaHours: '24' });
  const act = useAction();
  const toast = useToast();
  const l = data && data.id === id ? data : null;
  const fits = vehicles.filter((v) => v.status === 'IDLE' && l && v.capacityKg >= l.weightKg);

  return (
    <Modal open={!!id} onClose={onClose} title={l ? `${l.loadNo}, ${lane(l.originCity, l.destCity)}` : 'Load'} wide>
      {!l ? (
        <Loading />
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <dl className="m-0">
              <KV k="Posted by" v={l.postedBy} />
              <KV k="Cargo" v={`${l.material}, ${kg(l.weightKg)}`} />
              <KV k="Truck" v={l.vehicleType ? VEHICLE_CLASSES[l.vehicleType].label : 'Any that fits'} />
              <KV k="Pickup" v={dt(l.pickupDate)} />
              <KV k="Offered" v={inr(l.targetPrice)} strong />
              <KV k="Status" v={<StatusMark status={l.status} label={l.status === 'BOOKED' ? 'Given to a carrier' : undefined} />} />
            </dl>
            {l.status === 'OPEN' && l.suggestedTrucks.length > 0 && (
              <div className="mt-5">
                <h3 className="t-sub mb-2">Your nearest idle trucks</h3>
                <ul className="space-y-2 text-[14.5px]">
                  {l.suggestedTrucks.map((s) => (
                    <li key={s.vehicleId} className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-2">
                        <Plate reg={s.regNo} size={12.5} /> at {s.city}
                      </span>
                      <span className="num text-muted">
                        {s.deadheadKm} km away, fills {Math.round(s.fit * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {l.status === 'BOOKED' && l.mine && !l.tripId && (
              <Button variant="primary" className="mt-5" onClick={() => onPlan(l)}>
                Plan the trip for this load
              </Button>
            )}
          </div>
          <div>
            <h3 className="t-sub mb-2">Bids</h3>
            {l.bids.length === 0 ? (
              <p className="text-[14.5px] text-muted">No bids yet.</p>
            ) : (
              <ul className="divide-y divide-line rounded-[12px] border border-line">
                {l.bids.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-[14.5px] font-[560]">{b.carrierName}</div>
                      <div className="text-[13px] text-muted">delivers in {b.etaHours} h</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="num font-[600]">{inr(b.amount)}</span>
                      {l.status === 'OPEN' && l.mine ? (
                        <Button size="sm" variant="primary" disabled={act.busy} onClick={() => act.run(async () => (await api.post(`/api/loads/${l.id}/accept`, { bidId: b.id }), await reload(), onChanged(), toast(`${l.loadNo} given to ${b.carrierName}`)))}>
                          Accept
                        </Button>
                      ) : (
                        <StatusMark status={b.status} />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {l.status === 'OPEN' && (
              <form
                className="mt-4 space-y-3 rounded-[16px] border border-line bg-sheet-2 p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void act.run(async () => {
                    await api.post(`/api/loads/${l.id}/bids`, { amount: Number(bid.amount), etaHours: Number(bid.etaHours), ...(bid.vehicleId ? { vehicleId: bid.vehicleId } : {}) });
                    setBid({ vehicleId: '', amount: '', etaHours: '24' });
                    await reload();
                    onChanged();
                    toast('Bid placed');
                  });
                }}
              >
                <h3 className="t-sub">Offer one of your trucks</h3>
                <Field label="Truck" htmlFor="bid-veh">
                  <Select id="bid-veh" value={bid.vehicleId} onChange={(e) => setBid({ ...bid, vehicleId: e.target.value })}>
                    <option value="">Decide later</option>
                    {fits.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.regNo} at {v.city}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Your price (₹)" htmlFor="bid-amt">
                    <Input id="bid-amt" type="number" min="500" value={bid.amount} onChange={(e) => setBid({ ...bid, amount: e.target.value })} placeholder={String(l.targetPrice)} required />
                  </Field>
                  <Field label="Hours to deliver" htmlFor="bid-eta">
                    <Input id="bid-eta" type="number" min="1" value={bid.etaHours} onChange={(e) => setBid({ ...bid, etaHours: e.target.value })} required />
                  </Field>
                </div>
                <Button type="submit" variant="primary" disabled={act.busy}>
                  Place bid
                </Button>
              </form>
            )}
            <div className="mt-3">
              <ErrorNote>{act.error}</ErrorNote>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function PostLoad({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const tomorrow = new Date(Date.now() + 86400_000);
  tomorrow.setMinutes(0, 0, 0);
  const local = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [f, setF] = useState({ originCity: 'Indore', destCity: 'Delhi', material: '', weightKg: '', vehicleType: '', pickup: local, targetPrice: '', postedBy: '' });
  const act = useAction();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Post a load"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="post-load" disabled={act.busy}>
            Post load
          </Button>
        </>
      }
    >
      <form
        id="post-load"
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void act.run(async () => {
            await api.post('/api/loads', {
              originCity: f.originCity,
              destCity: f.destCity,
              material: f.material,
              weightKg: Number(f.weightKg),
              ...(f.vehicleType ? { vehicleType: f.vehicleType } : {}),
              pickupDate: new Date(f.pickup).toISOString(),
              targetPrice: Number(f.targetPrice),
              ...(f.postedBy ? { postedBy: f.postedBy } : {}),
            });
            onDone();
          });
        }}
      >
        <Field label="From" htmlFor="pl-from">
          <Select id="pl-from" value={f.originCity} onChange={(e) => setF({ ...f, originCity: e.target.value })}>
            {cityNames.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="To" htmlFor="pl-to">
          <Select id="pl-to" value={f.destCity} onChange={(e) => setF({ ...f, destCity: e.target.value })}>
            {cityNames.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Material" htmlFor="pl-mat">
          <Input id="pl-mat" value={f.material} onChange={(e) => setF({ ...f, material: e.target.value })} placeholder="e.g. Soya meal bags" required />
        </Field>
        <Field label="Weight (kg)" htmlFor="pl-kg">
          <Input id="pl-kg" type="number" min="1" value={f.weightKg} onChange={(e) => setF({ ...f, weightKg: e.target.value })} required />
        </Field>
        <Field label="Truck needed" htmlFor="pl-vt">
          <Select id="pl-vt" value={f.vehicleType} onChange={(e) => setF({ ...f, vehicleType: e.target.value })}>
            <option value="">Any that fits</option>
            {VEHICLE_TYPES.filter((t) => t !== 'BIKE').map((t) => (
              <option key={t} value={t}>
                {VEHICLE_CLASSES[t].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Pickup" htmlFor="pl-date">
          <Input id="pl-date" type="datetime-local" value={f.pickup} onChange={(e) => setF({ ...f, pickup: e.target.value })} required />
        </Field>
        <Field label="Price offered (₹)" htmlFor="pl-price">
          <Input id="pl-price" type="number" min="500" value={f.targetPrice} onChange={(e) => setF({ ...f, targetPrice: e.target.value })} required />
        </Field>
        <Field label="Shipper name" hint="Leave empty to post as your company" htmlFor="pl-by">
          <Input id="pl-by" value={f.postedBy} onChange={(e) => setF({ ...f, postedBy: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <ErrorNote>{act.error}</ErrorNote>
        </div>
      </form>
    </Modal>
  );
}
