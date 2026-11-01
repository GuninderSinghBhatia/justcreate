import "server-only";

import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

type JobKind = "analyze" | "cluster" | "spec";

/**
 * Queues background work for the Python worker. Jobs are written with the secret key because
 * users can only read their jobs. Duplicate open jobs are ignored (unique partial indexes).
 */
export async function enqueueJob(
  userId: string,
  kind: JobKind,
  target: { referenceId?: string; boardId?: string },
  params: Record<string, unknown> = {},
): Promise<"queued" | "already-queued"> {
  const { error } = await createAdminClient()
    .from("jobs")
    .insert({ user_id: userId, kind, reference_id: target.referenceId ?? null, board_id: target.boardId ?? null, params });
  // 23505 = an open job of this kind already exists: nothing to do.
  if (error && error.code !== "23505") throw new Error(`Couldn't queue ${kind}: ${error.message}`);
  // After the response: a serverless host may stop work left running once it's sent.
  try {
    after(wakeWorker);
  } catch {
    void wakeWorker(); // outside a request (scripts)
  }
  return error ? "already-queued" : "queued";
}

/**
 * Pokes the worker so new jobs start right away instead of on its next sweep. Best effort. When
 * WORKER_TOKEN is set it's sent as a bearer token (the hosted worker's /wake requires it).
 */
async function wakeWorker() {
  const url = process.env.WORKER_URL;
  if (!url) return;
  const token = process.env.WORKER_TOKEN;
  try {
    await fetch(`${url}/wake`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // The worker sweeps the jobs table anyway.
  }
}

/** Board re-clusters automatically once this many references were added since the last run. */
export const RECLUSTER_AFTER = 10;
