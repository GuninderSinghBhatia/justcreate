import { connection } from "next/server";
import { homeBoard } from "@/lib/boards";
import { signedUrls } from "@/lib/references";
import { shortIds } from "@/lib/spec";
import { requireUser } from "@/lib/require-user";
import { SpecEditor, type CitedRef } from "./spec-editor";

// Per-user page: nothing useful to prerender.
export const instant = false;

type RefRow = { id: string; title: string | null; source_url: string | null; page_url: string | null; thumbnail_path: string | null };

export default async function SpecPage({ searchParams }: PageProps<"/board/spec">) {
  await connection();
  const { v } = await searchParams;
  const { supabase, user } = await requireUser();
  const board = await homeBoard(supabase, user.id);
  const id = board.id;

  const [{ data: versions }, { data: clusters }, { data: items }, { data: jobs }] =
    await Promise.all([
      supabase
        .from("design_specs")
        .select("id, version, kind, created_at, sources")
        .eq("board_id", id)
        .order("version", { ascending: false }),
      supabase
        .from("clusters")
        .select("id, name, status, source, members:cluster_members(count)")
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

  const wanted = typeof v === "string" ? Number(v) : versions?.[0]?.version;
  const current = versions?.find((s) => s.version === wanted) ?? versions?.[0];
  const references = (items ?? []).map((i) => i.reference as unknown as RefRow);
  const [{ data: doc }, thumbs] = await Promise.all([
    current ? supabase.from("design_specs").select("markdown").eq("id", current.id).single() : Promise.resolve({ data: null }),
    signedUrls(supabase, references.flatMap((r) => (r.thumbnail_path ? [r.thumbnail_path] : []))),
  ]);

  // Citation ids → reference title, thumbnail and link, for the preview's chips.
  const short = shortIds(references.map((r) => r.id));
  const byId = new Map(references.map((r) => [r.id, r]));
  const refs: Record<string, CitedRef> = Object.fromEntries(
    [...short].map(([s, refId]) => {
      const r = byId.get(refId)!;
      return [s, { title: r.title ?? "Untitled", url: r.source_url ?? r.page_url, thumb: r.thumbnail_path ? (thumbs.get(r.thumbnail_path) ?? null) : null }];
    }),
  );

  const job = jobs?.[0];
  const sources = (current?.sources ?? {}) as { fallback_reason?: string };
  return (
    <div className="flex h-dvh flex-col">
      <SpecEditor
        key={current?.id ?? "none"}
        boardId={id}
        boardName={board.name}
        referenceCount={references.length}
        markdown={doc?.markdown ?? ""}
        version={current ? { version: current.version, kind: current.kind, createdAt: current.created_at } : null}
        fallbackReason={current?.kind === "draft" ? (sources.fallback_reason ?? null) : null}
        versions={(versions ?? []).map((s) => ({ version: s.version, kind: s.kind, createdAt: s.created_at }))}
        clusters={(clusters ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          status: c.status,
          size: (c.members as unknown as { count: number }[])[0]?.count ?? 0,
        }))}
        refs={refs}
        job={job ? { status: job.status, error: job.error, section: (job.params as { section?: string })?.section ?? null } : null}
      />
    </div>
  );
}
