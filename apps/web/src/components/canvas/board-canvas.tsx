"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createShapeId,
  getSnapshot,
  loadSnapshot,
  Tldraw,
  type Editor,
  type TLShapeId,
} from "tldraw";
import "tldraw/tldraw.css";
import { CARD_WIDTH, cardSize, type BoardItem } from "@justcreate/shared";
import type { ReferenceView } from "@/lib/references";
import { uploadImages } from "@/lib/upload";
import { REFERENCE_SHAPE, ReferencesContext, ReferenceShapeUtil, type ReferenceShape } from "./reference-shape";

const shapeUtils = [ReferenceShapeUtil];
const SAVE_DELAY_MS = 800;
export const REFERENCE_DRAG_TYPE = "application/x-justcreate-reference";

export interface CanvasHandle {
  /** Selects the cards for these references and zooms to them. */
  focus(referenceIds: string[]): void;
  /** Places a card for this reference in the middle of the current view. */
  add(reference: ReferenceView): void;
}

/**
 * The board's infinite canvas. The tldraw document is saved (debounced) to the board, and the
 * server keeps board_items in step with the reference cards on it.
 */
export function BoardCanvas({
  boardId,
  document: savedDocument,
  items,
  references,
  onSelectionChange,
  onReady,
  onSaveState,
  onMembershipChange,
}: {
  boardId: string;
  document: unknown;
  items: BoardItem[];
  references: ReferenceView[];
  onSelectionChange: (referenceIds: string[]) => void;
  onReady?: (handle: CanvasHandle) => void;
  onSaveState?: (state: "saved" | "saving" | "error") => void;
  onMembershipChange?: () => void;
}) {
  const [editor, setEditor] = useState<Editor | null>(null);
  // References added on the canvas (sidebar drops, uploads) before the page data refreshes.
  const [extra, setExtra] = useState<Map<string, ReferenceView>>(new Map());
  const remember = useCallback(
    (refs: ReferenceView[]) =>
      setExtra((prev) => {
        const next = new Map(prev);
        for (const r of refs) next.set(r.id, r);
        return next;
      }),
    [],
  );
  const byId = useMemo(() => {
    const map = new Map(extra);
    for (const r of references) map.set(r.id, r);
    return map;
  }, [references, extra]);

  // ---------- saving ----------
  const timer = useRef<number | undefined>(undefined);
  const save = useCallback(async () => {
    if (!editor) return;
    window.clearTimeout(timer.current);
    onSaveState?.("saving");
    const { document } = getSnapshot(editor.store);
    const cards = editor
      .getCurrentPageShapesSorted()
      .filter((s): s is ReferenceShape => s.type === REFERENCE_SHAPE);
    const body = {
      document,
      items: cards.map((s, z) => {
        const b = editor.getShapePageBounds(s)!;
        return { referenceId: s.props.referenceId, x: b.x, y: b.y, w: b.w, h: b.h, z };
      }),
    };
    try {
      const res = await fetch(`/api/boards/${boardId}/canvas`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true,
      });
      onSaveState?.(res.ok ? "saved" : "error");
      // Cards added/removed change board membership: refresh counts, sidebar and clusters.
      const result = res.ok ? ((await res.json()) as { added?: number; removed?: number }) : null;
      if (result && (result.added || result.removed)) onMembershipChange?.();
    } catch {
      onSaveState?.("error");
    }
  }, [editor, boardId, onSaveState, onMembershipChange]);

  useEffect(() => {
    if (!editor) return;
    const stop = editor.store.listen(
      () => {
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => void save(), SAVE_DELAY_MS);
      },
      { source: "user", scope: "document" },
    );
    const flush = () => {
      if (timer.current) void save();
    };
    window.addEventListener("beforeunload", flush);
    return () => {
      stop();
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, [editor, save]);

  // ---------- reconcile cards with board_items ----------
  const knownItems = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!editor) return;
    const current = new Set(items.map((i) => i.reference_id));
    const cards = editor.getCurrentPageShapes().filter((s): s is ReferenceShape => s.type === REFERENCE_SHAPE);
    const onCanvas = new Set(cards.map((c) => c.props.referenceId));

    const missing = items.filter((i) => !onCanvas.has(i.reference_id));
    if (missing.length) {
      editor.createShapes(
        missing.map((i) => ({
          id: createShapeId(),
          type: REFERENCE_SHAPE,
          x: i.x,
          y: i.y,
          props: { w: i.w, h: i.h, referenceId: i.reference_id },
        })),
      );
    }
    // Remove cards only for items that existed before and were removed elsewhere (drawer, other tab).
    const gone = cards.filter((c) => knownItems.current.has(c.props.referenceId) && !current.has(c.props.referenceId));
    if (gone.length) editor.deleteShapes(gone.map((c) => c.id));
    knownItems.current = current;
  }, [editor, items]);

  // ---------- selection → drawer ----------
  useEffect(() => {
    if (!editor) return;
    let last = "";
    return editor.store.listen(
      () => {
        const ids = editor
          .getSelectedShapes()
          .filter((s): s is ReferenceShape => s.type === REFERENCE_SHAPE)
          .map((s) => s.props.referenceId);
        const key = ids.join(",");
        if (key !== last) {
          last = key;
          onSelectionChange(ids);
        }
      },
      { scope: "session" },
    );
  }, [editor, onSelectionChange]);

  // ---------- mount ----------
  const cascade = useRef(0);
  const handleMount = useCallback(
    (ed: Editor) => {
      ed.user.updateUserPreferences({ colorScheme: "system" }); // follow the app's light/dark
      if (savedDocument) {
        try {
          loadSnapshot(ed.store, { document: savedDocument as never });
        } catch (err) {
          console.error("Couldn't load saved canvas; starting from board items", err);
        }
      }
      // Uploads (file drop / paste) become references instead of tldraw image assets.
      ed.registerExternalContentHandler("files", async ({ files, point }) => {
        const local = files.map((f) => URL.createObjectURL(f));
        const saved = await uploadImages(files);
        const origin = point ?? ed.getViewportPageBounds().center;
        remember(saved.map((r, n) => ({ ...r, labels: [], imageUrl: local[n] })));
        saved.forEach((r, n) => placeCard(ed, r, origin.x + n * (CARD_WIDTH + 20), origin.y));
      });
      setEditor(ed);
      onReady?.({
        focus(referenceIds) {
          const ids = ed
            .getCurrentPageShapes()
            .filter((s): s is ReferenceShape => s.type === REFERENCE_SHAPE && referenceIds.includes(s.props.referenceId))
            .map((s) => s.id as TLShapeId);
          ed.setSelectedShapes(ids);
          if (ids.length) ed.zoomToSelection({ animation: { duration: 300 } });
        },
        add(reference) {
          remember([reference]);
          const center = ed.getViewportPageBounds().center;
          // Cascade cards added in a row so they don't land exactly on top of each other.
          const offset = (cascade.current++ % 8) * 36;
          ed.select(placeCard(ed, reference, center.x + offset, center.y + offset));
        },
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once with the initial document
    [],
  );

  // ---------- drop from the library sidebar ----------
  const onDrop = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData(REFERENCE_DRAG_TYPE);
    if (!raw || !editor) return;
    e.preventDefault();
    e.stopPropagation(); // keep tldraw from treating it as a text/url drop
    const reference = JSON.parse(raw) as ReferenceView;
    const point = editor.screenToPage({ x: e.clientX, y: e.clientY });
    remember([reference]);
    editor.select(placeCard(editor, reference, point.x, point.y));
  };

  return (
    <div
      className="relative h-full w-full"
      onDragOverCapture={(e) => {
        if (e.dataTransfer.types.includes(REFERENCE_DRAG_TYPE)) e.preventDefault();
      }}
      onDropCapture={onDrop}
    >
      <ReferencesContext.Provider value={byId}>
        <Tldraw shapeUtils={shapeUtils} onMount={handleMount} />
      </ReferencesContext.Provider>
    </div>
  );
}

/** Card for `reference` centred on (x, y); reuses the existing card if it's already on the canvas. */
function placeCard(ed: Editor, reference: { id: string; metadata: Record<string, unknown> }, x: number, y: number) {
  const existing = ed
    .getCurrentPageShapes()
    .find((s): s is ReferenceShape => s.type === REFERENCE_SHAPE && s.props.referenceId === reference.id);
  if (existing) return existing.id;
  const { w, h } = cardSize(reference.metadata);
  const id = createShapeId();
  ed.createShape({ id, type: REFERENCE_SHAPE, x: x - w / 2, y: y - h / 2, props: { w, h, referenceId: reference.id } });
  return id;
}
