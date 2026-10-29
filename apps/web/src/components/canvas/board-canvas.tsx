"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  Excalidraw,
  FONT_FAMILY,
  getSceneVersion,
  MainMenu,
  newElementWith,
  THEME,
  useHandleLibrary,
  viewportCoordsToSceneCoords,
  WelcomeScreen,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawElement, ExcalidrawImageElement, FileId } from "@excalidraw/excalidraw/element/types";
import type { AppState, BinaryFileData, BinaryFiles, DataURL, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { cardSize, type BoardItem } from "@justcreate/shared";
import type { ReferenceView } from "@/lib/references";
import { uploadImages } from "@/lib/upload";
import { REFERENCE_DRAG_TYPE } from "./drag";

const SAVE_DELAY_MS = 800;
const LIBRARY_KEY = "justcreate:excalidraw-library";

export interface CanvasHandle {
  /** Selects the images for these references and zooms to them. */
  focus(referenceIds: string[]): void;
  /** Places an image for this reference in the middle of the current view. */
  add(reference: ReferenceView): void;
}

/** What boards.document holds. Image files aren't stored: each reference image is reloaded from storage. */
interface SavedScene {
  type: "excalidraw";
  elements: ExcalidrawElement[];
}

/** The reference a canvas image stands for (references are images tagged in customData). */
const referenceIdOf = (el: ExcalidrawElement): string | undefined =>
  el.type === "image" && !el.isDeleted ? (el.customData?.referenceId as string | undefined) : undefined;

/**
 * The board: a full Excalidraw canvas. Saved references are image elements tagged with their
 * reference id; everything else (shapes, arrows, text, frames, freehand) is ordinary Excalidraw.
 * The scene is saved (debounced) to the board, and the server keeps board_items in step with the
 * reference images on it. Images dropped, pasted or inserted on the canvas are uploaded as references.
 */
export function BoardCanvas({
  boardId,
  boardName,
  document: savedDocument,
  items,
  references,
  onSelectionChange,
  onReady,
  onSaveState,
  onMembershipChange,
}: {
  boardId: string;
  boardName: string;
  document: unknown;
  items: BoardItem[];
  references: ReferenceView[];
  onSelectionChange: (referenceIds: string[]) => void;
  onReady?: (handle: CanvasHandle) => void;
  onSaveState?: (state: "saved" | "saving" | "error") => void;
  onMembershipChange?: () => void;
}) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const theme = useSyncExternalStore(subscribeScheme, () => (darkQuery()?.matches ? THEME.DARK : THEME.LIGHT), () => THEME.LIGHT);

  // References added on the canvas (sidebar drops, uploads) before the page data refreshes.
  const extra = useRef(new Map<string, ReferenceView>());
  const byId = useMemo(() => new Map(references.map((r) => [r.id, r])), [references]);
  const lookup = useCallback((id: string) => byId.get(id) ?? extra.current.get(id), [byId]);

  // Saved scene plus any board items it doesn't have yet (captured since the last save).
  const [initialData] = useState(() => {
    const doc = savedDocument as SavedScene | null;
    const saved = doc?.type === "excalidraw" && Array.isArray(doc.elements) ? doc.elements : [];
    const present = new Set(saved.map(referenceIdOf));
    const missing = items.filter((i) => !present.has(i.reference_id));
    return {
      elements: [...saved, ...convertToExcalidrawElements(missing.map((i) => imageSkeleton(i.reference_id, i.x, i.y, i.w, i.h)))],
      appState: { currentItemFontFamily: FONT_FAMILY.Virgil },
      scrollToContent: true,
    };
  });

  // ---------- reference images: load files, fit crops ----------
  const loading = useRef(new Set<string>());
  const loadFiles = useCallback(
    (ed: ExcalidrawImperativeAPI) => {
      const files = ed.getFiles();
      for (const el of ed.getSceneElements()) {
        const refId = referenceIdOf(el);
        const fileId = (el as ExcalidrawImageElement).fileId;
        if (!refId || !fileId || files[fileId] || loading.current.has(fileId)) continue;
        const reference = lookup(refId);
        if (!reference) continue; // retried when the page data arrives
        loading.current.add(fileId);
        void imageFor(reference, el.width, el.height)
          .then(({ dataURL, mimeType, width, height }) => {
            ed.addFiles([{ id: fileId, dataURL, mimeType, created: Date.now() }]);
            fitCrops(ed, fileId, width, height);
          })
          .catch((err) => console.error("Couldn't load reference image", refId, err))
          .finally(() => loading.current.delete(fileId));
      }
    },
    [lookup],
  );
  useEffect(() => {
    if (api) loadFiles(api);
  }, [api, loadFiles]);

  // ---------- images added on the canvas become references ----------
  const uploading = useRef(new Set<string>());
  const uploadNew = useCallback((ed: ExcalidrawImperativeAPI, files: BinaryFiles) => {
    for (const el of ed.getSceneElements()) {
      if (el.type !== "image" || el.customData?.referenceId || !el.fileId) continue;
      const file = files[el.fileId];
      if (!file || uploading.current.has(el.id)) continue;
      uploading.current.add(el.id);
      void (async () => {
        try {
          const blob = await (await fetch(file.dataURL)).blob();
          const [saved] = await uploadImages([new File([blob], `canvas.${blob.type.split("/")[1] ?? "png"}`, { type: blob.type })]);
          extra.current.set(saved.id, { ...saved, labels: [], imageUrl: file.dataURL });
          ed.updateScene({
            elements: ed
              .getSceneElementsIncludingDeleted()
              .map((e) => (e.id === el.id ? newElementWith(e, { customData: { ...e.customData, referenceId: saved.id } }) : e)),
            captureUpdate: CaptureUpdateAction.NEVER,
          });
        } catch (err) {
          ed.setToast({ message: err instanceof Error ? err.message : "Couldn't save that image", closable: true });
        }
      })();
    }
  }, []);

  // ---------- saving ----------
  const timer = useRef<number | undefined>(undefined);
  const lastVersion = useRef<number | null>(null);
  // References this canvas has shown: only these can be removed by deleting their image.
  const seen = useRef(new Set(items.map((i) => i.reference_id)));
  // References deleted on this canvas: a refresh that raced the save mustn't bring them back.
  const removedHere = useRef(new Set<string>());
  const save = useCallback(async () => {
    if (!api) return;
    window.clearTimeout(timer.current);
    timer.current = undefined;
    onSaveState?.("saving");
    // Images still uploading have no reference yet; they're saved once they do.
    const elements = api.getSceneElements().filter((el) => el.type !== "image" || referenceIdOf(el));
    const placed = elements.flatMap((el, z) => {
      const referenceId = referenceIdOf(el);
      return referenceId ? [{ referenceId, x: el.x, y: el.y, w: el.width, h: el.height, z }] : [];
    });
    const present = new Set(placed.map((i) => i.referenceId));
    const removed = [...seen.current].filter((id) => !present.has(id));
    try {
      const res = await fetch(`/api/boards/${boardId}/canvas`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: { type: "excalidraw", elements } satisfies SavedScene, items: placed, removed }),
        keepalive: true,
      });
      onSaveState?.(res.ok ? "saved" : "error");
      if (!res.ok) return;
      for (const id of present) seen.current.add(id);
      for (const id of removed) {
        seen.current.delete(id);
        removedHere.current.add(id);
      }
      // Images added/removed change board membership: refresh counts, sidebar and clusters.
      const result = (await res.json()) as { added?: number; removed?: number };
      if (result.added || result.removed) onMembershipChange?.();
    } catch {
      onSaveState?.("error");
    }
  }, [api, boardId, onSaveState, onMembershipChange]);

  useEffect(() => {
    const flush = () => {
      if (timer.current) void save();
    };
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, [save]);

  // ---------- selection → drawer ----------
  const lastSelection = useRef("");
  const onChange = (elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
    if (!api) return;
    const ids = elements.filter((el) => appState.selectedElementIds[el.id]).flatMap((el) => referenceIdOf(el) ?? []);
    const key = ids.join(",");
    if (key !== lastSelection.current) {
      lastSelection.current = key;
      onSelectionChange(ids);
    }

    // Only scene edits save; scrolling, zooming and selecting fire onChange too.
    const version = getSceneVersion(elements);
    if (version === lastVersion.current) return;
    const loaded = lastVersion.current === null; // the first scene is the saved one, not an edit
    lastVersion.current = version;
    loadFiles(api);
    uploadNew(api, files);
    if (loaded) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(), SAVE_DELAY_MS);
  };

  // ---------- reconcile images with board_items (captures, drawer removals, other tabs) ----------
  const knownItems = useRef(items);
  useEffect(() => {
    if (!api || items === knownItems.current) return;
    const known = new Set(knownItems.current.map((i) => i.reference_id));
    const current = new Set(items.map((i) => i.reference_id));
    knownItems.current = items;

    const all = api.getSceneElementsIncludingDeleted();
    const onCanvas = new Set(all.map(referenceIdOf));
    // New items only: one this canvas has seen but no longer shows was deleted here (save pending).
    const missing = items.filter(
      (i) => !onCanvas.has(i.reference_id) && !seen.current.has(i.reference_id) && !removedHere.current.has(i.reference_id),
    );
    for (const id of current) seen.current.add(id);
    // Remove images only for items that existed before and were removed elsewhere.
    const gone = new Set(
      all.filter((el) => {
        const id = referenceIdOf(el);
        return id && known.has(id) && !current.has(id);
      }).map((el) => el.id),
    );
    if (!missing.length && !gone.size) return;
    api.updateScene({
      elements: [
        ...all.map((el) => (gone.has(el.id) ? newElementWith(el, { isDeleted: true }) : el)),
        ...convertToExcalidrawElements(missing.map((i) => imageSkeleton(i.reference_id, i.x, i.y, i.w, i.h))),
      ],
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    loadFiles(api);
  }, [api, items, loadFiles]);

  const place = useCallback(
    (ed: ExcalidrawImperativeAPI, reference: ReferenceView, x: number, y: number) => {
      extra.current.set(reference.id, reference);
      removedHere.current.delete(reference.id); // put back on purpose
      const existing = ed.getSceneElements().find((el) => referenceIdOf(el) === reference.id);
      let id = existing?.id;
      if (!existing) {
        const { w, h } = cardSize(reference.metadata);
        const [el] = convertToExcalidrawElements([imageSkeleton(reference.id, x - w / 2, y - h / 2, w, h)]);
        id = el.id;
        ed.updateScene({ elements: [...ed.getSceneElementsIncludingDeleted(), el], captureUpdate: CaptureUpdateAction.IMMEDIATELY });
      }
      ed.updateScene({ appState: { selectedElementIds: { [id!]: true } }, captureUpdate: CaptureUpdateAction.NEVER });
      loadFiles(ed);
    },
    [loadFiles],
  );

  // ---------- handle for the workspace ----------
  const cascade = useRef(0);
  useEffect(() => {
    if (!api) return;
    onReady?.({
      focus(referenceIds) {
        const wanted = new Set(referenceIds);
        const els = api.getSceneElements().filter((el) => wanted.has(referenceIdOf(el) ?? ""));
        api.updateScene({
          appState: { selectedElementIds: Object.fromEntries(els.map((el) => [el.id, true as const])) },
          captureUpdate: CaptureUpdateAction.NEVER,
        });
        if (!els.length) return;
        api.scrollToContent(els, { fitToContent: true, animate: true, duration: 300 });
        // Keys (Delete, arrows, Ctrl+G) act on the selection straight away.
        container.current?.querySelector<HTMLElement>(".excalidraw")?.focus();
      },
      add(reference) {
        const st = api.getAppState();
        const center = viewportCoordsToSceneCoords(
          { clientX: st.offsetLeft + st.width / 2, clientY: st.offsetTop + st.height / 2 },
          st,
        );
        // Cascade images added in a row so they don't land exactly on top of each other.
        const offset = (cascade.current++ % 8) * 36;
        place(api, reference, center.x + offset, center.y + offset);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onReady is an inline callback
  }, [api, place]);

  // ---------- drop from the library sidebar ----------
  const onDrop = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData(REFERENCE_DRAG_TYPE);
    if (!raw || !api) return;
    e.preventDefault();
    e.stopPropagation(); // keep Excalidraw from treating it as a text drop
    const point = viewportCoordsToSceneCoords({ clientX: e.clientX, clientY: e.clientY }, api.getAppState());
    place(api, JSON.parse(raw) as ReferenceView, point.x, point.y);
  };

  // Excalidraw's own shape library, kept in this browser.
  useHandleLibrary({
    excalidrawAPI: api,
    adapter: {
      load: () => {
        try {
          return { libraryItems: JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? "[]") };
        } catch {
          return null;
        }
      },
      save: ({ libraryItems }) => {
        try {
          localStorage.setItem(LIBRARY_KEY, JSON.stringify(libraryItems));
        } catch {
          // storage full or blocked: the library just won't persist
        }
      },
    },
  });

  return (
    <div
      ref={container}
      className="board-canvas relative h-full w-full"
      onDragOverCapture={(e) => {
        if (e.dataTransfer.types.includes(REFERENCE_DRAG_TYPE)) e.preventDefault();
      }}
      onDropCapture={onDrop}
    >
      <Excalidraw
        excalidrawAPI={setApi}
        initialData={initialData}
        onChange={onChange}
        theme={theme}
        name={boardName}
        showDeprecatedFonts
        // Opening a file would replace the board (and take every reference off it).
        UIOptions={{ canvasActions: { loadScene: false } }}
      >
        <MainMenu>
          <MainMenu.DefaultItems.SaveToActiveFile />
          <MainMenu.DefaultItems.Export />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.SearchMenu />
          <MainMenu.DefaultItems.CommandPalette />
          <MainMenu.DefaultItems.Help />
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.Separator />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
        </MainMenu>
        <WelcomeScreen>
          <WelcomeScreen.Hints.MenuHint />
          <WelcomeScreen.Hints.ToolbarHint />
          <WelcomeScreen.Hints.HelpHint />
          <WelcomeScreen.Center>
            <WelcomeScreen.Center.Heading>
              Save designs with the extension, or drop and paste images here. Draw around them, group them, annotate them.
            </WelcomeScreen.Center.Heading>
          </WelcomeScreen.Center>
        </WelcomeScreen>
      </Excalidraw>
    </div>
  );
}

function imageSkeleton(referenceId: string, x: number, y: number, w: number, h: number) {
  return {
    type: "image" as const,
    x,
    y,
    width: w,
    height: h,
    // One file per reference; duplicates of the image share it.
    fileId: `ref-${referenceId}` as FileId,
    status: "saved" as const,
    customData: { referenceId },
  };
}

/** The reference's thumbnail as a data URL (so exports and copies work), or a text card when it has no image. */
async function imageFor(reference: ReferenceView, w: number, h: number) {
  if (reference.imageUrl) {
    const blob = await (await fetch(reference.imageUrl)).blob();
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    const mimeType = (blob.type.startsWith("image/") ? blob.type : "image/png") as BinaryFileData["mimeType"];
    return { dataURL: (await blobToDataURL(blob)) as DataURL, mimeType, ...size };
  }
  const svg = textCard((reference.metadata as { text?: string }).text ?? reference.title ?? reference.source_url ?? reference.type, w, h);
  const dataURL = `data:image/svg+xml;base64,${btoa(String.fromCharCode(...new TextEncoder().encode(svg)))}` as DataURL;
  return { dataURL, mimeType: "image/svg+xml" as BinaryFileData["mimeType"], width: w, height: h };
}

/** Crops images whose box has another aspect ratio (tall screenshots): keeps the top, like object-fit cover. */
function fitCrops(ed: ExcalidrawImperativeAPI, fileId: FileId, naturalWidth: number, naturalHeight: number) {
  const natural = naturalHeight / naturalWidth;
  let changed = false;
  const elements = ed.getSceneElementsIncludingDeleted().map((el) => {
    if (el.type !== "image" || el.fileId !== fileId || el.crop) return el;
    const box = el.height / el.width;
    if (Math.abs(box - natural) / natural < 0.02) return el;
    changed = true;
    const crop =
      natural > box
        ? { x: 0, y: 0, width: naturalWidth, height: naturalWidth * box, naturalWidth, naturalHeight }
        : { x: (naturalWidth - naturalHeight / box) / 2, y: 0, width: naturalHeight / box, height: naturalHeight, naturalWidth, naturalHeight };
    return newElementWith(el, { crop });
  });
  if (changed) ed.updateScene({ elements, captureUpdate: CaptureUpdateAction.NEVER });
}

function blobToDataURL(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** A paper card with the reference's text, for posts and links saved without an image. */
function textCard(text: string, w: number, h: number) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot" }[c]};`);
  const perLine = Math.max(10, Math.floor((w - 32) / 7.5));
  const lines: string[] = [];
  for (const word of text.replace(/\s+/g, " ").trim().split(" ")) {
    const last = lines.at(-1);
    if (last !== undefined && (last + " " + word).length <= perLine) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word.slice(0, perLine));
  }
  const fit = lines.slice(0, Math.max(1, Math.floor((h - 32) / 20)));
  if (fit.length < lines.length) fit[fit.length - 1] += " …";
  const tspans = fit.map((l, i) => `<tspan x="16" dy="${i ? 20 : 0}">${esc(l)}</tspan>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#fdfbf6" stroke="#1e1e1e" stroke-width="1.5"/><text x="16" y="30" font-family="Nunito, system-ui, sans-serif" font-size="14" fill="#1e1e1e">${tspans}</text></svg>`;
}

const darkQuery = () => (typeof window === "undefined" ? null : window.matchMedia("(prefers-color-scheme: dark)"));
function subscribeScheme(onChange: () => void) {
  const q = darkQuery();
  q?.addEventListener("change", onChange);
  return () => q?.removeEventListener("change", onChange);
}
