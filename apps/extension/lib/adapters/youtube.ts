// YouTube's DOM changes often. Everything here is best-effort with fallbacks to page metadata.
import type { Detection } from '../messages';

export function isYouTube(url = location.href) {
  return videoId(url) !== null;
}

function videoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1) || null;
    if (!/(^|\.)youtube\.com$/.test(u.hostname)) return null;
    if (u.pathname === '/watch') return u.searchParams.get('v');
    const shorts = u.pathname.match(/^\/shorts\/([\w-]+)/);
    return shorts?.[1] ?? null;
  } catch {
    return null;
  }
}

export function detectYouTube(): Detection | null {
  const id = videoId(location.href);
  if (!id) return null;

  const title =
    text('h1.ytd-watch-metadata yt-formatted-string') ??
    document.querySelector<HTMLMetaElement>('meta[name="title"]')?.content ??
    document.title.replace(/ - YouTube$/, '');
  const channelLink = document.querySelector<HTMLAnchorElement>(
    'ytd-watch-metadata ytd-channel-name a, #owner ytd-channel-name a, ytd-reel-player-overlay-renderer ytd-channel-name a',
  );
  const video = document.querySelector<HTMLVideoElement>('video.html5-main-video, video');
  const seconds = video && video.currentTime > 1 ? Math.floor(video.currentTime) : undefined;

  const url = new URL('https://www.youtube.com/watch');
  url.searchParams.set('v', id);
  if (seconds) url.searchParams.set('t', `${seconds}s`);

  return {
    payload: {
      type: 'video',
      sourceUrl: url.href,
      pageUrl: location.href,
      title,
      metadata: {
        videoId: id,
        channel: channelLink?.textContent?.trim() || undefined,
        channelUrl: channelLink?.href,
        timestampSeconds: seconds,
        pageTitle: document.title,
      },
    },
    fileCandidates: [
      `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
      `https://i.ytimg.com/vi/${id}/sddefault.jpg`,
      `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    ],
  };
}

function text(selector: string) {
  return document.querySelector(selector)?.textContent?.trim() || undefined;
}
