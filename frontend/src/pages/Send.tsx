import { CITIES, SERVICES, type Quote, type Service } from '@suraj/shared';
import { ArrowRight, Check as CheckIcon, MessageCircle, PackageSearch, Phone, Truck } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHero, SitePage } from '../components/Site';
import { btnClass, Button, Check, ErrorNote, Field, Input, Select, Textarea } from '../components/ui';
import { api, errorText } from '../lib/api';
import { inr } from '../lib/format';

const cities = CITIES.map((c) => c.name).sort();
const SERVICE_WORD: Record<Service, { t: string; d: string }> = {
  COURIER: { t: 'Parcel', d: 'Boxes and bags up to about 70 kg' },
  PTL: { t: 'Part load', d: 'Cartons and bags, 100 kg to a few tonnes' },
  FTL: { t: 'Full truck', d: 'A whole truck just for your goods' },
};

const istDay = (offsetDays: number) => new Date(Date.now() + 5.5 * 3600_000 + offsetDays * 86400_000).toISOString().slice(0, 10);

interface Booked {
  awb: string;
  price: number;
  originCity: string;
  destCity: string;
  company: string;
  phone: string | null;
}

/** Send a parcel without an account: price, pickup, delivery, and a request number at once. */
export function Send() {
  const [sp] = useSearchParams();
  const svcParam = sp.get('service') as Service | null;
  const [f, setF] = useState({
    service: svcParam && SERVICES.includes(svcParam) ? svcParam : ('COURIER' as Service),
    contents: '',
    weightKg: sp.get('kg') ?? '5',
    packages: '1',
    declaredValue: '',
    senderName: '',
    senderPhone: '',
    originCity: sp.get('from') && cities.includes(sp.get('from')!) ? sp.get('from')! : 'Ratlam',
    pickupAddress: '',
    pickupDate: istDay(1),
    receiverName: '',
    receiverPhone: '',
    destCity: sp.get('to') && cities.includes(sp.get('to')!) ? sp.get('to')! : 'Indore',
    receiverAddress: '',
    paymentMode: 'PREPAID' as 'PREPAID' | 'TO_PAY',
    agree: false,
  });
  const [q, setQ] = useState<Quote | null>(null);
  const [qErr, setQErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<Booked | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const weight = Number(f.weightKg);

  useEffect(() => {
    if (!(weight > 0) || f.originCity === f.destCity) {
      setQ(null);
      return;
    }
    const t = setTimeout(() => {
      api
        .post<{ quote: Quote }>('/api/public/quote', { service: f.service, originCity: f.originCity, destCity: f.destCity, weightKg: weight, packages: Number(f.packages) || 1, declaredValue: Number(f.declaredValue) || 0, paymentMode: f.paymentMode })
        .then((r) => {
          setQ(r.quote);
          setQErr(null);
        })
        .catch((e) => setQErr(errorText(e)));
    }, 250);
    return () => clearTimeout(t);
  }, [f.service, f.originCity, f.destCity, weight, f.packages, f.declaredValue, f.paymentMode]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (f.originCity === f.destCity) return setErr('Pickup and delivery are in the same city. For local delivery, call us.');
    if (!f.agree) return setErr('Please confirm the goods are safe to carry and the details are right.');
    setBusy(true);
    try {
      const r = await api.post<Booked>('/api/public/bookings', {
        service: f.service,
        originCity: f.originCity,
        destCity: f.destCity,
        weightKg: weight,
        packages: Number(f.packages) || 1,
        declaredValue: Number(f.declaredValue) || 0,
        paymentMode: f.paymentMode,
        contents: f.contents,
        pickupAddress: f.pickupAddress,
        pickupDate: f.pickupDate,
        senderName: f.senderName,
        senderPhone: f.senderPhone,
        receiverName: f.receiverName,
        receiverPhone: f.receiverPhone,
        receiverAddress: f.receiverAddress,
        agree: true,
      });
      setDone(r);
      window.scrollTo(0, 0);
    } catch (e2) {
      setErr(errorText(e2));
    } finally {
      setBusy(false);
    }
  };

  if (done)
    return (
      <SitePage>
        <PageHero eyebrow="Request sent" title="We have your pickup request">
          <div className="max-w-[640px] rounded-[24px] bg-white/[0.07] p-6 ring-1 ring-white/12 backdrop-blur-xl sm:p-8">
            <p className="font-display text-[12.5px] font-[560] text-white/60">Your request number</p>
            <p className="mt-3 text-[clamp(22px,3vw,30px)] font-[600]">
              {done.originCity} to {done.destCity}, {inr(done.price)}
            </p>
            <span className="mt-2 inline-flex h-9 items-center rounded-[10px] bg-white px-3.5 font-mono text-[17px] tracking-[0.06em] text-black">{done.awb}</span>
            <p className="mt-4 text-[15.5px] leading-relaxed text-white/75">Keep this number. It becomes your tracking number once our team confirms the booking. We have sent it to {f.senderPhone} on WhatsApp too.</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link to={`/track/${done.awb}`} className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[15px] font-[560] text-black hover:bg-white/90">
                <PackageSearch size={17} /> Check the status
              </Link>
              <button
                type="button"
                onClick={() => {
                  setDone(null);
                  setF((x) => ({ ...x, contents: '', receiverName: '', receiverPhone: '', receiverAddress: '', agree: false }));
                }}
                className="inline-flex h-11 items-center rounded-full px-5 text-[15px] font-[540] text-white ring-1 ring-white/30 hover:bg-white/10"
              >
                Send another
              </button>
            </div>
          </div>
        </PageHero>
        <section className="mx-auto max-w-[1360px] px-5 py-16 sm:px-8">
          <p className="eyebrow">What happens now</p>
          <ol className="mt-6 grid gap-8 md:grid-cols-3">
            {[
              { icon: Phone, t: 'We call you', d: `${done.company} calls ${f.senderPhone} to confirm the price and the pickup time.${done.phone ? ` You can also call us on ${done.phone}.` : ''}` },
              { icon: Truck, t: 'We pick up', d: `From ${f.pickupAddress}. ${f.paymentMode === 'PREPAID' ? 'Pay at pickup in cash or by UPI.' : 'The receiver pays on delivery.'}` },
              { icon: MessageCircle, t: 'You both get the link', d: `Once confirmed, you and ${f.receiverName} get the tracking link on WhatsApp, and ${f.receiverName} gets an OTP for the delivery.` },
            ].map((s, i) => (
              <li key={s.t} className="relative border-t border-line pt-5">
                <span className="absolute -top-[5px] left-0 h-[9px] w-[9px] rounded-full bg-sign" style={{ boxShadow: '0 0 12px var(--sign)' }} />
                <s.icon size={22} className="text-accent" />
                <p className="mt-4 font-display text-[12.5px] font-[560] text-faint">Step {i + 1}</p>
                <h3 className="mt-1.5 font-display tracking-[-0.025em] text-[26px] leading-none font-[600]">{s.t}</h3>
                <p className="mt-2.5 text-[15px] leading-relaxed text-muted">{s.d}</p>
              </li>
            ))}
          </ol>
        </section>
      </SitePage>
    );

  return (
    <SitePage>
      <PageHero eyebrow="Send a parcel" title="Book a pickup without an account" sub="Tell us what you are sending, where from and where to. You get a request number straight away; our team calls to confirm, then the tracking link comes on WhatsApp." />
      <form onSubmit={submit} className="mx-auto grid max-w-[1360px] grid-cols-[minmax(0,1fr)] items-start gap-8 px-5 py-14 sm:px-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 gap-6">
          <Block n={1} title="What are you sending?">
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Service">
              {SERVICES.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={f.service === s} onClick={() => setF((x) => ({ ...x, service: s, weightKg: s === 'FTL' && weight < 1000 ? '5000' : s === 'PTL' && weight < 100 ? '500' : s === 'COURIER' && weight > 70 ? '10' : x.weightKg }))} className={`rounded-[16px] border p-4 text-left transition-colors ${f.service === s ? 'border-ink bg-sheet' : 'border-line bg-sheet hover:border-line-strong'}`}>
                  <span className="flex items-center justify-between text-[15.5px] font-[600]">
                    {SERVICE_WORD[s].t}
                    {f.service === s && <CheckIcon size={16} className="text-sign" />}
                  </span>
                  <span className="mt-1 block text-[13.5px] leading-snug text-muted">{SERVICE_WORD[s].d}</span>
                </button>
              ))}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="What is inside" htmlFor="sp-contents" className="sm:col-span-2" hint="For example: clothes and sweets, books, machine parts">
                <Input id="sp-contents" value={f.contents} onChange={set('contents')} required minLength={2} maxLength={160} />
              </Field>
              <Field label="Weight (kg)" htmlFor="sp-kg">
                <Input id="sp-kg" inputMode="decimal" value={f.weightKg} onChange={(e) => setF((x) => ({ ...x, weightKg: e.target.value.replace(/[^\d.]/g, '') }))} required />
              </Field>
              <Field label="Packages" htmlFor="sp-pk">
                <Input id="sp-pk" inputMode="numeric" value={f.packages} onChange={(e) => setF((x) => ({ ...x, packages: e.target.value.replace(/\D/g, '') }))} required />
              </Field>
              <Field label="Value of the goods (₹)" htmlFor="sp-val" className="sm:col-span-2" hint="Used for insurance cover. Above ₹50,000 an e-way bill is needed; we help with it.">
                <Input id="sp-val" inputMode="numeric" value={f.declaredValue} onChange={(e) => setF((x) => ({ ...x, declaredValue: e.target.value.replace(/\D/g, '') }))} placeholder="5000" />
              </Field>
            </div>
          </Block>

          <Block n={2} title="Pick up from">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Your name" htmlFor="sp-sname">
                <Input id="sp-sname" value={f.senderName} onChange={set('senderName')} autoComplete="name" required minLength={2} />
              </Field>
              <Field label="Your mobile" htmlFor="sp-sphone" hint="We call and WhatsApp you on this number.">
                <Input id="sp-sphone" inputMode="tel" value={f.senderPhone} onChange={set('senderPhone')} autoComplete="tel" placeholder="98260 12345" required />
              </Field>
              <Field label="City" htmlFor="sp-from">
                <Select id="sp-from" value={f.originCity} onChange={set('originCity')}>
                  {cities.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Pickup day" htmlFor="sp-date">
                <Input id="sp-date" type="date" min={istDay(0)} max={istDay(14)} value={f.pickupDate} onChange={set('pickupDate')} required />
              </Field>
              <Field label="Pickup address" htmlFor="sp-paddr" className="sm:col-span-2">
                <Textarea id="sp-paddr" value={f.pickupAddress} onChange={set('pickupAddress')} placeholder="House or shop, street, area, pin code" required minLength={8} maxLength={300} />
              </Field>
            </div>
          </Block>

          <Block n={3} title="Deliver to">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Receiver's name" htmlFor="sp-rname">
                <Input id="sp-rname" value={f.receiverName} onChange={set('receiverName')} required minLength={2} />
              </Field>
              <Field label="Receiver's mobile" htmlFor="sp-rphone" hint="They get the tracking link and the delivery OTP.">
                <Input id="sp-rphone" inputMode="tel" value={f.receiverPhone} onChange={set('receiverPhone')} placeholder="98260 12345" required />
              </Field>
              <Field label="City" htmlFor="sp-to">
                <Select id="sp-to" value={f.destCity} onChange={set('destCity')}>
                  {cities.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Delivery address" htmlFor="sp-raddr" className="sm:col-span-2">
                <Textarea id="sp-raddr" value={f.receiverAddress} onChange={set('receiverAddress')} placeholder="House or shop, street, area, pin code" required minLength={8} maxLength={400} />
              </Field>
            </div>
          </Block>

          <Block n={4} title="Payment">
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Payment">
              {[
                ['PREPAID', 'I pay at pickup', 'Cash or UPI when we collect the goods'],
                ['TO_PAY', 'The receiver pays', 'Paid in cash or UPI on delivery'],
              ].map(([v, t, d]) => (
                <button key={v} type="button" role="radio" aria-checked={f.paymentMode === v} onClick={() => setF((x) => ({ ...x, paymentMode: v as 'PREPAID' | 'TO_PAY' }))} className={`rounded-[16px] border p-4 text-left transition-colors ${f.paymentMode === v ? 'border-ink bg-sheet' : 'border-line bg-sheet hover:border-line-strong'}`}>
                  <span className="flex items-center justify-between text-[15.5px] font-[600]">
                    {t}
                    {f.paymentMode === v && <CheckIcon size={16} className="text-sign" />}
                  </span>
                  <span className="mt-1 block text-[13.5px] text-muted">{d}</span>
                </button>
              ))}
            </div>
            <div className="mt-5">
              <Check id="sp-agree" checked={f.agree} onChange={(v) => setF((x) => ({ ...x, agree: v }))} label="The goods are not dangerous, banned or illegal, and these details are right." hint="Our team calls you to confirm before anyone comes to pick up." />
            </div>
          </Block>
        </div>

        <aside className="min-w-0 lg:sticky lg:top-[88px]">
          <div className="sheet overflow-hidden">
            <div className="px-5 pt-5 pb-4 sm:px-6">
              <p className="eyebrow">Your booking</p>
              <p className="mt-2 text-[20px] leading-snug font-[600]">
                {f.originCity} <ArrowRight size={17} className="inline align-[-2px] text-faint" /> {f.destCity}
              </p>
              <p className="mt-1 text-[14px] text-muted">
                {SERVICE_WORD[f.service].t}, {weight > 0 ? `${weight.toLocaleString('en-IN')} kg` : 'weight?'}, {f.packages || 1} {Number(f.packages) === 1 ? 'package' : 'packages'}
              </p>
            </div>
            <div className="border-t border-line px-5 py-5 sm:px-6" aria-live="polite">
              {f.originCity === f.destCity ? (
                <p className="text-[15px] text-muted">Pick two different cities.</p>
              ) : qErr ? (
                <p className="text-[15px] text-bad">{qErr}</p>
              ) : !q ? (
                <p className="text-[15px] text-muted">Working out the price…</p>
              ) : (
                <>
                  <p className="eyebrow">Estimated price, GST included</p>
                  <p className="t-fig mt-2 text-[52px] leading-none">{inr(q.total)}</p>
                  <ul className="mt-4 space-y-1 text-[14px] text-muted">
                    {q.lines.map((l) => (
                      <li key={l.label} className="flex justify-between gap-4">
                        <span>{l.label}</span>
                        <span className="num">{inr(l.amount)}</span>
                      </li>
                    ))}
                    <li className="flex justify-between gap-4">
                      <span>GST {q.gstRate}%</span>
                      <span className="num">{inr(q.gst)}</span>
                    </li>
                  </ul>
                  <p className="mt-3 text-[14px] text-muted">
                    {q.distanceKm.toLocaleString('en-IN')} km by road. Usually reaches by{' '}
                    <span className="text-ink">{new Date(q.etaAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' })}</span> after pickup.
                  </p>
                </>
              )}
            </div>
            <div className="border-t border-line px-5 py-5 sm:px-6">
              <ErrorNote>{err}</ErrorNote>
              <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
                {busy ? 'Sending…' : 'Request pickup'}
              </Button>
              <p className="mt-2.5 text-center text-[13px] text-faint">No account needed. Nothing is charged until pickup.</p>
            </div>
          </div>
          <p className="mt-4 px-1 text-[14px] text-muted">
            Send often? <Link to="/join?as=customer" className="font-[560] text-accent underline underline-offset-[3px]">Ask for a business login</Link> to book in bulk and get GST invoices.
          </p>
          <Link to="/track" className={btnClass('ghost', 'md', 'mt-2 !px-1')}>
            <PackageSearch size={16} /> Already sent something? Track it
          </Link>
        </aside>
      </form>
    </SitePage>
  );
}

function Block({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="sheet p-5 sm:p-6">
      <h2 className="mb-4 flex items-center gap-3 text-[18px] font-[600]">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-sign-soft font-mono text-[13px] text-sign">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}
