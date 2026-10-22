import type { InvoiceRec } from '@suraj/core';
import { useState } from 'react';
import { Badge, Button, Empty, ErrorNote, KV, Loading, Modal, PageHeader, Panel, StatusBadge, Tabs } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dateOnly, dt, inr } from '../lib/format';
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

export function Billing() {
  const [tab, setTab] = useState<'unbilled' | 'invoices'>('unbilled');
  const unbilled = useApi<Group[]>('/api/billing/unbilled', { liveTypes: ['shipment.status'] });
  const invoices = useApi<InvoiceRec[]>('/api/invoices');
  const [view, setView] = useState<string | null>(null);
  const act = useAction();
  const today = new Date().toISOString().slice(0, 10);
  const due = (invoices.data ?? []).filter((i) => i.status === 'SENT');
  const overdue = due.filter((i) => i.dueDate < today);

  const create = (g: Group) =>
    act.run(async () => {
      const inv = await api.post<InvoiceRec>('/api/invoices', { shipmentIds: g.shipments.map((s) => s.id) });
      await Promise.all([unbilled.reload(), invoices.reload()]);
      setTab('invoices');
      setView(inv.id);
    });

  return (
    <div>
      <PageHeader
        title="Billing"
        sub={due.length ? `${inr(due.reduce((a, i) => a + i.total, 0))} waiting to be paid on ${due.length} ${due.length === 1 ? 'invoice' : 'invoices'}${overdue.length ? `, ${overdue.length} overdue` : ''}` : 'No unpaid invoices'}
      />
      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'unbilled', label: `Ready to bill (${unbilled.data?.length ?? 0})` },
            { value: 'invoices', label: 'Invoices' },
          ]}
        />
      </div>
      <ErrorNote>{act.error}</ErrorNote>
      {tab === 'unbilled' ? (
        !unbilled.data ? (
          <Loading />
        ) : unbilled.data.length === 0 ? (
          <Panel>
            <Empty title="Everything delivered is billed">New invoices appear here as shipments are delivered.</Empty>
          </Panel>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {unbilled.data.map((g) => (
              <Panel
                key={g.customerId ?? g.shipperName}
                title={g.shipperName}
                action={
                  <Button size="sm" variant="primary" disabled={act.busy} onClick={() => create(g)}>
                    Invoice {inr(g.total)}
                  </Button>
                }
                bodyClass="p-0"
              >
                <ul className="divide-y divide-line">
                  {g.shipments.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2 text-[14px]">
                      <span className="min-w-0">
                        <span className="awb">{s.awb}</span>{' '}
                        <span className="text-muted">
                          {s.service} · {s.originCity} → {s.destCity}
                        </span>
                      </span>
                      <span className="num shrink-0">{inr(s.price)}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            ))}
          </div>
        )
      ) : (
        <Panel bodyClass="p-0">
          {!invoices.data ? (
            <Loading />
          ) : (
            <div className="scroll-x">
              <table className="data">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Customer</th>
                    <th>Date</th>
                    <th>Due</th>
                    <th className="text-right">Taxable</th>
                    <th className="text-right">GST</th>
                    <th className="text-right">Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.data.map((i) => (
                    <tr key={i.id} className="clickable" onClick={() => setView(i.id)}>
                      <td className="num font-medium whitespace-nowrap">{i.invoiceNo}</td>
                      <td>{i.customerName}</td>
                      <td className="whitespace-nowrap">{dateOnly(i.createdAt)}</td>
                      <td className="whitespace-nowrap">
                        {dateOnly(i.dueDate)} {i.status === 'SENT' && i.dueDate < today && <Badge tone="bad">Overdue</Badge>}
                      </td>
                      <td className="num text-right">{inr(i.subtotal)}</td>
                      <td className="num text-right">{inr(i.gst)}</td>
                      <td className="num text-right font-medium">{inr(i.total)}</td>
                      <td>
                        <StatusBadge status={i.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
      <InvoiceModal id={view} onClose={() => setView(null)} onChanged={() => void invoices.reload()} />
    </div>
  );
}

function InvoiceModal({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { org } = useAuth();
  const { data, reload } = useApi<InvoiceView>(id ? `/api/invoices/${id}` : null);
  const act = useAction();
  const inv = data && data.id === id ? data : null;
  const setStatus = (status: 'SENT' | 'PAID') =>
    act.run(async () => {
      await api.patch(`/api/invoices/${id}`, { status });
      await reload();
      onChanged();
    });
  return (
    <Modal open={!!id} onClose={onClose} title={inv ? `Tax invoice ${inv.invoiceNo}` : 'Invoice'} wide>
      {!inv ? (
        <Loading />
      ) : (
        <div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[13px] text-muted">From</p>
              <p className="font-medium">{org?.name}</p>
              <p className="num text-[13.5px] text-muted">GSTIN {org?.gstin ?? '—'}</p>
            </div>
            <div>
              <p className="text-[13px] text-muted">Bill to</p>
              <p className="font-medium">{inv.customerName}</p>
              <p className="num text-[13.5px] text-muted">GSTIN {inv.customerGstin ?? 'unregistered'}</p>
            </div>
          </div>
          <div className="scroll-x mt-4 rounded-[10px] border border-line">
            <table className="data">
              <thead>
                <tr>
                  <th>AWB / LR</th>
                  <th>Service</th>
                  <th>Lane</th>
                  <th>Delivered</th>
                  <th className="text-right">Taxable</th>
                  <th className="text-right">GST %</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {inv.lines.map((l) => (
                  <tr key={l.awb}>
                    <td className="awb">{l.awb}</td>
                    <td>{l.service}</td>
                    <td className="whitespace-nowrap">{l.lane}</td>
                    <td className="whitespace-nowrap">{dt(l.deliveredAt)}</td>
                    <td className="num text-right">{inr(l.taxable)}</td>
                    <td className="num text-right">{l.gstRate}%</td>
                    <td className="num text-right">{inr(l.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 ml-auto max-w-[320px]">
            <KV k="Taxable value" v={inr(inv.subtotal)} />
            <KV k="GST" v={inr(inv.gst)} />
            <KV k="Invoice total" v={<b>{inr(inv.total)}</b>} />
            <KV k="Due date" v={dateOnly(inv.dueDate)} />
          </div>
          <p className="mt-3 text-[12.5px] text-muted">GST shown as charged at booking. Check the rate and the forward/reverse charge treatment for your registration with your CA before sending.</p>
          <ErrorNote>{act.error}</ErrorNote>
          <div className="mt-4 flex flex-wrap gap-2">
            <StatusBadge status={inv.status} />
            {inv.status === 'DRAFT' && (
              <Button variant="primary" disabled={act.busy} onClick={() => setStatus('SENT')}>
                Mark as sent
              </Button>
            )}
            {inv.status === 'SENT' && (
              <Button variant="primary" disabled={act.busy} onClick={() => setStatus('PAID')}>
                Record payment
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
