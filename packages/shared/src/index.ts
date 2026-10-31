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
  labels: string[];
  description: string | null;
  created_at: string;
}

export interface Board {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  document: unknown | null;
  cover_reference_id: string | null;
  clustered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BoardItem {
  board_id: string;
  reference_id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
}

/** Output of the worker's per-reference analysis. Observed = visible in the image; inferred = guessed. */
export interface Analysis {
  reference_id: string;
  model_version: string;
  caption: string | null;
  summary: string | null;
  tags: string[];
  palette: string[];
  colors: string[];
  fonts: string[];
  layout_notes: string | null;
  components: string[];
  effects: string[];
  mood: string[];
  observed: Record<string, unknown>;
  inferred: Record<string, unknown>;
  created_at: string;
}

export type ClusterStatus = 'suggested' | 'accepted' | 'rejected';

export interface Cluster {
  id: string;
  board_id: string;
  name: string;
  ai_name: string | null;
  summary: string | null;
  status: ClusterStatus;
  source: 'ai' | 'user';
  created_at: string;
}

export interface ClusterMember {
  cluster_id: string;
  reference_id: string;
  score: number;
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
 * The capture's details, sent to POST /api/captures as `meta`: either in a JSON body next to the
 * paths of files already uploaded through POST /api/captures/uploads, or (older clients) as a
 * multipart field next to the files themselves.
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
  /** Board to place the capture on. Omitted → it lands in the inbox. */
  boardId?: string;
  remoteFileUrl?: string;
  metadata?: CaptureMetadata;
}

export interface CaptureResponse {
  reference?: Reference;
  error?: string;
}

/** Largest file (or thumbnail) a capture can store. */
export const MAX_CAPTURE_BYTES = 50 * 1024 * 1024;

export type ImageType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | 'image/avif';

/** The image type from a file's first 16 bytes, for the formats we store; null for anything else. */
export function sniffImage(head: Uint8Array): ImageType | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...head.subarray(from, to));
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (head[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
  if (ascii(0, 4) === 'GIF8') return 'image/gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (ascii(4, 8) === 'ftyp' && ['avif', 'avis'].includes(ascii(8, 12))) return 'image/avif';
  return null;
}

/**
 * POST /api/captures/uploads: one ticket per file, in order. Files go straight to storage with
 * a PUT to `url` (Content-Type = the declared type, body = the file's original bytes), so they never
 * pass through the web server and its request size limit. The capture then names them by `path`.
 */
export interface UploadRequest {
  files: { type: ImageType; size: number }[];
}
export interface UploadResponse {
  uploads?: { path: string; url: string }[];
  error?: string;
}

/** JSON body of POST /api/captures once the files are uploaded. */
export interface CaptureRequest {
  meta: CapturePayload;
  filePath?: string;
  thumbnailPath?: string;
}

export const CARD_WIDTH = 280;

/** Canvas image size: fixed width, height from the image's aspect ratio (clamped; the canvas crops the rest). */
export function cardSize(metadata: Record<string, unknown>) {
  const width = Number(metadata.width) || 0;
  const height = Number(metadata.height) || 0;
  const ratio = width && height ? height / width : 0.75;
  return { w: CARD_WIDTH, h: Math.round(Math.min(Math.max(CARD_WIDTH * ratio, 120), 900)) };
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

/**
 * Where to fetch the best copy of an image, best first and the URL as given last. Image CDNs serve
 * pages a resized copy (Pinterest's 236x/736x, X's name=small, Dribbble's ?resize=); these point
 * back at the original. Try each in turn: originals can 403 when the extension is guessed wrong.
 */
export function imageUrlCandidates(url: string): string[] {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return [url];
  }
  const out: string[] = [];
  const add = (next: string) => {
    if (next !== url && !out.includes(next)) out.push(next);
  };

  if (u.hostname === 'i.pinimg.com') {
    // /{size}/aa/bb/cc/hash.ext → /originals/aa/bb/cc/hash.{jpg,png,webp,gif}, then the largest resize.
    const m = u.pathname.match(/^\/[^/]+\/(.+)\.(\w+)$/);
    if (m) {
      for (const ext of [m[2], 'jpg', 'png', 'webp', 'gif']) add(`${u.origin}/originals/${m[1]}.${ext}`);
      add(`${u.origin}/1200x/${m[1]}.${m[2]}`);
    }
  } else if (u.hostname === 'pbs.twimg.com' && u.pathname.startsWith('/media/')) {
    const best = new URL(u);
    best.searchParams.set('name', 'orig');
    add(best.href);
    const large = new URL(u);
    large.searchParams.set('name', 'large');
    add(large.href);
  } else if (u.hostname === 'cdn.dribbble.com') {
    // Dribbble resizes with ?resize=WxH (&vertical=…): without it the upload comes back as is.
    if (u.search) add(`${u.origin}${u.pathname}`);
  } else if (u.hostname === 'mir-s3-cdn-cf.behance.net') {
    // /project_modules/{404|max_1200|1400|fs|…}/file → source, then the largest rendition.
    const m = u.pathname.match(/^\/project_modules\/[^/]+\/(.+)$/);
    if (m) for (const size of ['source', 'fs', 'max_3840', '2800_opt_1', '1400', 'max_1200']) add(`${u.origin}/project_modules/${size}/${m[1]}`);
  } else if (u.hostname === 'images.unsplash.com') {
    // Unsplash's imgix params (w, h, q, fit, crop, dpr) size it down; the bare URL is the original.
    if (u.search) add(`${u.origin}${u.pathname}`);
  }
  return [...out, url];
}

export type CaptureResult = { reference: Reference } | { error: string; status: number };

/**
 * Saves a capture from the app or the extension: the file and thumbnail go straight to storage
 * byte for byte (no re-encoding, so no quality lost), then the capture is posted with their paths.
 * `api` calls the web app with the caller's auth. Network failures throw; the server's answers
 * (including a refused file) come back as `{ error, status }`.
 */
export async function sendCapture(
  api: (path: string, init: RequestInit) => Promise<Response>,
  payload: CapturePayload,
  file?: Blob | null,
  thumbnail?: Blob | null,
): Promise<CaptureResult> {
  const parts: { key: 'filePath' | 'thumbnailPath'; blob: Blob; type: ImageType }[] = [];
  for (const [key, blob] of [['filePath', file], ['thumbnailPath', thumbnail]] as const) {
    if (!blob) continue;
    if (blob.size > MAX_CAPTURE_BYTES) return { error: 'File larger than 50 MB', status: 413 };
    const type = sniffImage(new Uint8Array(await blob.slice(0, 16).arrayBuffer()));
    if (!type) return { error: 'Only JPEG, PNG, GIF, WebP or AVIF images can be saved', status: 415 };
    parts.push({ key, blob, type });
  }

  const request: CaptureRequest = { meta: payload };
  if (parts.length) {
    const files: UploadRequest['files'] = parts.map((p) => ({ type: p.type, size: p.blob.size }));
    const res = await api('/api/captures/uploads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files } satisfies UploadRequest),
    });
    const body = (await res.json().catch(() => ({}))) as UploadResponse;
    if (!res.ok || body.uploads?.length !== parts.length) {
      return { error: body.error ?? `Server error ${res.status}`, status: res.ok ? 500 : res.status };
    }
    for (const [i, part] of parts.entries()) {
      const { path, url } = body.uploads[i];
      const put = await fetch(url, { method: 'PUT', headers: { 'Content-Type': part.type }, body: part.blob });
      if (!put.ok) return { error: `Upload failed (${put.status}). Try again.`, status: put.status };
      request[part.key] = path;
    }
  }

  const res = await api('/api/captures', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  const body = (await res.json().catch(() => ({}))) as CaptureResponse;
  if (res.ok && body.reference) return { reference: body.reference };
  return { error: body.error ?? `Server error ${res.status}`, status: res.ok ? 500 : res.status };
}
