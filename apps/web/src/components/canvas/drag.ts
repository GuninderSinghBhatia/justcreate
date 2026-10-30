import type { DragEvent } from "react";
import type { ReferenceView } from "@/lib/references";

/** dataTransfer type for dragging a saved reference from the sidebar onto the canvas. */
export const REFERENCE_DRAG_TYPE = "application/x-justcreate-reference";

/**
 * The reference being dragged from the sidebar, kept in this window: the drop uses it rather than
 * the dataTransfer text, which another window or site could fill with any URL and id.
 */
let dragging: ReferenceView | null = null;

export function startReferenceDrag(e: DragEvent, reference: ReferenceView) {
  dragging = reference;
  e.dataTransfer.setData(REFERENCE_DRAG_TYPE, reference.id);
  e.dataTransfer.effectAllowed = "copy";
}

export function endReferenceDrag() {
  dragging = null;
}

/** The dragged reference, if this drop came from our own sidebar. */
export function droppedReference(e: DragEvent): ReferenceView | null {
  const id = e.dataTransfer.getData(REFERENCE_DRAG_TYPE);
  return id && dragging?.id === id ? dragging : null;
}
