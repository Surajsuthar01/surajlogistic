import { CITIES, VEHICLE_CLASSES, VEHICLE_TYPES, type DriverRec, type VehicleRec } from '@suraj/core';
import { Plus, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge, Button, ErrorNote, Field, Input, KV, Loading, Modal, PageHeader, Panel, Select, StatusBadge, Tabs } from '../components/ui';
import { api } from '../lib/api';
import { ago, dateOnly } from '../lib/format';
import { useAction, useApi } from '../lib/hooks';

type VehicleRow = VehicleRec & { alerts: { doc: string; label: string; days: number }[] };
type DriverRow = DriverRec & { licenseDays: number };
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

const cityNames = [...CITIES].map((c) => c.name).sort();

export function Fleet() {
  const [sp] = useSearchParams();
  const [tab, setTab] = useState<'vehicles' | 'drivers'>(sp.get('tab') === 'drivers' ? 'drivers' : 'vehicles');
  const vehicles = useApi<VehicleRow[]>('/api/vehicles', { liveTypes: ['trip.status'] });
  const drivers = useApi<DriverRow[]>('/api/drivers', { liveTypes: ['trip.status'] });
  const [addV, setAddV] = useState(false);
  const [addD, setAddD] = useState(false);
  const [verify, setVerify] = useState<Verify | null>(null);
  const act = useAction();

  const counts = { ON_TRIP: 0, IDLE: 0, MAINTENANCE: 0 } as Record<string, number>;
  (vehicles.data ?? []).forEach((v) => (counts[v.status] = (counts[v.status] ?? 0) + 1));
  const docIssues = (vehicles.data ?? []).reduce((a, v) => a + v.alerts.length, 0);

  return (
    <div>
      <PageHeader
        title="Fleet & drivers"
        sub={`${vehicles.data?.length ?? 0} vehicles: ${counts.ON_TRIP} on trip, ${counts.IDLE} idle, ${counts.MAINTENANCE} in workshop · ${docIssues} document alerts`}
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
      <div className="mb-4">
        <Tabs value={tab} onChange={setTab} items={[{ value: 'vehicles', label: 'Vehicles' }, { value: 'drivers', label: 'Drivers' }]} />
      </div>
      <ErrorNote>{act.error}</ErrorNote>

      {tab === 'vehicles' ? (
        <Panel bodyClass="p-0">
          {!vehicles.data ? (
            <Loading />
          ) : (
            <div className="scroll-x">
              <table className="data">
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Where</th>
                    <th>Documents</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {vehicles.data.map((v) => (
                    <tr key={v.id}>
                      <td className="whitespace-nowrap">
                        <div className="awb">{v.regNo}</div>
                        <div className="text-[12.5px] text-muted">{v.ownership === 'OWN' ? 'Own' : v.ownership === 'ATTACHED' ? 'Attached' : 'Market hire'}</div>
                      </td>
                      <td className="whitespace-nowrap">
                        {VEHICLE_CLASSES[v.type].label}
                        <div className="text-[12.5px] text-muted">{v.kmpl} km/l</div>
                      </td>
                      <td>
                        <StatusBadge status={v.status} />
                      </td>
                      <td className="whitespace-nowrap">
                        {v.city}
                        <div className="text-[12.5px] text-muted">GPS {ago(v.lastPingAt)}</div>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {v.alerts.length === 0 ? (
                            <Badge tone="good">All valid</Badge>
                          ) : (
                            v.alerts.map((a) => (
                              <Badge key={a.doc} tone={a.days < 0 ? 'bad' : a.days <= 7 ? 'warn' : 'accent'}>
                                {a.label} {a.days < 0 ? 'expired' : `in ${a.days} d`}
                              </Badge>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => act.run(async () => setVerify(await api.post<Verify>(`/api/vehicles/${v.id}/verify`)))}>
                            <ShieldCheck size={15} /> Verify
                          </Button>
                          {v.status !== 'ON_TRIP' && (
                            <Button size="sm" variant="ghost" onClick={() => act.run(async () => (await api.patch(`/api/vehicles/${v.id}`, { status: v.status === 'MAINTENANCE' ? 'IDLE' : 'MAINTENANCE' }), await vehicles.reload()))}>
                              {v.status === 'MAINTENANCE' ? 'Back in service' : 'Send to workshop'}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : (
        <Panel bodyClass="p-0">
          {!drivers.data ? (
            <Loading />
          ) : (
            <div className="scroll-x">
              <table className="data">
                <thead>
                  <tr>
                    <th>Driver</th>
                    <th>Mobile</th>
                    <th>Licence</th>
                    <th>Status</th>
                    <th>Rating</th>
                    <th>App language</th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.data.map((d) => (
                    <tr key={d.id}>
                      <td className="font-medium">{d.name}</td>
                      <td className="num">{d.phone}</td>
                      <td className="whitespace-nowrap">
                        <span className="num text-[13.5px]">{d.licenseNo}</span>
                        <div>{d.licenseDays <= 30 ? <Badge tone={d.licenseDays < 0 ? 'bad' : d.licenseDays <= 7 ? 'warn' : 'accent'}>{d.licenseDays < 0 ? 'Expired' : `Expires in ${d.licenseDays} d`}</Badge> : <span className="text-[12.5px] text-muted">Valid till {dateOnly(d.licenseExpiry)}</span>}</div>
                      </td>
                      <td>
                        <StatusBadge status={d.status} />
                      </td>
                      <td className="num">{d.rating.toFixed(1)}</td>
                      <td>{d.lang === 'hi' ? 'हिंदी' : 'English'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      <AddVehicle open={addV} onClose={() => setAddV(false)} onDone={() => (setAddV(false), void vehicles.reload())} />
      <AddDriver open={addD} onClose={() => setAddD(false)} onDone={() => (setAddD(false), void drivers.reload())} />
      <Modal open={!!verify} onClose={() => setVerify(null)} title={`VAHAN check · ${verify?.regNo ?? ''}`}>
        {verify && (
          <div>
            <p className="mb-3 text-[14px]">{verify.verified ? <Badge tone="good">Registration found</Badge> : <Badge tone="bad">Could not verify</Badge>} <span className="text-muted">via {verify.source}</span></p>
            <KV k="Fitness valid till" v={dateOnly(verify.fitnessUpto)} />
            <KV k="Insurance valid till" v={dateOnly(verify.insuranceUpto)} />
            <KV k="Permit valid till" v={dateOnly(verify.permitUpto)} />
            <KV k="PUC valid till" v={dateOnly(verify.pucUpto)} />
            {verify.remarks.length > 0 && <ErrorNote>{verify.remarks.join('; ')}</ErrorNote>}
            <p className="mt-3 text-[12.5px] text-muted">Live checks run through ULIP once your company is registered; this result uses the documents saved here.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

function AddVehicle({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ regNo: '', type: 'TRUCK_19FT', ownership: 'OWN', city: 'Jaipur', insurance: '', fitness: '', permit: '', puc: '' });
  const act = useAction();
  const docs = Object.fromEntries(Object.entries({ insurance: f.insurance, fitness: f.fitness, permit: f.permit, puc: f.puc }).filter(([, v]) => v));
  return (
    <Modal open={open} onClose={onClose} title="Add a vehicle">
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void act.run(async () => {
            await api.post('/api/vehicles', { regNo: f.regNo, type: f.type, ownership: f.ownership, city: f.city, docs });
            onDone();
          });
        }}
      >
        <Field label="Registration number" htmlFor="av-reg">
          <Input id="av-reg" value={f.regNo} onChange={(e) => setF({ ...f, regNo: e.target.value })} placeholder="RJ14 GA 1234" required />
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
            <option value="OWN">Own</option>
            <option value="ATTACHED">Attached (owner-driver)</option>
            <option value="MARKET">Market hire</option>
          </Select>
        </Field>
        <Field label="Parked at" htmlFor="av-city">
          <Select id="av-city" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })}>
            {cityNames.map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        {(['insurance', 'fitness', 'permit', 'puc'] as const).map((k) => (
          <Field key={k} label={`${k === 'puc' ? 'PUC' : k[0]!.toUpperCase() + k.slice(1)} valid till`} htmlFor={`av-${k}`}>
            <Input id={`av-${k}`} type="date" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          </Field>
        ))}
        <div className="sm:col-span-2">
          <ErrorNote>{act.error}</ErrorNote>
          <Button variant="primary" type="submit" disabled={act.busy} className="mt-2">
            Add vehicle
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function AddDriver({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: '', phone: '', licenseNo: '', licenseExpiry: '', lang: 'hi' });
  const act = useAction();
  return (
    <Modal open={open} onClose={onClose} title="Add a driver">
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void act.run(async () => {
            await api.post('/api/drivers', f);
            onDone();
          });
        }}
      >
        <Field label="Name" htmlFor="ad-name">
          <Input id="ad-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        </Field>
        <Field label="Mobile" htmlFor="ad-phone">
          <Input id="ad-phone" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required />
        </Field>
        <Field label="Driving licence number" htmlFor="ad-lic">
          <Input id="ad-lic" value={f.licenseNo} onChange={(e) => setF({ ...f, licenseNo: e.target.value })} required />
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
          <Button variant="primary" type="submit" disabled={act.busy} className="mt-2">
            Add driver
          </Button>
        </div>
      </form>
    </Modal>
  );
}
