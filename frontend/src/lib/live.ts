import { useEffect, useRef, useState } from 'react';
import { api, subscribe, type LiveEvent } from './api';

/** One line for a live event, as the island and the activity feed show it. */
export function describeLive(e: LiveEvent): string {
  const p = e.payload;
  switch (e.type) {
    case 'trip.ping':
      return `${p.tripNo} at ${p.speedKmph} km/h, ${Math.round(p.progress * 100)}% of the way`;
    case 'shipment.status':
      return `${p.awb} is now ${String(p.status).replace(/_/g, ' ').toLowerCase()}`;
    case 'shipment.created':
      return `New booking ${p.awb}`;
    case 'trip.status':
      return `Trip ${p.tripNo ?? ''} ${p.status === 'IN_TRANSIT' ? 'started' : String(p.status).toLowerCase()}`;
    case 'load.booked':
      return `Load ${p.loadNo} given to a carrier`;
    case 'load.created':
      return `Load ${p.loadNo} posted`;
    case 'invoice.updated':
      return `Invoice ${p.invoiceNo ?? ''} ${String(p.status ?? '').toLowerCase()}`.replace(/\s+/g, ' ').trim();
    default:
      return e.type;
  }
}

/**
 * What the island shows: how many trucks are moving, and for a few seconds after
 * something happens, that thing. GPS pings are too frequent to announce.
 */
export function useIslandLive(enabled: boolean) {
  const [moving, setMoving] = useState<number | null>(null);
  const [flash, setFlash] = useState<{ text: string; tone: 'go' | 'bad' } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = () =>
      api
        .get<unknown[]>('/api/trips?status=IN_TRANSIT')
        .then((r) => alive && setMoving(r.length))
        .catch(() => undefined);
    void load();
    const off = subscribe((e) => {
      if (e.type === 'trip.ping') return;
      if (e.type === 'trip.status') void load();
      const bad = e.type === 'shipment.status' && ['NDR', 'RTO'].includes(String(e.payload.status));
      setFlash({ text: describeLive(e), tone: bad ? 'bad' : 'go' });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setFlash(null), 4200);
    });
    return () => {
      alive = false;
      off();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [enabled]);
  return { moving, flash };
}

/** True on screens wide enough for the full island. */
export function useWide(query = '(min-width: 1024px)') {
  const get = () => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches;
  const [wide, setWide] = useState(get);
  useEffect(() => {
    const m = window.matchMedia?.(query);
    if (!m) return;
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [query]);
  return wide;
}
