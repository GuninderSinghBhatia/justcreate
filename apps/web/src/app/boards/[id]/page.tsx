import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Board, BoardItem, Cluster, ClusterMember, Reference } from "@justcreate/shared";
import { SiteHeader } from "@/components/site-header";
import { toViews } from "@/lib/references";
import { createClient } from "@/lib/supabase/server";
import { BoardWorkspace } from "./board-workspace";

// Per-user page: nothing useful to prerender.
export const instant = false;

export default async function BoardPage({ params, searchParams }: PageProps<"/boards/[id]">) {
  await connection();
  const { id } = await params;
  const { view } = await searchParams;
  const supabase = await createClient();

  const [{ data: userData }, { data: board }, { data: items }, { data: boards }, { data: clusters }, { data: jobs }] =
    await Promise.all([
      supabase.auth.getUser(),
      supabase.from("boards").select("*").eq("id", id).maybeSingle(),
      supabase.from("board_items").select("*, reference:references(*)").eq("board_id", id),
      supabase.from("boards").select("id, name").order("updated_at", { ascending: false }),
      supabase
        .from("clusters")
        .select("*, members:cluster_members(reference_id, score)")
        .eq("board_id", id)
        .order("created_at"),
      supabase
        .from("jobs")
        .select("kind, status")
        .eq("board_id", id)
        .in("status", ["pending", "running"]),
    ]);
  if (!board) notFound();

  const placed = (items ?? []) as (BoardItem & { reference: Reference })[];
  const references = await toViews(
    supabase,
    placed.map((i) => i.reference),
  );

  return (
    <div className="flex h-dvh flex-col">
      <SiteHeader email={userData.user?.email} />
      <BoardWorkspace
        board={board as Board}
        items={placed.map(({ reference: _r, ...item }) => item)}
        references={references}
        boards={boards ?? []}
        clusters={(clusters ?? []) as (Cluster & { members: Pick<ClusterMember, "reference_id" | "score">[] })[]}
        clustering={(jobs ?? []).some((j) => j.kind === "cluster")}
        initialView={view === "grid" ? "grid" : "canvas"}
      />
    </div>
  );
}
