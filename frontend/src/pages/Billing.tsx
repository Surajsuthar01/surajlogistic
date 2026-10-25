import type { InvoiceRec } from '@suraj/shared';
import { Printer } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, ButtonLink, Empty, ErrorNote, Field, Input, KV, Loading, Modal, Note, PageHeader, Select, StatStrip, StatusMark, Tabs, useToast } from '../components/ui';
import { api, DEMO } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dateOnly, dt, inr, inrShort, lane, svc } from '../lib/format';
import { useAction, useApi } from '../lib/hooks';

interface Group {
  shipperName: string;
  customerId: string | null;
  total: number;
  shipments: { id: string; awb: string; service: string; originCity: string; destCity: string; price: number; deliveredAt: string }[];
}
interface InvoiceView extends InvoiceRec {
  lines: { awb: string; service: string; lane: string; weightKg: number; gstRate: number; taxable: number; total: number; deliveredAt: string }[];
}

const todayIso = () => new Date().toISOString().slice(0, 10);
const daysLate = (due: string) => Math.floor((Date.now() - new Date(due + 'T23:59:59+05:30').getTime()) / 86400_000);

export function Billing() {
  const [sp] = useSearchParams();
  const { user } = useAuth();
  const customer = user?.role === 'customer';
  const [tab, setTab] = useState<'unbilled' | 'invoices'>(customer || sp.get('tab') === 'invoices' ? 'invoices' : 'unbilled');
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'overdue' | 'paid'>('all');
  const unbilled = useApi<Group[]>(customer ? null : '/api/billing/unbilled', { liveTypes: ['shipment.status'] });
  const invoices = useApi<InvoiceRec[]>('/api/invoices');
  const [view, setView] = useState<string | null>(null);
  const act = useAction();
  const toast = useToast();
  const today = todayIso();
  const all = invoices.data ?? [];
  const unpaid = all.filter((i) => i.status === 'SENT' || i.status === 'DRAFT');
  const sum = (xs: InvoiceRec[]) => xs.reduce((a, i) => a + i.total, 0);
  const buckets = [
    { label: 'Not due yet', v: sum(unpaid.filter((i) => i.dueDate >= today)) },
    { label: '1 to 30 days late', v: sum(unpaid.filter((i) => i.dueDate < today && daysLate(i.dueDate) <= 30)) },
    { label: '31 to 60 days late', v: sum(unpaid.filter((i) => daysLate(i.dueDate) > 30 && daysLate(i.dueDate) <= 60)) },
    { label: 'Over 60 days late', v: sum(unpaid.filter((i) => daysLate(i.dueDate) > 60)) },
  ];
  const shown = all.filter((i) => (filter === 'all' ? true : filter === 'paid' ? i.status === 'PAID' : filter === 'unpaid' ? i.status !== 'PAID' : i.status !== 'PAID' && i.dueDate < today));

  const create = (g: Group) =>
    act.run(async () => {
      const inv = await api.post<InvoiceRec>('/api/invoices', { shipmentIds: g.shipments.map((s) => s.id) });
      await Promise.all([unbilled.reload(), invoices.reload()]);
      setTab('invoices');
      setView(inv.id);
      toast(`Invoice ${inv.invoiceNo} drafted`);
    });

  return (
    <div>
      <PageHeader title={customer ? 'Your invoices' : 'Billing'} sub={customer ? 'Tax invoices for delivered shipments. Print or save any of them as PDF.' : 'Turn delivered shipments into GST invoices and keep track of who owes what.'} />

      {!customer && (
        <StatStrip className="mb-7" cols="grid-cols-2 lg:grid-cols-4" items={buckets.map((b, i) => ({ label: b.label, value: inrShort(b.v), tone: i === 0 || b.v === 0 ? undefined : i === 1 ? ('warn' as const) : ('bad' as const) }))} />
      )}

      {!customer && (
        <Tabs
          value={tab}
          onChange={setTab}
          className="mb-4"
          items={[
            { value: 'unbilled', label: 'Ready to bill', count: unbilled.data?.length },
            { value: 'invoices', label: 'Invoices', count: all.length },
          ]}
        />
      )}
      <ErrorNote>{act.error}</ErrorNote>
      {tab === 'unbilled' && !customer ? (
        !unbilled.data ? (
          <div className="sheet">
            <Loading rows={5} />
          </div>
        ) : unbilled.data.length === 0 ? (
          <div className="sheet">
            <Empty title="Everything delivered is billed">Delivered shipments show up here, grouped by customer, ready to go on an invoice.</Empty>
          </div>
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {unbilled.data.map((g) => (
              <section key={g.customerId ?? g.shipperName} className="sheet">
                <header className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3.5 pb-3">
                  <div>
                    <h2 className="t-sub">{g.shipperName}</h2>
                    <p className="text-[13.5px] text-muted">
                      {g.shipments.length} delivered {g.shipments.length === 1 ? 'shipment' : 'shipments'}
                    </p>
                  </div>
                  <Button size="sm" variant="primary" disabled={act.busy} onClick={() => create(g)}>
                    Invoice {inr(g.total)}
                  </Button>
                </header>
                <ul className="max-h-[260px] divide-y divide-line overflow-y-auto border-t border-line">
                  {g.shipments.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2 text-[14.5px]">
                      <span className="min-w-0">
                        <span className="awb">{s.awb}</span>
                        <span className="ml-2 text-muted">
                          {svc(s.service)}, {lane(s.originCity, s.destCity)}
                        </span>
                      </span>
                      <span className="num shrink-0">{inr(s.price)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            <Select id="inv-filter" aria-label="Show" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="!w-auto">
              <option value="all">All invoices</option>
              <option value="unpaid">Not paid</option>
              <option value="overdue">Overdue</option>
              <option value="paid">Paid</option>
            </Select>
          </div>
          <div className="sheet">
            {!invoices.data ? (
              <Loading rows={5} />
            ) : shown.length === 0 ? (
              <Empty title="No invoices here">{customer ? 'Invoices appear after your shipments are delivered and billed.' : 'Draft one from the Ready to bill tab.'}</Empty>
            ) : (
              <div className="scroll-x">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      {!customer && <th>Customer</th>}
                      <th>Date</th>
                      <th>Due</th>
                      <th className="text-right">Taxable</th>
                      <th className="text-right">GST</th>
                      <th className="text-right">Total</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((i) => {
                      const over = i.status !== 'PAID' && i.dueDate < today;
                      return (
                        <tr key={i.id} className="clickable" onClick={() => setView(i.id)}>
                          <td className="num font-[600] whitespace-nowrap">{i.invoiceNo}</td>
                          {!customer && <td>{i.customerName}</td>}
                          <td className="num whitespace-nowrap">{dateOnly(i.createdAt)}</td>
                          <td className="num whitespace-nowrap">
                            {dateOnly(i.dueDate)}
                            {over && <div className="text-[13px] font-[560] text-bad">{daysLate(i.dueDate)} days late</div>}
                          </td>
                          <td className="num text-right">{inr(i.subtotal)}</td>
                          <td className="num text-right">{inr(i.gst)}</td>
                          <td className="num text-right font-[600]">{inr(i.total)}</td>
                          <td>
                            <StatusMark status={i.status} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
      <InvoiceModal id={view} customer={customer} onClose={() => setView(null)} onChanged={() => void invoices.reload()} />
    </div>
  );
}

function InvoiceModal({ id, customer, onClose, onChanged }: { id: string | null; customer: boolean; onClose: () => void; onChanged: () => void }) {
  const { org } = useAuth();
  const toast = useToast();
  const { data, reload } = useApi<InvoiceView>(id ? `/api/invoices/${id}` : null);
  const act = useAction();
  const [pay, setPay] = useState(false);
  const [p, setP] = useState({ mode: 'UPI', ref: '', date: todayIso() });
  const inv = data && data.id === id ? data : null;
  const patch = (body: Record<string, unknown>, msg: string) =>
    act.run(async () => {
      await api.patch(`/api/invoices/${id}`, body);
      await reload();
      onChanged();
      setPay(false);
      toast(msg);
    });
  return (
    <Modal
      open={!!id}
      onClose={onClose}
      title={inv ? `Tax invoice ${inv.invoiceNo}` : 'Invoice'}
      wide
      footer={
        inv && (
          <>
            <ButtonLink to={`/print/invoice/${inv.id}`} target={DEMO ? undefined : '_blank'}>
              <Printer size={16} /> Print or save PDF
            </ButtonLink>
            {!customer && inv.status === 'DRAFT' && (
              <Button variant="primary" disabled={act.busy} onClick={() => patch({ status: 'SENT' }, `${inv.invoiceNo} sent to ${inv.customerName}`)}>
                Send to customer
              </Button>
            )}
            {!customer && inv.status === 'SENT' && !pay && (
              <Button variant="primary" onClick={() => setPay(true)}>
                Record payment
              </Button>
            )}
          </>
        )
      }
    >
      {!inv ? (
        <Loading />
      ) : (
        <div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[13.5px] text-muted">From</p>
              <p className="font-[600]">{org?.name}</p>
              <p className="num text-[14px] text-muted">GSTIN {org?.gstin ?? 'not set'}</p>
            </div>
            <div>
              <p className="text-[13.5px] text-muted">Bill to</p>
              <p className="font-[600]">{inv.customerName}</p>
              <p className="num text-[14px] text-muted">GSTIN {inv.customerGstin ?? 'unregistered'}</p>
            </div>
          </div>
          <div className="scroll-x mt-4 rounded-[12px] border border-line">
            <table className="data tight">
              <thead>
                <tr>
                  <th>AWB</th>
                  <th>Service</th>
                  <th>Lane</th>
                  <th>Delivered</th>
                  <th className="text-right">Taxable</th>
                  <th className="text-right">GST</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {inv.lines.map((l) => (
                  <tr key={l.awb}>
                    <td className="awb">{l.awb}</td>
                    <td>{svc(l.service)}</td>
                    <td className="whitespace-nowrap">{l.lane}</td>
                    <td className="num whitespace-nowrap">{dt(l.deliveredAt)}</td>
                    <td className="num text-right">{inr(l.taxable)}</td>
                    <td className="num text-right">{l.gstRate}%</td>
                    <td className="num text-right">{inr(l.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-[200px]">
              <StatusMark status={inv.status} className="text-[16px] font-[560]" />
              {inv.status === 'PAID' && inv.paidAt && <p className="mt-1 text-[14px] text-muted">Paid on {dateOnly(inv.paidAt)}</p>}
            </div>
            <dl className="m-0 w-full max-w-[320px]">
              <KV k="Taxable value" v={inr(inv.subtotal)} />
              <KV k="GST" v={inr(inv.gst)} />
              <KV k="Invoice total" v={inr(inv.total)} strong />
              <KV k="Due date" v={dateOnly(inv.dueDate)} />
            </dl>
          </div>
          {pay && (
            <form
              className="mt-4 grid gap-3 rounded-[16px] border border-line bg-sheet-2 p-4 sm:grid-cols-3"
              onSubmit={(e) => {
                e.preventDefault();
                void patch({ status: 'PAID', paidAt: p.date, paymentMode: p.mode, paymentRef: p.ref || undefined }, `${inv.invoiceNo} marked paid`);
              }}
            >
              <Field label="Received by" htmlFor="pay-mode">
                <Select id="pay-mode" value={p.mode} onChange={(e) => setP({ ...p, mode: e.target.value })}>
                  <option>UPI</option>
                  <option>NEFT / RTGS</option>
                  <option>Cheque</option>
                  <option>Cash</option>
                </Select>
              </Field>
              <Field label="Reference" htmlFor="pay-ref">
                <Input id="pay-ref" value={p.ref} onChange={(e) => setP({ ...p, ref: e.target.value })} placeholder="UTR or cheque no." />
              </Field>
              <Field label="Date" htmlFor="pay-date">
                <Input id="pay-date" type="date" value={p.date} max={todayIso()} onChange={(e) => setP({ ...p, date: e.target.value })} />
              </Field>
              <div className="flex gap-2 sm:col-span-3">
                <Button variant="primary" type="submit" disabled={act.busy}>
                  Mark {inr(inv.total)} paid
                </Button>
                <Button variant="ghost" onClick={() => setPay(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
          {!customer && <p className="mt-4 text-[13px] text-muted">GST is shown as charged at booking. Confirm the rate and the forward or reverse charge treatment for your registration with your CA before sending.</p>}
          {!customer && !org?.settings.bank?.upi && !org?.settings.bank?.account && (
            <div className="mt-3">
              <Note>Add your bank account or UPI ID in Settings and they print on every invoice with a scan-to-pay code.</Note>
            </div>
          )}
          <div className="mt-3">
            <ErrorNote>{act.error}</ErrorNote>
          </div>
        </div>
      )}
    </Modal>
  );
}
