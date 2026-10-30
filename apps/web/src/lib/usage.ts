import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/** Free tier: AI design.md generations (full runs + section rewrites) per calendar month. */
export const MONTHLY_GENERATIONS = Number(process.env.AI_MONTHLY_GENERATIONS) || 30;

/**
 * Counted from `spec` jobs, which only the server writes (users can read theirs, never change or
 * delete them), so deleting design.md versions doesn't give generations back. Failed jobs don't count.
 */
export async function generationsThisMonth(supabase: SupabaseClient, userId: string) {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const { count, error } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", "spec")
    .neq("status", "failed")
    .gte("created_at", monthStart);
  // Fail closed: if the count can't be read, no paid generation is queued on a guess of zero.
  if (error) throw new Error(`Couldn't check this month's usage: ${error.message}`);
  const used = count ?? 0;
  return { used, limit: MONTHLY_GENERATIONS, left: Math.max(0, MONTHLY_GENERATIONS - used) };
}
