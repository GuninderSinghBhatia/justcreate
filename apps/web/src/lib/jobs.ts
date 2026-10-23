import "server-only";

import { createAdminClient } from "@/lib/supabase/server";

type JobKind = "analyze" | "cluster";

/**
 * Queues background work for the Python worker. Jobs are written with the secret key because
 * users can only read their jobs. Duplicate open jobs are ignored (unique partial indexes).
 */
export async function enqueueJob(
  userId: string,
  kind: JobKind,
  target: { referenceId?: string; boardId?: string },
) {
  const { error } = await createAdminClient()
    .from("jobs")
    .insert({ user_id: userId, kind, reference_id: target.referenceId ?? null, board_id: target.boardId ?? null });
  // 23505 = an open job of this kind already exists: nothing to do.
  if (error && error.code !== "23505") console.error(`enqueue ${kind} failed`, error.message);
  void wakeWorker();
}

/** Pokes the worker so new jobs start right away instead of on its next poll. Best effort. */
async function wakeWorker() {
  const url = process.env.WORKER_URL;
  if (!url) return;
  try {
    await fetch(`${url}/wake`, { method: "POST", signal: AbortSignal.timeout(1000) });
  } catch {
    // The worker polls the jobs table anyway.
  }
}

/** Board re-clusters automatically once this many references were added since the last run. */
export const RECLUSTER_AFTER = 10;
