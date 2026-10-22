// One client for the whole app. In normal builds it calls the Fastify API; in the
// demo build (`vite build --mode demo`) every call is answered in the browser by
// demo-api.ts, which runs the same @suraj/core engines on demo data.
import { demoRequest, demoSubscribe } from './demo-api';
import { ApiError } from './errors';

export { ApiError };

export const DEMO = import.meta.env.VITE_DEMO === '1';
const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

const store = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string | null) {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* storage blocked: keep the token in memory only */
    }
  },
};

let token: string | null = store.get('sl_token');

export function setToken(t: string | null) {
  token = t;
  store.set('sl_token', t);
}
export const getToken = () => token;

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (DEMO) return demoRequest(method, path, body, token) as Promise<T>;
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401 && path !== '/api/auth/login') {
      setToken(null);
      window.dispatchEvent(new Event('sl:logout'));
    }
    throw new ApiError(res.status, data?.message ?? `Request failed (${res.status})`, data?.issues ?? []);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
};

export interface LiveEvent {
  type: string;
  payload: Record<string, any>;
  at: string;
}

/** Live control-tower events: Server-Sent Events from the API, or the in-browser simulator in demo mode. */
export function subscribe(onEvent: (e: LiveEvent) => void): () => void {
  if (DEMO) return demoSubscribe(onEvent);
  if (!token) return () => {};
  const es = new EventSource(`${BASE}/api/stream?token=${encodeURIComponent(token)}`);
  const types = ['shipment.status', 'shipment.created', 'trip.ping', 'trip.status', 'load.created', 'load.bid', 'load.booked', 'stock.moved'];
  const handler = (ev: MessageEvent) => {
    try {
      const data = JSON.parse(ev.data);
      onEvent({ type: data.type, payload: data.payload, at: data.at });
    } catch {
      /* ignore malformed event */
    }
  };
  types.forEach((t) => es.addEventListener(t, handler as EventListener));
  return () => es.close();
}

export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.issues.length) return `${e.message}: ${e.issues.map((i) => `${i.path || 'field'} ${i.message.toLowerCase()}`).join('; ')}`;
    return e.message;
  }
  return e instanceof Error ? e.message : 'Something went wrong';
}
