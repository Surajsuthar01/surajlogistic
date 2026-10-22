import { STATUS_LABEL, type ShipmentRec, type ShipmentStatus } from '@suraj/core';
import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Empty, Input, Loading, PageHeader, Panel, Select, StatusBadge, Tabs } from '../components/ui';
import { dt, inr, kg } from '../lib/format';
import { useApi } from '../lib/hooks';

const VIEWS = {
  all: '',
  moving: 'PICKED_UP,IN_TRANSIT,AT_HUB,OUT_FOR_DELIVERY',
  booked: 'BOOKED',
  action: 'NDR,RTO',
  delivered: 'DELIVERED',
} as const;
type View = keyof typeof VIEWS;

export function Shipments() {
  const nav = useNavigate();
  const [view, setView] = useState<View>('all');
  const [service, setService] = useState('');
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const params = new URLSearchParams({ limit: '200' });
  if (VIEWS[view]) params.set('status', VIEWS[view]);
  if (service) params.set('service', service);
  if (term) params.set('q', term);
  const { data, loading } = useApi<{ items: Omit<ShipmentRec, 'deliveryOtp'>[]; total: number }>(`/api/shipments?${params}`, { liveTypes: ['shipment.status', 'shipment.created'] });

  return (
    <div>
      <PageHeader
        title="Shipments"
        sub="Parcels, part loads and full trucks in one list"
        actions={
          <Button variant="primary" onClick={() => nav('/shipments/new')}>
            <Plus size={17} /> Book shipment
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs
          value={view}
          onChange={setView}
          items={[
            { value: 'all', label: 'All' },
            { value: 'booked', label: 'To pick up' },
            { value: 'moving', label: 'Moving' },
            { value: 'action', label: 'Needs action' },
            { value: 'delivered', label: 'Delivered' },
          ]}
        />
        <Select id="svc-filter" value={service} onChange={(e) => setService(e.target.value)} className="!w-auto" aria-label="Service">
          <option value="">All services</option>
          <option value="COURIER">Courier</option>
          <option value="PTL">Part truckload</option>
          <option value="FTL">Full truckload</option>
        </Select>
        <form
          className="relative min-w-[220px] flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            setTerm(q.trim());
          }}
        >
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <Input id="ship-search" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => setTerm(q.trim())} placeholder="AWB, receiver, shipper or city" className="pl-9" />
        </form>
      </div>
      <Panel bodyClass="p-0">
        {loading && !data ? (
          <Loading />
        ) : !data?.items.length ? (
          <Empty title="No shipments match">Try another filter, or book a new shipment.</Empty>
        ) : (
          <div className="scroll-x">
            <table className="data">
              <thead>
                <tr>
                  <th>AWB / LR</th>
                  <th>Lane</th>
                  <th>Service</th>
                  <th>Shipper → receiver</th>
                  <th>Status</th>
                  <th>ETA</th>
                  <th className="text-right">Price</th>
                  <th>RTO risk</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((s) => {
                  const late = !['DELIVERED', 'RTO_DELIVERED', 'CANCELLED'].includes(s.status) && new Date(s.etaAt).getTime() > new Date(s.promisedAt).getTime() + 2 * 3600_000;
                  return (
                    <tr key={s.id} className="clickable" onClick={() => nav(`/shipments/${s.id}`)}>
                      <td className="awb whitespace-nowrap">{s.awb}</td>
                      <td className="whitespace-nowrap">
                        {s.originCity} → {s.destCity}
                        <div className="text-[12.5px] text-muted">
                          {s.distanceKm.toLocaleString('en-IN')} km · {kg(s.weightKg)}
                        </div>
                      </td>
                      <td>{s.service}</td>
                      <td className="min-w-[180px]">
                        <div className="truncate">{s.shipperName}</div>
                        <div className="truncate text-[12.5px] text-muted">{s.consigneeName}</div>
                      </td>
                      <td>
                        <StatusBadge status={s.status} label={STATUS_LABEL[s.status as ShipmentStatus]} />
                      </td>
                      <td className="whitespace-nowrap">
                        {s.status === 'DELIVERED' ? <span className="text-muted">{dt(s.deliveredAt)}</span> : dt(s.etaAt)}
                        {late && (
                          <div>
                            <Badge tone="bad">Late</Badge>
                          </div>
                        )}
                      </td>
                      <td className="num text-right whitespace-nowrap">{inr(s.price)}</td>
                      <td>{s.service === 'COURIER' || s.paymentMode === 'COD' ? <StatusBadge status={s.rtoLevel} label={`${s.rtoScore} · ${s.rtoLevel.toLowerCase()}`} /> : <span className="text-muted">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {data && <p className="mt-2 text-[13px] text-muted">{data.total} shipments</p>}
    </div>
  );
}
