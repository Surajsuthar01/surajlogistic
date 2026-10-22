import { STATUS_LABEL, type QuoteLine, type ShipmentEventRec, type ShipmentStatus, type TripRec } from '@suraj/core';
import { ArrowLeft, Check, Copy, FileText, Leaf } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { NetworkMap } from '../components/NetworkMap';
import { Badge, Button, ErrorNote, Field, Input, KV, Loading, Modal, Panel, StatusBadge } from '../components/ui';
import { api, DEMO } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dt, inr, kg } from '../lib/format';
import { useAction, useApi } from '../lib/hooks';

interface Detail {
  id: string;
  awb: string;
  service: 'COURIER' | 'PTL' | 'FTL';
  status: ShipmentStatus;
  shipperName: string;
  shipperPhone: string | null;
  consigneeName: string;
  consigneePhone: string;
  consigneeAddress: string;
  originCity: string;
  destCity: string;
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  currentLat: number;
  currentLng: number;
  weightKg: number;
  packages: number;
  declaredValue: number;
  paymentMode: string;
  codAmount: number;
  codCollected: boolean;
  price: number;
  priceBreakup: QuoteLine[];
  gstRate: number;
  distanceKm: number;
  co2Kg: number;
  rtoScore: number;
  rtoLevel: string;
  ewaybillRequired: boolean;
  ewaybillNo: string | null;
  vehicleType: string | null;
  attempts: number;
  promisedAt: string;
  etaAt: string;
  deliveredAt: string | null;
  podReceiver: string | null;
  deliveryOtp?: string;
  events: ShipmentEventRec[];
  trip: TripRec | null;
  nextStatuses: ShipmentStatus[];
}

export function ShipmentDetail() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const { user } = useAuth();
  const { data: s, reload, loading } = useApi<Detail>(`/api/shipments/${id}`, { liveTypes: ['shipment.status'] });
  const act = useAction();
  const [deliver, setDeliver] = useState(false);
  const [otp, setOtp] = useState('');
  const [receiver, setReceiver] = useState('');
  const [copied, setCopied] = useState(false);
  const [ewb, setEwb] = useState<string | null>(null);
  const staff = user?.role === 'admin' || user?.role === 'ops';

  if (loading && !s) return <Loading />;
  if (!s) return <p className="text-bad">Shipment not found.</p>;

  const move = (status: ShipmentStatus) =>
    act.run(async () => {
      await api.post(`/api/shipments/${s.id}/status`, { status });
      await reload();
    });
  const doDeliver = () =>
    act.run(async () => {
      await api.post(`/api/shipments/${s.id}/status`, { status: 'DELIVERED', otp, receiverName: receiver || s.consigneeName });
      setDeliver(false);
      await reload();
    });
  const genEwb = () =>
    act.run(async () => {
      const r = await api.post<{ ewbNo: string }>(`/api/shipments/${s.id}/ewaybill`);
      setEwb(r.ewbNo);
      await reload();
    });
  const trackUrl = `${window.location.origin}/track/${s.awb}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(trackUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  const late = !['DELIVERED', 'RTO_DELIVERED', 'CANCELLED'].includes(s.status) && new Date(s.etaAt).getTime() > new Date(s.promisedAt).getTime() + 2 * 3600_000;
  const events = [...s.events].reverse();

  return (
    <div>
      <Link to="/shipments" className="mb-3 inline-flex items-center gap-1 text-[14px] text-muted hover:text-ink">
        <ArrowLeft size={16} /> Shipments
      </Link>
      {sp.get('booked') && <p className="mb-4 rounded-[10px] bg-good-soft px-3 py-2 text-[14px] text-good">Booked. The receiver has been sent a tracking link on WhatsApp.</p>}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="awb text-[28px] font-bold">{s.awb}</h1>
            <StatusBadge status={s.status} label={STATUS_LABEL[s.status]} />
            {late && <Badge tone="bad">Running late</Badge>}
          </div>
          <p className="mt-1 text-[15px] text-muted">
            {s.service} · {s.originCity} → {s.destCity} · {s.distanceKm.toLocaleString('en-IN')} km
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={copy}>{copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy tracking link'}</Button>
          <Link to={`/track/${s.awb}`}>
            <Button>Customer view</Button>
          </Link>
          {staff &&
            s.nextStatuses
              .filter((n) => n !== 'DELIVERED')
              .map((n) => (
                <Button key={n} onClick={() => move(n)} disabled={act.busy} variant={n === 'CANCELLED' || n === 'RTO' ? 'secondary' : 'secondary'}>
                  Mark {STATUS_LABEL[n].toLowerCase()}
                </Button>
              ))}
          {staff && s.nextStatuses.includes('DELIVERED') && (
            <Button variant="primary" onClick={() => setDeliver(true)}>
              Record delivery
            </Button>
          )}
        </div>
      </div>
      <ErrorNote>{act.error}</ErrorNote>

      <div className="mt-2 grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Panel title="Route" bodyClass="p-2">
            <NetworkMap
              compact
              height={300}
              trips={[{ id: s.id, tripNo: s.awb, from: [s.originLat, s.originLng], to: [s.destLat, s.destLng], at: [s.currentLat, s.currentLng], late, vehicleId: 'x', originCity: s.originCity, destCity: s.destCity }]}
              vehicles={[{ id: 'x', regNo: s.awb, lat: s.currentLat, lng: s.currentLng, status: ['DELIVERED', 'RTO_DELIVERED'].includes(s.status) ? 'IDLE' : 'ON_TRIP', city: '' }]}
            />
          </Panel>
          <Panel title="Timeline">
            <ol className="relative ml-2 border-l-2 border-line">
              {events.map((e, i) => (
                <li key={e.id} className="relative pb-4 pl-5 last:pb-0">
                  <span className={`absolute top-1.5 -left-[7px] h-3 w-3 rounded-full border-2 border-panel ${i === 0 ? 'bg-accent' : 'bg-route'}`} />
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{STATUS_LABEL[e.status as ShipmentStatus]}</span>
                    <span className="text-[13px] text-muted">{dt(e.at)}</span>
                  </div>
                  <div className="text-[14px] text-muted">
                    {e.note}
                    {e.city ? ` · ${e.city}` : ''}
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="Delivery">
            <KV k="Promised by" v={dt(s.promisedAt)} />
            <KV k={s.deliveredAt ? 'Delivered' : 'Current ETA'} v={<span className={late ? 'text-bad' : ''}>{dt(s.deliveredAt ?? s.etaAt)}</span>} />
            {s.podReceiver && <KV k="Received by" v={s.podReceiver} />}
            <KV k="Receiver" v={s.consigneeName} />
            <KV k="Mobile" v={s.consigneePhone} />
            <KV k="Address" v={<span className="block max-w-[260px] text-[13.5px]">{s.consigneeAddress}</span>} />
            <KV k="Attempts" v={s.attempts} />
            {s.trip && <KV k="On trip" v={<Link className="text-route underline" to={`/trips/${s.trip.id}`}>{s.trip.tripNo}</Link>} />}
          </Panel>
          <Panel title="Money">
            <KV k="Freight (incl. GST)" v={inr(s.price)} />
            {s.priceBreakup.map((l) => (
              <KV key={l.code} k={l.label} v={inr(l.amount)} />
            ))}
            <KV k={`GST ${s.gstRate}%`} v={inr(s.price - s.priceBreakup.reduce((a, l) => a + l.amount, 0))} />
            <KV k="Payment" v={s.paymentMode === 'COD' ? `COD ${inr(s.codAmount)}${s.codCollected ? ' · collected' : ''}` : s.paymentMode === 'TO_PAY' ? 'To pay' : 'Prepaid'} />
          </Panel>
          <Panel title="Cargo & compliance">
            <KV k="Shipper" v={s.shipperName} />
            <KV k="Weight" v={`${kg(s.weightKg)} · ${s.packages} pkg`} />
            <KV k="Goods value" v={inr(s.declaredValue)} />
            <KV
              k="E-way bill"
              v={
                s.ewaybillNo ? (
                  <span className="num">{s.ewaybillNo}</span>
                ) : s.ewaybillRequired ? (
                  staff ? (
                    <Button size="sm" onClick={genEwb} disabled={act.busy}>
                      <FileText size={15} /> Generate
                    </Button>
                  ) : (
                    'Required'
                  )
                ) : (
                  'Not needed'
                )
              }
            />
            {ewb && <p className="mt-2 text-[13px] text-good">E-way bill {ewb} generated{DEMO ? ' (demo GSP)' : ''}.</p>}
            <KV k="Return risk" v={<StatusBadge status={s.rtoLevel} label={`${s.rtoScore}/100 · ${s.rtoLevel.toLowerCase()}`} />} />
            <KV
              k="Carbon"
              v={
                <span className="inline-flex items-center gap-1">
                  <Leaf size={14} className="text-good" /> {s.co2Kg.toLocaleString('en-IN')} kg CO₂
                </span>
              }
            />
          </Panel>
        </div>
      </div>

      <Modal open={deliver} onClose={() => setDeliver(false)} title="Record delivery">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void doDeliver();
          }}
        >
          <p className="text-[14.5px] text-muted">Ask the receiver for the 4-digit OTP sent to {s.consigneePhone}. Delivery is only recorded when the OTP matches.</p>
          {s.deliveryOtp && staff && <p className="rounded-[10px] bg-panel-2 px-3 py-2 text-[13.5px]">Office view: the OTP for this shipment is <b className="num">{s.deliveryOtp}</b>. Drivers never see it.</p>}
          <Field label="Delivery OTP" htmlFor="pod-otp">
            <Input id="pod-otp" inputMode="numeric" maxLength={8} value={otp} onChange={(e) => setOtp(e.target.value)} required />
          </Field>
          <Field label="Received by" htmlFor="pod-name">
            <Input id="pod-name" value={receiver} onChange={(e) => setReceiver(e.target.value)} placeholder={s.consigneeName} />
          </Field>
          {s.paymentMode === 'COD' && <p className="text-[14px]">Collect {inr(s.codAmount)} cash or UPI before handing over.</p>}
          <ErrorNote>{act.error}</ErrorNote>
          <Button variant="primary" type="submit" disabled={act.busy || otp.length < 4}>
            Confirm delivery
          </Button>
        </form>
      </Modal>
    </div>
  );
}
