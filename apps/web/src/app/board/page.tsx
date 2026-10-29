import { connection } from "next/server";
import type { Board, BoardItem, Cluster, ClusterMember, Reference } from "@justcreate/shared";
import { AutoRefresh } from "@/components/auto-refresh";
import { SiteHeader } from "@/components/site-header";
import { homeBoard } from "@/lib/boards";
import { toViews } from "@/lib/references";
import { requireUser } from "@/lib/require-user";
import { BoardWorkspace } from "./board-workspace";

// Per-user page: nothing useful to prerender.
export const instant = false;

/** The user's one board: every saved reference lands here, and clusters group it. */
export default async function BoardPage({ searchParams }: PageProps<"/board">) {
  await connection();
  const { view } = await searchParams;
  const { supabase, user } = await requireUser();
  const { id } = await homeBoard(supabase, user.id);

  const [{ data: board }, { data: items }, { data: clusters }, { data: jobs }] = await Promise.all([
    supabase.from("boards").select("*").eq("id", id).single(),
    supabase.from("board_items").select("*, reference:references(*)").eq("board_id", id),
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

  const placed = (items ?? []) as (BoardItem & { reference: Reference })[];
  const references = await toViews(
    supabase,
    placed.map((i) => i.reference),
  );

  return (
    <div className="flex h-dvh flex-col">
      <SiteHeader />
      {/* New captures from the extension appear without a reload. */}
      <AutoRefresh />
      <BoardWorkspace
        board={board as Board}
        items={placed.map((i) => ({ board_id: i.board_id, reference_id: i.reference_id, x: i.x, y: i.y, w: i.w, h: i.h, z: i.z }))}
        references={references}
        clusters={(clusters ?? []) as (Cluster & { members: Pick<ClusterMember, "reference_id" | "score">[] })[]}
        clustering={(jobs ?? []).some((j) => j.kind === "cluster")}
        initialView={view === "grid" ? "grid" : "canvas"}
      />
    </div>
  );
}
