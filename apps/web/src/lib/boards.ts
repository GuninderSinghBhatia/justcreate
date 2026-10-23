import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { CARD_WIDTH, cardSize, type Reference } from "@justcreate/shared";
import { enqueueJob, RECLUSTER_AFTER } from "@/lib/jobs";

const GAP = 24;
const COLUMNS = 6;

/**
 * Places references on a board below whatever is already there, in a simple grid.
 * The canvas creates card shapes for any board_items it doesn't have yet.
 */
export async function addToBoard(
  supabase: SupabaseClient,
  userId: string,
  boardId: string,
  references: Pick<Reference, "id" | "metadata">[],
) {
  if (!references.length) return;
  const { data: existing } = await supabase
    .from("board_items")
    .select("reference_id, y, h")
    .eq("board_id", boardId);
  const taken = new Set((existing ?? []).map((i) => i.reference_id));
  const fresh = references.filter((r) => !taken.has(r.id));
  if (!fresh.length) return;

  const top = Math.max(0, ...(existing ?? []).map((i) => i.y + i.h + GAP));
  const rows = fresh.map((r, n) => {
    const { w, h } = cardSize(r.metadata);
    return {
      board_id: boardId,
      reference_id: r.id,
      user_id: userId,
      x: (n % COLUMNS) * (CARD_WIDTH + GAP),
      y: top + Math.floor(n / COLUMNS) * (440 + GAP),
      w,
      h,
    };
  });
  const { error } = await supabase.from("board_items").insert(rows);
  if (error) throw new Error(`Couldn't add to board: ${error.message}`);
  await touchBoard(supabase, userId, boardId, fresh.length);
}

/** Marks the board updated and queues re-clustering once enough new references arrived. */
export async function touchBoard(supabase: SupabaseClient, userId: string, boardId: string, added = 0) {
  const { data: board } = await supabase
    .from("boards")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", boardId)
    .select("clustered_at")
    .single();
  if (!added || !board) return;

  let query = supabase.from("board_items").select("reference_id", { count: "exact", head: true }).eq("board_id", boardId);
  if (board.clustered_at) query = query.gt("created_at", board.clustered_at);
  const { count } = await query;
  if ((count ?? 0) >= RECLUSTER_AFTER) await enqueueJob(userId, "cluster", { boardId }).catch((e) => console.error(e));
}
