import { MODULES, type ModuleKey } from '@suraj/core';
import { useEffect, useState } from 'react';
import { Button, ErrorNote, Field, Input, PageHeader, Panel } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAction } from '../lib/hooks';

const MODULE_LABEL: Record<ModuleKey, string> = {
  trucking: 'Trucking — trips, fleet, drivers',
  courier: 'Courier — parcels, hubs, COD',
  marketplace: 'Load board and return loads',
  warehouse: 'Warehouse — stock and bins',
  billing: 'Billing — GST invoices',
};

export function SettingsPage() {
  const { org, refresh } = useAuth();
  const [f, setF] = useState({ dieselPrice: '', gstCourier: '', gstTransport: '' });
  const [mods, setMods] = useState<ModuleKey[]>([]);
  const [saved, setSaved] = useState(false);
  const act = useAction();

  useEffect(() => {
    if (!org) return;
    setF({ dieselPrice: String(org.settings.dieselPrice), gstCourier: String(org.settings.gst.courier), gstTransport: String(org.settings.gst.transport) });
    setMods(org.modules);
  }, [org]);

  const save = () =>
    act.run(async () => {
      await api.patch('/api/org/settings', { dieselPrice: Number(f.dieselPrice), gstCourier: Number(f.gstCourier), gstTransport: Number(f.gstTransport), modules: mods });
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });

  return (
    <div className="max-w-[760px]">
      <PageHeader title="Settings" sub={`${org?.name ?? ''} · ${org?.plan ?? ''} plan`} />
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Panel title="Pricing">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Diesel price (₹/litre)" hint="Quotes adjust freight when this changes" htmlFor="st-diesel">
              <Input id="st-diesel" type="number" step="0.01" min="50" max="200" value={f.dieselPrice} onChange={(e) => setF({ ...f, dieselPrice: e.target.value })} />
            </Field>
            <Field label="GST on courier (%)" htmlFor="st-gstc">
              <Input id="st-gstc" type="number" min="0" max="28" value={f.gstCourier} onChange={(e) => setF({ ...f, gstCourier: e.target.value })} />
            </Field>
            <Field label="GST on transport (%)" hint="Confirm GTA rate with your CA" htmlFor="st-gstt">
              <Input id="st-gstt" type="number" min="0" max="28" value={f.gstTransport} onChange={(e) => setF({ ...f, gstTransport: e.target.value })} />
            </Field>
          </div>
        </Panel>
        <Panel title="Modules">
          <ul className="space-y-2">
            {MODULES.map((m) => (
              <li key={m}>
                <label className="flex items-center gap-3 text-[15px]">
                  <input type="checkbox" checked={mods.includes(m)} onChange={(e) => setMods((x) => (e.target.checked ? [...x, m] : x.filter((y) => y !== m)))} />
                  {MODULE_LABEL[m]}
                </label>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[13px] text-muted">Each customer pays only for the modules switched on. Data in a switched-off module is kept.</p>
        </Panel>
        <ErrorNote>{act.error}</ErrorNote>
        <Button variant="primary" type="submit" disabled={act.busy}>
          {saved ? 'Saved' : 'Save settings'}
        </Button>
      </form>
    </div>
  );
}
