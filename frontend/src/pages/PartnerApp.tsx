import { CITIES, findCity, VEHICLE_CLASSES, type VehicleRec, type VehicleType } from '@suraj/shared';
import { LogOut, MapPin, Phone, Truck } from 'lucide-react';
import { useState } from 'react';
import { Mark, Wordmark } from '../components/Brand';
import { TruckThumb, type DrawableTruck } from '../components/TruckArt';
import { Button, ErrorNote, Field, Loading, Modal, Plate, Progress, Select, useToast } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { inr } from '../lib/format';
import { useAction, useApi } from '../lib/hooks';
import { ThemeToggle } from '../lib/theme';

interface PartnerTrip {
  id: string;
  tripNo: string;
  regNo: string;
  status: 'PLANNED' | 'IN_TRANSIT' | 'COMPLETED' | 'CANCELLED';
  originCity: string;
  destCity: string;
  plannedKm: number;
  plannedStart: string;
  startedAt: string | null;
  completedAt: string | null;
  etaAt: string;
  progress: number;
  driverName: string;
  driverPhone: string;
  hireAmount: number | null;
  hireAdvance: number | null;
  balance: number | null;
  hireSettledAt: string | null;
}
interface PartnerTruck extends VehicleRec {
  alerts: { doc: string; label: string; days: number }[];
  currentTrip: PartnerTrip | null;
}
interface PartnerMe {
  partner: { name: string; phone: string | null; lang: 'en' | 'hi' } | null;
  company: { name: string; phone: string | null };
  trucks: PartnerTruck[];
  trips: PartnerTrip[];
  totals: { trucks: number; onTrip: number; tripsThisMonth: number; hireThisMonth: number; balanceDue: number; tripsDue: number };
}

const T = {
  en: {
    hello: 'Namaste', attached: 'Trucks attached to', call: 'Call the office', trucks: 'Trucks', onTrip: 'on a trip', month: 'Trips this month', hire: 'Hire this month', due: 'Balance to come', dueTrips: 'trips', myTrucks: 'Your trucks', onRoad: 'On the road', reachBy: 'reach by', emptyIn: 'Empty in', markFree: 'Truck is free in another city', papers: 'Papers', papersOk: 'Papers are in date', papersNone: 'Papers not with us yet. Send copies of RC, insurance, fitness, permit and PUC to the office.', trips: 'Trips and payments', noTrips: 'No trips yet. When the office puts your truck on a trip it shows up here with the lorry hire.', driver: 'Driver', hireLabel: 'Lorry hire', advance: 'Advance', balance: 'Balance', paid: 'Paid on', balanceDue: 'Balance due', afterPod: 'Balance after delivery and POD', notFixed: 'Hire not fixed yet. The office will add it before loading.', planned: 'Planned', moving: 'On the road', done: 'Completed', how: 'How lorry hire works', how1: 'The hire for each trip is agreed with you before loading.', how2: 'An advance is paid when the truck is loaded.', how3: 'The balance is paid after delivery, once the proof of delivery is in.', where: 'Where is the truck now?', save: 'Tell the office', freeDone: 'The office can now see your truck is free in', logout: 'Log out', km: 'km',
  },
  hi: {
    hello: 'नमस्ते', attached: 'इनसे जुड़ी गाड़ियाँ:', call: 'ऑफ़िस को फ़ोन करें', trucks: 'गाड़ियाँ', onTrip: 'ट्रिप पर', month: 'इस महीने की ट्रिप', hire: 'इस महीने का भाड़ा', due: 'बाकी भुगतान', dueTrips: 'ट्रिप', myTrucks: 'आपकी गाड़ियाँ', onRoad: 'रास्ते में', reachBy: 'पहुँचेगी', emptyIn: 'खाली है:', markFree: 'गाड़ी दूसरे शहर में खाली है', papers: 'कागज़', papersOk: 'सारे कागज़ चालू हैं', papersNone: 'कागज़ अभी हमारे पास नहीं हैं। RC, बीमा, फ़िटनेस, परमिट और PUC की कॉपी ऑफ़िस भेजें।', trips: 'ट्रिप और भुगतान', noTrips: 'अभी कोई ट्रिप नहीं। ऑफ़िस आपकी गाड़ी को ट्रिप देगा तो भाड़े के साथ यहाँ दिखेगी।', driver: 'ड्राइवर', hireLabel: 'भाड़ा', advance: 'एडवांस', balance: 'बाकी', paid: 'भुगतान हुआ', balanceDue: 'बाकी देना है', afterPod: 'डिलीवरी और POD के बाद बाकी', notFixed: 'भाड़ा अभी तय नहीं। लोडिंग से पहले ऑफ़िस लिख देगा।', planned: 'तय', moving: 'रास्ते में', done: 'पूरी', how: 'भाड़ा कैसे मिलता है', how1: 'हर ट्रिप का भाड़ा लोडिंग से पहले आपसे तय होता है।', how2: 'गाड़ी लोड होते ही एडवांस मिलता है।', how3: 'डिलीवरी और POD आने के बाद बाकी पैसा मिलता है।', where: 'गाड़ी अभी कहाँ है?', save: 'ऑफ़िस को बताएँ', freeDone: 'ऑफ़िस को दिख रहा है कि गाड़ी यहाँ खाली है:', logout: 'लॉग आउट', km: 'किमी',
  },
};

const day = (iso: string | null, lang: 'en' | 'hi') => (iso ? new Date(iso).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' }) : '');
const cities = [...CITIES].sort((a, b) => a.name.localeCompare(b.name));

/** The page a truck owner sees: their trucks, every trip on them, and the lorry hire due. */
export function PartnerApp() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const { data, reload } = useApi<PartnerMe>('/api/partner/me');
  const [lang, setLang] = useState<'en' | 'hi'>(user?.lang === 'en' ? 'en' : 'hi');
  const [freeFor, setFreeFor] = useState<PartnerTruck | null>(null);
  const [city, setCity] = useState('');
  const act = useAction();
  const t = T[lang];
  const cityName = (n: string) => (lang === 'hi' ? (findCity(n)?.hi ?? n) : n);
  const typeLabel = (v: VehicleType) => VEHICLE_CLASSES[v]?.label ?? v;
  const first = (data?.partner?.name ?? user?.name ?? '').split(' ')[0];

  return (
    <div className="min-h-full bg-ground" lang={lang}>
      <header className="sticky top-0 z-20 px-3 pb-2" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)' }}>
        <div className="island mx-auto flex h-[54px] max-w-[980px] items-center justify-between gap-2 pr-2 pl-3.5">
          <span className="flex min-w-0 items-center gap-2.5 text-white">
            <Mark size={28} />
            <span className="flex min-w-0 flex-col gap-[3px]">
              <Wordmark size={16} />
              <span className="truncate text-[12px] leading-none text-white/60">{first}</span>
            </span>
            <span className="ml-1 hidden rounded-full bg-white/10 px-2.5 py-1 font-display text-[12px] font-[560] text-white/75 sm:inline">{lang === 'hi' ? 'गाड़ी मालिक' : 'Truck owner'}</span>
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

      <main className="mx-auto max-w-[980px] pt-4 pb-14" style={{ paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))', paddingRight: 'max(16px, env(safe-area-inset-right, 0px))' }}>
        {!data ? (
          <Loading rows={6} />
        ) : (
          <>
            <section className="rise flex flex-wrap items-end justify-between gap-4 pt-2 pb-6">
              <div>
                <p className="eyebrow">
                  {t.attached} {data.company.name}
                </p>
                <h1 className="mt-2 font-display tracking-[-0.035em] text-[clamp(30px,5vw,46px)] leading-none font-[600]">
                  {t.hello}, {first}
                </h1>
              </div>
              {data.company.phone && (
                <a href={`tel:${data.company.phone.replace(/\s/g, '')}`} className="inline-flex h-11 items-center gap-2 rounded-full border border-line-strong bg-sheet px-5 text-[15px] font-[560] hover:border-ink">
                  <Phone size={16} /> {t.call}
                </a>
              )}
            </section>

            <dl className="stat-strip m-0 grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
              {[
                [t.trucks, String(data.totals.trucks), `${data.totals.onTrip} ${t.onTrip}`],
                [t.month, String(data.totals.tripsThisMonth), ''],
                [t.hire, inr(data.totals.hireThisMonth), ''],
                [t.due, inr(data.totals.balanceDue), `${data.totals.tripsDue} ${t.dueTrips}`],
              ].map(([k, v, sub]) => (
                <div key={k} className="bg-ground px-4 py-5">
                  <dt className="eyebrow">{k}</dt>
                  <dd className="t-fig m-0 mt-2 text-[34px] leading-none">{v}</dd>
                  {sub && <p className="mt-2 text-[13.5px] text-muted">{sub}</p>}
                </div>
              ))}
            </dl>

            <div className="mt-8 grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
              <section>
                <h2 className="t-sub mb-3">{t.myTrucks}</h2>
                <div className="grid gap-3">
                  {data.trucks.map((v) => {
                    const trip = v.currentTrip;
                    return (
                      <article key={v.id} className="sheet overflow-hidden">
                        <div className="flex items-start justify-between gap-3 px-4 pt-4">
                          <div className="min-w-0">
                            <Plate reg={v.regNo} size={17} />
                            <p className="mt-2 text-[14px] text-muted">{typeLabel(v.type)}</p>
                          </div>
                          <span className="shrink-0 text-muted">{v.type !== 'BIKE' && <TruckThumb type={v.type as DrawableTruck} height={34} />}</span>
                        </div>
                        <div className="px-4 pt-3 pb-4">
                          {trip && trip.status === 'IN_TRANSIT' ? (
                            <>
                              <p className="text-[15.5px] font-[560]">
                                {t.onRoad}: {cityName(trip.originCity)} → {cityName(trip.destCity)}
                              </p>
                              <span className="id-chip mt-1.5">{trip.tripNo}</span>
                              <div className="mt-3">
                                <Progress value={Math.round(trip.progress * 100)} />
                              </div>
                              <p className="mt-2 text-[13.5px] text-muted">
                                {t.reachBy} {day(trip.etaAt, lang)}, {t.driver} {trip.driverName}
                              </p>
                            </>
                          ) : trip ? (
                            <>
                              <p className="text-[15.5px] font-[560]">
                                {t.planned}: {cityName(trip.originCity)} → {cityName(trip.destCity)}
                              </p>
                              <span className="id-chip mt-1.5">{trip.tripNo}</span>
                            </>
                          ) : (
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="flex items-center gap-1.5 text-[15.5px]">
                                <MapPin size={16} className="text-muted" /> {t.emptyIn} <span className="font-[600]">{cityName(v.city)}</span>
                              </p>
                              {v.status === 'IDLE' && (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setCity(v.city);
                                    setFreeFor(v);
                                  }}
                                >
                                  <Truck size={15} /> {t.markFree}
                                </Button>
                              )}
                            </div>
                          )}
                          <div className="mt-3 border-t border-line pt-3">
                            <p className="eyebrow mb-1.5">{t.papers}</p>
                            {Object.keys(v.docs ?? {}).length === 0 ? (
                              <p className="text-[13.5px] text-muted">{t.papersNone}</p>
                            ) : v.alerts.length === 0 ? (
                              <p className="text-[14px] text-go">{t.papersOk}</p>
                            ) : (
                              <ul className="space-y-1">
                                {v.alerts.map((a) => (
                                  <li key={a.doc} className={`text-[14px] ${a.days < 0 ? 'text-bad' : 'text-warn'}`}>
                                    {a.label}: {a.days < 0 ? (lang === 'hi' ? `${-a.days} दिन पहले ख़त्म` : `expired ${-a.days} days ago`) : lang === 'hi' ? `${a.days} दिन बाकी` : `${a.days} days left`}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>

                <aside className="mt-6 rounded-[20px] border border-line bg-sheet p-5">
                  <p className="eyebrow">{t.how}</p>
                  <ol className="mt-3 space-y-2.5 text-[14.5px]">
                    {[t.how1, t.how2, t.how3].map((x, i) => (
                      <li key={x} className="flex gap-3">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sign-soft font-mono text-[12px] text-sign">{i + 1}</span>
                        <span className="text-muted">{x}</span>
                      </li>
                    ))}
                  </ol>
                </aside>
              </section>

              <section>
                <h2 className="t-sub mb-3">{t.trips}</h2>
                {data.trips.length === 0 ? (
                  <p className="sheet p-5 text-[15px] text-muted">{t.noTrips}</p>
                ) : (
                  <ul className="sheet divide-y divide-line overflow-hidden">
                    {data.trips.map((tr) => (
                      <li key={tr.id} className="px-4 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[15.5px] leading-snug font-[560]">
                              {cityName(tr.originCity)} → {cityName(tr.destCity)}
                            </p>
                            <span className="mt-1.5 flex flex-wrap items-center gap-2">
                              <span className="id-chip">{tr.tripNo}</span>
                              <Plate reg={tr.regNo} size={11} />
                            </span>
                            <p className="mt-1.5 text-[13.5px] text-muted">
                              {day(tr.startedAt ?? tr.plannedStart, lang)} · {tr.plannedKm.toLocaleString('en-IN')} {t.km} · {t.driver} {tr.driverName}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            {tr.hireAmount !== null ? (
                              <>
                                <p className="t-fig text-[22px] leading-none">{inr(tr.hireAmount)}</p>
                                <p className="mt-1 text-[12.5px] text-muted">{t.hireLabel}</p>
                              </>
                            ) : (
                              <p className="max-w-[16ch] text-[13px] text-muted">{t.notFixed}</p>
                            )}
                          </div>
                        </div>
                        {tr.hireAmount !== null && (
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[14px] bg-sheet-2 px-3.5 py-2.5 text-[13.5px]">
                            <span className="text-muted">
                              {t.advance} <span className="num text-ink">{inr(tr.hireAdvance ?? 0)}</span> · {t.balance} <span className="num text-ink">{inr(tr.balance ?? 0)}</span>
                            </span>
                            {tr.hireSettledAt ? (
                              <span className="font-[560] text-go">
                                {t.paid} {day(tr.hireSettledAt, lang)}
                              </span>
                            ) : tr.status === 'COMPLETED' ? (
                              <span className="font-[560] text-warn">{t.balanceDue}</span>
                            ) : (
                              <span className="text-muted">{tr.status === 'IN_TRANSIT' ? t.moving : t.planned} · {t.afterPod}</span>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
      </main>

      <Modal
        open={!!freeFor}
        onClose={() => setFreeFor(null)}
        title={freeFor ? <Plate reg={freeFor.regNo} size={15} /> : ''}
        footer={
          <Button
            variant="primary"
            disabled={act.busy || !city}
            onClick={() =>
              act.run(async () => {
                await api.post(`/api/partner/vehicles/${freeFor!.id}/free`, { city });
                await reload();
                toast(`${t.freeDone} ${cityName(city)}`);
                setFreeFor(null);
              })
            }
          >
            {t.save}
          </Button>
        }
      >
        <Field label={t.where} htmlFor="pf-city">
          <Select id="pf-city" value={city} onChange={(e) => setCity(e.target.value)}>
            {cities.map((c) => (
              <option key={c.name} value={c.name}>
                {lang === 'hi' ? `${c.hi} (${c.name})` : c.name}
              </option>
            ))}
          </Select>
        </Field>
        <ErrorNote>{act.error}</ErrorNote>
      </Modal>
    </div>
  );
}
