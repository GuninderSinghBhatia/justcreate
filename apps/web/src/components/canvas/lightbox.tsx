"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface Zoomed {
  /** Full-size file, when there is one. */
  src: string;
  /** Used if the full file doesn't load as an image (e.g. a video or an expired link). */
  fallback?: string;
  title?: string | null;
  sourceUrl?: string | null;
  /** The image's box on screen (it may show a crop of the file), so the view grows out of it. */
  from?: { left: number; top: number; width: number; height: number; angle: number };
}

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const OPEN_MS = 420;
const CLOSE_MS = 300;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The transform and clip that make the laid-out image look like its box on the canvas. The canvas
 * crops like object-fit cover (keeping the top for tall images, the middle for wide ones), so the
 * clip hides what the crop hid while the scale matches the side the crop kept whole.
 */
function fromFrame(img: HTMLImageElement, from: NonNullable<Zoomed["from"]>) {
  const r = img.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  const byWidth = from.width / r.width;
  const visibleH = from.height / (r.height * byWidth);
  let scale: number;
  let clip: string;
  if (visibleH <= 1) {
    scale = byWidth;
    clip = `inset(0 0 ${(1 - visibleH) * 100}% 0)`;
  } else {
    scale = from.height / r.height;
    const visibleW = from.width / (r.width * scale);
    clip = `inset(0 ${((1 - visibleW) / 2) * 100}% 0 ${((1 - visibleW) / 2) * 100}%)`;
  }
  // Scaled about the top centre: the box's top centre lands on the canvas box's top centre.
  const dx = from.left + from.width / 2 - (r.left + r.width / 2);
  const dy = from.top - r.top;
  return { transform: `translate(${dx}px, ${dy}px) rotate(${from.angle}rad) scale(${scale})`, clipPath: clip };
}

/**
 * A full-screen view of one image. It grows out of the image on the canvas, fitted to the screen;
 * click the image for actual size (scroll to pan) and again to fit. Esc, the close button or a
 * click on the backdrop shrinks it back. While open it swallows keys so Excalidraw's shortcuts
 * (Delete, arrows) don't act behind it. With `nav` it steps through a set of images (‹ › and the
 * arrow keys), e.g. a cluster's.
 */
export function Lightbox({
  image,
  onClose,
  nav,
}: {
  image: Zoomed;
  onClose: () => void;
  nav?: { index: number; count: number; onPrev: () => void; onNext: () => void };
}) {
  const [full, setFull] = useState(false);
  const [src, setSrc] = useState(image.src);
  const [loaded, setLoaded] = useState(false);
  // Stepping to another image: start it fresh (fitted, shown once loaded).
  const [shown, setShown] = useState(image.src);
  if (shown !== image.src) {
    setShown(image.src);
    setSrc(image.src);
    setLoaded(false);
    setFull(false);
  }
  const navRef = useRef(nav);
  useEffect(() => {
    navRef.current = nav;
  });
  const closeButton = useRef<HTMLButtonElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const closing = useRef(false);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    const el = img.current;
    const frame = el && image.from && !full && !reducedMotion() ? fromFrame(el, image.from) : null;
    const opts = { duration: reducedMotion() ? 0 : CLOSE_MS, easing: EASE, fill: "forwards" as const };
    backdrop.current?.animate([{ opacity: 1 }, { opacity: 0 }], opts);
    bar.current?.animate([{ opacity: 1 }, { opacity: 0 }], { ...opts, duration: opts.duration / 2 });
    const done = frame
      ? el!.animate([{ transform: "none", clipPath: "inset(0)" }, frame], opts).finished
      : (el?.animate([{ opacity: 1 }, { opacity: 0 }], opts).finished ?? Promise.resolve());
    void done.then(onClose, onClose);
  }, [image.from, full, onClose]);

  const open = () => {
    setLoaded(true);
    const el = img.current;
    if (!el || reducedMotion()) return;
    const frame = image.from ? fromFrame(el, image.from) : null;
    if (frame) el.animate([frame, { transform: "none", clipPath: "inset(0)" }], { duration: OPEN_MS, easing: EASE });
    else el.animate([{ opacity: 0, transform: "scale(0.96)" }, { opacity: 1, transform: "none" }], { duration: 240, easing: EASE });
  };

  useEffect(() => {
    closeButton.current?.focus();
    if (!reducedMotion()) {
      backdrop.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: "ease-out" });
      bar.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: 160, easing: "ease-out", fill: "backwards" });
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab") return; // keep focus moving between the controls
      e.stopImmediatePropagation();
      if (e.type !== "keydown") return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") navRef.current?.onPrev();
      else if (e.key === "ArrowRight") navRef.current?.onNext();
    };
    // Key releases too: Excalidraw acts on some (Esc clears the selection).
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
    };
  }, [close]);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={image.title ?? "Image"} className="fixed inset-0 z-50 flex flex-col text-white" onClick={close}>
      <div ref={backdrop} className="absolute inset-0 bg-black/85 backdrop-blur-sm" />
      <div ref={bar} className="relative flex items-center gap-4 px-4 py-3 text-sm" onClick={(e) => e.stopPropagation()}>
        <p className="min-w-0 flex-1 truncate text-white/80">
          {image.title}
          {nav && <span className="ml-2 text-white/45 tabular-nums">{nav.index + 1} / {nav.count}</span>}
        </p>
        {image.sourceUrl && (
          <a href={image.sourceUrl} target="_blank" rel="noreferrer" className="text-white/70 hover:text-white hover:underline">
            Open source
          </a>
        )}
        <button onClick={() => setFull((v) => !v)} className="text-white/70 hover:text-white">
          {full ? "Fit to screen" : "Actual size"}
        </button>
        <button ref={closeButton} onClick={close} className="text-white/70 hover:text-white">
          Close
        </button>
      </div>
      <div className={`relative min-h-0 flex-1 ${full ? "overflow-auto" : "flex items-center justify-center p-4 pt-0"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL or data URL */}
        <img
          ref={img}
          src={src}
          alt={image.title ?? ""}
          decoding="async"
          onLoad={loaded ? undefined : open}
          onClick={(e) => {
            e.stopPropagation();
            setFull((v) => !v);
          }}
          onError={() => {
            if (image.fallback && src !== image.fallback) setSrc(image.fallback);
          }}
          style={{ transformOrigin: "top center" }}
          className={`${loaded ? "" : "invisible"} ${
            full ? "mx-auto block max-w-none cursor-zoom-out" : "max-h-full max-w-full cursor-zoom-in rounded-sm object-contain shadow-2xl"
          }`}
        />
        {nav && nav.count > 1 && (
          <>
            <StepButton side="left" label="Previous image (←)" onClick={nav.onPrev} />
            <StepButton side="right" label="Next image (→)" onClick={nav.onNext} />
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function StepButton({ side, label, onClick }: { side: "left" | "right"; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`bar-ctl absolute top-1/2 ${side === "left" ? "left-4" : "right-4"} grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white/80 backdrop-blur hover:bg-white/20 hover:text-white`}
    >
      <svg viewBox="0 0 16 16" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={side === "left" ? "M10 3.5L5.5 8l4.5 4.5" : "M6 3.5L10.5 8 6 12.5"} />
      </svg>
    </button>
  );
}
