import type { FacilityRec, InventoryItemRec, StockMoveRec, StockMoveType } from '@suraj/shared';
import { ArrowDownToLine, ArrowUpFromLine, Download, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Check, Drawer, Empty, ErrorNote, Field, Input, Loading, Modal, PageHeader, Progress, Select, useToast } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ago, dt } from '../lib/format';
import { downloadXlsx } from '../lib/xlsx';
import { useAction, useApi } from '../lib/hooks';
import { cityNames } from './NewShipment';

type Item = InventoryItemRec & { lowStock: boolean };
const MOVE_LABEL: Record<StockMoveType, string> = { INBOUND: 'Received', OUTBOUND: 'Dispatched', ADJUST: 'Count corrected' };

export function Warehouse() {
  const [sp] = useSearchParams();
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [lowOnly, setLowOnly] = useState(sp.get('low') === '1');
  const { data: facilities, reload: reloadFac } = useApi<FacilityRec[]>('/api/facilities');
  const wh = facilities?.filter((f) => f.type === 'WAREHOUSE') ?? [];
  const [fac, setFac] = useState('');
  useEffect(() => {
    if (!fac && wh[0]) setFac(wh[0].id);
  }, [wh, fac]);
  const params = new URLSearchParams();
  if (term) params.set('q', term);
  if (fac) params.set('facilityId', fac);
  const items = useApi<Item[]>(fac || (facilities && !wh.length) ? `/api/inventory?${params}` : null, { liveTypes: ['stock.moved'] });
  const [move, setMove] = useState<{ item: Item; type: StockMoveType } | null>(null);
  const [history, setHistory] = useState<Item | null>(null);
  const [addItem, setAddItem] = useState(false);
  const [addWh, setAddWh] = useState(false);
  const toast = useToast();
  const list = (items.data ?? []).filter((i) => !lowOnly || i.lowStock);
  const low = (items.data ?? []).filter((i) => i.lowStock).length;
  const clients = new Set((items.data ?? []).map((i) => i.clientName));
  const current = wh.find((w) => w.id === fac);
  const canAddWh = user?.role === 'admin' || user?.role === 'ops';

  if (facilities && wh.length === 0)
    return (
      <div>
        <PageHeader title="Warehouse" />
        <div className="sheet">
          <Empty title="No warehouse set up" action={canAddWh ? <Button variant="primary" onClick={() => setAddWh(true)}>Add a warehouse</Button> : undefined}>
            Add the godown you run for clients. Then add each client's products with their bin and reorder level.
          </Empty>
        </div>
        <AddFacility open={addWh} onClose={() => setAddWh(false)} onDone={(id) => (setAddWh(false), void reloadFac(), setFac(id))} />
      </div>
    );

  return (
    <div>
      <PageHeader
        title="Warehouse"
        sub={items.data ? `${items.data.length} products for ${clients.size} ${clients.size === 1 ? 'client' : 'clients'}. ${low ? `${low} below the reorder level.` : 'Nothing below the reorder level.'}` : undefined}
        actions={
          <>
            {canAddWh && <Button onClick={() => setAddWh(true)}>Add warehouse</Button>}
            <Button variant="primary" onClick={() => setAddItem(true)} disabled={!fac}>
              <Plus size={17} /> Add product
            </Button>
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {wh.length > 1 && (
          <Select id="wh-fac" aria-label="Warehouse" value={fac} onChange={(e) => setFac(e.target.value)} className="!w-auto">
            {wh.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        )}
        {wh.length === 1 && current && <span className="mr-2 text-[15px] font-[560]">{current.name}</span>}
        <form
          className="relative min-w-[220px] flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            setTerm(q.trim());
          }}
        >
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
          <input id="wh-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => setTerm(q.trim())} placeholder="SKU, product or client" aria-label="Search stock" className="h-11 w-full rounded-full border border-line bg-sheet-2 pr-4 pl-10 text-[15px] placeholder:text-faint transition-colors hover:border-line-strong focus:border-accent focus:bg-sheet focus:outline-none focus:ring-4 focus:ring-sign/15" />
        </form>
        <div className="px-1">
          <Check id="wh-low" checked={lowOnly} onChange={setLowOnly} label="Only low stock" />
        </div>
        <Button variant="ghost" onClick={() => downloadXlsx(`stock-${new Date().toISOString().slice(0, 10)}.xlsx`, 'Warehouse stock', [['SKU', 'Product', 'Client', 'Bin', 'Quantity', 'Unit', 'Reorder level', 'Updated'], ...(items.data ?? []).map((i) => [i.sku, i.name, i.clientName, i.bin, i.qty, i.unit, i.reorderLevel, i.updatedAt])])}>
          <Download size={16} /> Excel
        </Button>
      </div>
      <div className="sheet">
        {!items.data ? (
          <Loading rows={6} />
        ) : !list.length ? (
          <Empty title={items.data.length ? 'Nothing matches' : 'No products yet'} action={!items.data.length ? <Button variant="primary" onClick={() => setAddItem(true)}>Add a product</Button> : undefined}>
            {items.data.length ? 'Clear the search or the low-stock filter.' : 'Add each product you hold for a client, with its bin and the level at which you should ask them to restock.'}
          </Empty>
        ) : (
          <div className="scroll-x">
            <table className="data">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product</th>
                  <th>Client</th>
                  <th>Bin</th>
                  <th className="min-w-[170px]">On hand</th>
                  <th>Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((i) => {
                  const ratio = Math.min(1, i.qty / Math.max(1, i.reorderLevel * 3));
                  return (
                    <tr key={i.id}>
                      <td className="awb whitespace-nowrap text-[14px]">
                        <button type="button" onClick={() => setHistory(i)} className="hover:underline">
                          {i.sku}
                        </button>
                      </td>
                      <td className="min-w-[200px]">{i.name}</td>
                      <td className="text-[14px] text-muted">{i.clientName}</td>
                      <td>
                        <span className="num rounded-[4px] border border-line-strong bg-sheet-2 px-1.5 py-0.5 text-[13.5px]">{i.bin}</span>
                      </td>
                      <td>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="num font-[600]">
                            {i.qty.toLocaleString('en-IN')} <span className="font-normal text-muted">{i.unit}</span>
                          </span>
                          {i.lowStock && <span className="text-[13px] font-[560] text-warn">Reorder</span>}
                        </div>
                        <div className="mt-1">
                          <Progress value={ratio * 100} tone={i.lowStock ? 'warn' : 'go'} height={5} />
                        </div>
                        <div className="mt-0.5 text-[12.5px] text-muted">reorder at {i.reorderLevel.toLocaleString('en-IN')}</div>
                      </td>
                      <td className="text-[13.5px] whitespace-nowrap text-muted">{ago(i.updatedAt)}</td>
                      <td className="text-right whitespace-nowrap">
                        <Button size="sm" variant="ghost" onClick={() => setMove({ item: i, type: 'INBOUND' })}>
                          <ArrowDownToLine size={15} /> Receive
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setMove({ item: i, type: 'OUTBOUND' })}>
                          <ArrowUpFromLine size={15} /> Dispatch
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setMove({ item: i, type: 'ADJUST' })} aria-label={`Correct count for ${i.sku}`}>
                          <SlidersHorizontal size={15} />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <MoveModal move={move} onClose={() => setMove(null)} onDone={(t) => (setMove(null), void items.reload(), toast(t))} />
      <HistoryDrawer item={history} onClose={() => setHistory(null)} />
      <AddItem open={addItem} facilityId={fac} onClose={() => setAddItem(false)} onDone={() => (setAddItem(false), void items.reload(), toast('Product added'))} />
      <AddFacility open={addWh} onClose={() => setAddWh(false)} onDone={(id) => (setAddWh(false), void reloadFac(), setFac(id))} />
    </div>
  );
}

function MoveModal({ move, onClose, onDone }: { move: { item: Item; type: StockMoveType } | null; onClose: () => void; onDone: (msg: string) => void }) {
  const [qty, setQty] = useState('');
  const [ref, setRef] = useState('');
  const act = useAction();
  if (!move) return null;
  const { item, type } = move;
  const title = type === 'INBOUND' ? 'Receive stock' : type === 'OUTBOUND' ? 'Dispatch stock' : 'Correct the count';
  const n = Number(qty) || 0;
  const after = type === 'INBOUND' ? item.qty + n : type === 'OUTBOUND' ? item.qty - n : n;
  return (
    <Modal
      open
      onClose={onClose}
      title={`${title}, ${item.sku}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="move-form" disabled={act.busy || !qty || after < 0}>
            {title}
          </Button>
        </>
      }
    >
      <form
        id="move-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void act.run(async () => {
            await api.post(`/api/inventory/${item.id}/move`, { type, qty: type === 'ADJUST' ? after - item.qty : n, ref: ref || undefined });
            setQty('');
            setRef('');
            onDone(`${item.sku}: ${after.toLocaleString('en-IN')} ${item.unit} on hand`);
          });
        }}
      >
        <p className="text-[15px] text-muted">
          {item.name}. {item.qty.toLocaleString('en-IN')} {item.unit} in bin {item.bin} now.
        </p>
        <Field label={type === 'ADJUST' ? `Counted on the shelf (${item.unit})` : `Quantity (${item.unit})`} htmlFor="mv-qty">
          <Input id="mv-qty" type="number" min={type === 'ADJUST' ? 0 : 1} value={qty} onChange={(e) => setQty(e.target.value)} required />
        </Field>
        <Field label={type === 'INBOUND' ? 'GRN or supplier invoice number' : type === 'OUTBOUND' ? 'Order or AWB number' : 'Reason'} htmlFor="mv-ref">
          <Input id="mv-ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder={type === 'INBOUND' ? 'GRN-2301' : type === 'OUTBOUND' ? 'SO-4120' : 'Cycle count'} />
        </Field>
        {qty && (
          <p className={`text-[15px] ${after < 0 ? 'text-bad' : ''}`}>
            {after < 0 ? `Only ${item.qty} ${item.unit} in stock.` : `After this: ${after.toLocaleString('en-IN')} ${item.unit}.`}
          </p>
        )}
        <ErrorNote>{act.error}</ErrorNote>
      </form>
    </Modal>
  );
}

function HistoryDrawer({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const { data } = useApi<StockMoveRec[]>(item ? `/api/inventory/${item.id}/moves` : null);
  return (
    <Drawer open={!!item} onClose={onClose} title={item ? `${item.sku} history` : ''}>
      {item && (
        <>
          <p className="text-[15px]">{item.name}</p>
          <p className="text-[14px] text-muted">
            {item.clientName}, bin {item.bin}. {item.qty.toLocaleString('en-IN')} {item.unit} on hand.
          </p>
          {!data ? (
            <Loading />
          ) : data.length === 0 ? (
            <p className="mt-4 text-[14.5px] text-muted">No movements recorded yet.</p>
          ) : (
            <ol className="mt-4 divide-y divide-line rounded-[12px] border border-line">
              {data.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span>
                    <span className="block text-[14.5px]">{MOVE_LABEL[m.type]}</span>
                    <span className="block text-[13px] text-muted">
                      {dt(m.at)}
                      {m.ref ? `, ${m.ref}` : ''}
                    </span>
                  </span>
                  <span className={`num font-[600] ${m.qty < 0 ? 'text-bad' : 'text-go'}`}>
                    {m.qty > 0 ? '+' : ''}
                    {m.qty.toLocaleString('en-IN')}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </Drawer>
  );
}

function AddItem({ open, facilityId, onClose, onDone }: { open: boolean; facilityId: string; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ sku: '', name: '', clientName: '', qty: '0', unit: 'pcs', bin: '', reorderLevel: '0' });
  const act = useAction();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a product"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="add-item" disabled={act.busy}>
            Add product
          </Button>
        </>
      }
    >
      <form
        id="add-item"
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void act.run(async () => {
            await api.post('/api/inventory', { facilityId, sku: f.sku, name: f.name, clientName: f.clientName, qty: Number(f.qty) || 0, unit: f.unit, bin: f.bin, reorderLevel: Number(f.reorderLevel) || 0 });
            setF({ sku: '', name: '', clientName: f.clientName, qty: '0', unit: 'pcs', bin: '', reorderLevel: '0' });
            onDone();
          });
        }}
      >
        <Field label="SKU" htmlFor="ai-sku">
          <Input id="ai-sku" value={f.sku} onChange={set('sku')} required className="uppercase" placeholder="ST-SAREE-012" />
        </Field>
        <Field label="Client" htmlFor="ai-client">
          <Input id="ai-client" value={f.clientName} onChange={set('clientName')} required placeholder="Shree Textiles" />
        </Field>
        <Field label="Product" htmlFor="ai-name" className="sm:col-span-2">
          <Input id="ai-name" value={f.name} onChange={set('name')} required />
        </Field>
        <Field label="Bin" htmlFor="ai-bin" hint="Rack and shelf, e.g. A-03-2">
          <Input id="ai-bin" value={f.bin} onChange={set('bin')} required className="uppercase" />
        </Field>
        <Field label="Unit" htmlFor="ai-unit">
          <Select id="ai-unit" value={f.unit} onChange={set('unit')}>
            {['pcs', 'boxes', 'bags', 'kg', 'cartons', 'rolls', 'pallets'].map((u) => (
              <option key={u}>{u}</option>
            ))}
          </Select>
        </Field>
        <Field label="Opening stock" htmlFor="ai-qty">
          <Input id="ai-qty" type="number" min="0" value={f.qty} onChange={set('qty')} />
        </Field>
        <Field label="Reorder level" htmlFor="ai-reorder" hint="We flag the product below this">
          <Input id="ai-reorder" type="number" min="0" value={f.reorderLevel} onChange={set('reorderLevel')} />
        </Field>
        <div className="sm:col-span-2">
          <ErrorNote>{act.error}</ErrorNote>
        </div>
      </form>
    </Modal>
  );
}

export function AddFacility({ open, onClose, onDone, type = 'WAREHOUSE' }: { open: boolean; onClose: () => void; onDone: (id: string) => void; type?: 'WAREHOUSE' | 'HUB' }) {
  const [f, setF] = useState({ code: '', name: '', city: 'Jaipur', capacitySqft: '' });
  const act = useAction();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={type === 'HUB' ? 'Add a hub' : 'Add a warehouse'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="add-fac" disabled={act.busy}>
            Add
          </Button>
        </>
      }
    >
      <form
        id="add-fac"
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void act.run(async () => {
            const r = await api.post<FacilityRec>('/api/facilities', { type, code: f.code, name: f.name, city: f.city, capacitySqft: Number(f.capacitySqft) || 0 });
            onDone(r.id);
          });
        }}
      >
        <Field label="Name" htmlFor="af-name" className="sm:col-span-2">
          <Input id="af-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required placeholder="Sitapura godown" />
        </Field>
        <Field label="Short code" htmlFor="af-code" hint="Printed on labels, e.g. JPR-W1">
          <Input id="af-code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} required minLength={2} maxLength={12} className="uppercase" />
        </Field>
        <Field label="City" htmlFor="af-city">
          <Select id="af-city" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })}>
            {cityNames.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Area (sq ft)" htmlFor="af-area">
          <Input id="af-area" type="number" min="0" value={f.capacitySqft} onChange={(e) => setF({ ...f, capacitySqft: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <ErrorNote>{act.error}</ErrorNote>
        </div>
      </form>
    </Modal>
  );
}
