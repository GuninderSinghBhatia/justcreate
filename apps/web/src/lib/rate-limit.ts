import "server-only";

/**
 * Fixed-window request limits, kept in this server's memory: enough for one instance (and to stop
 * a runaway script); a multi-instance deploy would move this to a shared store.
 */
const windows = new Map<string, { start: number; count: number }>();

/** True when `key` is still under `limit` requests in the current `windowMs`; counts this one. */
export function allow(key: string, limit: number, windowMs = 60_000) {
  const now = Date.now();
  const w = windows.get(key);
  if (!w || now - w.start >= windowMs) {
    if (windows.size > 10_000) sweep(now, windowMs);
    windows.set(key, { start: now, count: 1 });
    return true;
  }
  w.count++;
  return w.count <= limit;
}

function sweep(now: number, windowMs: number) {
  for (const [key, w] of windows) if (now - w.start >= windowMs) windows.delete(key);
}

/** The caller's address as the proxy in front of us reports it. */
export function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "local";
}
