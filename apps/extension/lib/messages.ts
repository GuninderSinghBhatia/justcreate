import type { CapturePayload } from '@justcreate/shared';

/** Viewport rectangle in CSS pixels. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageInfo {
  url: string;
  title: string;
  favicon?: string;
  ogImage?: string;
  description?: string;
}

/**
 * What a site adapter found on the page. `fileCandidates` are tried in order as the main file;
 * `elementRect` (already scrolled into view) is screenshotted when no candidate works or when
 * `screenshotElement` is set.
 */
export interface Detection {
  payload: CapturePayload;
  fileCandidates?: string[];
  elementRect?: Rect;
  screenshotElement?: boolean;
  /** Whole-page captures want a full-page screenshot as their file. */
  fullPageScreenshot?: boolean;
}

export interface FullPageInfo {
  scrollHeight: number;
  innerHeight: number;
  innerWidth: number;
}

/** Background → content script. */
export type ContentRequest =
  | { kind: 'ping' }
  | { kind: 'toast'; text: string; tone: 'ok' | 'warn' | 'error' }
  | { kind: 'pageInfo' }
  | { kind: 'detect'; mode: 'auto' | 'tweet' | 'video' }
  | { kind: 'selectRegion' }
  | { kind: 'fullpage:start' }
  | { kind: 'fullpage:scrollTo'; y: number }
  | { kind: 'fullpage:hideFixed' }
  | { kind: 'fullpage:end' };

export type ScreenshotMode = 'visible' | 'region' | 'fullpage';

/** Popup → background. */
export type BackgroundRequest =
  | { kind: 'status' }
  | { kind: 'savePage'; note?: string; tabId: number }
  | { kind: 'screenshot'; mode: ScreenshotMode; note?: string; tabId: number }
  | { kind: 'retryQueue' }
  | { kind: 'disconnect' }
  | { kind: 'connected'; session: import('@justcreate/shared').ExtensionSession };

export interface StatusResponse {
  connected: boolean;
  email?: string;
  queued: number;
}
