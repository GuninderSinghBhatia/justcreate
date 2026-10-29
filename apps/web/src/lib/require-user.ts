import "server-only";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient, sessionUser } from "@/lib/supabase/server";

/** For pages and server actions: the signed-in user and a Supabase client acting as them. */
export async function requireUser() {
  const supabase = await createClient();
  const user = await sessionUser(supabase);
  if (!user) redirect("/login");
  return { supabase, user };
}

/** Throws a Supabase error so the calling component can show it. */
export function must<T extends { error: { message: string } | null }>(result: T): T {
  if (result.error) throw new Error(result.error.message);
  return result;
}

/**
 * An error meant for the user. Production builds hide thrown Server Action messages (the client
 * only gets a digest), so actions return these as `{ error }` through `userFacing` instead.
 */
export class UserError extends Error {}

export type ActionResult<T> = { ok: T } | { error: string };

export async function userFacing<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: await fn() };
  } catch (err) {
    if (err instanceof UserError) return { error: err.message };
    throw err; // redirects, and errors whose text isn't for users
  }
}

/** The board, if the signed-in user owns it (RLS hides everyone else's); throws otherwise. */
export async function ownBoard(supabase: SupabaseClient, boardId: string) {
  const { data } = await supabase.from("boards").select("id").eq("id", boardId).maybeSingle();
  if (!data) throw new UserError("Board not found");
  return data;
}
