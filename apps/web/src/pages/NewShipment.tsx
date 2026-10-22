import { CITIES, VEHICLE_CLASSES, VEHICLE_TYPES, type CustomerRec, type PaymentMode, type Quote, type RtoRisk, type Service } from '@suraj/core';
import { Leaf, ShieldAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, Button, ErrorNote, Field, Input, PageHeader, Panel, Select, Tabs } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dt, inr } from '../lib/format';
import { useAction, useApi } from '../lib/hooks';

interface QuoteResp {
  quote: Quote;
  co2Kg: number;
  rtoPreview: RtoRisk;
  signals: { laneDemand: number; returnLoadScore: number };
}

const cityNames = [...CITIES].map((c) => c.name).sort();

export function NewShipment() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [sp] = useSearchParams();
  const isCustomer = user?.role === 'customer';
  const { data: customers } = useApi<CustomerRec[]>(isCustomer ? null : '/api/customers');

  const [service, setService] = useState<Service>((sp.get('service') as Service) || 'COURIER');
  const [form, setForm] = useState({
    originCity: sp.get('from') || 'Jaipur',
    destCity: sp.get('to') || 'Indore',
    weightKg: sp.get('kg') || '2',
    packages: '1',
    lengthCm: '',
    widthCm: '',
    heightCm: '',
    vehicleType: '',
    declaredValue: '2500',
    paymentMode: 'PREPAID' as PaymentMode,
    codAmount: '',
    customerId: '',
    shipperName: '',
    consigneeName: '',
    consigneePhone: '',
    consigneeAddress: '',
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const [q, setQ] = useState<QuoteResp | null>(null);
  const [qErr, setQErr] = useState<string | null>(null);
  const { busy, error, run } = useAction();

  useEffect(() => {
    if (service !== 'COURIER' && Number(form.weightKg) < 50 && !sp.get('kg')) setForm((f) => ({ ...f, weightKg: service === 'FTL' ? '6000' : '500', declaredValue: service === 'FTL' ? '400000' : '60000' }));
    if (service === 'COURIER' && Number(form.weightKg) > 50) setForm((f) => ({ ...f, weightKg: '2', declaredValue: '2500' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service]);

  const body = useMemo(
    () => ({
      service,
      originCity: form.originCity,
      destCity: form.destCity,
      weightKg: Number(form.weightKg),
      packages: Number(form.packages) || 1,
      ...(form.lengthCm && form.widthCm && form.heightCm ? { lengthCm: Number(form.lengthCm), widthCm: Number(form.widthCm), heightCm: Number(form.heightCm) } : {}),
      ...(service === 'FTL' && form.vehicleType ? { vehicleType: form.vehicleType } : {}),
      declaredValue: Number(form.declaredValue) || 0,
      paymentMode: form.paymentMode,
      codAmount: form.paymentMode === 'COD' ? Number(form.codAmount) || 0 : 0,
    }),
    [service, form],
  );

  useEffect(() => {
    if (!body.weightKg || body.weightKg <= 0) return;
    const t = setTimeout(async () => {
      try {
        setQ(await api.post<QuoteResp>('/api/quotes', body));
        setQErr(null);
      } catch (e) {
        setQErr(e instanceof Error ? e.message : 'Could not price this shipment');
      }
    }, 350);
    return () => clearTimeout(t);
  }, [body]);

  const submit = () =>
    run(async () => {
      const s = await api.post<{ id: string; awb: string }>('/api/shipments', {
        ...body,
        ...(form.customerId ? { customerId: form.customerId } : {}),
        ...(form.shipperName ? { shipperName: form.shipperName } : {}),
        consigneeName: form.consigneeName,
        consigneePhone: form.consigneePhone,
        consigneeAddress: form.consigneeAddress,
      });
      nav(`/shipments/${s.id}?booked=1`);
    });

  return (
    <div>
      <PageHeader title="Book a shipment" sub="Price updates as you type. The receiver gets a WhatsApp tracking link when you book." />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Panel title="What are you sending?">
            <div className="space-y-4">
              <Tabs
                value={service}
                onChange={setService}
                items={[
                  { value: 'COURIER', label: 'Parcel (courier)' },
                  { value: 'PTL', label: 'Part truckload' },
                  { value: 'FTL', label: 'Full truck' },
                ]}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="From" htmlFor="ns-from">
                  <Select id="ns-from" value={form.originCity} onChange={set('originCity')}>
                    {cityNames.map((c) => <option key={c}>{c}</option>)}
                  </Select>
                </Field>
                <Field label="To" htmlFor="ns-to">
                  <Select id="ns-to" value={form.destCity} onChange={set('destCity')}>
                    {cityNames.map((c) => <option key={c}>{c}</option>)}
                  </Select>
                </Field>
                <Field label="Weight (kg)" htmlFor="ns-kg">
                  <Input id="ns-kg" type="number" min="0.1" step="0.1" value={form.weightKg} onChange={set('weightKg')} required />
                </Field>
                <Field label="Packages" htmlFor="ns-pk">
                  <Input id="ns-pk" type="number" min="1" value={form.packages} onChange={set('packages')} />
                </Field>
              </div>
              {service === 'COURIER' && (
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Length cm" htmlFor="ns-l">
                    <Input id="ns-l" type="number" min="1" value={form.lengthCm} onChange={set('lengthCm')} placeholder="optional" />
                  </Field>
                  <Field label="Width cm" htmlFor="ns-w">
                    <Input id="ns-w" type="number" min="1" value={form.widthCm} onChange={set('widthCm')} />
                  </Field>
                  <Field label="Height cm" htmlFor="ns-h">
                    <Input id="ns-h" type="number" min="1" value={form.heightCm} onChange={set('heightCm')} />
                  </Field>
                </div>
              )}
              {service === 'FTL' && (
                <Field label="Vehicle" hint="Leave on auto and we pick the smallest truck that fits." htmlFor="ns-vt">
                  <Select id="ns-vt" value={form.vehicleType} onChange={set('vehicleType')}>
                    <option value="">Auto-select by weight</option>
                    {VEHICLE_TYPES.filter((t) => t !== 'BIKE').map((t) => (
                      <option key={t} value={t}>
                        {VEHICLE_CLASSES[t].label}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Goods value (₹)" hint="Above ₹50,000 needs an e-way bill" htmlFor="ns-val">
                  <Input id="ns-val" type="number" min="0" value={form.declaredValue} onChange={set('declaredValue')} />
                </Field>
                <Field label="Payment" htmlFor="ns-pay">
                  <Select id="ns-pay" value={form.paymentMode} onChange={set('paymentMode')}>
                    <option value="PREPAID">Prepaid</option>
                    <option value="COD">Cash on delivery</option>
                    <option value="TO_PAY">To pay (receiver pays freight)</option>
                  </Select>
                </Field>
                {form.paymentMode === 'COD' && (
                  <Field label="COD amount (₹)" htmlFor="ns-cod">
                    <Input id="ns-cod" type="number" min="1" value={form.codAmount} onChange={set('codAmount')} required />
                  </Field>
                )}
              </div>
            </div>
          </Panel>

          <Panel title="Who is it from and to?">
            <div className="grid gap-4 sm:grid-cols-2">
              {!isCustomer && (
                <Field label="Shipper (customer)" htmlFor="ns-cust">
                  <Select id="ns-cust" value={form.customerId} onChange={set('customerId')}>
                    <option value="">Walk-in / new shipper</option>
                    {customers?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              {!isCustomer && !form.customerId && (
                <Field label="Shipper name" htmlFor="ns-sname">
                  <Input id="ns-sname" value={form.shipperName} onChange={set('shipperName')} placeholder="e.g. Agarwal Traders" required />
                </Field>
              )}
              <Field label="Receiver name" htmlFor="ns-cname">
                <Input id="ns-cname" value={form.consigneeName} onChange={set('consigneeName')} required />
              </Field>
              <Field label="Receiver mobile" hint="Gets the tracking link and delivery OTP" htmlFor="ns-cphone">
                <Input id="ns-cphone" type="tel" inputMode="numeric" value={form.consigneePhone} onChange={set('consigneePhone')} placeholder="98xxxxxxxx" required />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Delivery address" hint="House/plot number, area, landmark, pincode — a full address cuts failed deliveries" htmlFor="ns-addr">
                  <Input id="ns-addr" value={form.consigneeAddress} onChange={set('consigneeAddress')} required />
                </Field>
              </div>
            </div>
          </Panel>
          <ErrorNote>{error}</ErrorNote>
          <div className="flex gap-2">
            <Button variant="primary" type="submit" disabled={busy || !q} className="h-11 px-6">
              {busy ? 'Booking…' : q ? `Book for ${inr(q.quote.total)}` : 'Book shipment'}
            </Button>
            <Button onClick={() => nav(-1)}>Cancel</Button>
          </div>
        </form>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <Panel title="Price" action={q && <span className="text-[13px] text-muted">{q.quote.distanceKm.toLocaleString('en-IN')} km</span>}>
            {qErr && <ErrorNote>{qErr}</ErrorNote>}
            {!q && !qErr && <p className="text-[14px] text-muted">Pricing…</p>}
            {q && (
              <div>
                <div className="num font-display text-[38px] font-bold leading-none">{inr(q.quote.total)}</div>
                <p className="mt-1 text-[13.5px] text-muted">
                  incl. {q.quote.gstRate}% GST ({inr(q.quote.gst)}) · arrives by {dt(q.quote.etaAt)}
                </p>
                <ul className="mt-4 space-y-1.5 text-[14px]">
                  {q.quote.lines.map((l) => (
                    <li key={l.code} className="flex justify-between gap-3">
                      <span className="text-muted">{l.label}</span>
                      <span className={`num ${l.amount < 0 ? 'text-good' : ''}`}>{inr(l.amount)}</span>
                    </li>
                  ))}
                  <li className="flex justify-between gap-3 border-t border-line pt-1.5">
                    <span className="text-muted">GST {q.quote.gstRate}%</span>
                    <span className="num">{inr(q.quote.gst)}</span>
                  </li>
                </ul>
                {q.quote.zone && <p className="mt-3 text-[13px] text-muted">Courier zone {q.quote.zone} · billed on {q.quote.chargeableKg} kg</p>}
                {q.quote.vehicleType && <p className="mt-3 text-[13px] text-muted">{VEHICLE_CLASSES[q.quote.vehicleType].label}</p>}
                {service === 'FTL' && (
                  <p className="mt-1 text-[13px] text-muted">
                    Lane demand {q.signals.laneDemand.toFixed(2)}× · return-load chance {Math.round(q.signals.returnLoadScore * 100)}%
                  </p>
                )}
                <div className="mt-4 space-y-2">
                  <p className="flex items-center gap-2 text-[13.5px]">
                    <Leaf size={16} className="text-good" /> about {q.co2Kg.toLocaleString('en-IN')} kg CO₂
                  </p>
                  {form.paymentMode !== 'PREPAID' && (
                    <p className="flex items-center gap-2 text-[13.5px]">
                      <ShieldAlert size={16} className="text-warn" /> Return risk before address check: <Badge tone={q.rtoPreview.level === 'HIGH' ? 'bad' : q.rtoPreview.level === 'MEDIUM' ? 'warn' : 'good'}>{q.rtoPreview.score}/100</Badge>
                    </p>
                  )}
                  {q.quote.notes.map((n) => (
                    <p key={n} className="rounded-[10px] bg-panel-2 px-3 py-2 text-[13px] text-muted">
                      {n}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  );
}
