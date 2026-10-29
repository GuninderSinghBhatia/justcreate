import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { bearerToken, createBearerClient, createClient, sessionUser, type SessionUser } from "@/lib/supabase/server";

/**
 * The signed-in user for an API request, from a bearer token (extension) or the session
 * cookie (web app), plus a Supabase client acting as them.
 */
export async function requestUser(request: Request): Promise<{ user: SessionUser; supabase: SupabaseClient } | null> {
  const token = bearerToken(request);
  if (token) {
    const supabase = createBearerClient(token);
    const user = await sessionUser(supabase, token);
    return user ? { user, supabase } : null;
  }
  const supabase = await createClient();
  const user = await sessionUser(supabase);
  return user ? { user, supabase } : null;
}
