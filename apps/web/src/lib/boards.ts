import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { CARD_WIDTH, cardSize, type Reference } from "@justcreate/shared";
import { enqueueJob, RECLUSTER_AFTER } from "@/lib/jobs";

const GAP = 24;

/**
 * Each user has exactly one board: everything they save lands on it, and clusters group it.
 * Returns the oldest board (older accounts may have more), creating it on first use.
 */
export async function homeBoard(supabase: SupabaseClient, userId: string): Promise<{ id: string; name: string }> {
  const { data } = await supabase
    .from("boards")
    .select("id, name")
    .eq("user_id", userId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (data) return data;
  const { data: created, error } = await supabase
    .from("boards")
    .insert({ user_id: userId, name: "My board" })
    .select("id, name")
    .single();
  if (error) throw new Error(`Couldn't create your board: ${error.message}`);
  return created;
}
/** Width of the area new cards are scattered over, about five cards across. */
const SPREAD = 5 * (CARD_WIDTH + GAP);
const TRIES = 120;

type Box = { x: number; y: number; w: number; h: number };

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.w + GAP && b.x < a.x + a.w + GAP && a.y < b.y + b.h + GAP && b.y < a.y + a.h + GAP;

/**
 * A free spot for a card, moodboard-style: random positions across the board's width, preferring
 * ones near the top so the board fills its gaps instead of growing a line downwards.
 */
function freeSpot(boxes: Box[], w: number, h: number): { x: number; y: number } {
  const left = boxes.length ? Math.min(...boxes.map((b) => b.x)) : 0;
  const top = boxes.length ? Math.min(...boxes.map((b) => b.y)) : 0;
  const bottom = boxes.length ? Math.max(...boxes.map((b) => b.y + b.h)) : 0;
  let best: { x: number; y: number; score: number } | null = null;
  for (let i = 0; i < TRIES; i++) {
    const x = Math.round(left + Math.random() * (SPREAD - w));
    const y = Math.round(top + Math.random() * (bottom - top + h));
    if (boxes.some((b) => overlaps(b, { x, y, w, h }))) continue;
    const score = y + Math.random() * 240; // mostly the highest spot, with some wander
    if (!best || score < best.score) best = { x, y, score };
  }
  if (best) return best;
  // The area is full: start a loose new row below it.
  return { x: Math.round(left + Math.random() * (SPREAD - w)), y: Math.round(bottom + GAP + Math.random() * 60) };
}

/**
 * Places references on a board in free spots around what's already there, at slightly varied
 * sizes. The canvas creates images for any board_items it doesn't have yet.
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
    .select("reference_id, x, y, w, h")
    .eq("board_id", boardId);
  const taken = new Set((existing ?? []).map((i) => i.reference_id));
  const fresh = references.filter((r) => !taken.has(r.id));
  if (!fresh.length) return;

  const boxes: Box[] = [...(existing ?? [])];
  const rows = fresh.map((r) => {
    const size = cardSize(r.metadata);
    const scale = 0.85 + Math.random() * 0.4;
    const w = Math.round(size.w * scale);
    const h = Math.round(size.h * scale);
    const spot = freeSpot(boxes, w, h);
    boxes.push({ ...spot, w, h });
    return { board_id: boardId, reference_id: r.id, user_id: userId, x: spot.x, y: spot.y, w, h };
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
