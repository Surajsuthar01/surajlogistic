// One client for the whole app. In normal builds it calls the Fastify API; in the
// demo build (`vite build --mode demo`) every call is answered in the browser by
// demo-api.ts, which runs the same @suraj/shared engines on demo data.
import { ApiError } from './errors';

export { ApiError };

export const DEMO = import.meta.env.VITE_DEMO === '1';
// The in-browser demo server is loaded only by the demo build; real builds never download it.
const demo = DEMO ? import('./demo-api') : null;
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
  if (!DEMO && listeners.size) openSource();
}
export const getToken = () => token;

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (demo) return (await demo).demoRequest(method, path, body, token) as Promise<T>;
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, navigator.onLine === false ? 'No internet connection. Check your network and try again.' : 'Could not reach the server. Check your connection and try again.');
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Not JSON: a proxy error page while the backend restarts, for example.
    data = null;
  }
  if (!res.ok && !data && res.status >= 502 && res.status <= 504) {
    throw new ApiError(res.status, 'The server is restarting or busy. Try again in a minute.');
  }
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
  del: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body),
};

export interface LiveEvent {
  type: string;
  payload: Record<string, any>;
  at: string;
}

/*
  Live events: one shared Server-Sent Events connection per tab, however many screens
  listen (browsers allow only six connections per server over HTTP/1.1). In demo mode
  the in-browser simulator stands in.
*/
const listeners = new Set<(e: LiveEvent) => void>();
let source: EventSource | null = null;
let sourceToken: string | null = null;
const EVENT_TYPES = ['shipment.status', 'shipment.created', 'trip.ping', 'trip.status', 'load.created', 'load.bid', 'load.booked', 'stock.moved', 'invoice.updated'];

function openSource() {
  if (source && sourceToken === token) return;
  source?.close();
  source = null;
  if (!token) return;
  sourceToken = token;
  const es = new EventSource(`${BASE}/api/stream?token=${encodeURIComponent(token)}`);
  const handler = (ev: MessageEvent) => {
    try {
      const data = JSON.parse(ev.data);
      const e: LiveEvent = { type: data.type, payload: data.payload, at: data.at };
      listeners.forEach((l) => l(e));
    } catch {
      /* ignore a malformed event */
    }
  };
  EVENT_TYPES.forEach((t) => es.addEventListener(t, handler as EventListener));
  source = es;
}

export function subscribe(onEvent: (e: LiveEvent) => void): () => void {
  if (demo) {
    let off = () => {};
    let gone = false;
    void demo.then((d) => {
      if (!gone) off = d.demoSubscribe(onEvent);
    });
    return () => {
      gone = true;
      off();
    };
  }
  listeners.add(onEvent);
  openSource();
  return () => {
    listeners.delete(onEvent);
    if (!listeners.size) {
      source?.close();
      source = null;
      sourceToken = null;
    }
  };
}

export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.issues.length) return `${e.message}: ${e.issues.map((i) => `${i.path || 'field'} ${i.message.toLowerCase()}`).join('; ')}`;
    return e.message;
  }
  return e instanceof Error ? e.message : 'Something went wrong';
}
