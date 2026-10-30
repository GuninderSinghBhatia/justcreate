import { NextResponse } from "next/server";
import { CAPTURES_BUCKET } from "@justcreate/shared";
import { agentAuth, findBoard } from "@/lib/agent";
import { shortIds } from "@/lib/spec";

const CHUNK = 200;
type RefRow = {
  id: string;
  type: string;
  title: string | null;
  source_url: string | null;
  page_url: string | null;
  note: string | null;
  labels: string[];
  thumbnail_path: string | null;
};
type AnalysisRow = { reference_id: string; caption: string | null; tags: string[]; palette: string[]; components: string[]; effects: string[] };

/** Links handed to agents are web pages only. */
const webUrl = (url: string | null) => (url && /^https?:\/\//i.test(url) ? url : null);

/**
 * get_references: the board's references (optionally one cluster) with short-lived image URLs,
 * source links and analysis. `short` matches the [ref:xxxxxx] citations in design.md.
 */
export async function GET(request: Request, { params }: RouteContext<"/api/agent/boards/[board]/references">) {
  const ctx = await agentAuth(request);
  if (ctx instanceof NextResponse) return ctx;
  const { db, userId } = ctx;
  // Next.js has already decoded the segment (a second decode breaks names like "50% off").
  const found = await findBoard(ctx, (await params).board);
  if ("error" in found) return NextResponse.json({ error: found.error }, { status: 404 });
  const boardId = found.board.id;

  const [{ data: items }, { data: clusters }] = await Promise.all([
    db.from("board_items").select("reference_id").eq("board_id", boardId).eq("user_id", userId),
    db.from("clusters").select("id, name, status, cluster_members(reference_id)").eq("board_id", boardId).eq("user_id", userId).neq("status", "rejected"),
  ]);
  const allIds = (items ?? []).map((i) => i.reference_id as string);
  const short = new Map([...shortIds(allIds)].map(([s, id]) => [id, s]));

  const wanted = new URL(request.url).searchParams.get("cluster");
  let ids = allIds;
  if (wanted) {
    const cluster = clusters?.find((c) => c.id === wanted || c.name.toLowerCase() === wanted.toLowerCase());
    if (!cluster) {
      return NextResponse.json({ error: `No cluster “${wanted}”. Clusters: ${(clusters ?? []).map((c) => c.name).join(", ") || "none"}` }, { status: 404 });
    }
    ids = cluster.cluster_members.map((m) => m.reference_id);
  }
  if (!ids.length) return NextResponse.json({ board: found.board, clusters: [], references: [] });

  // In chunks: the id list travels in the URL, and big boards would overflow it.
  const refs: RefRow[] = [];
  const analyses: AnalysisRow[] = [];
  for (let n = 0; n < ids.length; n += CHUNK) {
    const chunk = ids.slice(n, n + CHUNK);
    const [r, a] = await Promise.all([
      db.from("references").select("id, type, title, source_url, page_url, note, labels, thumbnail_path").in("id", chunk).eq("user_id", userId),
      db.from("analyses").select("reference_id, caption, tags, palette, components, effects").in("reference_id", chunk).eq("user_id", userId),
    ]);
    if (r.error || a.error) {
      console.error("agent references:", r.error?.message ?? a.error?.message);
      return NextResponse.json({ error: "Couldn't load the references. Try again." }, { status: 500 });
    }
    refs.push(...(r.data as RefRow[]));
    analyses.push(...(a.data as AnalysisRow[]));
  }
  // Only files in the user's own folder are signed: these URLs are made with the secret key.
  const own = (path: string | null) => (path && path.startsWith(`${userId}/`) && !path.includes("..") ? path : null);
  const paths = refs.map((r) => own(r.thumbnail_path)).filter((p): p is string => Boolean(p));
  const signed = paths.length ? ((await db.storage.from(CAPTURES_BUCKET).createSignedUrls(paths, 60 * 60)).data ?? []) : [];
  const url = new Map(signed.map((s) => [s.path, s.signedUrl]));
  const analysis = new Map(analyses.map((a) => [a.reference_id, a]));
  const clusterNames = (refId: string) =>
    (clusters ?? []).filter((c) => c.cluster_members.some((m) => m.reference_id === refId)).map((c) => c.name);

  return NextResponse.json({
    board: found.board,
    clusters: (clusters ?? []).map((c) => ({ id: c.id, name: c.name, status: c.status, size: c.cluster_members.length })),
    references: refs.map((r) => {
      const a = analysis.get(r.id);
      return {
        id: r.id,
        ref: short.get(r.id),
        type: r.type,
        title: r.title,
        source_url: webUrl(r.source_url) ?? webUrl(r.page_url),
        image_url: own(r.thumbnail_path) ? (url.get(r.thumbnail_path!) ?? null) : null,
        note: r.note,
        labels: r.labels,
        clusters: clusterNames(r.id),
        caption: a?.caption ?? null,
        tags: a?.tags ?? [],
        palette: a?.palette ?? [],
        components: a?.components ?? [],
        effects: a?.effects ?? [],
      };
    }),
  });
}
