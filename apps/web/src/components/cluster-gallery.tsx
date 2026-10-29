"use client";

import { useEffect } from "react";
import type { ReferenceView } from "@/lib/references";
import { BarButton, BarIcon } from "./bar";
import { ReferenceGrid } from "./reference-grid";

export interface Gallery {
  title: string;
  summary?: string | null;
  ids: string[];
}

/**
 * One cluster's (or style's) references as a grid, over the board: the same cards and details
 * drawer as the Grid view. The canvas stays mounted underneath, so closing is instant. Esc closes.
 */
export function ClusterGallery({
  gallery,
  references,
  onClose,
  onShowOnCanvas,
}: {
  gallery: Gallery;
  references: Map<string, ReferenceView>;
  onClose: () => void;
  onShowOnCanvas?: () => void;
}) {
  const items = gallery.ids.flatMap((id) => references.get(id) ?? []);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      // A reference's drawer (a dialog) takes Esc first.
      if (e.key === "Escape" && !document.querySelector('aside.fixed[aria-label="Reference details"]')) onClose();
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <section aria-label={gallery.title} className="animate-fade absolute inset-0 z-10 flex flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 items-center gap-3 border-b border-foreground/10 px-5 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl">
            {gallery.title} <span className="font-sans text-sm text-foreground/45 tabular-nums">{items.length}</span>
          </h2>
          {gallery.summary && <p className="truncate font-sans text-xs text-foreground/55">{gallery.summary}</p>}
        </div>
        {onShowOnCanvas && (
          <BarButton icon={BarIcon.canvas} onClick={onShowOnCanvas}>
            Show on canvas
          </BarButton>
        )}
        <BarButton onClick={onClose} aria-label="Close" title="Close (Esc)">
          <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
          Close
        </BarButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <ReferenceGrid
          references={items}
          onBoard
          empty={<p className="py-24 text-center text-sm text-foreground/50">These references are no longer on the board.</p>}
        />
      </div>
    </section>
  );
}
