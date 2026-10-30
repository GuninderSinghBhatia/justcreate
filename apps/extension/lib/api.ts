import type { CapturePayload, CaptureResponse } from '@justcreate/shared';
import { getAccessToken, getSession } from './auth';
import { APP_URL } from './config';
import { dequeue, enqueue, listQueue } from './queue';

export type UploadResult =
  | { status: 'saved' }
  | { status: 'queued'; reason: string }
  | { status: 'failed'; reason: string };

class RetryableError extends Error {
  /** True when every queued capture would fail the same way (offline, signed out, rate limited). */
  constructor(message: string, readonly stopsQueue = true) {
    super(message);
  }
}

async function post(payload: CapturePayload, file?: Blob, thumbnail?: Blob): Promise<void> {
  const token = await getAccessToken().catch(() => {
    throw new RetryableError('Could not reach JUSTCREATE');
  });
  if (!token) throw new RetryableError('Not connected. Open the extension popup to connect.');

  const form = new FormData();
  form.set('meta', JSON.stringify(payload));
  if (file) form.set('file', file);
  if (thumbnail) form.set('thumbnail', thumbnail);

  let res: Response;
  try {
    res = await fetch(`${APP_URL}/api/captures`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
  } catch {
    throw new RetryableError('Offline or server unreachable');
  }
  if (res.ok) return;

  const body = (await res.json().catch(() => ({}))) as CaptureResponse;
  const reason = body.error ?? `Server error ${res.status}`;
  // Auth, rate limit and server errors may clear up; a bad request will not. A server error may be
  // about this one capture, so the queue moves on to the next.
  if (res.status === 401 || res.status === 429) throw new RetryableError(reason);
  if (res.status >= 500) throw new RetryableError(reason, false);
  throw new Error(reason);
}

export async function upload(payload: CapturePayload, file?: Blob, thumbnail?: Blob): Promise<UploadResult> {
  try {
    await post(payload, file, thumbnail);
    return { status: 'saved' };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    if (!(err instanceof RetryableError)) return { status: 'failed', reason };
    const owner = (await getSession())?.email;
    await enqueue({ id: crypto.randomUUID(), payload, file, thumbnail, attempts: 0, createdAt: Date.now(), owner });
    return { status: 'queued', reason };
  }
}

const MAX_ATTEMPTS = 50;

/** Retries queued captures oldest-first. Returns how many were saved. */
export async function flushQueue(): Promise<number> {
  // Only the connected account's captures: on a shared browser, someone else's offline captures
  // wait for them to connect again instead of landing in this library.
  const me = (await getSession())?.email;
  const items = (await listQueue()).filter((i) => !i.owner || i.owner === me).sort((a, b) => a.createdAt - b.createdAt);
  let saved = 0;
  for (const item of items) {
    try {
      await post(item.payload, item.file, item.thumbnail);
      await dequeue(item.id);
      saved++;
    } catch (err) {
      if (!(err instanceof RetryableError) || item.attempts + 1 >= MAX_ATTEMPTS) {
        await dequeue(item.id);
        continue;
      }
      await enqueue({ ...item, attempts: item.attempts + 1 });
      if (err.stopsQueue) break; // still offline / unauthorized: don't hammer the rest
    }
  }
  return saved;
}

