import { connection } from "next/server";
import type { Board, BoardItem, Cluster, ClusterMember } from "@justcreate/shared";
import { AutoRefresh } from "@/components/auto-refresh";
import { SiteHeader } from "@/components/site-header";
import { homeBoard } from "@/lib/boards";
import { ANALYSIS_EMBED, toViews, type ReferenceRow } from "@/lib/references";
import { requireUser } from "@/lib/require-user";
import { BoardWorkspace } from "./board-workspace";

// Per-user page: nothing useful to prerender.
export const instant = false;

type BoardRow = Board & {
  items: (BoardItem & { reference: ReferenceRow })[];
  clusters: (Cluster & { members: Pick<ClusterMember, "reference_id" | "score">[] })[];
};

// The whole board in one query: each round trip to the database is the slow part of this page.
const BOARD_SELECT = `*,
  items:board_items(board_id, reference_id, x, y, w, h, z, reference:references(*, ${ANALYSIS_EMBED})),
  clusters(*, members:cluster_members(reference_id, score))`;

/** The user's one board: every saved reference lands here, and clusters group it. */
export default async function BoardPage({ searchParams }: PageProps<"/board">) {
  await connection();
  const { view } = await searchParams;
  const { supabase, user } = await requireUser();

  // The oldest board is the board (see homeBoard). Open clustering jobs load alongside it.
  const load = () =>
    supabase
      .from("boards")
      .select(BOARD_SELECT)
      .eq("user_id", user.id)
      .order("created_at")
      .order("created_at", { referencedTable: "clusters" })
      .limit(1)
      .maybeSingle<BoardRow>();
  const [first, { data: jobs }] = await Promise.all([
    load(),
    supabase
      .from("jobs")
      .select("id")
      .eq("user_id", user.id)
      .eq("kind", "cluster")
      .in("status", ["pending", "running"]),
  ]);
  if (first.error) throw new Error(first.error.message);
  let board = first.data;
  if (!board) {
    await homeBoard(supabase, user.id); // first visit: create it
    board = (await load()).data!;
  }

  const references = await toViews(
    supabase,
    board.items.map((i) => i.reference),
  );

  return (
    <div className="flex h-dvh flex-col">
      <SiteHeader />
      {/* New captures from the extension appear without a reload. */}
      <AutoRefresh />
      <BoardWorkspace
        board={board}
        items={board.items.map((i) => ({ board_id: i.board_id, reference_id: i.reference_id, x: i.x, y: i.y, w: i.w, h: i.h, z: i.z }))}
        references={references}
        clusters={board.clusters}
        clustering={(jobs ?? []).length > 0}
        initialView={view === "grid" ? "grid" : "canvas"}
      />
    </div>
  );
}
