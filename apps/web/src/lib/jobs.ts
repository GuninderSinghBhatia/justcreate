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
 * Pokes the worker so new jobs start right away instead of on its next poll. Best effort.
 * WORKER_TOKEN is sent as a bearer token (a private Hugging Face Space needs it). A Space that has
 * gone to sleep doesn't answer, so it's asked to start: it then runs every open job in the table.
 */
async function wakeWorker() {
  const url = process.env.WORKER_URL;
  if (!url) return;
  const token = process.env.WORKER_TOKEN;
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
  try {
    const res = await fetch(`${url}/wake`, { method: "POST", headers, signal: AbortSignal.timeout(5000) });
    if (res.ok) return;
  } catch {
    // asleep, starting or unreachable: see below
  }
  const space = process.env.HF_SPACE_ID;
  if (!space || !token) return;
  try {
    const api = `https://huggingface.co/api/spaces/${space}`;
    const runtime = await fetch(`${api}/runtime`, { headers, signal: AbortSignal.timeout(5000) });
    const { stage } = runtime.ok ? ((await runtime.json()) as { stage?: string }) : {};
    // Only a Space that went to sleep: one that's building or starting is on its way, and a
    // paused one was paused on purpose.
    if (stage === "SLEEPING") await fetch(`${api}/restart`, { method: "POST", headers, signal: AbortSignal.timeout(5000) });
  } catch {
    // The worker polls the jobs table once it runs.
  }
}

/** Board re-clusters automatically once this many references were added since the last run. */
export const RECLUSTER_AFTER = 10;
