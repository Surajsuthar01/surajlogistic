import { Boxes, Gauge, LogOut, Menu, Moon, Package, ReceiptIndianRupee, Settings, Sparkles, Sun, Store, Truck, Route as RouteIcon, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { DEMO } from '../lib/api';
import { useAuth } from '../lib/auth';
import { CopilotDrawer } from './Copilot';

const NAV = [
  { to: '/', label: 'Control tower', icon: Gauge, roles: ['admin', 'ops'] },
  { to: '/shipments', label: 'Shipments', icon: Package, roles: ['admin', 'ops', 'customer'] },
  { to: '/trips', label: 'Trips', icon: RouteIcon, roles: ['admin', 'ops'] },
  { to: '/fleet', label: 'Fleet & drivers', icon: Truck, roles: ['admin', 'ops'] },
  { to: '/marketplace', label: 'Load board', icon: Store, roles: ['admin', 'ops'] },
  { to: '/warehouse', label: 'Warehouse', icon: Boxes, roles: ['admin', 'ops', 'warehouse'] },
  { to: '/billing', label: 'Billing', icon: ReceiptIndianRupee, roles: ['admin', 'ops'] },
  { to: '/settings', label: 'Settings', icon: Settings, roles: ['admin'] },
];

function useTheme() {
  const [theme, setTheme] = useState<string | null>(() => {
    try {
      return localStorage.getItem('sl_theme');
    } catch {
      return null;
    }
  });
  useEffect(() => {
    if (theme) document.documentElement.setAttribute('data-theme', theme);
    else document.documentElement.removeAttribute('data-theme');
    try {
      if (theme) localStorage.setItem('sl_theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  const dark = theme ? theme === 'dark' : typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return { dark, toggle: () => setTheme(dark ? 'light' : 'dark') };
}

export function Brand({ small }: { small?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg width={small ? 28 : 34} height={small ? 28 : 34} viewBox="0 0 34 34" aria-hidden="true">
        <circle cx="17" cy="17" r="16" fill="var(--accent)" />
        <path d="M5 21h24" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M9 21a8 8 0 0 1 16 0" fill="var(--panel)" />
        <path d="M17 6v3M8.5 9.5l2 2M25.5 9.5l-2 2" stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
      <div className="leading-none">
        <div className="font-display text-[20px] font-bold tracking-tight">SurajLogistic</div>
        {!small && <div className="mt-0.5 text-[12px] text-muted">Control tower</div>}
      </div>
    </div>
  );
}

export function Layout() {
  const { user, org, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [copilot, setCopilot] = useState(false);
  const loc = useLocation();
  const { dark, toggle } = useTheme();
  useEffect(() => setOpen(false), [loc.pathname]);
  const nav = NAV.filter((n) => user && n.roles.includes(user.role));
  const staff = user?.role === 'admin' || user?.role === 'ops';

  const side: ReactNode = (
    <nav className="flex h-full flex-col gap-1 p-3" aria-label="Main">
      <div className="mb-4 px-2 pt-1">
        <Brand />
      </div>
      {nav.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `flex h-10 items-center gap-3 rounded-[10px] px-3 text-[14.5px] font-medium ${isActive ? 'bg-ink text-panel' : 'text-muted hover:bg-panel-2 hover:text-ink'}`}>
          <n.icon size={18} />
          {n.label}
        </NavLink>
      ))}
      <div className="mt-auto space-y-2 border-t border-line pt-3">
        <div className="px-2 text-[13px]">
          <div className="font-medium">{user?.name}</div>
          <div className="text-muted">
            {org?.name} · {user?.role}
          </div>
        </div>
        <div className="flex gap-1">
          <button type="button" onClick={toggle} className="flex h-9 flex-1 items-center justify-center gap-2 rounded-[10px] text-[13.5px] text-muted hover:bg-panel-2 hover:text-ink" aria-label="Switch colour theme">
            {dark ? <Sun size={16} /> : <Moon size={16} />} {dark ? 'Light' : 'Dark'}
          </button>
          <button type="button" onClick={logout} className="flex h-9 flex-1 items-center justify-center gap-2 rounded-[10px] text-[13.5px] text-muted hover:bg-panel-2 hover:text-ink">
            <LogOut size={16} /> Log out
          </button>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-[236px] shrink-0 border-r border-line bg-panel lg:block">{side}</aside>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setOpen(false)}>
          <aside className="h-full w-[260px] bg-panel" onClick={(e) => e.stopPropagation()} style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingLeft: 'env(safe-area-inset-left, 0px)' }}>
            {side}
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky z-30 flex h-14 items-center justify-between gap-3 border-b border-line bg-panel/95 backdrop-blur lg:hidden" style={{ top: 'env(safe-area-inset-top, 0px)', paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))', paddingRight: 'max(16px, env(safe-area-inset-right, 0px))' }}>
          <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" className="grid h-10 w-10 place-items-center rounded-[10px] hover:bg-panel-2">
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
          <Brand small />
          <span className="w-10" />
        </header>
        {DEMO && (
          <div className="bg-accent-soft py-1.5 text-center text-[13px] text-accent-ink" style={{ paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))', paddingRight: 'max(16px, env(safe-area-inset-right, 0px))' }}>
            Demo mode: sample data for a made-up company, running in your browser. Changes reset when you reload.
          </div>
        )}
        <main className="mx-auto w-full max-w-[1400px] flex-1 pt-6 pb-24" style={{ paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))', paddingRight: 'max(16px, env(safe-area-inset-right, 0px))' }}>
          <Outlet />
        </main>
      </div>
      {staff && !copilot && (
        <button
          type="button"
          onClick={() => setCopilot(true)}
          aria-label="Ask copilot"
          className="fixed z-30 flex h-12 items-center gap-2 rounded-full bg-ink px-4 font-medium text-panel sm:px-5"
          style={{ boxShadow: 'var(--shadow)', right: 'max(20px, calc(env(safe-area-inset-right, 0px) + 12px))', bottom: 'max(20px, calc(env(safe-area-inset-bottom, 0px) + 12px))' }}
        >
          <Sparkles size={18} className="text-accent" /> <span className="hidden sm:inline">Ask copilot</span>
        </button>
      )}
      <CopilotDrawer open={copilot} onClose={() => setCopilot(false)} />
    </div>
  );
}
