import { Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Plate, StatusMark } from './ui';

export interface SearchResults {
  shipments: { id: string; awb: string; lane: string; status: string; consigneeName: string }[];
  trips: { id: string; tripNo: string; lane: string; status: string; regNo: string }[];
  vehicles: { id: string; regNo: string; city: string; status: string }[];
  customers: { id: string; name: string; city: string }[];
}

interface Row {
  key: string;
  to: string;
  group: string;
  main: ReactNode;
  sub: string;
  status?: string;
}

/**
 * One box for AWB, trip, truck number or customer. Lives inside the island: the island
 * stretches into a search bar and the results open below it.
 */
export function GlobalSearch({ onDone, autoFocus }: { onDone?: () => void; autoFocus?: boolean }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [res, setRes] = useState<SearchResults | null>(null);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) setTimeout(() => input.current?.focus(), 40);
  }, [autoFocus]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setRes(null);
      return;
    }
    const t = setTimeout(() => {
      api
        .get<SearchResults>(`/api/search?q=${encodeURIComponent(term)}`)
        .then((r) => {
          setRes(r);
          setActive(0);
        })
        .catch(() => setRes(null));
    }, 160);
    return () => clearTimeout(t);
  }, [q]);

  const rows = useMemo<Row[]>(() => {
    if (!res) return [];
    return [
      ...res.shipments.map((s) => ({ key: `s${s.id}`, to: `/shipments/${s.id}`, group: 'Shipments', main: <span className="awb text-white">{s.awb}</span>, sub: `${s.lane}, ${s.consigneeName}`, status: s.status })),
      ...res.trips.map((t) => ({ key: `t${t.id}`, to: `/trips/${t.id}`, group: 'Trips', main: <span className="awb text-white">{t.tripNo}</span>, sub: `${t.lane}, ${t.regNo}`, status: t.status })),
      ...res.vehicles.map((v) => ({ key: `v${v.id}`, to: `/fleet?vehicle=${v.id}`, group: 'Vehicles', main: <Plate reg={v.regNo} size={12} />, sub: `Near ${v.city}`, status: v.status })),
      ...res.customers.map((c) => ({ key: `c${c.id}`, to: `/customers?open=${c.id}`, group: 'Customers', main: <span className="font-[560] text-white">{c.name}</span>, sub: c.city })),
    ];
  }, [res]);

  const go = (r: Row) => {
    nav(r.to);
    setQ('');
    onDone?.();
  };
  const term = q.trim();

  return (
    <div className="w-full">
      <div className="relative flex items-center">
        <Search size={17} className="pointer-events-none absolute left-1 text-white/55" />
        <input
          ref={input}
          id="global-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(rows.length - 1, a + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === 'Enter' && rows[active]) {
              e.preventDefault();
              go(rows[active]!);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onDone?.();
            }
          }}
          placeholder="Search AWB, trip, truck number or customer"
          aria-label="Search"
          autoComplete="off"
          className="h-10 w-full bg-transparent pr-9 pl-8 text-[15px] text-white placeholder:text-white/40 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        <button type="button" onClick={() => onDone?.()} aria-label="Close search" className="island-icon absolute right-0 !h-8 !w-8">
          <X size={16} />
        </button>
      </div>
      {term.length >= 2 && (
        <div className="mt-1 max-h-[56vh] overflow-y-auto border-t border-white/10 pt-2 pb-1" role="listbox">
          {!res ? (
            <p className="px-2 py-3 font-display font-[560] text-[13px] text-white/50">Searching</p>
          ) : rows.length === 0 ? (
            <p className="px-2 py-3 text-[14px] text-white/60">Nothing matches “{term}”. Try the last 4 digits of an AWB or a truck number like RJ14.</p>
          ) : (
            rows.map((r, i) => (
              <div key={r.key}>
                {(i === 0 || rows[i - 1]!.group !== r.group) && <p className="px-2 pt-2 pb-1 font-display font-[560] text-[12px] text-white/40">{r.group}</p>}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => go(r)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-center justify-between gap-3 rounded-[12px] px-2 py-2 text-left transition-colors ${i === active ? 'bg-white/[0.08]' : ''}`}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="shrink-0">{r.main}</span>
                    <span className="min-w-0 truncate text-[13.5px] text-white/55">{r.sub}</span>
                  </span>
                  {r.status && (
                    <span className="hidden shrink-0 text-white/80 sm:block">
                      <StatusMark status={r.status} className="!text-[12.5px]" />
                    </span>
                  )}
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
