import type { CapturePayload, Reference } from "@justcreate/shared";

/** Uploads dropped or pasted image files from the web app (session cookie auth). */
export async function uploadImages(files: File[], boardId?: string): Promise<Reference[]> {
  const images = files.filter((f) => f.type.startsWith("image/"));
  const saved: Reference[] = [];
  for (const file of images) {
    const size = await imageSize(file);
    const meta: CapturePayload = {
      type: "image",
      title: file.name.replace(/\.[^.]+$/, ""),
      boardId,
      metadata: { uploaded: true, ...size },
    };
    const form = new FormData();
    form.set("meta", JSON.stringify(meta));
    form.set("file", file);
    const res = await fetch("/api/captures", { method: "POST", body: form });
    const body = (await res.json()) as { reference?: Reference; error?: string };
    if (!res.ok || !body.reference) throw new Error(body.error ?? `Upload failed (${res.status})`);
    saved.push(body.reference);
  }
  return saved;
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
