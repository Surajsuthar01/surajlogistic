import {
  BadgeIndianRupee,
  BarChart3,
  BellRing,
  Boxes,
  Building2,
  Camera,
  CalendarClock,
  FileSpreadsheet,
  FileText,
  Gauge,
  Globe,
  IdCard,
  KeyRound,
  Languages,
  Map as MapIcon,
  MapPin,
  MessageSquareText,
  Package,
  PackageSearch,
  ReceiptIndianRupee,
  Repeat2,
  Route,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
  Truck,
  UserPlus,
  Users,
  Webhook,
  Wallet,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHero, Section, SitePage } from '../components/Site';
import { btnClass } from '../components/ui';

type Feature = { icon: typeof Gauge; t: string; d: string };

const GROUPS: { id: string; eyebrow: string; title: string; dark?: boolean; items: Feature[] }[] = [
  {
    id: 'website',
    eyebrow: 'On this website',
    title: 'For anyone, no account needed',
    items: [
      { icon: PackageSearch, t: 'Track a shipment', d: 'Enter the SL number under the menu on any page: live position, every scan, an honest ETA.' },
      { icon: Send, t: 'Send a parcel', d: 'Price with GST as you type, then request a pickup with just your name and mobile.' },
      { icon: CalendarClock, t: 'Pick another day', d: 'Missed a delivery? The receiver picks a new day from the tracking page.' },
      { icon: UserPlus, t: 'Ask to join', d: 'Truck owners, drivers, business customers and warehouse staff apply; the office approves.' },
    ],
  },
  {
    id: 'office',
    eyebrow: 'For our office',
    title: 'Run the whole company from one screen',
    items: [
      { icon: Gauge, t: 'Control tower', d: 'Every truck on a live map of India, with late trips, expiring papers and unpaid bills in one list.' },
      { icon: BellRing, t: 'Requests', d: 'Website bookings to confirm and people asking to join, with a count in the menu.' },
      { icon: Package, t: 'Shipments', d: 'Parcels, part loads and full trucks with labels, consignment notes and e-way bill numbers.' },
      { icon: FileSpreadsheet, t: 'Bulk booking', d: 'Upload a spreadsheet; every row is priced and bad rows are flagged before anything is booked.' },
      { icon: Route, t: 'Trips', d: 'Truck, driver and shipments on one trip, with what it earns after diesel, tolls or lorry hire.' },
      { icon: Truck, t: 'Fleet and papers', d: 'Own, attached and hired trucks, with insurance, fitness, permit and PUC dates tracked.' },
      { icon: IdCard, t: 'Drivers and licences', d: 'Licence expiry checked before any trip is planned.' },
      { icon: MapIcon, t: 'Route planner', d: 'The shortest order for many drops in a city.' },
      { icon: Store, t: 'Load board', d: 'Post loads and take bids; the return-load finder matches empty trucks to loads going their way.' },
      { icon: Boxes, t: 'Warehouse', d: 'Stock by client and bin, receiving and dispatch, and a warning before anything runs out.' },
      { icon: ReceiptIndianRupee, t: 'GST billing', d: 'Delivered shipments become one invoice per customer, with CGST and SGST or IGST worked out.' },
      { icon: BarChart3, t: 'Reports', d: 'Lanes, customers and drivers by date range, with a download for the accountant.' },
      { icon: Sparkles, t: 'Copilot', d: 'Ask in English or Hinglish: “Aaj ka summary batao”, “Indore se Mumbai 5 ton ka bhada kitna?”' },
      { icon: Search, t: 'Search everything', d: 'Press / to find an AWB, trip, truck number or customer.' },
      { icon: Users, t: 'Team and logins', d: 'Owners, dispatchers and warehouse staff, each seeing only their part.' },
      { icon: MessageSquareText, t: 'Message log', d: 'Every WhatsApp and SMS that went out, with the text and the time.' },
    ],
  },
  {
    id: 'owners',
    eyebrow: 'For truck owners',
    title: 'Your trucks, your trips, your money',
    dark: true,
    items: [
      { icon: Truck, t: 'Your trucks', d: 'Where each one is, which trip it is on and when it reaches.' },
      { icon: BadgeIndianRupee, t: 'Lorry hire statement', d: 'Hire, advance and balance for every trip, and which ones are paid.' },
      { icon: MapPin, t: 'Free in another city', d: 'One tap tells the office a truck is empty and where.' },
      { icon: Languages, t: 'Hindi or English', d: 'Switch with one tap. Works on any phone.' },
    ],
  },
  {
    id: 'drivers',
    eyebrow: 'For drivers',
    title: 'An app in Hindi on any phone',
    items: [
      { icon: Route, t: 'Today’s trip', d: 'The route, the next stop and the reach-by time.' },
      { icon: MapPin, t: 'Live location', d: 'One tap shares location with the office while the trip runs.' },
      { icon: Camera, t: 'Proof of delivery', d: 'OTP from the receiver, a photo of the goods and a signature on the screen.' },
      { icon: Wallet, t: 'Road expenses', d: 'Diesel, tolls and repairs logged with a bill photo on the spot.' },
    ],
  },
  {
    id: 'customers',
    eyebrow: 'For business customers',
    title: 'Book in bulk, follow everything',
    items: [
      { icon: Package, t: 'Your shipments', d: 'Everything you have booked, with live status and the proof of delivery.' },
      { icon: FileSpreadsheet, t: 'Upload a sheet', d: 'Book hundreds of parcels from one spreadsheet.' },
      { icon: FileText, t: 'GST invoices', d: 'Download your invoices and see what is due.' },
      { icon: Webhook, t: 'API and webhooks', d: 'Online sellers push orders in and get signed status events back.' },
    ],
  },
  {
    id: 'trust',
    eyebrow: 'Built in',
    title: 'Safe, private and made for India',
    items: [
      { icon: ShieldCheck, t: 'Each login sees its part', d: 'Roles are checked on every request; a removed login stops working at once.' },
      { icon: KeyRound, t: 'Passwords stay secret', d: 'Stored as one-way hashes; repeated wrong guesses are slowed down.' },
      { icon: Globe, t: 'Private tracking page', d: 'Shows the journey, never the receiver’s phone number or address.' },
      { icon: Building2, t: 'Your data, your copy', d: 'The owner can download everything at any time.' },
    ],
  },
];

/** Every feature, grouped by who uses it. */
export function Features() {
  return (
    <SitePage>
      <PageHero eyebrow="Features" title="Everything in Surajlogistic" sub="The website, the office, the driver app, the truck owner’s page and the customer portal: one app, one shipment record, every feature below.">
        <nav aria-label="Feature groups" className="flex flex-wrap gap-2">
          {GROUPS.map((g) => (
            <a key={g.id} href={`#${g.id}`} onClick={(e) => (e.preventDefault(), document.getElementById(g.id)?.scrollIntoView({ behavior: 'smooth' }))} className="rounded-full px-4 py-2 text-[14px] text-white/80 ring-1 ring-white/20 hover:bg-white/10 hover:text-white">
              {g.eyebrow}
            </a>
          ))}
        </nav>
      </PageHero>
      {GROUPS.map((g) => (
        <Section key={g.id} id={g.id} eyebrow={g.eyebrow} title={g.title} dark={g.dark}>
          <ul className={`grid gap-px overflow-hidden rounded-[22px] border sm:grid-cols-2 xl:grid-cols-4 ${g.dark ? 'border-white/10 bg-white/10' : 'border-line bg-line'}`}>
            {g.items.map((f) => (
              <li key={f.t} className={`p-6 ${g.dark ? 'bg-black' : 'bg-sheet'}`}>
                <span className={`grid h-10 w-10 place-items-center rounded-[12px] ${g.dark ? 'bg-white/10 text-white' : 'bg-sign-soft text-sign'}`}>
                  <f.icon size={19} strokeWidth={1.8} />
                </span>
                <h3 className="mt-5 text-[16.5px] font-[600] tracking-[-0.01em]">{f.t}</h3>
                <p className={`mt-1.5 text-[14.5px] leading-relaxed ${g.dark ? 'text-white/65' : 'text-muted'}`}>{f.d}</p>
              </li>
            ))}
          </ul>
        </Section>
      ))}
      <section className="border-t border-line">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-6 px-5 py-16 sm:px-8">
          <h2 className="max-w-[22ch] font-display tracking-[-0.035em] text-[clamp(32px,4vw,52px)] leading-[1.02] font-[600]">See it working on sample data</h2>
          <div className="flex flex-wrap gap-2">
            <Link to="/login" className={btnClass('primary', 'lg')}>
              <Smartphone size={17} /> Open the live demo
            </Link>
            <Link to="/send" className={btnClass('secondary', 'lg')}>
              Send a parcel
            </Link>
          </div>
        </div>
      </section>
    </SitePage>
  );
}
