import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/** Free tier: AI design.md generations (full runs + section rewrites) per calendar month. */
export const MONTHLY_GENERATIONS = Number(process.env.AI_MONTHLY_GENERATIONS) || 30;

export async function generationsThisMonth(supabase: SupabaseClient, userId: string) {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const [{ count: done }, { count: queued }] = await Promise.all([
    supabase
      .from("design_specs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("kind", ["generated", "section"])
      .gte("created_at", monthStart),
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("kind", "spec")
      .in("status", ["pending", "running"]),
  ]);
  const used = (done ?? 0) + (queued ?? 0);
  return { used, limit: MONTHLY_GENERATIONS, left: Math.max(0, MONTHLY_GENERATIONS - used) };
}
