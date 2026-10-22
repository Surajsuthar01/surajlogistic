import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorText, subscribe, type LiveEvent } from './api';

/** Fetch a GET endpoint; `reload()` refetches. Optional live refresh on matching events. */
export function useApi<T>(path: string | null, opts: { liveTypes?: string[]; debounceMs?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    if (!path) return;
    const my = ++seq.current;
    try {
      const d = await api.get<T>(path);
      if (my === seq.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (my === seq.current) setError(errorText(e));
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    setLoading(!!path);
    void reload();
  }, [reload, path]);

  const types = opts.liveTypes?.join(',');
  useEffect(() => {
    if (!types) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const set = new Set(types.split(','));
    const off = subscribe((e: LiveEvent) => {
      if (!set.has(e.type)) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void reload(), opts.debounceMs ?? 800);
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, [types, reload, opts.debounceMs]);

  return { data, error, loading, reload, setData };
}

/** Run a mutation with busy/error state. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(errorText(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run, setError };
}
