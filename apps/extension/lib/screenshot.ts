import type { FullPageInfo, Rect } from './messages';

// Chrome allows at most 2 captureVisibleTab calls per second.
const MIN_CAPTURE_GAP_MS = 550;
// Canvas height limit is 32767; stay under it.
const MAX_CANVAS_HEIGHT = 32000;

let lastCapture = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function captureVisible(windowId: number): Promise<Blob> {
  const wait = lastCapture + MIN_CAPTURE_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCapture = Date.now();
  const dataUrl = await browser.tabs.captureVisibleTab(windowId, { format: 'png' });
  return (await fetch(dataUrl)).blob();
}

/** Crops a viewport screenshot to `rect` (CSS px). `viewportWidth` gives the CSS→image scale. */
export async function crop(shot: Blob, rect: Rect, viewportWidth: number): Promise<Blob> {
  const bitmap = await createImageBitmap(shot);
  const scale = bitmap.width / viewportWidth;
  const sx = clamp(Math.round(rect.x * scale), 0, bitmap.width - 1);
  const sy = clamp(Math.round(rect.y * scale), 0, bitmap.height - 1);
  const sw = clamp(Math.round(rect.width * scale), 1, bitmap.width - sx);
  const sh = clamp(Math.round(rect.height * scale), 1, bitmap.height - sy);

  const canvas = new OffscreenCanvas(sw, sh);
  canvas.getContext('2d')!.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  bitmap.close();
  return canvas.convertToBlob({ type: 'image/png' });
}

export interface FullPageDriver {
  start(): Promise<FullPageInfo>;
  scrollTo(y: number): Promise<number>;
  hideFixed(): Promise<void>;
  end(): Promise<void>;
}

/** Scrolls the page one viewport at a time, captures each, and stitches them into one JPEG. */
export async function captureFullPage(windowId: number, page: FullPageDriver): Promise<Blob> {
  const info = await page.start();
  try {
    const first = await createImageBitmap(await captureVisible(windowId));
    const scale = first.width / info.innerWidth;
    const height = Math.min(Math.round(info.scrollHeight * scale), MAX_CANVAS_HEIGHT);
    const canvas = new OffscreenCanvas(first.width, height);
    const ctx = canvas.getContext('2d')!;

    // Frame 0 was taken at scrollY 0 by start().
    ctx.drawImage(first, 0, 0);
    first.close();
    await page.hideFixed(); // sticky headers would repeat in every frame otherwise

    const maxY = Math.min(info.scrollHeight, MAX_CANVAS_HEIGHT / scale) - info.innerHeight;
    for (let target = info.innerHeight; target - info.innerHeight < maxY; target += info.innerHeight) {
      const actualY = await page.scrollTo(Math.min(target, maxY));
      const frame = await createImageBitmap(await captureVisible(windowId));
      ctx.drawImage(frame, 0, Math.round(actualY * scale));
      frame.close();
      if (actualY >= maxY) break;
    }
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.88 });
  } finally {
    await page.end();
  }
}

export async function imageSize(blob: Blob): Promise<{ width: number; height: number } | undefined> {
  try {
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return undefined; // e.g. SVG in a worker
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
