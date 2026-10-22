import { NextResponse } from "next/server";
import { createAdminClient, createAnonClient, createClient } from "@/lib/supabase/server";
import { toExtensionSession } from "@/lib/extension-session";

/**
 * Mints a separate session for the browser extension, for the user signed in on the web.
 * A separate session (not a copy of the web one) means the extension's token refreshes
 * can't trip refresh-token reuse detection and sign the web app out.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const email = userData.user?.email;
  if (!email) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // generateLink does not send an email; it only returns the one-time token.
  const { data: link, error: linkError } = await createAdminClient().auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkError || !link.properties?.hashed_token) {
    return NextResponse.json({ error: linkError?.message ?? "Could not create session" }, { status: 500 });
  }

  const { data, error } = await createAnonClient().auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "email",
  });
  if (error || !data.session) {
    return NextResponse.json({ error: error?.message ?? "Could not create session" }, { status: 500 });
  }

  return NextResponse.json({ session: toExtensionSession(data.session) });
}
