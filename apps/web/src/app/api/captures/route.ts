import { NextResponse } from "next/server";
import type { CapturePayload, CaptureResponse } from "@justcreate/shared";
import { CaptureError, MAX_BYTES, parsePayload, saveCapture, type StoredFile } from "@/lib/capture";
import { DEMO_REFUSAL, isDemoUser } from "@/lib/demo";
import { allow, enter } from "@/lib/rate-limit";
import { requestUser } from "@/lib/request-user";

function json(body: CaptureResponse, status = 200) {
  return NextResponse.json(body, { status });
}

type Auth = NonNullable<Awaited<ReturnType<typeof requestUser>>>;

/**
 * Saves one capture. Two shapes:
 * - JSON (CaptureRequest): `meta` plus the paths of files already uploaded through
 *   /api/captures/uploads. What the app and extension send: files of any size skip this server.
 * - multipart (older extensions): `meta` (CapturePayload JSON), optional `file`, and optional
 *   `thumbnail` (a smaller card image, e.g. a viewport screenshot for a full-page capture).
 * Authenticates with a bearer token (extension) or the session cookie (web uploads).
 */
export async function POST(request: Request) {
  const auth = await requestUser(request);
  if (!auth) return json({ error: "Not signed in" }, 401);
  if (isDemoUser(auth.user)) return json({ error: DEMO_REFUSAL }, 403);
  if (!allow(`captures:${auth.user.id}`, 60)) return json({ error: "Too many captures at once. Wait a minute." }, 429);

  if (request.headers.get("content-type")?.startsWith("application/json")) return saveJson(auth, request);

  // The body is read into memory below, so its size is checked first: a file and a thumbnail at
  // most. Browsers and the extension always send a Content-Length for multipart bodies.
  const length = Number(request.headers.get("content-length"));
  if (!length) return json({ error: "Content-Length required" }, 411);
  if (length > 2 * MAX_BYTES + 1024 * 1024) return json({ error: "File larger than 50 MB" }, 413);

  // Each request holds its files in memory: a few at a time per user.
  const leave = enter(`captures:${auth.user.id}`, 3);
  if (!leave) return json({ error: "Too many captures at once. Wait a moment." }, 429);
  try {
    const form = await request.formData().catch(() => null);
    if (!form) return json({ error: "Expected multipart/form-data" }, 400);

    let payload: CapturePayload | null;
    try {
      payload = parsePayload(JSON.parse(String(form.get("meta") ?? "")));
    } catch {
      payload = null;
    }
    if (!payload) return json({ error: "meta must be a capture object (JSON)" }, 400);
    const blob = (name: string) => (form.get(name) instanceof Blob ? (form.get(name) as Blob) : null);
    return await save(auth, payload, { file: blob("file"), thumbnail: blob("thumbnail") });
  } finally {
    leave();
  }
}

async function saveJson(auth: Auth, request: Request) {
  if (Number(request.headers.get("content-length")) > 64 * 1024) return json({ error: "Capture too large" }, 413);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const payload = body ? parsePayload(body.meta) : null;
  if (!payload) return json({ error: "meta must be a capture object (JSON)" }, 400);
  const stored = (v: unknown): StoredFile | null => (typeof v === "string" && v ? { path: v } : null);
  return save(auth, payload, { file: stored(body?.filePath), thumbnail: stored(body?.thumbnailPath) });
}

async function save(auth: Auth, payload: CapturePayload, files: Parameters<typeof saveCapture>[3]) {
  try {
    const reference = await saveCapture(auth.supabase, auth.user.id, payload, files);
    return json({ reference }, 201);
  } catch (err) {
    if (err instanceof CaptureError) return json({ error: err.message }, err.status);
    throw err;
  }
}
