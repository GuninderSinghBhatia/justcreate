// X / Twitter's DOM changes often. Selectors rely on data-testid, the most stable hooks they expose.
// If extraction fails, the post element screenshot plus the URL is still saved.
import type { Detection } from '../messages';

export function isX(url = location.href) {
  try {
    return /(^|\.)(x|twitter)\.com$/.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Finds the post: the one right-clicked, else the one the URL points at, else the first visible. */
export function findPost(contextTarget: Element | null): HTMLElement | null {
  const fromTarget = contextTarget?.closest<HTMLElement>('article[data-testid="tweet"]');
  if (fromTarget) return fromTarget;

  const articles = [...document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]')];
  const statusId = location.pathname.match(/\/status\/(\d+)/)?.[1];
  if (statusId) {
    const match = articles.find((a) => a.querySelector(`a[href*="/status/${statusId}"] time`));
    if (match) return match;
  }
  return (
    articles.find((a) => {
      const r = a.getBoundingClientRect();
      return r.bottom > 0 && r.top < innerHeight;
    }) ?? null
  );
}

export async function detectX(contextTarget: Element | null): Promise<Detection | null> {
  const post = findPost(contextTarget);
  if (!post) return null;

  const userName = post.querySelector('[data-testid="User-Name"]');
  const nameText = userName?.textContent ?? '';
  const author = userName?.querySelector('span')?.textContent?.trim() || undefined;
  const handle = nameText.match(/@\w+/)?.[0];
  const time = post.querySelector('time');
  const permalink = time?.closest('a')?.href ?? location.href;
  const text = (post.querySelector<HTMLElement>('[data-testid="tweetText"]')?.innerText ?? '').trim();

  const media = [
    ...[...post.querySelectorAll<HTMLImageElement>('img[src*="pbs.twimg.com/media"]')].map((img) =>
      largeImage(img.src),
    ),
    ...[...post.querySelectorAll<HTMLVideoElement>('video[poster]')].map((v) => v.poster),
  ];

  post.scrollIntoView({ block: 'center' });
  await nextPaint();
  const r = post.getBoundingClientRect();
  const top = Math.max(0, r.top);

  return {
    payload: {
      type: 'tweet',
      sourceUrl: permalink,
      pageUrl: location.href,
      title: [author ?? handle, text.slice(0, 120)].filter(Boolean).join(': ') || document.title,
      metadata: {
        author,
        handle,
        text,
        postedAt: time?.dateTime,
        media: [...new Set(media)],
        screenshotMode: 'element',
        pageTitle: document.title,
      },
    },
    elementRect: { x: Math.max(0, r.left), y: top, width: r.width, height: Math.min(r.bottom, innerHeight) - top },
    screenshotElement: true,
  };
}

function largeImage(src: string) {
  try {
    const u = new URL(src);
    u.searchParams.set('name', 'large');
    return u.href;
  } catch {
    return src;
  }
}

function nextPaint() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}
