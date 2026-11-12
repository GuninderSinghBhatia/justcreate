"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * One area of the landing board. Pieces inside it are placed by CSS; red thread runs between any two
 * of them by `data-node` id, re-measured whenever the stage resizes or a piece is dragged. Threads
 * draw in the first time the stage scrolls into view. Pieces marked `data-drag` follow a mouse or
 * pen (touch keeps scrolling the page).
 */
export interface Thread {
  from: string;
  to: string;
  /** red (default), blue dashed ink, or a citation shown only while `on` */
  tone?: "red" | "blue" | "cite";
  on?: boolean;
  /** a rejected cluster's thread: faded, dashed */
  off?: boolean;
}

// A stable default: a fresh [] each render would re-run the measuring effect forever.
const NO_THREADS: Thread[] = [];

export function Stage({
  threads = NO_THREADS,
  className = "",
  id,
  children,
  label,
}: {
  threads?: Thread[];
  className?: string;
  id?: string;
  children: React.ReactNode;
  label?: string;
}) {
  const root = useRef<HTMLElement>(null);
  const [paths, setPaths] = useState<{ d: string; ends: [number, number][] }[]>([]);
  const [drawn, setDrawn] = useState(false);
  const frame = useRef(0);

  const measure = useCallback(() => {
    const el = root.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const point = (node: string): [number, number] | null => {
      const target = el.querySelector<HTMLElement>(`[data-node="${node}"]`);
      if (!target) return null;
      const pin = target.querySelector<HTMLElement>("[data-pin]") ?? target;
      const r = pin.getBoundingClientRect();
      const side = pin.dataset.anchor;
      const x = side === "right" ? r.right + 2 : side === "left" ? r.left - 2 : r.left + r.width / 2;
      const y = side === "right" || side === "left" ? r.top + r.height / 2 : pin === target ? r.top + 6 : r.top + r.height / 2;
      return [x - box.left, y - box.top];
    };
    setPaths(
      threads.map((t) => {
        const a = point(t.from);
        const b = point(t.to);
        if (!a || !b) return { d: "", ends: [] };
        // Thread hangs: the control point sits below the midpoint, more for longer runs.
        const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const sag = Math.min(90, dist * 0.16) + 8;
        const cx = (a[0] + b[0]) / 2;
        const cy = (a[1] + b[1]) / 2 + sag;
        return { d: `M${a[0].toFixed(1)},${a[1].toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${b[0].toFixed(1)},${b[1].toFixed(1)}`, ends: [a, b] };
      }),
    );
  }, [threads]);

  const schedule = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(measure);
  }, [measure]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    document.fonts?.ready.then(schedule);
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setDrawn(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => {
      ro.disconnect();
      io.disconnect();
      cancelAnimationFrame(frame.current);
    };
  }, [schedule]);

  // Dragging pieces: mouse and pen only, so a finger on a phone still scrolls.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let piece: HTMLElement | null = null;
    let start = { x: 0, y: 0, dx: 0, dy: 0 };
    const down = (e: PointerEvent) => {
      if (e.pointerType === "touch" || e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest("button, a, input, summary, [contenteditable]")) return;
      piece = target.closest<HTMLElement>("[data-drag]");
      if (!piece || !el.contains(piece)) return;
      e.preventDefault();
      piece.setPointerCapture(e.pointerId);
      start = { x: e.clientX, y: e.clientY, dx: Number(piece.dataset.dx ?? 0), dy: Number(piece.dataset.dy ?? 0) };
      piece.classList.add("is-dragging");
    };
    const move = (e: PointerEvent) => {
      if (!piece) return;
      const dx = start.dx + e.clientX - start.x;
      const dy = start.dy + e.clientY - start.y;
      piece.dataset.dx = String(dx);
      piece.dataset.dy = String(dy);
      piece.style.setProperty("--dx", `${dx}px`);
      piece.style.setProperty("--dy", `${dy}px`);
      schedule();
    };
    const up = () => {
      piece?.classList.remove("is-dragging");
      piece = null;
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, [schedule]);

  return (
    <section ref={root} id={id} aria-label={label} className={`lp-stage ${className}`} data-drawn={drawn}>
      {children}
      <svg className="lp-threads" aria-hidden>
        {paths.map((p, i) => {
          const t = threads[i];
          if (!p.d || !t) return null;
          const cls = ["lp-thread", t.tone === "blue" && "lp-thread--blue", t.tone === "cite" && "lp-thread--cite", t.on && "is-on", t.off && "lp-thread--off"]
            .filter(Boolean)
            .join(" ");
          return (
            <g key={`${t.from}-${t.to}-${t.on ? 1 : 0}`}>
              <path className={cls} d={p.d} pathLength={1000} style={{ "--len": 1000, "--i": i } as React.CSSProperties} />
              {t.tone !== "blue" && (t.tone !== "cite" || t.on) && !t.off && <circle className="lp-thread-knot" cx={p.ends[1][0]} cy={p.ends[1][1]} r={2.6} />}
            </g>
          );
        })}
      </svg>
    </section>
  );
}

/** A piece placed on a stage: desktop position (x, y, w) and an optional phone position (mx, my, mw). */
export function Piece({
  x,
  y,
  w,
  r = 0,
  mx,
  my,
  mw,
  drag,
  node,
  className = "",
  children,
}: {
  x: string;
  y: string;
  w: string;
  r?: number;
  mx?: string;
  my?: string;
  mw?: string;
  drag?: boolean;
  node?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const style = { "--x": x, "--y": y, "--w": w, "--r": `${r}deg`, "--mx": mx, "--my": my, "--mw": mw } as React.CSSProperties;
  return (
    <div className={`lp-piece ${className}`} style={style} data-drag={drag ? "" : undefined} data-node={node}>
      {children}
    </div>
  );
}
