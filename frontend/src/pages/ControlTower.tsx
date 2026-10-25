import type { Dashboard, ExceptionItem } from '@suraj/shared';
import { AlertTriangle, BadgeIndianRupee, Check, FileWarning, PackageX, Repeat2, Timer, Warehouse as WarehouseIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { NetworkMap } from '../components/NetworkMap';
import { RevenueChart } from '../components/RevenueChart';
import { ButtonLink, Chip, Loading, PageHeader, Plate, Sheet, StatStrip } from '../components/ui';
import { subscribe, type LiveEvent } from '../lib/api';
import { useAuth } from '../lib/auth';
import { inr, inrShort, pct, time } from '../lib/format';
import { useApi } from '../lib/hooks';
import { describeLive } from '../lib/live';

const SEV: Record<ExceptionItem['severity'], { label: string; color: string }> = {
  critical: { label: 'Act now', color: 'var(--bad)' },
  high: { label: 'Today', color: 'var(--warn-fill)' },
  medium: { label: 'This week', color: 'var(--info)' },
  low: { label: 'Opportunity', color: 'var(--go)' },
};

const KIND_ICON: Record<ExceptionItem['kind'], typeof Timer> = {
  DELAY: Timer,
  DOC_EXPIRY: FileWarning,
  LICENSE: FileWarning,
  NDR: PackageX,
  RTO_RISK: AlertTriangle,
  RETURN_LOAD: Repeat2,
  LOW_STOCK: WarehouseIcon,
  OVERDUE_INVOICE: BadgeIndianRupee,
};

function linkFor(e: ExceptionItem) {
  switch (e.ref.type) {
    case 'trip':
      return `/trips/${e.ref.id}`;
    case 'shipment':
      return `/shipments/${e.ref.id}`;
    case 'vehicle':
      return e.kind === 'RETURN_LOAD' ? `/marketplace?vehicle=${e.ref.id}` : `/fleet?vehicle=${e.ref.id}`;
    case 'driver':
      return '/fleet?tab=drivers';
    case 'item':
      return '/warehouse?low=1';
    case 'invoice':
      return '/billing?tab=invoices';
  }
}

export function ControlTower() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const { org } = useAuth();
  const { data, loading, error } = useApi<Dashboard>('/api/dashboard', { liveTypes: ['shipment.status', 'shipment.created', 'trip.status', 'load.created', 'load.booked'], debounceMs: 600 });
  const [live, setLive] = useState<Record<string, { lat: number; lng: number; late?: boolean }>>({});
  const [feed, setFeed] = useState<LiveEvent[]>([]);
  const [lastPing, setLastPing] = useState<string | null>(null);
  const narrow = typeof window !== 'undefined' && window.innerWidth < 640;

  useEffect(
    () =>
      subscribe((e) => {
        if (e.type === 'trip.ping') {
          setLive((l) => ({ ...l, [e.payload.id]: { lat: e.payload.lat, lng: e.payload.lng, late: e.payload.late } }));
          setLastPing(e.at);
        }
        setFeed((f) => [e, ...f].slice(0, 8));
      }),
    [],
  );

  const trips = useMemo(
    () =>
      (data?.map.trips ?? []).map((t) => {
        const p = live[t.id];
        return p ? { ...t, at: [p.lat, p.lng] as [number, number], late: p.late ?? t.late } : t;
      }),
    [data, live],
  );
  const vehicles = useMemo(
    () =>
      (data?.map.vehicles ?? []).map((v) => {
        const t = trips.find((x) => x.vehicleId === v.id);
        return t ? { ...v, lat: t.at[0], lng: t.at[1] } : v;
      }),
    [data, trips],
  );

  if (loading && !data) return <Loading rows={8} />;
  if (error && !data) return <p className="text-bad">{error}</p>;
  if (!data) return null;
  const k = data.kpis;
  const urgent = data.exceptions.filter((e) => e.severity === 'critical' || e.severity === 'high').length;
  // A company with nothing booked yet gets the setup steps instead of empty charts.
  const fresh = k.activeShipments === 0 && k.revenue30d === 0 && k.tripsInTransit === 0 && data.revenueByDay.every((d) => d.revenue === 0);

  const actions = (
    <>
      <ButtonLink to="/trips?new=1">Plan a trip</ButtonLink>
      <ButtonLink to="/shipments/new" variant="primary">
        Book shipment
      </ButtonLink>
    </>
  );

  if (fresh) return <SetupGuide orgName={org?.name ?? 'your company'} welcome={sp.get('welcome') === '1'} />;

  const figures: { label: string; value: string; sub: string; tone?: 'bad' | 'warn' }[] = [
    { label: 'Moving now', value: String(k.inTransit), sub: `${k.tripsInTransit} trucks on the road` },
    { label: 'Delivered today', value: String(k.deliveredToday), sub: `${k.bookedToday} booked today` },
    { label: 'On time, 30 days', value: pct(k.onTimeRate), sub: 'within 2 h of the promise', tone: k.onTimeRate < 75 ? 'bad' : k.onTimeRate < 90 ? 'warn' : undefined },
    { label: 'Fleet in use', value: pct(k.fleetUtilisation), sub: `${k.idleVehicles} of ${k.fleetSize} trucks idle`, tone: k.fleetUtilisation < 50 ? 'warn' : undefined },
    { label: 'Booked, 30 days', value: inrShort(k.revenue30d), sub: `${inrShort(k.receivables)} invoiced, not paid` },
    { label: 'Cash on delivery out', value: inrShort(k.codInField), sub: `${pct(k.rtoRate)} of parcels came back`, tone: k.rtoRate > 15 ? 'bad' : undefined },
  ];

  return (
    <div>
      <PageHeader
        title="Control tower"
        sub={
          <span>
            <span className="relative mr-2 inline-flex h-2.5 w-2.5 align-[0.05em]" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-go opacity-50" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-go" />
            </span>
            {urgent ? `${urgent} ${urgent === 1 ? 'thing needs' : 'things need'} you today.` : 'Nothing urgent right now.'} {lastPing ? `Last GPS update at ${time(lastPing)}.` : 'Trucks report every few minutes.'}
          </span>
        }
        actions={actions}
      />

      <StatStrip items={figures.map((m) => ({ label: m.label, value: m.value, sub: m.sub, tone: m.tone }))} />

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0">
          <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="t-sub">Network</h2>
            <span className="text-[14px] text-muted">
              {trips.length} {trips.length === 1 ? 'lane' : 'lanes'} running. Click a lane to open its trip.
            </span>
          </div>
          <NetworkMap vehicles={vehicles} trips={trips} facilities={data.map.facilities} height={narrow ? 400 : 500} onSelectTrip={(id) => nav(`/trips/${id}`)} onSelectVehicle={(id) => nav(`/fleet?vehicle=${id}`)} />
        </div>

        <Sheet title="Needs attention" aside={<Chip>{data.exceptions.length}</Chip>} pad={false} className="xl:mt-[34px]">
          {data.exceptions.length === 0 ? (
            <p className="px-4 pb-4 text-[15px] text-muted">Nothing needs you right now. Late trucks, failed deliveries, expiring papers and unpaid bills show up here.</p>
          ) : (
            <ul className="max-h-[440px] overflow-y-auto border-t border-line sm:max-h-[452px]">
              {data.exceptions.map((e) => {
                const Icon = KIND_ICON[e.kind];
                const s = SEV[e.severity];
                return (
                  <li key={e.id} className="border-b border-line last:border-0">
                    <Link to={linkFor(e)} className="group flex gap-3 px-4 py-3 hover:bg-sheet-2">
                      <span className="w-[3px] shrink-0 self-stretch rounded-full" style={{ background: s.color }} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-3">
                          <span className="text-[15px] leading-snug font-[560]">{e.headline ?? e.title}</span>
                          <Icon size={17} className="mt-0.5 shrink-0 text-faint group-hover:text-muted" aria-hidden="true" />
                        </span>
                        {e.code && <span className="mt-1.5 block">{e.codeKind === 'plate' ? <Plate reg={e.code} size={12} /> : <span className="id-chip">{e.code}</span>}</span>}
                        <span className="mt-1.5 block text-[14px] leading-snug text-muted">{e.detail}</span>
                        <span className="mt-1 block text-[13px] font-[560]" style={{ color: e.severity === 'medium' ? 'var(--info)' : e.severity === 'low' ? 'var(--go)' : e.severity === 'critical' ? 'var(--bad)' : 'var(--warn)' }}>
                          {s.label}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Sheet>
      </div>

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <Sheet title="Booked revenue, last 14 days" aside={<span className="num text-[14px] text-muted">{inr(data.revenueByDay.reduce((a, d) => a + d.revenue, 0))} in total</span>}>
          <RevenueChart days={data.revenueByDay} />
        </Sheet>
        <div className="grid content-start gap-5">
          <Sheet title="Business mix, 30 days">
            <ul className="space-y-3">
              {data.byService.map((s) => {
                const total = data.byService.reduce((a, x) => a + x.revenue, 0) || 1;
                const share = (s.revenue / total) * 100;
                return (
                  <li key={s.service}>
                    <div className="flex items-baseline justify-between gap-3 text-[15px]">
                      <span className="font-[540]">{s.service === 'COURIER' ? 'Parcels' : s.service === 'PTL' ? 'Part loads' : 'Full trucks'}</span>
                      <span className="num text-muted">
                        {s.count} {s.count === 1 ? 'booking' : 'bookings'}, <span className="text-ink">{inrShort(s.revenue)}</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sheet-2" style={{ boxShadow: 'inset 0 0 0 1px var(--line)' }}>
                      <div className="bar-fill h-full rounded-full" style={{ width: `${Math.max(1.5, share)}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-[14px] text-muted">About {Math.round(k.co2Kg30d / 1000).toLocaleString('en-IN')} tonnes of CO₂ across these shipments, estimated from distance, weight and vehicle.</p>
          </Sheet>
          <Sheet title="Live activity" aside={<span className="text-[13.5px] text-muted">IST</span>}>
            {feed.length === 0 ? (
              <p className="text-[14.5px] text-muted">GPS updates and status changes appear here as they happen.</p>
            ) : (
              <ol className="space-y-1.5 border-l-2 border-line pl-3 text-[14px]">
                {feed.map((e, i) => (
                  <li key={`${e.at}-${i}`} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate">{describeLive(e)}</span>
                    <span className="num shrink-0 text-muted">{new Date(e.at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', second: '2-digit' })}</span>
                  </li>
                ))}
              </ol>
            )}
          </Sheet>
        </div>
      </div>
    </div>
  );
}


function SetupGuide({ orgName, welcome }: { orgName: string; welcome: boolean }) {
  const { data: vehicles } = useApi<unknown[]>('/api/vehicles');
  const { data: drivers } = useApi<unknown[]>('/api/drivers');
  const { data: customers } = useApi<unknown[]>('/api/customers');
  const { data: users } = useApi<unknown[]>('/api/users');
  const steps = [
    { done: !!vehicles?.length, title: 'Add your first truck', text: 'Registration number and paper expiry dates. We warn you before insurance, fitness, permit or PUC runs out.', to: '/fleet?add=vehicle', cta: 'Add truck' },
    { done: !!drivers?.length, title: 'Add a driver', text: 'Name, mobile and licence. Give them a login and they get the Hindi driver app.', to: '/fleet?tab=drivers&add=driver', cta: 'Add driver' },
    { done: !!customers?.length, title: 'Add a customer', text: 'Shippers you bill every month. GSTIN goes on their invoices.', to: '/customers?add=1', cta: 'Add customer' },
    { done: false, title: 'Book a shipment', text: 'Pick a lane and weight to see the price. The receiver gets a tracking link on WhatsApp.', to: '/shipments/new', cta: 'Book shipment' },
    { done: (users?.length ?? 0) > 1, title: 'Invite your dispatcher', text: 'Each person gets their own login, so you can see who changed what.', to: '/team?add=1', cta: 'Invite' },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  return (
    <div className="max-w-[820px]">
      <PageHeader title={welcome ? `Welcome, ${orgName}` : 'Set up your company'} sub="Five steps and your control tower fills up with live trucks, shipments and money. Do them in any order." />
      <p className="mb-3 text-[14.5px] text-muted">
        {doneCount} of {steps.length} done
      </p>
      <ol className="sheet divide-y divide-line">
        {steps.map((s, i) => (
          <li key={s.title} className="flex flex-wrap items-center gap-4 px-4 py-4 sm:flex-nowrap">
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[15px] font-semibold ${s.done ? 'bg-go text-white' : 'border-2 border-line-strong text-muted'}`}>{s.done ? <Check size={17} /> : i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className={`t-sub ${s.done ? 'text-muted line-through decoration-1' : ''}`}>{s.title}</p>
              <p className="text-[14.5px] text-muted">{s.text}</p>
            </div>
            {!s.done && (
              <ButtonLink to={s.to} variant={i === doneCount ? 'primary' : 'secondary'} size="sm">
                {s.cta}
              </ButtonLink>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
