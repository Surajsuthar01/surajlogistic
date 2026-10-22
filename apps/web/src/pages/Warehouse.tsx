import type { FacilityRec, InventoryItemRec, StockMoveType } from '@suraj/core';
import { ArrowDownToLine, ArrowUpFromLine, Search } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Empty, ErrorNote, Field, Input, Loading, Modal, PageHeader, Panel } from '../components/ui';
import { api } from '../lib/api';
import { ago } from '../lib/format';
import { useAction, useApi } from '../lib/hooks';

type Item = InventoryItemRec & { lowStock: boolean };

export function Warehouse() {
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const { data: facilities } = useApi<FacilityRec[]>('/api/facilities');
  const items = useApi<Item[]>(`/api/inventory${term ? `?q=${encodeURIComponent(term)}` : ''}`, { liveTypes: ['stock.moved'] });
  const [move, setMove] = useState<{ item: Item; type: StockMoveType } | null>(null);
  const list = (items.data ?? []).filter((i) => !lowOnly || i.lowStock);
  const low = (items.data ?? []).filter((i) => i.lowStock).length;
  const wh = facilities?.filter((f) => f.type === 'WAREHOUSE') ?? [];
  const clients = new Set((items.data ?? []).map((i) => i.clientName));

  return (
    <div>
      <PageHeader title="Warehouse" sub={`${wh.map((w) => w.name).join(', ') || 'Warehouse'} · ${items.data?.length ?? 0} SKUs for ${clients.size} clients · ${low} below reorder level`} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form
          className="relative min-w-[220px] flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            setTerm(q.trim());
          }}
        >
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <Input id="wh-search" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => setTerm(q.trim())} placeholder="SKU, product or client" className="pl-9" />
        </form>
        <label className="inline-flex items-center gap-2 text-[14px]">
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Only low stock
        </label>
      </div>
      <Panel bodyClass="p-0">
        {!items.data ? (
          <Loading />
        ) : !list.length ? (
          <Empty title="No items match" />
        ) : (
          <div className="scroll-x">
            <table className="data">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product</th>
                  <th>Client</th>
                  <th>Bin</th>
                  <th>On hand</th>
                  <th>Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((i) => {
                  const ratio = Math.min(1, i.qty / Math.max(1, i.reorderLevel * 3));
                  return (
                    <tr key={i.id}>
                      <td className="awb whitespace-nowrap text-[13.5px]">{i.sku}</td>
                      <td className="min-w-[200px]">{i.name}</td>
                      <td className="text-[13.5px] text-muted">{i.clientName}</td>
                      <td className="num">{i.bin}</td>
                      <td className="min-w-[150px]">
                        <div className="flex items-center gap-2">
                          <span className="num font-medium">
                            {i.qty.toLocaleString('en-IN')} {i.unit}
                          </span>
                          {i.lowStock && <Badge tone="warn">Reorder</Badge>}
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-panel-2">
                          <div className="h-1.5 rounded-full" style={{ width: `${ratio * 100}%`, background: i.lowStock ? 'var(--warn)' : 'var(--route)' }} />
                        </div>
                        <div className="mt-0.5 text-[12px] text-muted">reorder at {i.reorderLevel}</div>
                      </td>
                      <td className="text-[13px] whitespace-nowrap text-muted">{ago(i.updatedAt)}</td>
                      <td className="text-right whitespace-nowrap">
                        <Button size="sm" variant="ghost" onClick={() => setMove({ item: i, type: 'INBOUND' })}>
                          <ArrowDownToLine size={15} /> Receive
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setMove({ item: i, type: 'OUTBOUND' })}>
                          <ArrowUpFromLine size={15} /> Dispatch
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <MoveModal move={move} onClose={() => setMove(null)} onDone={() => (setMove(null), void items.reload())} />
    </div>
  );
}

function MoveModal({ move, onClose, onDone }: { move: { item: Item; type: StockMoveType } | null; onClose: () => void; onDone: () => void }) {
  const [qty, setQty] = useState('');
  const [ref, setRef] = useState('');
  const act = useAction();
  if (!move) return null;
  const inbound = move.type === 'INBOUND';
  return (
    <Modal open onClose={onClose} title={`${inbound ? 'Receive' : 'Dispatch'} · ${move.item.sku}`}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void act.run(async () => {
            await api.post(`/api/inventory/${move.item.id}/move`, { type: move.type, qty: Number(qty), ref: ref || undefined });
            setQty('');
            setRef('');
            onDone();
          });
        }}
      >
        <p className="text-[14.5px] text-muted">
          {move.item.name} · {move.item.qty.toLocaleString('en-IN')} {move.item.unit} on hand in bin {move.item.bin}
        </p>
        <Field label={`Quantity (${move.item.unit})`} htmlFor="mv-qty">
          <Input id="mv-qty" type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} required />
        </Field>
        <Field label={inbound ? 'GRN / invoice number' : 'Order number'} htmlFor="mv-ref">
          <Input id="mv-ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder={inbound ? 'GRN-2301' : 'SO-4120'} />
        </Field>
        <ErrorNote>{act.error}</ErrorNote>
        <Button variant="primary" type="submit" disabled={act.busy}>
          {inbound ? 'Receive stock' : 'Dispatch stock'}
        </Button>
      </form>
    </Modal>
  );
}
