import "server-only";

/**
 * Fixed-window request limits, kept in this server's memory: enough for one instance (and to stop
 * a runaway script); a multi-instance deploy would move this to a shared store.
 */
const windows = new Map<string, { start: number; count: number }>();
const MAX_KEYS = 50_000;

/** True when `key` is still under `limit` requests in the current `windowMs`; counts this one. */
export function allow(key: string, limit: number, windowMs = 60_000) {
  const now = Date.now();
  const w = windows.get(key);
  if (!w || now - w.start >= windowMs) {
    if (windows.size >= MAX_KEYS) evict(now, windowMs);
    windows.delete(key); // re-insert: the map stays in window-start order for eviction
    windows.set(key, { start: now, count: 1 });
    return true;
  }
  w.count++;
  return w.count <= limit;
}

/** Drops expired windows; if a flood of fresh keys keeps the map full, the oldest go first. */
function evict(now: number, windowMs: number) {
  for (const [key, w] of windows) if (now - w.start >= windowMs) windows.delete(key);
  for (const key of windows.keys()) {
    if (windows.size < MAX_KEYS * 0.9) break;
    windows.delete(key);
  }
}

/**
 * Concurrent work per key (e.g. uploads being held in memory): `enter` says whether another may
 * start, and the caller must call the returned `leave` when it's done.
 */
const running = new Map<string, number>();
export function enter(key: string, max: number): (() => void) | null {
  const n = running.get(key) ?? 0;
  if (n >= max) return null;
  running.set(key, n + 1);
  return () => {
    const left = (running.get(key) ?? 1) - 1;
    if (left > 0) running.set(key, left);
    else running.delete(key);
  };
}

/**
 * The caller's address. X-Forwarded-For is written by whoever sent the request, so it is only used
 * behind a proxy we know appends to it: TRUSTED_PROXY_HOPS=1 takes the address that proxy saw
 * (the last entry). Without a proxy setting every caller shares one bucket, which is right for a
 * local, single-user install and safe (never looser) anywhere else.
 */
export function clientIp(headers: Headers) {
  const hops = Number(process.env.TRUSTED_PROXY_HOPS) || 0;
  if (hops <= 0) return "direct";
  const chain = (headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return chain[chain.length - hops] ?? "direct";
}
