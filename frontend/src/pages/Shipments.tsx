import type { ShipmentRec } from '@suraj/shared';
import { Download, Plus, Search, Upload } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ButtonLink, Empty, Loading, PageHeader, RiskMeter, Select, StatusMark, Tabs, btnClass } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dt, inr, kg, lane, svc } from '../lib/format';
import { downloadXlsx } from '../lib/xlsx';
import { useApi } from '../lib/hooks';

const VIEWS = {
  all: '',
  requested: 'REQUESTED',
  booked: 'BOOKED',
  moving: 'PICKED_UP,IN_TRANSIT,AT_HUB,OUT_FOR_DELIVERY',
  action: 'NDR,RTO',
  delivered: 'DELIVERED',
} as const;
type View = keyof typeof VIEWS;
type Row = Omit<ShipmentRec, 'deliveryOtp'>;
interface ListResp {
  items: Row[];
  total: number;
  counts?: Record<View, number>;
}

export const isLate = (s: { status: string; etaAt: string; promisedAt: string }) => !['DELIVERED', 'RTO_DELIVERED', 'CANCELLED'].includes(s.status) && new Date(s.etaAt).getTime() > new Date(s.promisedAt).getTime() + 2 * 3600_000;
const lateBy = (s: { etaAt: string; promisedAt: string }) => Math.round((new Date(s.etaAt).getTime() - new Date(s.promisedAt).getTime()) / 3600_000);

export function Shipments() {
  const nav = useNavigate();
  const { user } = useAuth();
  const customer = user?.role === 'customer';
  const [sp] = useSearchParams();
  const [view, setView] = useState<View>(() => (sp.get('view') as View) in VIEWS ? (sp.get('view') as View) : 'all');
  const [service, setService] = useState('');
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const params = new URLSearchParams({ limit: '200' });
  if (VIEWS[view]) params.set('status', VIEWS[view]);
  if (service) params.set('service', service);
  if (term) params.set('q', term);
  const { data, loading } = useApi<ListResp>(`/api/shipments?${params}`, { liveTypes: ['shipment.status', 'shipment.created'] });

  const exportExcel = async () => {
    const all = await api.get<ListResp>(`/api/shipments?limit=5000${service ? `&service=${service}` : ''}${VIEWS[view] ? `&status=${VIEWS[view]}` : ''}`);
    await downloadXlsx(`shipments-${new Date().toISOString().slice(0, 10)}.xlsx`, customer ? 'Your shipments' : 'Shipments', [
      ['AWB', 'Service', 'Status', 'From', 'To', 'Km', 'Weight kg', 'Packages', 'Shipper', 'Receiver', 'Receiver phone', 'Payment', 'COD amount', 'Price incl GST', 'Booked', 'Promised', 'ETA', 'Delivered', 'E-way bill'],
      ...all.items.map((s) => [s.awb, svc(s.service), s.status, s.originCity, s.destCity, s.distanceKm, s.weightKg, s.packages, s.shipperName, s.consigneeName, s.consigneePhone, s.paymentMode, s.codAmount, s.price, s.createdAt, s.promisedAt, s.etaAt, s.deliveredAt ?? '', s.ewaybillNo ?? '']),
    ]);
  };

  return (
    <div>
      <PageHeader
        title={customer ? 'Your shipments' : 'Shipments'}
        sub={customer ? 'Everything you have booked with us, with live status.' : 'Parcels, part loads and full trucks in one list.'}
        actions={
          <>
            <ButtonLink to="/shipments/bulk">
              <Upload size={16} /> Upload a sheet
            </ButtonLink>
            <ButtonLink to="/shipments/new" variant="primary">
              <Plus size={17} /> Book shipment
            </ButtonLink>
          </>
        }
      />
      <Tabs
        value={view}
        onChange={setView}
        items={[
          { value: 'all', label: 'All', count: data?.counts?.all },
          ...(!customer ? [{ value: 'requested' as View, label: 'To confirm', count: data?.counts?.requested }] : []),
          { value: 'booked', label: 'To pick up', count: data?.counts?.booked },
          { value: 'moving', label: 'Moving', count: data?.counts?.moving },
          { value: 'action', label: 'Needs action', count: data?.counts?.action },
          { value: 'delivered', label: 'Delivered', count: data?.counts?.delivered },
        ]}
      />
      <div className="mt-4 mb-3 flex flex-wrap items-center gap-2">
        <form
          className="relative min-w-[240px] flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            setTerm(q.trim());
          }}
        >
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
          <input id="ship-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => setTerm(q.trim())} placeholder="AWB, receiver, shipper or city" aria-label="Search shipments" className="h-11 w-full rounded-full border border-line bg-sheet-2 pr-4 pl-10 text-[15px] placeholder:text-faint transition-colors hover:border-line-strong focus:border-accent focus:bg-sheet focus:outline-none focus:ring-4 focus:ring-sign/15" />
        </form>
        <Select id="svc-filter" value={service} onChange={(e) => setService(e.target.value)} className="!w-auto" aria-label="Service">
          <option value="">All services</option>
          <option value="COURIER">Parcels</option>
          <option value="PTL">Part loads</option>
          <option value="FTL">Full trucks</option>
        </Select>
        <button type="button" onClick={() => void exportExcel()} className={btnClass('ghost', 'md')} title="Download as an Excel file">
          <Download size={16} /> Excel
        </button>
      </div>

      {loading && !data ? (
        <div className="sheet">
          <Loading rows={6} />
        </div>
      ) : !data?.items.length ? (
        <div className="sheet">
          {term || service || view !== 'all' ? (
            <Empty title="No shipments match these filters">Clear the search or pick another tab.</Empty>
          ) : (
            <Empty title="No shipments yet" action={<ButtonLink to="/shipments/new" variant="primary">Book the first one</ButtonLink>}>
              Book a parcel, a part load or a full truck. You get an AWB number, a price and a tracking link for the receiver.
            </Empty>
          )}
        </div>
      ) : (
        <>
          {/* Phone: one card per shipment */}
          <ul className="space-y-2 sm:hidden">
            {data.items.map((s) => (
              <li key={s.id}>
                <Link to={`/shipments/${s.id}`} className="sheet block px-4 py-3 active:bg-sheet-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="awb text-[15px]">{s.awb}</span>
                    <span className="num font-[560]">{inr(s.price)}</span>
                  </div>
                  <div className="mt-0.5 text-[15.5px] font-[560]">{lane(s.originCity, s.destCity)}</div>
                  <div className="text-[14px] text-muted">
                    {s.consigneeName}, {kg(s.weightKg)}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <StatusMark status={s.status} />
                    <span className={`text-[13.5px] ${isLate(s) ? 'font-[560] text-bad' : 'text-muted'}`}>{s.status === 'DELIVERED' ? dt(s.deliveredAt) : isLate(s) ? `${lateBy(s)} h late` : `Due ${dt(s.etaAt)}`}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="sheet scroll-x hidden sm:block">
            <table className="data">
              <thead>
                <tr>
                  <th>AWB</th>
                  <th>Lane</th>
                  <th>{customer ? 'Receiver' : 'Shipper and receiver'}</th>
                  <th>Status</th>
                  <th>Due</th>
                  <th className="text-right">Price</th>
                  {!customer && <th>Return risk</th>}
                </tr>
              </thead>
              <tbody>
                {data.items.map((s) => {
                  const late = isLate(s);
                  return (
                    <tr key={s.id} className="clickable" onClick={() => nav(`/shipments/${s.id}`)}>
                      <td className="whitespace-nowrap">
                        <Link to={`/shipments/${s.id}`} className="awb hover:underline" onClick={(e) => e.stopPropagation()}>
                          {s.awb}
                        </Link>
                        <div className="text-[13px] text-muted">{svc(s.service)}</div>
                      </td>
                      <td className="whitespace-nowrap">
                        {lane(s.originCity, s.destCity)}
                        <div className="num text-[13px] text-muted">
                          {s.distanceKm.toLocaleString('en-IN')} km, {kg(s.weightKg)}
                        </div>
                      </td>
                      <td className="max-w-[240px] min-w-[170px]">
                        {!customer && <div className="truncate">{s.shipperName}</div>}
                        <div className={`truncate ${customer ? '' : 'text-[13px] text-muted'}`}>to {s.consigneeName}</div>
                      </td>
                      <td>
                        <StatusMark status={s.status} />
                        {late && <div className="mt-0.5 text-[13px] font-[560] text-bad">{lateBy(s)} h behind</div>}
                      </td>
                      <td className="num whitespace-nowrap">{s.status === 'DELIVERED' ? <span className="text-muted">Done {dt(s.deliveredAt)}</span> : dt(s.etaAt)}</td>
                      <td className="num text-right whitespace-nowrap">
                        {inr(s.price)}
                        {s.paymentMode === 'COD' && <div className="text-[13px] text-muted">COD {inr(s.codAmount)}</div>}
                      </td>
                      {!customer && <td>{s.service === 'COURIER' || s.paymentMode === 'COD' ? <RiskMeter score={s.rtoScore} level={s.rtoLevel} /> : <span className="text-faint">Not scored</span>}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2.5 text-[14px] text-muted">
            Showing {data.items.length} of {data.total}
          </p>
        </>
      )}
    </div>
  );
}
