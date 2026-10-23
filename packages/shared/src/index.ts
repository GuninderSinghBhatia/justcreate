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
  /** Board to place the capture on. Omitted → it lands in the inbox. */
  boardId?: string;
  remoteFileUrl?: string;
  metadata?: CaptureMetadata;
}

export interface CaptureResponse {
  reference?: Reference;
  error?: string;
}

export const CARD_WIDTH = 280;
const CARD_FOOTER = 56;

/** Canvas card size: fixed width, height from the image's aspect ratio (clamped). */
export function cardSize(metadata: Record<string, unknown>) {
  const width = Number(metadata.width) || 0;
  const height = Number(metadata.height) || 0;
  const ratio = width && height ? height / width : 0.75;
  return { w: CARD_WIDTH, h: Math.round(Math.min(Math.max(CARD_WIDTH * ratio, 120), 900) + CARD_FOOTER) };
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
