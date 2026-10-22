import { Leaf, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Brand } from '../components/Layout';
import { NetworkMap } from '../components/NetworkMap';
import { Badge, Button, ErrorNote, Input, Loading } from '../components/ui';
import { api, errorText } from '../lib/api';
import { dt, kg } from '../lib/format';

interface TrackResp {
  awb: string;
  service: string;
  status: string;
  statusLabel: string;
  originCity: string;
  destCity: string;
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  current: { lat: number; lng: number };
  weightKg: number;
  packages: number;
  etaAt: string;
  promisedAt: string;
  deliveredAt: string | null;
  receivedBy: string | null;
  co2Kg: number;
  events: { status: string; label: string; note: string; city: string | null; at: string }[];
}

const STEPS = [
  { key: 'BOOKED', en: 'Booked', hi: 'बुक' },
  { key: 'PICKED_UP', en: 'Picked up', hi: 'पिकअप' },
  { key: 'IN_TRANSIT', en: 'On the way', hi: 'रास्ते में' },
  { key: 'OUT_FOR_DELIVERY', en: 'Out for delivery', hi: 'डिलीवरी पर' },
  { key: 'DELIVERED', en: 'Delivered', hi: 'डिलीवर' },
];
const ORDER: Record<string, number> = { BOOKED: 0, PICKED_UP: 1, IN_TRANSIT: 2, AT_HUB: 2, OUT_FOR_DELIVERY: 3, NDR: 3, DELIVERED: 4, RTO: 3, RTO_DELIVERED: 4, CANCELLED: 0 };

export function Track() {
  const { awb } = useParams();
  const nav = useNavigate();
  const [q, setQ] = useState(awb ?? '');
  const [data, setData] = useState<TrackResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hi, setHi] = useState(false);

  useEffect(() => {
    if (!awb) return;
    setLoading(true);
    setError(null);
    api
      .get<TrackResp>(`/api/track/${encodeURIComponent(awb)}`)
      .then(setData)
      .catch((e) => {
        setData(null);
        setError(errorText(e));
      })
      .finally(() => setLoading(false));
  }, [awb]);

  const step = data ? ORDER[data.status] ?? 0 : 0;
  const failed = data && ['NDR', 'RTO', 'RTO_DELIVERED', 'CANCELLED'].includes(data.status);

  return (
    <div className="min-h-full" style={{ paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))', paddingRight: 'max(16px, env(safe-area-inset-right, 0px))' }}>
      <div className="mx-auto max-w-[760px] py-6">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link to="/">
            <Brand small />
          </Link>
          <button type="button" onClick={() => setHi(!hi)} className="rounded-full border border-line px-3 py-1 text-[13.5px]">
            {hi ? 'English' : 'हिंदी'}
          </button>
        </div>
        <h1 className="text-[30px] font-bold">{hi ? 'आपका सामान कहाँ है?' : 'Where is my shipment?'}</h1>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) nav(`/track/${q.trim().toUpperCase()}`);
          }}
        >
          <Input id="track-awb" value={q} onChange={(e) => setQ(e.target.value)} placeholder={hi ? 'AWB / LR नंबर, जैसे SL4021395877' : 'AWB / LR number, e.g. SL4021395877'} className="h-11" />
          <Button variant="primary" type="submit" className="h-11">
            <Search size={17} /> {hi ? 'खोजें' : 'Track'}
          </Button>
        </form>

        {loading && <Loading label="Finding your shipment" />}
        {error && (
          <div className="mt-4">
            <ErrorNote>{error}. Check the number on your receipt or SMS.</ErrorNote>
          </div>
        )}

        {data && (
          <div className="mt-6 space-y-5">
            <section className="panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="awb text-[14px] text-muted">{data.awb}</p>
                  <h2 className="mt-1 text-[26px] font-bold">{data.statusLabel}</h2>
                  <p className="text-[15px] text-muted">
                    {data.originCity} → {data.destCity} · {data.packages} {hi ? 'पैकेट' : data.packages === 1 ? 'package' : 'packages'} · {kg(data.weightKg)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[13.5px] text-muted">{data.deliveredAt ? (hi ? 'डिलीवर हुआ' : 'Delivered on') : hi ? 'पहुँचने का समय' : 'Expected by'}</p>
                  <p className="num font-display text-[22px] font-bold">{dt(data.deliveredAt ?? data.etaAt)}</p>
                  {data.receivedBy && <p className="text-[13.5px] text-muted">{hi ? 'प्राप्तकर्ता' : 'Received by'} {data.receivedBy}</p>}
                </div>
              </div>
              {failed ? (
                <p className="mt-4">
                  <Badge tone="warn">{data.statusLabel}</Badge> <span className="text-[14px] text-muted">{hi ? 'हमारी टीम आपसे संपर्क करेगी।' : 'Our team will contact you to arrange the next attempt.'}</span>
                </p>
              ) : (
                <ol className="mt-5 grid grid-cols-5 gap-1">
                  {STEPS.map((s, i) => (
                    <li key={s.key} className="min-w-0">
                      <div className="h-1.5 rounded-full" style={{ background: i <= step ? 'var(--route)' : 'var(--line)' }} />
                      <p className={`mt-1.5 truncate text-[12.5px] ${i <= step ? 'font-medium' : 'text-muted'}`}>{hi ? s.hi : s.en}</p>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="panel p-2">
              <NetworkMap
                compact
                height={280}
                trips={[{ id: 't', tripNo: data.awb, from: [data.origin.lat, data.origin.lng], to: [data.destination.lat, data.destination.lng], at: [data.current.lat, data.current.lng], late: false, vehicleId: 'v', originCity: data.originCity, destCity: data.destCity }]}
                vehicles={[{ id: 'v', regNo: data.awb, lat: data.current.lat, lng: data.current.lng, status: data.deliveredAt ? 'IDLE' : 'ON_TRIP', city: '' }]}
              />
            </section>

            <section className="panel p-5">
              <h3 className="mb-3 text-[18px] font-semibold">{hi ? 'पूरी जानकारी' : 'Shipment history'}</h3>
              <ol className="space-y-3">
                {data.events.map((e, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: i === 0 ? 'var(--accent)' : 'var(--route)' }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="font-medium">{e.label}</span>
                        <span className="text-[13px] text-muted">{dt(e.at)}</span>
                      </div>
                      <p className="text-[14px] text-muted">
                        {e.note}
                        {e.city ? ` · ${e.city}` : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-4 flex items-center gap-2 text-[13px] text-muted">
                <Leaf size={15} className="text-good" /> {hi ? 'अनुमानित कार्बन' : 'Estimated carbon for this shipment'}: {data.co2Kg.toLocaleString('en-IN')} kg CO₂
              </p>
            </section>
            <p className="text-[13px] text-muted">{hi ? 'डिलीवरी के समय OTP सिर्फ़ डिलीवरी पार्टनर को सामान मिलने पर ही बताएं।' : 'Share your delivery OTP only when the parcel is in your hands.'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
