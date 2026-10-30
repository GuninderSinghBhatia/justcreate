import type { ExtensionSession } from '@justcreate/shared';
import { APP_URL } from './config';

const KEY = 'session';
const REFRESH_MARGIN_SECONDS = 60;

export async function getSession(): Promise<ExtensionSession | null> {
  const stored = await browser.storage.local.get(KEY);
  return (stored[KEY] as ExtensionSession | undefined) ?? null;
}

export async function setSession(session: ExtensionSession | null) {
  if (session) await browser.storage.local.set({ [KEY]: session });
  else await browser.storage.local.remove(KEY);
}

let refreshing: Promise<ExtensionSession | null> | null = null;

/** Returns a usable access token, refreshing through the web app when it is about to expire. */
export async function getAccessToken(): Promise<string | null> {
  const session = await getSession();
  if (!session) return null;
  if (session.expires_at - REFRESH_MARGIN_SECONDS > Date.now() / 1000) return session.access_token;

  // One refresh at a time: refresh tokens are single-use.
  refreshing ??= refresh(session).finally(() => {
    refreshing = null;
  });
  return (await refreshing)?.access_token ?? null;
}

async function refresh(session: ExtensionSession): Promise<ExtensionSession | null> {
  const res = await fetch(`${APP_URL}/api/extension/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  // Someone may have connected (or disconnected) while this was in flight: then that's the session.
  const stillCurrent = async () => (await getSession())?.refresh_token === session.refresh_token;
  if (res.status === 401) {
    if (await stillCurrent()) await setSession(null);
    return getSession();
  }
  if (!res.ok) throw new Error(`Refresh failed (${res.status})`);
  const body = (await res.json()) as { session: ExtensionSession };
  if (!(await stillCurrent())) return getSession();
  await setSession(body.session);
  return body.session;
}
