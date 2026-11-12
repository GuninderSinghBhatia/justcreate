import { NextResponse } from "next/server";
import { CAPTURES_BUCKET, type ImageType, type UploadResponse } from "@justcreate/shared";
import { capturePath, EXTENSIONS, MAX_BYTES } from "@/lib/capture";
import { DEMO_REFUSAL, isDemoUser } from "@/lib/demo";
import { allow } from "@/lib/rate-limit";
import { requestUser } from "@/lib/request-user";

function json(body: UploadResponse, status = 200) {
  return NextResponse.json(body, { status });
}

/**
 * Hands out signed upload URLs for a capture's file and thumbnail: the client PUTs the original
 * bytes straight to storage (no size limit of the web host in between), then POSTs the capture with
 * the paths to /api/captures, which checks the files before saving. Body: UploadRequest.
 */
export async function POST(request: Request) {
  const auth = await requestUser(request);
  if (!auth) return json({ error: "Not signed in" }, 401);
  if (isDemoUser(auth.user)) return json({ error: DEMO_REFUSAL }, 403);
  if (!allow(`uploads:${auth.user.id}`, 120)) return json({ error: "Too many captures at once. Wait a minute." }, 429);

  const body = (await request.json().catch(() => null)) as { files?: unknown } | null;
  const files = Array.isArray(body?.files) ? body.files : null;
  if (!files || files.length < 1 || files.length > 2) return json({ error: "files must list 1 or 2 images" }, 400);
  const types: ImageType[] = [];
  for (const f of files as { type?: unknown; size?: unknown }[]) {
    if (typeof f?.type !== "string" || !Object.hasOwn(EXTENSIONS, f.type)) {
      return json({ error: "Only JPEG, PNG, GIF, WebP or AVIF images can be saved" }, 415);
    }
    const size = Number(f.size);
    if (!(size > 0)) return json({ error: "The file is empty" }, 400);
    if (size > MAX_BYTES) return json({ error: "File larger than 50 MB" }, 413);
    types.push(f.type as ImageType);
  }

  const uploads: { path: string; url: string }[] = [];
  for (const type of types) {
    const path = capturePath(auth.user.id, type);
    const { data, error } = await auth.supabase.storage.from(CAPTURES_BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      console.error("upload ticket:", error?.message);
      return json({ error: "Upload failed. Try again." }, 500);
    }
    uploads.push({ path, url: data.signedUrl });
  }
  return json({ uploads });
}
