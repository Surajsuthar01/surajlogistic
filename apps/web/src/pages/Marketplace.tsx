import { CITIES, VEHICLE_CLASSES, VEHICLE_TYPES, type BidRec, type LoadRec, type ReturnLoadMatch, type VehicleRec } from '@suraj/core';
import { Plus, Repeat2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge, Button, Empty, ErrorNote, Field, Input, KV, Loading, Modal, PageHeader, Panel, Select, StatusBadge } from '../components/ui';
import { api } from '../lib/api';
import { dt, inr, kg } from '../lib/format';
import { useAction, useApi } from '../lib/hooks';

type LoadRow = LoadRec & { mine: boolean; bidCount: number; bestBid: number | null };
type LoadDetail = LoadRec & { mine: boolean; bids: BidRec[]; suggestedTrucks: { vehicleId: string; regNo: string; city: string; deadheadKm: number; fit: number; score: number }[] };
type Match = ReturnLoadMatch & { load: ReturnLoadMatch['load'] & { loadNo: string; material: string } };

const cityNames = [...CITIES].map((c) => c.name).sort();

export function Marketplace() {
  const [sp] = useSearchParams();
  const loads = useApi<LoadRow[]>('/api/loads', { liveTypes: ['load.created', 'load.booked', 'load.bid'] });
  const vehicles = useApi<VehicleRec[]>('/api/vehicles');
  const [vehicleId, setVehicleId] = useState(sp.get('vehicle') ?? '');
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [openLoad, setOpenLoad] = useState<string | null>(null);
  const [post, setPost] = useState(false);
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
    void act.run(async () => setMatches(await api.get<Match[]>(`/api/vehicles/${vehicleId}/return-loads?radiusKm=200`)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleId, loads.data]);

  const v = vehicles.data?.find((x) => x.id === vehicleId);
  const open = (loads.data ?? []).filter((l) => l.status === 'OPEN');

  return (
    <div>
      <PageHeader
        title="Load board"
        sub={`${open.length} open loads. Fill empty trucks, take bids from other transporters, and stop paying for empty kilometres.`}
        actions={
          <Button variant="primary" onClick={() => setPost(true)}>
            <Plus size={17} /> Post a load
          </Button>
        }
      />

      <Panel
        title={
          <div className="flex items-center gap-2">
            <Repeat2 size={18} className="text-route" />
            <h2 className="text-[17px] font-semibold">Return-load finder</h2>
          </div>
        }
        action={
          <Select id="rl-vehicle" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className="!w-auto" aria-label="Truck">
            {(vehicles.data ?? []).map((x) => (
              <option key={x.id} value={x.id}>
                {x.regNo} · {x.status === 'IDLE' ? 'idle' : x.status === 'ON_TRIP' ? 'on trip' : 'workshop'} at {x.city}
              </option>
            ))}
          </Select>
        }
        bodyClass="p-0"
      >
        {v && (
          <p className="px-4 pt-3 text-[14px] text-muted">
            Loads within 200 km of {v.regNo} ({VEHICLE_CLASSES[v.type].label}, {kg(v.capacityKg)}) at {v.city}, ranked by money per kilometre including the empty run to pickup.
          </p>
        )}
        {!matches ? (
          <Loading label="Matching loads" />
        ) : matches.length === 0 ? (
          <Empty title="No loads fit this truck nearby">Post the truck as available, or widen the search by moving it closer to a busy hub.</Empty>
        ) : (
          <div className="scroll-x">
            <table className="data">
              <thead>
                <tr>
                  <th>Load</th>
                  <th>Lane</th>
                  <th>Empty to pickup</th>
                  <th>Fills</th>
                  <th className="text-right">Pays</th>
                  <th className="text-right">₹ per km</th>
                  <th className="text-right">Est. profit</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m, i) => (
                  <tr key={m.load.id} className="clickable" onClick={() => setOpenLoad(m.load.id)}>
                    <td className="whitespace-nowrap">
                      <div className="font-medium">{m.load.loadNo}</div>
                      {i === 0 && <Badge tone="accent">Best match</Badge>}
                    </td>
                    <td>
                      {m.load.origin.city} → {m.load.destination.city}
                      <div className="text-[12.5px] text-muted">{m.load.material}</div>
                    </td>
                    <td className="num">{m.deadheadKm} km</td>
                    <td className="num">{Math.round((m.load.weightKg / (v?.capacityKg ?? 1)) * 100)}%</td>
                    <td className="num text-right">{inr(m.load.targetPrice)}</td>
                    <td className="num text-right">₹{m.earningPerKm}</td>
                    <td className={`num text-right font-medium ${m.estProfit < 0 ? 'text-bad' : 'text-good'}`}>{inr(m.estProfit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel className="mt-5" title="All loads" bodyClass="p-0">
        {!loads.data ? (
          <Loading />
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
                {loads.data.map((l) => (
                  <tr key={l.id} className="clickable" onClick={() => setOpenLoad(l.id)}>
                    <td className="whitespace-nowrap">
                      <div className="font-medium">{l.loadNo}</div>
                      <div className="text-[12.5px] text-muted">{l.postedBy}</div>
                    </td>
                    <td className="whitespace-nowrap">
                      {l.originCity} → {l.destCity}
                    </td>
                    <td>
                      {l.material}
                      <div className="text-[12.5px] text-muted">{kg(l.weightKg)}</div>
                    </td>
                    <td className="whitespace-nowrap">{l.vehicleType ? VEHICLE_CLASSES[l.vehicleType].label : 'Any that fits'}</td>
                    <td className="whitespace-nowrap">{dt(l.pickupDate)}</td>
                    <td className="num text-right">{inr(l.targetPrice)}</td>
                    <td className="num whitespace-nowrap">{l.bidCount ? `${l.bidCount} · best ${inr(l.bestBid)}` : '—'}</td>
                    <td>
                      <StatusBadge status={l.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <LoadModal id={openLoad} onClose={() => setOpenLoad(null)} vehicles={vehicles.data ?? []} onChanged={() => void loads.reload()} />
      <PostLoad open={post} onClose={() => setPost(false)} onDone={() => (setPost(false), void loads.reload())} />
    </div>
  );
}

function LoadModal({ id, onClose, vehicles, onChanged }: { id: string | null; onClose: () => void; vehicles: VehicleRec[]; onChanged: () => void }) {
  const { data, reload } = useApi<LoadDetail>(id ? `/api/loads/${id}` : null);
  const [bid, setBid] = useState({ vehicleId: '', amount: '', etaHours: '24' });
  const act = useAction();
  const l = data && data.id === id ? data : null;
  const fits = vehicles.filter((v) => v.status === 'IDLE' && l && v.capacityKg >= l.weightKg);

  return (
    <Modal open={!!id} onClose={onClose} title={l ? `${l.loadNo} · ${l.originCity} → ${l.destCity}` : 'Load'} wide>
      {!l ? (
        <Loading />
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <KV k="Posted by" v={l.postedBy} />
            <KV k="Cargo" v={`${l.material}, ${kg(l.weightKg)}`} />
            <KV k="Truck" v={l.vehicleType ? VEHICLE_CLASSES[l.vehicleType].label : 'Any that fits'} />
            <KV k="Pickup" v={dt(l.pickupDate)} />
            <KV k="Offered" v={inr(l.targetPrice)} />
            <KV k="Status" v={<StatusBadge status={l.status} />} />
            {l.status === 'OPEN' && l.suggestedTrucks.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-2 text-[15px] font-semibold">Your nearest idle trucks</h3>
                <ul className="space-y-1.5 text-[14px]">
                  {l.suggestedTrucks.map((s) => (
                    <li key={s.vehicleId} className="flex justify-between gap-2">
                      <span>
                        <span className="awb">{s.regNo}</span> at {s.city}
                      </span>
                      <span className="num text-muted">
                        {s.deadheadKm} km away · fills {Math.round(s.fit * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-[15px] font-semibold">Bids</h3>
            {l.bids.length === 0 ? (
              <p className="text-[14px] text-muted">No bids yet.</p>
            ) : (
              <ul className="divide-y divide-line rounded-[10px] border border-line">
                {l.bids.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-medium">{b.carrierName}</div>
                      <div className="text-[12.5px] text-muted">{b.etaHours} h to deliver</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="num font-medium">{inr(b.amount)}</span>
                      {l.status === 'OPEN' && l.mine ? (
                        <Button size="sm" variant="primary" disabled={act.busy} onClick={() => act.run(async () => (await api.post(`/api/loads/${l.id}/accept`, { bidId: b.id }), await reload(), onChanged()))}>
                          Accept
                        </Button>
                      ) : (
                        <StatusBadge status={b.status} />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {l.status === 'OPEN' && (
              <form
                className="mt-4 space-y-3 rounded-[10px] bg-panel-2 p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void act.run(async () => {
                    await api.post(`/api/loads/${l.id}/bids`, { amount: Number(bid.amount), etaHours: Number(bid.etaHours), ...(bid.vehicleId ? { vehicleId: bid.vehicleId } : {}) });
                    setBid({ vehicleId: '', amount: '', etaHours: '24' });
                    await reload();
                    onChanged();
                  });
                }}
              >
                <h3 className="text-[15px] font-semibold">Offer one of your trucks</h3>
                <Field label="Truck" htmlFor="bid-veh">
                  <Select id="bid-veh" value={bid.vehicleId} onChange={(e) => setBid({ ...bid, vehicleId: e.target.value })}>
                    <option value="">Any truck (decide later)</option>
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
    <Modal open={open} onClose={onClose} title="Post a load">
      <form
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
            {cityNames.map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="To" htmlFor="pl-to">
          <Select id="pl-to" value={f.destCity} onChange={(e) => setF({ ...f, destCity: e.target.value })}>
            {cityNames.map((c) => <option key={c}>{c}</option>)}
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
          <Button variant="primary" type="submit" disabled={act.busy} className="mt-2">
            Post load
          </Button>
        </div>
      </form>
    </Modal>
  );
}
