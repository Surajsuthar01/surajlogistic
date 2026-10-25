import { findCity } from '@suraj/shared';
import JsBarcode from 'jsbarcode';
import { ArrowLeft, Printer } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BRAND, Mark } from '../components/Brand';
import { Button, Loading, Select } from '../components/ui';
import { api, DEMO } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dateOnly, dt, inr, inrWords, kg, PAYMENT_LABEL, svc } from '../lib/format';
import { useApi } from '../lib/hooks';
import type { ShipmentDetailResp } from './ShipmentDetail';

const PUBLIC_URL = DEMO ? 'https://surajlogistic.in' : typeof window !== 'undefined' ? window.location.origin : '';

function Barcode({ value, height = 64, width = 2 }: { value: string; height?: number; width?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (ref.current) JsBarcode(ref.current, value, { format: 'CODE128', height, width, displayValue: false, margin: 0, background: 'transparent' });
  }, [value, height, width]);
  return <svg ref={ref} role="img" aria-label={`Barcode ${value}`} />;
}

function QR({ text, size = 96 }: { text: string; size?: number }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    QRCode.toString(text, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })
      .then(setSvg)
      .catch(() => setSvg(''));
  }, [text]);
  return <div style={{ width: size, height: size }} role="img" aria-label="QR code" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function PrintShell({ title, children, controls }: { title: string; children: ReactNode; controls?: ReactNode }) {
  const nav = useNavigate();
  useEffect(() => {
    const t = document.title;
    document.title = title;
    return () => {
      document.title = t;
    };
  }, [title]);
  return (
    <div className="min-h-full bg-sheet-2 pb-10">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-sheet px-4 py-2.5">
        <Button variant="ghost" onClick={() => nav(-1)}>
          <ArrowLeft size={16} /> Back
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {controls}
          <Button variant="primary" onClick={() => window.print()} title="Choose “Save as PDF” in the print window to keep a PDF">
            <Printer size={16} /> Print or save PDF
          </Button>
        </div>
      </div>
      <div className="px-4 pt-6">{children}</div>
    </div>
  );
}

/** A quiet line at the foot of A4 documents: the mark, the name and the line under it. */
function BrandFooter() {
  return (
    <div className="mt-6 flex items-center justify-center gap-1.5 border-t border-[#ddd] pt-2.5 text-[10.5px] text-[#666]">
      <Mark size={16} />
      <span>
        <b className="text-[#111]">{BRAND.name}</b> · {BRAND.line}
      </span>
    </div>
  );
}

/** 4 × 6 inch thermal label (100 × 150 mm), the size most parcel printers take. */
function LabelCard({ s, orgName, phone }: { s: ShipmentDetailResp; orgName: string; phone?: string }) {
  const dest = findCity(s.destCity);
  return (
    <article className="paper mx-auto mb-6 flex flex-col border border-[#111] text-[#111] print:mb-0" style={{ width: '100mm', minHeight: '150mm', fontSize: 11, breakAfter: 'page' }}>
      <header className="flex items-center justify-between border-b-2 border-[#111] px-3 py-2">
        <span className="flex items-center gap-1.5">
          <Mark size={26} />
          <b style={{ fontSize: 14, letterSpacing: '-0.02em' }}>{orgName}</b>
        </span>
        <b style={{ fontSize: 13 }}>{svc(s.service).toUpperCase()}</b>
      </header>
      <div className="grid grid-cols-[1fr_auto] border-b-2 border-[#111]">
        <div className="border-r-2 border-[#111] px-3 py-2">
          <div style={{ fontSize: 10 }}>Deliver to</div>
          <div style={{ fontSize: 36, fontWeight: 600, fontFamily: 'var(--font-display)', textTransform: 'uppercase', lineHeight: 1 }}>{s.destCity}</div>
          <div style={{ fontSize: 10 }}>{dest?.state}</div>
        </div>
        <div className="grid place-items-center px-3 text-center" style={{ minWidth: '30mm' }}>
          {s.paymentMode === 'COD' ? (
            <div>
              <div style={{ fontSize: 10 }}>Collect</div>
              <div style={{ fontSize: 24, fontWeight: 600, fontFamily: 'var(--font-display)' }}>{inr(s.codAmount)}</div>
              <div style={{ fontSize: 10, fontWeight: 700 }}>CASH ON DELIVERY</div>
            </div>
          ) : (
            <div style={{ fontSize: 16, fontWeight: 760 }}>{s.paymentMode === 'TO_PAY' ? 'TO PAY' : 'PREPAID'}</div>
          )}
        </div>
      </div>
      <div className="flex flex-col items-center border-b-2 border-[#111] px-3 pt-3 pb-2">
        <Barcode value={s.awb} height={58} width={2} />
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '0.12em', marginTop: 4 }}>{s.awb}</div>
      </div>
      <div className="border-b border-[#111] px-3 py-2" style={{ fontSize: 12 }}>
        <div style={{ fontSize: 10 }}>To</div>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{s.consigneeName}</div>
        <div style={{ lineHeight: 1.3 }}>{s.consigneeAddress}</div>
        <div style={{ fontWeight: 600 }}>{s.consigneePhone}</div>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2 px-3 py-2" style={{ fontSize: 11 }}>
        <div>
          <div style={{ fontSize: 10 }}>From</div>
          <div style={{ fontWeight: 700 }}>{s.shipperName}</div>
          <div>{s.pickupAddress ?? s.originCity}</div>
          <div className="mt-2 grid grid-cols-3 gap-1" style={{ fontSize: 10.5 }}>
            <div>
              Weight
              <br />
              <b>{kg(s.weightKg)}</b>
            </div>
            <div>
              Pieces
              <br />
              <b>{s.packages}</b>
            </div>
            <div>
              Booked
              <br />
              <b>{dateOnly(s.createdAt)}</b>
            </div>
          </div>
          {s.ewaybillNo && <div className="mt-1">E-way bill {s.ewaybillNo}</div>}
        </div>
        <div className="text-center">
          <QR text={`${PUBLIC_URL}/track/${s.awb}`} size={78} />
          <div style={{ fontSize: 9, marginTop: 2 }}>Scan to track</div>
        </div>
      </div>
      <footer className="mt-auto border-t border-[#111] px-3 py-1.5 text-center" style={{ fontSize: 9.5 }}>
        Share the delivery OTP only when the parcel is in your hands.{phone ? ` Questions: ${phone}.` : ''}
      </footer>
    </article>
  );
}

const LABEL_PAGE = `@media print { @page { size: 100mm 150mm; margin: 0 } }`;

export function PrintLabel() {
  const { id } = useParams();
  const { org } = useAuth();
  const { data: s } = useApi<ShipmentDetailResp>(`/api/shipments/${id}`);
  if (!s) return <Loading />;
  return (
    <PrintShell title={`Label ${s.awb}`}>
      <style>{LABEL_PAGE}</style>
      <LabelCard s={s} orgName={org?.name ?? 'SurajLogistic'} phone={org?.settings.profile?.phone} />
    </PrintShell>
  );
}

/** Many labels at once, one per page — after a sheet upload. */
export function PrintLabels() {
  const [sp] = useSearchParams();
  const { org } = useAuth();
  const ids = (sp.get('ids') ?? '').split(',').filter(Boolean).slice(0, 500);
  const [list, setList] = useState<ShipmentDetailResp[] | null>(null);
  const key = ids.join(',');
  useEffect(() => {
    let live = true;
    Promise.all(key.split(',').filter(Boolean).map((i) => api.get<ShipmentDetailResp>(`/api/shipments/${i}`)))
      .then((r) => live && setList(r))
      .catch(() => live && setList([]));
    return () => {
      live = false;
    };
  }, [key]);
  if (!list) return <Loading />;
  return (
    <PrintShell title={`${list.length} labels`}>
      <style>{LABEL_PAGE}</style>
      {list.map((s) => (
        <LabelCard key={s.id} s={s} orgName={org?.name ?? 'SurajLogistic'} phone={org?.settings.profile?.phone} />
      ))}
    </PrintShell>
  );
}

const COPIES = ['Consignor copy', 'Consignee copy', 'Driver copy', 'Office copy'];

/** Consignment note (lorry receipt / bilty) for road transport, A4. */
export function PrintLR() {
  const { id } = useParams();
  const { org } = useAuth();
  const { data: s } = useApi<ShipmentDetailResp & { trip: (ShipmentDetailResp['trip'] & { regNo?: string }) | null }>(`/api/shipments/${id}`);
  const [copy, setCopy] = useState(COPIES[0]!);
  if (!s) return <Loading />;
  const p = org?.settings.profile;
  const taxable = s.priceBreakup.reduce((a, l) => a + l.amount, 0);
  const gst = s.price - taxable;
  const box = 'border border-[#333] px-2.5 py-1.5';
  return (
    <PrintShell
      title={`Consignment note ${s.awb}`}
      controls={
        <Select aria-label="Copy" value={copy} onChange={(e) => setCopy(e.target.value)} className="!h-9 !w-auto">
          {COPIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
      }
    >
      <style>{`@media print { @page { size: A4; margin: 10mm } }`}</style>
      <article className="paper mx-auto max-w-[200mm] p-6 text-[12.5px] leading-snug" style={{ boxShadow: '0 1px 3px rgb(0 0 0 / 0.15)' }}>
        <header className="flex items-start justify-between gap-4 border-b-2 border-[#111] pb-3">
          <div className="flex gap-3">
            <Mark size={52} />
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.1 }}>{org?.name}</div>
              <div style={{ fontSize: 11, color: '#c2410c', fontWeight: 600, marginBottom: 3 }}>{BRAND.line}</div>
              <div>{p?.address ?? 'Address not set: add it in Settings, Company'}</div>
              <div>
                {[p?.phone && `Phone ${p.phone}`, org?.gstin && `GSTIN ${org.gstin}`].filter(Boolean).join(', ')}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div style={{ fontSize: 17, fontWeight: 700 }}>Consignment note</div>
            <div className="text-[#555]">{copy}</div>
            <div className="mt-1" style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.06em' }}>
              {s.awb}
            </div>
            <div>Date {dateOnly(s.createdAt)}</div>
          </div>
        </header>

        <div className="mt-3 grid grid-cols-2 gap-0">
          <div className={box}>
            <div className="text-[#555]">From</div>
            <b style={{ fontSize: 15 }}>{s.originCity}</b>
          </div>
          <div className={`${box} border-l-0`}>
            <div className="text-[#555]">To</div>
            <b style={{ fontSize: 15 }}>{s.destCity}</b>
          </div>
          <div className={`${box} border-t-0`}>
            <div className="text-[#555]">Consignor</div>
            <b>{s.shipperName}</b>
            <div>{s.pickupAddress ?? s.originCity}</div>
            {s.shipperPhone && <div>{s.shipperPhone}</div>}
          </div>
          <div className={`${box} border-t-0 border-l-0`}>
            <div className="text-[#555]">Consignee</div>
            <b>{s.consigneeName}</b>
            <div>{s.consigneeAddress}</div>
            <div>{s.consigneePhone}</div>
          </div>
        </div>

        <table className="mt-3 w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="bg-[#f1f1ee]">
              {['Packages', 'Said to contain', 'Actual weight', 'Value of goods', 'Freight'].map((h) => (
                <th key={h} className="border border-[#333] px-2 py-1.5 text-left font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-[#333] px-2 py-2 align-top">{s.packages}</td>
              <td className="border border-[#333] px-2 py-2 align-top">{s.contents ?? 'General goods'}</td>
              <td className="border border-[#333] px-2 py-2 align-top">{kg(s.weightKg)}</td>
              <td className="border border-[#333] px-2 py-2 align-top">{inr(s.declaredValue)}</td>
              <td className="border border-[#333] px-2 py-2 align-top">
                {s.priceBreakup.map((l) => (
                  <div key={l.code} className="flex justify-between gap-3">
                    <span>{l.label}</span>
                    <span>{inr(l.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between gap-3">
                  <span>GST {s.gstRate}%</span>
                  <span>{inr(gst)}</span>
                </div>
                <div className="mt-1 flex justify-between gap-3 border-t border-[#333] pt-1 font-bold">
                  <span>Total</span>
                  <span>{inr(s.price)}</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <div className="mt-3 grid grid-cols-3 gap-0">
          <div className={box}>
            <div className="text-[#555]">Freight</div>
            <b>{PAYMENT_LABEL[s.paymentMode] ?? s.paymentMode}</b>
            {s.paymentMode === 'COD' && <div>Collect {inr(s.codAmount)} for consignor</div>}
          </div>
          <div className={`${box} border-l-0`}>
            <div className="text-[#555]">Vehicle</div>
            <b>{s.trip?.regNo ?? 'To be assigned'}</b>
            {s.trip && <div>Trip {s.trip.tripNo}</div>}
          </div>
          <div className={`${box} border-l-0`}>
            <div className="text-[#555]">E-way bill</div>
            <b>{s.ewaybillNo ?? (s.ewaybillRequired ? 'Required' : 'Not required')}</b>
            {s.shipperInvoiceNo && <div>Invoice {s.shipperInvoiceNo}</div>}
          </div>
        </div>

        <p className="mt-3 text-[11.5px] text-[#444]">
          Goods are carried at owner's risk unless insured. GST on freight is shown at the rate set in the transporter's settings; who pays it under forward or reverse charge depends on the consignor's registration. Delivery against OTP sent to the consignee's mobile. Expected by {dt(s.promisedAt)}.
        </p>

        <div className="mt-10 grid grid-cols-3 gap-6 text-center text-[12px]">
          {['Consignor signature', 'Driver signature', `For ${org?.name ?? 'transporter'}`].map((t) => (
            <div key={t} className="border-t border-[#333] pt-1.5">
              {t}
            </div>
          ))}
        </div>
        <div className="mt-6 flex items-center justify-between">
          <Barcode value={s.awb} height={34} width={1.4} />
          <span className="text-[11px] text-[#555]">Track at {PUBLIC_URL.replace(/^https?:\/\//, '')}/track/{s.awb}</span>
        </div>
        <BrandFooter />
      </article>
    </PrintShell>
  );
}

interface InvoiceView {
  id: string;
  invoiceNo: string;
  customerName: string;
  customerGstin: string | null;
  customerCity?: string | null;
  customerAddress?: string | null;
  subtotal: number;
  gst: number;
  total: number;
  status: string;
  dueDate: string;
  createdAt: string;
  lines: { awb: string; service: string; lane: string; weightKg: number; gstRate: number; taxable: number; total: number; deliveredAt: string }[];
}

/** GST tax invoice, A4, with a UPI QR for payment when a UPI ID is set. */
export function PrintInvoice() {
  const { id } = useParams();
  const { org } = useAuth();
  const { data: inv } = useApi<InvoiceView>(`/api/invoices/${id}`);
  if (!inv) return <Loading />;
  const p = org?.settings.profile;
  const bank = org?.settings.bank;
  const supplierState = p?.city ? findCity(p.city)?.state : undefined;
  const supplyState = inv.customerCity ? findCity(inv.customerCity)?.state : undefined;
  const interState = supplierState && supplyState ? supplierState !== supplyState : false;
  const rates = [...new Set(inv.lines.map((l) => l.gstRate))];
  const upi = bank?.upi ? `upi://pay?pa=${encodeURIComponent(bank.upi)}&pn=${encodeURIComponent(org?.name ?? '')}&am=${inv.total}&cu=INR&tn=${encodeURIComponent(`Invoice ${inv.invoiceNo}`)}` : null;
  const cell = 'border border-[#333] px-2 py-1.5';
  return (
    <PrintShell title={`Invoice ${inv.invoiceNo}`}>
      <style>{`@media print { @page { size: A4; margin: 10mm } }`}</style>
      <article className="paper mx-auto max-w-[200mm] p-7 text-[12.5px] leading-snug" style={{ boxShadow: '0 1px 3px rgb(0 0 0 / 0.15)' }}>
        <header className="flex items-start justify-between gap-4 border-b-2 border-[#111] pb-3">
          <div className="flex gap-3">
            <Mark size={52} />
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.1 }}>{org?.name}</div>
              <div style={{ fontSize: 11, color: '#c2410c', fontWeight: 600, marginBottom: 3 }}>{BRAND.line}</div>
              <div>{p?.address ?? 'Address not set: add it in Settings, Company'}</div>
              <div>{[p?.phone, p?.email].filter(Boolean).join(', ')}</div>
              <div className="font-semibold">GSTIN {org?.gstin ?? 'not set'}</div>
            </div>
          </div>
          <div className="text-right">
            <div style={{ fontSize: 19, fontWeight: 720 }}>Tax invoice</div>
            <div className="mt-1 font-semibold">{inv.invoiceNo}</div>
            <div>Date {dateOnly(inv.createdAt)}</div>
            <div>Due {dateOnly(inv.dueDate)}</div>
          </div>
        </header>
        <div className="mt-3 grid grid-cols-2 gap-6">
          <div>
            <div className="text-[#555]">Bill to</div>
            <b style={{ fontSize: 14 }}>{inv.customerName}</b>
            {inv.customerAddress && <div>{inv.customerAddress}</div>}
            {inv.customerCity && <div>{inv.customerCity}</div>}
            <div>GSTIN {inv.customerGstin ?? 'Unregistered'}</div>
          </div>
          <div>
            <div className="text-[#555]">Place of supply</div>
            <b>{supplyState ?? inv.customerCity ?? 'Not known'}</b>
            <div className="mt-1 text-[#555]">Reverse charge</div>
            <b>No</b>
          </div>
        </div>

        <table className="mt-4 w-full border-collapse">
          <thead>
            <tr className="bg-[#f1f1ee] text-left">
              {['#', 'AWB / LR', 'Service', 'SAC', 'Lane', 'Delivered', 'Taxable value', 'GST', 'Amount'].map((h, i) => (
                <th key={h} className={`${cell} font-semibold ${i >= 6 ? 'text-right' : ''}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l, i) => (
              <tr key={l.awb}>
                <td className={cell}>{i + 1}</td>
                <td className={cell}>{l.awb}</td>
                <td className={cell}>{svc(l.service)}</td>
                <td className={cell}>{l.service === 'COURIER' ? '996812' : '996791'}</td>
                <td className={cell}>{l.lane}</td>
                <td className={cell}>{dateOnly(l.deliveredAt)}</td>
                <td className={`${cell} text-right`}>{inr(l.taxable)}</td>
                <td className={`${cell} text-right`}>
                  {inr(l.total - l.taxable)} <span className="text-[#555]">({l.gstRate}%)</span>
                </td>
                <td className={`${cell} text-right`}>{inr(l.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-3 flex flex-wrap justify-between gap-6">
          <div className="max-w-[60%]">
            <div className="text-[#555]">Amount in words</div>
            <b>{inrWords(inv.total)}</b>
            {bank && (bank.account || bank.upi) && (
              <div className="mt-3 flex gap-3">
                {upi && <QR text={upi} size={86} />}
                <div>
                  <div className="text-[#555]">Pay to</div>
                  {bank.name && <div>{bank.name}</div>}
                  {bank.account && <div>Account {bank.account}</div>}
                  {bank.ifsc && <div>IFSC {bank.ifsc}</div>}
                  {bank.upi && <div>UPI {bank.upi}</div>}
                </div>
              </div>
            )}
          </div>
          <table className="min-w-[230px] self-start border-collapse">
            <tbody>
              <tr>
                <td className="py-0.5 pr-4 text-[#555]">Taxable value</td>
                <td className="py-0.5 text-right">{inr(inv.subtotal)}</td>
              </tr>
              {interState ? (
                <tr>
                  <td className="py-0.5 pr-4 text-[#555]">IGST</td>
                  <td className="py-0.5 text-right">{inr(inv.gst)}</td>
                </tr>
              ) : (
                <>
                  <tr>
                    <td className="py-0.5 pr-4 text-[#555]">CGST</td>
                    <td className="py-0.5 text-right">{inr(Math.round(inv.gst / 2))}</td>
                  </tr>
                  <tr>
                    <td className="py-0.5 pr-4 text-[#555]">SGST</td>
                    <td className="py-0.5 text-right">{inr(inv.gst - Math.round(inv.gst / 2))}</td>
                  </tr>
                </>
              )}
              <tr className="border-t-2 border-[#111] font-bold">
                <td className="pt-1 pr-4">Total</td>
                <td className="pt-1 text-right" style={{ fontSize: 15 }}>
                  {inr(inv.total)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-5 text-[11px] text-[#555]">
          GST at {rates.join('% and ')}% as charged at booking. {interState ? 'Supply between states: IGST.' : supplierState ? 'Supply within the state: CGST and SGST.' : 'Set your company city in Settings to split CGST/SGST or IGST correctly.'} Confirm rates and reverse-charge treatment with your CA.
        </p>
        <div className="mt-10 flex justify-end">
          <div className="min-w-[200px] border-t border-[#333] pt-1.5 text-center">For {org?.name}, authorised signatory</div>
        </div>
        <BrandFooter />
      </article>
    </PrintShell>
  );
}
