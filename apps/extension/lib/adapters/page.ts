import type { Detection, PageInfo } from '../messages';

export function pageInfo(): PageInfo {
  const meta = (selector: string) =>
    document.querySelector<HTMLMetaElement>(selector)?.content?.trim() || undefined;
  const icon = document.querySelector<HTMLLinkElement>('link[rel~="icon"], link[rel="apple-touch-icon"]');
  return {
    url: location.href,
    title: meta('meta[property="og:title"]') ?? document.title,
    favicon: icon?.href ?? new URL('/favicon.ico', location.origin).href,
    ogImage: absolute(meta('meta[property="og:image"]') ?? meta('meta[name="twitter:image"]')),
    description: meta('meta[property="og:description"]') ?? meta('meta[name="description"]'),
  };
}

/** Generic web page: metadata plus a full-page screenshot as the main file. */
export function detectPage(): Detection {
  const info = pageInfo();
  return {
    payload: {
      type: 'webpage',
      sourceUrl: info.url,
      pageUrl: info.url,
      title: info.title,
      metadata: {
        pageTitle: document.title,
        favicon: info.favicon,
        ogImage: info.ogImage,
        description: info.description,
        screenshotMode: 'fullpage',
      },
    },
    fullPageScreenshot: true,
  };
}

function absolute(url: string | undefined) {
  if (!url) return undefined;
  try {
    return new URL(url, location.href).href;
  } catch {
    return undefined;
  }
}
