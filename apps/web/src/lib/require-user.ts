import "server-only";

import { redirect } from "next/navigation";
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
