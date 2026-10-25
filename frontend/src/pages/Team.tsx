import type { Role, UserRec } from '@suraj/shared';
import { KeyRound, Plus, UserMinus } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, ErrorNote, Field, Input, Loading, Modal, PageHeader, Select, useToast } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dateOnly } from '../lib/format';
import { useAction, useApi } from '../lib/hooks';

const ROLES: { value: Role; label: string; plural: string; can: string }[] = [
  { value: 'admin', label: 'Owner', plural: 'Owners', can: 'Everything, including money, settings and logins' },
  { value: 'ops', label: 'Dispatcher', plural: 'Dispatchers', can: 'Bookings, trips, fleet, load board, billing' },
  { value: 'warehouse', label: 'Warehouse staff', plural: 'Warehouse staff', can: 'Stock, bins, receiving and dispatch only' },
  { value: 'driver', label: 'Driver', plural: 'Drivers', can: 'Their own trip on the phone app' },
  { value: 'customer', label: 'Customer', plural: 'Customer logins', can: 'Their own shipments and invoices' },
  { value: 'partner', label: 'Truck owner', plural: 'Truck owners', can: 'Their attached trucks, trips and lorry hire' },
];
const roleLabel = (r: Role) => ROLES.find((x) => x.value === r)?.label ?? r;

type UserRow = UserRec & { customerName?: string | null };

export function Team() {
  const [sp] = useSearchParams();
  const { user: me } = useAuth();
  const { data, reload } = useApi<UserRow[]>('/api/users');
  const [add, setAdd] = useState(sp.get('add') === '1');
  const [reset, setReset] = useState<UserRow | null>(null);
  const [remove, setRemove] = useState<UserRow | null>(null);
  const toast = useToast();
  const act = useAction();
  const groups = ROLES.map((r) => ({ ...r, people: (data ?? []).filter((u) => u.role === r.value) })).filter((g) => g.people.length);

  return (
    <div className="max-w-[920px]">
      <PageHeader
        title="Team & logins"
        sub="Everyone who can log in to your company: office staff, drivers and customers. Each person has their own login, so changes are traceable."
        actions={
          <Button variant="primary" onClick={() => setAdd(true)}>
            <Plus size={17} /> Add a person
          </Button>
        }
      />
      {!data ? (
        <div className="sheet">
          <Loading rows={5} />
        </div>
      ) : (
        <div className="space-y-7">
          {groups.map((g) => (
            <section key={g.value}>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="t-sub">
                  {g.plural} <span className="num font-normal text-muted">{g.people.length}</span>
                </h2>
                <span className="text-[13.5px] text-muted">{g.can}</span>
              </div>
              <ul className="sheet divide-y divide-line">
                {g.people.map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sign-soft text-[13.5px] font-[600] text-accent">
                      {u.name
                        .replace(/\(.*\)/, '')
                        .trim()
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((w) => w[0])
                        .join('')
                        .toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-[560]">
                        {u.name} {u.id === me?.id && <span className="text-[13.5px] font-normal text-muted">(you)</span>}
                      </p>
                      <p className="truncate text-[14px] text-muted">
                        {(u.role === 'driver' || u.role === 'partner' || u.email.endsWith('.surajlogistic.in')) && u.phone ? `Logs in with ${u.phone}` : u.email}
                        {u.customerName ? `, ${u.customerName}` : ''}
                      </p>
                    </div>
                    <span className="hidden text-[13.5px] text-muted sm:block">since {dateOnly(u.createdAt)}</span>
                    {u.id !== me?.id && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setReset(u)} aria-label={`New password for ${u.name}`}>
                          <KeyRound size={15} /> <span className="hidden sm:inline">New password</span>
                        </Button>
                        <Button size="sm" variant="quietDanger" onClick={() => setRemove(u)} aria-label={`Remove ${u.name}`}>
                          <UserMinus size={15} />
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <AddPerson open={add} onClose={() => setAdd(false)} onDone={(n) => (setAdd(false), void reload(), toast(`${n} can log in now`))} />
      <ResetPassword user={reset} onClose={() => setReset(null)} onDone={() => (setReset(null), toast('Password changed. Share it with them.'))} />
      <Modal
        open={!!remove}
        onClose={() => setRemove(null)}
        title={`Remove ${remove?.name ?? ''}?`}
        footer={
          <>
            <Button onClick={() => setRemove(null)}>Keep</Button>
            <Button
              variant="danger"
              disabled={act.busy}
              onClick={() =>
                act.run(async () => {
                  await api.del(`/api/users/${remove!.id}`);
                  setRemove(null);
                  await reload();
                  toast('Login removed');
                })
              }
            >
              Remove login
            </Button>
          </>
        }
      >
        <p className="text-[15px]">They will be logged out and cannot log in again. Their past work stays in the records.</p>
        <ErrorNote>{act.error}</ErrorNote>
      </Modal>
    </div>
  );
}

function AddPerson({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (name: string) => void }) {
  const [f, setF] = useState({ name: '', email: '', phone: '', role: 'ops' as Role, password: '' });
  const act = useAction();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a person"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="add-person" disabled={act.busy}>
            Create login
          </Button>
        </>
      }
    >
      <form
        id="add-person"
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void act.run(async () => {
            await api.post('/api/users', { name: f.name, email: f.email, phone: f.phone || undefined, role: f.role, password: f.password });
            const n = f.name;
            setF({ name: '', email: '', phone: '', role: 'ops', password: '' });
            onDone(n);
          });
        }}
      >
        <Field label="Name" htmlFor="ap-name">
          <Input id="ap-name" value={f.name} onChange={set('name')} required minLength={2} />
        </Field>
        <Field label="Role" htmlFor="ap-role" hint={ROLES.find((r) => r.value === f.role)?.can}>
          <Select id="ap-role" value={f.role} onChange={set('role')}>
            {ROLES.filter((r) => r.value !== 'driver' && r.value !== 'customer' && r.value !== 'partner').map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Work email" htmlFor="ap-email">
          <Input id="ap-email" type="email" value={f.email} onChange={set('email')} required />
        </Field>
        <Field label="Mobile" htmlFor="ap-phone">
          <Input id="ap-phone" type="tel" value={f.phone} onChange={set('phone')} />
        </Field>
        <Field label="First password" hint="At least 8 characters" htmlFor="ap-pass" className="sm:col-span-2">
          <Input id="ap-pass" value={f.password} onChange={set('password')} required minLength={8} />
        </Field>
        <p className="text-[13.5px] text-muted sm:col-span-2">Drivers get their login from Fleet & drivers. Customers get theirs from Customers.</p>
        <div className="sm:col-span-2">
          <ErrorNote>{act.error}</ErrorNote>
        </div>
      </form>
    </Modal>
  );
}

function ResetPassword({ user, onClose, onDone }: { user: UserRow | null; onClose: () => void; onDone: () => void }) {
  const [pw, setPw] = useState('');
  const act = useAction();
  return (
    <Modal
      open={!!user}
      onClose={onClose}
      title={`New password for ${user?.name ?? ''}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="reset-pw" disabled={act.busy || pw.length < 8}>
            Set password
          </Button>
        </>
      }
    >
      <form
        id="reset-pw"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void act.run(async () => {
            await api.patch(`/api/users/${user!.id}`, { password: pw });
            setPw('');
            onDone();
          });
        }}
      >
        <p className="text-[15px] text-muted">Their old password stops working straight away.</p>
        <Field label="New password" hint="At least 8 characters" htmlFor="rp-pw">
          <Input id="rp-pw" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={8} />
        </Field>
        <ErrorNote>{act.error}</ErrorNote>
      </form>
    </Modal>
  );
}
