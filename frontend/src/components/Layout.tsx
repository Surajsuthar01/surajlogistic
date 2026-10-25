import type { Role } from '@suraj/shared';
import { BarChart3, Boxes, Building2, ChevronDown, Gauge, Inbox, LogOut, Map as MapIcon, Menu, MessageSquareText, Moon, Package, ReceiptIndianRupee, Route as RouteIcon, Search, Settings, Sparkles, Store, Sun, Truck, UserRound, Users, X } from 'lucide-react';
import { Suspense, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { DEMO } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/hooks';
import { useIslandLive, useWide } from '../lib/live';
import { useTheme } from '../lib/theme';
import { Mark, Wordmark } from './Brand';
import { CopilotDrawer } from './Copilot';
import { GlobalSearch } from './GlobalSearch';
import { Loading } from './ui';
import { Avatar, ROLE_LABEL } from './Person';

export { useTheme };

interface NavItem {
  to: string;
  label: string;
  short?: string;
  icon: typeof Gauge;
  roles: Role[];
  blurb: string;
}

/** Work pages, most used first. The first few sit in the island; the rest open from it. */
export const MAIN: NavItem[] = [
  { to: '/', label: 'Control tower', icon: Gauge, roles: ['admin', 'ops'], blurb: 'Live map and what needs you today' },
  { to: '/shipments', label: 'Shipments', icon: Package, roles: ['admin', 'ops', 'customer'], blurb: 'Book, track, deliver, print labels' },
  { to: '/requests', label: 'Requests', icon: Inbox, roles: ['admin', 'ops'], blurb: 'Website bookings and people asking to join' },
  { to: '/trips', label: 'Trips', icon: RouteIcon, roles: ['admin', 'ops'], blurb: 'Trucks on the road and what each earns' },
  { to: '/fleet', label: 'Fleet & drivers', short: 'Fleet', icon: Truck, roles: ['admin', 'ops'], blurb: 'Vehicles, papers and licences' },
  { to: '/billing', label: 'Billing', icon: ReceiptIndianRupee, roles: ['admin', 'ops', 'customer'], blurb: 'GST invoices and who owes what' },
  { to: '/customers', label: 'Customers', icon: Building2, roles: ['admin', 'ops'], blurb: 'Shippers, credit terms, portal logins' },
  { to: '/routes', label: 'Route planner', icon: MapIcon, roles: ['admin', 'ops'], blurb: 'Shortest order for many drops' },
  { to: '/marketplace', label: 'Load board', icon: Store, roles: ['admin', 'ops'], blurb: 'Find loads and fill empty trucks' },
  { to: '/warehouse', label: 'Warehouse', icon: Boxes, roles: ['admin', 'ops', 'warehouse'], blurb: 'Stock, bins, receiving and dispatch' },
  { to: '/reports', label: 'Reports', icon: BarChart3, roles: ['admin', 'ops'], blurb: 'Lanes, customers and drivers by date' },
];

/** Company housekeeping. */
export const ACCOUNT: NavItem[] = [
  { to: '/team', label: 'Team & logins', icon: Users, roles: ['admin'], blurb: 'Who can log in, and as what' },
  { to: '/messages', label: 'Messages sent', icon: MessageSquareText, roles: ['admin', 'ops'], blurb: 'Every WhatsApp and SMS that went out' },
  { to: '/settings', label: 'Settings', icon: Settings, roles: ['admin'], blurb: 'Company, pricing, API and your data' },
];

/** How many work pages sit in the bar itself; the rest open from "More". */
const INLINE_XL = 6;
const INLINE_LG = 4;

const isActive = (to: string, path: string) => (to === '/' ? path === '/' : path === to || path.startsWith(to + '/'));

/** Keeps the island's width equal to its content, so it can animate between shapes. */
function useContentWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.offsetWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setW(el.offsetWidth));
    ro.observe(el);
    return () => ro.disconnect();
  });
  return [ref, w] as const;
}

type Mode = 'idle' | 'more' | 'account' | 'search' | 'menu';

export function Layout() {
  const { user, org, logout } = useAuth();
  const loc = useLocation();
  const navTo = useNavigate();
  const wide = useWide();
  const xl = useWide('(min-width: 1360px)');
  const { dark, toggle } = useTheme();
  const [mode, setMode] = useState<Mode>('idle');
  const [copilot, setCopilot] = useState(false);
  const island = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const [pill, setPill] = useState<CSSProperties>({ opacity: 0 });
  const [content, contentW] = useContentWidth();

  const staff = user?.role === 'admin' || user?.role === 'ops';
  const { moving, flash } = useIslandLive(!!staff);
  const { data: waiting } = useApi<{ bookings: number; joins: number }>(staff ? '/api/requests/summary' : null, { liveTypes: ['shipment.requested', 'shipment.status', 'join.requested', 'join.decided'] });
  const waitingCount = (waiting?.bookings ?? 0) + (waiting?.joins ?? 0);
  const badge = (to: string) =>
    to === '/requests' && waitingCount > 0 ? (
      <span className="ml-1.5 inline-grid h-[18px] min-w-[18px] place-items-center rounded-full bg-orange px-1 font-mono text-[11px] leading-none font-[600] text-black" aria-label={`${waitingCount} waiting`}>
        {waitingCount}
      </span>
    ) : null;
  const main = MAIN.filter((n) => user && n.roles.includes(user.role));
  const account = ACCOUNT.filter((n) => user && n.roles.includes(user.role));
  const inlineCount = xl ? INLINE_XL : INLINE_LG;
  const inline = main.slice(0, inlineCount);
  const rest = main.slice(inlineCount);
  const restActive = rest.find((n) => isActive(n.to, loc.pathname));
  const current = [...main, ...account].find((n) => isActive(n.to, loc.pathname));

  useEffect(() => setMode('idle'), [loc.pathname]);
  useEffect(() => {
    if (mode === 'idle') return;
    const away = (e: MouseEvent) => !island.current?.contains(e.target as Node) && setMode('idle');
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMode('idle');
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [mode]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        setMode('search');
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  useEffect(() => {
    document.body.style.overflow = !wide && mode === 'menu' ? 'hidden' : '';
    return () => void (document.body.style.overflow = '');
  }, [mode, wide]);

  // The white pill slides to whichever page is open.
  useLayoutEffect(() => {
    const place = () => {
      const el = navRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
      setPill(el ? { left: el.offsetLeft, width: el.offsetWidth, opacity: 1 } : { opacity: 0, left: 0, width: 0 });
    };
    place();
    const nav = navRef.current;
    if (!nav || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(place);
    ro.observe(nav);
    void document.fonts?.ready.then(place);
    return () => ro.disconnect();
  }, [loc.pathname, mode, wide, xl, user?.role]);

  const gutter = { paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))', paddingRight: 'max(16px, env(safe-area-inset-right, 0px))' };
  const toggleMode = (m: Mode) => setMode((cur) => (cur === m ? 'idle' : m));

  const live = staff && (
    <button
      type="button"
      onClick={() => navTo('/trips?status=IN_TRANSIT')}
      title="Trucks on the road right now"
      className="flex h-9 min-w-0 items-center gap-2 rounded-full px-2.5 transition-colors hover:bg-white/[0.07]"
    >
      <span className={`live-dot shrink-0 ${flash?.tone === 'bad' ? 'text-[#ff5d52]' : 'text-[#4d8bff]'}`} />
      {flash ? (
        <span key={flash.text} className="pop-in max-w-[280px] truncate text-[13px] text-white">
          {flash.text}
        </span>
      ) : (
        <span className="font-display font-[560] text-[12.5px] whitespace-nowrap text-white/75">{moving ?? '0'} moving</span>
      )}
    </button>
  );

  const panelLinks = (items: NavItem[], cols: string) => (
    <div className={`grid gap-1 ${cols}`}>
      {items.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive: on }) => `group flex items-center gap-3 rounded-[16px] p-2.5 transition-colors ${on ? 'bg-white/[0.09]' : 'hover:bg-white/[0.06]'}`}>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-white/[0.06] text-white/85 ring-1 ring-white/10 group-hover:text-white">
            <n.icon size={18} strokeWidth={1.8} />
          </span>
          <span className="min-w-0">
            <span className="flex items-center text-[14px] font-[560] text-white">
              {n.label}
              {badge(n.to)}
            </span>
            <span className="block truncate text-[12.5px] text-white/50">{n.blurb}</span>
          </span>
        </NavLink>
      ))}
    </div>
  );

  const profileCard = user && (
    <div className="overflow-hidden rounded-[20px] bg-white/[0.04] ring-1 ring-white/[0.07]">
      <div className="relative h-[68px] overflow-hidden" style={{ background: 'radial-gradient(120% 160% at 0% 0%, rgb(47 107 255 / 0.6), transparent 62%), radial-gradient(90% 140% at 100% 100%, rgb(255 138 61 / 0.5), transparent 60%), #0b0d12' }}>
        <span className="absolute inset-0 opacity-70" style={{ backgroundImage: 'radial-gradient(rgb(255 255 255 / 0.2) 1px, transparent 1.3px)', backgroundSize: '9px 9px' }} aria-hidden="true" />
      </div>
      <div className="px-3.5 pb-3.5">
        <div className="relative z-10 -mt-7 flex items-end justify-between gap-2">
          <Avatar name={user.name} size={56} className="ring-4 ring-[#101114]" />
          <span className="mb-0.5 rounded-full bg-white/[0.09] px-2.5 py-1 font-display text-[12px] font-[560] text-white/85">{ROLE_LABEL[user.role]}</span>
        </div>
        <div className="mt-2.5 truncate text-[16px] font-[600] text-white">{user.name}</div>
        <div className="truncate text-[12.5px] text-white/55">{user.email}</div>
        <div className="mt-0.5 truncate font-display text-[12px] font-[560] text-white/40">{org?.name}</div>
        <div className="mt-3.5 grid grid-cols-2 gap-1 rounded-full bg-white/[0.06] p-1" role="group" aria-label="Look">
          <button type="button" aria-pressed={dark} onClick={() => !dark && toggle()} className={`flex h-8 items-center justify-center gap-1.5 rounded-full text-[13px] transition-colors ${dark ? 'bg-white font-[560] text-black' : 'text-white/65 hover:text-white'}`}>
            <Moon size={14} /> Night
          </button>
          <button type="button" aria-pressed={!dark} onClick={() => dark && toggle()} className={`flex h-8 items-center justify-center gap-1.5 rounded-full text-[13px] transition-colors ${!dark ? 'bg-white font-[560] text-black' : 'text-white/65 hover:text-white'}`}>
            <Sun size={14} /> Day
          </button>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <Link to="/profile" className="flex h-9 items-center justify-center gap-1.5 rounded-full bg-white/[0.07] text-[13px] text-white transition-colors hover:bg-white/[0.13]">
            <UserRound size={15} /> Your profile
          </Link>
          <button type="button" onClick={logout} className="flex h-9 items-center justify-center gap-1.5 rounded-full bg-white/[0.07] text-[13px] text-[#ff8a80] transition-colors hover:bg-[#ff5d52]/15">
            <LogOut size={15} /> Log out
          </button>
        </div>
      </div>
    </div>
  );

  const accountBlock = user && (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {profileCard}
      {account.length > 0 && (
        <nav aria-label="Company">
          <p className="px-2.5 pt-1 pb-2 font-display font-[560] text-[12px] text-white/40">Company</p>
          {panelLinks(account, 'grid-cols-1')}
        </nav>
      )}
    </div>
  );

  const searchBox = (
    <div className="px-3.5 py-1.5" style={{ width: wide ? 640 : '100%' }}>
      <GlobalSearch autoFocus onDone={() => setMode('idle')} />
    </div>
  );

  const desktopIsland = (
    <div ref={content} className="flex w-max flex-col">
      {mode === 'search' ? (
        searchBox
      ) : (
        <div className="flex h-[54px] items-center gap-1 pr-2 pl-4">
          <Link to="/" className="mr-1 flex shrink-0 items-center gap-2 text-white" aria-label="Surajlogistic home">
            <Mark size={26} />
            <Wordmark size={17} />
          </Link>
          <span className="mx-2 h-5 w-px shrink-0 bg-white/12" aria-hidden="true" />
          <nav ref={navRef} aria-label="Main" className="relative flex items-center">
            <span className="island-pill" style={pill} aria-hidden="true" />
            {inline.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === '/'} className="island-link">
                {n.short ?? n.label}
                {badge(n.to)}
              </NavLink>
            ))}
            {rest.length > 0 && (
              <button type="button" onClick={() => toggleMode('more')} aria-expanded={mode === 'more'} aria-current={restActive ? 'page' : undefined} className="island-link gap-1">
                {restActive?.label ?? 'More'}
                <ChevronDown size={15} className={`transition-transform duration-300 ${mode === 'more' ? 'rotate-180' : ''}`} />
              </button>
            )}
          </nav>
          {staff && <span className="mx-2 h-5 w-px shrink-0 bg-white/12" aria-hidden="true" />}
          {live}
          <button type="button" onClick={() => setMode('search')} aria-label="Search (press /)" title="Search (press /)" className="island-icon ml-1">
            <Search size={17} />
          </button>
          {staff && (
            <button type="button" onClick={() => setCopilot(true)} aria-label="Ask copilot" title="Ask copilot" className="island-icon">
              <Sparkles size={17} />
            </button>
          )}
          {user && (
            <button type="button" onClick={() => toggleMode('account')} aria-haspopup="true" aria-expanded={mode === 'account'} aria-label="Account" className="ml-1 rounded-full p-0.5 ring-white/0 transition hover:ring-2 hover:ring-white/20">
              <Avatar name={user.name} size={34} />
            </button>
          )}
        </div>
      )}
      {mode === 'more' && (
        <div className="island-drop border-t border-white/10 p-3">
          <p className="px-2.5 pt-1 pb-2 font-display font-[560] text-[12px] text-white/40">More pages</p>
          <nav aria-label="More pages">{panelLinks(rest, 'grid-cols-2')}</nav>
        </div>
      )}
      {mode === 'account' && user && (
        <div className={`island-drop grid gap-3 border-t border-white/10 p-3 ${account.length ? 'grid-cols-[minmax(250px,0.85fr)_minmax(0,1.5fr)]' : 'grid-cols-[minmax(0,1fr)]'}`}>
          {profileCard}
          {account.length > 0 ? (
            <nav aria-label="Company">
              <p className="px-2.5 pt-1 pb-2 font-display font-[560] text-[12px] text-white/40">Company</p>
              {panelLinks(account, 'grid-cols-1')}
            </nav>
          ) : null}
        </div>
      )}
    </div>
  );

  const phoneIsland = (
    <div className="flex w-full flex-col">
      {mode === 'search' ? (
        searchBox
      ) : (
        <div className="flex h-[52px] items-center gap-1 pr-1.5 pl-3.5">
          <Link to="/" className="flex min-w-0 flex-1 items-center gap-2 text-white" aria-label="Surajlogistic home">
            <Mark size={26} />
            <span className="flex min-w-0 flex-col gap-[3px]">
              <Wordmark size={15.5} />
              <span className="truncate text-[11.5px] leading-none text-white/55">{current?.short ?? current?.label ?? (loc.pathname === '/profile' ? 'Your profile' : 'To every direction')}</span>
            </span>
          </Link>
          {staff && (
            <span className="mr-0.5 flex items-center gap-1.5 font-mono text-[11px] text-white/70">
              <span className={`live-dot ${flash?.tone === 'bad' ? 'text-[#ff5d52]' : 'text-[#4d8bff]'}`} />
              {moving ?? 0}
            </span>
          )}
          <button type="button" onClick={() => setMode('search')} aria-label="Search" className="island-icon">
            <Search size={18} />
          </button>
          {staff && (
            <button type="button" onClick={() => setCopilot(true)} aria-label="Ask copilot" className="island-icon">
              <Sparkles size={18} />
            </button>
          )}
          <button type="button" onClick={() => toggleMode('menu')} aria-label={mode === 'menu' ? 'Close menu' : 'Open menu'} aria-expanded={mode === 'menu'} className="island-icon">
            {mode === 'menu' ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>
      )}
      {flash && mode === 'idle' && (
        <p key={flash.text} className="pop-in truncate border-t border-white/10 px-4 py-2 text-[12.5px] text-white/80">
          {flash.text}
        </p>
      )}
      {mode === 'menu' && (
        <div className="island-drop max-h-[calc(100dvh-90px)] overflow-y-auto border-t border-white/10 p-2.5">
          <nav aria-label="Main">{panelLinks(main, 'grid-cols-1 sm:grid-cols-2')}</nav>
          <div className="mt-2 border-t border-white/10 pt-3">{accountBlock}</div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)', ...gutter }}>
        {!wide && mode === 'menu' && <div className="pointer-events-auto fixed inset-0 -z-10 bg-black/50 backdrop-blur-[2px]" onClick={() => setMode('idle')} />}
        <div
          ref={island}
          className="island pointer-events-auto overflow-hidden"
          style={wide ? { width: contentW ?? undefined, maxWidth: 'calc(100vw - 32px)' } : { width: '100%', maxWidth: 600 }}
        >
          {wide ? desktopIsland : phoneIsland}
        </div>
      </div>

      <main className="mx-auto w-full max-w-[1360px] flex-1 pb-20" style={{ ...gutter, paddingTop: wide ? 108 : 84 }}>
        {DEMO && (
          <p className="mb-6 flex items-center gap-2 font-display font-[560] text-[12.5px] text-faint">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-orange" aria-hidden="true" />
            Demo company, made-up data. Resets when you reload.
          </p>
        )}
        <Suspense fallback={<Loading rows={6} />}>
          <Outlet />
        </Suspense>
      </main>
      {staff && !copilot && (
        <button
          type="button"
          onClick={() => setCopilot(true)}
          aria-label="Ask copilot"
          className="copilot-fab fixed z-30 flex h-12 items-center gap-2 rounded-full bg-[#0b0d12] pr-4 pl-3 text-[14px] font-[560] text-white shadow-[0_10px_30px_-8px_rgb(0_0_0_/_0.55)] ring-1 ring-white/12 transition-transform hover:-translate-y-0.5"
          style={{ right: 'max(18px, env(safe-area-inset-right, 0px))', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 18px)' }}
        >
          <span className="grid h-8 w-8 place-items-center rounded-full" style={{ background: 'radial-gradient(circle at 35% 30%, #ffd66b, #ff8a1f 60%, #f2541b)' }}>
            <Sparkles size={16} className="text-[#0b0d12]" />
          </span>
          <span className="hidden sm:inline">Ask copilot</span>
        </button>
      )}
      <CopilotDrawer open={copilot} onClose={() => setCopilot(false)} />
    </div>
  );
}
