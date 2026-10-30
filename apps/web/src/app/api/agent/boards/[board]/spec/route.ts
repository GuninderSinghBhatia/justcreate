import { NextResponse } from "next/server";
import { agentAuth, findBoard } from "@/lib/agent";

/**
 * get_design_spec: the board's latest design.md (or ?version=n), or one cluster's own design.md
 * with ?cluster=<name or id>. Each cluster's document is stored with `sources.cluster_id`.
 */
export async function GET(request: Request, { params }: RouteContext<"/api/agent/boards/[board]/spec">) {
  const ctx = await agentAuth(request);
  if (ctx instanceof NextResponse) return ctx;
  // Next.js has already decoded the segment (a second decode breaks names like "50% off").
  const found = await findBoard(ctx, (await params).board);
  if ("error" in found) return NextResponse.json({ error: found.error }, { status: 404 });

  const search = new URL(request.url).searchParams;
  const version = search.get("version");
  if (version !== null && !/^[1-9]\d{0,8}$/.test(version)) {
    return NextResponse.json({ error: "version must be a positive whole number" }, { status: 400 });
  }
  const wanted = search.get("cluster");
  let cluster: { id: string; name: string } | null = null;
  if (wanted) {
    const { data: clusters } = await ctx.db
      .from("clusters")
      .select("id, name")
      .eq("board_id", found.board.id)
      .eq("user_id", ctx.userId)
      .neq("status", "rejected");
    cluster = clusters?.find((c) => c.id === wanted || c.name.toLowerCase() === wanted.toLowerCase()) ?? null;
    if (!cluster) {
      return NextResponse.json({ error: `No cluster “${wanted}”. Clusters: ${(clusters ?? []).map((c) => c.name).join(", ") || "none"}` }, { status: 404 });
    }
  }

  let query = ctx.db
    .from("design_specs")
    .select("version, kind, created_at, markdown")
    .eq("board_id", found.board.id)
    .eq("user_id", ctx.userId)
    .order("version", { ascending: false })
    .limit(1);
  query = cluster ? query.eq("sources->>cluster_id", cluster.id) : query.is("sources->>cluster_id", null);
  if (version) query = query.eq("version", Number(version));
  const { data } = await query.maybeSingle();
  if (!data) {
    const where = cluster ? `cluster “${cluster.name}” on board “${found.board.name}”` : `Board “${found.board.name}”`;
    return NextResponse.json(
      { error: `${cluster ? "The " : ""}${where} has no design.md yet. Generate one in JUSTCREATE (Clusters → the cluster’s design.md).` },
      { status: 404 },
    );
  }
  return NextResponse.json({ board: found.board, cluster, ...data });
}
