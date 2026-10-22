export const REFERENCE_TYPES = ['image', 'screenshot', 'video', 'tweet', 'webpage'] as const;
export type ReferenceType = (typeof REFERENCE_TYPES)[number];

export const CAPTURES_BUCKET = 'captures';

/** Row in public."references". */
export interface Reference {
  id: string;
  user_id: string;
  type: ReferenceType;
  source_url: string | null;
  page_url: string | null;
  title: string | null;
  file_path: string | null;
  thumbnail_path: string | null;
  metadata: Record<string, unknown>;
  note: string | null;
  created_at: string;
}

/** Type-specific details kept in `metadata`. All optional: adapters fill what they can find. */
export interface CaptureMetadata {
  pageTitle?: string;
  favicon?: string;
  ogImage?: string;
  description?: string;
  width?: number;
  height?: number;
  /** screenshot: which mode produced it */
  screenshotMode?: 'visible' | 'region' | 'fullpage' | 'element';
  /** video */
  videoId?: string;
  channel?: string;
  channelUrl?: string;
  timestampSeconds?: number;
  /** tweet / social post */
  author?: string;
  handle?: string;
  text?: string;
  postedAt?: string;
  media?: string[];
  [key: string]: unknown;
}

/**
 * JSON sent as the `meta` field of POST /api/captures (multipart).
 * The optional `file` field carries the main image (or screenshot).
 * If there is no file, the server tries to download `remoteFileUrl`.
 */
export interface CapturePayload {
  type: ReferenceType;
  /** Canonical URL of the thing saved (image src, video URL, post permalink, page URL). */
  sourceUrl?: string;
  /** Page the capture was made on. */
  pageUrl?: string;
  title?: string;
  note?: string;
  remoteFileUrl?: string;
  metadata?: CaptureMetadata;
}

export interface CaptureResponse {
  reference?: Reference;
  error?: string;
}

/** Session handed from the web app to the extension. */
export interface ExtensionSession {
  access_token: string;
  refresh_token: string;
  /** unix seconds */
  expires_at: number;
  email?: string;
}

/** window.postMessage type used by the /connect page → extension content script. */
export const CONNECT_MESSAGE = 'JUSTCREATE_EXTENSION_SESSION';
