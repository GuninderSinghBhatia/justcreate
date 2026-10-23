import { NextResponse } from "next/server";
import { touchBoard } from "@/lib/boards";
import { requestUser } from "@/lib/request-user";

interface CanvasSave {
  /** tldraw document snapshot (getSnapshot(editor.store).document) */
  document: unknown;
  /** Reference cards on the canvas, in page coordinates. */
  items: { referenceId: string; x: number; y: number; w: number; h: number; z: number }[];
}

/**
 * Saves the canvas and makes board_items match the reference cards on it: cards added on the
 * canvas become board items, cards deleted from the canvas are removed from the board.
 */
export async function PUT(request: Request, { params }: RouteContext<"/api/boards/[id]/canvas">) {
  const { id: boardId } = await params;
  const auth = await requestUser(request);
  if (!auth) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { supabase, user } = auth;

  const body = (await request.json().catch(() => null)) as CanvasSave | null;
  if (!body || !Array.isArray(body.items)) return NextResponse.json({ error: "Bad body" }, { status: 400 });

  const { error: boardError } = await supabase
    .from("boards")
    .update({ document: body.document, updated_at: new Date().toISOString() })
    .eq("id", boardId);
  if (boardError) return NextResponse.json({ error: boardError.message }, { status: 500 });

  const { data: existing } = await supabase.from("board_items").select("reference_id").eq("board_id", boardId);
  const before = new Set((existing ?? []).map((i) => i.reference_id));
  const onCanvas = new Set(body.items.map((i) => i.referenceId));

  if (body.items.length) {
    const { error } = await supabase.from("board_items").upsert(
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
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const removed = [...before].filter((id) => !onCanvas.has(id));
  if (removed.length) {
    await supabase.from("board_items").delete().eq("board_id", boardId).in("reference_id", removed);
  }

  const added = [...onCanvas].filter((id) => !before.has(id)).length;
  if (added) await touchBoard(supabase, user.id, boardId, added);
  return NextResponse.json({ ok: true, added, removed: removed.length });
}
