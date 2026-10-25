import { ArrowRight, Building2, Gauge, MessageCircle, Package, Smartphone, Truck, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Mark } from '../components/Brand';
import { PageHero, Section, SitePage } from '../components/Site';
import { btnClass } from '../components/ui';
import { PROBLEMS, SOURCES, STATS } from '../lib/market';

const src = (id: string) => SOURCES.find((s) => s.id === id)!;

/** Who we are, how the network works, and the market research behind it. */
export function About() {
  return (
    <SitePage>
      <PageHero eyebrow="About Surajlogistic" title="To every direction" sub="A road transport company that runs on its own app: full trucks, part loads, parcels and warehousing, moved by our trucks and a community of truck owners." />

      <Section eyebrow="Who we are" title="Suraj means sun">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-16">
          <div className="space-y-5 text-[17px] leading-relaxed text-muted">
            <p className="text-[clamp(20px,2.1vw,26px)] leading-[1.45] font-[500] tracking-[-0.015em] text-ink">
              The sun reaches every direction at once. A transport company should too: every city on the map, every size of load, every person in the chain, from the sender to the driver to the receiver at the door.
            </p>
            <p>Surajlogistic carries goods by road across India. Some trips run on our own trucks; many run on trucks owned by people with one or two vehicles, who join our network and get loads from our customers.</p>
            <p>All of it runs on one app that we built for the way Indian road freight actually works: Hindi on the driver’s phone, GST and e-way bills in the office, cash on delivery closed with an OTP, and WhatsApp for everyone else.</p>
          </div>
          <div className="relative overflow-hidden rounded-[26px] bg-black p-8 text-white">
            <div className="absolute inset-0" style={{ background: 'radial-gradient(70% 70% at 80% 100%, rgb(255 122 47 / 0.45), transparent 70%), radial-gradient(60% 60% at 0% 0%, rgb(47 107 255 / 0.35), transparent 70%)' }} />
            <div className="relative">
              <Mark size={64} />
              <p className="mt-10 font-display tracking-[-0.035em] text-[clamp(34px,4vw,52px)] leading-[1.02] font-[600]">
                सूरज
                <br />
                <span className="text-orange">Suraj.</span> Sun.
              </p>
              <p className="mt-6 max-w-[36ch] text-[15.5px] leading-relaxed text-white/70">Our mark is the sun, suraj, with arrows leaving it in all eight directions: to every direction. One arrow is orange, for the next road we take.</p>
            </div>
          </div>
        </div>
      </Section>

      <Section eyebrow="How the network works" title="One shipment, five kinds of people" dark>
        <div className="grid gap-3 lg:grid-cols-5">
          {[
            { icon: Building2, k: 'Senders', d: 'Factories, traders, shops, online sellers and anyone with a parcel. They book on the website, by phone or by upload.' },
            { icon: Gauge, k: 'Our office', d: 'Confirms bookings, plans trips, watches every truck on the control tower and bills with GST.' },
            { icon: Truck, k: 'Truck owners', d: 'Owners of one or two trucks attach them to the network and get loads both ways, with the hire agreed first.' },
            { icon: Smartphone, k: 'Drivers', d: 'See the next stop in Hindi, share location, and close each delivery with an OTP, a photo and a signature.' },
            { icon: MessageCircle, k: 'Receivers', d: 'Get a WhatsApp link at every step, read out an OTP at the door, or pick another day if they missed it.' },
          ].map((c, i) => (
            <div key={c.k} className="relative rounded-[22px] border border-white/10 bg-white/[0.04] p-6">
              <span className="font-mono text-[12px] text-white/40">{String(i + 1).padStart(2, '0')}</span>
              <c.icon size={24} className="mt-5 text-[#6aa1ff]" strokeWidth={1.7} />
              <h3 className="mt-4 font-display tracking-[-0.025em] text-[24px] leading-none font-[600]">{c.k}</h3>
              <p className="mt-3 text-[14.5px] leading-relaxed text-white/65">{c.d}</p>
              {i < 4 && <ArrowRight size={18} className="absolute top-1/2 -right-[14px] z-10 hidden -translate-y-1/2 rounded-full bg-black text-white/50 lg:block" aria-hidden="true" />}
            </div>
          ))}
        </div>
      </Section>

      <Section id="market" eyebrow="Market research" title="India's road freight, in numbers">
        <p className="-mt-2 mb-10 max-w-[70ch] text-[17px] leading-relaxed text-muted">We looked hard at the market before building anything. These are the numbers that shaped Surajlogistic. Research firms count differently, so treat them as ranges, and check each source for yourself.</p>
        <ul className="grid gap-px overflow-hidden rounded-[22px] border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
          {STATS.map((s) => (
            <li key={s.label} className="flex flex-col bg-sheet p-6">
              <p className="t-fig text-[48px] leading-none">{s.value}</p>
              <p className="mt-3 text-[16px] font-[600]">{s.label}</p>
              <p className="mt-2 flex-1 text-[14px] leading-relaxed text-muted">{s.detail}</p>
              <a href={src(s.source).url} target="_blank" rel="noreferrer" className="mt-4 text-[12.5px] text-faint underline decoration-line-strong underline-offset-2 hover:text-ink">
                Source: {src(s.source).publisher}
              </a>
            </li>
          ))}
        </ul>

        <h3 className="mt-20 font-display tracking-[-0.035em] text-[clamp(28px,3.4vw,44px)] leading-none font-[600]">What goes wrong today, and what we do about it</h3>
        <ol className="mt-8 grid gap-4 lg:grid-cols-2">
          {PROBLEMS.map((p, i) => (
            <li key={p.title} className="sheet overflow-hidden">
              <div className="px-6 pt-6">
                <span className="font-mono text-[12px] text-faint">{String(i + 1).padStart(2, '0')}</span>
                <h4 className="mt-3 text-[20px] font-[600] tracking-[-0.01em]">{p.title}</h4>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">
                  {p.fact}{' '}
                  <a href={src(p.source).url} target="_blank" rel="noreferrer" className="text-[13px] text-faint underline underline-offset-2 hover:text-ink">
                    {src(p.source).publisher}
                  </a>
                </p>
              </div>
              <div className="mt-5 border-t border-line bg-sheet-2 px-6 py-5">
                <p className="eyebrow">What Surajlogistic does</p>
                <p className="mt-2 text-[15px] leading-relaxed">{p.answer}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-20 grid gap-8 rounded-[26px] border border-line bg-sheet p-6 sm:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:items-center">
          <div>
            <p className="eyebrow">The national goal</p>
            <h3 className="mt-3 font-display tracking-[-0.035em] text-[clamp(28px,3vw,40px)] leading-[1.02] font-[600]">The National Logistics Policy, 2022</h3>
          </div>
          <div className="space-y-3 text-[15.5px] leading-relaxed text-muted">
            <p>
              India’s National Logistics Policy, launched in September 2022, aims to bring logistics costs down to global benchmarks by 2030, to place India among the top 25 countries on the World Bank’s Logistics Performance Index, and to build data-driven decision support for the sector.{' '}
              <a href={src('nlp').url} target="_blank" rel="noreferrer" className="text-[13px] text-faint underline underline-offset-2 hover:text-ink">
                {src('nlp').publisher}
              </a>
            </p>
            <p>
              The first official study put India’s logistics cost at 7.97% of GDP in 2023–24.{' '}
              <a href={src('bs').url} target="_blank" rel="noreferrer" className="text-[13px] text-faint underline underline-offset-2 hover:text-ink">
                {src('bs').publisher}
              </a>{' '}
              Fewer empty kilometres, less waiting and less paperwork are how a road transport company helps bring it down further.
            </p>
          </div>
        </div>
      </Section>

      <Section eyebrow="What we believe" title="Six rules we run by">
        <ol className="grid gap-px overflow-hidden rounded-[22px] border border-line bg-line md:grid-cols-2 xl:grid-cols-3">
          {[
            ['One record per shipment', 'Booking, trip, proof of delivery and invoice are the same record. Nothing is typed twice, nothing falls between desks.'],
            ['Fair to small owners', 'The hire is agreed before loading. The advance comes at loading and the balance after delivery, and the owner can see both.'],
            ['Open with customers', 'Every sender and receiver gets the same tracking link our office sees, with a live position and an honest ETA.'],
            ['Hindi first on the road', 'Drivers and owners use the app in Hindi. Big buttons, little typing, works on any phone.'],
            ['Proof, not promises', 'An OTP at the door, a photo and a signature, kept behind links that expire.'],
            ['Every rupee traced', 'Each trip shows what it earned against diesel, tolls and hire, so the lanes that pay are plain to see.'],
          ].map(([t, d], i) => (
            <li key={t} className="bg-sheet p-6 sm:p-7">
              <span className="font-mono text-[12px] tracking-[0.14em] text-faint">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="mt-5 font-display tracking-[-0.025em] text-[24px] leading-[1.05] font-[600]">{t}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">{d}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section eyebrow="Sources" title="Where the numbers come from">
        <ul className="max-w-[920px] divide-y divide-line border-y border-line">
          {SOURCES.map((s) => (
            <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-4">
              <a href={s.url} target="_blank" rel="noreferrer" className="text-[15.5px] font-[560] hover:underline">
                {s.title}
              </a>
              <span className="text-[13.5px] text-muted">{s.publisher}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[13.5px] text-faint">Checked in October 2026.</p>
      </Section>

      <section className="border-t border-line">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-6 px-5 py-16 sm:px-8">
          <h2 className="max-w-[20ch] font-display tracking-[-0.035em] text-[clamp(32px,4vw,52px)] leading-[1.02] font-[600]">Ship with us, or drive with us</h2>
          <div className="flex flex-wrap gap-2">
            <Link to="/send" className={btnClass('primary', 'lg')}>
              <Package size={17} /> Send a parcel
            </Link>
            <Link to="/join" className={btnClass('secondary', 'lg')}>
              <UserRound size={17} /> Ask to join
            </Link>
          </div>
        </div>
      </section>
    </SitePage>
  );
}
