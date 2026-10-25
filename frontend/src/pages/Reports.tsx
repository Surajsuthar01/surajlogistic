import { istToday, type Report } from '@suraj/shared';
import { Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, Input, Loading, PageHeader, Select, StatStrip } from '../components/ui';
import { inr, inrShort, pct, svc } from '../lib/format';
import { downloadXlsx } from '../lib/xlsx';
import { useApi } from '../lib/hooks';

type Period = 'month' | 'last' | '90' | 'fy' | 'custom';

function range(p: Period, custom: { from: string; to: string }) {
  const today = istToday();
  const [y, m] = today.split('-').map(Number) as [number, number];
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  switch (p) {
    case 'month':
      return { from: `${y}-${String(m).padStart(2, '0')}-01`, to: today };
    case 'last': {
      const a = new Date(Date.UTC(y, m - 2, 1));
      const b = new Date(Date.UTC(y, m - 1, 0));
      return { from: iso(a), to: iso(b) };
    }
    case '90':
      return { from: iso(new Date(Date.now() - 89 * 86400_000)), to: today };
    case 'fy':
      return { from: `${m >= 4 ? y : y - 1}-04-01`, to: today };
    default:
      return custom;
  }
}

export function Reports() {
  const [period, setPeriod] = useState<Period>('90');
  const [custom, setCustom] = useState({ from: istToday().slice(0, 8) + '01', to: istToday() });
  const r = useMemo(() => range(period, custom), [period, custom]);
  const { data, loading } = useApi<Report>(`/api/reports?from=${r.from}&to=${r.to}`);
  const s = data?.summary;
  const label = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div>
      <PageHeader
        title="Reports"
        sub={`${label(r.from)} to ${label(r.to)}. Bookings count on the day they were booked; trips on the day they finished.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select id="rep-period" aria-label="Period" value={period} onChange={(e) => setPeriod(e.target.value as Period)} className="!w-auto">
              <option value="month">This month</option>
              <option value="last">Last month</option>
              <option value="90">Last 90 days</option>
              <option value="fy">This financial year</option>
              <option value="custom">Pick dates</option>
            </Select>
            {period === 'custom' && (
              <>
                <Input type="date" aria-label="From" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="!w-auto" />
                <Input type="date" aria-label="To" value={custom.to} min={custom.from} max={istToday()} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="!w-auto" />
              </>
            )}
          </div>
        }
      />
      {loading && !data ? (
        <div className="sheet">
          <Loading rows={8} />
        </div>
      ) : !data || !s ? null : (
        <div className="space-y-8">
          <StatStrip
            cols="grid-cols-2 md:grid-cols-3 xl:grid-cols-6"
            items={[
              { k: 'Booked', v: inrShort(s.revenue), sub: `${s.shipments} shipments` },
              { k: 'Delivered on time', v: pct(s.onTimeRate), sub: `${s.delivered} delivered` },
              { k: 'Parcels returned', v: pct(s.rtoRate), sub: `${s.returned} came back`, bad: s.rtoRate > 15 },
              { k: 'Trip freight', v: inrShort(s.freight), sub: `${s.trips} ${s.trips === 1 ? 'trip' : 'trips'}, ${s.km.toLocaleString('en-IN')} km` },
              { k: 'Trip profit', v: inrShort(s.tripProfit), sub: `${pct(s.margin)} after diesel and tolls`, bad: s.tripProfit < 0 },
              { k: 'Carbon', v: `${(s.co2Kg / 1000).toLocaleString('en-IN', { maximumFractionDigits: 1 })} t`, sub: 'CO₂, estimated' },
            ].map((m) => ({ label: m.k, value: m.v, sub: m.sub, tone: m.bad ? ('bad' as const) : undefined }))}
          />

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <section className="sheet px-4 pt-3.5 pb-4">
              <h2 className="t-sub mb-3">Bookings by month</h2>
              <MonthBars months={data.months} />
            </section>
            <section className="sheet px-4 pt-3.5 pb-4">
              <h2 className="t-sub mb-3">By service</h2>
              <ul className="space-y-3">
                {data.byService.map((b) => {
                  const share = s.revenue ? (b.revenue / s.revenue) * 100 : 0;
                  return (
                    <li key={b.service}>
                      <div className="flex items-baseline justify-between gap-3 text-[15px]">
                        <span className="font-[540]">{svc(b.service)}</span>
                        <span className="num text-muted">
                          {b.shipments}, <span className="text-ink">{inrShort(b.revenue)}</span>
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sheet" style={{ boxShadow: 'inset 0 0 0 1px var(--line)' }}>
                        <div className="bar-fill h-full rounded-full" style={{ width: `${Math.max(1, share)}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>

          <ReportTable
            title="Lanes"
            note="Best earning lanes first: bookings plus trip profit."
            file="lanes"
            head={['Lane', 'Shipments', 'Booked', 'Trips', 'Trip profit', 'On time']}
            align={['l', 'r', 'r', 'r', 'r', 'r']}
            rows={data.lanes.map((l) => [l.lane, l.shipments, l.revenue, l.trips, l.tripProfit, l.onTimeRate === null ? null : `${l.onTimeRate}%`])}
            money={[2, 4]}
          />
          <ReportTable
            title="Customers"
            note="Who brings the business."
            file="customers"
            head={['Customer', 'Shipments', 'Booked', 'Share']}
            align={['l', 'r', 'r', 'r']}
            rows={data.customers.map((c) => [c.name, c.shipments, c.revenue, `${c.share}%`])}
            money={[2]}
          />
          <ReportTable
            title="Drivers"
            note="Finished trips only."
            file="drivers"
            head={['Driver', 'Trips', 'Km', 'On time', 'Trip profit', 'Rating']}
            align={['l', 'r', 'r', 'r', 'r', 'r']}
            rows={data.drivers.map((d) => [d.name, d.trips, d.km, d.onTimeRate === null ? null : `${d.onTimeRate}%`, d.profit, d.rating.toFixed(1)])}
            money={[4]}
          />
        </div>
      )}
    </div>
  );
}

function ReportTable({ title, note, file, head, rows, align, money }: { title: string; note: string; file: string; head: string[]; rows: (string | number | null)[][]; align: ('l' | 'r')[]; money: number[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, 8);
  return (
    <section>
      <div className="mb-2.5 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="t-head">{title}</h2>
          <p className="text-[14px] text-muted">{note}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void downloadXlsx(`${file}.xlsx`, title, [head, ...rows])} title="Download as an Excel file">
          <Download size={15} /> Excel
        </Button>
      </div>
      <div className="sheet scroll-x">
        {rows.length === 0 ? (
          <p className="px-4 py-5 text-[15px] text-muted">Nothing in this period.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                {head.map((h, i) => (
                  <th key={h} className={align[i] === 'r' ? 'text-right' : ''}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j} className={`${align[j] === 'r' ? 'num text-right' : ''} ${j === 0 ? 'font-[540]' : ''} ${money.includes(j) && typeof c === 'number' && c < 0 ? 'text-bad' : ''}`}>
                      {c === null ? <span className="text-faint">–</span> : money.includes(j) && typeof c === 'number' ? inr(c) : typeof c === 'number' ? c.toLocaleString('en-IN') : c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {rows.length > 8 && (
        <Button variant="ghost" size="sm" className="mt-1.5" onClick={() => setAll((a) => !a)}>
          {all ? 'Show fewer' : `Show all ${rows.length}`}
        </Button>
      )}
    </section>
  );
}

function MonthBars({ months }: { months: Report['months'] }) {
  const max = Math.max(1, ...months.map((m) => m.revenue));
  return (
    <div className="flex h-[190px] items-end gap-3" role="img" aria-label="Booked revenue by month">
      {months.map((m, i) => {
        const h = (m.revenue / max) * 140;
        const last = i === months.length - 1;
        const name = new Date(m.month + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'short' });
        return (
          <div key={m.month} className="flex min-w-0 flex-1 flex-col items-center justify-end" title={`${name}: ${inr(m.revenue)} from ${m.shipments} shipments`}>
            <span className="num mb-1 text-[12.5px] text-muted">{m.revenue ? inrShort(m.revenue) : ''}</span>
            <div className={`w-full max-w-[56px] rounded-t-[6px] ${last ? '' : 'bar-col'}`} style={{ height: Math.max(m.revenue ? 2 : 0, h), ...(last ? { background: 'linear-gradient(180deg, #ffe066, var(--plate))', boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.5)' } : {}) }} />
            <span className={`mt-1.5 text-[13px] ${last ? 'font-[600]' : 'text-muted'}`}>{name}</span>
          </div>
        );
      })}
    </div>
  );
}
