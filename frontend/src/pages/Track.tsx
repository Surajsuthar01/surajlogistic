import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { SiteNav } from '../components/Site';
import { ThemeToggle } from '../lib/theme';
import { NetworkMap } from '../components/NetworkMap';
import { Button, ErrorNote, Field, Input, Loading, Note } from '../components/ui';
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
  carrier?: { name: string; phone: string | null };
  canReschedule?: boolean;
  events: { status: string; label: string; note: string; city: string | null; at: string }[];
}

const STEPS = [
  { key: 'BOOKED', en: 'Booked', hi: 'बुक हुआ' },
  { key: 'PICKED_UP', en: 'Picked up', hi: 'उठा लिया' },
  { key: 'IN_TRANSIT', en: 'On the way', hi: 'रास्ते में' },
  { key: 'OUT_FOR_DELIVERY', en: 'Out for delivery', hi: 'डिलीवरी पर' },
  { key: 'DELIVERED', en: 'Delivered', hi: 'पहुँच गया' },
];
const ORDER: Record<string, number> = { REQUESTED: 0, BOOKED: 0, PICKED_UP: 1, IN_TRANSIT: 2, AT_HUB: 2, OUT_FOR_DELIVERY: 3, NDR: 3, DELIVERED: 4, RTO: 3, RTO_DELIVERED: 4, CANCELLED: 0 };
const HEAD_HI: Record<string, string> = {
  REQUESTED: 'बुकिंग की पुष्टि बाकी है',
  BOOKED: 'बुक हो गया है',
  PICKED_UP: 'सामान उठा लिया गया है',
  IN_TRANSIT: 'रास्ते में है',
  AT_HUB: 'हब पर पहुँचा',
  OUT_FOR_DELIVERY: 'आज डिलीवरी के लिए निकला है',
  DELIVERED: 'डिलीवर हो गया',
  NDR: 'डिलीवरी नहीं हो पाई',
  RTO: 'भेजने वाले को वापस जा रहा है',
  RTO_DELIVERED: 'भेजने वाले को लौटा दिया गया',
  CANCELLED: 'बुकिंग रद्द हुई',
};

export function Track() {
  const { awb } = useParams();
  const nav = useNavigate();
  const [q, setQ] = useState(awb ?? '');
  const [data, setData] = useState<TrackResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hi, setHi] = useState(() => typeof navigator !== 'undefined' && navigator.language?.startsWith('hi'));

  const load = (code: string) => {
    setLoading(true);
    setError(null);
    api
      .get<TrackResp>(`/api/track/${encodeURIComponent(code)}`)
      .then(setData)
      .catch((e) => {
        setData(null);
        setError(errorText(e));
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    if (awb) load(awb);
  }, [awb]);

  const step = data ? (ORDER[data.status] ?? 0) : 0;
  const failed = data && ['NDR', 'RTO', 'RTO_DELIVERED', 'CANCELLED'].includes(data.status);
  const t = (en: string, h: string) => (hi ? h : en);

  return (
    <div className="min-h-full" style={{ paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))', paddingRight: 'max(16px, env(safe-area-inset-right, 0px))' }}>
      <SiteNav />
      <div className="mx-auto max-w-[760px] pt-[96px] pb-10">
        <div className="mb-6 flex items-center justify-between gap-3">
          <p className="eyebrow">{t('Track a shipment', 'सामान ट्रैक करें')}</p>
          <span className="flex items-center gap-1">
            <ThemeToggle />
            <button type="button" onClick={() => setHi(!hi)} className="h-9 rounded-full border border-line-strong bg-sheet px-3.5 text-[14.5px] hover:bg-sheet-2" lang={hi ? 'en' : 'hi'}>
              {hi ? 'English' : 'हिंदी'}
            </button>
          </span>
        </div>
        <h1 className="t-title">{t('Where is my parcel?', 'मेरा सामान कहाँ है?')}</h1>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) nav(`/track/${q.trim().toUpperCase()}`);
          }}
        >
          <Input id="track-awb" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Tracking number, like SL4021395877', 'ट्रैकिंग नंबर, जैसे SL4021395877')} className="!h-12 text-[17px]" aria-label={t('Tracking number', 'ट्रैकिंग नंबर')} />
          <Button variant="primary" size="lg" type="submit">
            <Search size={18} /> {t('Track', 'खोजें')}
          </Button>
        </form>

        {!awb && (
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              { h: t('Where to find it', 'नंबर कहाँ मिलेगा'), p: t('In the WhatsApp or SMS from the sender, or on the label. It starts with SL and has 11 digits.', 'भेजने वाले के WhatsApp या SMS में, या पार्सल के लेबल पर। SL से शुरू होता है, 11 अंक।') },
              { h: t('Not at home?', 'घर पर नहीं हैं?'), p: t('If a delivery fails, pick another day right here. You will need the last 4 digits of your mobile.', 'डिलीवरी न हो पाए तो यहीं दूसरा दिन चुनें। आपके मोबाइल के आख़िरी 4 अंक लगेंगे।') },
              { h: t('At the door', 'दरवाज़े पर'), p: t('Share the 4-digit OTP only when you have the parcel in your hands.', '4 अंकों का OTP सामान हाथ में आने पर ही बताएँ।') },
            ].map((x) => (
              <div key={x.h} className="sheet px-4 py-3.5">
                <h2 className="t-sub">{x.h}</h2>
                <p className="mt-1 text-[14px] leading-snug text-muted">{x.p}</p>
              </div>
            ))}
          </div>
        )}

        {loading && <Loading rows={3} label="Finding your shipment" />}
        {error && (
          <div className="mt-4">
            <ErrorNote>
              {error}. {t('Check the number on your receipt or the WhatsApp message.', 'रसीद या WhatsApp संदेश में नंबर देखें।')}
            </ErrorNote>
          </div>
        )}

        {data && (
          <div className="mt-8 space-y-6">
            <section>
              <p className="awb text-[15px] text-muted">{data.awb}</p>
              <h2 className="mt-2 font-display tracking-[-0.035em] text-[46px] leading-none font-[600]">
                {hi ? HEAD_HI[data.status] ?? data.statusLabel : data.statusLabel}
              </h2>
              <p className="mt-1.5 text-[16px] text-muted">
                {t(`From ${data.originCity} to ${data.destCity}`, `${data.originCity} से ${data.destCity}`)}, {data.packages} {t(data.packages === 1 ? 'package' : 'packages', 'पैकेट')}, {kg(data.weightKg)}
              </p>
              <div className="mt-5 flex flex-wrap items-end gap-x-10 gap-y-3">
                <div>
                  <p className="text-[14px] text-muted">{data.deliveredAt ? t('Delivered on', 'डिलीवर हुआ') : t('Expected by', 'पहुँचने का समय')}</p>
                  <p className="t-fig mt-1 text-[36px]">{dt(data.deliveredAt ?? data.etaAt)}</p>
                </div>
                {data.receivedBy && (
                  <div>
                    <p className="text-[14px] text-muted">{t('Received by', 'किसने लिया')}</p>
                    <p className="mt-1 text-[18px] font-[600]">{data.receivedBy}</p>
                  </div>
                )}
              </div>
              {data.status === 'REQUESTED' && (
                <div className="mt-5">
                  <Note>{t(`This booking was requested on the website and is waiting for ${data.carrier?.name ?? 'Suraj Logistic'} to confirm it. We call the sender first; the receiver gets a WhatsApp once it is confirmed.`, `यह बुकिंग वेबसाइट से माँगी गई है और ${data.carrier?.name ?? 'Suraj Logistic'} की पुष्टि बाकी है। हम पहले भेजने वाले को फ़ोन करेंगे; पुष्टि होते ही लेने वाले को WhatsApp आएगा।`)}</Note>
                </div>
              )}
              {failed ? (
                <div className="mt-5">
                  <Note tone="warn">{data.status === 'NDR' ? t('We could not deliver it. Pick a new day below, or our team will call you.', 'डिलीवरी नहीं हो पाई। नीचे नया दिन चुनें, या हमारी टीम आपको फ़ोन करेगी।') : t('Please call us if you were expecting this parcel.', 'अगर आप यह सामान चाहते थे तो हमें फ़ोन करें।')}</Note>
                </div>
              ) : (
                <ol className="mt-6 grid grid-cols-5 gap-1.5" aria-label={t('Progress', 'प्रगति')}>
                  {STEPS.map((s, i) => (
                    <li key={s.key} className="min-w-0">
                      <div className="h-2 rounded-full" style={{ background: i <= step ? 'var(--go)' : 'var(--line)' }} />
                      <p className={`mt-1.5 truncate text-[13.5px] ${i <= step ? 'font-[600]' : 'text-muted'}`}>{hi ? s.hi : s.en}</p>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {data.canReschedule && <Reschedule awb={data.awb} hi={hi} onDone={() => load(data.awb)} />}

            <NetworkMap
              compact
              height={280}
              trips={[{ id: 't', tripNo: data.awb, from: [data.origin.lat, data.origin.lng], to: [data.destination.lat, data.destination.lng], at: [data.current.lat, data.current.lng], late: false, vehicleId: 'v', originCity: data.originCity, destCity: data.destCity }]}
              vehicles={[{ id: 'v', regNo: data.awb, lat: data.current.lat, lng: data.current.lng, status: data.deliveredAt ? 'IDLE' : 'ON_TRIP', city: '' }]}
            />

            <section>
              <h3 className="t-sub mb-3">{t('History', 'पूरी जानकारी')}</h3>
              <ol className="relative ml-1.5 border-l-2 border-line">
                {data.events.map((e, i) => (
                  <li key={i} className="relative pb-4 pl-5 last:pb-0">
                    <span className={`absolute top-[7px] -left-[7px] h-3 w-3 rounded-full border-2 border-ground ${i === 0 ? 'bg-plate' : 'bg-go'}`} />
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="font-[560]">{hi ? HEAD_HI[e.status] ?? e.label : e.label}</span>
                      <span className="num text-[13.5px] text-muted">{dt(e.at)}</span>
                    </div>
                    {e.city && <p className="text-[14.5px] text-muted">{e.city}</p>}
                  </li>
                ))}
              </ol>
            </section>
            <div className="space-y-1.5 border-t border-line pt-4 text-[14px] text-muted">
              <p>{t('Share your delivery OTP only when the parcel is in your hands.', 'डिलीवरी का OTP तभी बताएं जब सामान आपके हाथ में हो।')}</p>
              {data.carrier && (
                <p>
                  {t('Carried by', 'भेजने वाली कंपनी')} {data.carrier.name}
                  {data.carrier.phone && (
                    <>
                      {', '}
                      <a href={`tel:${data.carrier.phone}`} className="underline underline-offset-2">
                        {data.carrier.phone}
                      </a>
                    </>
                  )}
                  .
                </p>
              )}
              <p>{t(`About ${data.co2Kg.toLocaleString('en-IN')} kg of CO₂ for this shipment.`, `इस शिपमेंट का अनुमानित कार्बन: ${data.co2Kg.toLocaleString('en-IN')} kg CO₂`)}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Reschedule({ awb, hi, onDone }: { awb: string; hi: boolean; onDone: () => void }) {
  const t = (en: string, h: string) => (hi ? h : en);
  const tomorrow = new Date(Date.now() + 86400_000 + 5.5 * 3600_000).toISOString().slice(0, 10);
  const [f, setF] = useState({ last4: '', date: tomorrow, address: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  if (done) return <Note tone="go">{t('Thank you. We will deliver on the day you picked.', 'धन्यवाद। आपके चुने दिन पर डिलीवरी होगी।')}</Note>;
  return (
    <form
      className="sheet space-y-3 px-4 py-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          await api.post(`/api/track/${awb}/reschedule`, { phoneLast4: f.last4, date: f.date, address: f.address || undefined });
          setDone(true);
          onDone();
        } catch (x) {
          setErr(errorText(x));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3 className="t-sub">{t('Not at home? Pick another day', 'घर पर नहीं हैं? दूसरा दिन चुनें')}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('Last 4 digits of your mobile', 'आपके मोबाइल के आख़िरी 4 अंक')} htmlFor="rs-last4">
          <Input id="rs-last4" inputMode="numeric" maxLength={4} value={f.last4} onChange={(e) => setF({ ...f, last4: e.target.value.replace(/\D/g, '') })} required />
        </Field>
        <Field label={t('Deliver on', 'डिलीवरी का दिन')} htmlFor="rs-date">
          <Input id="rs-date" type="date" min={tomorrow} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required />
        </Field>
        <Field label={t('Better address or landmark (optional)', 'बेहतर पता या निशानी (अगर चाहें)')} htmlFor="rs-addr" className="sm:col-span-2">
          <Input id="rs-addr" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
        </Field>
      </div>
      <ErrorNote>{err}</ErrorNote>
      <Button variant="primary" type="submit" disabled={busy || f.last4.length !== 4}>
        {t('Save', 'सेव करें')}
      </Button>
    </form>
  );
}
