import { DEMO_LOGINS, DEMO_PASSWORD } from '@suraj/shared';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthShell } from '../components/AuthShell';
import { Button, ErrorNote, Field, Input } from '../components/ui';
import { DEMO, errorText } from '../lib/api';
import { useAuth } from '../lib/auth';

const ROLE_NOTE: Record<string, string> = {
  'admin@surajlogistic.in': 'Everything, including money and settings',
  'ops@surajlogistic.in': 'Bookings, trips, fleet and the load board',
  'driver@surajlogistic.in': 'Phone app in Hindi, opens on a live trip',
  'warehouse@surajlogistic.in': 'Stock, bins, receiving and dispatch',
  'shipper@shreetextiles.in': 'A customer who sees only their own parcels',
};

export function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState(DEMO ? 'admin@surajlogistic.in' : '');
  const [password, setPassword] = useState(DEMO ? DEMO_PASSWORD : '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);

  const go = async (e?: string, p?: string) => {
    setBusy(true);
    setError(null);
    try {
      const u = await login(e ?? email, p ?? password);
      nav(u.role === 'driver' ? '/driver' : u.role === 'partner' ? '/partner' : '/', { replace: true });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <h2 className="t-title">Log in</h2>
      <p className="mt-1.5 text-[15px] text-muted">Office staff use their work email. Drivers, truck owners and customers who joined from the website use their mobile number.</p>
      <form
        className="mt-6 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void go();
        }}
      >
        <Field label="Email or mobile number" htmlFor="login-email">
          <Input id="login-email" type="text" inputMode="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field
          label={
            <span className="flex items-baseline justify-between">
              Password
              <button type="button" onClick={() => setForgot((f) => !f)} className="text-[13.5px] font-normal text-muted underline underline-offset-2 hover:text-ink">
                Forgot it?
              </button>
            </span>
          }
          htmlFor="login-password"
        >
          <Input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        {forgot && <p className="text-[14px] text-muted">Ask your company's owner to set a new password from Team &amp; logins. If you are the owner, write to support from your registered email.</p>}
        <ErrorNote>{error}</ErrorNote>
        <Button variant="primary" size="lg" type="submit" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </Button>
      </form>
      <p className="mt-5 text-[15px] text-muted">
        No login yet?{' '}
        <Link to="/join" className="font-[560] text-accent underline underline-offset-[3px]">
          Ask to join Suraj Logistic
        </Link>{' '}
        or{' '}
        <Link to="/send" className="font-[560] text-accent underline underline-offset-[3px]">
          send a parcel without one
        </Link>
      </p>

      {DEMO && (
        <div className="mt-9 border-t border-line pt-5">
          <p className="eyebrow">Demo company</p>
          <p className="mt-1.5 text-[14.5px] text-muted">Open it as any of these people. Each login sees a different part of the product.</p>
          <ul className="mt-4 divide-y divide-line overflow-hidden rounded-[18px] border border-line bg-sheet">
            {DEMO_LOGINS.map((d) => (
              <li key={d.email}>
                <button type="button" disabled={busy} onClick={() => go(d.email, DEMO_PASSWORD)} className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--hover)]">
                  <span className="min-w-0">
                    <span className="block text-[15px] font-[560]">{d.label}</span>
                    <span className="block truncate text-[13.5px] text-muted">{ROLE_NOTE[d.email] ?? d.email}</span>
                  </span>
                  <span className="shrink-0 rounded-full border border-line-strong px-3 py-1 text-[12.5px] font-[540] text-ink transition-colors group-hover:border-ink">Open</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[13px] text-muted">All demo logins use the password {DEMO_PASSWORD}.</p>
        </div>
      )}

      <p className="mt-8 text-[15px] text-muted">
        Waiting for a parcel?{' '}
        <Link to="/track" className="font-[560] text-ink underline underline-offset-[3px]">
          Track it here
        </Link>
      </p>
    </AuthShell>
  );
}
