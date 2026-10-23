import { NextResponse } from "next/server";
import { agentAuth, findBoard } from "@/lib/agent";

/** get_design_spec: the board's latest design.md (or ?version=n). */
export async function GET(request: Request, { params }: RouteContext<"/api/agent/boards/[board]/spec">) {
  const ctx = await agentAuth(request);
  if (ctx instanceof NextResponse) return ctx;
  const found = await findBoard(ctx, decodeURIComponent((await params).board));
  if ("error" in found) return NextResponse.json({ error: found.error }, { status: 404 });

  const version = new URL(request.url).searchParams.get("version");
  let query = ctx.db
    .from("design_specs")
    .select("version, kind, created_at, markdown")
    .eq("board_id", found.board.id)
    .eq("user_id", ctx.userId)
    .order("version", { ascending: false })
    .limit(1);
  if (version) query = query.eq("version", Number(version));
  const { data } = await query.maybeSingle();
  if (!data) {
    return NextResponse.json(
      { error: `Board “${found.board.name}” has no design.md yet. Generate one in JUSTCREATE (board → design.md).` },
      { status: 404 },
    );
  }
  return NextResponse.json({ board: found.board, ...data });
}
