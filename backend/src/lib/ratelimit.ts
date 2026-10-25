/**
 * Fixed-window counters kept in memory. Enough for one API instance; with several
 * instances behind a load balancer, keep the counts in Redis instead.
 */
export function limiter(max: number, windowMs: number) {
  const hits = new Map<string, { n: number; reset: number }>();
  let sweep = Date.now() + windowMs;
  return {
    /** Counts one attempt; false means the caller has used up the window. */
    hit(key: string): boolean {
      const now = Date.now();
      if (now > sweep) {
        for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
        sweep = now + windowMs;
      }
      const cur = hits.get(key);
      if (!cur || cur.reset < now) {
        hits.set(key, { n: 1, reset: now + windowMs });
        return true;
      }
      cur.n += 1;
      return cur.n <= max;
    },
    /** Seconds until the key may try again. */
    retryAfter(key: string): number {
      const cur = hits.get(key);
      return cur ? Math.max(1, Math.ceil((cur.reset - Date.now()) / 1000)) : 0;
    },
    reset(key: string) {
      hits.delete(key);
    },
  };
}
