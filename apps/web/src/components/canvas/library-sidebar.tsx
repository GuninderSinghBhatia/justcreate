"use client";

import { useEffect, useState } from "react";
import type { ReferenceView } from "@/lib/references";
import { REFERENCE_DRAG_TYPE } from "./drag";

/** Searchable list of saved references; drag one onto the canvas to place it. */
export function LibrarySidebar({ onBoard, onAdd }: { onBoard: Set<string>; onAdd: (r: ReferenceView) => void }) {
  const [q, setQ] = useState("");
  const [inbox, setInbox] = useState(false);
  const [items, setItems] = useState<ReferenceView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const id = window.setTimeout(async () => {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (inbox) params.set("view", "inbox");
      try {
        const res = await fetch(`/api/references?${params}`, { signal: controller.signal });
        const body = (await res.json()) as { references?: ReferenceView[]; error?: string };
        if (!res.ok) throw new Error(body.error ?? "Couldn't load library");
        setItems(body.references ?? []);
        setError(null);
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Couldn't load library");
      }
    }, 250);
    return () => {
      window.clearTimeout(id);
      controller.abort();
    };
  }, [q, inbox]);

  return (
    <aside className="animate-panel-left flex w-64 shrink-0 flex-col border-r border-foreground/20 bg-background">
      <div className="flex flex-col gap-2 border-b border-foreground/20 p-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search library…"
          aria-label="Search library"
          className="rounded-md sketch border-foreground/70 bg-transparent px-2 py-1.5 text-sm"
        />
        <label className="flex items-center gap-2 text-xs text-foreground/60">
          <input type="checkbox" checked={inbox} onChange={(e) => setInbox(e.target.checked)} />
          Inbox only (not on any board)
        </label>
        <p className="text-xs text-foreground/50">Drag onto the canvas, or click + to add.</p>
      </div>
      <ul className="flex-1 overflow-y-auto p-2">
        {error && <li className="p-2 text-xs text-red-600">{error}</li>}
        {items === null && !error && <li className="p-2 text-xs text-foreground/50">Loading…</li>}
        {items?.length === 0 && <li className="p-2 text-xs text-foreground/50">Nothing found.</li>}
        {items?.map((r) => (
          <li
            key={r.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(REFERENCE_DRAG_TYPE, JSON.stringify(r));
              e.dataTransfer.effectAllowed = "copy";
            }}
            className="group mb-2 flex cursor-grab items-center gap-2 rounded-md border border-transparent p-1 hover:border-foreground/15"
          >
            <span className="h-12 w-12 shrink-0 overflow-hidden rounded bg-foreground/5">
              {r.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URLs
                <img src={r.imageUrl} alt="" draggable={false} className="h-full w-full object-cover" />
              )}
            </span>
            <span className="min-w-0 flex-1 text-xs">
              <span className="block truncate font-medium">{r.title ?? r.type}</span>
              <span className="text-foreground/50">{onBoard.has(r.id) ? "On this board" : r.type}</span>
            </span>
            {!onBoard.has(r.id) && (
              <button
                onClick={() => onAdd(r)}
                aria-label={`Add ${r.title ?? "reference"} to board`}
                className="rounded px-1.5 text-foreground/50 hover:bg-foreground/10 hover:text-foreground"
              >
                +
              </button>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
