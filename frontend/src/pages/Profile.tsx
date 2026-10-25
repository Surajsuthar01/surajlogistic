import type { UserRec } from '@suraj/shared';
import { ArrowUpRight, Check, KeyRound, LogOut, Moon, Sun } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ACCOUNT, MAIN } from '../components/Layout';
import { Avatar, ROLE_LABEL, ROLE_TEXT } from '../components/Person';
import { Button, ErrorNote, Field, Input, Sheet, useToast } from '../components/ui';
import { api, DEMO, setToken } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dateOnly } from '../lib/format';
import { useAction } from '../lib/hooks';
import { useTheme } from '../lib/theme';

/** Your own page: who you are here, how the app looks for you, and your password. */
export function Profile() {
  const { user, org, logout } = useAuth();
  if (!user) return null;
  const pages = [...MAIN, ...ACCOUNT].filter((n) => n.roles.includes(user.role));

  return (
    <div className="mx-auto max-w-[1120px]">
      <section className="rise overflow-hidden rounded-[28px] border border-line bg-sheet">
        <div className="relative h-[150px] overflow-hidden sm:h-[190px]" style={{ background: '#07080b' }} aria-hidden="true">
          <div className="absolute inset-0" style={{ background: 'radial-gradient(70% 120% at 8% 0%, rgb(47 107 255 / 0.55), transparent 60%)' }} />
          <div className="absolute inset-0 opacity-60" style={{ backgroundImage: 'radial-gradient(rgb(255 255 255 / 0.22) 1px, transparent 1.4px)', backgroundSize: '12px 12px', maskImage: 'linear-gradient(90deg, #000 0%, transparent 75%)', WebkitMaskImage: 'linear-gradient(90deg, #000 0%, transparent 75%)' }} />
          {/* The sun coming up over the road. */}
          <div className="absolute right-[8%] -bottom-[110px] h-[220px] w-[220px] rounded-full sm:-bottom-[130px] sm:h-[260px] sm:w-[260px]" style={{ background: 'radial-gradient(circle at 50% 50%, #ffb46b 0%, #ff7a2f 45%, rgb(255 122 47 / 0) 72%)' }} />
          <div className="absolute inset-x-0 bottom-0 h-px bg-white/20" />
          <p className="absolute top-5 left-6 font-display text-[12.5px] font-[560] text-white/55">Your profile</p>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 px-5 pb-6 sm:px-8">
          <div className="flex min-w-0 flex-col items-start gap-4 sm:flex-row sm:items-end sm:gap-5">
            <Avatar name={user.name} size={104} className="relative z-10 -mt-[52px] ring-[6px] ring-[var(--sheet)]" />
            <div className="min-w-0 pb-1">
              <h1 className="break-words font-display sm:truncate text-[clamp(26px,3.2vw,40px)] leading-none font-[600] tracking-[-0.035em]">{user.name}</h1>
              <p className="mt-2 truncate text-[15px] text-muted">{user.email}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-8 items-center rounded-full bg-sign-soft px-3.5 font-display text-[12.5px] font-[560] text-sign">{ROLE_LABEL[user.role]}</span>
            {org && <span className="inline-flex h-8 items-center rounded-full border border-line px-3.5 text-[13.5px] text-muted">{org.name}</span>}
            <span className="inline-flex h-8 items-center rounded-full border border-line px-3.5 text-[13.5px] text-muted">Since {dateOnly(user.createdAt)}</span>
          </div>
        </div>
      </section>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 gap-5">
          <Details user={user} />
          <Password />
        </div>
        <div className="grid min-w-0 gap-5">
          <Appearance />
          <Sheet title="Shortcuts">
            <dl className="grid gap-2.5 text-[14.5px]">
              {[
                ['/', 'Search shipments, trips, trucks and customers'],
                ['Esc', 'Close any panel or window'],
                ['Enter', 'Send a question to the copilot'],
                ['Shift + Enter', 'New line in the copilot'],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-4">
                  <dd className="text-muted">{v}</dd>
                  <dt>
                    <kbd className="inline-flex h-7 min-w-7 items-center justify-center rounded-[8px] border border-line-strong bg-sheet-2 px-2 font-mono text-[12px] whitespace-nowrap">{k}</kbd>
                  </dt>
                </div>
              ))}
            </dl>
          </Sheet>
          <button type="button" onClick={logout} className="flex h-12 items-center justify-center gap-2 rounded-full border border-line text-[15px] text-bad transition-colors hover:border-bad hover:bg-bad-soft">
            <LogOut size={17} /> Log out of {DEMO ? 'the demo' : 'this device'}
          </button>
        </div>
      </div>

      <section className="mt-10">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <p className="eyebrow">What your login opens</p>
            <h2 className="mt-2 font-display tracking-[-0.025em] text-[28px] leading-none font-[600]">{pages.length} screens as {ROLE_LABEL[user.role]}</h2>
          </div>
          <p className="max-w-[52ch] text-[14.5px] text-muted">{ROLE_TEXT[user.role]}</p>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {pages.map((n) => (
            <Link key={n.to} to={n.to} className="group flex items-center gap-3.5 rounded-[18px] border border-line bg-sheet p-4 transition-colors hover:border-line-strong hover:bg-sheet-2">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-sheet-2 text-muted ring-1 ring-line group-hover:text-ink">
                <n.icon size={18} strokeWidth={1.8} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-[560]">{n.label}</span>
                <span className="block truncate text-[13px] text-muted">{n.blurb}</span>
              </span>
              <ArrowUpRight size={15} className="shrink-0 text-faint group-hover:text-ink" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function Details({ user }: { user: UserRec }) {
  const { refresh } = useAuth();
  const toast = useToast();
  const act = useAction();
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? '');
  const dirty = name.trim() !== user.name || phone.replace(/\D/g, '').slice(-10) !== (user.phone ?? '');

  const save = (e: FormEvent) => {
    e.preventDefault();
    void act.run(async () => {
      await api.patch('/api/me', { name: name.trim(), phone: phone.trim() });
      await refresh();
      toast('Profile saved');
    });
  };

  return (
    <Sheet title="Your details" aside={<span className="eyebrow">Shown to your team</span>}>
      <form onSubmit={save} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="pf-name">
            <Input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} maxLength={80} />
          </Field>
          <Field label="Mobile" htmlFor="pf-phone" hint="You can log in with this number too.">
            <Input id="pf-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="98290 12345" />
          </Field>
        </div>
        <Field label="Email" htmlFor="pf-email" hint="Your login email. The owner of the company account can change it.">
          <Input id="pf-email" value={user.email} disabled />
        </Field>
        {act.error && <ErrorNote>{act.error}</ErrorNote>}
        <div className="flex items-center justify-end gap-3">
          <Button type="submit" variant="primary" disabled={!dirty || act.busy}>
            {act.busy ? 'Saving' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

function Password() {
  const toast = useToast();
  const act = useAction();
  const [f, setF] = useState({ current: '', next: '', again: '' });
  const mismatch = f.again.length > 0 && f.next !== f.again;

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (f.next !== f.again) return act.setError('The two new passwords do not match');
    void act.run(async () => {
      const r = await api.post<{ changed: boolean; token?: string }>('/api/me/password', { current: f.current, next: f.next });
      // Other phones and browsers are signed out; this one carries on with the fresh login.
      if (r.token) setToken(r.token);
      setF({ current: '', next: '', again: '' });
      toast('Password changed. Other devices are signed out.');
    });
  };

  return (
    <Sheet title={<h2 className="t-sub flex items-center gap-2"><KeyRound size={17} className="text-muted" /> Password</h2>}>
      <form onSubmit={save} className="grid gap-4">
        <Field label="Current password" htmlFor="pw-current">
          <Input id="pw-current" type="password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} autoComplete="current-password" required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="New password" htmlFor="pw-next" hint="At least 8 characters.">
            <Input id="pw-next" type="password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} autoComplete="new-password" required minLength={8} />
          </Field>
          <Field label="New password again" htmlFor="pw-again" hint={mismatch ? <span className="text-bad">Does not match yet</span> : undefined}>
            <Input id="pw-again" type="password" value={f.again} onChange={(e) => setF({ ...f, again: e.target.value })} autoComplete="new-password" required minLength={8} />
          </Field>
        </div>
        {act.error && <ErrorNote>{act.error}</ErrorNote>}
        <div className="flex justify-end">
          <Button type="submit" disabled={act.busy || !f.current || f.next.length < 8 || mismatch}>
            {act.busy ? 'Changing' : 'Change password'}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

/** Two little screens to pick from instead of a switch. */
function Appearance() {
  const { dark, toggle } = useTheme();
  const tile = (night: boolean) => {
    const on = night === dark;
    const bg = night ? '#07080b' : '#f4f5f7';
    const card = night ? '#15171c' : '#ffffff';
    const bar = night ? 'rgb(255 255 255 / 0.14)' : 'rgb(0 0 0 / 0.1)';
    return (
      <button type="button" aria-pressed={on} onClick={() => !on && toggle()} className={`group rounded-[18px] p-1.5 text-left ring-2 transition-colors ${on ? 'ring-sign' : 'ring-transparent hover:ring-line-strong'}`}>
        <span className="block overflow-hidden rounded-[13px] border border-line" style={{ background: bg }}>
          <span className="mx-auto mt-2.5 block h-3 w-[58%] rounded-full" style={{ background: night ? '#000' : '#0b0c0f' }} />
          <span className="mx-2.5 mt-2.5 mb-2.5 grid grid-cols-3 gap-1.5">
            <span className="col-span-2 block h-12 rounded-[7px]" style={{ background: card }}>
              <span className="mt-2 ml-2 block h-1.5 w-8 rounded-full" style={{ background: bar }} />
              <span className="mt-1.5 ml-2 block h-1.5 w-12 rounded-full" style={{ background: bar }} />
            </span>
            <span className="block h-12 rounded-[7px]" style={{ background: '#2f6bff' }} />
          </span>
        </span>
        <span className="mt-2 flex items-center justify-between px-1 pb-0.5">
          <span className="flex items-center gap-1.5 text-[14px] font-[560]">
            {night ? <Moon size={15} /> : <Sun size={15} />} {night ? 'Night' : 'Day'}
          </span>
          {on && (
            <span className="grid h-5 w-5 place-items-center rounded-full bg-sign text-white">
              <Check size={13} strokeWidth={3} />
            </span>
          )}
        </span>
      </button>
    );
  };
  return (
    <Sheet title="Look" aside={<span className="eyebrow">This device</span>}>
      <div className="grid grid-cols-2 gap-2">
        {tile(true)}
        {tile(false)}
      </div>
    </Sheet>
  );
}

