"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueJob } from "@/lib/jobs";
import { must, ownBoard, requireUser, userFacing, UserError } from "@/lib/require-user";
import { SPEC_SECTIONS } from "@/lib/spec";
import { generationsThisMonth } from "@/lib/usage";

/**
 * A board has one design.md for the whole board and one per cluster (`clusterId`): each is its own
 * line of versions, told apart by `sources.cluster_id` (absent for the board's). Each action checks
 * that the board (and cluster) are the caller's before anything is queued: jobs are written with
 * the secret key, so RLS doesn't stand in the way there.
 */

/** Queues a full design.md: the board's (optionally focused on chosen clusters), or one cluster's. */
export async function generateSpec(boardId: string, clusterIds: string[], clusterId?: string) {
  return userFacing(async () => {
    const { supabase } = await requireUser();
    await ownBoard(supabase, boardId);
    if (clusterId) await ownCluster(supabase, boardId, clusterId);
    const focus = Array.isArray(clusterIds) ? clusterIds.filter((id) => typeof id === "string").slice(0, 50) : [];
    const result = await queueSpec(boardId, clusterId ? { cluster_id: clusterId } : { cluster_ids: focus });
    // Only once the job is really queued: a refused request leaves the cluster as it was.
    if (clusterId) await keepCluster(supabase, clusterId);
    return result;
  });
}

/** Queues a rewrite of one section; edits elsewhere in the latest version are kept. */
export async function regenerateSection(boardId: string, section: string, clusterId?: string) {
  return userFacing(async () => {
    if (!SPEC_SECTIONS.some(([key]) => key === section)) throw new UserError("Unknown section");
    const { supabase } = await requireUser();
    await ownBoard(supabase, boardId);
    if (clusterId) await ownCluster(supabase, boardId, clusterId);
    return queueSpec(boardId, { section, ...(clusterId ? { cluster_id: clusterId } : {}) });
  });
}

async function ownCluster(supabase: SupabaseClient, boardId: string, clusterId: string) {
  const { data } = await supabase.from("clusters").select("id").eq("id", clusterId).eq("board_id", boardId).maybeSingle();
  if (!data) throw new UserError("Cluster not found");
}

/** A cluster with its own design.md is accepted: re-clustering replaces suggestions, and would take it away. */
async function keepCluster(supabase: SupabaseClient, clusterId: string) {
  must(await supabase.from("clusters").update({ status: "accepted" }).eq("id", clusterId).eq("status", "suggested"));
  revalidatePath("/board");
}

async function queueSpec(boardId: string, params: Record<string, unknown>) {
  const { supabase, user } = await requireUser();
  const usage = await generationsThisMonth(supabase, user.id);
  if (!usage.left) {
    throw new UserError(`Monthly limit reached (${usage.limit} AI generations). Editing and downloading still work.`);
  }
  const result = await enqueueJob(user.id, "spec", { boardId }, params);
  // One design.md is written at a time per board (and the free AI tier is paced per minute).
  if (result === "already-queued") throw new UserError("Another design.md is being written for this board. Try again when it's done.");
  revalidatePath("/board/spec");
  return result;
}

/** Saves the editor's markdown as a new version of the board's or a cluster's design.md. */
export async function saveSpecEdit(boardId: string, markdown: string, clusterId?: string) {
  return userFacing(async () => {
    if (typeof markdown !== "string") throw new UserError("Nothing to save");
    if (markdown.length > 200_000) throw new UserError("design.md is too long to save (200,000 characters at most)");
    const { supabase, user } = await requireUser();
    await ownBoard(supabase, boardId);
    if (clusterId) await ownCluster(supabase, boardId, clusterId);
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
      if (error.code !== "23505") {
        console.error("saveSpecEdit:", error.message);
        throw new UserError("Couldn't save the version. Try again.");
      }
      // 23505: someone took that number, retry
    }
    throw new UserError("Couldn't save the version. Try again.");
  });
}
