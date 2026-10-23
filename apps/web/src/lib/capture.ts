import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CAPTURES_BUCKET,
  REFERENCE_TYPES,
  type CaptureMetadata,
  type CapturePayload,
  type Reference,
} from "@justcreate/shared";
import { enqueueJob } from "@/lib/jobs";
import { addToBoard } from "@/lib/boards";

export const MAX_BYTES = 50 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
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
 * uploads the file (and optional card thumbnail), inserts the reference, optionally places it on
 * a board, and queues analysis.
 */
export async function saveCapture(
  supabase: SupabaseClient,
  userId: string,
  payload: CapturePayload,
  files: { file?: Blob | null; thumbnail?: Blob | null },
): Promise<Reference> {
  if (!REFERENCE_TYPES.includes(payload.type)) throw new CaptureError("Unknown type", 400);

  let file = files.file ?? null;
  if (!file && payload.remoteFileUrl) file = await download(payload.remoteFileUrl);
  for (const f of [file, files.thumbnail]) {
    if (f && f.size > MAX_BYTES) throw new CaptureError("File larger than 50 MB", 413);
  }

  let metadata: CaptureMetadata = payload.metadata ?? {};
  if (payload.type === "tweet" && !metadata.text && payload.sourceUrl) {
    metadata = { ...metadata, ...(await tweetOEmbed(payload.sourceUrl)) };
  }

  const uploaded: string[] = [];
  const put = async (blob: Blob | null | undefined) => {
    if (!blob || blob.size === 0) return null;
    const path = `${userId}/${crypto.randomUUID()}.${EXTENSIONS[blob.type] ?? "bin"}`;
    const { error } = await supabase.storage
      .from(CAPTURES_BUCKET)
      .upload(path, blob, { contentType: blob.type || "application/octet-stream" });
    if (error) throw new CaptureError(`Upload failed: ${error.message}`, 500);
    uploaded.push(path);
    return path;
  };

  try {
    const filePath = await put(file);
    const thumbnailPath = (await put(files.thumbnail)) ?? filePath;

    const { data, error } = await supabase
      .from("references")
      .insert({
        user_id: userId,
        type: payload.type,
        source_url: payload.sourceUrl ?? null,
        page_url: payload.pageUrl ?? null,
        title: (payload.title ?? (metadata.text as string | undefined))?.slice(0, 500) ?? null,
        note: payload.note ?? null,
        file_path: filePath,
        thumbnail_path: thumbnailPath,
        metadata,
      })
      .select()
      .single();
    if (error) throw new CaptureError(`Save failed: ${error.message}`, 500);
    const reference = data as Reference;

    if (payload.boardId) await addToBoard(supabase, userId, payload.boardId, [reference]);
    // Analysis is best effort here: the capture is saved either way.
    await enqueueJob(userId, "analyze", { referenceId: reference.id }).catch((e) => console.error(e));
    return reference;
  } catch (err) {
    if (uploaded.length) await supabase.storage.from(CAPTURES_BUCKET).remove(uploaded);
    throw err;
  }
}

/** Fallback when the extension couldn't read the file itself (e.g. CORS-locked images). */
async function download(url: string): Promise<Blob | null> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    const res = await fetch(parsed, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const blob = await res.blob();
    return blob.type.startsWith("image/") && blob.size <= MAX_BYTES ? blob : null;
  } catch {
    return null;
  }
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
