"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Board, BoardItem } from "@justcreate/shared";
import type { CanvasHandle } from "@/components/canvas/board-canvas";
import { LibrarySidebar } from "@/components/canvas/library-sidebar";
import { ClusterPanel, type ClusterWithMembers } from "@/components/cluster-panel";
import { ReferenceDrawer } from "@/components/reference-drawer";
import { ReferenceGrid } from "@/components/reference-grid";
import { SiteHeader } from "@/components/site-header";
import { BarDivider, BarIcon, BarLink, BarToggle, SaveStatus, Segmented } from "@/components/bar";
import { addReferencesToBoard, renameBoard } from "@/lib/actions";
import type { ReferenceView } from "@/lib/references";

// Excalidraw touches window on import; render it in the browser only.
const BoardCanvas = dynamic(() => import("@/components/canvas/board-canvas").then((m) => m.BoardCanvas), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-foreground/50">Loading canvas…</div>,
});

type View = "canvas" | "grid";

export function BoardWorkspace({
  board,
  items,
  references,
  clusters,
  clustering,
  initialView,
}: {
  board: Board;
  items: BoardItem[];
  references: ReferenceView[];
  clusters: ClusterWithMembers[];
  clustering: boolean;
  initialView: View;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [view, setView] = useState<View>(initialView);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showClusters, setShowClusters] = useState(false); // opened on demand: the board starts with room to breathe
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
      {/* One bar: the site's logo and account menu around the board's own controls. */}
      <SiteHeader>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== board.name && start(() => renameBoard(name))}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          aria-label="Board name"
          className="field-sizing-content h-8 min-w-0 max-w-56 rounded-lg border border-transparent bg-transparent px-2 font-sans text-sm font-semibold hover:bg-foreground/[0.04] focus:border-foreground/25 focus:bg-transparent"
        />
        <span className="hidden shrink-0 rounded-full bg-foreground/[0.06] px-2 py-0.5 font-sans text-xs whitespace-nowrap text-foreground/55 tabular-nums sm:inline">
          {items.length} {items.length === 1 ? "reference" : "references"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {view === "canvas" && <SaveStatus state={saveState} />}
          <Segmented
            label="View"
            value={view}
            onChange={switchView}
            options={[
              { value: "canvas", label: "Canvas", icon: BarIcon.canvas },
              { value: "grid", label: "Grid", icon: BarIcon.grid },
            ]}
          />
          <BarDivider />
          <BarToggle on={showLibrary} onClick={() => setShowLibrary((v) => !v)} icon={BarIcon.references}>
            References
          </BarToggle>
          <BarToggle on={showClusters} onClick={() => setShowClusters((v) => !v)} icon={BarIcon.clusters}>
            Clusters
          </BarToggle>
          <BarDivider />
          <BarLink href="/board/spec" primary icon={BarIcon.doc}>
            design.md
          </BarLink>
        </div>
      </SiteHeader>

      <div className="flex min-h-0 flex-1">
        {showLibrary && (
          <LibrarySidebar
            onBoard={onBoard}
            onAdd={(r) => {
              if (view === "canvas" && canvas.current) canvas.current.add(r);
              else start(() => addReferencesToBoard([r.id]));
            }}
          />
        )}
        <main className="relative min-w-0 flex-1 overflow-auto">
          {view === "canvas" ? (
            <BoardCanvas
              boardId={board.id}
              boardName={board.name}
              document={board.document}
              items={items}
              references={references}
              onSelectionChange={onSelectionChange}
              onReady={(h) => (canvas.current = h)}
              onSaveState={setSaveState}
              onMembershipChange={refresh}
            />
          ) : (
            <div className="animate-fade p-4">
              <ReferenceGrid
                references={references}
                onBoard
                empty={<p className="py-24 text-center text-sm text-foreground/50">Nothing on the board yet. Save something with the extension, or drop images here.</p>}
              />
            </div>
          )}
        </main>
        {view === "canvas" && selected && (
          // Slides in when a selection starts, not again as it moves between images.
          <div className="animate-panel-right flex">
            <ReferenceDrawer
              key={selected.id}
              docked
              reference={selected}
              onBoard
              onClose={() => canvas.current?.focus([])}
            />
          </div>
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

