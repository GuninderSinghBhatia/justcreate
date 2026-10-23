import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { SiteHeader } from "@/components/site-header";
import { shortIds } from "@/lib/spec";
import { createClient } from "@/lib/supabase/server";
import { SpecEditor } from "./spec-editor";

// Per-user page: nothing useful to prerender.
export const instant = false;

export default async function SpecPage({ params, searchParams }: PageProps<"/boards/[id]/spec">) {
  await connection();
  const { id } = await params;
  const { v } = await searchParams;
  const supabase = await createClient();

  const [{ data: userData }, { data: board }, { data: versions }, { data: clusters }, { data: items }, { data: jobs }] =
    await Promise.all([
      supabase.auth.getUser(),
      supabase.from("boards").select("id, name").eq("id", id).maybeSingle(),
      supabase
        .from("design_specs")
        .select("id, version, kind, created_at, sources")
        .eq("board_id", id)
        .order("version", { ascending: false }),
      supabase.from("clusters").select("id, name, status, source").eq("board_id", id).neq("status", "rejected"),
      supabase.from("board_items").select("reference:references(id, title, source_url, page_url)").eq("board_id", id),
      supabase
        .from("jobs")
        .select("status, error, params, updated_at")
        .eq("board_id", id)
        .eq("kind", "spec")
        .order("created_at", { ascending: false })
        .limit(1),
    ]);
  if (!board) notFound();

  const wanted = typeof v === "string" ? Number(v) : versions?.[0]?.version;
  const current = versions?.find((s) => s.version === wanted) ?? versions?.[0];
  const { data: doc } = current
    ? await supabase.from("design_specs").select("markdown").eq("id", current.id).single()
    : { data: null };

  // Citation ids → reference title + link, for the preview.
  const references = (items ?? []).map(
    (i) => i.reference as unknown as { id: string; title: string | null; source_url: string | null; page_url: string | null },
  );
  const short = shortIds(references.map((r) => r.id));
  const byId = new Map(references.map((r) => [r.id, r]));
  const refs = Object.fromEntries(
    [...short].map(([s, refId]) => {
      const r = byId.get(refId)!;
      return [s, { title: r.title ?? "Untitled", url: r.source_url ?? r.page_url }];
    }),
  );

  const job = jobs?.[0];
  return (
    <div className="flex h-dvh flex-col">
      <SiteHeader email={userData.user?.email} />
      <div className="flex items-center gap-3 border-b border-foreground/10 px-4 py-2 text-sm">
        <Link href={`/boards/${id}`} className="text-foreground/60 hover:underline">
          ← {board.name}
        </Link>
        <h1 className="font-semibold">design.md</h1>
        <span className="text-xs text-foreground/50">{references.length} references</span>
      </div>
      <SpecEditor
        key={current?.id ?? "none"}
        boardId={id}
        boardName={board.name}
        markdown={doc?.markdown ?? ""}
        version={current ? { version: current.version, kind: current.kind, createdAt: current.created_at } : null}
        versions={(versions ?? []).map((s) => ({ version: s.version, kind: s.kind, createdAt: s.created_at }))}
        clusters={(clusters ?? []).map((c) => ({ id: c.id, name: c.name, status: c.status }))}
        refs={refs}
        job={job ? { status: job.status, error: job.error, section: (job.params as { section?: string })?.section ?? null } : null}
      />
    </div>
  );
}
