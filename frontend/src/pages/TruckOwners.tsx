import { VEHICLE_CLASSES } from '@suraj/shared';
import { ArrowRight, BadgeIndianRupee, BellRing, FileCheck2, Languages, Plus, Repeat2, Route } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHero, Section, SitePage } from '../components/Site';
import { LINEUP, TruckThumb } from '../components/TruckArt';
import { btnClass, Plate } from '../components/ui';
import { SOURCES } from '../lib/market';

const redseer = SOURCES.find((s) => s.id === 'redseer')!;

/** For owners of one or two trucks: why and how to join the network. */
export function TruckOwners() {
  return (
    <SitePage>
      <PageHero photo eyebrow="For truck owners" title="Have one or two trucks? Join our community." sub="Attach your trucks to Suraj Logistic. We bring the loads, you keep driving. The hire is agreed before loading, the advance comes at loading, and your own page in Hindi shows every trip and every rupee due.">
        <div className="flex flex-wrap gap-3">
          <Link to="/join?as=partner" className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-[15px] font-[560] text-black hover:bg-white/90">
            Ask to join as a truck owner <ArrowRight size={17} />
          </Link>
          <a href="#how" onClick={(e) => (e.preventDefault(), document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' }))} className="inline-flex h-12 items-center rounded-full px-6 text-[15px] font-[540] text-white ring-1 ring-white/30 hover:bg-white/10">
            How it works
          </a>
        </div>
      </PageHero>

      <section className="border-b border-line">
        <div className="mx-auto grid max-w-[1360px] gap-8 px-5 py-14 sm:px-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-center">
          <p className="t-fig text-[clamp(72px,10vw,140px)] leading-none">75%</p>
          <div>
            <p className="text-[clamp(20px,2.2vw,28px)] leading-snug font-[500] tracking-[-0.015em]">of India's truck operators own fewer than five trucks. You are not a small player. You are most of the road.</p>
            <p className="mt-3 text-[15px] text-muted">
              About 12.5 million trucks are run by roughly 3.5 million operators, and a typical truck runs only 18–20 days a month.{' '}
              <a href={redseer.url} target="_blank" rel="noreferrer" className="underline decoration-line-strong underline-offset-2 hover:text-ink">
                Source: {redseer.publisher}
              </a>
            </p>
          </div>
        </div>
      </section>

      <Section eyebrow="What you get" title="Loads, a fair hire and a page of your own">
        <ul className="grid gap-px overflow-hidden rounded-[22px] border border-line bg-line sm:grid-cols-2 xl:grid-cols-3">
          {[
            { icon: Route, t: 'Loads from our customers', d: 'Full loads and part loads from factories, traders and online sellers who book with us.' },
            { icon: Repeat2, t: 'Return loads', d: 'When your truck unloads far from home, the office sees it next to loads going back your way.' },
            { icon: BadgeIndianRupee, t: 'Hire agreed before loading', d: 'The lorry hire for each trip is fixed with you first. Advance at loading, balance after delivery and POD.' },
            { icon: Languages, t: 'Your own page in Hindi', d: 'Every truck, every trip, the hire, the advance and the balance due, on your phone, in Hindi or English.' },
            { icon: BellRing, t: 'Paper reminders', d: 'Insurance, fitness, permit and PUC dates are tracked, so a lapsed paper never stops a trip at a check post.' },
            { icon: FileCheck2, t: 'One record per trip', d: 'Trip number, route, driver, kilometres and payment in one place. No more searching old WhatsApp chats.' },
          ].map((f) => (
            <li key={f.t} className="bg-sheet p-6 sm:p-7">
              <span className="grid h-11 w-11 place-items-center rounded-[13px] bg-sign-soft text-sign">
                <f.icon size={20} strokeWidth={1.8} />
              </span>
              <h3 className="mt-5 text-[18px] font-[600] tracking-[-0.01em]">{f.t}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">{f.d}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="how" eyebrow="How it works" title="From your phone to your first trip" dark>
        <ol className="grid gap-8 md:grid-cols-4">
          {[
            ['Ask to join', 'Fill a two-minute form with your mobile number and your trucks.'],
            ['We check and call', 'Our team calls, checks the RC and papers and talks about the lanes you run.'],
            ['You get a login', 'Once approved, your trucks are attached and you log in with your mobile number.'],
            ['Trips come', 'The hire is agreed before each trip. Advance at loading, balance after delivery and POD.'],
          ].map(([t, d], i) => (
            <li key={t} className="relative border-t border-white/15 pt-5">
              <span className="absolute -top-[5px] left-0 h-[9px] w-[9px] rounded-full bg-orange" style={{ boxShadow: '0 0 12px var(--orange)' }} />
              <p className="font-display font-[560] text-[12.5px] text-white/45">Step {String(i + 1).padStart(2, '0')}</p>
              <h3 className="mt-2 font-display tracking-[-0.025em] text-[28px] leading-none font-[600]">{t}</h3>
              <p className="mt-2.5 text-[15px] leading-relaxed text-white/70">{d}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section eyebrow="Your page" title="Every trip and every rupee, in Hindi">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
          <div>
            <p className="max-w-[48ch] text-[17px] leading-relaxed text-muted">After you are approved you get a simple page of your own. It works on any phone and switches between Hindi and English with one tap.</p>
            <ul className="mt-6 space-y-3 text-[15.5px]">
              {['Where each truck is, and which trip it is on', 'The hire, the advance paid and the balance still due', 'Papers about to expire, truck by truck', 'One tap to tell the office a truck is free in another city'].map((x) => (
                <li key={x} className="flex gap-3">
                  <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-sign" />
                  {x}
                </li>
              ))}
            </ul>
          </div>
          {/* An illustration of the owner's page with example figures. */}
          <figure className="m-0 overflow-hidden rounded-[26px] border border-line bg-sheet" aria-label="Example of a truck owner's page">
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <span className="font-display text-[15px] font-[560]">नमस्ते, महेंद्र</span>
              <span className="rounded-full bg-sheet-2 px-2.5 py-1 font-display text-[12px] font-[560] text-muted">Example</span>
            </div>
            <div className="grid grid-cols-3 gap-px bg-line">
              {[
                ['गाड़ियाँ', '2'],
                ['इस महीने', '₹74,800'],
                ['बाकी', '₹22,500'],
              ].map(([k, v]) => (
                <div key={k} className="bg-sheet px-4 py-4">
                  <p className="eyebrow">{k}</p>
                  <p className="t-fig mt-1.5 text-[24px] leading-none">{v}</p>
                </div>
              ))}
            </div>
            <ul className="divide-y divide-line">
              {[
                ['जयपुर → भीलवाड़ा', 'RJ06 GC 7215', '₹12,300', 'भुगतान हुआ'],
                ['भीलवाड़ा → इंदौर', 'RJ06 GC 7215', '₹18,900', 'बाकी ₹5,700'],
                ['अहमदाबाद → इंदौर', 'GJ01 KT 5532', '₹29,000', 'बाकी ₹8,700'],
              ].map(([lane, reg, hire, st]) => (
                <li key={lane} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <span className="min-w-0">
                    <span className="block text-[15px] font-[560]">{lane}</span>
                    <span className="mt-1 block">
                      <Plate reg={reg} size={11} />
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="t-fig block text-[18px]">{hire}</span>
                    <span className={`block text-[12.5px] ${st.startsWith('बाकी') ? 'text-warn' : 'text-go'}`}>{st}</span>
                  </span>
                </li>
              ))}
            </ul>
          </figure>
        </div>
      </Section>

      <Section eyebrow="Keep these ready" title="Papers we ask for">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <ul className="grid gap-px overflow-hidden rounded-[22px] border border-line bg-line sm:grid-cols-2">
            {[
              ['RC', 'Registration certificate of each truck'],
              ['Insurance', 'Valid goods-vehicle insurance'],
              ['Fitness', 'Fitness certificate in date'],
              ['Permit', 'National or state goods permit'],
              ['PUC', 'Pollution under control certificate'],
              ['Driving licence', 'For you or the driver who drives'],
              ['PAN', 'For payments and TDS'],
              ['Bank or UPI', 'Where the hire is paid'],
            ].map(([k, v]) => (
              <li key={k} className="bg-sheet p-5">
                <p className="text-[15.5px] font-[600]">{k}</p>
                <p className="mt-1 text-[14px] text-muted">{v}</p>
              </li>
            ))}
          </ul>
          <div>
            <p className="eyebrow">Trucks we work with</p>
            <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {LINEUP.map((v) => (
                <li key={v} className="flex flex-col justify-between rounded-[16px] border border-line bg-sheet p-3.5 text-muted">
                  <TruckThumb type={v} height={30} />
                  <span className="mt-3 text-[13px] leading-snug text-ink">{VEHICLE_CLASSES[v].label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section eyebrow="Questions from owners" title="Before you join">
        <div className="max-w-[880px] border-t border-line">
          {[
            ['Can I join with just one truck?', 'Yes. The form takes up to ten trucks, and one is fine.'],
            ['How is the hire decided?', 'It is agreed with you for each trip before loading, and it shows on your page as soon as the office saves it.'],
            ['When do I get paid?', 'An advance when the truck is loaded, and the balance after delivery once the proof of delivery is in. Your page shows what is paid and what is due, trip by trip.'],
            ['Who drives the truck?', 'You, or your own driver. Drivers can also ask to join on their own and get the driver app.'],
            ['What if my truck is empty in another city?', 'Open your page and tap “Truck is free in another city”. The office sees it beside loads going your way.'],
          ].map(([q, a]) => (
            <details key={q} className="group border-b border-line">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[17px] font-[560] tracking-[-0.01em] [&::-webkit-details-marker]:hidden">
                {q}
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line text-muted transition-transform duration-300 group-open:rotate-45 group-open:text-ink">
                  <Plus size={16} />
                </span>
              </summary>
              <p className="max-w-[68ch] pb-6 text-[15.5px] leading-relaxed text-muted">{a}</p>
            </details>
          ))}
        </div>
        <Link to="/join?as=partner" className={btnClass('primary', 'lg', 'mt-10')}>
          Ask to join as a truck owner <ArrowRight size={17} />
        </Link>
      </Section>
    </SitePage>
  );
}
