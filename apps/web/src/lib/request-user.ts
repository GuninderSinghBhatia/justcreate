import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { bearerToken, createBearerClient, createClient } from "@/lib/supabase/server";

/**
 * The signed-in user for an API request, from a bearer token (extension) or the session
 * cookie (web app), plus a Supabase client acting as them.
 */
export async function requestUser(request: Request): Promise<{ user: User; supabase: SupabaseClient } | null> {
  const token = bearerToken(request);
  if (token) {
    const supabase = createBearerClient(token);
    const { data } = await supabase.auth.getUser(token);
    return data.user ? { user: data.user, supabase } : null;
  }
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ? { user: data.user, supabase } : null;
}
