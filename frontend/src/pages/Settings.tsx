import { MODULES, type ModuleKey, type OrgSettings } from '@suraj/shared';
import { Copy, KeyRound, Trash2, Webhook } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Check, Empty, ErrorNote, Field, Input, Modal, Note, PageHeader, Select, Sheet, StatusMark, Tabs, Textarea, useToast } from '../components/ui';
import { api, DEMO } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ago, dateOnly, saveFile } from '../lib/format';
import { useAction, useApi } from '../lib/hooks';
import { cityNames } from './NewShipment';

type Tab = 'company' | 'pricing' | 'messages' | 'modules' | 'developers' | 'data';

const MODULE_LABEL: Record<ModuleKey, { title: string; text: string }> = {
  trucking: { title: 'Trucking', text: 'Trips, fleet, drivers, driver app' },
  courier: { title: 'Parcels', text: 'Courier bookings, hubs, cash on delivery' },
  marketplace: { title: 'Load board', text: 'Post and bid on loads, return-load finder' },
  warehouse: { title: 'Warehouse', text: 'Client stock, bins, receiving and dispatch' },
  billing: { title: 'Billing', text: 'GST invoices, payments, ageing' },
};

export function SettingsPage() {
  const [sp] = useSearchParams();
  const { org } = useAuth();
  const [tab, setTab] = useState<Tab>((sp.get('tab') as Tab) || 'company');
  return (
    <div className="max-w-[860px]">
      <PageHeader title="Settings" sub={org ? `${org.name}, ${org.plan} plan.` : undefined} />
      <Tabs
        value={tab}
        onChange={setTab}
        className="mb-6"
        items={[
          { value: 'company', label: 'Company' },
          { value: 'pricing', label: 'Pricing and tax' },
          { value: 'messages', label: 'Messages' },
          { value: 'modules', label: 'Modules' },
          { value: 'developers', label: 'API and webhooks' },
          { value: 'data', label: 'Your data' },
        ]}
      />
      {tab === 'company' && <Company />}
      {tab === 'pricing' && <Pricing />}
      {tab === 'messages' && <MessagesSettings />}
      {tab === 'modules' && <Modules />}
      {tab === 'developers' && <Developers />}
      {tab === 'data' && <DataTab />}
    </div>
  );
}

function useSave() {
  const { refresh } = useAuth();
  const toast = useToast();
  const act = useAction();
  const save = (body: Record<string, unknown>, msg = 'Saved') =>
    act.run(async () => {
      await api.patch('/api/org/settings', body);
      await refresh();
      toast(msg);
    });
  return { ...act, save };
}

function Company() {
  const { org } = useAuth();
  const s = useSave();
  const [f, setF] = useState({ name: '', gstin: '', address: '', city: 'Jaipur', phone: '', email: '', bankName: '', account: '', ifsc: '', upi: '', terms: '15' });
  useEffect(() => {
    if (!org) return;
    const p = org.settings.profile ?? {};
    const b = org.settings.bank ?? {};
    setF({ name: org.name, gstin: org.gstin ?? '', address: p.address ?? '', city: p.city ?? 'Jaipur', phone: p.phone ?? '', email: p.email ?? '', bankName: b.name ?? '', account: b.account ?? '', ifsc: b.ifsc ?? '', upi: b.upi ?? '', terms: String(org.settings.paymentTermsDays ?? 15) });
  }, [org]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        void s.save({
          name: f.name,
          gstin: f.gstin.trim().toUpperCase() || null,
          profile: { address: f.address, city: f.city, phone: f.phone, email: f.email },
          bank: { name: f.bankName, account: f.account, ifsc: f.ifsc.toUpperCase(), upi: f.upi },
          paymentTermsDays: Number(f.terms) || 15,
        });
      }}
    >
      <Sheet title="Company" aside={<span className="text-[13.5px] text-muted">Printed on labels, consignment notes and invoices</span>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company name" htmlFor="co-name">
            <Input id="co-name" value={f.name} onChange={set('name')} required />
          </Field>
          <Field label="GSTIN" htmlFor="co-gst">
            <Input id="co-gst" value={f.gstin} onChange={set('gstin')} maxLength={15} className="uppercase" />
          </Field>
          <Field label="Address" htmlFor="co-addr" className="sm:col-span-2">
            <Textarea id="co-addr" rows={2} value={f.address} onChange={set('address')} placeholder="Plot, area, city, pincode" />
          </Field>
          <Field label="City" htmlFor="co-city" hint="Decides CGST and SGST or IGST on invoices">
            <Select id="co-city" value={f.city} onChange={set('city')}>
              {cityNames.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Phone for customers" htmlFor="co-phone">
            <Input id="co-phone" type="tel" value={f.phone} onChange={set('phone')} />
          </Field>
          <Field label="Email for invoices" htmlFor="co-email">
            <Input id="co-email" type="email" value={f.email} onChange={set('email')} />
          </Field>
          <Field label="Customers pay within (days)" htmlFor="co-terms" hint="Unless a customer has their own terms">
            <Input id="co-terms" type="number" min="0" max="180" value={f.terms} onChange={set('terms')} />
          </Field>
        </div>
      </Sheet>
      <Sheet title="Bank and UPI" aside={<span className="text-[13.5px] text-muted">Invoices show these with a scan-to-pay code</span>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Bank" htmlFor="co-bank">
            <Input id="co-bank" value={f.bankName} onChange={set('bankName')} placeholder="e.g. State Bank of India, MI Road" />
          </Field>
          <Field label="Account number" htmlFor="co-acc">
            <Input id="co-acc" inputMode="numeric" value={f.account} onChange={set('account')} />
          </Field>
          <Field label="IFSC" htmlFor="co-ifsc">
            <Input id="co-ifsc" value={f.ifsc} onChange={set('ifsc')} maxLength={11} className="uppercase" />
          </Field>
          <Field label="UPI ID" htmlFor="co-upi" hint="e.g. surajlogistic@sbi">
            <Input id="co-upi" value={f.upi} onChange={set('upi')} />
          </Field>
        </div>
      </Sheet>
      <ErrorNote>{s.error}</ErrorNote>
      <Button variant="primary" type="submit" disabled={s.busy}>
        Save company details
      </Button>
    </form>
  );
}

function Pricing() {
  const { org } = useAuth();
  const s = useSave();
  const [f, setF] = useState({ dieselPrice: '', gstCourier: '', gstTransport: '' });
  useEffect(() => {
    if (org) setF({ dieselPrice: String(org.settings.dieselPrice), gstCourier: String(org.settings.gst.courier), gstTransport: String(org.settings.gst.transport) });
  }, [org]);
  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        void s.save({ dieselPrice: Number(f.dieselPrice), gstCourier: Number(f.gstCourier), gstTransport: Number(f.gstTransport) }, 'Prices update on the next quote');
      }}
    >
      <Sheet title="Diesel">
        <Field label="Diesel price (₹ a litre)" hint="Truck quotes adjust when this moves. Update it when your pump rate changes." htmlFor="st-diesel" className="max-w-[280px]">
          <Input id="st-diesel" type="number" step="0.01" min="50" max="200" value={f.dieselPrice} onChange={(e) => setF({ ...f, dieselPrice: e.target.value })} />
        </Field>
      </Sheet>
      <Sheet title="GST on freight">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Parcels (%)" hint="Courier services, SAC 996812" htmlFor="st-gstc">
            <Input id="st-gstc" type="number" min="0" max="28" value={f.gstCourier} onChange={(e) => setF({ ...f, gstCourier: e.target.value })} />
          </Field>
          <Field label="Part loads and full trucks (%)" hint="Goods transport agency, SAC 996791" htmlFor="st-gstt">
            <Input id="st-gstt" type="number" min="0" max="28" value={f.gstTransport} onChange={(e) => setF({ ...f, gstTransport: e.target.value })} />
          </Field>
        </div>
        <p className="mt-3 text-[13.5px] text-muted">Transporters choose 5% without input tax credit or, since 22 September 2025, 18% with credit; who pays under reverse charge depends on your customer's registration. Check with your CA.</p>
      </Sheet>
      <ErrorNote>{s.error}</ErrorNote>
      <Button variant="primary" type="submit" disabled={s.busy}>
        Save prices
      </Button>
    </form>
  );
}

const NOTIFY: { key: keyof NonNullable<OrgSettings['notify']>; title: string; example: string }[] = [
  { key: 'booked', title: 'Booking confirmed', example: 'Namaste Bikash, your shipment SL62020585378 is booked. Track it here: …' },
  { key: 'outForDelivery', title: 'Out for delivery, with the OTP', example: 'SL62020585378 is out for delivery in Guwahati today. Share OTP 4821 only at handover.' },
  { key: 'delivered', title: 'Delivered', example: 'SL62020585378 was delivered to Bikash at 3:12 pm. Thank you.' },
  { key: 'failed', title: 'Delivery failed', example: 'We could not deliver SL62020585378. Reply 1 to try again tomorrow, 2 to change the address.' },
];

function MessagesSettings() {
  const { org } = useAuth();
  const s = useSave();
  const [n, setN] = useState<NonNullable<OrgSettings['notify']>>({});
  useEffect(() => {
    if (org) setN(org.settings.notify ?? {});
  }, [org]);
  return (
    <div className="space-y-6">
      <Sheet title="WhatsApp messages to receivers">
        <ul className="space-y-4">
          {NOTIFY.map((x) => (
            <li key={x.key}>
              <Check id={`nt-${x.key}`} checked={n[x.key] !== false} onChange={(v) => setN({ ...n, [x.key]: v })} label={x.title} hint={<span className="mt-1 block rounded-[12px] bg-go-soft px-2.5 py-1.5 text-ink">{x.example}</span>} />
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[13.5px] text-muted">Messages go out through your WhatsApp Business provider once it is connected; until then they are logged under Messages sent.</p>
      </Sheet>
      <ErrorNote>{s.error}</ErrorNote>
      <Button variant="primary" onClick={() => void s.save({ notify: n }, 'Message settings saved')} disabled={s.busy}>
        Save
      </Button>
    </div>
  );
}

function Modules() {
  const { org } = useAuth();
  const s = useSave();
  const [mods, setMods] = useState<ModuleKey[]>([]);
  useEffect(() => {
    if (org) setMods(org.modules);
  }, [org]);
  return (
    <div className="space-y-6">
      <Sheet title="What your company uses">
        <ul className="space-y-4">
          {MODULES.map((m) => (
            <li key={m}>
              <Check id={`md-${m}`} checked={mods.includes(m)} onChange={(v) => setMods((x) => (v ? [...x, m] : x.filter((y) => y !== m)))} label={MODULE_LABEL[m].title} hint={MODULE_LABEL[m].text} />
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[13.5px] text-muted">You pay only for what is switched on. Switching a module off hides it but keeps its data.</p>
      </Sheet>
      <ErrorNote>{s.error}</ErrorNote>
      <Button variant="primary" onClick={() => void s.save({ modules: mods }, 'Modules updated')} disabled={s.busy}>
        Save
      </Button>
    </div>
  );
}

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}
interface Hook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  lastStatus: number | null;
  lastAt: string | null;
  createdAt: string;
}
const HOOK_EVENTS = [
  { value: 'shipment.created', label: 'Shipment booked' },
  { value: 'shipment.status', label: 'Shipment status changed' },
  { value: 'trip.status', label: 'Trip started or finished' },
  { value: 'invoice.updated', label: 'Invoice sent or paid' },
];

function Developers() {
  const keys = useApi<ApiKey[]>('/api/api-keys');
  const hooks = useApi<Hook[]>('/api/webhooks');
  const [newKey, setNewKey] = useState<string | null>(null);
  const [keyName, setKeyName] = useState('');
  const [hookOpen, setHookOpen] = useState(false);
  const act = useAction();
  const toast = useToast();
  return (
    <div className="space-y-8">
      <section>
        <div className="mb-2.5 flex items-center gap-2">
          <KeyRound size={18} className="text-muted" />
          <h2 className="t-head">API keys</h2>
        </div>
        <p className="mb-3 max-w-[64ch] text-[14.5px] text-muted">Let your customer's website or ERP book shipments and read tracking. Send the key in the header <code className="rounded bg-sheet-2 px-1">x-api-key</code>. A key can do what a dispatcher can, so keep it on the server side.</p>
        <form
          className="mb-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void act.run(async () => {
              const r = await api.post<{ key: string }>('/api/api-keys', { name: keyName });
              setNewKey(r.key);
              setKeyName('');
              await keys.reload();
            });
          }}
        >
          <Input id="key-name" aria-label="Key name" value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="What is it for? e.g. Shree Textiles website" required minLength={2} className="max-w-[340px]" />
          <Button type="submit" variant="primary" disabled={act.busy}>
            Create key
          </Button>
        </form>
        {newKey && (
          <div className="mb-3">
            <Note tone="go">
              <p className="font-[560]">Copy this key now. It is not shown again.</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <code className="num rounded bg-sheet px-2 py-1 text-[14px] break-all">{newKey}</code>
                <Button size="sm" onClick={() => void navigator.clipboard?.writeText(newKey).then(() => toast('Key copied'))}>
                  <Copy size={14} /> Copy
                </Button>
              </div>
            </Note>
          </div>
        )}
        <div className="sheet">
          {!keys.data?.length ? (
            <Empty title="No keys yet">Create one when a customer wants to book from their own system.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {keys.data.map((k) => (
                <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="font-[560]">{k.name}</p>
                    <p className="text-[13.5px] text-muted">
                      <span className="num">{k.prefix}…</span>, made {dateOnly(k.createdAt)}, {k.lastUsedAt ? `last used ${ago(k.lastUsedAt)}` : 'never used'}
                    </p>
                  </div>
                  {k.revokedAt ? (
                    <StatusMark status="REVOKED" />
                  ) : (
                    <Button size="sm" variant="quietDanger" disabled={act.busy} onClick={() => act.run(async () => (await api.del(`/api/api-keys/${k.id}`), await keys.reload(), toast('Key revoked')))}>
                      Revoke
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section>
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Webhook size={18} className="text-muted" />
            <h2 className="t-head">Webhooks</h2>
          </div>
          <Button onClick={() => setHookOpen(true)}>Add webhook</Button>
        </div>
        <p className="mb-3 max-w-[64ch] text-[14.5px] text-muted">We send a signed POST to your address when something happens. Check the <code className="rounded bg-sheet-2 px-1">x-suraj-signature</code> header (HMAC-SHA256 of the body with the webhook's secret).</p>
        <div className="sheet">
          {!hooks.data?.length ? (
            <Empty title="No webhooks">Add one to push shipment updates to a customer's system as they happen.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {hooks.data.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="num truncate font-[560]">{h.url}</p>
                    <p className="text-[13.5px] text-muted">
                      {h.events.map((e) => HOOK_EVENTS.find((x) => x.value === e)?.label ?? e).join(', ')}. {h.lastAt ? `Last call ${ago(h.lastAt)}, answered ${h.lastStatus ?? 'nothing'}.` : 'Not called yet.'}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" disabled={act.busy} onClick={() => act.run(async () => { const r = await api.post<{ status: number | null }>(`/api/webhooks/${h.id}/test`); await hooks.reload(); toast(r.status ? `Test sent, answered ${r.status}` : 'Test sent, no answer', r.status && r.status < 300 ? 'go' : 'bad'); })}>
                      Send test
                    </Button>
                    <Button size="sm" variant="quietDanger" aria-label="Delete webhook" disabled={act.busy} onClick={() => act.run(async () => (await api.del(`/api/webhooks/${h.id}`), await hooks.reload(), toast('Webhook deleted')))}>
                      <Trash2 size={15} />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      <ErrorNote>{act.error}</ErrorNote>
      <AddHook open={hookOpen} onClose={() => setHookOpen(false)} onDone={(secret) => (setHookOpen(false), void hooks.reload(), toast(`Webhook added. Secret: ${secret}`))} />
    </div>
  );
}

function AddHook({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (secret: string) => void }) {
  const [url, setUrl] = useState('https://');
  const [events, setEvents] = useState<string[]>(['shipment.status']);
  const act = useAction();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a webhook"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="add-hook" disabled={act.busy || !events.length}>
            Add webhook
          </Button>
        </>
      }
    >
      <form
        id="add-hook"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void act.run(async () => {
            const r = await api.post<{ secret: string }>('/api/webhooks', { url, events });
            onDone(r.secret);
          });
        }}
      >
        <Field label="Address" hint="Must start with https://" htmlFor="wh-url">
          <Input id="wh-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} required pattern="https://.+" />
        </Field>
        <fieldset className="m-0 space-y-2 border-0 p-0">
          <legend className="mb-1.5 text-[14px] font-[560]">Send when</legend>
          {HOOK_EVENTS.map((ev) => (
            <Check key={ev.value} id={`ev-${ev.value}`} checked={events.includes(ev.value)} onChange={(v) => setEvents((x) => (v ? [...x, ev.value] : x.filter((y) => y !== ev.value)))} label={ev.label} />
          ))}
        </fieldset>
        <ErrorNote>{act.error}</ErrorNote>
      </form>
    </Modal>
  );
}

function DataTab() {
  const { org, logout } = useAuth();
  const act = useAction();
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState('');
  const download = () =>
    act.run(async () => {
      const data = await api.get<unknown>('/api/org/export');
      await saveFile(`${org?.slug ?? 'company'}-export-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
    });
  return (
    <div className="space-y-6">
      <Sheet title="Download everything">
        <p className="text-[15px] text-muted">One file with your company's shipments, trips, vehicles, drivers, customers, invoices, stock and messages. Passwords are not included.</p>
        <Button className="mt-3" onClick={() => void download()} disabled={act.busy}>
          Download as JSON
        </Button>
      </Sheet>
      <Sheet title="Delete the company">
        <p className="text-[15px] text-muted">Removes every record and every login for {org?.name}. Keep the download first: tax rules expect invoice records to be kept for years.</p>
        <Button variant="danger" className="mt-3" onClick={() => setConfirm(true)}>
          Delete company
        </Button>
      </Sheet>
      <ErrorNote>{act.error}</ErrorNote>
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Delete everything?"
        footer={
          <>
            <Button onClick={() => setConfirm(false)}>Keep my company</Button>
            <Button variant="danger" disabled={typed !== org?.name || act.busy} onClick={() => act.run(async () => (await api.del('/api/org', { confirm: typed }), logout()))}>
              Delete for good
            </Button>
          </>
        }
      >
        <p className="text-[15px]">This cannot be undone{DEMO ? ' (in the demo, a reload brings the data back)' : ''}. Type the company name to confirm.</p>
        <Input className="mt-3" aria-label="Company name" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={org?.name} />
      </Modal>
    </div>
  );
}
