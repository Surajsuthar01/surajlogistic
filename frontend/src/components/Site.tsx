import { ArrowRight, Menu, PackageSearch, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import heroTruck from '../assets/img/hero-truck.jpg';
import { ThemeToggle } from '../lib/theme';
import { Brand, Mark, Wordmark } from './Brand';

/** Sections of the front page, and the pages around it. */
const LINKS: { label: string; section?: string; to?: string }[] = [
  { label: 'About', to: '/about' },
  { label: 'Services', section: 'services' },
  { label: 'Trucks', section: 'trucks' },
  { label: 'Truck owners', to: '/truck-owners' },
  { label: 'Features', to: '/features' },
  { label: 'FAQ', section: 'faq' },
];

/** Scrolls to a front-page section, going to the front page first if needed. */
export function useSection() {
  const nav = useNavigate();
  const loc = useLocation();
  return (id: string) => {
    if (loc.pathname === '/welcome') document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else nav('/welcome', { state: { scrollTo: id } });
  };
}

/** Lands on the right section after coming from another page. */
export function useScrollOnArrive() {
  const loc = useLocation();
  useEffect(() => {
    const id = (loc.state as { scrollTo?: string } | null)?.scrollTo;
    if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }), 60);
    else window.scrollTo(0, 0);
  }, [loc.key, loc.state]);
}

/** The website's floating island: sections, pages, tracking, log in, and the main action. */
export function SiteNav() {
  const go = useSection();
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const loc = useLocation();
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 40);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  useEffect(() => setMenu(false), [loc.pathname]);

  const item = (l: (typeof LINKS)[number], cls: string) =>
    l.to ? (
      <NavLink key={l.label} to={l.to} className={`site-link ${cls}`}>
        {l.label}
      </NavLink>
    ) : (
      <button key={l.label} type="button" onClick={() => (setMenu(false), go(l.section!))} className={cls}>
        {l.label}
      </button>
    );

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center px-3 sm:px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}>
      <div className={`island pointer-events-auto w-full max-w-[1120px] overflow-hidden transition-[background-color] ${scrolled ? '' : 'bg-black/35'}`}>
        <div className="flex h-[54px] items-center gap-1 pr-2 pl-4">
          <Link to="/welcome" className="flex shrink-0 items-center gap-2 text-white" aria-label="Surajlogistic home">
            <Mark size={24} />
            <Wordmark size={17} />
          </Link>
          <nav aria-label="Sections" className="mx-auto hidden items-center lg:flex">
            {LINKS.map((l) => item(l, 'island-link'))}
            <NavLink to="/track" className="site-link island-link">
              Track
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-1 lg:ml-0">
            <Link to="/login" className="hidden h-9 items-center rounded-full px-3.5 text-[13.5px] font-[500] text-white/75 hover:text-white sm:inline-flex">
              Log in
            </Link>
            <Link to="/send" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-[13.5px] font-[560] text-black hover:bg-white/90">
              Send a parcel
            </Link>
            <button type="button" onClick={() => setMenu((m) => !m)} aria-label={menu ? 'Close menu' : 'Open menu'} aria-expanded={menu} className="island-icon lg:hidden">
              {menu ? <X size={19} /> : <Menu size={19} />}
            </button>
          </div>
        </div>
        {menu && (
          <div className="island-drop grid gap-1 border-t border-white/10 p-2.5 sm:grid-cols-2 lg:hidden">
            {LINKS.map((l) => item(l, 'flex h-11 items-center rounded-[14px] px-3 text-left text-[15px] text-white hover:bg-white/[0.07]'))}
            <Link to="/track" className="flex h-11 items-center rounded-[14px] px-3 text-[15px] text-white hover:bg-white/[0.07]">
              Track a shipment
            </Link>
            <Link to="/join" className="flex h-11 items-center rounded-[14px] px-3 text-[15px] text-white hover:bg-white/[0.07]">
              Join us
            </Link>
            <Link to="/login" className="flex h-11 items-center rounded-[14px] px-3 text-[15px] text-white hover:bg-white/[0.07]">
              Log in
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

/** The tracking box that sits right under the navigation bar: one slim line. */
export function TrackBar({ className = '' }: { className?: string }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  return (
    <form
      role="search"
      aria-label="Track a shipment"
      className={`mx-auto flex w-full max-w-[540px] items-center gap-2 rounded-full bg-white/[0.08] p-1 pl-3.5 ring-1 ring-white/15 backdrop-blur-xl transition-shadow focus-within:ring-white/40 ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        nav(q.trim() ? `/track/${q.trim().toUpperCase().replace(/\s+/g, '')}` : '/track');
      }}
    >
      <PackageSearch size={16} className="shrink-0 text-white/55" aria-hidden="true" />
      <label htmlFor="track-awb" className="sr-only">
        Track a shipment by AWB or tracking ID
      </label>
      <input
        id="track-awb"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Track by AWB, e.g. SL40213958771"
        aria-label="AWB or tracking ID"
        autoComplete="off"
        spellCheck={false}
        className="h-9 min-w-0 flex-1 bg-transparent font-mono text-[13.5px] tracking-[0.02em] text-white placeholder:font-sans placeholder:tracking-normal placeholder:text-white/45 focus:outline-none"
      />
      <button type="submit" className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-white px-4 text-[13.5px] font-[560] text-black hover:bg-white/90">
        Track <ArrowRight size={15} className="hidden sm:block" />
      </button>
    </form>
  );
}

export function Section({ id, eyebrow, title, children, dark, sub }: { id?: string; eyebrow: string; title: ReactNode; children: ReactNode; dark?: boolean; sub?: ReactNode }) {
  return (
    <section id={id} className={`scroll-mt-20 ${dark ? 'bg-black text-white' : ''}`}>
      <div className="mx-auto max-w-[1360px] px-5 py-20 sm:px-8 sm:py-28">
        <p className={`text-[15px] font-[500] ${dark ? 'text-white/55' : 'text-muted'}`}>{eyebrow}</p>
        <h2 className="mt-4 mb-8 max-w-[20ch] font-display tracking-[-0.035em] text-[clamp(38px,5vw,70px)] leading-[1.02] font-[600]">{title}</h2>
        {sub && <div className={`-mt-2 mb-10 max-w-[64ch] text-[17px] leading-relaxed ${dark ? 'text-white/70' : 'text-muted'}`}>{sub}</div>}
        {children}
      </div>
    </section>
  );
}

/** The dark band at the top of every inner page, with the tracking box under the nav. */
export function PageHero({ eyebrow, title, sub, children, photo }: { eyebrow: string; title: ReactNode; sub?: ReactNode; children?: ReactNode; photo?: boolean }) {
  return (
    <header className="relative isolate overflow-hidden bg-black text-white">
      {photo ? (
        <>
          <img src={heroTruck} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover object-[70%_center] opacity-70" />
          <div className="absolute inset-0 -z-10" style={{ background: 'linear-gradient(90deg, #000 15%, rgb(0 0 0 / 0.55) 60%, rgb(0 0 0 / 0.2)), linear-gradient(0deg, #000 0%, rgb(0 0 0 / 0) 40%)' }} />
        </>
      ) : (
        <>
          <div className="absolute inset-0 -z-10" style={{ background: 'radial-gradient(60% 90% at 12% 0%, rgb(47 107 255 / 0.28), transparent 60%), radial-gradient(40% 60% at 95% 100%, rgb(255 122 47 / 0.22), transparent 70%)' }} />
          <div className="absolute inset-0 -z-10 opacity-50" style={{ backgroundImage: 'radial-gradient(rgb(255 255 255 / 0.16) 1px, transparent 1.4px)', backgroundSize: '14px 14px', maskImage: 'linear-gradient(180deg, #000, transparent 85%)', WebkitMaskImage: 'linear-gradient(180deg, #000, transparent 85%)' }} />
        </>
      )}
      <div className="mx-auto max-w-[1360px] px-5 pt-[82px] pb-16 sm:px-8 sm:pb-20">
        <TrackBar className="rise" />
        <p className="rise mt-12 text-[15px] font-[500] text-white/60" style={{ animationDelay: '60ms' }}>
          {eyebrow}
        </p>
        <h1 className="rise mt-4 max-w-[18ch] font-display tracking-[-0.035em] text-[clamp(44px,7vw,104px)] leading-[1] font-[600]" style={{ animationDelay: '120ms' }}>
          {title}
        </h1>
        {sub && (
          <p className="rise mt-6 max-w-[60ch] text-[17px] leading-relaxed text-white/75 sm:text-[18px]" style={{ animationDelay: '180ms' }}>
            {sub}
          </p>
        )}
        {children && (
          <div className="rise mt-8" style={{ animationDelay: '240ms' }}>
            {children}
          </div>
        )}
      </div>
    </header>
  );
}

export function SiteFooter() {
  const go = useSection();
  const link = 'text-muted hover:text-ink';
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-[1360px] gap-12 px-5 pt-14 pb-10 sm:px-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,2.2fr)]">
        <div>
          <Brand size={20} />
          <p className="mt-3 font-display font-[560] text-[12.5px] text-faint">To every direction</p>
          <p className="mt-5 max-w-[38ch] text-[14.5px] leading-relaxed text-muted">Full trucks, part loads, parcels and warehousing across India, with a network of truck owners who move it. Suraj means sun.</p>
        </div>
        <div className="grid grid-cols-2 gap-10 text-[14.5px] sm:grid-cols-4">
          <FooterCol title="Ship with us">
            <Link to="/send" className={link}>
              Send a parcel
            </Link>
            <Link to="/track" className={link}>
              Track a shipment
            </Link>
            <button type="button" onClick={() => go('price')} className={`text-left ${link}`}>
              Get a price
            </button>
            <button type="button" onClick={() => go('services')} className={`text-left ${link}`}>
              Services
            </button>
          </FooterCol>
          <FooterCol title="Join us">
            <Link to="/truck-owners" className={link}>
              Truck owners
            </Link>
            <Link to="/join?as=driver" className={link}>
              Drivers
            </Link>
            <Link to="/join?as=customer" className={link}>
              Business customers
            </Link>
            <Link to="/join?as=warehouse" className={link}>
              Warehouse staff
            </Link>
          </FooterCol>
          <FooterCol title="Company">
            <Link to="/about" className={link}>
              About us
            </Link>
            <Link to="/about" className={link} state={{ scrollTo: 'market' }}>
              Market research
            </Link>
            <Link to="/features" className={link}>
              All features
            </Link>
            <button type="button" onClick={() => go('faq')} className={`text-left ${link}`}>
              Questions
            </button>
          </FooterCol>
          <FooterCol title="Account">
            <Link to="/login" className={link}>
              Log in
            </Link>
            <Link to="/join" className={link}>
              Ask to join
            </Link>
            <Link to="/login" className={link}>
              Open the demo
            </Link>
          </FooterCol>
        </div>
      </div>
      <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-4 border-t border-line px-5 py-5 sm:px-8">
        <p className="text-[13px] text-faint">© {new Date().getFullYear()} Suraj Logistic. Made for Indian roads.</p>
        <ThemeToggle />
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="font-display font-[560] text-[12.5px] text-faint">{title}</p>
      {children}
    </div>
  );
}

/** Page frame for the public website. */
export function SitePage({ children }: { children: ReactNode }) {
  useScrollOnArrive();
  return (
    <div className="min-h-full bg-ground text-ink">
      <SiteNav />
      {children}
      <SiteFooter />
    </div>
  );
}
