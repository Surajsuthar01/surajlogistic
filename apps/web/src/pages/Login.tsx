import { DEMO_LOGINS, DEMO_PASSWORD } from '@suraj/core';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Brand } from '../components/Layout';
import { Button, ErrorNote, Field, Input } from '../components/ui';
import { DEMO, errorText } from '../lib/api';
import { useAuth } from '../lib/auth';

export function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('admin@surajlogistic.in');
  const [password, setPassword] = useState(DEMO ? DEMO_PASSWORD : '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const go = async (e?: string, p?: string) => {
    setBusy(true);
    setError(null);
    try {
      const u = await login(e ?? email, p ?? password);
      nav(u.role === 'driver' ? '/driver' : '/', { replace: true });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-full lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-ink p-10 text-panel lg:flex lg:flex-col lg:justify-between">
        <Brand />
        <div className="max-w-[30rem]">
          <h1 className="font-display text-[44px] font-bold leading-[1.05]">Every truck, parcel and rupee on one screen.</h1>
          <p className="mt-4 text-[17px] opacity-80">Trucking, courier, load board and warehouse for Indian transporters — with a copilot that answers in Hinglish.</p>
        </div>
        <svg viewBox="0 0 520 120" className="w-full max-w-[520px] opacity-90" aria-hidden="true">
          <line x1="10" y1="90" x2="510" y2="90" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" strokeDasharray="10 10" />
          {[60, 190, 330, 470].map((x, i) => (
            <g key={x}>
              <circle cx={x} cy={90} r={6} fill="var(--accent)" />
              <text x={x} y={118} textAnchor="middle" fontSize="13" fill="currentColor" opacity="0.75">
                {['Ratlam', 'Indore', 'Jaipur', 'Delhi'][i]}
              </text>
            </g>
          ))}
          <path d="M60 90 Q125 30 190 90 T330 90" fill="none" stroke="var(--accent)" strokeWidth="3" />
        </svg>
      </section>

      <section className="flex flex-col justify-center gap-6 py-10" style={{ paddingLeft: 'max(20px, env(safe-area-inset-left, 0px))', paddingRight: 'max(20px, env(safe-area-inset-right, 0px))' }}>
        <div className="mx-auto w-full max-w-[400px]">
          <div className="mb-8 lg:hidden">
            <Brand />
          </div>
          <h2 className="text-[26px] font-bold">Log in</h2>
          <p className="mt-1 text-[14.5px] text-muted">Use your work email. Drivers log in with the email their dispatcher set up.</p>
          <form
            className="mt-6 flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void go();
            }}
          >
            <Field label="Email" htmlFor="login-email">
              <Input id="login-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label="Password" htmlFor="login-password">
              <Input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            <ErrorNote>{error}</ErrorNote>
            <Button variant="primary" type="submit" disabled={busy} className="h-11">
              {busy ? 'Logging in…' : 'Log in'}
            </Button>
          </form>

          <div className="mt-8">
            <p className="text-[13.5px] font-medium">Try the demo company as</p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {DEMO_LOGINS.map((d) => (
                <button key={d.email} type="button" disabled={busy} onClick={() => go(d.email, DEMO_PASSWORD)} className="rounded-[10px] border border-line bg-panel px-3 py-2 text-left hover:border-route">
                  <div className="text-[14px] font-medium">{d.label}</div>
                  <div className="truncate text-[12.5px] text-muted">{d.email}</div>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[12.5px] text-muted">Demo password: {DEMO_PASSWORD}</p>
          </div>

          <p className="mt-8 text-[14px] text-muted">
            Have a tracking number?{' '}
            <Link to="/track" className="font-medium text-route underline underline-offset-2">
              Track a shipment
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
