import { CONNECT_MESSAGE, type ExtensionSession } from '@justcreate/shared';
import { APP_URL } from '../lib/config';

/**
 * Runs only on the web app's /connect page. Relays the session the page posts to the
 * background worker, then acknowledges (with an error, if any) so the page can report it.
 * Patterns are broad (any localhost port); the origin is checked against APP_URL at runtime.
 */
export default defineContentScript({
  matches: ['http://localhost:*/connect*', 'http://127.0.0.1:*/connect*', 'https://*/connect*'],
  runAt: 'document_start',
  main() {
    if (location.origin !== new URL(APP_URL).origin) return;
    // Lets the page tell "extension missing" apart from "extension failed".
    document.documentElement.dataset.justcreateExtension = 'ready';

    window.addEventListener('message', async (event) => {
      if (event.source !== window || event.origin !== location.origin) return;
      if (event.data?.type !== CONNECT_MESSAGE) return;
      const session = event.data.session as ExtensionSession;
      let error: string | undefined;
      try {
        const res = (await browser.runtime.sendMessage({ kind: 'connected', session })) as { error?: string } | undefined;
        error = res?.error;
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      window.postMessage({ type: `${CONNECT_MESSAGE}_ACK`, error }, location.origin);
    });
  },
});
