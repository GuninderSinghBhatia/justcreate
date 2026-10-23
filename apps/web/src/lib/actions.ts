"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CAPTURES_BUCKET, type Reference } from "@justcreate/shared";
import { addToBoard } from "@/lib/boards";
import { requireUser } from "@/lib/require-user";

// ---------- boards ----------

export async function createBoard(formData: FormData) {
  const { supabase, user } = await requireUser();
  const name = String(formData.get("name") ?? "").trim() || "Untitled board";
  const { data, error } = await supabase
    .from("boards")
    .insert({ user_id: user.id, name })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  redirect(`/boards/${data.id}`);
}

export async function renameBoard(boardId: string, name: string) {
  const { supabase } = await requireUser();
  const trimmed = name.trim();
  if (!trimmed) return;
  const { error } = await supabase.from("boards").update({ name: trimmed }).eq("id", boardId);
  if (error) throw new Error(error.message);
  revalidatePath("/boards");
  revalidatePath(`/boards/${boardId}`);
}

export async function deleteBoard(boardId: string) {
  const { supabase } = await requireUser();
  // References stay in the library; only the board and its placements go.
  const { error } = await supabase.from("boards").delete().eq("id", boardId);
  if (error) throw new Error(error.message);
  revalidatePath("/boards");
  redirect("/boards");
}

export async function setBoardCover(boardId: string, referenceId: string | null) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("boards").update({ cover_reference_id: referenceId }).eq("id", boardId);
  if (error) throw new Error(error.message);
  revalidatePath("/boards");
}

export async function addReferencesToBoard(boardId: string, referenceIds: string[]) {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("references").select("id, metadata").in("id", referenceIds);
  await addToBoard(supabase, user.id, boardId, (data ?? []) as Pick<Reference, "id" | "metadata">[]);
  revalidatePath(`/boards/${boardId}`);
  revalidatePath("/library");
}

export async function removeFromBoard(boardId: string, referenceId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("board_items")
    .delete()
    .eq("board_id", boardId)
    .eq("reference_id", referenceId);
  if (error) throw new Error(error.message);
  revalidatePath(`/boards/${boardId}`);
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
  const patch: ReferenceEdit = {};
  if (edit.title !== undefined) patch.title = edit.title?.trim() || null;
  if (edit.note !== undefined) patch.note = edit.note?.trim() || null;
  if (edit.description !== undefined) patch.description = edit.description?.trim() || null;
  if (edit.labels !== undefined) {
    patch.labels = [...new Set(edit.labels.map((l) => l.trim().toLowerCase()).filter(Boolean))].slice(0, 30);
  }
  const { error } = await supabase.from("references").update(patch).eq("id", referenceId);
  if (error) throw new Error(error.message);
  revalidatePath("/library");
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
  revalidatePath("/library");
}
