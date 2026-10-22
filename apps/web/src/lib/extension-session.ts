import type { Session } from "@supabase/supabase-js";
import type { ExtensionSession } from "@justcreate/shared";

export function toExtensionSession(session: Session): ExtensionSession {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in,
    email: session.user.email,
  };
}
