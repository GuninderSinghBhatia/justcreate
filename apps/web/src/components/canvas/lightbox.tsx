"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface Zoomed {
  /** Full-size file, when there is one. */
  src: string;
  /** Used if the full file doesn't load as an image (e.g. a video or an expired link). */
  fallback?: string;
  title?: string | null;
  sourceUrl?: string | null;
}

/**
 * A full-screen view of one image. Opens fitted to the screen; click the image for actual size
 * (scroll to pan) and again to fit. Esc, the close button or a click on the backdrop closes it.
 * While open it swallows keys so Excalidraw's shortcuts (Delete, arrows) don't act behind it.
 */
export function Lightbox({ image, onClose }: { image: Zoomed; onClose: () => void }) {
  const [full, setFull] = useState(false);
  const [src, setSrc] = useState(image.src);
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab") return; // keep focus moving between the controls
      e.stopImmediatePropagation();
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={image.title ?? "Image"}
      className="fixed inset-0 z-50 flex flex-col bg-black/85 text-white backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="flex items-center gap-4 px-4 py-3 text-sm" onClick={(e) => e.stopPropagation()}>
        <p className="min-w-0 flex-1 truncate text-white/80">{image.title}</p>
        {image.sourceUrl && (
          <a href={image.sourceUrl} target="_blank" rel="noreferrer" className="font-hand text-white/70 hover:text-white hover:underline">
            Open source
          </a>
        )}
        <button onClick={() => setFull((v) => !v)} className="text-white/70 hover:text-white">
          {full ? "Fit to screen" : "Actual size"}
        </button>
        <button ref={close} onClick={onClose} className="text-white/70 hover:text-white">
          Close
        </button>
      </div>
      <div className={`min-h-0 flex-1 ${full ? "overflow-auto" : "flex items-center justify-center p-4 pt-0"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL or data URL */}
        <img
          src={src}
          alt={image.title ?? ""}
          onClick={(e) => {
            e.stopPropagation();
            setFull((v) => !v);
          }}
          onError={() => {
            if (image.fallback && src !== image.fallback) setSrc(image.fallback);
          }}
          className={
            full
              ? "mx-auto block max-w-none cursor-zoom-out"
              : "max-h-full max-w-full cursor-zoom-in rounded-sm object-contain shadow-2xl"
          }
        />
      </div>
    </div>,
    document.body,
  );
}
