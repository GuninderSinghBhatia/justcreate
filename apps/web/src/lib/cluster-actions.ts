"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { enqueueJob } from "@/lib/jobs";
import { must, requireUser } from "@/lib/require-user";

/**
 * User control over clusters. The worker only ever replaces *suggested* AI clusters on a re-run:
 * accepted and user-made clusters are left alone, and rejected ones are remembered so the same
 * group isn't suggested again.
 */

type Ctx = { supabase: SupabaseClient; user: User; now: string };

/** Runs `fn` for a cluster, then refreshes its board page. */
async function onCluster(clusterId: string, fn: (ctx: Ctx) => Promise<unknown>) {
  const { supabase, user } = await requireUser();
  const { data } = must(await supabase.from("clusters").select("board_id").eq("id", clusterId).single());
  await fn({ supabase, user, now: new Date().toISOString() });
  revalidatePath(`/boards/${data!.board_id}`);
}

const members = (clusterId: string, referenceIds: string[], userId: string, score = 1) =>
  referenceIds.map((reference_id) => ({ cluster_id: clusterId, reference_id, user_id: userId, score }));

export async function setClusterStatus(clusterId: string, status: "accepted" | "rejected" | "suggested") {
  await onCluster(clusterId, async ({ supabase, now }) =>
    must(
      await supabase
        .from("clusters")
        .update({ status, decided_at: status === "suggested" ? null : now, updated_at: now })
        .eq("id", clusterId),
    ),
  );
}

export async function renameCluster(clusterId: string, name: string) {
  if (!name.trim()) return;
  await onCluster(clusterId, async ({ supabase, now }) =>
    must(await supabase.from("clusters").update({ name: name.trim(), updated_at: now }).eq("id", clusterId)),
  );
}

/** Merges clusters into the first one. The result counts as accepted: the user shaped it. */
export async function mergeClusters(clusterIds: string[]) {
  const [target, ...rest] = clusterIds;
  if (!rest.length) return;
  await onCluster(target, async ({ supabase, user, now }) => {
    const { data } = await supabase.from("cluster_members").select("reference_id").in("cluster_id", rest);
    const ids = [...new Set((data ?? []).map((m) => m.reference_id as string))];
    must(await supabase.from("cluster_members").upsert(members(target, ids, user.id), { ignoreDuplicates: true }));
    must(await supabase.from("clusters").delete().in("id", rest));
    must(await supabase.from("clusters").update({ status: "accepted", decided_at: now, updated_at: now }).eq("id", target));
  });
}

export async function addClusterMembers(clusterId: string, referenceIds: string[]) {
  if (!referenceIds.length) return;
  await onCluster(clusterId, async ({ supabase, user }) =>
    must(await supabase.from("cluster_members").upsert(members(clusterId, referenceIds, user.id), { ignoreDuplicates: true })),
  );
}

export async function removeClusterMember(clusterId: string, referenceId: string) {
  await onCluster(clusterId, async ({ supabase }) =>
    must(await supabase.from("cluster_members").delete().eq("cluster_id", clusterId).eq("reference_id", referenceId)),
  );
}

export async function deleteCluster(clusterId: string) {
  await onCluster(clusterId, async ({ supabase }) => must(await supabase.from("clusters").delete().eq("id", clusterId)));
}

/** A cluster made by hand from the current canvas selection. Always accepted. */
export async function createManualCluster(boardId: string, name: string, referenceIds: string[]) {
  const { supabase, user } = await requireUser();
  const now = new Date().toISOString();
  const { data } = must(
    await supabase
      .from("clusters")
      .insert({ board_id: boardId, user_id: user.id, name: name.trim() || "New cluster", status: "accepted", source: "user", decided_at: now })
      .select("id")
      .single(),
  );
  if (referenceIds.length) must(await supabase.from("cluster_members").insert(members(data!.id, referenceIds, user.id)));
  revalidatePath(`/boards/${boardId}`);
}

/** "Re-cluster" button: queue a clustering run for the board. */
export async function reclusterBoard(boardId: string) {
  const { user } = await requireUser();
  await enqueueJob(user.id, "cluster", { boardId });
  revalidatePath(`/boards/${boardId}`);
}
