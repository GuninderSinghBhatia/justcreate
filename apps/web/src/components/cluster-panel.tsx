"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Cluster, ClusterMember } from "@justcreate/shared";
import {
  addClusterMembers,
  createManualCluster,
  deleteCluster,
  mergeClusters,
  reclusterBoard,
  removeClusterMember,
  renameCluster,
  setClusterStatus,
} from "@/lib/cluster-actions";
import type { ReferenceView } from "@/lib/references";

export type ClusterWithMembers = Cluster & { members: Pick<ClusterMember, "reference_id" | "score">[] };

/**
 * AI-suggested and user clusters for a board. Every suggestion can be accepted, rejected,
 * renamed, merged, or have members removed; selected canvas cards can become a new cluster.
 */
export function ClusterPanel({
  boardId,
  clusters,
  references,
  selection,
  clustering,
  onFocus,
}: {
  boardId: string;
  clusters: ClusterWithMembers[];
  references: Map<string, ReferenceView>;
  selection: string[];
  clustering: boolean;
  onFocus: (referenceIds: string[]) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mergeSet, setMergeSet] = useState<string[]>([]);
  const [showRejected, setShowRejected] = useState(false);

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      try {
        setError(null);
        await fn();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });

  const visible = clusters.filter((c) => c.status !== "rejected");
  const rejected = clusters.filter((c) => c.status === "rejected");
  const analysed = [...references.values()].filter((r) => r.analysis).length;

  return (
    <aside className="animate-panel-right flex w-80 shrink-0 flex-col border-l border-foreground/20 bg-background text-sm">
      <div className="flex flex-col gap-2 border-b border-foreground/20 p-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Clusters</h2>
          <button
            onClick={() => run(() => reclusterBoard(boardId))}
            disabled={pending || clustering}
            className="rounded-md sketch border-foreground/70 px-2 py-1 text-xs disabled:opacity-50"
          >
            {clustering ? "Clustering…" : "Re-cluster"}
          </button>
        </div>
        <p className="text-xs text-foreground/50">
          {analysed}/{references.size} references analysed. Suggestions refresh automatically after 10 new
          references; accepted clusters are never changed.
        </p>
        {selection.length > 0 && <NewClusterForm count={selection.length} onCreate={(name) => run(() => createManualCluster(boardId, name, selection))} />}
        {mergeSet.length >= 2 && (
          <button
            onClick={() => run(async () => (await mergeClusters(mergeSet), setMergeSet([])))}
            className="rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background"
          >
            Merge {mergeSet.length} clusters
          </button>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      <ul className="flex-1 overflow-y-auto">
        {visible.length === 0 && (
          <li className="p-3 text-xs text-foreground/50">
            No clusters yet. They appear once a few references are analysed — or select cards on the canvas and
            make one yourself.
          </li>
        )}
        {visible.map((c) => (
          <ClusterRow
            key={c.id}
            cluster={c}
            references={references}
            selection={selection}
            merging={mergeSet.includes(c.id)}
            onToggleMerge={() =>
              setMergeSet((s) => (s.includes(c.id) ? s.filter((id) => id !== c.id) : [...s, c.id]))
            }
            onFocus={onFocus}
            run={run}
          />
        ))}
        {rejected.length > 0 && (
          <li className="border-t border-foreground/20 p-3 text-xs">
            <button onClick={() => setShowRejected((v) => !v)} className="text-foreground/60 underline">
              {showRejected ? "Hide" : "Show"} {rejected.length} rejected
            </button>
            {showRejected && (
              <ul className="mt-2 flex flex-col gap-1">
                {rejected.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 text-foreground/60">
                    <span className="truncate line-through">{c.name}</span>
                    <button onClick={() => run(() => setClusterStatus(c.id, "suggested"))} className="underline">
                      Restore
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        )}
      </ul>
    </aside>
  );
}

function ClusterRow({
  cluster: c,
  references,
  selection,
  merging,
  onToggleMerge,
  onFocus,
  run,
}: {
  cluster: ClusterWithMembers;
  references: Map<string, ReferenceView>;
  selection: string[];
  merging: boolean;
  onToggleMerge: () => void;
  onFocus: (ids: string[]) => void;
  run: (fn: () => Promise<unknown>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(c.name);
  const [open, setOpen] = useState(false);
  const memberIds = c.members.map((m) => m.reference_id);
  const addable = selection.filter((id) => !memberIds.includes(id));

  return (
    <li className={`border-b border-foreground/20 p-3 ${c.status === "suggested" ? "border-l-2 border-l-dashed border-l-foreground/40" : ""}`}>
      <div className="flex items-start gap-2">
        <input type="checkbox" checked={merging} onChange={onToggleMerge} aria-label={`Select ${c.name} for merge`} className="mt-1" />
        <div className="min-w-0 flex-1">
          {editing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setEditing(false);
                run(() => renameCluster(c.id, name));
              }}
            >
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setEditing(false)} className="w-full rounded sketch border-foreground/70 bg-transparent px-1" />
            </form>
          ) : (
            <button onClick={() => onFocus(memberIds)} className="text-left font-medium hover:underline" title="Show on canvas">
              {c.name}
            </button>
          )}
          <p className="text-xs text-foreground/50">
            {c.status === "suggested" ? "Suggested" : c.source === "user" ? "Yours" : "Accepted"} · {memberIds.length} references
            {c.ai_name && c.ai_name !== c.name ? ` · was “${c.ai_name}”` : ""}
          </p>
          {c.summary && <p className="mt-1 text-xs text-foreground/70">{c.summary}</p>}
        </div>
      </div>

      <div className="mt-2 flex -space-x-2">
        {memberIds.slice(0, 8).map((id) => {
          const r = references.get(id);
          return (
            <span key={id} className="h-8 w-8 overflow-hidden rounded border-2 border-background bg-foreground/10">
              {r?.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URLs
                <img src={r.imageUrl} alt="" className="h-full w-full object-cover" />
              )}
            </span>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {c.status === "suggested" && (
          <>
            <button onClick={() => run(() => setClusterStatus(c.id, "accepted"))} className="font-medium underline">
              Accept
            </button>
            <button onClick={() => run(() => setClusterStatus(c.id, "rejected"))} className="text-foreground/60 underline">
              Reject
            </button>
          </>
        )}
        <button onClick={() => setEditing(true)} className="text-foreground/60 underline">
          Rename
        </button>
        <button onClick={() => setOpen((v) => !v)} className="text-foreground/60 underline">
          {open ? "Hide members" : "Members"}
        </button>
        {addable.length > 0 && (
          <button onClick={() => run(() => addClusterMembers(c.id, addable))} className="text-foreground/60 underline">
            Add {addable.length} selected
          </button>
        )}
        {c.source === "user" && (
          <button onClick={() => run(() => deleteCluster(c.id))} className="text-foreground/60 underline">
            Delete
          </button>
        )}
      </div>

      {open && (
        <ul className="mt-2 flex flex-col gap-1">
          {memberIds.map((id) => {
            const r = references.get(id);
            return (
              <li key={id} className="flex items-center justify-between gap-2 text-xs">
                <button onClick={() => onFocus([id])} className="truncate text-left hover:underline">
                  {r?.title ?? r?.type ?? "Reference"}
                </button>
                <button onClick={() => run(() => removeClusterMember(c.id, id))} className="shrink-0 text-foreground/50 underline">
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

function NewClusterForm({ count, onCreate }: { count: number; onCreate: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onCreate(name);
        setName("");
      }}
      className="flex gap-1"
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={`Name for ${count} selected`}
        aria-label="New cluster name"
        className="min-w-0 flex-1 rounded-md sketch border-foreground/70 bg-transparent px-2 py-1 text-xs"
      />
      <button className="rounded-md sketch border-foreground/70 px-2 py-1 text-xs">Make cluster</button>
    </form>
  );
}
