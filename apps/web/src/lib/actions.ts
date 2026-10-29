"use server";

import { revalidatePath } from "next/cache";
import { CAPTURES_BUCKET, type Reference } from "@justcreate/shared";
import { addToBoard, homeBoard } from "@/lib/boards";
import { requireUser } from "@/lib/require-user";

// ---------- the board (one per user) ----------

export async function renameBoard(name: string) {
  const { supabase, user } = await requireUser();
  const trimmed = name.trim();
  if (!trimmed) return;
  const board = await homeBoard(supabase, user.id);
  const { error } = await supabase.from("boards").update({ name: trimmed }).eq("id", board.id);
  if (error) throw new Error(error.message);
  revalidatePath("/board");
}

export async function addReferencesToBoard(referenceIds: string[]) {
  const { supabase, user } = await requireUser();
  const board = await homeBoard(supabase, user.id);
  const { data } = await supabase.from("references").select("id, metadata").in("id", referenceIds);
  await addToBoard(supabase, user.id, board.id, (data ?? []) as Pick<Reference, "id" | "metadata">[]);
  revalidatePath("/board");
}

export async function removeFromBoard(referenceId: string) {
  const { supabase, user } = await requireUser();
  const board = await homeBoard(supabase, user.id);
  const { error } = await supabase
    .from("board_items")
    .delete()
    .eq("board_id", board.id)
    .eq("reference_id", referenceId);
  if (error) throw new Error(error.message);
  revalidatePath("/board");
}

// ---------- references ----------

export interface ReferenceEdit {
  title?: string | null;
  note?: string | null;
  description?: string | null;
  labels?: string[];
}

export async function updateReference(referenceId: string, edit: ReferenceEdit) {
  const { supabase } = await requireUser();
  // Server Actions can be called with anything: keep only well-formed fields, within limits.
  const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) || null : null);
  const patch: ReferenceEdit = {};
  if (edit?.title !== undefined) patch.title = text(edit.title, 500);
  if (edit?.note !== undefined) patch.note = text(edit.note, 5000);
  if (edit?.description !== undefined) patch.description = text(edit.description, 5000);
  if (edit?.labels !== undefined) {
    const labels = Array.isArray(edit.labels) ? edit.labels.filter((l): l is string => typeof l === "string") : [];
    patch.labels = [...new Set(labels.map((l) => l.trim().toLowerCase().slice(0, 60)).filter(Boolean))].slice(0, 30);
  }
  const { error } = await supabase.from("references").update(patch).eq("id", referenceId);
  if (error) throw new Error(error.message);
}

export async function deleteReference(referenceId: string) {
  const { supabase } = await requireUser();
  const { data: ref } = await supabase
    .from("references")
    .select("file_path, thumbnail_path")
    .eq("id", referenceId)
    .single();
  const { error } = await supabase.from("references").delete().eq("id", referenceId);
  if (error) throw new Error(error.message);
  const paths = [...new Set([ref?.file_path, ref?.thumbnail_path].filter((p): p is string => Boolean(p)))];
  if (paths.length) await supabase.storage.from(CAPTURES_BUCKET).remove(paths);
}
