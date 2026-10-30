import { NextResponse } from "next/server";
import type { CapturePayload, CaptureResponse } from "@justcreate/shared";
import { CaptureError, MAX_BYTES, parsePayload, saveCapture } from "@/lib/capture";
import { allow, enter } from "@/lib/rate-limit";
import { requestUser } from "@/lib/request-user";

function json(body: CaptureResponse, status = 200) {
  return NextResponse.json(body, { status });
}

/**
 * Saves one capture: multipart with `meta` (CapturePayload JSON), optional `file`, and optional
 * `thumbnail` (a smaller card image, e.g. a viewport screenshot for a full-page capture).
 * Authenticates with a bearer token (extension) or the session cookie (web uploads).
 */
export async function POST(request: Request) {
  const auth = await requestUser(request);
  if (!auth) return json({ error: "Not signed in" }, 401);
  if (!allow(`captures:${auth.user.id}`, 60)) return json({ error: "Too many captures at once. Wait a minute." }, 429);

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
    return await save(auth, payload, form);
  } finally {
    leave();
  }
}

async function save(auth: NonNullable<Awaited<ReturnType<typeof requestUser>>>, payload: CapturePayload, form: FormData) {
  const blob = (name: string) => (form.get(name) instanceof Blob ? (form.get(name) as Blob) : null);
  try {
    const reference = await saveCapture(auth.supabase, auth.user.id, payload, {
      file: blob("file"),
      thumbnail: blob("thumbnail"),
    });
    return json({ reference }, 201);
  } catch (err) {
    if (err instanceof CaptureError) return json({ error: err.message }, err.status);
    throw err;
  }
}
