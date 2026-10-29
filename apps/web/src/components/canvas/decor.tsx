"use client";

import { useSyncExternalStore } from "react";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";

/**
 * Pinned-print decoration for the board's images, drawn in DOM layers around Excalidraw's canvases
 * (which have a transparent background): a paper mat and shadow under each image, a strip of washi
 * tape over its top edge. The tape layer sits between Excalidraw's static canvas (z 1) and its
 * selection canvas (z 2), so handles stay on top. Positions follow scroll, zoom and drags via update().
 */

interface Pin {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  angle: number;
  zoom: number;
  /** Tape: hidden where a later image covers the top edge. */
  tape: { color: string; width: number; tilt: number } | null;
}

/** Washi tape colours, pastel and translucent. */
const TAPES = ["#f4c7c3", "#fbe3a1", "#c8e6c9", "#bbdefb", "#e1bee7", "#ffd8b1", "#b2ebf2"];
const MAT = 6; // paper border around a print, in scene px
const TAPE_HEIGHT = 22;

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

export function createDecor() {
  let pins: Pin[] = [];
  const listeners = new Set<() => void>();
  let frame = 0;
  let pending: { elements: readonly ExcalidrawElement[]; appState: AppState } | null = null;

  const compute = (elements: readonly ExcalidrawElement[], appState: AppState): Pin[] => {
    const zoom = appState.zoom.value;
    const images = elements.filter((el) => el.type === "image" && !el.isDeleted);
    return images.flatMap((el, i) => {
      const left = (el.x + appState.scrollX) * zoom;
      const top = (el.y + appState.scrollY) * zoom;
      const width = el.width * zoom;
      const height = el.height * zoom;
      const margin = 80 * zoom;
      if (left > appState.width + margin || top > appState.height + margin || left + width < -margin || top + height < -margin) return [];

      const h = hash(el.customData?.referenceId ?? el.id);
      const tapeWidth = Math.min(96, Math.max(48, el.width * 0.32));
      // Tape centre (top edge, in scene coords): skip it when a later image lies over that spot.
      const cx = el.x + el.width / 2;
      const cy = el.y;
      const covered = images.slice(i + 1).some((o) => cx > o.x && cx < o.x + o.width && cy > o.y && cy < o.y + o.height);
      return [
        {
          id: el.id,
          left,
          top,
          width,
          height,
          angle: el.angle,
          zoom,
          tape: covered ? null : { color: TAPES[h % TAPES.length], width: tapeWidth, tilt: (((h >> 3) % 9) - 4) * (Math.PI / 180) },
        },
      ];
    });
  };

  return {
    /** Call from Excalidraw's onChange; recomputes at most once per frame. */
    update(elements: readonly ExcalidrawElement[], appState: AppState) {
      pending = { elements, appState };
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!pending) return;
        pins = compute(pending.elements, pending.appState);
        pending = null;
        for (const l of listeners) l();
      });
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get: () => pins,
  };
}

export type Decor = ReturnType<typeof createDecor>;

const EMPTY: Pin[] = [];
const usePins = (decor: Decor) => useSyncExternalStore(decor.subscribe, decor.get, () => EMPTY);

const place = (p: Pin, extra = 0) =>
  `translate(${p.left - extra}px, ${p.top - extra}px) rotate(${p.angle}rad)`;

/** Under the canvas: paper texture, then a mat and soft shadow under each print. */
export function DecorUnder({ decor }: { decor: Decor }) {
  const pins = usePins(decor);
  return (
    <div aria-hidden className="board-paper pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {pins.map((p) => {
        const m = MAT * p.zoom;
        return (
          <div
            key={p.id}
            className="board-mat absolute top-0 left-0 origin-center"
            style={{ width: p.width + 2 * m, height: p.height + 2 * m, transform: place(p, m) }}
          />
        );
      })}
    </div>
  );
}

/** Over the images, under Excalidraw's selection canvas: washi tape on each print. */
export function DecorOver({ decor }: { decor: Decor }) {
  const pins = usePins(decor);
  // Rendered after Excalidraw at z 1: above its static canvas, below its handles and toolbars.
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
      {pins.map((p) => {
        if (!p.tape) return null;
        const w = p.tape.width * p.zoom;
        const h = TAPE_HEIGHT * p.zoom;
        return (
          // Rotates with the print about its centre, then sits centred on its top edge.
          <div
            key={p.id}
            className="absolute top-0 left-0 origin-center"
            style={{ width: p.width, height: p.height, transform: place(p) }}
          >
            <div
              className="board-tape absolute left-1/2"
              style={{
                width: w,
                height: h,
                top: -h / 2,
                marginLeft: -w / 2,
                background: p.tape.color,
                clipPath: TAPE_CLIP,
                transform: `rotate(${p.tape.tilt}rad)`,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

const TAPE_CLIP = tapeClip();

/** Torn ends: a small zigzag on the left and right edges of the strip. */
function tapeClip() {
  const teeth = 5;
  const left: string[] = [];
  const right: string[] = [];
  for (let i = 0; i <= teeth; i++) {
    const y = (i / teeth) * 100;
    left.push(`${i % 2 ? 4 : 0}% ${y}%`);
    right.push(`${i % 2 ? 96 : 100}% ${100 - y}%`);
  }
  return `polygon(${[...left, ...right].join(", ")})`;
}
