"use server";

import { revalidatePath } from "next/cache";
import { enqueueJob } from "@/lib/jobs";
import { must, requireUser } from "@/lib/require-user";
import { generationsThisMonth } from "@/lib/usage";

/** Queues a full design.md generation (optionally from chosen clusters only). */
export async function generateSpec(boardId: string, clusterIds: string[]) {
  return queueSpec(boardId, { cluster_ids: clusterIds });
}

/** Queues a rewrite of one section; edits elsewhere in the latest version are kept. */
export async function regenerateSection(boardId: string, section: string) {
  return queueSpec(boardId, { section });
}

async function queueSpec(boardId: string, params: Record<string, unknown>) {
  const { supabase, user } = await requireUser();
  const usage = await generationsThisMonth(supabase, user.id);
  if (!usage.left) {
    throw new Error(`Monthly limit reached (${usage.limit} AI generations). Editing and downloading still work.`);
  }
  const result = await enqueueJob(user.id, "spec", { boardId }, params);
  revalidatePath("/board/spec");
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
  revalidatePath("/board/spec");
  return version;
}
