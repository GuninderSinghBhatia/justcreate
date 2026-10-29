import { NextResponse } from "next/server";
import { agentAuth } from "@/lib/agent";

/** list_boards: every board with its size, clusters, latest design.md version and which clusters have their own. */
export async function GET(request: Request) {
  const ctx = await agentAuth(request);
  if (ctx instanceof NextResponse) return ctx;
  const { db, userId } = ctx;

  const [{ data: boards }, { data: items }, { data: specs }, { data: clusters }] = await Promise.all([
    db.from("boards").select("id, name, updated_at").eq("user_id", userId).order("updated_at", { ascending: false }),
    db.from("board_items").select("board_id").eq("user_id", userId),
    db.from("design_specs").select("board_id, version, created_at, cluster_id:sources->>cluster_id").eq("user_id", userId).order("version", { ascending: false }),
    db.from("clusters").select("id, board_id, name, status").eq("user_id", userId).neq("status", "rejected"),
  ]);

  return NextResponse.json({
    boards: (boards ?? []).map((b) => {
      const spec = specs?.find((s) => s.board_id === b.id && !s.cluster_id);
      const own = new Set((specs ?? []).filter((s) => s.board_id === b.id && s.cluster_id).map((s) => s.cluster_id));
      return {
        id: b.id,
        name: b.name,
        references: (items ?? []).filter((i) => i.board_id === b.id).length,
        clusters: (clusters ?? []).filter((c) => c.board_id === b.id && c.status === "accepted").map((c) => c.name),
        cluster_specs: (clusters ?? []).filter((c) => c.board_id === b.id && own.has(c.id)).map((c) => c.name),
        design_spec: spec ? { version: spec.version, created_at: spec.created_at } : null,
        updated_at: b.updated_at,
      };
    }),
  });
}
