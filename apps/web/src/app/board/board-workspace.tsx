"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Board, BoardItem } from "@justcreate/shared";
import type { CanvasHandle } from "@/components/canvas/board-canvas";
import { LibrarySidebar } from "@/components/canvas/library-sidebar";
import { ClusterPanel, type ClusterWithMembers } from "@/components/cluster-panel";
import { ClusterGallery, type Gallery } from "@/components/cluster-gallery";
import { ReferenceDrawer } from "@/components/reference-drawer";
import { ReferenceGrid } from "@/components/reference-grid";
import { SiteHeader } from "@/components/site-header";
import { BarDivider, BarIcon, BarToggle, SaveStatus, Segmented } from "@/components/bar";
import { addReferencesToBoard } from "@/lib/actions";
import type { ReferenceView } from "@/lib/references";

// Excalidraw touches window on import; render it in the browser only.
const BoardCanvas = dynamic(() => import("@/components/canvas/board-canvas").then((m) => m.BoardCanvas), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-foreground/50">Loading canvas…</div>,
});

type View = "canvas" | "grid";
/** Marks the browser-history entry an open gallery adds. */
const GALLERY_STATE = "justcreateGallery";

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

  // A cluster's or style's references as a grid over the board.
  const [gallery, setGallery] = useState<Gallery | null>(null);
  // It gets a browser-history entry, so Back (browser, mouse, swipe) closes it like a page. The
  // entry keeps Next's own history state: without it the router reloads the page on popstate.
  const openGallery = useCallback((g: Gallery) => {
    canvas.current?.focus([]); // its drawer would sit beside the gallery
    const state = { ...window.history.state, [GALLERY_STATE]: true };
    if (window.history.state?.[GALLERY_STATE]) window.history.replaceState(state, "");
    else window.history.pushState(state, "");
    setGallery(g);
  }, []);
  const closeGallery = useCallback(() => {
    if (window.history.state?.[GALLERY_STATE]) window.history.back(); // popstate below closes it
    else setGallery(null);
  }, []);
  useEffect(() => {
    const onPop = () => {
      if (!window.history.state?.[GALLERY_STATE]) setGallery(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SiteHeader
        context={view === "canvas" ? <SaveStatus state={saveState} /> : undefined}
        tools={
          <>
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
          </>
        }
      />

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
          {gallery && (
            <ClusterGallery
              key={gallery.title}
              gallery={gallery}
              references={byId}
              onClose={closeGallery}
              onShowOnCanvas={
                view === "canvas"
                  ? () => {
                      closeGallery();
                      focus(gallery.ids);
                    }
                  : undefined
              }
            />
          )}
        </main>
        {view === "canvas" && selected && !gallery && (
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
            onOpen={openGallery}
          />
        )}
      </div>
    </div>
  );
}

