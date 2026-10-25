import type { CustomerRec, InvoiceRec, ShipmentRec, UserRec } from '@suraj/shared';
import { Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, ButtonLink, Drawer, Empty, ErrorNote, Field, Input, KV, Loading, Modal, PageHeader, Select, StatusMark, Textarea, useToast } from '../components/ui';
import { api } from '../lib/api';
import { ago, dateOnly, dt, inr, inrShort, lane } from '../lib/format';
import { useAction, useApi } from '../lib/hooks';
import { cityNames } from './NewShipment';

type CustomerRow = CustomerRec & { shipments30d: number; revenue30d: number; outstanding: number; lastShipmentAt: string | null; logins: number };
type CustomerDetail = CustomerRow & { shipments: ShipmentRec[]; invoices: InvoiceRec[]; users: UserRec[] };

const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function Customers() {
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState('');
  const { data, reload } = useApi<CustomerRow[]>('/api/customers?stats=1');
  const [add, setAdd] = useState(sp.get('add') === '1');
  const toast = useToast();
  const open = sp.get('open');
  const list = (data ?? []).filter((c) => !q || [c.name, c.city, c.gstin ?? ''].some((x) => x.toLowerCase().includes(q.toLowerCase())));

  return (
    <div>
      <PageHeader
        title="Customers"
        sub="Shippers you work with regularly: what they book, what they owe, and their own login to book and track."
        actions={
          <Button variant="primary" onClick={() => setAdd(true)}>
            <Plus size={17} /> Add customer
          </Button>
        }
      />
      <div className="relative mb-3 max-w-[420px]">
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
        <input id="cust-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, city or GSTIN" aria-label="Search customers" className="h-11 w-full rounded-full border border-line bg-sheet-2 pr-4 pl-10 text-[15px] placeholder:text-faint transition-colors hover:border-line-strong focus:border-accent focus:bg-sheet focus:outline-none focus:ring-4 focus:ring-sign/15" />
      </div>
      <div className="sheet">
        {!data ? (
          <Loading rows={6} />
        ) : list.length === 0 ? (
          <Empty title={data.length ? 'No customer matches' : 'No customers yet'} action={!data.length ? <Button variant="primary" onClick={() => setAdd(true)}>Add a customer</Button> : undefined}>
            {data.length ? 'Try another name.' : 'Add the shippers you bill. Their GSTIN goes on invoices, and you can give them a login to book and track on their own.'}
          </Empty>
        ) : (
          <div className="scroll-x">
            <table className="data">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>GSTIN</th>
                  <th className="text-right">Shipments, 30 days</th>
                  <th className="text-right">Booked, 30 days</th>
                  <th className="text-right">Owes</th>
                  <th>Last booking</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id} className="clickable" onClick={() => setSp({ open: c.id })}>
                    <td>
                      <div className="font-[560]">{c.name}</div>
                      <div className="text-[13px] text-muted">{c.city}</div>
                    </td>
                    <td className="num text-[14px]">{c.gstin ?? <span className="text-faint">Unregistered</span>}</td>
                    <td className="num text-right">{c.shipments30d}</td>
                    <td className="num text-right">{inrShort(c.revenue30d)}</td>
                    <td className={`num text-right ${c.outstanding > 0 ? 'font-[600]' : 'text-muted'}`}>{c.outstanding > 0 ? inr(c.outstanding) : 'Nothing'}</td>
                    <td className="text-[14px] text-muted">{c.lastShipmentAt ? ago(c.lastShipmentAt) : 'Never'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <CustomerDrawer id={open} onClose={() => setSp({})} onChanged={() => void reload()} />
      <AddCustomer open={add} onClose={() => (setAdd(false), sp.get('add') && setSp({}))} onDone={(id) => (setAdd(false), void reload(), setSp({ open: id }), toast('Customer added'))} />
    </div>
  );
}

function CustomerDrawer({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { data, reload } = useApi<CustomerDetail>(id ? `/api/customers/${id}` : null);
  const c = data && data.id === id ? data : null;
  const [edit, setEdit] = useState(false);
  const [login, setLogin] = useState(false);
  const toast = useToast();
  return (
    <Drawer open={!!id} onClose={() => (setEdit(false), onClose())} title={c?.name ?? 'Customer'} width={540}>
      {!c ? (
        <Loading />
      ) : edit ? (
        <CustomerForm
          initial={c}
          onCancel={() => setEdit(false)}
          onSaved={async () => {
            setEdit(false);
            await reload();
            onChanged();
            toast('Customer saved');
          }}
        />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-[13px] text-muted">Booked, 30 days</p>
              <p className="t-fig mt-1 text-[26px]">{inrShort(c.revenue30d)}</p>
            </div>
            <div>
              <p className="text-[13px] text-muted">Shipments</p>
              <p className="t-fig mt-1 text-[26px]">{c.shipments30d}</p>
            </div>
            <div>
              <p className="text-[13px] text-muted">Owes</p>
              <p className={`t-fig mt-1 text-[26px] ${c.outstanding > 0 ? 'text-warn' : ''}`}>{inrShort(c.outstanding)}</p>
            </div>
          </div>
          <dl className="m-0">
            <KV k="GSTIN" v={c.gstin ?? 'Unregistered'} />
            <KV k="City" v={c.city} />
            {c.address && <KV k="Address" v={<span className="block max-w-[280px] text-[14px] leading-snug">{c.address}</span>} />}
            <KV k="Phone" v={c.phone ?? '—'} />
            <KV k="Email" v={c.email ?? '—'} />
            <KV k="Pays within" v={c.creditDays ? `${c.creditDays} days` : 'Company default'} />
          </dl>
          <div className="flex flex-wrap gap-2">
            <ButtonLink to={`/shipments/new?customer=${c.id}`} variant="primary" size="sm">
              Book for {c.name.split(' ')[0]}
            </ButtonLink>
            <Button size="sm" onClick={() => setEdit(true)}>
              Edit details
            </Button>
            <Button size="sm" onClick={() => setLogin(true)}>
              Give portal login
            </Button>
          </div>
          {c.users.length > 0 && (
            <section>
              <h3 className="t-sub mb-2">People with a login</h3>
              <ul className="space-y-1 text-[14.5px]">
                {c.users.map((u) => (
                  <li key={u.id}>
                    {u.name} <span className="text-muted">{u.email}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <h3 className="t-sub mb-2">Recent shipments</h3>
            {c.shipments.length === 0 ? (
              <p className="text-[14.5px] text-muted">Nothing booked yet.</p>
            ) : (
              <ul className="divide-y divide-line rounded-[12px] border border-line">
                {c.shipments.slice(0, 8).map((s) => (
                  <li key={s.id}>
                    <Link to={`/shipments/${s.id}`} className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-sheet-2">
                      <span className="min-w-0">
                        <span className="awb block text-[14px]">{s.awb}</span>
                        <span className="block truncate text-[13px] text-muted">
                          {lane(s.originCity, s.destCity)}, {dt(s.createdAt)}
                        </span>
                      </span>
                      <StatusMark status={s.status} className="text-[13.5px]" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h3 className="t-sub mb-2">Invoices</h3>
            {c.invoices.length === 0 ? (
              <p className="text-[14.5px] text-muted">No invoices yet.</p>
            ) : (
              <ul className="divide-y divide-line rounded-[12px] border border-line">
                {c.invoices.slice(0, 8).map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span>
                      <span className="num block text-[14px] font-[560]">{i.invoiceNo}</span>
                      <span className="block text-[13px] text-muted">due {dateOnly(i.dueDate)}</span>
                    </span>
                    <span className="text-right">
                      <span className="num block">{inr(i.total)}</span>
                      <StatusMark status={i.status} className="text-[13px]" />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
      {c && <PortalLogin open={login} customer={c} onClose={() => setLogin(false)} onDone={async () => (setLogin(false), await reload(), toast('Login created'))} />}
    </Drawer>
  );
}

function CustomerForm({ initial, onCancel, onSaved }: { initial?: Partial<CustomerRec>; onCancel: () => void; onSaved: (id: string) => void }) {
  const [f, setF] = useState({ name: initial?.name ?? '', gstin: initial?.gstin ?? '', phone: initial?.phone ?? '', email: initial?.email ?? '', city: initial?.city ?? 'Jaipur', address: initial?.address ?? '', creditDays: initial?.creditDays ? String(initial.creditDays) : '' });
  const act = useAction();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const g = f.gstin.trim().toUpperCase();
  const gstBad = g && !GSTIN_RE.test(g);
  return (
    <form
      id="cust-form"
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        void act.run(async () => {
          const body = { name: f.name, gstin: g || undefined, phone: f.phone || undefined, email: f.email || undefined, city: f.city, address: f.address || undefined, creditDays: f.creditDays ? Number(f.creditDays) : undefined };
          const r = initial?.id ? await api.patch<CustomerRec>(`/api/customers/${initial.id}`, body) : await api.post<CustomerRec>('/api/customers', body);
          onSaved(r.id);
        });
      }}
    >
      <Field label="Business name" htmlFor="cf-name" className="sm:col-span-2">
        <Input id="cf-name" value={f.name} onChange={set('name')} required minLength={2} />
      </Field>
      <Field label="GSTIN" htmlFor="cf-gst" hint={gstBad ? <span className="text-bad">A GSTIN has 15 characters, like 08ABCDE1234F1Z5</span> : 'Leave empty if they are not registered'}>
        <Input id="cf-gst" value={f.gstin} onChange={set('gstin')} maxLength={15} className="uppercase" />
      </Field>
      <Field label="City" htmlFor="cf-city">
        <Select id="cf-city" value={f.city} onChange={set('city')}>
          {cityNames.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
      </Field>
      <Field label="Billing address" htmlFor="cf-addr" className="sm:col-span-2">
        <Textarea id="cf-addr" rows={2} value={f.address} onChange={set('address')} />
      </Field>
      <Field label="Phone" htmlFor="cf-phone">
        <Input id="cf-phone" type="tel" value={f.phone} onChange={set('phone')} />
      </Field>
      <Field label="Accounts email" htmlFor="cf-email">
        <Input id="cf-email" type="email" value={f.email} onChange={set('email')} />
      </Field>
      <Field label="Pays within (days)" htmlFor="cf-credit" hint="Sets the due date on their invoices">
        <Input id="cf-credit" type="number" min="0" max="180" value={f.creditDays} onChange={set('creditDays')} placeholder="15" />
      </Field>
      <div className="sm:col-span-2">
        <ErrorNote>{act.error}</ErrorNote>
        <div className="mt-2 flex gap-2">
          <Button variant="primary" type="submit" disabled={act.busy || !!gstBad}>
            {initial?.id ? 'Save' : 'Add customer'}
          </Button>
          <Button onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </form>
  );
}

function AddCustomer({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (id: string) => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Add a customer">
      <CustomerForm onCancel={onClose} onSaved={onDone} />
    </Modal>
  );
}

function PortalLogin({ open, customer, onClose, onDone }: { open: boolean; customer: CustomerDetail; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: '', email: customer.email ?? '', password: '' });
  const act = useAction();
  useEffect(() => {
    if (open) setF({ name: '', email: customer.email ?? '', password: Math.random().toString(36).slice(2, 6) + String(Math.floor(1000 + Math.random() * 8999)) });
  }, [open, customer.email]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Login for ${customer.name}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="portal-login" disabled={act.busy}>
            Create login
          </Button>
        </>
      }
    >
      <form
        id="portal-login"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void act.run(async () => {
            await api.post('/api/users', { name: f.name, email: f.email, password: f.password, role: 'customer', customerId: customer.id });
            onDone();
          });
        }}
      >
        <p className="text-[15px] text-muted">They can book, print labels, track their shipments and download invoices. They never see other customers or your costs.</p>
        <Field label="Person's name" htmlFor="pl-name">
          <Input id="pl-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={2} />
        </Field>
        <Field label="Email" htmlFor="pl-email">
          <Input id="pl-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
        </Field>
        <Field label="First password" hint="Share it once; they can keep using it" htmlFor="pl-pass">
          <Input id="pl-pass" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required minLength={8} className="num" />
        </Field>
        <ErrorNote>{act.error}</ErrorNote>
      </form>
    </Modal>
  );
}
