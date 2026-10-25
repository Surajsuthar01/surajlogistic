import { STATUS_LABEL, type QuoteLine, type ShipmentEventRec, type ShipmentStatus, type TripRec } from '@suraj/shared';
import { ArrowLeft, Check, Copy, ExternalLink, FileText, Printer, Tag } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { NetworkMap } from '../components/NetworkMap';
import { Button, ButtonLink, ErrorNote, Field, Input, KV, Loading, Modal, Note, RiskMeter, Sheet, StatusMark, useToast } from '../components/ui';
import { api, DEMO } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dt, inr, kg, PAYMENT_LABEL, svc } from '../lib/format';
import { useAction, useApi } from '../lib/hooks';
import { fileToDataUrl } from '../lib/image';
import { isLate } from './Shipments';

export interface ShipmentDetailResp {
  id: string;
  awb: string;
  service: 'COURIER' | 'PTL' | 'FTL';
  status: ShipmentStatus;
  shipperName: string;
  shipperPhone: string | null;
  consigneeName: string;
  consigneePhone: string;
  consigneeAddress: string;
  pickupAddress: string | null;
  contents: string | null;
  shipperInvoiceNo: string | null;
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
  podPhotoUrl: string | null;
  podSignatureUrl: string | null;
  deliveryOtp?: string;
  createdAt: string;
  events: ShipmentEventRec[];
  trip: TripRec | null;
  nextStatuses: ShipmentStatus[];
}

const STEPS: { key: ShipmentStatus[]; label: string }[] = [
  { key: ['BOOKED'], label: 'Booked' },
  { key: ['PICKED_UP'], label: 'Picked up' },
  { key: ['IN_TRANSIT', 'AT_HUB'], label: 'On the way' },
  { key: ['OUT_FOR_DELIVERY', 'NDR'], label: 'Out for delivery' },
  { key: ['DELIVERED'], label: 'Delivered' },
];

const ACTION_LABEL: Partial<Record<ShipmentStatus, string>> = {
  PICKED_UP: 'Mark picked up',
  IN_TRANSIT: 'Mark in transit',
  AT_HUB: 'Mark reached hub',
  OUT_FOR_DELIVERY: 'Send out for delivery',
  NDR: 'Delivery failed',
  RTO: 'Return to sender',
  RTO_DELIVERED: 'Returned to sender',
  CANCELLED: 'Cancel booking',
};

export function ShipmentDetail() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const { user } = useAuth();
  const toast = useToast();
  const { data: s, reload, loading, error } = useApi<ShipmentDetailResp>(`/api/shipments/${id}`, { liveTypes: ['shipment.status'] });
  const act = useAction();
  const [deliver, setDeliver] = useState(false);
  const [copied, setCopied] = useState(false);
  const staff = user?.role === 'admin' || user?.role === 'ops';
  const customer = user?.role === 'customer';

  if (loading && !s) return <Loading rows={8} />;
  if (!s) return <Note tone="warn">{error ?? 'Shipment not found.'} Check the link or search for the AWB number.</Note>;

  const move = (status: ShipmentStatus) =>
    act.run(async () => {
      await api.post(`/api/shipments/${s.id}/status`, { status });
      await reload();
      toast(`${s.awb}: ${STATUS_LABEL[status].toLowerCase()}`);
    });
  const genEwb = () =>
    act.run(async () => {
      const r = await api.post<{ ewbNo: string; validUntil: string }>(`/api/shipments/${s.id}/ewaybill`);
      await reload();
      toast(`E-way bill ${r.ewbNo} generated, valid till ${dt(r.validUntil)}`);
    });
  const trackUrl = `${DEMO ? 'https://surajlogistic.in' : window.location.origin}/track/${s.awb}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(trackUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast('Could not copy. Select the link on the tracking page instead.', 'bad');
    }
  };
  const late = isLate(s);
  const events = [...s.events].reverse();
  const stepAt = STEPS.findIndex((x) => x.key.includes(s.status));
  const failed = ['NDR', 'RTO', 'RTO_DELIVERED', 'CANCELLED'].includes(s.status);
  const requested = s.status === 'REQUESTED';
  const actions = requested ? [] : s.nextStatuses.filter((n) => n !== 'DELIVERED' && (staff || (customer && n === 'CANCELLED')));
  const gst = s.price - s.priceBreakup.reduce((a, l) => a + l.amount, 0);

  return (
    <div>
      <Link to="/shipments" className="mb-2 inline-flex items-center gap-1 text-[14px] text-muted hover:text-ink">
        <ArrowLeft size={15} /> Shipments
      </Link>
      {sp.get('booked') && (
        <div className="mb-4">
          <Note tone="go">Booked. The receiver has a WhatsApp message with the tracking link, and the delivery OTP goes out on the day of delivery.</Note>
        </div>
      )}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h1 className="t-fig text-[40px] tracking-[0.03em]">{s.awb}</h1>
            <StatusMark status={s.status} className="text-[16px] font-[560]" />
            {late && <span className="text-[15px] font-[560] text-bad">Running late</span>}
          </div>
          <p className="mt-1.5 text-[16px] text-muted">
            {svc(s.service)} from <span className="text-ink">{s.originCity}</span> to <span className="text-ink">{s.destCity}</span>, {s.distanceKm.toLocaleString('en-IN')} km by road. Booked {dt(s.createdAt)}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink to={`/print/label/${s.id}`} target={DEMO ? undefined : '_blank'}>
            <Tag size={16} /> Label
          </ButtonLink>
          <ButtonLink to={`/print/lr/${s.id}`} target={DEMO ? undefined : '_blank'}>
            <Printer size={16} /> Consignment note
          </ButtonLink>
          <Button onClick={copy}>
            {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy tracking link'}
          </Button>
        </div>
      </div>

      {(actions.length > 0 || (staff && s.nextStatuses.includes('DELIVERED'))) && (
        <div className="mb-6 flex flex-wrap items-center gap-2 rounded-full border border-line bg-sheet px-2 py-1.5 pl-5">
          <span className="mr-1 text-[14px] text-muted">Next step:</span>
          {staff && s.nextStatuses.includes('DELIVERED') && (
            <Button variant="primary" size="sm" onClick={() => setDeliver(true)}>
              Record delivery
            </Button>
          )}
          {actions.map((n) => (
            <Button key={n} size="sm" onClick={() => move(n)} disabled={act.busy} variant={n === 'CANCELLED' || n === 'RTO' ? 'quietDanger' : 'secondary'}>
              {ACTION_LABEL[n] ?? STATUS_LABEL[n]}
            </Button>
          ))}
        </div>
      )}
      {requested && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-warn bg-warn-soft px-5 py-3.5">
          <p className="text-[15px]">
            Booked on the website without a login by <span className="font-[600]">{s.shipperName}</span>. Nothing goes to the receiver until you confirm it.
          </p>
          {staff && (
            <ButtonLink to="/requests" size="sm" variant="primary">
              Confirm or decline
            </ButtonLink>
          )}
        </div>
      )}
      <ErrorNote>{act.error}</ErrorNote>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <div>
            <NetworkMap
              compact
              height={300}
              trips={[{ id: s.id, tripNo: s.awb, from: [s.originLat, s.originLng], to: [s.destLat, s.destLng], at: [s.currentLat, s.currentLng], late, vehicleId: 'x', originCity: s.originCity, destCity: s.destCity }]}
              vehicles={[{ id: 'x', regNo: s.awb, lat: s.currentLat, lng: s.currentLng, status: ['DELIVERED', 'RTO_DELIVERED'].includes(s.status) ? 'IDLE' : 'ON_TRIP', city: '' }]}
            />
            {!failed && (
              <ol className="mt-3 grid grid-cols-5 gap-1.5" aria-label="Progress">
                {STEPS.map((st, i) => (
                  <li key={st.label} className="min-w-0">
                    <div className="h-1.5 rounded-full" style={{ background: i <= stepAt ? 'var(--go)' : 'var(--line)' }} />
                    <p className={`mt-1.5 truncate text-[13px] ${i <= stepAt ? 'font-[560]' : 'text-muted'}`}>{st.label}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <section>
            <h2 className="t-sub mb-3">What happened</h2>
            <ol className="relative ml-1.5 border-l-2 border-line">
              {events.map((e, i) => (
                <li key={e.id} className="relative pb-4 pl-5 last:pb-0">
                  <span className={`absolute top-[7px] -left-[7px] h-3 w-3 rounded-full border-2 border-ground ${i === 0 ? 'bg-plate' : 'bg-go'}`} />
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-[560]">{STATUS_LABEL[e.status as ShipmentStatus]}</span>
                    <span className="num text-[13.5px] text-muted">{dt(e.at)}</span>
                  </div>
                  <p className="text-[14.5px] text-muted">
                    {e.note}
                    {e.city && e.note.indexOf(e.city) === -1 ? <span> in {e.city}</span> : null}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          {(s.podPhotoUrl || s.podSignatureUrl) && (
            <Sheet title="Proof of delivery">
              <div className="flex flex-wrap gap-4">
                {s.podPhotoUrl && (
                  <figure className="m-0">
                    <img src={s.podPhotoUrl} alt={`Delivery photo for ${s.awb}`} className="h-44 w-auto rounded-[12px] border border-line object-cover" />
                    <figcaption className="mt-1 text-[13px] text-muted">Photo at the door</figcaption>
                  </figure>
                )}
                {s.podSignatureUrl && (
                  <figure className="m-0">
                    <img src={s.podSignatureUrl} alt={`Signature of ${s.podReceiver ?? 'receiver'}`} className="h-44 w-auto rounded-[12px] border border-line bg-white object-contain" />
                    <figcaption className="mt-1 text-[13px] text-muted">Signed by {s.podReceiver}</figcaption>
                  </figure>
                )}
              </div>
            </Sheet>
          )}
        </div>

        <div className="min-w-0 space-y-5">
          <Sheet title="Delivery">
            <dl className="m-0">
              <KV k="Promised by" v={dt(s.promisedAt)} />
              <KV k={s.deliveredAt ? 'Delivered' : 'Expected'} v={<span className={late ? 'font-[560] text-bad' : ''}>{dt(s.deliveredAt ?? s.etaAt)}</span>} />
              {s.podReceiver && <KV k="Received by" v={s.podReceiver} />}
              <KV k="Receiver" v={s.consigneeName} />
              <KV
                k="Mobile"
                v={
                  <a href={`tel:${s.consigneePhone}`} className="underline decoration-line-strong underline-offset-2">
                    {s.consigneePhone}
                  </a>
                }
              />
              <KV k="Address" v={<span className="block max-w-[280px] text-[14px] leading-snug">{s.consigneeAddress}</span>} />
              {s.attempts > 0 && <KV k="Delivery attempts" v={s.attempts} />}
              {s.trip && (
                <KV
                  k="On trip"
                  v={
                    <Link className="font-[560] text-accent underline underline-offset-2" to={`/trips/${s.trip.id}`}>
                      {s.trip.tripNo}
                    </Link>
                  }
                />
              )}
            </dl>
            <ButtonLink to={`/track/${s.awb}`} variant="ghost" size="sm" className="mt-2 -ml-2">
              <ExternalLink size={15} /> See what the receiver sees
            </ButtonLink>
          </Sheet>

          <Sheet title="Money">
            <dl className="m-0">
              {s.priceBreakup.map((l) => (
                <KV key={l.code} k={l.label} v={inr(l.amount)} />
              ))}
              <KV k={`GST at ${s.gstRate}%`} v={inr(gst)} />
              <KV k="Freight total" v={inr(s.price)} strong />
              <KV k="Payment" v={s.paymentMode === 'COD' ? `Collect ${inr(s.codAmount)} in cash${s.codCollected ? ', collected' : ''}` : PAYMENT_LABEL[s.paymentMode] ?? s.paymentMode} />
            </dl>
          </Sheet>

          <Sheet title="Cargo and papers">
            <dl className="m-0">
              <KV k="Shipper" v={s.shipperName} />
              {s.pickupAddress && <KV k="Pick up from" v={<span className="block max-w-[260px] text-[14px] leading-snug">{s.pickupAddress}</span>} />}
              {s.contents && <KV k="Contents" v={s.contents} />}
              <KV k="Weight" v={`${kg(s.weightKg)} in ${s.packages} ${s.packages === 1 ? 'package' : 'packages'}`} />
              <KV k="Goods value" v={inr(s.declaredValue)} />
              {s.shipperInvoiceNo && <KV k="Shipper invoice" v={s.shipperInvoiceNo} />}
              <KV
                k="E-way bill"
                v={
                  s.ewaybillNo ? (
                    <span className="num font-[560]">{s.ewaybillNo}</span>
                  ) : s.ewaybillRequired ? (
                    staff ? (
                      <Button size="sm" onClick={genEwb} disabled={act.busy}>
                        <FileText size={15} /> Generate
                      </Button>
                    ) : (
                      <span className="text-warn">Needed before pickup</span>
                    )
                  ) : (
                    <span className="text-muted">Not needed</span>
                  )
                }
              />
              {!customer && <KV k="Chance it comes back" v={<RiskMeter score={s.rtoScore} level={s.rtoLevel} />} />}
              <KV k="Carbon, estimated" v={`${s.co2Kg.toLocaleString('en-IN')} kg CO₂`} />
            </dl>
          </Sheet>
        </div>
      </div>

      <DeliverModal open={deliver} onClose={() => setDeliver(false)} s={s} staff={staff} onDone={async () => (setDeliver(false), await reload(), toast(`${s.awb} delivered`))} />
    </div>
  );
}

function DeliverModal({ open, onClose, s, staff, onDone }: { open: boolean; onClose: () => void; s: ShipmentDetailResp; staff: boolean; onDone: () => void }) {
  const [otp, setOtp] = useState('');
  const [receiver, setReceiver] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const act = useAction();
  const submit = () =>
    act.run(async () => {
      await api.post(`/api/shipments/${s.id}/status`, { status: 'DELIVERED', otp, receiverName: receiver || s.consigneeName });
      if (photo) await api.post(`/api/shipments/${s.id}/pod`, { photo });
      onDone();
    });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Record delivery of ${s.awb}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="deliver-form" disabled={act.busy || otp.length < 4}>
            Confirm delivery
          </Button>
        </>
      }
    >
      <form
        id="deliver-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="text-[15px] text-muted">Ask the receiver for the 4-digit OTP we sent to {s.consigneePhone}. The delivery is only recorded when it matches.</p>
        {s.deliveryOtp && staff && (
          <Note>
            Office copy: the OTP for this shipment is <b className="num">{s.deliveryOtp}</b>. Drivers never see it.
          </Note>
        )}
        <Field label="Delivery OTP" htmlFor="pod-otp">
          <Input id="pod-otp" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} required className="t-fig h-12 text-center text-[26px] tracking-[0.4em]" />
        </Field>
        <Field label="Received by" htmlFor="pod-name">
          <Input id="pod-name" value={receiver} onChange={(e) => setReceiver(e.target.value)} placeholder={s.consigneeName} />
        </Field>
        <Field label="Photo of the delivered goods" hint="Optional. Helps settle disputes later." htmlFor="pod-photo">
          <input id="pod-photo" type="file" accept="image/*" capture="environment" onChange={async (e) => setPhoto(e.target.files?.[0] ? await fileToDataUrl(e.target.files[0]) : null)} className="text-[14px] file:mr-3 file:rounded-[7px] file:border file:border-line-strong file:bg-sheet file:px-3 file:py-1.5 file:text-[14px]" />
        </Field>
        {photo && <img src={photo} alt="Delivery photo preview" className="h-28 rounded-[12px] border border-line object-cover" />}
        {s.paymentMode === 'COD' && <Note tone="warn">Collect {inr(s.codAmount)} in cash or UPI before handing over.</Note>}
        <ErrorNote>{act.error}</ErrorNote>
      </form>
    </Modal>
  );
}
