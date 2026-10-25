import { VEHICLE_CLASSES, type JoinRequestRec, type ShipmentRec } from '@suraj/shared';
import { ArrowUpRight, Check, Mail, MapPin, Package, Phone, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ROLE_LABEL } from '../components/Person';
import { TruckThumb, type DrawableTruck } from '../components/TruckArt';
import { Button, Empty, ErrorNote, Field, Loading, Modal, PageHeader, Plate, Select, StatusMark, Tabs, Textarea, useToast } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ago, dateOnly, inr, kg, svc } from '../lib/format';
import { useAction, useApi } from '../lib/hooks';

type Tab = 'bookings' | 'joins' | 'decided';

const BOOKING_REASONS = ['We do not pick up from this area yet', 'Could not reach you on the phone', 'This needs a full truck; we will call you with a price', 'Goods we cannot carry'];
const JOIN_REASONS = ['Papers could not be checked', 'No opening in your city right now', 'Could not reach you on the phone'];

interface ShipmentEvent {
  status: string;
  note: string | null;
  at: string;
}

/** Website bookings made without a login, and people asking to join. Nothing moves until the office says yes. */
export function Requests() {
  const { user } = useAuth();
  const owner = user?.role === 'admin';
  const [tab, setTab] = useState<Tab>('bookings');
  const bookings = useApi<{ items: ShipmentRec[] }>('/api/shipments?status=REQUESTED&limit=200', { liveTypes: ['shipment.requested', 'shipment.status'] });
  const joins = useApi<JoinRequestRec[]>(owner ? '/api/join-requests?status=PENDING' : null, { liveTypes: ['join.requested', 'join.decided'] });
  const decided = useApi<JoinRequestRec[]>(owner && tab === 'decided' ? '/api/join-requests?status=ALL' : null, { liveTypes: ['join.decided'] });

  return (
    <div>
      <PageHeader eyebrow="Requests" title="Waiting for you" sub="Bookings made on the website without a login, and people asking to join Suraj Logistic. Nothing moves until you say yes." />
      <Tabs
        value={tab}
        onChange={setTab}
        className="mb-6"
        items={[
          { value: 'bookings', label: 'Website bookings', count: bookings.data?.items.length },
          ...(owner ? [{ value: 'joins' as Tab, label: 'Asking to join', count: joins.data?.length }, { value: 'decided' as Tab, label: 'Decided' }] : []),
        ]}
      />
      {tab === 'bookings' &&
        (!bookings.data ? (
          <Loading rows={4} />
        ) : bookings.data.items.length === 0 ? (
          <Empty title="No bookings waiting">When someone books on the website without a login, it shows up here for you to confirm or decline.</Empty>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {bookings.data.items.map((s) => (
              <BookingCard key={s.id} s={s} onDone={bookings.reload} />
            ))}
          </div>
        ))}
      {tab === 'joins' &&
        (!joins.data ? (
          <Loading rows={4} />
        ) : joins.data.length === 0 ? (
          <Empty title="Nobody waiting">Truck owners, drivers, customers and warehouse staff who ask to join from the website show up here.</Empty>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {joins.data.map((r) => (
              <JoinCard key={r.id} r={r} onDone={joins.reload} />
            ))}
          </div>
        ))}
      {tab === 'decided' &&
        (!decided.data ? (
          <Loading rows={4} />
        ) : (
          <div className="sheet overflow-hidden">
            <div className="scroll-x">
              <table className="data">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Joining as</th>
                    <th>City</th>
                    <th>Asked</th>
                    <th>Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {decided.data
                    .filter((r) => r.status !== 'PENDING')
                    .map((r) => (
                      <tr key={r.id}>
                        <td>
                          <div className="font-[560]">{r.name}</div>
                          <div className="num text-[13px] text-muted">{r.phone}</div>
                        </td>
                        <td>{ROLE_LABEL[r.role]}</td>
                        <td>{r.city}</td>
                        <td className="whitespace-nowrap text-muted">{dateOnly(r.createdAt)}</td>
                        <td>
                          <StatusMark status={r.status === 'APPROVED' ? 'ACCEPTED' : 'CANCELLED'} label={r.status === 'APPROVED' ? 'Approved' : 'Declined'} />
                          {r.note && <div className="mt-0.5 max-w-[40ch] text-[13px] text-muted">{r.note}</div>}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
    </div>
  );
}

function BookingCard({ s, onDone }: { s: ShipmentRec; onDone: () => void }) {
  const toast = useToast();
  const act = useAction();
  const [declining, setDeclining] = useState(false);
  const [why, setWhy] = useState('');
  const detail = useApi<{ events: ShipmentEvent[] }>(`/api/shipments/${s.id}`);
  const asked = detail.data?.events.find((e) => e.status === 'REQUESTED')?.note?.replace(/^Requested on the website\.\s*/, '') ?? '';
  const decide = (status: 'BOOKED' | 'CANCELLED', note?: string) =>
    act.run(async () => {
      await api.post(`/api/shipments/${s.id}/status`, { status, ...(note ? { note } : {}) });
      toast(status === 'BOOKED' ? `${s.awb} confirmed. The sender and receiver have the tracking link.` : `${s.awb} declined. We told ${s.shipperName}.`);
      setDeclining(false);
      onDone();
    });

  return (
    <article className="sheet flex flex-col overflow-hidden">
      <div className="px-5 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[18px] leading-snug font-[600]">
              {s.originCity} to {s.destCity}
            </h3>
            <span className="id-chip mt-1.5">{s.awb}</span>
          </div>
          <div className="shrink-0 text-right">
            <p className="t-fig text-[28px] leading-none">{inr(s.price)}</p>
            <p className="mt-1 text-[12.5px] text-muted">{s.paymentMode === 'TO_PAY' ? 'Receiver pays' : 'Paid at pickup'}</p>
          </div>
        </div>
        <p className="mt-3 text-[14.5px] text-muted">
          {svc(s.service)}, {kg(s.weightKg)}, {s.packages} {s.packages === 1 ? 'package' : 'packages'}
          {s.contents ? `: ${s.contents}` : ''}. Asked {ago(s.createdAt)}
          {asked ? `. ${asked}` : '.'}
        </p>
      </div>
      <div className="mt-4 grid gap-px bg-line sm:grid-cols-2">
        <div className="bg-sheet px-5 py-4">
          <p className="eyebrow mb-1.5">Pick up from</p>
          <p className="text-[15px] font-[560]">{s.shipperName}</p>
          {s.shipperPhone && (
            <a href={`tel:${s.shipperPhone}`} className="num mt-0.5 inline-flex items-center gap-1.5 text-[14px] text-accent">
              <Phone size={13} /> {s.shipperPhone}
            </a>
          )}
          <p className="mt-1.5 flex gap-1.5 text-[14px] text-muted">
            <MapPin size={14} className="mt-[3px] shrink-0" /> {s.pickupAddress ?? s.originCity}
          </p>
        </div>
        <div className="bg-sheet px-5 py-4">
          <p className="eyebrow mb-1.5">Deliver to</p>
          <p className="text-[15px] font-[560]">{s.consigneeName}</p>
          <p className="num mt-0.5 text-[14px] text-muted">{s.consigneePhone}</p>
          <p className="mt-1.5 flex gap-1.5 text-[14px] text-muted">
            <MapPin size={14} className="mt-[3px] shrink-0" /> {s.consigneeAddress}
          </p>
        </div>
      </div>
      <ErrorNote>{act.error}</ErrorNote>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3.5">
        <Link to={`/shipments/${s.id}`} className="inline-flex items-center gap-1 text-[14px] text-muted hover:text-ink">
          Details <ArrowUpRight size={14} />
        </Link>
        <div className="flex gap-2">
          <Button size="sm" variant="quietDanger" onClick={() => setDeclining(true)} disabled={act.busy}>
            <X size={15} /> Decline
          </Button>
          <Button size="sm" variant="primary" onClick={() => decide('BOOKED')} disabled={act.busy}>
            <Check size={15} /> Confirm booking
          </Button>
        </div>
      </div>
      <Reason open={declining} onClose={() => setDeclining(false)} title={`Decline ${s.awb}`} reasons={BOOKING_REASONS} value={why} onChange={setWhy} busy={act.busy} error={act.error} onSubmit={() => decide('CANCELLED', why.trim())} hint={`We send this to ${s.shipperName} on WhatsApp.`} />
    </article>
  );
}

function JoinCard({ r, onDone }: { r: JoinRequestRec; onDone: () => void }) {
  const toast = useToast();
  const act = useAction();
  const [declining, setDeclining] = useState(false);
  const [why, setWhy] = useState('');
  const [linkTo, setLinkTo] = useState('');
  const customers = useApi<{ id: string; name: string; city: string }[]>(r.role === 'customer' ? '/api/customers' : null);
  const d = r.details;
  const approve = () =>
    act.run(async () => {
      await api.post(`/api/join-requests/${r.id}/approve`, linkTo ? { customerId: linkTo } : {});
      toast(`Login ready for ${r.name}. They log in with ${r.phone}.`);
      onDone();
    });
  const decline = () =>
    act.run(async () => {
      await api.post(`/api/join-requests/${r.id}/reject`, { note: why.trim() });
      toast(`Declined. We told ${r.name}.`);
      setDeclining(false);
      onDone();
    });

  return (
    <article className="sheet flex flex-col overflow-hidden">
      <div className="px-5 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[18px] leading-snug font-[600]">{r.name}</h3>
            <span className="mt-1.5 inline-flex h-6 items-center rounded-full bg-sign-soft px-2.5 font-display text-[12.5px] font-[560] text-sign">{ROLE_LABEL[r.role]}</span>
          </div>
          <p className="shrink-0 text-[13px] text-muted">Asked {ago(r.createdAt)}</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[14.5px]">
          <a href={`tel:${r.phone}`} className="num inline-flex items-center gap-1.5 text-accent">
            <Phone size={14} /> {r.phone}
          </a>
          {r.email && (
            <span className="inline-flex items-center gap-1.5 text-muted">
              <Mail size={14} /> {r.email}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 text-muted">
            <MapPin size={14} /> {r.city}
          </span>
        </div>
      </div>

      <div className="mt-4 border-t border-line px-5 py-4">
        {r.role === 'partner' && (
          <>
            <p className="eyebrow mb-2">{d.trucks?.length === 1 ? 'Truck' : `${d.trucks?.length ?? 0} trucks`}</p>
            <ul className="grid gap-2">
              {(d.trucks ?? []).map((t) => (
                <li key={t.regNo} className="flex items-center justify-between gap-3 rounded-[14px] bg-sheet-2 px-3.5 py-2.5">
                  <span className="min-w-0">
                    <Plate reg={t.regNo} size={13} />
                    <span className="mt-1 block text-[13px] text-muted">{VEHICLE_CLASSES[t.type]?.label ?? t.type}</span>
                  </span>
                  <span className="shrink-0 text-muted">{t.type !== 'BIKE' && <TruckThumb type={t.type as DrawableTruck} height={28} />}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {r.role === 'driver' && (
          <dl className="grid grid-cols-2 gap-3 text-[14.5px]">
            <div>
              <dt className="eyebrow mb-1">Licence</dt>
              <dd className="m-0 font-mono text-[13.5px]">{d.licenseNo}</dd>
            </div>
            <div>
              <dt className="eyebrow mb-1">Valid till</dt>
              <dd className="m-0">{dateOnly(d.licenseExpiry ?? null)}</dd>
            </div>
          </dl>
        )}
        {r.role === 'customer' && (
          <dl className="grid gap-3 text-[14.5px] sm:grid-cols-2">
            <div>
              <dt className="eyebrow mb-1">Business</dt>
              <dd className="m-0 font-[560]">{d.companyName || 'Not given (a person sending goods)'}</dd>
            </div>
            <div>
              <dt className="eyebrow mb-1">GSTIN</dt>
              <dd className="m-0 font-mono text-[13.5px]">{d.gstin || '—'}</dd>
            </div>
            {d.address && (
              <div className="sm:col-span-2">
                <dt className="eyebrow mb-1">Address</dt>
                <dd className="m-0 text-muted">{d.address}</dd>
              </div>
            )}
          </dl>
        )}
        {r.role === 'warehouse' && (
          <p className="flex items-center gap-2 text-[14.5px] text-muted">
            <Package size={15} /> Will get the warehouse screens: stock, bins, receiving and dispatch.
          </p>
        )}
        {d.message && <blockquote className="mt-3 border-l-2 border-line-strong pl-3 text-[14.5px] text-muted italic">“{d.message}”</blockquote>}
        {r.role === 'customer' && customers.data && customers.data.length > 0 && (
          <Field label="Login belongs to" htmlFor={`link-${r.id}`} className="mt-4" hint="Pick an existing customer if they already ship with you.">
            <Select id={`link-${r.id}`} value={linkTo} onChange={(e) => setLinkTo(e.target.value)}>
              <option value="">A new customer: {d.companyName || r.name}</option>
              {customers.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}, {c.city}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      <ErrorNote>{act.error}</ErrorNote>
      <div className="mt-auto flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3.5">
        <Button size="sm" variant="quietDanger" onClick={() => setDeclining(true)} disabled={act.busy}>
          <X size={15} /> Decline
        </Button>
        <Button size="sm" variant="primary" onClick={approve} disabled={act.busy}>
          <Check size={15} /> Approve and create login
        </Button>
      </div>
      <Reason open={declining} onClose={() => setDeclining(false)} title={`Decline ${r.name}`} reasons={JOIN_REASONS} value={why} onChange={setWhy} busy={act.busy} error={act.error} onSubmit={decline} hint="We send this to them on WhatsApp. They see it if they try to log in." />
    </article>
  );
}

function Reason(p: { open: boolean; onClose: () => void; title: string; reasons: string[]; value: string; onChange: (v: string) => void; busy: boolean; error: string | null; onSubmit: () => void; hint: string }) {
  return (
    <Modal
      open={p.open}
      onClose={p.onClose}
      title={p.title}
      footer={
        <Button variant="danger" disabled={p.busy || p.value.trim().length < 3} onClick={p.onSubmit}>
          Decline
        </Button>
      }
    >
      <div className="mb-3 flex flex-wrap gap-1.5">
        {p.reasons.map((x) => (
          <button key={x} type="button" onClick={() => p.onChange(x)} className={`rounded-full border px-3 py-1.5 text-[13px] transition-colors ${p.value === x ? 'border-ink text-ink' : 'border-line text-muted hover:border-line-strong hover:text-ink'}`}>
            {x}
          </button>
        ))}
      </div>
      <Field label="Reason" htmlFor="decline-why" hint={p.hint}>
        <Textarea id="decline-why" value={p.value} onChange={(e) => p.onChange(e.target.value)} maxLength={300} />
      </Field>
      <ErrorNote>{p.error}</ErrorNote>
    </Modal>
  );
}
