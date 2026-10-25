import { CITIES, VEHICLE_CLASSES, VEHICLE_TYPES, type CustomerRec, type PaymentMode, type Quote, type RtoRisk, type Service } from '@suraj/shared';
import { Box, Package, Truck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, ErrorNote, Field, Input, PageHeader, RiskMeter, Select, Sheet, Textarea } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dt, inr, km } from '../lib/format';
import { useAction, useApi } from '../lib/hooks';

interface QuoteResp {
  quote: Quote;
  co2Kg: number;
  rtoPreview: RtoRisk;
  signals: { laneDemand: number; returnLoadScore: number };
}

export const cityNames = [...CITIES].map((c) => c.name).sort();

const SERVICES: { value: Service; title: string; text: string; icon: typeof Box }[] = [
  { value: 'COURIER', title: 'Parcel', text: 'Up to about 50 kg, door to door', icon: Package },
  { value: 'PTL', title: 'Part load', text: 'Cartons and pallets sharing a truck', icon: Box },
  { value: 'FTL', title: 'Full truck', text: 'A whole vehicle, one pickup, one drop', icon: Truck },
];

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
    contents: '',
    shipperInvoiceNo: '',
    paymentMode: 'PREPAID' as PaymentMode,
    codAmount: '',
    customerId: sp.get('customer') || '',
    shipperName: '',
    pickupAddress: '',
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
    }, 300);
    return () => clearTimeout(t);
  }, [body]);

  const submit = () =>
    run(async () => {
      const s = await api.post<{ id: string; awb: string }>('/api/shipments', {
        ...body,
        ...(form.customerId ? { customerId: form.customerId } : {}),
        ...(form.shipperName ? { shipperName: form.shipperName } : {}),
        ...(form.pickupAddress ? { pickupAddress: form.pickupAddress } : {}),
        ...(form.contents ? { contents: form.contents } : {}),
        ...(form.shipperInvoiceNo ? { shipperInvoiceNo: form.shipperInvoiceNo } : {}),
        consigneeName: form.consigneeName,
        consigneePhone: form.consigneePhone.replace(/\D/g, '').slice(-10),
        consigneeAddress: form.consigneeAddress,
      });
      nav(`/shipments/${s.id}?booked=1`);
    });

  const phoneOk = /^[6-9]\d{9}$/.test(form.consigneePhone.replace(/\D/g, '').slice(-10));
  const sameCity = form.originCity === form.destCity;

  return (
    <div>
      <PageHeader title="Book a shipment" sub="The price updates as you type. When you book, the receiver gets a WhatsApp message with the tracking link." back={{ to: '/shipments', label: 'Shipments' }} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className="t-sub mb-2.5">What are you sending?</legend>
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Service">
              {SERVICES.map((s) => {
                const on = service === s.value;
                return (
                  <button
                    key={s.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setService(s.value)}
                    className={`flex items-start gap-3 rounded-[14px] border px-3.5 py-3 text-left transition-colors ${on ? 'border-sign bg-sign-soft shadow-[inset_0_0_0_1px_var(--sign)]' : 'border-line-strong bg-sheet hover:border-faint'}`}
                  >
                    <s.icon size={20} className={`mt-0.5 shrink-0 ${on ? 'text-accent' : 'text-muted'}`} />
                    <span>
                      <span className="block text-[15.5px] font-[600]">{s.title}</span>
                      <span className="block text-[13.5px] leading-snug text-muted">{s.text}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <Sheet title="Lane and cargo">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="From" htmlFor="ns-from">
                <Select id="ns-from" value={form.originCity} onChange={set('originCity')}>
                  {cityNames.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
              <Field label="To" htmlFor="ns-to" hint={sameCity ? 'Same city: priced as a local delivery.' : undefined}>
                <Select id="ns-to" value={form.destCity} onChange={set('destCity')}>
                  {cityNames.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
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
              <div className="mt-4">
                <p className="mb-1.5 text-[14px] font-[560]">
                  Box size in cm <span className="font-normal text-muted">(optional, for light but bulky parcels)</span>
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <Input id="ns-l" aria-label="Length cm" type="number" min="1" value={form.lengthCm} onChange={set('lengthCm')} placeholder="Length" />
                  <Input id="ns-w" aria-label="Width cm" type="number" min="1" value={form.widthCm} onChange={set('widthCm')} placeholder="Width" />
                  <Input id="ns-h" aria-label="Height cm" type="number" min="1" value={form.heightCm} onChange={set('heightCm')} placeholder="Height" />
                </div>
              </div>
            )}
            {service === 'FTL' && (
              <Field label="Vehicle" hint="Leave on automatic and we pick the smallest truck that carries the weight." htmlFor="ns-vt" className="mt-4">
                <Select id="ns-vt" value={form.vehicleType} onChange={set('vehicleType')}>
                  <option value="">Pick automatically by weight</option>
                  {VEHICLE_TYPES.filter((t) => t !== 'BIKE').map((t) => (
                    <option key={t} value={t}>
                      {VEHICLE_CLASSES[t].label}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="What is inside" htmlFor="ns-contents" hint="Printed on the consignment note">
                <Input id="ns-contents" value={form.contents} onChange={set('contents')} placeholder={service === 'COURIER' ? 'e.g. Cotton sarees' : 'e.g. Soya meal, 50 kg bags'} />
              </Field>
              <Field label="Goods value (₹)" hint="Above ₹50,000 needs an e-way bill" htmlFor="ns-val">
                <Input id="ns-val" type="number" min="0" value={form.declaredValue} onChange={set('declaredValue')} />
              </Field>
              {Number(form.declaredValue) > 50000 && (
                <Field label="Shipper's invoice number" htmlFor="ns-inv" hint="Needed for the e-way bill">
                  <Input id="ns-inv" value={form.shipperInvoiceNo} onChange={set('shipperInvoiceNo')} placeholder="e.g. ST/1042" />
                </Field>
              )}
            </div>
          </Sheet>

          <Sheet title="Payment">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Who pays" htmlFor="ns-pay">
                <Select id="ns-pay" value={form.paymentMode} onChange={set('paymentMode')}>
                  <option value="PREPAID">Prepaid by the shipper</option>
                  <option value="COD">Cash on delivery (we collect for the shipper)</option>
                  <option value="TO_PAY">To pay (receiver pays the freight)</option>
                </Select>
              </Field>
              {form.paymentMode === 'COD' && (
                <Field label="Amount to collect (₹)" htmlFor="ns-cod">
                  <Input id="ns-cod" type="number" min="1" value={form.codAmount} onChange={set('codAmount')} required />
                </Field>
              )}
            </div>
          </Sheet>

          <Sheet title="From and to">
            <div className="grid gap-4 sm:grid-cols-2">
              {!isCustomer && (
                <Field label="Shipper" htmlFor="ns-cust">
                  <Select id="ns-cust" value={form.customerId} onChange={set('customerId')}>
                    <option value="">Walk-in or new shipper</option>
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
              <Field label="Pick up from" htmlFor="ns-pick" hint="Leave empty if the shipper drops it at our branch" className="sm:col-span-2">
                <Input id="ns-pick" value={form.pickupAddress} onChange={set('pickupAddress')} placeholder={`Shop or godown address in ${form.originCity}`} />
              </Field>
              <Field label="Receiver name" htmlFor="ns-cname">
                <Input id="ns-cname" value={form.consigneeName} onChange={set('consigneeName')} autoComplete="off" required />
              </Field>
              <Field label="Receiver mobile" hint={form.consigneePhone && !phoneOk ? <span className="text-bad">Enter a 10-digit Indian mobile number</span> : 'Gets the tracking link and the delivery OTP'} htmlFor="ns-cphone">
                <Input id="ns-cphone" type="tel" inputMode="numeric" value={form.consigneePhone} onChange={set('consigneePhone')} placeholder="98xxxxxxxx" required />
              </Field>
              <Field label="Delivery address" hint="House or shop number, street, area, landmark and pincode. A complete address cuts failed deliveries." htmlFor="ns-addr" className="sm:col-span-2">
                <Textarea id="ns-addr" rows={2} value={form.consigneeAddress} onChange={set('consigneeAddress')} required />
              </Field>
            </div>
          </Sheet>
          <ErrorNote>{error}</ErrorNote>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="lg" type="submit" disabled={busy || !q || !phoneOk}>
              {busy ? 'Booking…' : q ? `Book for ${inr(q.quote.total)}` : 'Book shipment'}
            </Button>
            <Button size="lg" onClick={() => nav(-1)}>
              Cancel
            </Button>
          </div>
        </form>

        <aside className="lg:sticky lg:top-4 lg:self-start">
          <div className="sheet overflow-hidden">
            <div className="border-b border-line px-5 pt-5 pb-4">
              <p className="text-[14px] text-muted">
                {svc(service)}, {form.originCity} to {form.destCity}
              </p>
              {qErr ? (
                <div className="mt-2">
                  <ErrorNote>{qErr}</ErrorNote>
                </div>
              ) : !q ? (
                <p className="mt-2 text-[15px] text-muted">Working out the price…</p>
              ) : (
                <>
                  <p className="t-fig mt-1 text-[46px]">{inr(q.quote.total)}</p>
                  <p className="mt-1 text-[14px] text-muted">
                    Includes {q.quote.gstRate}% GST of {inr(q.quote.gst)}. Arrives by {dt(q.quote.etaAt)}.
                  </p>
                </>
              )}
            </div>
            {q && (
              <div className="px-4 py-3">
                <dl className="m-0 space-y-1.5 text-[14.5px]">
                  {q.quote.lines.map((l) => (
                    <div key={l.code} className="flex justify-between gap-3">
                      <dt className="text-muted">{l.label}</dt>
                      <dd className={`num m-0 ${l.amount < 0 ? 'text-go' : ''}`}>{inr(l.amount)}</dd>
                    </div>
                  ))}
                  <div className="flex justify-between gap-3 border-t border-line pt-1.5">
                    <dt className="text-muted">GST {q.quote.gstRate}%</dt>
                    <dd className="num m-0">{inr(q.quote.gst)}</dd>
                  </div>
                </dl>
                <div className="mt-3 space-y-1 text-[13.5px] text-muted">
                  <p>{km(q.quote.distanceKm)} by road.</p>
                  {q.quote.zone && (
                    <p>
                      Zone {q.quote.zone}, charged on {q.quote.chargeableKg} kg{q.quote.chargeableKg > Number(form.weightKg) ? ' because the box is bulky' : ''}.
                    </p>
                  )}
                  {q.quote.vehicleType && <p>{VEHICLE_CLASSES[q.quote.vehicleType].label}.</p>}
                  {service === 'FTL' && (
                    <p>
                      Demand on this lane is {q.signals.laneDemand.toFixed(2)} times normal; {Math.round(q.signals.returnLoadScore * 100)}% chance of a return load from {form.destCity}.
                    </p>
                  )}
                  <p>About {q.co2Kg.toLocaleString('en-IN')} kg of CO₂.</p>
                </div>
                {form.paymentMode !== 'PREPAID' && (
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-[12px] bg-sheet-2 px-3 py-2">
                    <span className="text-[13.5px]">Chance it comes back</span>
                    <RiskMeter score={q.rtoPreview.score} level={q.rtoPreview.level} />
                  </div>
                )}
                {q.quote.notes.map((n) => (
                  <p key={n} className="mt-2 text-[13.5px] text-muted">
                    {n}
                  </p>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function svc(s: Service) {
  return s === 'COURIER' ? 'Parcel' : s === 'PTL' ? 'Part load' : 'Full truck';
}
