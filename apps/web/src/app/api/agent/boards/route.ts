import { NextResponse } from "next/server";
import { agentAuth } from "@/lib/agent";

/** list_boards: every board with its size, clusters and latest design.md version. */
export async function GET(request: Request) {
  const ctx = await agentAuth(request);
  if (ctx instanceof NextResponse) return ctx;
  const { db, userId } = ctx;

  const [{ data: boards }, { data: items }, { data: specs }, { data: clusters }] = await Promise.all([
    db.from("boards").select("id, name, updated_at").eq("user_id", userId).order("updated_at", { ascending: false }),
    db.from("board_items").select("board_id").eq("user_id", userId),
    db.from("design_specs").select("board_id, version, created_at").eq("user_id", userId).order("version", { ascending: false }),
    db.from("clusters").select("board_id, name").eq("user_id", userId).in("status", ["accepted"]),
  ]);

  return NextResponse.json({
    boards: (boards ?? []).map((b) => {
      const spec = specs?.find((s) => s.board_id === b.id);
      return {
        id: b.id,
        name: b.name,
        references: (items ?? []).filter((i) => i.board_id === b.id).length,
        clusters: (clusters ?? []).filter((c) => c.board_id === b.id).map((c) => c.name),
        design_spec: spec ? { version: spec.version, created_at: spec.created_at } : null,
        updated_at: b.updated_at,
      };
    }),
  });
}
