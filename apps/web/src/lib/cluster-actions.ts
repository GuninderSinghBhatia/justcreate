"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { enqueueJob } from "@/lib/jobs";
import { createClient } from "@/lib/supabase/server";

/**
 * User control over clusters. The worker only ever replaces *suggested* AI clusters on a re-run:
 * accepted and user-made clusters are left alone, and rejected ones are remembered so the same
 * group isn't suggested again.
 */

async function signedIn() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return { supabase, user: data.user };
}

async function boardOf(supabase: Awaited<ReturnType<typeof createClient>>, clusterId: string) {
  const { data, error } = await supabase.from("clusters").select("board_id").eq("id", clusterId).single();
  if (error) throw new Error(error.message);
  return data.board_id as string;
}

function check(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function setClusterStatus(clusterId: string, status: "accepted" | "rejected" | "suggested") {
  const { supabase } = await signedIn();
  const boardId = await boardOf(supabase, clusterId);
  check(
    (
      await supabase
        .from("clusters")
        .update({ status, decided_at: status === "suggested" ? null : new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", clusterId)
    ).error,
  );
  revalidatePath(`/boards/${boardId}`);
}

export async function renameCluster(clusterId: string, name: string) {
  const { supabase } = await signedIn();
  const trimmed = name.trim();
  if (!trimmed) return;
  const boardId = await boardOf(supabase, clusterId);
  check((await supabase.from("clusters").update({ name: trimmed, updated_at: new Date().toISOString() }).eq("id", clusterId)).error);
  revalidatePath(`/boards/${boardId}`);
}

/** Merges clusters into the first one. The result counts as accepted: the user shaped it. */
export async function mergeClusters(clusterIds: string[]) {
  if (clusterIds.length < 2) return;
  const { supabase, user } = await signedIn();
  const [target, ...rest] = clusterIds;
  const boardId = await boardOf(supabase, target);
  const { data: members } = await supabase
    .from("cluster_members")
    .select("reference_id, score")
    .in("cluster_id", rest);
  if (members?.length) {
    check(
      (
        await supabase.from("cluster_members").upsert(
          members.map((m) => ({ cluster_id: target, reference_id: m.reference_id, score: m.score, user_id: user.id })),
          { onConflict: "cluster_id,reference_id", ignoreDuplicates: true },
        )
      ).error,
    );
  }
  check((await supabase.from("clusters").delete().in("id", rest)).error);
  check(
    (
      await supabase
        .from("clusters")
        .update({ status: "accepted", decided_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", target)
    ).error,
  );
  revalidatePath(`/boards/${boardId}`);
}

export async function removeClusterMember(clusterId: string, referenceId: string) {
  const { supabase } = await signedIn();
  const boardId = await boardOf(supabase, clusterId);
  check(
    (await supabase.from("cluster_members").delete().eq("cluster_id", clusterId).eq("reference_id", referenceId)).error,
  );
  revalidatePath(`/boards/${boardId}`);
}

export async function addClusterMembers(clusterId: string, referenceIds: string[]) {
  if (!referenceIds.length) return;
  const { supabase, user } = await signedIn();
  const boardId = await boardOf(supabase, clusterId);
  check(
    (
      await supabase.from("cluster_members").upsert(
        referenceIds.map((reference_id) => ({ cluster_id: clusterId, reference_id, score: 1, user_id: user.id })),
        { onConflict: "cluster_id,reference_id", ignoreDuplicates: true },
      )
    ).error,
  );
  revalidatePath(`/boards/${boardId}`);
}

export async function moveClusterMember(referenceId: string, fromClusterId: string, toClusterId: string) {
  await addClusterMembers(toClusterId, [referenceId]);
  await removeClusterMember(fromClusterId, referenceId);
}

/** A cluster made by hand from the current canvas selection. Always accepted. */
export async function createManualCluster(boardId: string, name: string, referenceIds: string[]) {
  const { supabase, user } = await signedIn();
  const { data, error } = await supabase
    .from("clusters")
    .insert({
      board_id: boardId,
      user_id: user.id,
      name: name.trim() || "New cluster",
      status: "accepted",
      source: "user",
      decided_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  check(error);
  if (referenceIds.length) {
    check(
      (
        await supabase
          .from("cluster_members")
          .insert(referenceIds.map((reference_id) => ({ cluster_id: data!.id, reference_id, user_id: user.id })))
      ).error,
    );
  }
  revalidatePath(`/boards/${boardId}`);
}

export async function deleteCluster(clusterId: string) {
  const { supabase } = await signedIn();
  const boardId = await boardOf(supabase, clusterId);
  check((await supabase.from("clusters").delete().eq("id", clusterId)).error);
  revalidatePath(`/boards/${boardId}`);
}

/** "Re-cluster" button: queue a clustering run for the board. */
export async function reclusterBoard(boardId: string) {
  const { user } = await signedIn();
  await enqueueJob(user.id, "cluster", { boardId });
  revalidatePath(`/boards/${boardId}`);
}
