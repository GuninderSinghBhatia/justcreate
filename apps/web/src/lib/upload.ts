import type { CapturePayload, Reference } from "@justcreate/shared";

/**
 * Uploads dropped or pasted image files from the web app (session cookie auth); they land on the
 * board. One file failing doesn't stop the rest: what was saved is returned, and if any failed the
 * error says how many (and why, for the first).
 */
export async function uploadImages(files: File[]): Promise<Reference[]> {
  const images = files.filter((f) => f.type.startsWith("image/"));
  const saved: Reference[] = [];
  const failed: string[] = [];
  for (const file of images) {
    try {
      saved.push(await uploadOne(file));
    } catch (err) {
      failed.push(err instanceof Error ? err.message : "Upload failed");
    }
  }
  if (failed.length) {
    const what = failed.length === images.length ? "Upload failed" : `${saved.length} saved, ${failed.length} failed`;
    throw Object.assign(new Error(`${what}: ${failed[0]}`), { saved });
  }
  return saved;
}

async function uploadOne(file: File): Promise<Reference> {
  const size = await imageSize(file);
  const meta: CapturePayload = {
    type: "image",
    title: file.name.replace(/\.[^.]+$/, ""),
    metadata: { uploaded: true, ...size },
  };
  const form = new FormData();
  form.set("meta", JSON.stringify(meta));
  form.set("file", file);
  const res = await fetch("/api/captures", { method: "POST", body: form });
  const body = (await res.json().catch(() => ({}))) as { reference?: Reference; error?: string };
  if (!res.ok || !body.reference) throw new Error(body.error ?? `Upload failed (${res.status})`);
  return body.reference;
}

async function imageSize(file: File) {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return {};
  }
}
