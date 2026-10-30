"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionUser } from "@/lib/supabase/server";
import { enqueueJob } from "@/lib/jobs";
import { allow } from "@/lib/rate-limit";
import { must, ownBoard, requireUser, userFacing, UserError } from "@/lib/require-user";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * User control over clusters. The worker only ever replaces *suggested* AI clusters on a re-run:
 * accepted and user-made clusters are left alone, and rejected ones are remembered so the same
 * group isn't suggested again.
 */

type Ctx = { supabase: SupabaseClient; user: SessionUser; now: string };

/** Runs `fn` for a cluster, then refreshes the board page. */
async function onCluster(clusterId: string, fn: (ctx: Ctx) => Promise<unknown>) {
  const { supabase, user } = await requireUser();
  must(await supabase.from("clusters").select("id").eq("id", clusterId).single()); // yours, or it throws
  await fn({ supabase, user, now: new Date().toISOString() });
  revalidatePath("/board");
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

const clusterName = (name: unknown) => (typeof name === "string" ? name.trim().slice(0, 120) : "");

export async function renameCluster(clusterId: string, name: string) {
  const clean = clusterName(name);
  if (!clean) return;
  await onCluster(clusterId, async ({ supabase, now }) =>
    must(await supabase.from("clusters").update({ name: clean, updated_at: now }).eq("id", clusterId)),
  );
}

/**
 * design.md versions follow their cluster: a merged cluster's documents join the target's line,
 * and a deleted cluster's go with it (nothing could open them otherwise). design_specs rows are
 * worker-written (RLS), so this uses the secret key, after the caller's ownership was checked.
 */
async function moveSpecs(userId: string, from: string[], to: string | null) {
  const db = createAdminClient();
  for (const id of from) {
    const { data } = await db.from("design_specs").select("id, sources").eq("user_id", userId).eq("sources->>cluster_id", id);
    for (const row of data ?? []) {
      must(
        to === null
          ? await db.from("design_specs").delete().eq("id", row.id).eq("user_id", userId)
          : await db.from("design_specs").update({ sources: { ...(row.sources ?? {}), cluster_id: to } }).eq("id", row.id).eq("user_id", userId),
      );
    }
  }
}

/** Merges clusters into the first one. The result counts as accepted: the user shaped it. */
export async function mergeClusters(clusterIds: string[]) {
  const [target, ...rest] = clusterIds;
  if (!rest.length) return;
  await onCluster(target, async ({ supabase, user, now }) => {
    const { data } = await supabase.from("cluster_members").select("reference_id").in("cluster_id", rest);
    const ids = [...new Set((data ?? []).map((m) => m.reference_id as string))];
    must(await supabase.from("cluster_members").upsert(members(target, ids, user.id), { ignoreDuplicates: true }));
    // Only clusters RLS shows this user (their own) are merged in.
    const { data: own } = await supabase.from("clusters").select("id").in("id", rest);
    const merged = (own ?? []).map((c) => c.id as string);
    await moveSpecs(user.id, merged, target);
    must(await supabase.from("clusters").delete().in("id", merged));
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
  await onCluster(clusterId, async ({ supabase, user }) => {
    must(await supabase.from("clusters").delete().eq("id", clusterId));
    await moveSpecs(user.id, [clusterId], null);
  });
}

/** A cluster made by hand from the current canvas selection. Always accepted. */
export async function createManualCluster(boardId: string, name: string, referenceIds: string[]) {
  const { supabase, user } = await requireUser();
  const now = new Date().toISOString();
  // The same image twice in the selection is one member.
  const ids = [...new Set(Array.isArray(referenceIds) ? referenceIds.filter((id) => typeof id === "string") : [])];
  const { data } = must(
    await supabase
      .from("clusters")
      .insert({ board_id: boardId, user_id: user.id, name: clusterName(name) || "New cluster", status: "accepted", source: "user", decided_at: now })
      .select("id")
      .single(),
  );
  if (ids.length) {
    const added = await supabase.from("cluster_members").upsert(members(data!.id, ids, user.id), { ignoreDuplicates: true });
    if (added.error) {
      await supabase.from("clusters").delete().eq("id", data!.id); // no empty cluster left behind
      throw new Error(added.error.message);
    }
  }
  revalidatePath("/board");
}

/** "Re-cluster" button: queue a clustering run for the board (jobs skip RLS, so ownership is checked first). */
export async function reclusterBoard(boardId: string) {
  return userFacing(async () => {
    const { supabase, user } = await requireUser();
    await ownBoard(supabase, boardId);
    // Re-clustering names groups with the LLM: a few runs a minute is plenty for a button.
    if (!allow(`recluster:${user.id}`, 3)) throw new UserError("Re-clustering was just started. Try again in a minute.");
    await enqueueJob(user.id, "cluster", { boardId });
    revalidatePath("/board");
  });
}
