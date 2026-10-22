import type { ContentRequest, Detection, FullPageInfo } from '../lib/messages';
import { detectPage, pageInfo } from '../lib/adapters/page';
import { detectX, isX } from '../lib/adapters/x';
import { detectYouTube, isYouTube } from '../lib/adapters/youtube';
import { selectRegion, toast } from '../lib/overlay';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    // The background may inject this again into tabs opened before install; register once.
    const w = window as typeof window & { __justcreate?: boolean };
    if (w.__justcreate) return;
    w.__justcreate = true;

    let contextTarget: Element | null = null;
    document.addEventListener('contextmenu', (e) => (contextTarget = e.target as Element), true);

    const fullPage = createFullPageState();

    browser.runtime.onMessage.addListener((message: ContentRequest, _sender, sendResponse) => {
      handle(message)
        .then(sendResponse)
        .catch((err) => sendResponse({ error: String(err) }));
      return true; // async response
    });

    async function handle(message: ContentRequest): Promise<unknown> {
      switch (message.kind) {
        case 'ping':
          return 'pong';
        case 'toast':
          toast(message.text, message.tone);
          return;
        case 'pageInfo':
          return pageInfo();
        case 'detect':
          return detect(message.mode);
        case 'selectRegion':
          return { rect: await selectRegion(), innerWidth };
        case 'fullpage:start':
          return fullPage.start();
        case 'fullpage:scrollTo':
          return fullPage.scrollTo(message.y);
        case 'fullpage:hideFixed':
          return fullPage.hideFixed();
        case 'fullpage:end':
          return fullPage.end();
      }
    }

    async function detect(mode: 'auto' | 'tweet' | 'video'): Promise<Detection> {
      if ((mode === 'auto' || mode === 'video') && isYouTube()) {
        const found = detectYouTube();
        if (found) return found;
      }
      if ((mode === 'auto' || mode === 'tweet') && isX()) {
        const found = await detectX(contextTarget);
        if (found) return found;
      }
      return detectPage();
    }
  },
});

function createFullPageState() {
  let originalY = 0;
  let hidden: { el: HTMLElement; visibility: string }[] = [];
  const settle = () =>
    new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 120))));

  return {
    async start(): Promise<FullPageInfo> {
      originalY = scrollY;
      document.documentElement.style.setProperty('scroll-behavior', 'auto', 'important');
      scrollTo(0, 0);
      await settle();
      return {
        scrollHeight: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0),
        innerHeight,
        innerWidth,
      };
    },
    async scrollTo(y: number) {
      scrollTo(0, y);
      await settle();
      return scrollY;
    },
    async hideFixed() {
      // Only header/banner-sized elements: some sites (X) build their whole layout from
      // sticky containers, and hiding those blanks the page.
      const maxHeight = innerHeight * 0.4;
      for (const el of document.querySelectorAll<HTMLElement>('body *')) {
        const position = getComputedStyle(el).position;
        if ((position === 'fixed' || position === 'sticky') && el.getBoundingClientRect().height < maxHeight) {
          hidden.push({ el, visibility: el.style.visibility });
          el.style.visibility = 'hidden';
        }
      }
    },
    async end() {
      for (const { el, visibility } of hidden) el.style.visibility = visibility;
      hidden = [];
      document.documentElement.style.removeProperty('scroll-behavior');
      scrollTo(0, originalY);
    },
  };
}
