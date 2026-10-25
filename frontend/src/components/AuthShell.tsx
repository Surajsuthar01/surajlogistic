import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import heroTruck from '../assets/img/hero-truck.jpg';
import { ThemeToggle } from '../lib/theme';
import { Brand } from './Brand';

/** Sign-in and sign-up: the road on one side, the form on the other. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative grid min-h-full grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <section className="relative isolate hidden flex-col justify-between overflow-hidden bg-black p-10 text-white lg:sticky lg:top-0 lg:flex lg:h-screen">
        <img src={heroTruck} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover object-[64%_center]" />
        <div className="absolute inset-0 -z-10" style={{ background: 'linear-gradient(0deg, #000 0%, rgb(0 0 0 / 0.35) 45%, rgb(0 0 0 / 0.55) 100%)' }} />
        <Link to="/welcome" className="self-start" aria-label="Surajlogistic home">
          <Brand tone="white" />
        </Link>
        <div>
          <p className="text-[15px] font-[500] text-white/65">To every direction</p>
          <h1 className="mt-4 max-w-[14ch] font-display tracking-[-0.035em] text-[clamp(44px,4.2vw,68px)] leading-[1] font-[600]">Ship with us, or drive with us</h1>
          <p className="mt-5 max-w-[44ch] text-[16px] leading-relaxed text-white/70">Full trucks, part loads and parcels across India. Drivers and truck owners get an app in Hindi; customers follow every step on WhatsApp.</p>
        </div>
      </section>

      <section className="relative flex min-w-0 flex-col">
        {/* Phones get the road as a banner. */}
        <div className="relative isolate h-44 overflow-hidden bg-black lg:hidden">
          <img src={heroTruck} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover object-[64%_60%]" />
          <div className="absolute inset-0 -z-10" style={{ background: 'linear-gradient(0deg, var(--ground) 0%, rgb(0 0 0 / 0.2) 70%)' }} />
          <Link to="/welcome" className="absolute top-5 left-5" aria-label="Surajlogistic home">
            <Brand tone="white" small />
          </Link>
        </div>
        <div className="absolute top-4 right-4 z-10 flex items-center gap-1">
          <ThemeToggle className="max-lg:!text-white" />
        </div>
        <div className="flex flex-1 flex-col justify-center py-10" style={{ paddingLeft: 'max(20px, env(safe-area-inset-left, 0px))', paddingRight: 'max(20px, env(safe-area-inset-right, 0px))' }}>
          <div className="mx-auto w-full max-w-[420px]">
            <Link to="/welcome" className="eyebrow mb-8 hidden items-center gap-1.5 hover:text-ink lg:inline-flex">
              <ArrowLeft size={14} /> Back to the website
            </Link>
            {children}
          </div>
        </div>
      </section>
    </div>
  );
}
