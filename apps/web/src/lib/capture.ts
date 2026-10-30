import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CAPTURES_BUCKET,
  imageUrlCandidates,
  REFERENCE_TYPES,
  type CaptureMetadata,
  type CapturePayload,
  type Reference,
} from "@justcreate/shared";
import { enqueueJob } from "@/lib/jobs";
import { addToBoard, homeBoard } from "@/lib/boards";
import { fetchPublic, sniffImage } from "@/lib/safe-fetch";

export const MAX_BYTES = 50 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export class CaptureError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Stores one capture for `userId` using a client that acts as that user (RLS applies):
 * uploads the file (and optional card thumbnail), inserts the reference, places it on the user's
 * board, and queues analysis.
 */
export async function saveCapture(
  supabase: SupabaseClient,
  userId: string,
  payload: CapturePayload,
  files: { file?: Blob | null; thumbnail?: Blob | null },
): Promise<Reference> {
  if (!REFERENCE_TYPES.includes(payload.type)) throw new CaptureError("Unknown type", 400);

  for (const f of [files.file, files.thumbnail]) {
    if (f && f.size > MAX_BYTES) throw new CaptureError("File larger than 50 MB", 413);
  }
  // Stored files are only ever raster images, typed by their bytes: never what the client claims.
  let file = files.file ? await asImage(files.file) : null;
  if (!file && payload.remoteFileUrl) file = await download(payload.remoteFileUrl);
  const thumbnail = files.thumbnail ? await asImage(files.thumbnail) : null;

  let metadata: CaptureMetadata = payload.metadata ?? {};
  if (payload.type === "tweet" && !metadata.text && payload.sourceUrl) {
    metadata = { ...metadata, ...(await tweetOEmbed(payload.sourceUrl)) };
  }

  const uploaded: string[] = [];
  let saved: string | null = null;
  const put = async (blob: Blob | null | undefined) => {
    if (!blob) return null;
    const path = `${userId}/${crypto.randomUUID()}.${EXTENSIONS[blob.type]}`;
    const { error } = await supabase.storage.from(CAPTURES_BUCKET).upload(path, blob, { contentType: blob.type });
    if (error) {
      console.error("capture upload:", error.message);
      throw new CaptureError("Upload failed. Try again.", 500);
    }
    uploaded.push(path);
    return path;
  };

  try {
    const filePath = await put(file);
    const thumbnailPath = (await put(thumbnail)) ?? filePath;

    const { data, error } = await supabase
      .from("references")
      .insert({
        user_id: userId,
        type: payload.type,
        source_url: webUrl(payload.sourceUrl),
        page_url: webUrl(payload.pageUrl),
        title: (payload.title ?? (metadata.text as string | undefined))?.slice(0, 500) ?? null,
        note: payload.note?.slice(0, 5000) ?? null,
        file_path: filePath,
        thumbnail_path: thumbnailPath,
        metadata,
      })
      .select()
      .single();
    if (error) {
      console.error("capture save:", error.message);
      throw new CaptureError("Save failed. Try again.", 500);
    }
    const reference = data as Reference;
    saved = reference.id;

    // One board per user: every capture lands on it (older extensions still send a boardId).
    const board = await homeBoard(supabase, userId);
    await addToBoard(supabase, userId, board.id, [reference]);
    // Analysis is best effort here: the capture is saved either way.
    await enqueueJob(userId, "analyze", { referenceId: reference.id }).catch((e) => console.error(e));
    return reference;
  } catch (err) {
    // Nothing half-saved: no row pointing at removed files, no files without a row.
    if (saved) await supabase.from("references").delete().eq("id", saved);
    if (uploaded.length) await supabase.storage.from(CAPTURES_BUCKET).remove(uploaded);
    throw err;
  }
}

const METADATA_MAX = 16 * 1024;
const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);

/**
 * The capture as the server will use it: known fields of the right type only, metadata kept small
 * and its image size finite (it sizes the card on the board). Null when it isn't a capture.
 */
export function parsePayload(raw: unknown): CapturePayload | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.type !== "string" || !REFERENCE_TYPES.includes(r.type as CapturePayload["type"])) return null;
  let metadata: CaptureMetadata = {};
  if (typeof r.metadata === "object" && r.metadata !== null && !Array.isArray(r.metadata)) {
    if (JSON.stringify(r.metadata).length > METADATA_MAX) return null;
    metadata = { ...(r.metadata as CaptureMetadata) };
    delete metadata.oembed; // set by the server only
    for (const key of ["width", "height"] as const) {
      const n = Number(metadata[key]);
      if (metadata[key] !== undefined && !(Number.isFinite(n) && n > 0 && n < 100_000)) delete metadata[key];
    }
  }
  return {
    type: r.type as CapturePayload["type"],
    sourceUrl: text(r.sourceUrl, 4000),
    pageUrl: text(r.pageUrl, 4000),
    title: text(r.title, 500),
    note: text(r.note, 5000),
    remoteFileUrl: text(r.remoteFileUrl, 4000),
    metadata,
  };
}

/** Only http(s) links are kept: they end up as clickable links in the app and in design.md. */
function webUrl(url: string | null | undefined) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
}

/** The file as a typed image Blob, or a 415 when its bytes aren't JPEG, PNG, GIF, WebP or AVIF. */
async function asImage(blob: Blob): Promise<Blob> {
  if (blob.size === 0) throw new CaptureError("The file is empty", 400);
  const type = sniffImage(new Uint8Array(await blob.slice(0, 16).arrayBuffer()));
  if (!type) throw new CaptureError("Only JPEG, PNG, GIF, WebP or AVIF images can be saved", 415);
  return blob.type === type ? blob : new Blob([blob], { type });
}

/**
 * Fallback when the extension couldn't read the file itself (e.g. CORS-locked images): downloads
 * the best copy of a remote image, the original behind a CDN resize when there is one. Only public
 * addresses are fetched (see safe-fetch).
 */
async function download(url: string): Promise<Blob | null> {
  // One budget across all the candidate copies (some CDNs offer several): 30 s and 100 MB in all.
  const deadline = Date.now() + 30_000;
  let budget = 2 * MAX_BYTES;
  for (const candidate of imageUrlCandidates(url)) {
    const timeoutMs = deadline - Date.now();
    if (timeoutMs < 1000 || budget <= 0) return null;
    try {
      const res = await fetchPublic(candidate, { maxBytes: Math.min(MAX_BYTES, budget), timeoutMs });
      budget -= res.body.length;
      if (res.status < 200 || res.status >= 300) continue;
      const type = sniffImage(res.body.subarray(0, 16));
      if (type) return new Blob([new Uint8Array(res.body)], { type });
    } catch {
      // blocked, too large or unreachable: try the next copy
    }
  }
  return null;
}

/**
 * X's public oEmbed endpoint: used when the extension couldn't parse the post from the page
 * (logged out, markup changed). Returns the post text and author when available.
 */
async function tweetOEmbed(url: string): Promise<Partial<CaptureMetadata>> {
  try {
    const endpoint = new URL("https://publish.twitter.com/oembed");
    endpoint.searchParams.set("url", url);
    endpoint.searchParams.set("omit_script", "1");
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return {};
    const body = (await res.json()) as { html?: string; author_name?: string; author_url?: string };
    const paragraph = body.html?.match(/<p[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? "";
    const text = decodeEntities(paragraph.replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "")).trim();
    return {
      text: text || undefined,
      author: body.author_name,
      handle: body.author_url ? `@${body.author_url.split("/").pop()}` : undefined,
      oembed: true,
    };
  } catch {
    return {};
  }
}

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, "—");
}
