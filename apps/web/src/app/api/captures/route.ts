import { NextResponse } from "next/server";
import {
  CAPTURES_BUCKET,
  REFERENCE_TYPES,
  type CapturePayload,
  type CaptureResponse,
} from "@justcreate/shared";
import { bearerToken, createBearerClient } from "@/lib/supabase/server";

const MAX_BYTES = 50 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};

function json(body: CaptureResponse, status = 200) {
  return NextResponse.json(body, { status });
}

/** Saves one capture from the extension: optional file + metadata → storage + a references row. */
export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) return json({ error: "Missing bearer token" }, 401);

  const supabase = createBearerClient(token);
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) return json({ error: "Invalid or expired token" }, 401);

  const form = await request.formData().catch(() => null);
  if (!form) return json({ error: "Expected multipart/form-data" }, 400);

  let payload: CapturePayload;
  try {
    payload = JSON.parse(String(form.get("meta") ?? ""));
  } catch {
    return json({ error: "meta must be JSON" }, 400);
  }
  if (!REFERENCE_TYPES.includes(payload.type)) return json({ error: "Unknown type" }, 400);

  let file: Blob | null = form.get("file") instanceof Blob ? (form.get("file") as Blob) : null;
  if (!file && payload.remoteFileUrl) file = await download(payload.remoteFileUrl);
  if (file && file.size > MAX_BYTES) return json({ error: "File larger than 50 MB" }, 413);

  let filePath: string | null = null;
  if (file && file.size > 0) {
    const ext = EXTENSIONS[file.type] ?? "bin";
    filePath = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from(CAPTURES_BUCKET)
      .upload(filePath, file, { contentType: file.type || "application/octet-stream" });
    if (error) return json({ error: `Upload failed: ${error.message}` }, 500);
  }

  const { data: reference, error } = await supabase
    .from("references")
    .insert({
      user_id: user.id,
      type: payload.type,
      source_url: payload.sourceUrl ?? null,
      page_url: payload.pageUrl ?? null,
      title: payload.title?.slice(0, 500) ?? null,
      note: payload.note ?? null,
      file_path: filePath,
      thumbnail_path: filePath,
      metadata: payload.metadata ?? {},
    })
    .select()
    .single();

  if (error) {
    if (filePath) await supabase.storage.from(CAPTURES_BUCKET).remove([filePath]);
    return json({ error: `Save failed: ${error.message}` }, 500);
  }
  return json({ reference }, 201);
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
