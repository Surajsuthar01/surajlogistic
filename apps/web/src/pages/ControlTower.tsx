import type { Dashboard, ExceptionItem } from '@suraj/core';
import { AlertTriangle, BadgeIndianRupee, CircleCheck, FileWarning, PackageX, Repeat2, Timer, Warehouse as WarehouseIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { NetworkMap } from '../components/NetworkMap';
import { RevenueChart } from '../components/RevenueChart';
import { Badge, Button, Loading, PageHeader, Panel } from '../components/ui';
import { subscribe, type LiveEvent } from '../lib/api';
import { useAuth } from '../lib/auth';
import { inr, inrShort, pct } from '../lib/format';
import { useApi } from '../lib/hooks';

const SEV: Record<ExceptionItem['severity'], { tone: 'bad' | 'warn' | 'accent' | 'neutral'; label: string; bar: string }> = {
  critical: { tone: 'bad', label: 'Critical', bar: 'var(--bad)' },
  high: { tone: 'warn', label: 'High', bar: 'var(--warn)' },
  medium: { tone: 'accent', label: 'Medium', bar: 'var(--accent)' },
  low: { tone: 'neutral', label: 'Opportunity', bar: 'var(--route)' },
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
      return e.kind === 'RETURN_LOAD' ? `/marketplace?vehicle=${e.ref.id}` : '/fleet';
    case 'driver':
      return '/fleet?tab=drivers';
    case 'item':
      return '/warehouse';
    case 'invoice':
      return '/billing';
  }
}

export function ControlTower() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { data, loading, error } = useApi<Dashboard>('/api/dashboard', { liveTypes: ['shipment.status', 'shipment.created', 'trip.status', 'load.created', 'load.booked'], debounceMs: 600 });
  const [live, setLive] = useState<Record<string, { lat: number; lng: number; late?: boolean }>>({});
  const [feed, setFeed] = useState<LiveEvent[]>([]);
  const narrow = typeof window !== 'undefined' && window.innerWidth < 640;

  useEffect(
    () =>
      subscribe((e) => {
        if (e.type === 'trip.ping') setLive((l) => ({ ...l, [e.payload.id]: { lat: e.payload.lat, lng: e.payload.lng, late: e.payload.late } }));
        setFeed((f) => [e, ...f].slice(0, 7));
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

  if (loading && !data) return <Loading label="Loading control tower" />;
  if (error && !data) return <p className="text-bad">{error}</p>;
  if (!data) return null;
  const k = data.kpis;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const kpis: { label: string; value: string; sub: string; tone?: 'good' | 'warn' | 'bad' }[] = [
    { label: 'Moving now', value: String(k.inTransit), sub: `${k.tripsInTransit} trucks on the road` },
    { label: 'Delivered today', value: String(k.deliveredToday), sub: `${k.bookedToday} new bookings today` },
    { label: 'On-time, 30 days', value: pct(k.onTimeRate), sub: 'within 2 h of promise', tone: k.onTimeRate >= 90 ? 'good' : k.onTimeRate >= 75 ? 'warn' : 'bad' },
    { label: 'Fleet in use', value: pct(k.fleetUtilisation), sub: `${k.idleVehicles} of ${k.fleetSize} trucks idle`, tone: k.fleetUtilisation >= 70 ? 'good' : 'warn' },
    { label: 'Booked, 30 days', value: inrShort(k.revenue30d), sub: `${inr(k.receivables)} invoiced, unpaid` },
    { label: 'COD in the field', value: inrShort(k.codInField), sub: `RTO rate ${pct(k.rtoRate)} on parcels`, tone: k.rtoRate > 15 ? 'bad' : undefined },
  ];

  return (
    <div>
      <PageHeader
        title={`${greet}, ${user?.name.split(' ')[0] ?? 'there'}`}
        sub={
          <span className="inline-flex items-center gap-2">
            <span className="relative inline-flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-good opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-good" />
            </span>
            Live · {data.exceptions.filter((e) => e.severity === 'critical' || e.severity === 'high').length} things need you now
          </span>
        }
        actions={
          <>
            <Button onClick={() => nav('/trips?new=1')}>Plan a trip</Button>
            <Button variant="primary" onClick={() => nav('/shipments/new')}>
              Book shipment
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-line bg-line sm:grid-cols-3 xl:grid-cols-6">
        {kpis.map((m) => (
          <div key={m.label} className="bg-panel px-4 py-3">
            <div className="text-[13px] text-muted">{m.label}</div>
            <div className={`num font-display text-[28px] font-bold leading-tight ${m.tone === 'bad' ? 'text-bad' : m.tone === 'warn' ? 'text-warn' : ''}`}>{m.value}</div>
            <div className="text-[12.5px] text-muted">{m.sub}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Panel title="Network" action={<span className="text-[13px] text-muted">{trips.length} lanes running · tap a lane to open its trip</span>} bodyClass="p-2">
          <NetworkMap vehicles={vehicles} trips={trips} facilities={data.map.facilities} height={narrow ? 380 : 470} onSelectTrip={(id) => nav(`/trips/${id}`)} />
        </Panel>

        <Panel title="Needs attention" action={<Badge tone="neutral">{data.exceptions.length}</Badge>} bodyClass="max-h-[520px] overflow-y-auto">
          {data.exceptions.length === 0 && <p className="p-4 text-muted">Nothing needs you right now.</p>}
          <ul>
            {data.exceptions.map((e) => {
              const Icon = KIND_ICON[e.kind];
              const s = SEV[e.severity];
              return (
                <li key={e.id} className="border-b border-line last:border-0">
                  <Link to={linkFor(e)} className="flex gap-3 px-4 py-3 hover:bg-panel-2">
                    <span className="mt-0.5 w-1 shrink-0 self-stretch rounded-full" style={{ background: s.bar }} aria-hidden="true" />
                    <Icon size={18} className="mt-0.5 shrink-0 text-muted" />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[14.5px] font-medium">{e.title}</span>
                        <Badge tone={s.tone}>{s.label}</Badge>
                      </span>
                      <span className="mt-0.5 block text-[13.5px] text-muted">{e.detail}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel title="Booked revenue, last 14 days" action={<span className="num text-[13.5px] text-muted">{inr(data.revenueByDay.reduce((a, d) => a + d.revenue, 0))} total</span>}>
          <RevenueChart days={data.revenueByDay} />
        </Panel>
        <div className="grid gap-5">
          <Panel title="Business mix, 30 days">
            <ul className="space-y-3">
              {data.byService.map((s) => {
                const total = data.byService.reduce((a, x) => a + x.revenue, 0) || 1;
                const share = (s.revenue / total) * 100;
                return (
                  <li key={s.service}>
                    <div className="flex justify-between text-[14px]">
                      <span className="font-medium">{s.service === 'COURIER' ? 'Courier parcels' : s.service === 'PTL' ? 'Part truckload' : 'Full truckload'}</span>
                      <span className="num text-muted">
                        {s.count} · {inrShort(s.revenue)}
                      </span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-panel-2">
                      <div className="h-2 rounded-full bg-route" style={{ width: `${share}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 flex items-center gap-2 text-[13.5px] text-muted">
              <CircleCheck size={16} className="text-good" /> {Math.round(k.co2Kg30d / 1000).toLocaleString('en-IN')} t CO₂ estimated across 30 days of shipments
            </p>
          </Panel>
          <Panel title="Live activity">
            {feed.length === 0 ? (
              <p className="text-[14px] text-muted">GPS pings and status changes appear here as they happen.</p>
            ) : (
              <ul className="space-y-2 text-[13.5px]">
                {feed.map((e, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate">{describe(e)}</span>
                    <span className="shrink-0 text-muted">{new Date(e.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function describe(e: LiveEvent) {
  const p = e.payload;
  switch (e.type) {
    case 'trip.ping':
      return `${p.tripNo} GPS · ${p.speedKmph} km/h · ${Math.round(p.progress * 100)}% of lane`;
    case 'shipment.status':
      return `${p.awb} → ${String(p.status).replace(/_/g, ' ').toLowerCase()}`;
    case 'shipment.created':
      return `New booking ${p.awb}`;
    case 'trip.status':
      return `Trip ${p.tripNo ?? ''} ${String(p.status).toLowerCase().replace('_', ' ')}`;
    case 'load.booked':
      return `Load ${p.loadNo} booked`;
    case 'load.created':
      return `Load ${p.loadNo} posted`;
    default:
      return e.type;
  }
}
