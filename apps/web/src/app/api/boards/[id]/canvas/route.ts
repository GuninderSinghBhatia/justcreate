import { NextResponse } from "next/server";
import { touchBoard } from "@/lib/boards";
import { requestUser } from "@/lib/request-user";

interface CanvasSave {
  /** Excalidraw scene: { type: "excalidraw", elements } (image files are not stored: they're the references). */
  document: unknown;
  /** Reference images on the canvas, in scene coordinates. */
  items: { referenceId: string; x: number; y: number; w: number; h: number; z: number }[];
  /** References this canvas had and the user deleted. Only these leave the board, so a tab that
   *  loaded before a new capture arrived can't remove it. */
  removed?: string[];
}

/**
 * Saves the canvas and keeps board_items in step with the reference images on it: images added on
 * the canvas become board items, images deleted from it are removed from the board.
 */
export async function PUT(request: Request, { params }: RouteContext<"/api/boards/[id]/canvas">) {
  const { id: boardId } = await params;
  const auth = await requestUser(request);
  if (!auth) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { supabase, user } = auth;

  const body = (await request.json().catch(() => null)) as CanvasSave | null;
  if (!body || !Array.isArray(body.items)) return NextResponse.json({ error: "Bad body" }, { status: 400 });

  // Independent calls run together: each round trip to the database is most of this request's time.
  const [{ error: boardError }, { data: existing }] = await Promise.all([
    supabase.from("boards").update({ document: body.document, updated_at: new Date().toISOString() }).eq("id", boardId),
    supabase.from("board_items").select("reference_id").eq("board_id", boardId),
  ]);
  if (boardError) return failed(boardError.message);
  const before = new Set((existing ?? []).map((i) => i.reference_id));
  const onCanvas = new Set(body.items.map((i) => i.referenceId));
  const removed = (body.removed ?? []).filter((id) => before.has(id) && !onCanvas.has(id));

  const [upserted] = await Promise.all([
    body.items.length
      ? supabase.from("board_items").upsert(
          body.items.map((i) => ({
            board_id: boardId,
            reference_id: i.referenceId,
            user_id: user.id,
            x: i.x,
            y: i.y,
            w: i.w,
            h: i.h,
            z: i.z,
          })),
          { onConflict: "board_id,reference_id" },
        )
      : null,
    removed.length ? supabase.from("board_items").delete().eq("board_id", boardId).in("reference_id", removed) : null,
  ]);
  if (upserted?.error) return failed(upserted.error.message);

  const added = [...onCanvas].filter((id) => !before.has(id)).length;
  if (added) await touchBoard(supabase, user.id, boardId, added);
  return NextResponse.json({ ok: true, added, removed: removed.length });
}

function failed(message: string) {
  console.error("Canvas save failed:", message);
  return NextResponse.json({ error: message }, { status: 500 });
}
