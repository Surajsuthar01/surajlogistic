import { VEHICLE_CLASSES, VEHICLE_TYPES, type DriverRec, type TripRec, type VehicleDocs, type VehicleRec } from '@suraj/shared';
import { Plus, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, ButtonLink, Chip, Drawer, Empty, ErrorNote, Field, Input, KV, Loading, Modal, Note, PageHeader, Plate, Select, StatusMark, Tabs, useToast } from '../components/ui';
import { api } from '../lib/api';
import { ago, dateOnly, dt, inr, lane } from '../lib/format';
import { useAction, useApi } from '../lib/hooks';
import { cityNames } from './NewShipment';

type Alert = { doc: string; label: string; days: number };
type VehicleRow = VehicleRec & { alerts: Alert[] };
type DriverRow = DriverRec & { licenseDays: number; hasLogin?: boolean };
interface Verify {
  regNo: string;
  verified: boolean;
  source: string;
  fitnessUpto?: string;
  insuranceUpto?: string;
  permitUpto?: string;
  pucUpto?: string;
  remarks: string[];
}
interface LicenceCheck {
  licenseNo: string;
  valid: boolean;
  validTill: string | null;
  source: string;
  remarks: string[];
}

const DOCS: { key: keyof VehicleDocs; label: string }[] = [
  { key: 'insurance', label: 'Insurance' },
  { key: 'fitness', label: 'Fitness' },
  { key: 'permit', label: 'Permit' },
  { key: 'puc', label: 'Pollution (PUC)' },
];

const own = (o: string) => (o === 'OWN' ? 'Own truck' : o === 'ATTACHED' ? 'Attached' : 'Market hire');

export function Fleet() {
  const [sp, setSp] = useSearchParams();
  const [tab, setTab] = useState<'vehicles' | 'drivers'>(sp.get('tab') === 'drivers' ? 'drivers' : 'vehicles');
  const vehicles = useApi<VehicleRow[]>('/api/vehicles', { liveTypes: ['trip.status'] });
  const drivers = useApi<DriverRow[]>('/api/drivers', { liveTypes: ['trip.status'] });
  const [addV, setAddV] = useState(sp.get('add') === 'vehicle');
  const [addD, setAddD] = useState(sp.get('add') === 'driver');
  const [loginFor, setLoginFor] = useState<DriverRow | null>(null);
  const [lic, setLic] = useState<LicenceCheck | null>(null);
  const toast = useToast();
  const act = useAction();
  const openId = sp.get('vehicle');

  const counts: Record<string, number> = { ON_TRIP: 0, IDLE: 0, MAINTENANCE: 0 };
  (vehicles.data ?? []).forEach((v) => (counts[v.status] = (counts[v.status] ?? 0) + 1));
  const docIssues = (vehicles.data ?? []).filter((v) => v.alerts.some((a) => a.days < 0)).length;

  return (
    <div>
      <PageHeader
        title="Fleet & drivers"
        sub={vehicles.data ? `${vehicles.data.length} vehicles: ${counts.ON_TRIP} on a trip, ${counts.IDLE} idle, ${counts.MAINTENANCE} in the workshop.${docIssues ? ` ${docIssues} with expired papers.` : ''}` : undefined}
        actions={
          tab === 'vehicles' ? (
            <Button variant="primary" onClick={() => setAddV(true)}>
              <Plus size={17} /> Add vehicle
            </Button>
          ) : (
            <Button variant="primary" onClick={() => setAddD(true)}>
              <Plus size={17} /> Add driver
            </Button>
          )
        }
      />
      <Tabs
        value={tab}
        onChange={(v) => (setTab(v), setSp(v === 'drivers' ? { tab: 'drivers' } : {}))}
        className="mb-4"
        items={[
          { value: 'vehicles', label: 'Vehicles', count: vehicles.data?.length },
          { value: 'drivers', label: 'Drivers', count: drivers.data?.length },
        ]}
      />
      <ErrorNote>{act.error}</ErrorNote>

      {tab === 'vehicles' ? (
        !vehicles.data ? (
          <div className="sheet">
            <Loading rows={6} />
          </div>
        ) : vehicles.data.length === 0 ? (
          <div className="sheet">
            <Empty title="No vehicles yet" action={<Button variant="primary" onClick={() => setAddV(true)}>Add your first truck</Button>}>
              Add own trucks, attached owner-drivers and market vehicles you hire often. We track their papers and position.
            </Empty>
          </div>
        ) : (
          <div className="sheet scroll-x">
            <table className="data">
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Where</th>
                  <th>Papers</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.data.map((v) => (
                  <tr key={v.id} className="clickable" onClick={() => setSp({ vehicle: v.id })}>
                    <td className="whitespace-nowrap">
                      <Plate reg={v.regNo} />
                      <div className="mt-1 text-[13px] text-muted">{own(v.ownership)}</div>
                    </td>
                    <td className="whitespace-nowrap">
                      {VEHICLE_CLASSES[v.type].label}
                      <div className="text-[13px] text-muted">{(v.capacityKg / 1000).toLocaleString('en-IN')} t, {v.kmpl} km/l</div>
                    </td>
                    <td>
                      <StatusMark status={v.status} />
                    </td>
                    <td className="whitespace-nowrap">
                      {v.city}
                      <div className="text-[13px] text-muted">GPS {ago(v.lastPingAt)}</div>
                    </td>
                    <td>
                      {v.alerts.length === 0 ? (
                        <span className="text-[14px] text-muted">All valid</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {v.alerts.map((a) => (
                            <Chip key={a.doc} tone={a.days < 0 ? 'bad' : a.days <= 7 ? 'warn' : 'plate'}>
                              {a.label} {a.days < 0 ? 'expired' : `ends in ${a.days} d`}
                            </Chip>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : !drivers.data ? (
        <div className="sheet">
          <Loading rows={6} />
        </div>
      ) : drivers.data.length === 0 ? (
        <div className="sheet">
          <Empty title="No drivers yet" action={<Button variant="primary" onClick={() => setAddD(true)}>Add a driver</Button>}>
            Add drivers with their licence details. Give them a login and they get the driver app in Hindi.
          </Empty>
        </div>
      ) : (
        <div className="sheet scroll-x">
          <table className="data">
            <thead>
              <tr>
                <th>Driver</th>
                <th>Licence</th>
                <th>Status</th>
                <th className="text-right">Rating</th>
                <th>Driver app</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {drivers.data.map((d) => (
                <tr key={d.id}>
                  <td>
                    <div className="font-[560]">{d.name}</div>
                    <a href={`tel:${d.phone}`} className="num text-[13.5px] text-muted hover:underline">
                      {d.phone}
                    </a>
                  </td>
                  <td className="whitespace-nowrap">
                    <span className="num text-[14px]">{d.licenseNo}</span>
                    <div className={`text-[13px] ${d.licenseDays < 0 ? 'font-[560] text-bad' : d.licenseDays <= 30 ? 'text-warn' : 'text-muted'}`}>{d.licenseDays < 0 ? 'Expired' : d.licenseDays <= 30 ? `Ends in ${d.licenseDays} days` : `Valid till ${dateOnly(d.licenseExpiry)}`}</div>
                  </td>
                  <td>
                    <StatusMark status={d.status} />
                  </td>
                  <td className="num text-right">{d.rating.toFixed(1)}</td>
                  <td className="whitespace-nowrap text-[14px]">
                    {d.userId || d.hasLogin ? (
                      <span>
                        Has login, {d.lang === 'hi' ? 'हिंदी' : 'English'}
                      </span>
                    ) : (
                      <Button size="sm" onClick={() => setLoginFor(d)}>
                        Give app login
                      </Button>
                    )}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" disabled={act.busy} onClick={() => act.run(async () => setLic(await api.post<LicenceCheck>(`/api/drivers/${d.id}/verify`)))}>
                      <ShieldCheck size={15} /> Check licence
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <VehicleDrawer id={openId} onClose={() => setSp(tab === 'drivers' ? { tab: 'drivers' } : {})} onChanged={() => void vehicles.reload()} />
      <AddVehicle open={addV} onClose={() => setAddV(false)} onDone={() => (setAddV(false), void vehicles.reload(), toast('Vehicle added'))} />
      <AddDriver open={addD} onClose={() => setAddD(false)} onDone={() => (setAddD(false), void drivers.reload(), toast('Driver added'))} />
      <DriverLogin driver={loginFor} onClose={() => setLoginFor(null)} onDone={() => (setLoginFor(null), void drivers.reload(), toast('Login created. Share it with the driver.'))} />
      <Modal open={!!lic} onClose={() => setLic(null)} title={`Licence check, ${lic?.licenseNo ?? ''}`}>
        {lic && (
          <div className="space-y-3">
            <StatusMark tone={lic.valid ? 'done' : 'bad'} label={lic.valid ? 'Licence is valid' : 'Licence is not valid'} className="text-[16px] font-[560]" />
            <dl className="m-0">
              <KV k="Valid till" v={dateOnly(lic.validTill)} />
              <KV k="Checked with" v={lic.source} />
            </dl>
            {lic.remarks.length > 0 && <ErrorNote>{lic.remarks.join(' ')}</ErrorNote>}
            <p className="text-[13.5px] text-muted">Live checks go to the Sarathi database through ULIP once your company is registered there. Until then this uses the details saved here.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

function VehicleDrawer({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { data, reload } = useApi<VehicleRow & { trips?: (TripRec & { pnl?: { profit: number } })[] }>(id ? `/api/vehicles/${id}` : null);
  const [docs, setDocs] = useState<VehicleDocs>({});
  const [verify, setVerify] = useState<Verify | null>(null);
  const act = useAction();
  const toast = useToast();
  const v = data && data.id === id ? data : null;
  useEffect(() => {
    if (v) setDocs(v.docs);
    setVerify(null);
  }, [v?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Drawer open={!!id} onClose={onClose} title={v ? <Plate reg={v.regNo} size={17} /> : 'Vehicle'}>
      {!v ? (
        <Loading />
      ) : (
        <div className="space-y-6">
          <div>
            <p className="text-[16px] font-[560]">{VEHICLE_CLASSES[v.type].label}</p>
            <p className="text-[14.5px] text-muted">
              {own(v.ownership)}, carries {(v.capacityKg / 1000).toLocaleString('en-IN')} t, {v.kmpl} km a litre. Odometer {v.odometerKm.toLocaleString('en-IN')} km.
            </p>
            <div className="mt-2 flex items-center gap-3">
              <StatusMark status={v.status} />
              <span className="text-[14px] text-muted">
                near {v.city}, GPS {ago(v.lastPingAt)}
              </span>
            </div>
          </div>

          <section>
            <h3 className="t-sub mb-2">Papers</h3>
            <form
              className="grid grid-cols-2 gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void act.run(async () => {
                  await api.patch(`/api/vehicles/${v.id}`, { docs });
                  await reload();
                  onChanged();
                  toast('Paper dates saved');
                });
              }}
            >
              {DOCS.map((d) => {
                const a = v.alerts.find((x) => x.doc === d.key);
                return (
                  <Field key={d.key} label={d.label} htmlFor={`vd-${d.key}`} hint={a ? <span className={a.days < 0 ? 'text-bad' : 'text-warn'}>{a.days < 0 ? `Expired ${-a.days} days ago` : `Ends in ${a.days} days`}</span> : undefined}>
                    <Input id={`vd-${d.key}`} type="date" value={docs[d.key] ?? ''} onChange={(e) => setDocs({ ...docs, [d.key]: e.target.value })} />
                  </Field>
                );
              })}
              <div className="col-span-2 flex flex-wrap gap-2">
                <Button type="submit" disabled={act.busy}>
                  Save dates
                </Button>
                <Button variant="ghost" disabled={act.busy} onClick={() => act.run(async () => setVerify(await api.post<Verify>(`/api/vehicles/${v.id}/verify`)))}>
                  <ShieldCheck size={16} /> Check on VAHAN
                </Button>
              </div>
            </form>
            {verify && (
              <div className="mt-3">
                <Note tone={verify.remarks.length ? 'warn' : 'go'}>
                  {verify.verified ? 'Registration found' : 'Could not verify'} ({verify.source}).
                  {verify.remarks.length ? ` ${verify.remarks.join('; ')}.` : ' Papers match what is saved here.'}
                </Note>
              </div>
            )}
          </section>

          <section>
            <h3 className="t-sub mb-2">Workshop</h3>
            {v.status === 'ON_TRIP' ? (
              <p className="text-[14.5px] text-muted">On a trip right now. Close the trip before sending it for repairs.</p>
            ) : (
              <Button
                disabled={act.busy}
                onClick={() =>
                  act.run(async () => {
                    await api.patch(`/api/vehicles/${v.id}`, { status: v.status === 'MAINTENANCE' ? 'IDLE' : 'MAINTENANCE' });
                    await reload();
                    onChanged();
                    toast(v.status === 'MAINTENANCE' ? 'Back in service' : 'Sent to the workshop');
                  })
                }
              >
                {v.status === 'MAINTENANCE' ? 'Back in service' : 'Send to workshop'}
              </Button>
            )}
          </section>

          <section>
            <h3 className="t-sub mb-2">Recent trips</h3>
            {!v.trips?.length ? (
              <p className="text-[14.5px] text-muted">No trips yet.</p>
            ) : (
              <ul className="divide-y divide-line rounded-[12px] border border-line">
                {v.trips.slice(0, 6).map((t) => (
                  <li key={t.id}>
                    <Link to={`/trips/${t.id}`} className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-sheet-2">
                      <span className="min-w-0">
                        <span className="block font-[560]">{lane(t.originCity, t.destCity)}</span>
                        <span className="block text-[13px] text-muted">
                          {t.tripNo}, {t.status === 'COMPLETED' ? `done ${dt(t.completedAt)}` : t.status === 'IN_TRANSIT' ? 'on the road' : 'planned'}
                        </span>
                      </span>
                      <span className="num shrink-0 text-[14px]">{t.pnl ? inr(t.pnl.profit) : inr(t.freightAmount)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <ButtonLink to={`/marketplace?vehicle=${v.id}`} variant="ghost" size="sm" className="mt-2 -ml-2">
              Find loads for this truck
            </ButtonLink>
          </section>
          <ErrorNote>{act.error}</ErrorNote>
        </div>
      )}
    </Drawer>
  );
}

function AddVehicle({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ regNo: '', type: 'TRUCK_19FT', ownership: 'OWN', city: 'Jaipur', insurance: '', fitness: '', permit: '', puc: '' });
  const act = useAction();
  const docs = Object.fromEntries(Object.entries({ insurance: f.insurance, fitness: f.fitness, permit: f.permit, puc: f.puc }).filter(([, v]) => v));
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a vehicle"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="add-vehicle" disabled={act.busy}>
            Add vehicle
          </Button>
        </>
      }
    >
      <form
        id="add-vehicle"
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void act.run(async () => {
            await api.post('/api/vehicles', { regNo: f.regNo, type: f.type, ownership: f.ownership, city: f.city, docs });
            setF({ ...f, regNo: '', insurance: '', fitness: '', permit: '', puc: '' });
            onDone();
          });
        }}
      >
        <Field label="Registration number" htmlFor="av-reg" hint={f.regNo ? <span className="inline-flex items-center gap-2">On the plate: <Plate reg={f.regNo.toUpperCase()} size={12.5} /></span> : 'As written on the RC'}>
          <Input id="av-reg" value={f.regNo} onChange={(e) => setF({ ...f, regNo: e.target.value })} placeholder="RJ14 GA 1234" required className="uppercase" />
        </Field>
        <Field label="Type" htmlFor="av-type">
          <Select id="av-type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
            {VEHICLE_TYPES.map((t) => (
              <option key={t} value={t}>
                {VEHICLE_CLASSES[t].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Ownership" htmlFor="av-own">
          <Select id="av-own" value={f.ownership} onChange={(e) => setF({ ...f, ownership: e.target.value })}>
            <option value="OWN">Own truck</option>
            <option value="ATTACHED">Attached (owner-driver)</option>
            <option value="MARKET">Market hire</option>
          </Select>
        </Field>
        <Field label="Parked at" htmlFor="av-city">
          <Select id="av-city" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })}>
            {cityNames.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <p className="text-[14px] font-[560] sm:col-span-2">Paper expiry dates</p>
        {DOCS.map((d) => (
          <Field key={d.key} label={d.label} htmlFor={`av-${d.key}`}>
            <Input id={`av-${d.key}`} type="date" value={f[d.key as 'insurance']} onChange={(e) => setF({ ...f, [d.key]: e.target.value })} />
          </Field>
        ))}
        <div className="sm:col-span-2">
          <ErrorNote>{act.error}</ErrorNote>
        </div>
      </form>
    </Modal>
  );
}

function AddDriver({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: '', phone: '', licenseNo: '', licenseExpiry: '', lang: 'hi' });
  const act = useAction();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a driver"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="add-driver" disabled={act.busy}>
            Add driver
          </Button>
        </>
      }
    >
      <form
        id="add-driver"
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void act.run(async () => {
            await api.post('/api/drivers', f);
            setF({ name: '', phone: '', licenseNo: '', licenseExpiry: '', lang: 'hi' });
            onDone();
          });
        }}
      >
        <Field label="Name" htmlFor="ad-name">
          <Input id="ad-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        </Field>
        <Field label="Mobile" htmlFor="ad-phone">
          <Input id="ad-phone" type="tel" inputMode="numeric" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required />
        </Field>
        <Field label="Driving licence number" htmlFor="ad-lic" hint="e.g. RJ14 20180012345">
          <Input id="ad-lic" value={f.licenseNo} onChange={(e) => setF({ ...f, licenseNo: e.target.value })} required className="uppercase" />
        </Field>
        <Field label="Licence valid till" htmlFor="ad-exp">
          <Input id="ad-exp" type="date" value={f.licenseExpiry} onChange={(e) => setF({ ...f, licenseExpiry: e.target.value })} required />
        </Field>
        <Field label="Driver app language" htmlFor="ad-lang">
          <Select id="ad-lang" value={f.lang} onChange={(e) => setF({ ...f, lang: e.target.value })}>
            <option value="hi">हिंदी</option>
            <option value="en">English</option>
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <ErrorNote>{act.error}</ErrorNote>
        </div>
      </form>
    </Modal>
  );
}

function DriverLogin({ driver, onClose, onDone }: { driver: DriverRow | null; onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const act = useAction();
  useEffect(() => {
    if (driver) setPassword(String(Math.floor(10000000 + Math.random() * 89999999)));
  }, [driver]);
  const phone = driver?.phone.replace(/\D/g, '').slice(-10) ?? '';
  return (
    <Modal
      open={!!driver}
      onClose={onClose}
      title={`App login for ${driver?.name ?? ''}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="drv-login" disabled={act.busy || password.length < 8}>
            Create login
          </Button>
        </>
      }
    >
      {driver && (
        <form
          id="drv-login"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void act.run(async () => {
              await api.post('/api/users', { name: driver.name, email: `${phone}@drivers.surajlogistic.in`, password, phone, role: 'driver', lang: driver.lang, driverId: driver.id });
              onDone();
            });
          }}
        >
          <p className="text-[15px] text-muted">The driver logs in on their phone with their mobile number and this password. Send it on WhatsApp now; it is not shown again.</p>
          <dl className="m-0">
            <KV k="Mobile number" v={<span className="num font-[560]">{phone}</span>} />
          </dl>
          <Field label="Password" htmlFor="dl-pass" hint="At least 8 characters. Numbers are easiest to type on a phone.">
            <Input id="dl-pass" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className="num t-fig text-[22px] tracking-[0.2em]" />
          </Field>
          <ErrorNote>{act.error}</ErrorNote>
        </form>
      )}
    </Modal>
  );
}
