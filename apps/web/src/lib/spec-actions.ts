"use server";

import { revalidatePath } from "next/cache";
import { enqueueJob } from "@/lib/jobs";
import { must, requireUser } from "@/lib/require-user";
import { generationsThisMonth } from "@/lib/usage";

/**
 * A board has one design.md for the whole board and one per cluster (`clusterId`): each is its own
 * line of versions, told apart by `sources.cluster_id` (absent for the board's).
 */

/** Queues a full design.md: the board's (optionally focused on chosen clusters), or one cluster's. */
export async function generateSpec(boardId: string, clusterIds: string[], clusterId?: string) {
  if (clusterId) await keepCluster(clusterId);
  return queueSpec(boardId, clusterId ? { cluster_id: clusterId } : { cluster_ids: clusterIds });
}

/** Queues a rewrite of one section; edits elsewhere in the latest version are kept. */
export async function regenerateSection(boardId: string, section: string, clusterId?: string) {
  return queueSpec(boardId, { section, ...(clusterId ? { cluster_id: clusterId } : {}) });
}

/** A cluster with its own design.md is accepted: re-clustering replaces suggestions, and would take it away. */
async function keepCluster(clusterId: string) {
  const { supabase } = await requireUser();
  must(await supabase.from("clusters").update({ status: "accepted" }).eq("id", clusterId).eq("status", "suggested"));
  revalidatePath("/board");
}

async function queueSpec(boardId: string, params: Record<string, unknown>) {
  const { supabase, user } = await requireUser();
  const usage = await generationsThisMonth(supabase, user.id);
  if (!usage.left) {
    throw new Error(`Monthly limit reached (${usage.limit} AI generations). Editing and downloading still work.`);
  }
  const result = await enqueueJob(user.id, "spec", { boardId }, params);
  // One design.md is written at a time per board (and the free AI tier is paced per minute).
  if (result === "already-queued") throw new Error("Another design.md is being written for this board. Try again when it's done.");
  revalidatePath("/board/spec");
  return result;
}

/** Saves the editor's markdown as a new version of the board's or a cluster's design.md. */
export async function saveSpecEdit(boardId: string, markdown: string, clusterId?: string) {
  const { supabase, user } = await requireUser();
  for (let attempt = 0; attempt < 3; attempt++) {
    // Version numbers are unique per board, shared by all its documents.
    const { data: latest } = await supabase
      .from("design_specs")
      .select("version")
      .eq("board_id", boardId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const version = (latest?.version ?? 0) + 1;
    const { error } = await supabase.from("design_specs").insert({
      board_id: boardId,
      user_id: user.id,
      version,
      markdown,
      kind: "edit",
      sources: clusterId ? { cluster_id: clusterId } : {},
    });
    if (!error) {
      revalidatePath("/board/spec");
      return version;
    }
    if (error.code !== "23505") throw new Error(error.message); // 23505: someone took that number, retry
  }
  throw new Error("Couldn't save the version. Try again.");
}
