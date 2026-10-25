import { CITIES, VEHICLE_CLASSES, type JoinRole } from '@suraj/shared';
import { Check as CheckIcon, PackageCheck, Plus, Trash2, Truck, UserRound, Warehouse } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHero, SitePage } from '../components/Site';
import { LINEUP, TruckThumb } from '../components/TruckArt';
import { Button, Check, ErrorNote, Field, Input, Select, Textarea } from '../components/ui';
import { api, errorText } from '../lib/api';

const ROLES: { value: JoinRole; icon: typeof Truck; t: string; d: string }[] = [
  { value: 'partner', icon: Truck, t: 'Truck owner', d: 'You own one to ten trucks and want loads both ways.' },
  { value: 'driver', icon: UserRound, t: 'Driver', d: 'You hold a valid heavy or light vehicle licence.' },
  { value: 'customer', icon: PackageCheck, t: 'Business customer', d: 'You send goods often and want a login and GST invoices.' },
  { value: 'warehouse', icon: Warehouse, t: 'Warehouse staff', d: 'You will receive, store and dispatch stock.' },
];
const cityList = CITIES.map((c) => c.name).sort();

/** Ask to join Suraj Logistic. Nothing is created until the owner approves. */
export function Join() {
  const [sp] = useSearchParams();
  const asked = sp.get('as') as JoinRole | null;
  const [role, setRole] = useState<JoinRole>(asked && ROLES.some((r) => r.value === asked) ? asked : 'partner');
  const [f, setF] = useState({ name: '', phone: '', email: '', city: '', password: '', again: '', licenseNo: '', licenseExpiry: '', companyName: '', gstin: '', address: '', message: '', agree: false });
  const [trucks, setTrucks] = useState([{ regNo: '', type: 'TRUCK_19FT' }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const meta = ROLES.find((r) => r.value === role)!;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (f.password !== f.again) return setErr('The two passwords do not match');
    if (!f.agree) return setErr('Please confirm the details are yours and correct');
    setBusy(true);
    try {
      await api.post('/api/join', {
        role,
        name: f.name,
        phone: f.phone,
        email: f.email || undefined,
        city: f.city,
        password: f.password,
        message: f.message || undefined,
        agree: true,
        ...(role === 'driver' ? { licenseNo: f.licenseNo, licenseExpiry: f.licenseExpiry } : {}),
        ...(role === 'customer' ? { companyName: f.companyName || undefined, gstin: f.gstin || undefined, address: f.address || undefined } : {}),
        ...(role === 'partner' ? { trucks: trucks.filter((t) => t.regNo.trim()) } : {}),
      });
      setDone(true);
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
        <PageHero eyebrow="Request sent" title="Thank you. We will call you.">
          <div className="max-w-[640px] rounded-[24px] bg-white/[0.07] p-6 ring-1 ring-white/12 backdrop-blur-xl sm:p-8">
            <p className="text-[17px] leading-relaxed text-white/85">
              We got your request to join as a <span className="font-[600] text-white">{meta.t.toLowerCase()}</span>. Our team checks your details and calls you on <span className="font-mono text-white">{f.phone}</span>.
            </p>
            <p className="mt-3 text-[15.5px] leading-relaxed text-white/70">Once you are approved, log in with your mobile number and the password you just chose. Until then the login page tells you your request is waiting.</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link to="/welcome" className="inline-flex h-11 items-center rounded-full bg-white px-5 text-[15px] font-[560] text-black hover:bg-white/90">
                Back to the website
              </Link>
              <Link to="/login" className="inline-flex h-11 items-center rounded-full px-5 text-[15px] font-[540] text-white ring-1 ring-white/30 hover:bg-white/10">
                Go to log in
              </Link>
            </div>
          </div>
        </PageHero>
      </SitePage>
    );

  return (
    <SitePage>
      <PageHero eyebrow="Join our community" title="Ask to join Suraj Logistic" sub="Truck owners, drivers, business customers and warehouse staff all start here. Our team checks every request and calls you; you can log in once it is approved." />
      <form onSubmit={submit} className="mx-auto max-w-[1100px] px-5 py-14 sm:px-8">
        <p className="eyebrow mb-3">I want to join as</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label="Join as">
          {ROLES.map((r) => (
            <button key={r.value} type="button" role="radio" aria-checked={role === r.value} onClick={() => setRole(r.value)} className={`flex flex-col rounded-[20px] border p-5 text-left transition-colors ${role === r.value ? 'border-ink bg-sheet' : 'border-line bg-sheet hover:border-line-strong'}`}>
              <span className="flex items-center justify-between">
                <span className={`grid h-11 w-11 place-items-center rounded-[13px] ${role === r.value ? 'bg-sign text-white' : 'bg-sign-soft text-sign'}`}>
                  <r.icon size={20} strokeWidth={1.8} />
                </span>
                {role === r.value && <CheckIcon size={18} className="text-sign" />}
              </span>
              <span className="mt-4 text-[17px] font-[600]">{r.t}</span>
              <span className="mt-1 text-[14px] leading-snug text-muted">{r.d}</span>
            </button>
          ))}
        </div>

        <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="grid min-w-0 gap-6">
            <section className="sheet p-5 sm:p-6">
              <h2 className="mb-4 text-[18px] font-[600]">About you</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name" htmlFor="jn-name">
                  <Input id="jn-name" value={f.name} onChange={set('name')} autoComplete="name" required minLength={2} />
                </Field>
                <Field label="Mobile" htmlFor="jn-phone" hint="You log in with this number.">
                  <Input id="jn-phone" inputMode="tel" value={f.phone} onChange={set('phone')} autoComplete="tel" placeholder="98260 12345" required />
                </Field>
                <Field label="Email (optional)" htmlFor="jn-email">
                  <Input id="jn-email" type="email" value={f.email} onChange={set('email')} autoComplete="email" />
                </Field>
                <Field label="City" htmlFor="jn-city">
                  <Input id="jn-city" value={f.city} onChange={set('city')} list="jn-cities" required minLength={2} placeholder="Ratlam" />
                  <datalist id="jn-cities">
                    {cityList.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </Field>
                <Field label="Choose a password" htmlFor="jn-pw" hint="At least 8 characters.">
                  <Input id="jn-pw" type="password" value={f.password} onChange={set('password')} autoComplete="new-password" required minLength={8} />
                </Field>
                <Field label="Password again" htmlFor="jn-pw2">
                  <Input id="jn-pw2" type="password" value={f.again} onChange={set('again')} autoComplete="new-password" required minLength={8} />
                </Field>
              </div>
            </section>

            {role === 'partner' && (
              <section className="sheet p-5 sm:p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-[18px] font-[600]">Your trucks</h2>
                  <span className="text-[13.5px] text-muted">Up to 10</span>
                </div>
                <ul className="grid gap-3">
                  {trucks.map((t, i) => (
                    <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 rounded-[16px] bg-sheet-2 p-3.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]">
                      <Field label="Vehicle number" htmlFor={`jn-reg-${i}`}>
                        <Input id={`jn-reg-${i}`} value={t.regNo} onChange={(e) => setTrucks((x) => x.map((y, j) => (j === i ? { ...y, regNo: e.target.value.toUpperCase() } : y)))} placeholder="MP43 G 5120" required={i === 0} className="font-mono" />
                      </Field>
                      <Field label="Type" htmlFor={`jn-type-${i}`} className="order-3 col-span-2 sm:order-none sm:col-span-1">
                        <Select id={`jn-type-${i}`} value={t.type} onChange={(e) => setTrucks((x) => x.map((y, j) => (j === i ? { ...y, type: e.target.value } : y)))}>
                          {LINEUP.map((v) => (
                            <option key={v} value={v}>
                              {VEHICLE_CLASSES[v].label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <button type="button" onClick={() => setTrucks((x) => (x.length > 1 ? x.filter((_, j) => j !== i) : x))} disabled={trucks.length === 1} aria-label="Remove this truck" className="grid h-11 w-11 place-items-center rounded-full text-muted hover:bg-[var(--hover)] hover:text-bad disabled:opacity-30">
                        <Trash2 size={17} />
                      </button>
                    </li>
                  ))}
                </ul>
                {trucks.length < 10 && (
                  <Button size="sm" className="mt-3" onClick={() => setTrucks((x) => [...x, { regNo: '', type: 'TRUCK_19FT' }])}>
                    <Plus size={15} /> Add another truck
                  </Button>
                )}
                <p className="mt-3 text-[13.5px] text-muted">Keep the RC, insurance, fitness, permit and PUC ready. We ask for copies when we call.</p>
              </section>
            )}

            {role === 'driver' && (
              <section className="sheet p-5 sm:p-6">
                <h2 className="mb-4 text-[18px] font-[600]">Your driving licence</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Licence number" htmlFor="jn-dl">
                    <Input id="jn-dl" value={f.licenseNo} onChange={(e) => setF((x) => ({ ...x, licenseNo: e.target.value.toUpperCase() }))} placeholder="RJ14 20150034567" required className="font-mono" />
                  </Field>
                  <Field label="Valid till" htmlFor="jn-dlx">
                    <Input id="jn-dlx" type="date" value={f.licenseExpiry} onChange={set('licenseExpiry')} required />
                  </Field>
                </div>
              </section>
            )}

            {role === 'customer' && (
              <section className="sheet p-5 sm:p-6">
                <h2 className="mb-4 text-[18px] font-[600]">Your business</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Business name" htmlFor="jn-co">
                    <Input id="jn-co" value={f.companyName} onChange={set('companyName')} placeholder="Agarwal Namkeen Udyog" />
                  </Field>
                  <Field label="GSTIN (optional)" htmlFor="jn-gst" hint="For GST invoices with input credit.">
                    <Input id="jn-gst" value={f.gstin} onChange={(e) => setF((x) => ({ ...x, gstin: e.target.value.toUpperCase() }))} placeholder="23ABCDE1234F1Z5" className="font-mono" />
                  </Field>
                  <Field label="Address" htmlFor="jn-addr" className="sm:col-span-2">
                    <Textarea id="jn-addr" value={f.address} onChange={set('address')} placeholder="Shop or office, street, area, pin code" maxLength={300} />
                  </Field>
                </div>
              </section>
            )}

            <section className="sheet p-5 sm:p-6">
              <Field label="Anything we should know? (optional)" htmlFor="jn-msg" hint={role === 'partner' ? 'Lanes you run, where your trucks usually are, who drives them.' : role === 'customer' ? 'What you send, how often, and to where.' : 'Experience, where you are, when you can start.'}>
                <Textarea id="jn-msg" value={f.message} onChange={set('message')} maxLength={500} />
              </Field>
              <div className="mt-5">
                <Check id="jn-agree" checked={f.agree} onChange={(v) => setF((x) => ({ ...x, agree: v }))} label="These details are mine and correct, and Suraj Logistic may call me about this request." />
              </div>
              <ErrorNote>{err}</ErrorNote>
              <Button type="submit" variant="primary" size="lg" className="mt-5 w-full sm:w-auto" disabled={busy}>
                {busy ? 'Sending…' : `Ask to join as ${meta.t.toLowerCase()}`}
              </Button>
            </section>
          </div>

          <aside className="min-w-0 lg:sticky lg:top-[88px] lg:self-start">
            <div className="sheet p-5 sm:p-6">
              <p className="eyebrow">What happens next</p>
              <ol className="mt-4 space-y-4">
                {[
                  ['You send this form', 'It takes two minutes. We keep your password safely; nobody at the office can read it.'],
                  ['We check and call', role === 'partner' ? 'We look at your trucks and papers and talk about the lanes you run.' : role === 'driver' ? 'We check your licence and talk about the trucks you have driven.' : 'We call to understand what you need.'],
                  ['You get your login', 'We approve the request and send you a WhatsApp. Log in with your mobile number.'],
                ].map(([t, d], i) => (
                  <li key={t} className="flex gap-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sign-soft font-mono text-[12px] text-sign">{i + 1}</span>
                    <span>
                      <span className="block text-[15px] font-[600]">{t}</span>
                      <span className="mt-0.5 block text-[14px] leading-relaxed text-muted">{d}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            {role === 'partner' && (
              <div className="mt-4 rounded-[20px] border border-line bg-sheet p-5">
                <p className="eyebrow mb-3">Trucks we work with</p>
                <div className="flex flex-wrap items-end gap-x-4 gap-y-3 text-muted">
                  {LINEUP.map((v) => (
                    <TruckThumb key={v} type={v} height={26} />
                  ))}
                </div>
                <Link to="/truck-owners" className="mt-4 inline-block text-[14.5px] font-[560] text-accent hover:underline">
                  How it works for truck owners
                </Link>
              </div>
            )}
            <p className="mt-4 px-1 text-[14px] text-muted">
              Already approved? <Link to="/login" className="font-[560] text-accent underline underline-offset-[3px]">Log in</Link>
            </p>
          </aside>
        </div>
      </form>
    </SitePage>
  );
}
