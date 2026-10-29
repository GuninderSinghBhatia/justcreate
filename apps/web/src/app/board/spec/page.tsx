import { connection } from "next/server";
import { homeBoard } from "@/lib/boards";
import { signedUrls } from "@/lib/references";
import { requireUser } from "@/lib/require-user";
import { SpecEditor, type CitedRef } from "./spec-editor";

// Per-user page: nothing useful to prerender.
export const instant = false;

type RefRow = { id: string; title: string | null; source_url: string | null; page_url: string | null; thumbnail_path: string | null };
type Sources = { cluster_id?: string; fallback_reason?: string };

/**
 * A cluster's design.md (`?c=<cluster id>`; without one, the first cluster that has a document, else
 * the first cluster). Each cluster's document is its own line of versions (`sources.cluster_id`).
 */
export default async function SpecPage({ searchParams }: PageProps<"/board/spec">) {
  await connection();
  const { v, c } = await searchParams;
  const { supabase, user } = await requireUser();
  const board = await homeBoard(supabase, user.id);
  const id = board.id;

  const [{ data: allVersions }, { data: clusters }, { data: items }, { data: jobs }] = await Promise.all([
    supabase
      .from("design_specs")
      .select("id, version, kind, created_at, sources")
      .eq("board_id", id)
      .order("version", { ascending: false }),
    supabase
      .from("clusters")
      .select("id, name, summary, status, source, members:cluster_members(reference_id)")
      .eq("board_id", id)
      .neq("status", "rejected")
      .order("created_at"),
    supabase.from("board_items").select("reference:references(id, title, source_url, page_url, thumbnail_path)").eq("board_id", id),
    supabase
      .from("jobs")
      .select("status, error, params, updated_at")
      .eq("board_id", id)
      .eq("kind", "spec")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  // Which cluster: the one asked for if it still exists, else one that has a document, else the first.
  const scopeOf = (s: { sources: unknown }) => ((s.sources ?? {}) as Sources).cluster_id ?? null;
  const documented = new Set((allVersions ?? []).map(scopeOf));
  const scopeCluster =
    (typeof c === "string" ? (clusters ?? []).find((x) => x.id === c) : undefined) ??
    (clusters ?? []).find((x) => documented.has(x.id)) ??
    clusters?.[0];
  const scopeId = scopeCluster?.id ?? null;
  const versions = (allVersions ?? []).filter((s) => scopeOf(s) === scopeId);

  const wanted = typeof v === "string" ? Number(v) : versions[0]?.version;
  const current = versions.find((s) => s.version === wanted) ?? versions[0];
  const references = (items ?? []).map((i) => i.reference as unknown as RefRow);
  const [{ data: doc }, thumbs] = await Promise.all([
    current ? supabase.from("design_specs").select("markdown").eq("id", current.id).single() : Promise.resolve({ data: null }),
    signedUrls(supabase, references.flatMap((r) => (r.thumbnail_path ? [r.thumbnail_path] : []))),
  ]);

  // Citation ids → reference title, thumbnail and link, for the preview's chips and images. A
  // cluster's document picks its short ids among its own references, so every prefix length maps.
  const refs: Record<string, CitedRef> = {};
  for (const r of references) {
    const cited = { title: r.title ?? "Untitled", url: r.source_url ?? r.page_url, thumb: r.thumbnail_path ? (thumbs.get(r.thumbnail_path) ?? null) : null };
    const hex = r.id.replaceAll("-", "");
    for (let n = 6; n <= 12; n++) refs[hex.slice(0, n)] ??= cited;
  }

  const job = jobs?.[0];
  const jobScope = ((job?.params ?? {}) as Sources).cluster_id ?? null;
  const jobOpen = job?.status === "pending" || job?.status === "running";
  const sources = (current?.sources ?? {}) as Sources;
  const clusterList = (clusters ?? []).map((x) => ({
    id: x.id,
    name: x.name,
    status: x.status,
    summary: x.summary as string | null,
    size: (x.members as unknown as { reference_id: string }[]).length,
    thumbs: (x.members as unknown as { reference_id: string }[]).slice(0, 6).flatMap((m) => {
      const r = references.find((ref) => ref.id === m.reference_id);
      const t = r?.thumbnail_path ? thumbs.get(r.thumbnail_path) : undefined;
      return t ? [t] : [];
    }),
    hasDoc: documented.has(x.id),
  }));

  return (
    <div className="flex h-dvh flex-col">
      <SpecEditor
        key={`${scopeId ?? "board"}:${current?.id ?? "none"}`}
        boardId={id}
        boardName={board.name}
        scope={scopeCluster ? clusterList.find((x) => x.id === scopeCluster.id)! : null}
        referenceCount={scopeCluster ? (scopeCluster.members as unknown[]).length : references.length}
        markdown={doc?.markdown ?? ""}
        version={current ? { version: current.version, kind: current.kind, createdAt: current.created_at } : null}
        fallbackReason={current?.kind === "draft" ? (sources.fallback_reason ?? null) : null}
        versions={versions.map((s) => ({ version: s.version, kind: s.kind, createdAt: s.created_at }))}
        clusters={clusterList}
        refs={refs}
        job={job && jobScope === scopeId ? { status: job.status, error: job.error, section: (job.params as { section?: string })?.section ?? null } : null}
        busyElsewhere={
          jobOpen && jobScope !== scopeId
            ? jobScope
              ? (clusterList.find((x) => x.id === jobScope)?.name ?? "another cluster")
              : "the whole board"
            : null
        }
      />
    </div>
  );
}
