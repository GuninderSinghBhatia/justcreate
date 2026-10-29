import type { CapturePayload, CaptureResponse } from '@justcreate/shared';
import { getAccessToken } from './auth';
import { APP_URL } from './config';
import { dequeue, enqueue, listQueue } from './queue';

export type UploadResult =
  | { status: 'saved' }
  | { status: 'queued'; reason: string }
  | { status: 'failed'; reason: string };

class RetryableError extends Error {}

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
  // Auth and server errors may clear up; a bad request will not.
  if (res.status === 401 || res.status >= 500) throw new RetryableError(reason);
  throw new Error(reason);
}

export async function upload(payload: CapturePayload, file?: Blob, thumbnail?: Blob): Promise<UploadResult> {
  try {
    await post(payload, file, thumbnail);
    return { status: 'saved' };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    if (!(err instanceof RetryableError)) return { status: 'failed', reason };
    await enqueue({ id: crypto.randomUUID(), payload, file, thumbnail, attempts: 0, createdAt: Date.now() });
    return { status: 'queued', reason };
  }
}

const MAX_ATTEMPTS = 50;

/** Retries queued captures oldest-first. Returns how many were saved. */
export async function flushQueue(): Promise<number> {
  const items = (await listQueue()).sort((a, b) => a.createdAt - b.createdAt);
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
      break; // still offline / unauthorized: don't hammer the rest
    }
  }
  return saved;
}

