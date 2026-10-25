import { buildDemoData, CITIES, computeDashboard, SERVICES, type Quote, type Service } from '@suraj/shared';
import { ArrowRight, Bot, Boxes, Camera, ChevronRight, FileSpreadsheet, Gauge, MapPinned, Package, PackageCheck, Plus, ReceiptIndianRupee, Repeat2, Smartphone, Sparkles, Store, Truck, UserRound, Warehouse, Webhook } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import heroTruck from '../assets/img/hero-truck.jpg';
import svcFtl from '../assets/img/svc-ftl.jpg';
import svcLoads from '../assets/img/svc-loads.jpg';
import svcParcel from '../assets/img/svc-parcel.jpg';
import svcWarehouse from '../assets/img/svc-warehouse.jpg';
import { Mark } from '../components/Brand';
import { NetworkMap } from '../components/NetworkMap';
import { Section, SiteFooter, SiteNav, TrackBar, useScrollOnArrive, useSection } from '../components/Site';
import { LINEUP, TruckDrawing, truckFacts, TruckThumb, type DrawableTruck } from '../components/TruckArt';
import { btnClass } from '../components/ui';
import { api, errorText } from '../lib/api';
import { inr } from '../lib/format';
import { SOURCES, STATS } from '../lib/market';

const cities = CITIES.map((c) => c.name).sort();
const SERVICE_WORD: Record<Service, string> = { COURIER: 'Parcel', PTL: 'Part load', FTL: 'Full truck' };

/** The public front door: "To every direction". */
export function Landing() {
  useScrollOnArrive();
  const go = useSection();
  // A sample network from the demo company, so the map on the front page is alive.
  const sample = useMemo(() => computeDashboard(buildDemoData(new Date())).map, []);

  return (
    <div className="min-h-full bg-ground text-ink">
      <SiteNav />

      {/* Hero, with tracking right under the navigation bar */}
      <header className="relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-black text-white">
        <img src={heroTruck} alt="A red truck on an open highway at dusk" className="absolute inset-0 -z-10 h-full w-full object-cover object-[62%_center]" />
        <div className="absolute inset-0 -z-10" style={{ background: 'linear-gradient(90deg, rgb(0 0 0 / 0.88) 0%, rgb(0 0 0 / 0.6) 42%, rgb(0 0 0 / 0.08) 75%), linear-gradient(0deg, #000 0%, rgb(0 0 0 / 0) 34%), linear-gradient(180deg, rgb(0 0 0 / 0.55) 0%, rgb(0 0 0 / 0) 22%)' }} />
        <div className="absolute inset-0 -z-10" style={{ background: 'radial-gradient(48% 55% at 4% 78%, rgb(255 138 31 / 0.2), transparent 70%)' }} />
        <div className="absolute inset-0 -z-10 bg-black/45 sm:hidden" />
        <div className="mx-auto w-full max-w-[1360px] px-5 pt-[82px] sm:px-8">
          <TrackBar className="rise" />
        </div>
        <div className="mx-auto flex w-full max-w-[1360px] flex-1 flex-col justify-center px-5 pt-14 pb-10 sm:px-8">
          <ul className="rise flex flex-wrap gap-2" aria-label="What we carry">
            {['Full trucks', 'Part loads', 'Parcels', 'Warehousing'].map((t) => (
              <li key={t} className="rounded-full bg-white/[0.08] px-3 py-1.5 text-[13px] font-[500] text-white/85 ring-1 ring-white/15 backdrop-blur-md">
                {t}
              </li>
            ))}
          </ul>
          <h1 className="rise mt-7 font-display text-[clamp(52px,7.6vw,116px)] leading-[0.95] font-[650] tracking-[-0.045em]" style={{ animationDelay: '80ms' }}>
            To every
            <br />
            <span className="sun-text pr-[0.04em]">direction</span>
            <svg viewBox="0 0 24 24" aria-hidden="true" className="ml-[0.08em] inline-block h-[0.56em] w-[0.56em] align-[0.04em]">
              <path d="M6 18L18 6M8.5 6H18V15.5" fill="none" stroke="#ff8a1f" strokeWidth="2.9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </h1>
          <p className="rise mt-7 max-w-[54ch] text-[16.5px] leading-relaxed text-white/80 sm:text-[18px]" style={{ animationDelay: '160ms' }}>
            Surajlogistic moves goods across India by road, with its own trucks and a growing community of truck owners. Send a parcel without an account, follow it on WhatsApp, and pay at pickup.
          </p>
          <div className="rise mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: '240ms' }}>
            <Link to="/send" className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-[15px] font-[560] text-black hover:bg-white/90">
              Send a parcel <ArrowRight size={17} />
            </Link>
            <Link to="/truck-owners" className="inline-flex h-12 items-center rounded-full px-6 text-[15px] font-[540] text-white ring-1 ring-white/30 backdrop-blur-sm hover:bg-white/10">
              Join as a truck owner
            </Link>
          </div>
        </div>
        <div className="mx-auto w-full max-w-[1360px] px-5 pb-8 sm:px-8 lg:pb-10">
          <ol className="rise grid grid-cols-2 gap-px overflow-hidden rounded-[22px] bg-white/[0.12] ring-1 ring-white/[0.12] backdrop-blur-xl lg:grid-cols-4" style={{ animationDelay: '320ms' }}>
            {[
              { icon: Package, k: 'Book', v: 'Online, no account needed' },
              { icon: MapPinned, k: 'Track', v: 'Live link on WhatsApp' },
              { icon: PackageCheck, k: 'Deliver', v: 'OTP, photo and signature' },
              { icon: ReceiptIndianRupee, k: 'Bill', v: 'GST, CGST/SGST or IGST' },
            ].map(({ icon: Icon, k, v }) => (
              <li key={k} className="flex items-center gap-3.5 bg-black/50 px-4 py-4 sm:px-5">
                <span className="hidden h-10 w-10 shrink-0 place-items-center rounded-full bg-white/[0.08] text-[#ffb35c] ring-1 ring-white/10 sm:grid">
                  <Icon size={18} strokeWidth={1.9} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] leading-tight font-[600]">{k}</span>
                  <span className="mt-0.5 block text-[13.5px] leading-snug text-white/65">{v}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </header>

      {/* About */}
      <Section id="about" eyebrow="What is Surajlogistic" title="A road transport company that runs on one app">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-16">
          <div>
            <p className="text-[clamp(20px,2.1vw,27px)] leading-[1.45] font-[500] tracking-[-0.015em]">
              Surajlogistic carries full trucks, part loads and parcels across India. Owners of one or two trucks join our network and get loads; drivers get an app in Hindi; customers book online and follow every step. <span className="text-muted">Booking, trip, delivery and invoice are one record, end to end.</span>
            </p>
            <div className="mt-8 flex items-start gap-4 rounded-[22px] border border-line bg-sheet p-5">
              <span className="shrink-0">
                <Mark size={48} />
              </span>
              <p className="text-[15.5px] leading-relaxed text-muted">
                <span className="font-[600] text-ink">Suraj means sun.</span> The sun reaches every direction at once, and so should a good transport company. That is where our line comes from: <span className="font-display font-[560] text-ink">To every direction.</span>
              </p>
            </div>
            <Link to="/about" className="mt-6 inline-flex items-center gap-1.5 text-[15px] font-[560] text-accent hover:underline">
              More about us and the market we work in <ChevronRight size={16} />
            </Link>
          </div>
          <dl className="grid content-start gap-px self-start overflow-hidden rounded-[22px] border border-line bg-line sm:grid-cols-2">
            {[
              ['Who we serve', 'Factories, traders, shops and online sellers who send goods by road, and anyone with a single parcel.'],
              ['Who moves it', 'Our trucks and drivers, plus truck owners with one or two trucks who join our network.'],
              ['How you book', 'On this website without an account, or with a business login, a spreadsheet upload or our API.'],
              ['How you follow it', 'A tracking link on WhatsApp at every step, an OTP at the door, a photo and signature as proof.'],
            ].map(([k, v]) => (
              <div key={k} className="bg-sheet p-5">
                <dt className="eyebrow">{k}</dt>
                <dd className="m-0 mt-2.5 text-[15px] leading-relaxed">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <ol className="mt-16 grid gap-px overflow-hidden rounded-[22px] border border-line bg-line md:grid-cols-3">
          {[
            ['One record per shipment', 'Booking, trip, proof of delivery and invoice are the same record, so nothing is typed twice and nothing gets lost between desks.'],
            ['Made for Indian roads', 'GST with CGST and SGST or IGST, e-way bill numbers, cash on delivery closed with an OTP, and WhatsApp updates for receivers.'],
            ['Fair to the people who drive', 'Truck owners see the hire for every trip before loading, the advance and the balance due, on their own page in Hindi.'],
          ].map(([t, d], i) => (
            <li key={t} className="bg-sheet p-6 sm:p-7">
              <span className="font-mono text-[12px] tracking-[0.14em] text-faint">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="mt-5 font-display tracking-[-0.025em] text-[24px] leading-[1.05] font-[600]">{t}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">{d}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* Services */}
      <Section id="services" eyebrow="What we carry" title="Four services, one shipment record">
        <p className="max-w-[62ch] text-[17px] leading-relaxed text-muted">From one carton to a 40 ft trailer. Every booking, truck and invoice hangs off the same shipment record, so you can follow it and we can account for every rupee.</p>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { n: '01', img: svcFtl, icon: Truck, t: 'Full truckload', d: 'A whole truck for your goods, from a mini truck to a 40 ft trailer, tracked on the map from loading to unloading.' },
            { n: '02', img: svcParcel, icon: Package, t: 'Parcels and part loads', d: 'Book in a minute, get a label, pay at pickup or let the receiver pay, and close the delivery with an OTP.' },
            { n: '03', img: svcLoads, icon: Store, t: 'Load board', d: 'Loads posted for trucks in our network, and return loads for trucks that would otherwise drive home empty.' },
            { n: '04', img: svcWarehouse, icon: Boxes, t: 'Warehousing', d: 'Stock kept by client and bin, received and dispatched against orders, with a warning before anything runs out.' },
          ].map((s) => (
            <li key={s.n} className="group overflow-hidden rounded-[22px] border border-line bg-sheet">
              <div className="relative h-48 overflow-hidden">
                <img src={s.img} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgb(0 0 0 / 0) 40%, rgb(0 0 0 / 0.65))' }} />
                <span className="absolute bottom-3 left-4 font-mono text-[12px] tracking-[0.14em] text-white/85">{s.n}</span>
                <span className="absolute right-3 bottom-3 grid h-9 w-9 place-items-center rounded-full bg-black/45 text-white ring-1 ring-white/20 backdrop-blur">
                  <s.icon size={17} />
                </span>
              </div>
              <div className="p-5">
                <h3 className="font-display tracking-[-0.025em] text-[22px] leading-tight font-[600]">{s.t}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{s.d}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      {/* Price */}
      <Section id="price" eyebrow="Get a price" title="Send without an account">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <div>
            <p className="max-w-[46ch] text-[17px] leading-relaxed text-muted">Check the price, then book a pickup with your name and mobile number. Our team calls to confirm, and your tracking link arrives on WhatsApp.</p>
            <ol className="mt-8 space-y-6">
              {[
                ['Check the price', 'Pick the cities and the weight. The price includes GST.'],
                ['Request a pickup', 'Tell us who sends, who receives and when to come. You get a request number at once.'],
                ['We confirm and pick up', 'Our team calls you, confirms the booking and sends the tracking link to you and the receiver.'],
                ['Delivered with an OTP', 'The receiver reads out an OTP at the door. Pay at pickup, or the receiver pays.'],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-4">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line-strong font-mono text-[13px]">{i + 1}</span>
                  <span>
                    <span className="block text-[16.5px] font-[600]">{t}</span>
                    <span className="mt-1 block text-[15px] leading-relaxed text-muted">{d}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <PriceCheck />
        </div>
      </Section>

      {/* Trucks */}
      <Section id="trucks" eyebrow="The fleet" title="From a mini truck to a 40 ft trailer">
        <p className="max-w-[64ch] text-[17px] leading-relaxed text-muted">We work with eight classes of goods vehicle. Pick one to see it to scale next to a person, what it carries and the rate it starts from.</p>
        <TrucksShowcase />
      </Section>

      {/* Community */}
      <Section id="join-us" eyebrow="Join our community" title="Have one or two trucks? Grow with us">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <Link to="/truck-owners" className="group relative isolate flex min-h-[340px] flex-col justify-end overflow-hidden rounded-[24px] bg-black p-7 text-white sm:p-9">
            <img src={heroTruck} alt="" loading="lazy" className="absolute inset-0 -z-10 h-full w-full object-cover object-[70%_center] opacity-75 transition-transform duration-700 group-hover:scale-[1.03]" />
            <div className="absolute inset-0 -z-10" style={{ background: 'linear-gradient(0deg, #000 10%, rgb(0 0 0 / 0.2) 70%)' }} />
            <p className="font-display text-[12.5px] font-[560] text-white/65">For truck owners</p>
            <h3 className="mt-3 max-w-[18ch] font-display tracking-[-0.035em] text-[clamp(30px,3.6vw,48px)] leading-[1.02] font-[600]">Attach your truck. Get loads both ways.</h3>
            <p className="mt-4 max-w-[52ch] text-[15.5px] leading-relaxed text-white/75">About three in four truck operators in India own fewer than five trucks. Join our network: the hire is agreed before loading, the advance comes at loading, and your own page in Hindi shows every trip and every rupee due.</p>
            <span className="mt-6 inline-flex w-fit items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[14.5px] font-[560] text-black">
              How it works <ArrowRight size={16} />
            </span>
          </Link>
          <div className="grid gap-4">
            {[
              { icon: Truck, as: 'partner', t: 'Truck owner', d: 'One to ten trucks. Get trips, return loads and a clear statement of hire.' },
              { icon: UserRound, as: 'driver', t: 'Driver', d: 'Drive for us with a valid licence. Trips and deliveries on an app in Hindi.' },
              { icon: PackageCheck, as: 'customer', t: 'Business customer', d: 'A login to book in bulk, follow every shipment and download GST invoices.' },
              { icon: Warehouse, as: 'warehouse', t: 'Warehouse staff', d: 'Receive, store and dispatch stock from your phone or the warehouse desk.' },
            ].map((c) => (
              <Link key={c.as} to={`/join?as=${c.as}`} className="group flex items-center gap-4 rounded-[20px] border border-line bg-sheet p-4 transition-colors hover:border-line-strong hover:bg-sheet-2">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] bg-sign-soft text-sign">
                  <c.icon size={20} strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-[600]">{c.t}</span>
                  <span className="block text-[14px] leading-snug text-muted">{c.d}</span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
              </Link>
            ))}
            <p className="px-1 text-[13.5px] text-faint">Every request is checked by our team. You can log in once it is approved.</p>
          </div>
        </div>
      </Section>

      {/* Network */}
      <Section id="network" eyebrow="The network, live" title="See every truck on one map" dark>
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)]">
          <div>
            <p className="max-w-[46ch] text-[17px] leading-relaxed text-white/70">Trucks report every few minutes from the driver's phone or a GPS box. Late lanes turn red before the customer has to call, and empty trucks show up next to loads going their way.</p>
            <dl className="mt-8 grid grid-cols-3 gap-px overflow-hidden rounded-[18px] bg-white/10">
              {[
                ['Lanes', sample.trips.length],
                ['Trucks', sample.vehicles.length],
                ['Hubs', sample.facilities.length],
              ].map(([k, v]) => (
                <div key={String(k)} className="bg-black px-4 py-4">
                  <dt className="font-display font-[560] text-[12px] text-white/45">{k}</dt>
                  <dd className="m-0 mt-2 font-display text-[40px] leading-none text-white">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 font-display font-[560] text-[12px] text-white/35">Sample data from the demo company</p>
          </div>
          <NetworkMap vehicles={sample.vehicles} trips={sample.trips} facilities={sample.facilities} height={560} wholeCountry hud={<span className="flex items-center gap-2"><span className="live-dot text-[#4d8bff]" /> Live network</span>} />
        </div>
      </Section>

      {/* Market */}
      <Section id="market" eyebrow="Market research" title="India's road freight, in numbers">
        <p className="-mt-2 mb-10 max-w-[66ch] text-[17px] leading-relaxed text-muted">Why we built Surajlogistic the way we did. Estimates differ by research firm, so each figure names its source.</p>
        <ul className="grid gap-px overflow-hidden rounded-[22px] border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
          {STATS.map((s) => {
            const src = SOURCES.find((x) => x.id === s.source)!;
            return (
              <li key={s.label} className="flex flex-col bg-sheet p-6">
                <p className="t-fig text-[48px] leading-none">{s.value}</p>
                <p className="mt-3 text-[16px] font-[600]">{s.label}</p>
                <p className="mt-2 flex-1 text-[14px] leading-relaxed text-muted">{s.detail}</p>
                <a href={src.url} target="_blank" rel="noreferrer" className="mt-4 text-[12.5px] text-faint underline decoration-line-strong underline-offset-2 hover:text-ink">
                  Source: {src.publisher}
                </a>
              </li>
            );
          })}
        </ul>
        <Link to="/about" state={{ scrollTo: 'market' }} className="mt-6 inline-flex items-center gap-1.5 text-[15px] font-[560] text-accent hover:underline">
          Read the full research and what we do about it <ChevronRight size={16} />
        </Link>
      </Section>

      {/* Inside the app */}
      <Section id="features" eyebrow="Inside the app" title="Small things that save a whole day">
        <ul className="grid gap-px overflow-hidden rounded-[22px] border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
          {[
            { icon: Gauge, t: 'Control tower', d: 'Live map, late trucks, papers about to expire and unpaid bills in one list.' },
            { icon: Sparkles, t: 'Copilot in Hinglish', d: '“Jaipur ke paas kaun se truck khali hain?” answered from live data.' },
            { icon: Repeat2, t: 'Return loads', d: 'Trucks unloading far from home are matched with loads going back their way.' },
            { icon: ReceiptIndianRupee, t: 'GST invoices', d: 'Delivered shipments become one invoice per customer with the right tax split.' },
            { icon: Camera, t: 'Proof of delivery', d: 'OTP, photo and signature at the door, kept behind links that expire.' },
            { icon: Smartphone, t: 'Driver app in Hindi', d: 'Today’s trip, the next stop, location sharing and diesel bills on the spot.' },
            { icon: FileSpreadsheet, t: 'Bulk booking', d: 'Business customers upload a spreadsheet; bad rows are flagged first.' },
            { icon: Webhook, t: 'API and webhooks', d: 'Online sellers push orders in and get signed status events back.' },
          ].map((f) => (
            <li key={f.t} className="group bg-sheet p-6 transition-colors hover:bg-sheet-2">
              <span className="grid h-10 w-10 place-items-center rounded-[12px] bg-sign-soft text-sign">
                <f.icon size={19} strokeWidth={1.8} />
              </span>
              <h3 className="mt-5 text-[16.5px] font-[600] tracking-[-0.01em]">{f.t}</h3>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">{f.d}</p>
            </li>
          ))}
        </ul>
        <Link to="/features" className={btnClass('secondary', 'md', 'mt-6')}>
          See every feature <ArrowRight size={16} />
        </Link>
      </Section>

      {/* People */}
      <Section id="people" eyebrow="For everyone on the road" title="Built for the people who move it">
        <div className="grid gap-px overflow-hidden rounded-[22px] border border-line bg-line md:grid-cols-3">
          {[
            { icon: MapPinned, k: 'Our office', t: 'A control tower, not a spreadsheet', d: 'Live map, late trucks, expiring papers and unpaid bills in one list, and a copilot that understands "Indore se Mumbai 5 ton ka bhada kitna?"' },
            { icon: Smartphone, k: 'Drivers and owners', t: 'An app in Hindi on any phone', d: 'Drivers see the next stop, share location and close deliveries with an OTP. Owners see their trucks, trips and hire due.' },
            { icon: Bot, k: 'Senders and receivers', t: 'Answers without a phone call', d: 'A WhatsApp message with a tracking link at every step. Missed the delivery? Pick another day from the same link.' },
          ].map((c) => (
            <div key={c.k} className="bg-sheet p-6 sm:p-7">
              <c.icon size={22} className="text-accent" />
              <p className="mt-6 font-display font-[560] text-[12.5px] text-muted">{c.k}</p>
              <h3 className="mt-2 font-display tracking-[-0.025em] text-[26px] leading-[1.05] font-[600]">{c.t}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">{c.d}</p>
            </div>
          ))}
        </div>
        <ol className="mt-14 grid gap-8 md:grid-cols-4">
          {[
            ['Book', 'Online, by phone or by upload. Price shown with GST.'],
            ['Load', 'A truck and driver are picked. Papers and licence are checked first.'],
            ['Deliver', 'OTP, photo and signature at the door. Cash collected is recorded.'],
            ['Bill', 'Business customers get one GST invoice for delivered shipments.'],
          ].map(([t, d], i) => (
            <li key={t} className="relative border-t border-line pt-5">
              <span className="absolute -top-[5px] left-0 h-[9px] w-[9px] rounded-full bg-sign" style={{ boxShadow: '0 0 12px var(--sign)' }} />
              <p className="font-display font-[560] text-[12.5px] text-faint">Step {String(i + 1).padStart(2, '0')}</p>
              <h3 className="mt-2 font-display tracking-[-0.025em] text-[28px] leading-none font-[600]">{t}</h3>
              <p className="mt-2.5 text-[14.5px] leading-relaxed text-muted">{d}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* FAQ */}
      <Section id="faq" eyebrow="Questions" title="Asked before you book or join">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)]">
          <div>
            <p className="max-w-[40ch] text-[17px] leading-relaxed text-muted">Something else on your mind? Send a parcel or ask to join, and our team will call you back.</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link to="/send" className={btnClass('primary', 'lg')}>
                Send a parcel
              </Link>
              <Link to="/join" className={btnClass('secondary', 'lg')}>
                Ask to join
              </Link>
            </div>
          </div>
          <div className="border-t border-line">
            {FAQ.map(([q, a]) => (
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
        </div>
      </Section>

      {/* Closing band */}
      <section className="relative isolate overflow-hidden bg-black text-white">
        <img src={heroTruck} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover object-[70%_center] opacity-60" />
        <div className="absolute inset-0 -z-10" style={{ background: 'linear-gradient(90deg, #000 10%, rgb(0 0 0 / 0.4))' }} />
        <div className="mx-auto max-w-[1360px] px-5 py-24 sm:px-8">
          <h2 className="max-w-[16ch] font-display tracking-[-0.035em] text-[clamp(44px,6vw,84px)] leading-[1.02] font-[600]">Your goods. Every direction.</h2>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/send" className="inline-flex h-12 items-center rounded-full bg-white px-6 text-[15px] font-[560] text-black hover:bg-white/90">
              Send a parcel
            </Link>
            <button type="button" onClick={() => go('join-us')} className="inline-flex h-12 items-center rounded-full px-6 text-[15px] font-[540] text-white ring-1 ring-white/30 hover:bg-white/10">
              Join our community
            </button>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

const FAQ: [string, string][] = [
  ['What is Surajlogistic?', 'A road transport company for full trucks, part loads, parcels and warehousing, run on its own app. Booking, trip, delivery and invoice are one record, and truck owners with one or two trucks can join the network.'],
  ['Can I send something without an account?', 'Yes. Use “Send a parcel”: check the price, enter who sends and who receives, and request a pickup. You get a request number at once; our team calls to confirm, then the tracking link comes on WhatsApp.'],
  ['How do I pay?', 'Pay at pickup in cash or by UPI, or choose “receiver pays” and the receiver pays on delivery. Business customers with a login get a GST invoice instead.'],
  ['How do I track my shipment?', 'Type the tracking number that starts with SL into the box under the menu at the top of any page. The receiver also gets a WhatsApp link, and can pick another day if they missed a delivery.'],
  ['I have one or two trucks. Can I join?', 'Yes. Ask to join as a truck owner and list your trucks. We check the papers and call you. Once approved you log in with your mobile number and see your trucks, trips and lorry hire.'],
  ['Who can log in?', 'Our office team, drivers, truck owners, business customers and warehouse staff. Everyone except the office joins through “Ask to join”, and our team approves each request first.'],
  ['Is my data private?', 'Your details are used to move your goods and are shown only to people who need them: the tracking page hides the receiver’s phone and address, and photos of delivery stay behind links that expire.'],
  ['What is the live demo?', 'A made-up version of the company with trucks, shipments and invoices that runs in your browser. Log in as the owner, a dispatcher, a driver, a truck owner or a customer. Nothing you do there is saved.'],
];

/** Live price for a lane, the same engine the office uses. */
function PriceCheck() {
  const nav = useNavigate();
  const [service, setService] = useState<Service>('COURIER');
  const [from, setFrom] = useState('Ratlam');
  const [to, setTo] = useState('Indore');
  const [kgs, setKgs] = useState('10');
  const [q, setQ] = useState<Quote | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const weight = Number(kgs);

  useEffect(() => {
    if (!(weight > 0) || from === to) {
      setQ(null);
      return;
    }
    const t = setTimeout(() => {
      api
        .post<{ quote: Quote }>('/api/public/quote', { service, originCity: from, destCity: to, weightKg: weight })
        .then((r) => {
          setQ(r.quote);
          setErr(null);
        })
        .catch((e) => setErr(errorText(e)));
    }, 250);
    return () => clearTimeout(t);
  }, [service, from, to, weight]);

  const pick = (s: Service) => {
    setService(s);
    if (s === 'FTL' && weight < 1000) setKgs('5000');
    if (s === 'PTL' && weight < 200) setKgs('800');
    if (s === 'COURIER' && weight > 70) setKgs('10');
  };

  return (
    <div className="sheet p-5 sm:p-7" aria-label="Price check">
      <div className="seg" role="radiogroup" aria-label="Service">
        {SERVICES.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={service === s} onClick={() => pick(s)} className="seg-btn">
            {SERVICE_WORD[s]}
          </button>
        ))}
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px]">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13.5px] font-[520]">From</span>
          <select id="pc-from" value={from} onChange={(e) => setFrom(e.target.value)} className="h-11 rounded-[14px] border border-line bg-sheet-2 px-3 text-[15px] focus:border-accent focus:outline-none">
            {cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13.5px] font-[520]">To</span>
          <select id="pc-to" value={to} onChange={(e) => setTo(e.target.value)} className="h-11 rounded-[14px] border border-line bg-sheet-2 px-3 text-[15px] focus:border-accent focus:outline-none">
            {cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13.5px] font-[520]">Weight, kg</span>
          <input id="pc-kg" inputMode="decimal" value={kgs} onChange={(e) => setKgs(e.target.value.replace(/[^\d.]/g, ''))} className="h-11 rounded-[14px] border border-line bg-sheet-2 px-3 text-[15px] focus:border-accent focus:outline-none" />
        </label>
      </div>
      <div className="mt-6 border-t border-line pt-5" aria-live="polite">
        {from === to ? (
          <p className="text-[15px] text-muted">Pick two different cities.</p>
        ) : err ? (
          <p className="text-[15px] text-bad">{err}</p>
        ) : !q ? (
          <p className="text-[15px] text-muted">Working out the price…</p>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow">Estimated price, GST included</p>
                <p className="t-fig mt-2 text-[56px] leading-none">{inr(q.total)}</p>
              </div>
              <div className="text-right text-[14.5px] text-muted">
                <p>{q.distanceKm.toLocaleString('en-IN')} km by road</p>
                <p>
                  Usually reaches by{' '}
                  <span className="text-ink">{new Date(q.etaAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' })}</span>
                </p>
              </div>
            </div>
            <ul className="mt-4 space-y-1 text-[14px] text-muted">
              {q.lines.slice(0, 4).map((l) => (
                <li key={l.label} className="flex justify-between gap-4">
                  <span>{l.label}</span>
                  <span className="num">{inr(l.amount)}</span>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => nav(`/send?service=${service}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&kg=${weight}`)} className={btnClass('primary', 'lg', 'mt-6 w-full')}>
              Book this pickup <ArrowRight size={17} />
            </button>
            <p className="mt-2 text-center text-[13px] text-faint">The final price is confirmed when our team calls you.</p>
          </>
        )}
      </div>
    </div>
  );
}

function TrucksShowcase() {
  const [type, setType] = useState<DrawableTruck>('TRUCK_22FT');
  const f = truckFacts(type);
  return (
    <div className="mt-10">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <div
          className="map-slab relative h-[260px] overflow-hidden p-5 sm:h-[380px] sm:p-8"
          style={{ backgroundImage: 'linear-gradient(rgb(255 255 255 / 0.045) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.045) 1px, transparent 1px)', backgroundSize: '28px 28px', backgroundColor: '#050608' }}
        >
          <div className="absolute top-4 left-5 flex items-center gap-2 font-display text-[12px] font-[560] text-white/45 sm:left-7">
            <span className="h-1.5 w-1.5 rounded-full bg-orange" /> Side view, to scale
          </div>
          <div className="absolute top-4 right-5 font-mono text-[11px] tracking-[0.1em] text-white/40 sm:right-7">{type}</div>
          <div key={type} className="pop-in h-full pt-6 text-white">
            <TruckDrawing type={type} />
          </div>
        </div>
        <div className="flex flex-col rounded-[20px] border border-line bg-sheet p-6">
          <p className="eyebrow">Selected</p>
          <h3 className="mt-2 font-display tracking-[-0.025em] text-[30px] leading-none font-[600]">{f.name}</h3>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">{f.use}.</p>
          <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-[16px] border border-line bg-line">
            {[
              ['Payload', f.capacityKg >= 1000 ? `${(f.capacityKg / 1000).toLocaleString('en-IN', { maximumFractionDigits: 1 })} t` : `${f.capacityKg} kg`],
              ['Body', f.bodyLabel],
              ['Mileage', `${f.kmpl} km/l`],
              ['Starting rate', `₹${f.ratePerKm}/km`],
            ].map(([k, v]) => (
              <div key={k} className="bg-sheet px-4 py-3.5">
                <dt className="eyebrow !text-[10.5px]">{k}</dt>
                <dd className="t-fig m-0 mt-1.5 text-[26px] leading-none">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-auto pt-5 text-[13.5px] leading-relaxed text-faint">{f.heavy ? 'Heavy vehicle: many metros keep it out during day-time no-entry hours.' : 'Light vehicle: allowed into most city centres through the day.'} Rates are the starting rate card; the final price depends on the load and the lane.</p>
        </div>
      </div>
      <div className="scroll-x no-scrollbar -mx-5 mt-4 px-5 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-2 sm:w-auto sm:flex-wrap" role="group" aria-label="Truck class">
          {LINEUP.map((t) => {
            const on = t === type;
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => setType(t)}
                className={`flex h-[92px] shrink-0 flex-col items-start justify-between rounded-[16px] border px-3.5 pt-3 pb-2.5 text-left transition-colors ${on ? 'border-ink bg-sheet' : 'border-line bg-sheet hover:border-line-strong'}`}
              >
                <span className={on ? 'text-ink' : 'text-muted'}>
                  <TruckThumb type={t} height={34} />
                </span>
                <span className={`font-display text-[13px] font-[560] ${on ? 'text-ink' : 'text-muted'}`}>{truckFacts(t).short}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

