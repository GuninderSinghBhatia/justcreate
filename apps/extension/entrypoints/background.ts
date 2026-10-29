import type { CapturePayload } from '@justcreate/shared';
import { flushQueue, upload, type UploadResult } from '../lib/api';
import { getSession, setSession } from '../lib/auth';
import type {
  BackgroundRequest,
  ContentRequest,
  Detection,
  FullPageInfo,
  PageInfo,
  Rect,
  ScreenshotMode,
  StatusResponse,
} from '../lib/messages';
import { queueSize } from '../lib/queue';
import { captureFullPage, captureVisible, crop, imageSize } from '../lib/screenshot';

type Tab = Browser.tabs.Tab;

const MENU = {
  image: 'save-image',
  post: 'save-post',
  video: 'save-video',
  page: 'save-page',
  visible: 'shot-visible',
  region: 'shot-region',
  fullpage: 'shot-fullpage',
} as const;

const X_PATTERNS = ['https://x.com/*', 'https://twitter.com/*', 'https://mobile.x.com/*'];
const YOUTUBE_PATTERNS = ['https://www.youtube.com/*', 'https://m.youtube.com/*', 'https://youtu.be/*'];

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.removeAll(() => {
      const add = (props: Browser.contextMenus.CreateProperties) => browser.contextMenus.create(props);
      add({ id: MENU.image, title: 'Save image to JUSTCREATE', contexts: ['image'] });
      add({ id: MENU.post, title: 'Save post to JUSTCREATE', contexts: ['page', 'link', 'image', 'video', 'selection'], documentUrlPatterns: X_PATTERNS });
      add({ id: MENU.video, title: 'Save video to JUSTCREATE', contexts: ['page', 'video', 'link'], documentUrlPatterns: YOUTUBE_PATTERNS });
      add({ id: MENU.page, title: 'Save page to JUSTCREATE', contexts: ['page'] });
      add({ id: MENU.visible, title: 'Screenshot visible area', contexts: ['page'] });
      add({ id: MENU.region, title: 'Screenshot a region…', contexts: ['page', 'image'] });
      add({ id: MENU.fullpage, title: 'Screenshot full page', contexts: ['page'] });
    });
    browser.alarms.create('retry-queue', { periodInMinutes: 1 });
  });

  browser.runtime.onStartup.addListener(() => void retryQueue());
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'retry-queue') void retryQueue();
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (!tab?.id) return;
    const run = (): Promise<unknown> => {
      switch (info.menuItemId) {
        case MENU.image:
          return saveImage(tab, info.srcUrl!);
        case MENU.post:
          return saveDetected(tab, 'tweet');
        case MENU.video:
          return saveDetected(tab, 'video');
        case MENU.page:
          return saveDetected(tab, 'auto');
        case MENU.visible:
          return saveScreenshot(tab, 'visible');
        case MENU.region:
          return saveScreenshot(tab, 'region');
        case MENU.fullpage:
          return saveScreenshot(tab, 'fullpage');
      }
      return Promise.resolve();
    };
    void guarded(tab, run);
  });

  browser.commands.onCommand.addListener(async (command, tab) => {
    tab ??= (await browser.tabs.query({ active: true, currentWindow: true }))[0];
    if (!tab?.id) return;
    if (command === 'save-page') void guarded(tab, () => saveDetected(tab, 'auto'));
    if (command === 'screenshot-region') void guarded(tab, () => saveScreenshot(tab, 'region'));
  });

  browser.runtime.onMessage.addListener((message: BackgroundRequest, _sender, sendResponse) => {
    handlePopup(message).then(sendResponse, (err) => sendResponse({ error: String(err) }));
    return true;
  });

  // Test hook for automated browser tests (context menus can't be clicked by automation).
  if (import.meta.env.MODE === 'development') {
    Object.assign(globalThis, { __justcreate: { saveImage, saveDetected, saveScreenshot, retryQueue } });
  }
});

async function handlePopup(message: BackgroundRequest): Promise<unknown> {
  switch (message.kind) {
    case 'status': {
      const session = await getSession();
      return {
        connected: Boolean(session),
        email: session?.email,
        queued: await queueSize(),
      } satisfies StatusResponse;
    }
    case 'connected':
      await setSession(message.session);
      void retryQueue();
      return { ok: true };
    case 'disconnect':
      await setSession(null);
      return { ok: true };
    case 'retryQueue':
      return { saved: await retryQueue() };
    case 'savePage': {
      const tab = await browser.tabs.get(message.tabId);
      void guarded(tab, () => saveDetected(tab, 'auto', message.note));
      return { ok: true };
    }
    case 'screenshot': {
      const tab = await browser.tabs.get(message.tabId);
      void guarded(tab, () => saveScreenshot(tab, message.mode, message.note));
      return { ok: true };
    }
  }
}

// ---------- capture flows ----------

async function saveImage(tab: Tab, srcUrl: string) {
  const file = await fetchImage(srcUrl);
  const size = file ? await imageSize(file) : undefined;
  const payload: CapturePayload = {
    type: 'image',
    sourceUrl: srcUrl.startsWith('data:') ? undefined : srcUrl,
    pageUrl: tab.url,
    title: tab.title,
    // The server retries the download if the extension couldn't read the image.
    remoteFileUrl: file || srcUrl.startsWith('data:') ? undefined : srcUrl,
    metadata: { pageTitle: tab.title, ...size },
  };
  await finish(tab, await upload(payload, file ?? undefined), 'Image saved');
}

async function saveDetected(tab: Tab, mode: 'auto' | 'tweet' | 'video', note?: string) {
  const detection = await send<Detection>(tab, { kind: 'detect', mode });
  const payload: CapturePayload = { ...detection.payload, note: note || undefined };

  let file: Blob | null = null;
  for (const url of detection.fileCandidates ?? []) {
    file = await fetchImage(url);
    if (file) break;
  }
  if (!file && detection.elementRect) {
    file = await crop(await captureVisible(tab.windowId), detection.elementRect, await viewportWidth(tab));
  }
  let thumbnail: Blob | undefined;
  if (!file && detection.fullPageScreenshot) {
    // Card image = what the user sees; the full-page shot is kept as the file.
    thumbnail = await captureVisible(tab.windowId);
    file = await fullPage(tab);
  }
  if (file) {
    const full = await imageSize(file);
    const card = thumbnail ? await imageSize(thumbnail) : full;
    payload.metadata = { ...payload.metadata, ...card, fullHeight: full?.height };
  }

  const label = payload.type === 'video' ? 'Video saved' : payload.type === 'tweet' ? 'Post saved' : 'Page saved';
  await finish(tab, await upload(payload, file ?? undefined, thumbnail), label);
}

async function saveScreenshot(tab: Tab, mode: ScreenshotMode, note?: string) {
  let file: Blob;
  if (mode === 'region') {
    const { rect, innerWidth } = await send<{ rect: Rect | null; innerWidth: number }>(tab, { kind: 'selectRegion' });
    if (!rect) return; // cancelled
    file = await crop(await captureVisible(tab.windowId), rect, innerWidth);
  } else if (mode === 'fullpage') {
    file = await fullPage(tab);
  } else {
    file = await captureVisible(tab.windowId);
  }

  const info = await send<PageInfo>(tab, { kind: 'pageInfo' }).catch(() => null);
  const payload: CapturePayload = {
    type: 'screenshot',
    sourceUrl: tab.url,
    pageUrl: tab.url,
    title: tab.title,
    note: note || undefined,
    metadata: {
      screenshotMode: mode,
      pageTitle: tab.title,
      favicon: info?.favicon,
      ...(await imageSize(file)),
    },
  };
  await finish(tab, await upload(payload, file), 'Screenshot saved');
}

function fullPage(tab: Tab) {
  return captureFullPage(tab.windowId, {
    start: () => send<FullPageInfo>(tab, { kind: 'fullpage:start' }),
    scrollTo: (y) => send<number>(tab, { kind: 'fullpage:scrollTo', y }),
    hideFixed: () => send<void>(tab, { kind: 'fullpage:hideFixed' }),
    end: () => send<void>(tab, { kind: 'fullpage:end' }),
  });
}

// ---------- helpers ----------

async function fetchImage(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return blob.type.startsWith('image/') && blob.size > 0 ? blob : null;
  } catch {
    return null; // blob: URLs and some CDNs can't be read from the worker
  }
}

async function viewportWidth(tab: Tab) {
  const [result] = await browser.scripting.executeScript({ target: { tabId: tab.id! }, func: () => innerWidth });
  return result.result as number;
}

/** Sends to the tab's content script, injecting it first in tabs opened before install. */
async function send<T>(tab: Tab, message: ContentRequest): Promise<T> {
  const tabId = tab.id!;
  try {
    await browser.tabs.sendMessage(tabId, { kind: 'ping' } satisfies ContentRequest);
  } catch {
    await browser.scripting.executeScript({ target: { tabId }, files: ['/content-scripts/content.js'] });
  }
  const response = (await browser.tabs.sendMessage(tabId, message)) as T | { error: string };
  if (response && typeof response === 'object' && 'error' in response) throw new Error(response.error);
  return response as T;
}

async function finish(tab: Tab, result: UploadResult, label: string) {
  if (result.status === 'saved') return notify(tab, `${label} to JUSTCREATE`, 'ok');
  if (result.status === 'queued') return notify(tab, `Not saved yet: ${result.reason}. Will retry automatically.`, 'warn');
  return notify(tab, `Couldn't save: ${result.reason}`, 'error');
}

async function guarded(tab: Tab, run: () => Promise<unknown>) {
  try {
    await run();
  } catch (err) {
    await notify(tab, `Couldn't capture this page: ${err instanceof Error ? err.message : String(err)}`, 'error');
  }
}

/** Toast in the page; on pages where scripts can't run (chrome://, the Web Store), a badge instead. */
async function notify(tab: Tab, text: string, tone: 'ok' | 'warn' | 'error') {
  try {
    await send(tab, { kind: 'toast', text, tone });
  } catch {
    await browser.action.setBadgeBackgroundColor({ color: tone === 'ok' ? '#111' : '#b91c1c' });
    await browser.action.setBadgeText({ text: tone === 'ok' ? '✓' : '!', tabId: tab.id });
    setTimeout(() => browser.action.setBadgeText({ text: '', tabId: tab.id }), 4000);
  }
}

async function retryQueue() {
  if (!(await getSession())) return 0;
  const saved = await flushQueue();
  const left = await queueSize();
  await browser.action.setBadgeText({ text: left ? String(left) : '' });
  return saved;
}

