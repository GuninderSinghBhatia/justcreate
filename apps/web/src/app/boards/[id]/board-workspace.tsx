"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Board, BoardItem } from "@justcreate/shared";
import type { CanvasHandle } from "@/components/canvas/board-canvas";
import { LibrarySidebar } from "@/components/canvas/library-sidebar";
import { ClusterPanel, type ClusterWithMembers } from "@/components/cluster-panel";
import { ReferenceDrawer, type BoardOption } from "@/components/reference-drawer";
import { ReferenceGrid } from "@/components/reference-grid";
import { addReferencesToBoard, deleteBoard, renameBoard } from "@/lib/actions";
import type { ReferenceView } from "@/lib/references";

// tldraw touches window on import; render it in the browser only.
const BoardCanvas = dynamic(() => import("@/components/canvas/board-canvas").then((m) => m.BoardCanvas), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-foreground/50">Loading canvas…</div>,
});

type View = "canvas" | "grid";

export function BoardWorkspace({
  board,
  items,
  references,
  boards,
  clusters,
  clustering,
  initialView,
}: {
  board: Board;
  items: BoardItem[];
  references: ReferenceView[];
  boards: BoardOption[];
  clusters: ClusterWithMembers[];
  clustering: boolean;
  initialView: View;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [view, setView] = useState<View>(initialView);
  const [showLibrary, setShowLibrary] = useState(true);
  const [showClusters, setShowClusters] = useState(true);
  const [selection, setSelection] = useState<string[]>([]);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [name, setName] = useState(board.name);
  const [, start] = useTransition();
  const canvas = useRef<CanvasHandle | null>(null);

  const byId = useMemo(() => new Map(references.map((r) => [r.id, r])), [references]);
  const onBoard = useMemo(() => new Set(items.map((i) => i.reference_id)), [items]);
  const selected = selection.length === 1 ? byId.get(selection[0]) : undefined;

  const switchView = (next: View) => {
    setView(next);
    router.replace(`${pathname}${next === "grid" ? "?view=grid" : ""}`, { scroll: false });
  };

  const onSelectionChange = useCallback((ids: string[]) => setSelection(ids), []);
  const refresh = useCallback(() => router.refresh(), [router]);
  const focus = useCallback((ids: string[]) => {
    if (canvas.current) canvas.current.focus(ids);
    else setSelection(ids);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-foreground/10 px-4 py-2 text-sm">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== board.name && start(() => renameBoard(board.id, name))}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          aria-label="Board name"
          className="min-w-0 rounded border border-transparent bg-transparent px-1 font-semibold hover:border-foreground/20 focus:border-foreground/40"
        />
        <select
          value={board.id}
          onChange={(e) => router.push(`/boards/${e.target.value}`)}
          aria-label="Switch board"
          className="rounded-md border border-foreground/20 bg-transparent px-2 py-1 text-xs"
        >
          {boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <span className="text-xs text-foreground/50">{items.length} references</span>
        <div className="ml-auto flex items-center gap-2">
          {view === "canvas" && (
            <span className="text-xs text-foreground/50" aria-live="polite">
              {saveState === "saving" ? "Saving…" : saveState === "error" ? "Couldn't save" : "Saved"}
            </span>
          )}
          <div role="tablist" className="flex overflow-hidden rounded-md border border-foreground/20 text-xs">
            {(["canvas", "grid"] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => switchView(v)}
                className={`px-3 py-1 capitalize ${view === v ? "bg-foreground text-background" : ""}`}
              >
                {v}
              </button>
            ))}
          </div>
          <Toggle label="Library" on={showLibrary} onClick={() => setShowLibrary((v) => !v)} />
          <Toggle label="Clusters" on={showClusters} onClick={() => setShowClusters((v) => !v)} />
          <button
            onClick={() => {
              if (window.confirm(`Delete board “${board.name}”? Its references stay in your library.`)) {
                start(() => deleteBoard(board.id));
              }
            }}
            className="text-xs text-foreground/50 underline hover:text-red-600"
          >
            Delete board
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {showLibrary && (
          <LibrarySidebar
            onBoard={onBoard}
            onAdd={(r) => {
              if (view === "canvas" && canvas.current) canvas.current.add(r);
              else start(() => addReferencesToBoard(board.id, [r.id]));
            }}
          />
        )}
        <main className="relative min-w-0 flex-1 overflow-auto">
          {view === "canvas" ? (
            <BoardCanvas
              boardId={board.id}
              document={board.document}
              items={items}
              references={references}
              onSelectionChange={onSelectionChange}
              onReady={(h) => (canvas.current = h)}
              onSaveState={setSaveState}
              onMembershipChange={refresh}
            />
          ) : (
            <div className="p-4">
              <ReferenceGrid
                references={references}
                boardId={board.id}
                boards={boards}
                empty={<p className="py-24 text-center text-sm text-foreground/50">This board is empty. Add references from the library, or drop images here.</p>}
              />
            </div>
          )}
        </main>
        {view === "canvas" && selected && (
          <ReferenceDrawer
            key={selected.id}
            docked
            reference={selected}
            boardId={board.id}
            boards={boards}
            onClose={() => canvas.current?.focus([])}
          />
        )}
        {showClusters && (
          <ClusterPanel
            boardId={board.id}
            clusters={clusters}
            references={byId}
            selection={selection}
            clustering={clustering}
            onFocus={focus}
          />
        )}
      </div>
    </div>
  );
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-md border px-2 py-1 text-xs ${on ? "border-foreground/40" : "border-foreground/15 text-foreground/50"}`}
    >
      {label}
    </button>
  );
}
