import { findCity, type CustomerRec } from '@suraj/shared';
import { Download, FileUp, Tag } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, ButtonLink, ErrorNote, Field, Note, PageHeader, Select, Sheet, StatusMark } from '../components/ui';
import { api, DEMO } from '../lib/api';
import { useAuth } from '../lib/auth';
import { downloadCsv, inr, svc } from '../lib/format';
import { useAction, useApi } from '../lib/hooks';

const COLUMNS = ['service', 'from', 'to', 'weight_kg', 'packages', 'receiver_name', 'receiver_phone', 'receiver_address', 'payment', 'cod_amount', 'goods_value', 'contents'] as const;
type Col = (typeof COLUMNS)[number];
type Row = Record<Col, string>;

interface RowResult {
  row: number;
  ok: boolean;
  error?: string;
  price?: number;
  id?: string;
  awb?: string;
}

const SAMPLE: string[][] = [
  [...COLUMNS],
  ['COURIER', 'Jaipur', 'Indore', '1.5', '1', 'Pooja Rawat', '9829012345', '14 Vijay Nagar, Indore 452010', 'COD', '1299', '1299', 'Cotton kurta'],
  ['COURIER', 'Jaipur', 'Pune', '0.8', '1', 'Imran Khan', '9822098765', 'Flat 3B, Baner Road, Pune 411045', 'PREPAID', '', '899', 'Bedsheet set'],
  ['PTL', 'Jaipur', 'Ahmedabad', '420', '18', 'Gujarat Home Decor', '9824044455', '22 Sindhu Bhavan Road, Ahmedabad 380054', 'TO_PAY', '', '86000', 'Handicraft cartons'],
];

/** Small CSV reader: handles quoted fields, commas and new lines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  const t = text.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (q) {
      if (c === '"' && t[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim()));
}

function check(r: Row): string | null {
  if (!['COURIER', 'PTL', 'FTL'].includes(r.service.toUpperCase())) return 'Service must be COURIER, PTL or FTL';
  if (!findCity(r.from)) return `We do not serve "${r.from}" yet`;
  if (!findCity(r.to)) return `We do not serve "${r.to}" yet`;
  if (!(Number(r.weight_kg) > 0)) return 'Weight is missing';
  if (!r.receiver_name.trim()) return 'Receiver name is missing';
  if (!/^[6-9]\d{9}$/.test(r.receiver_phone.replace(/\D/g, '').slice(-10))) return 'Receiver mobile must be 10 digits';
  if (r.receiver_address.trim().length < 8) return 'Address is too short';
  if (r.payment && !['PREPAID', 'COD', 'TO_PAY'].includes(r.payment.toUpperCase())) return 'Payment must be PREPAID, COD or TO_PAY';
  if (r.payment.toUpperCase() === 'COD' && !(Number(r.cod_amount) > 0)) return 'COD amount is missing';
  return null;
}

function toBody(r: Row) {
  const pay = (r.payment || 'PREPAID').toUpperCase();
  return {
    service: r.service.toUpperCase(),
    originCity: findCity(r.from)?.name ?? r.from,
    destCity: findCity(r.to)?.name ?? r.to,
    weightKg: Number(r.weight_kg),
    packages: Number(r.packages) || 1,
    consigneeName: r.receiver_name.trim(),
    consigneePhone: r.receiver_phone.replace(/\D/g, '').slice(-10),
    consigneeAddress: r.receiver_address.trim(),
    paymentMode: pay,
    codAmount: pay === 'COD' ? Number(r.cod_amount) || 0 : 0,
    declaredValue: Number(r.goods_value) || 0,
    ...(r.contents ? { contents: r.contents } : {}),
  };
}

export function BulkUpload() {
  const { user } = useAuth();
  const isCustomer = user?.role === 'customer';
  const { data: customers } = useApi<CustomerRec[]>(isCustomer ? null : '/api/customers');
  const [customerId, setCustomerId] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [results, setResults] = useState<RowResult[] | null>(null);
  const [booked, setBooked] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const act = useAction();

  const read = async (f: File) => {
    setParseErr(null);
    setResults(null);
    setBooked(false);
    setFileName(f.name);
    const grid = parseCsv(await f.text());
    if (grid.length < 2) return setParseErr('The sheet has no rows under the header.');
    const head = grid[0]!.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const missing = COLUMNS.filter((c) => !['contents', 'cod_amount', 'goods_value', 'packages', 'payment'].includes(c) && !head.includes(c));
    if (missing.length) return setParseErr(`Missing columns: ${missing.join(', ')}. Download the sample sheet to see the layout.`);
    if (grid.length > 501) return setParseErr('Upload up to 500 rows at a time.');
    setRows(grid.slice(1).map((r) => Object.fromEntries(COLUMNS.map((c) => [c, (r[head.indexOf(c)] ?? '').trim()])) as Row));
  };

  const send = (dryRun: boolean) =>
    act.run(async () => {
      if (!rows) return;
      const ok = rows.map((r, i) => ({ r, i, err: check(r) })).filter((x) => !x.err);
      const res = await api.post<{ results: RowResult[] }>('/api/shipments/bulk', { dryRun, ...(customerId ? { customerId } : {}), rows: ok.map((x) => ({ row: x.i + 1, ...toBody(x.r) })) });
      setResults(res.results);
      if (!dryRun) setBooked(true);
    });

  const errors = rows?.map((r) => check(r)) ?? [];
  const valid = errors.filter((e) => !e).length;
  const priced = results?.filter((r) => r.ok) ?? [];
  const total = priced.reduce((a, r) => a + (r.price ?? 0), 0);
  const resultFor = (i: number) => results?.find((r) => r.row === i + 1);
  const bookedIds = booked ? priced.map((r) => r.id).filter(Boolean) : [];

  return (
    <div>
      <PageHeader title="Upload a sheet of shipments" sub="For sellers who ship many parcels a day. Fill the sample sheet in Excel or Google Sheets, save it as CSV, and upload it here." back={{ to: '/shipments', label: 'Shipments' }} />
      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Sheet title="Your sheet">
          <div className="space-y-4">
            <Button onClick={() => downloadCsv('surajlogistic-sample.csv', SAMPLE)}>
              <Download size={16} /> Download the sample sheet
            </Button>
            {!isCustomer && (
              <Field label="Shipper for every row" htmlFor="bu-cust" hint="Their name goes on labels and their invoice">
                <Select id="bu-cust" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                  <option value="">Choose a customer</option>
                  {customers?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <input ref={input} id="bu-file" type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && void read(e.target.files[0])} />
            <button
              type="button"
              onClick={() => input.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) void read(f);
              }}
              className="flex w-full flex-col items-center gap-1.5 rounded-[20px] border-2 border-dashed border-line-strong px-4 py-9 text-center hover:border-accent hover:bg-sign-soft"
            >
              <FileUp size={24} className="text-muted" />
              <span className="font-[560]">{fileName || 'Choose a CSV file'}</span>
              <span className="text-[13.5px] text-muted">or drop it here, up to 500 rows</span>
            </button>
            <ErrorNote>{parseErr}</ErrorNote>
            {rows && (
              <p className="text-[14.5px]">
                {rows.length} rows read. <span className="text-go">{valid} look fine</span>
                {rows.length - valid > 0 && <span className="text-bad">, {rows.length - valid} need fixing</span>}.
              </p>
            )}
            {rows && !booked && (
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void send(true)} disabled={act.busy || !valid || (!isCustomer && !customerId)}>
                  Get prices
                </Button>
                <Button variant="primary" onClick={() => void send(false)} disabled={act.busy || !results || !priced.length}>
                  Book {priced.length || ''} for {inr(total)}
                </Button>
              </div>
            )}
            {!isCustomer && rows && !customerId && <p className="text-[13.5px] text-muted">Pick the shipper first.</p>}
            <ErrorNote>{act.error}</ErrorNote>
          </div>
        </Sheet>

        <div className="min-w-0">
          {booked && (
            <div className="mb-4 space-y-3">
              <Note tone="go">
                {priced.length} shipments booked. Receivers get their tracking links on WhatsApp.{' '}
                <Link to="/shipments?view=booked" className="font-[560] underline">
                  See them in Shipments
                </Link>
              </Note>
              {bookedIds.length > 0 && (
                <ButtonLink to={`/print/labels?ids=${bookedIds.join(',')}`} variant="primary" target={DEMO ? undefined : '_blank'}>
                  <Tag size={16} /> Print all {bookedIds.length} labels
                </ButtonLink>
              )}
            </div>
          )}
          {!rows ? (
            <div className="sheet px-5 py-6">
              <p className="t-sub">Columns in the sheet</p>
              <ul className="mt-2 grid gap-x-6 gap-y-1 text-[14.5px] sm:grid-cols-2">
                {[
                  ['service', 'COURIER, PTL or FTL'],
                  ['from, to', 'City names, like Jaipur'],
                  ['weight_kg', 'Total weight'],
                  ['packages', 'Number of boxes'],
                  ['receiver_name', 'Who receives it'],
                  ['receiver_phone', '10-digit mobile'],
                  ['receiver_address', 'With pincode'],
                  ['payment', 'PREPAID, COD or TO_PAY'],
                  ['cod_amount', 'Only for COD'],
                  ['goods_value', 'Invoice value in ₹'],
                  ['contents', 'What is inside'],
                ].map(([c, t]) => (
                  <li key={c}>
                    <code className="text-[13.5px]">{c}</code> <span className="text-muted">{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="sheet scroll-x">
              <table className="data tight">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Service</th>
                    <th>Lane</th>
                    <th>Receiver</th>
                    <th className="text-right">Weight</th>
                    <th>Payment</th>
                    <th>Check</th>
                    <th className="text-right">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const res = resultFor(i);
                    const err = errors[i] ?? (res && !res.ok ? res.error : null);
                    return (
                      <tr key={i}>
                        <td className="num text-muted">{i + 1}</td>
                        <td>{svc(r.service.toUpperCase())}</td>
                        <td className="whitespace-nowrap">
                          {r.from}–{r.to}
                        </td>
                        <td className="max-w-[220px]">
                          <div className="truncate">{r.receiver_name}</div>
                          <div className="num text-[13px] text-muted">{r.receiver_phone}</div>
                        </td>
                        <td className="num text-right">{r.weight_kg} kg</td>
                        <td className="whitespace-nowrap">{(r.payment || 'PREPAID').toUpperCase() === 'COD' ? `COD ${inr(Number(r.cod_amount))}` : (r.payment || 'Prepaid').toLowerCase().replace('_', ' ')}</td>
                        <td className="max-w-[240px]">{err ? <span className="text-[13.5px] text-bad">{err}</span> : res?.awb ? <Link to={`/shipments/${res.id}`} className="awb text-[13.5px] hover:underline">{res.awb}</Link> : <StatusMark tone="go" label="Fine" className="text-[13.5px]" />}</td>
                        <td className="num text-right">{res?.price ? inr(res.price) : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
