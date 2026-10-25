import { findCity, STATUS_LABEL, STATUS_LABEL_HI, type ShipmentStatus, type TripRec, type VehicleRec } from '@suraj/shared';
import { Camera, LocateFixed, LogOut, MapPin, Navigation, Phone, Plus, WifiOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Mark, Wordmark } from '../components/Brand';
import { SignaturePad } from '../components/SignaturePad';
import { Button, ErrorNote, Field, Input, Loading, Modal, Plate, Progress, Select, useToast } from '../components/ui';
import { api, DEMO, subscribe } from '../lib/api';
import { ThemeToggle } from '../lib/theme';
import { useAuth } from '../lib/auth';
import { dt, inr, kg } from '../lib/format';
import { useAction, useApi } from '../lib/hooks';
import { fileToDataUrl } from '../lib/image';

interface Stop {
  id: string;
  awb: string;
  service: string;
  status: ShipmentStatus;
  consigneeName: string;
  consigneePhone: string;
  consigneeAddress: string;
  destCity: string;
  paymentMode: string;
  codAmount: number;
  packages: number;
  weightKg: number;
  nextStatuses: ShipmentStatus[];
}
interface Expense {
  id: string;
  kind: string;
  amount: number;
  note: string | null;
  at: string;
}
interface DriverMe {
  driver: { name: string; lang: 'en' | 'hi'; rating: number };
  activeTrip: TripRec | null;
  vehicle: VehicleRec | null;
  stops: Stop[];
  expenses?: Expense[];
  history: { id: string; tripNo: string; lane: string; km: number; completedAt: string; advance: number }[];
  stats: { tripsDone: number; kmDriven: number; rating: number };
  demoOtps?: Record<string, string>;
}

const T = {
  en: {
    trip: "Today's trip", none: 'No trip yet. Your dispatcher will assign one and it shows up here.', start: 'Start trip', reached: 'I have reached', share: 'Share live location', sharing: 'Location is going to the office', stops: 'Deliveries on this truck', ofd: 'Out for delivery', deliver: 'Delivered', fail: 'Could not deliver', otp: 'Ask the receiver for the 4-digit OTP', confirm: 'Confirm delivery', collect: 'Collect', eta: 'Reach by', covered: 'done', done: 'Trips done', km: 'km driven', rating: 'Rating', logout: 'Log out', advance: 'Advance received', call: 'Call', map: 'Map', photo: 'Photo of the goods', sign: 'Receiver signs here', why: 'What happened?', save: 'Save', expenses: 'Spent on this trip', addExp: 'Add expense', amount: 'Amount (₹)', kind: 'For', offline: 'No internet. Keep the app open; it will send when the signal returns.', cashTaken: 'I have collected the cash', past: 'Past trips', note: 'Note (optional)',
  },
  hi: {
    trip: 'आज की ट्रिप', none: 'अभी कोई ट्रिप नहीं है। डिस्पैचर ट्रिप देंगे तो यहाँ दिखेगी।', start: 'ट्रिप शुरू करें', reached: 'मैं पहुँच गया', share: 'लाइव लोकेशन भेजें', sharing: 'लोकेशन ऑफ़िस जा रही है', stops: 'इस गाड़ी की डिलीवरी', ofd: 'डिलीवरी के लिए निकला', deliver: 'डिलीवर हुआ', fail: 'डिलीवरी नहीं हुई', otp: 'लेने वाले से 4 अंकों का OTP पूछें', confirm: 'डिलीवरी पक्की करें', collect: 'वसूलें', eta: 'पहुँचना है', covered: 'पूरा', done: 'ट्रिप पूरी', km: 'किमी चलाया', rating: 'रेटिंग', logout: 'लॉग आउट', advance: 'एडवांस मिला', call: 'फ़ोन', map: 'नक्शा', photo: 'सामान की फ़ोटो', sign: 'लेने वाले के दस्तख़त', why: 'क्या हुआ?', save: 'सेव करें', expenses: 'इस ट्रिप का खर्चा', addExp: 'खर्चा लिखें', amount: 'रकम (₹)', kind: 'किस चीज़ का', offline: 'इंटरनेट नहीं है। ऐप खुला रखें, नेटवर्क आते ही भेज देंगे।', cashTaken: 'मैंने पैसे ले लिए', past: 'पुरानी ट्रिप', note: 'नोट (अगर चाहें)',
  },
};

const NDR_REASONS = [
  { en: 'Receiver not at home', hi: 'लेने वाला घर पर नहीं था' },
  { en: 'Phone switched off or not answering', hi: 'फ़ोन बंद या उठा नहीं' },
  { en: 'Address wrong or incomplete', hi: 'पता गलत या अधूरा' },
  { en: 'Receiver refused the parcel', hi: 'लेने से मना किया' },
  { en: 'Cash not ready for COD', hi: 'COD के पैसे तैयार नहीं थे' },
];
const EXPENSES = [
  { v: 'DIESEL', en: 'Diesel', hi: 'डीज़ल' },
  { v: 'TOLL', en: 'Toll', hi: 'टोल' },
  { v: 'FOOD', en: 'Food', hi: 'खाना' },
  { v: 'REPAIR', en: 'Repair or puncture', hi: 'रिपेयर या पंक्चर' },
  { v: 'LOADING', en: 'Loading or unloading', hi: 'लोडिंग-अनलोडिंग' },
  { v: 'OTHER', en: 'Other', hi: 'और कुछ' },
];

function useOnline() {
  const [on, setOn] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true);
    const down = () => setOn(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => (window.removeEventListener('online', up), window.removeEventListener('offline', down));
  }, []);
  return on;
}

export function DriverApp() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const { data, reload } = useApi<DriverMe>('/api/driver/me', { liveTypes: ['trip.status', 'shipment.status'] });
  const [lang, setLang] = useState<'en' | 'hi'>('hi');
  const [deliverFor, setDeliverFor] = useState<Stop | null>(null);
  const [failFor, setFailFor] = useState<Stop | null>(null);
  const [expense, setExpense] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const watch = useRef<number | null>(null);
  const act = useAction();
  const online = useOnline();
  const t = T[lang];
  const cityName = (n: string) => (lang === 'hi' ? (findCity(n)?.hi ?? n) : n);

  useEffect(() => {
    if (data?.driver.lang) setLang(data.driver.lang);
  }, [data?.driver.lang]);
  useEffect(() => subscribe((e) => e.type === 'trip.ping' && e.payload.id === data?.activeTrip?.id && void reload()), [data?.activeTrip?.id, reload]);
  useEffect(
    () => () => {
      if (watch.current !== null) navigator.geolocation?.clearWatch(watch.current);
    },
    [],
  );

  const trip = data?.activeTrip;
  const label = (s: ShipmentStatus) => (lang === 'hi' ? STATUS_LABEL_HI[s] : STATUS_LABEL[s]);

  const share = () => {
    if (!trip) return;
    if (DEMO) {
      setSharing(true);
      setGeoErr(lang === 'hi' ? 'डेमो: GPS सिम्युलेटर गाड़ी चला रहा है।' : 'Demo: the GPS simulator is moving the truck for you.');
      return;
    }
    if (!navigator.geolocation) return setGeoErr(lang === 'hi' ? 'यह फ़ोन लोकेशन नहीं भेज सकता।' : 'This phone cannot share location.');
    watch.current = navigator.geolocation.watchPosition(
      (p) => {
        setSharing(true);
        setGeoErr(null);
        void api.post(`/api/trips/${trip.id}/ping`, { lat: p.coords.latitude, lng: p.coords.longitude, speedKmph: Math.round((p.coords.speed ?? 0) * 3.6) }).catch(() => undefined);
      },
      () => setGeoErr(lang === 'hi' ? 'फ़ोन की सेटिंग में लोकेशन की अनुमति दें।' : 'Allow location for this app in your phone settings.'),
      { enableHighAccuracy: true, maximumAge: 60_000 },
    );
  };

  const move = (s: Stop, status: ShipmentStatus, note?: string) => act.run(async () => (await api.post(`/api/shipments/${s.id}/status`, { status, ...(note ? { note } : {}) }), await reload()));
  const expTotal = (data?.expenses ?? []).reduce((a, e) => a + e.amount, 0);

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-20 px-3 pb-2" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)' }}>
        <div className="island mx-auto flex h-[54px] max-w-[520px] items-center justify-between gap-2 pr-2 pl-3.5">
          <span className="flex min-w-0 items-center gap-2.5 text-white">
            <Mark size={28} />
            <span className="flex min-w-0 flex-col gap-[3px]">
              <Wordmark size={16} />
              <span className="truncate text-[12px] leading-none text-white/60">{(user?.name ?? data?.driver.name ?? '').split(' ')[0]}</span>
            </span>
          </span>
          <div className="flex items-center gap-1">
            <ThemeToggle className="!h-9 !w-9 !rounded-full !text-white/80 hover:!bg-white/10 hover:!text-white" />
            <button type="button" onClick={() => setLang(lang === 'hi' ? 'en' : 'hi')} className="h-9 rounded-full bg-white/10 px-3.5 text-[14px] font-[540] text-white hover:bg-white/15" lang={lang === 'hi' ? 'en' : 'hi'}>
              {lang === 'hi' ? 'English' : 'हिंदी'}
            </button>
            <button type="button" onClick={logout} aria-label={t.logout} className="island-icon">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>
      {!online && (
        <p className="flex items-center gap-2 bg-warn-soft px-4 py-2 text-[14.5px]">
          <WifiOff size={16} className="shrink-0 text-warn" /> {t.offline}
        </p>
      )}

      <div className="mx-auto max-w-[520px] pt-4 pb-10" style={{ paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))', paddingRight: 'max(16px, env(safe-area-inset-right, 0px))' }}>
        {!data ? (
          <Loading />
        ) : (
          <>
            <section className="sheet overflow-hidden">
              <div className="px-4 pt-4 pb-4">
                <p className="text-[14.5px] text-muted">{t.trip}</p>
                {!trip ? (
                  <p className="mt-2 text-[17px] leading-snug">{t.none}</p>
                ) : (
                  <>
                    <h1 className="mt-1 text-[30px] leading-[1.1] font-[700]" style={{ fontStretch: '104%' }}>
                      {cityName(trip.originCity)} <span className="text-faint">–</span> {cityName(trip.destCity)}
                    </h1>
                    <div className="mt-2 flex flex-wrap items-center gap-2.5 text-[15px] text-muted">
                      {data.vehicle && <Plate reg={data.vehicle.regNo} size={15} />}
                      <span>{trip.tripNo}</span>
                    </div>
                    <div className="mt-4">
                      <Progress value={trip.progress * 100} height={10} />
                    </div>
                    <div className="mt-1.5 flex justify-between text-[15px]">
                      <span className="num">
                        {Math.round(trip.progress * 100)}% {t.covered}
                      </span>
                      <span className="num">
                        {t.eta} {dt(trip.etaAt)}
                      </span>
                    </div>
                  </>
                )}
              </div>
              {trip && (
                <div className="grid gap-2 border-t border-line bg-sheet-2 px-4 py-3">
                  {trip.status === 'PLANNED' && (
                    <Button variant="primary" size="lg" disabled={act.busy} onClick={() => act.run(async () => (await api.post(`/api/trips/${trip.id}/start`), await reload(), toast(lang === 'hi' ? 'ट्रिप शुरू' : 'Trip started')))}>
                      {t.start}
                    </Button>
                  )}
                  {trip.status === 'IN_TRANSIT' && (
                    <>
                      <Button size="lg" onClick={share} disabled={sharing}>
                        <LocateFixed size={19} className={sharing ? 'text-go' : ''} /> {sharing ? t.sharing : t.share}
                      </Button>
                      <Button variant="primary" size="lg" disabled={act.busy} onClick={() => act.run(async () => (await api.post(`/api/trips/${trip.id}/complete`, {}), await reload(), toast(lang === 'hi' ? 'ट्रिप पूरी' : 'Trip finished')))}>
                        <MapPin size={19} /> {t.reached} {cityName(trip.destCity)}
                      </Button>
                    </>
                  )}
                  {geoErr && <p className="text-[14px] text-muted">{geoErr}</p>}
                  <p className="text-[14.5px] text-muted">
                    {t.advance}: <span className="num text-ink">{inr(trip.driverAdvance)}</span>
                  </p>
                </div>
              )}
            </section>
            <ErrorNote>{act.error}</ErrorNote>

            {data.stops.length > 0 && (
              <section className="mt-6">
                <h2 className="t-head mb-2.5">
                  {t.stops} <span className="num text-muted">{data.stops.length}</span>
                </h2>
                <ul className="space-y-3">
                  {data.stops.map((s) => (
                    <li key={s.id} className="sheet overflow-hidden">
                      <div className="px-4 pt-3.5 pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="awb text-[14px] text-muted">{s.awb}</p>
                          <span className={`text-[14px] font-[560] ${s.status === 'NDR' ? 'text-warn' : 'text-go'}`}>{label(s.status)}</span>
                        </div>
                        <p className="mt-0.5 text-[19px] font-[620]">{s.consigneeName}</p>
                        <p className="text-[15px] leading-snug text-muted">{s.consigneeAddress}</p>
                        <p className="mt-1.5 text-[14.5px] text-muted">
                          {s.packages} {lang === 'hi' ? 'पैकेट' : s.packages === 1 ? 'package' : 'packages'}, {kg(s.weightKg)}
                        </p>
                        {s.paymentMode === 'COD' && (
                          <p className="mt-2 inline-flex rounded-[6px] bg-plate px-2.5 py-1 text-[16px] font-[650] text-plate-ink">
                            {t.collect} {inr(s.codAmount)}
                          </p>
                        )}
                      </div>
                      <div className="grid grid-cols-2 border-t border-line">
                        <a href={`tel:${s.consigneePhone}`} className="flex h-12 items-center justify-center gap-2 border-r border-line text-[15.5px] font-[560] active:bg-sheet-2">
                          <Phone size={17} /> {t.call}
                        </a>
                        <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.consigneeAddress}, ${s.destCity}`)}`} target="_blank" rel="noreferrer" className="flex h-12 items-center justify-center gap-2 text-[15.5px] font-[560] active:bg-sheet-2">
                          <Navigation size={17} /> {t.map}
                        </a>
                      </div>
                      {(s.nextStatuses.includes('OUT_FOR_DELIVERY') || s.nextStatuses.includes('DELIVERED') || s.nextStatuses.includes('NDR')) && (
                        <div className="grid gap-2 border-t border-line bg-sheet-2 px-4 py-3">
                          {s.nextStatuses.includes('OUT_FOR_DELIVERY') && (
                            <Button size="lg" disabled={act.busy} onClick={() => move(s, 'OUT_FOR_DELIVERY')}>
                              {t.ofd}
                            </Button>
                          )}
                          <div className="grid grid-cols-2 gap-2">
                            {s.nextStatuses.includes('DELIVERED') && (
                              <Button variant="primary" size="lg" onClick={() => setDeliverFor(s)}>
                                {t.deliver}
                              </Button>
                            )}
                            {s.nextStatuses.includes('NDR') && (
                              <Button size="lg" disabled={act.busy} onClick={() => setFailFor(s)}>
                                {t.fail}
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {trip && (
              <section className="mt-6">
                <div className="mb-2.5 flex items-center justify-between">
                  <h2 className="t-head">{t.expenses}</h2>
                  <Button size="sm" onClick={() => setExpense(true)}>
                    <Plus size={15} /> {t.addExp}
                  </Button>
                </div>
                {(data.expenses ?? []).length === 0 ? (
                  <p className="text-[15px] text-muted">{lang === 'hi' ? 'डीज़ल, टोल या खाने का खर्चा यहाँ लिखें, पर्ची की फ़ोटो के साथ।' : 'Write down diesel, toll and food spends here, with a photo of the slip.'}</p>
                ) : (
                  <ul className="sheet divide-y divide-line">
                    {data.expenses!.map((e) => (
                      <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <span>
                          <span className="block text-[15.5px]">{EXPENSES.find((x) => x.v === e.kind)?.[lang] ?? e.kind}</span>
                          <span className="block text-[13.5px] text-muted">
                            {dt(e.at)}
                            {e.note ? `, ${e.note}` : ''}
                          </span>
                        </span>
                        <span className="num font-[600]">{inr(e.amount)}</span>
                      </li>
                    ))}
                    <li className="flex justify-between px-4 py-2.5 text-[15px]">
                      <span className="text-muted">{lang === 'hi' ? 'कुल' : 'Total'}</span>
                      <span className="num font-[650]">{inr(expTotal)}</span>
                    </li>
                  </ul>
                )}
              </section>
            )}

            <section className="mt-6 grid grid-cols-3 gap-4 border-t border-line pt-4 text-center">
              {[
                [data.stats.tripsDone, t.done],
                [data.stats.kmDriven.toLocaleString('en-IN'), t.km],
                [data.stats.rating.toFixed(1), t.rating],
              ].map(([v, l]) => (
                <div key={String(l)}>
                  <div className="t-fig text-[28px]">{v}</div>
                  <div className="mt-1 text-[13.5px] text-muted">{l}</div>
                </div>
              ))}
            </section>
            {data.history.length > 0 && (
              <section className="mt-6">
                <h2 className="t-sub mb-2">{t.past}</h2>
                <ul className="sheet divide-y divide-line text-[15px]">
                  {data.history.slice(0, 5).map((h) => (
                    <li key={h.id} className="flex justify-between gap-3 px-4 py-2.5">
                      <span>
                        {h.lane}
                        <span className="block text-[13.5px] text-muted">{dt(h.completedAt)}</span>
                      </span>
                      <span className="num text-muted">{h.km.toLocaleString('en-IN')} km</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>

      <DeliverSheet stop={deliverFor} lang={lang} demoOtp={deliverFor ? data?.demoOtps?.[deliverFor.id] : undefined} onClose={() => setDeliverFor(null)} onDone={async () => (setDeliverFor(null), await reload(), toast(lang === 'hi' ? 'डिलीवरी हो गई' : 'Delivered'))} />
      <Modal open={!!failFor} onClose={() => setFailFor(null)} title={t.why}>
        <ul className="grid gap-2">
          {NDR_REASONS.map((r) => (
            <li key={r.en}>
              <button type="button" disabled={act.busy} onClick={() => failFor && void move(failFor, 'NDR', r.en).then(() => (setFailFor(null), toast(lang === 'hi' ? 'ऑफ़िस को बता दिया' : 'Office informed')))} className="w-full rounded-[14px] border border-line-strong bg-sheet px-4 py-3.5 text-left text-[16px] active:bg-sheet-2">
                {r[lang]}
              </button>
            </li>
          ))}
        </ul>
      </Modal>
      {trip && <ExpenseSheet open={expense} tripId={trip.id} lang={lang} onClose={() => setExpense(false)} onDone={async () => (setExpense(false), await reload(), toast(lang === 'hi' ? 'खर्चा लिख लिया' : 'Expense saved'))} />}
    </div>
  );
}

function DeliverSheet({ stop, lang, demoOtp, onClose, onDone }: { stop: Stop | null; lang: 'en' | 'hi'; demoOtp?: string; onClose: () => void; onDone: () => void }) {
  const t = T[lang];
  const [otp, setOtp] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [sign, setSign] = useState<string | null>(null);
  const [cash, setCash] = useState(false);
  const act = useAction();
  useEffect(() => {
    setOtp('');
    setPhoto(null);
    setSign(null);
    setCash(false);
  }, [stop?.id]);
  if (!stop) return null;
  const cod = stop.paymentMode === 'COD';
  return (
    <Modal
      open
      onClose={onClose}
      title={stop.consigneeName}
      footer={
        <Button variant="primary" size="lg" type="submit" form="deliver-sheet" className="w-full" disabled={act.busy || otp.length < 4 || (cod && !cash)}>
          {t.confirm}
        </Button>
      }
    >
      <form
        id="deliver-sheet"
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void act.run(async () => {
            await api.post(`/api/shipments/${stop.id}/status`, { status: 'DELIVERED', otp });
            if (photo || sign) await api.post(`/api/shipments/${stop.id}/pod`, { ...(photo ? { photo } : {}), ...(sign ? { signature: sign } : {}) });
            onDone();
          });
        }}
      >
        <Field label={t.otp} htmlFor="drv-otp">
          <Input id="drv-otp" inputMode="numeric" autoComplete="one-time-code" maxLength={4} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} className="t-fig !h-14 text-center !text-[30px] tracking-[0.5em]" required />
        </Field>
        {DEMO && demoOtp && <p className="rounded-[12px] bg-sheet-2 px-3 py-2 text-[14px]">Demo: the receiver reads out {demoOtp}.</p>}
        {cod && (
          <label className="flex items-center gap-3 rounded-[14px] bg-plate-soft px-3 py-3">
            <input type="checkbox" checked={cash} onChange={(e) => setCash(e.target.checked)} className="h-5 w-5 accent-[var(--sign)]" />
            <span className="text-[16px] font-[600]">
              {t.cashTaken}: {inr(stop.codAmount)}
            </span>
          </label>
        )}
        <div>
          <p className="mb-1.5 text-[14.5px] font-[560]">{t.photo}</p>
          <label className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-[14px] border border-line-strong bg-sheet text-[15.5px] font-[560]">
            <Camera size={18} /> {photo ? (lang === 'hi' ? 'दूसरी फ़ोटो लें' : 'Take another') : lang === 'hi' ? 'फ़ोटो लें' : 'Take photo'}
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={async (e) => setPhoto(e.target.files?.[0] ? await fileToDataUrl(e.target.files[0]) : null)} />
          </label>
          {photo && <img src={photo} alt="" className="mt-2 h-32 rounded-[12px] border border-line object-cover" />}
        </div>
        <div>
          <p className="mb-1.5 text-[14.5px] font-[560]">{t.sign}</p>
          <SignaturePad onChange={setSign} label={lang === 'hi' ? 'यहाँ उँगली से दस्तख़त करें' : 'Sign here with a finger'} />
        </div>
        <ErrorNote>{act.error}</ErrorNote>
      </form>
    </Modal>
  );
}

function ExpenseSheet({ open, tripId, lang, onClose, onDone }: { open: boolean; tripId: string; lang: 'en' | 'hi'; onClose: () => void; onDone: () => void }) {
  const t = T[lang];
  const [f, setF] = useState({ kind: 'DIESEL', amount: '', note: '' });
  const [photo, setPhoto] = useState<string | null>(null);
  const act = useAction();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.addExp}
      footer={
        <Button variant="primary" size="lg" type="submit" form="exp-form" className="w-full" disabled={act.busy || !f.amount}>
          {t.save}
        </Button>
      }
    >
      <form
        id="exp-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void act.run(async () => {
            await api.post(`/api/trips/${tripId}/expenses`, { kind: f.kind, amount: Number(f.amount), note: f.note || undefined, ...(photo ? { photo } : {}) });
            setF({ kind: 'DIESEL', amount: '', note: '' });
            setPhoto(null);
            onDone();
          });
        }}
      >
        <Field label={t.kind} htmlFor="exp-kind">
          <Select id="exp-kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} className="!h-12 text-[16px]">
            {EXPENSES.map((x) => (
              <option key={x.v} value={x.v}>
                {x[lang]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.amount} htmlFor="exp-amt">
          <Input id="exp-amt" type="number" inputMode="numeric" min="1" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} className="t-fig !h-12 !text-[22px]" required />
        </Field>
        <Field label={t.note} htmlFor="exp-note">
          <Input id="exp-note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder={lang === 'hi' ? 'जैसे: शाहपुरा पंप, 120 लीटर' : 'e.g. Shahpura pump, 120 litres'} />
        </Field>
        <label className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-[14px] border border-line-strong bg-sheet text-[15.5px] font-[560]">
          <Camera size={18} /> {photo ? (lang === 'hi' ? 'पर्ची की फ़ोटो लग गई' : 'Slip photo added') : lang === 'hi' ? 'पर्ची की फ़ोटो' : 'Photo of the slip'}
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={async (e) => setPhoto(e.target.files?.[0] ? await fileToDataUrl(e.target.files[0], 1024, 0.6) : null)} />
        </label>
        <ErrorNote>{act.error}</ErrorNote>
      </form>
    </Modal>
  );
}
