import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient as createPlainClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabasePublishableKey, supabaseUrl } from "./env";

/** Client acting as the signed-in user, from the request cookies. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component: cookies are read-only there. The proxy refreshes them.
        }
      },
    },
  });
}

/** Client acting as the user identified by a bearer access token (used by the extension). */
export function createBearerClient(accessToken: string) {
  return createPlainClient(supabaseUrl(), supabasePublishableKey(), {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Client with no session, for auth calls such as refreshing or verifying tokens. */
export function createAnonClient() {
  return createPlainClient(supabaseUrl(), supabasePublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Admin client. Bypasses RLS: only use for auth admin tasks, never for user data reads. */
export function createAdminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("Missing env var SUPABASE_SECRET_KEY");
  return createPlainClient(supabaseUrl(), secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

/** Who is signed in: just what the app reads. */
export interface SessionUser {
  id: string;
  email?: string;
}

/**
 * The signed-in user from a verified access token (the cookie session's, or `accessToken`).
 * getClaims checks the JWT signature locally against the project's cached signing keys, so this
 * costs no round trip to Supabase Auth (getUser would, on every request).
 */
export async function sessionUser(supabase: SupabaseClient, accessToken?: string): Promise<SessionUser | null> {
  const { data } = await supabase.auth.getClaims(accessToken);
  const sub = data?.claims.sub;
  return typeof sub === "string" ? { id: sub, email: data?.claims.email as string | undefined } : null;
}
