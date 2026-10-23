"use server";

import { revalidatePath } from "next/cache";
import { enqueueJob } from "@/lib/jobs";
import { must, requireUser } from "@/lib/require-user";

/** Queues a full design.md generation (optionally from chosen clusters only). */
export async function generateSpec(boardId: string, clusterIds: string[]) {
  const { user } = await requireUser();
  const result = await enqueueJob(user.id, "spec", { boardId }, { cluster_ids: clusterIds });
  revalidatePath(`/boards/${boardId}/spec`);
  return result;
}

/** Queues a rewrite of one section; edits elsewhere in the latest version are kept. */
export async function regenerateSection(boardId: string, section: string) {
  const { user } = await requireUser();
  const result = await enqueueJob(user.id, "spec", { boardId }, { section });
  revalidatePath(`/boards/${boardId}/spec`);
  return result;
}

/** Saves the editor's markdown as a new version. */
export async function saveSpecEdit(boardId: string, markdown: string) {
  const { supabase, user } = await requireUser();
  const { data: latest } = await supabase
    .from("design_specs")
    .select("version")
    .eq("board_id", boardId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const version = (latest?.version ?? 0) + 1;
  must(
    await supabase
      .from("design_specs")
      .insert({ board_id: boardId, user_id: user.id, version, markdown, kind: "edit", sources: {} }),
  );
  revalidatePath(`/boards/${boardId}/spec`);
  return version;
}
