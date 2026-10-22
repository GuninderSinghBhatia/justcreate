import type { CapturePayload } from '@justcreate/shared';

/** Captures that failed to upload, kept in IndexedDB (Blobs survive there) until a retry succeeds. */
export interface QueuedCapture {
  id: string;
  payload: CapturePayload;
  file?: Blob;
  attempts: number;
  createdAt: number;
}

const DB = 'justcreate';
const STORE = 'queue';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export const enqueue = (item: QueuedCapture) => tx('readwrite', (s) => s.put(item));
export const dequeue = (id: string) => tx('readwrite', (s) => s.delete(id));
export const listQueue = () => tx<QueuedCapture[]>('readonly', (s) => s.getAll());
export const queueSize = () => tx<number>('readonly', (s) => s.count());
