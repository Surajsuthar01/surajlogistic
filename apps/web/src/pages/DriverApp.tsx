import { STATUS_LABEL, STATUS_LABEL_HI, type ShipmentStatus, type TripRec, type VehicleRec } from '@suraj/core';
import { LocateFixed, LogOut, MapPin, Phone, Truck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Brand } from '../components/Layout';
import { Badge, Button, ErrorNote, Field, Input, Loading, Modal } from '../components/ui';
import { api, DEMO, subscribe } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dt, inr, kg } from '../lib/format';
import { useAction, useApi } from '../lib/hooks';

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
interface DriverMe {
  driver: { name: string; lang: 'en' | 'hi'; rating: number };
  activeTrip: (TripRec & { pnl: { profit: number } }) | null;
  vehicle: VehicleRec | null;
  stops: Stop[];
  history: { id: string; tripNo: string; lane: string; km: number; completedAt: string; advance: number }[];
  stats: { tripsDone: number; kmDriven: number; rating: number };
  demoOtps?: Record<string, string>;
}

const T = {
  en: { hello: 'Namaste', trip: "Today's trip", none: 'No trip assigned. Your dispatcher will send one.', start: 'Start trip', reached: 'I have reached', share: 'Share live location', sharing: 'Sharing location', stops: 'Deliveries on this truck', ofd: 'Out for delivery', deliver: 'Delivered', fail: 'Not delivered', otp: 'Ask the receiver for the 4-digit OTP', confirm: 'Confirm delivery', collect: 'Collect', eta: 'Reach by', covered: 'covered', done: 'Trips done', km: 'km driven', rating: 'Rating', logout: 'Log out', advance: 'Advance received' },
  hi: { hello: 'नमस्ते', trip: 'आज की ट्रिप', none: 'अभी कोई ट्रिप नहीं है। डिस्पैचर भेजेंगे।', start: 'ट्रिप शुरू करें', reached: 'मैं पहुँच गया', share: 'लाइव लोकेशन भेजें', sharing: 'लोकेशन जा रही है', stops: 'इस गाड़ी की डिलीवरी', ofd: 'डिलीवरी के लिए निकला', deliver: 'डिलीवर हुआ', fail: 'डिलीवरी नहीं हुई', otp: 'लेने वाले से 4 अंकों का OTP पूछें', confirm: 'डिलीवरी पक्की करें', collect: 'वसूलें', eta: 'पहुँचना है', covered: 'पूरा', done: 'ट्रिप पूरी', km: 'किमी चलाया', rating: 'रेटिंग', logout: 'लॉग आउट', advance: 'एडवांस मिला' },
};

export function DriverApp() {
  const { user, logout } = useAuth();
  const { data, reload } = useApi<DriverMe>('/api/driver/me', { liveTypes: ['trip.status', 'shipment.status'] });
  const [lang, setLang] = useState<'en' | 'hi'>('hi');
  const [otpFor, setOtpFor] = useState<Stop | null>(null);
  const [otp, setOtp] = useState('');
  const [sharing, setSharing] = useState(false);
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const watch = useRef<number | null>(null);
  const act = useAction();
  const t = T[lang];

  useEffect(() => {
    if (data?.driver.lang) setLang(data.driver.lang);
  }, [data?.driver.lang]);
  useEffect(() => subscribe((e) => e.type === 'trip.ping' && e.payload.id === data?.activeTrip?.id && void reload()), [data?.activeTrip?.id, reload]);
  useEffect(() => () => {
    if (watch.current !== null) navigator.geolocation?.clearWatch(watch.current);
  }, []);

  const trip = data?.activeTrip;
  const label = (s: ShipmentStatus) => (lang === 'hi' ? STATUS_LABEL_HI[s] : STATUS_LABEL[s]);

  const share = () => {
    if (!trip) return;
    if (DEMO) {
      setSharing(true);
      setGeoErr(lang === 'hi' ? 'डेमो: GPS सिम्युलेटर गाड़ी को चला रहा है।' : 'Demo: the GPS simulator is moving the truck for you.');
      return;
    }
    if (!navigator.geolocation) return setGeoErr('This phone cannot share location.');
    watch.current = navigator.geolocation.watchPosition(
      (p) => {
        setSharing(true);
        void api.post(`/api/trips/${trip.id}/ping`, { lat: p.coords.latitude, lng: p.coords.longitude, speedKmph: Math.round((p.coords.speed ?? 0) * 3.6) }).catch(() => undefined);
      },
      () => setGeoErr(lang === 'hi' ? 'लोकेशन की अनुमति दें।' : 'Allow location access to share your position.'),
      { enableHighAccuracy: true, maximumAge: 60_000 },
    );
  };

  const move = (s: Stop, status: ShipmentStatus) => act.run(async () => (await api.post(`/api/shipments/${s.id}/status`, { status }), await reload()));

  return (
    <div className="min-h-full bg-ground" style={{ paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))', paddingRight: 'max(16px, env(safe-area-inset-right, 0px))' }}>
      <div className="mx-auto max-w-[480px] py-4">
        <header className="mb-4 flex items-center justify-between">
          <Brand small />
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setLang(lang === 'hi' ? 'en' : 'hi')} className="rounded-full border border-line bg-panel px-3 py-1 text-[13.5px]">
              {lang === 'hi' ? 'English' : 'हिंदी'}
            </button>
            <button type="button" onClick={logout} aria-label={t.logout} className="grid h-9 w-9 place-items-center rounded-full border border-line bg-panel">
              <LogOut size={16} />
            </button>
          </div>
        </header>
        {!data ? (
          <Loading />
        ) : (
          <>
            <h1 className="text-[26px] font-bold">
              {t.hello}, {(user?.name ?? data.driver.name).split(' ')[0]}
            </h1>
            <section className="panel mt-4 p-4">
              <p className="text-[13.5px] text-muted">{t.trip}</p>
              {!trip ? (
                <p className="mt-2 text-[16px]">{t.none}</p>
              ) : (
                <>
                  <h2 className="mt-1 text-[24px] font-bold">
                    {trip.originCity} → {trip.destCity}
                  </h2>
                  <p className="flex items-center gap-2 text-[15px] text-muted">
                    <Truck size={16} /> {data.vehicle?.regNo} · {trip.tripNo}
                  </p>
                  <div className="mt-3 h-3 rounded-full bg-panel-2">
                    <div className="h-3 rounded-full bg-route" style={{ width: `${Math.round(trip.progress * 100)}%` }} />
                  </div>
                  <div className="mt-1 flex justify-between text-[14px]">
                    <span className="num">
                      {Math.round(trip.progress * 100)}% {t.covered}
                    </span>
                    <span className="num">
                      {t.eta} {dt(trip.etaAt)}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-2">
                    {trip.status === 'PLANNED' && (
                      <Button variant="primary" className="h-12 text-[16px]" disabled={act.busy} onClick={() => act.run(async () => (await api.post(`/api/trips/${trip.id}/start`), await reload()))}>
                        {t.start}
                      </Button>
                    )}
                    {trip.status === 'IN_TRANSIT' && (
                      <>
                        <Button className="h-12 text-[16px]" onClick={share} disabled={sharing}>
                          <LocateFixed size={18} /> {sharing ? t.sharing : t.share}
                        </Button>
                        <Button variant="primary" className="h-12 text-[16px]" disabled={act.busy} onClick={() => act.run(async () => (await api.post(`/api/trips/${trip.id}/complete`, {}), await reload()))}>
                          <MapPin size={18} /> {t.reached} {trip.destCity}
                        </Button>
                      </>
                    )}
                  </div>
                  {geoErr && <p className="mt-2 text-[13.5px] text-muted">{geoErr}</p>}
                  <p className="mt-3 text-[14px] text-muted">
                    {t.advance}: {inr(trip.driverAdvance)}
                  </p>
                </>
              )}
            </section>
            <ErrorNote>{act.error}</ErrorNote>

            {data.stops.length > 0 && (
              <section className="mt-5">
                <h2 className="mb-2 text-[18px] font-semibold">
                  {t.stops} ({data.stops.length})
                </h2>
                <ul className="space-y-3">
                  {data.stops.map((s) => (
                    <li key={s.id} className="panel p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="awb text-[13.5px] text-muted">{s.awb}</p>
                          <p className="text-[17px] font-semibold">{s.consigneeName}</p>
                          <p className="text-[14px] text-muted">{s.consigneeAddress}</p>
                        </div>
                        <Badge tone={s.status === 'NDR' ? 'warn' : 'route'}>{label(s.status)}</Badge>
                      </div>
                      <p className="mt-2 flex flex-wrap items-center gap-3 text-[14px]">
                        <span className="inline-flex items-center gap-1">
                          <Phone size={14} /> <span className="num select-all">{s.consigneePhone}</span>
                        </span>
                        <span className="text-muted">
                          {s.packages} pkg · {kg(s.weightKg)}
                        </span>
                        {s.paymentMode === 'COD' && (
                          <Badge tone="accent">
                            {t.collect} {inr(s.codAmount)}
                          </Badge>
                        )}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {s.nextStatuses.includes('OUT_FOR_DELIVERY') && (
                          <Button size="sm" disabled={act.busy} onClick={() => move(s, 'OUT_FOR_DELIVERY')}>
                            {t.ofd}
                          </Button>
                        )}
                        {s.nextStatuses.includes('DELIVERED') && (
                          <Button size="sm" variant="primary" onClick={() => setOtpFor(s)}>
                            {t.deliver}
                          </Button>
                        )}
                        {s.nextStatuses.includes('NDR') && (
                          <Button size="sm" disabled={act.busy} onClick={() => move(s, 'NDR')}>
                            {t.fail}
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-[14px] border border-line bg-line text-center">
              {[
                [data.stats.tripsDone, t.done],
                [data.stats.kmDriven.toLocaleString('en-IN'), t.km],
                [data.stats.rating.toFixed(1), t.rating],
              ].map(([v, l]) => (
                <div key={String(l)} className="bg-panel py-3">
                  <div className="num font-display text-[22px] font-bold">{v}</div>
                  <div className="text-[12.5px] text-muted">{l}</div>
                </div>
              ))}
            </section>
          </>
        )}
      </div>

      <Modal open={!!otpFor} onClose={() => setOtpFor(null)} title={otpFor ? `${otpFor.awb} · ${otpFor.consigneeName}` : ''}>
        {otpFor && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void act.run(async () => {
                await api.post(`/api/shipments/${otpFor.id}/status`, { status: 'DELIVERED', otp });
                setOtpFor(null);
                setOtp('');
                await reload();
              });
            }}
          >
            <p className="text-[15px]">{t.otp}</p>
            {DEMO && data?.demoOtps?.[otpFor.id] && <p className="rounded-[10px] bg-panel-2 px-3 py-2 text-[13.5px]">Demo: the receiver reads out {data.demoOtps[otpFor.id]}.</p>}
            {otpFor.paymentMode === 'COD' && (
              <p className="text-[15px] font-medium">
                {t.collect} {inr(otpFor.codAmount)}
              </p>
            )}
            <Field label="OTP" htmlFor="drv-otp">
              <Input id="drv-otp" inputMode="numeric" maxLength={4} value={otp} onChange={(e) => setOtp(e.target.value)} className="h-12 text-center text-[22px] tracking-[0.4em]" required />
            </Field>
            <ErrorNote>{act.error}</ErrorNote>
            <Button variant="primary" type="submit" className="h-12 w-full text-[16px]" disabled={act.busy || otp.length < 4}>
              {t.confirm}
            </Button>
          </form>
        )}
      </Modal>
    </div>
  );
}
