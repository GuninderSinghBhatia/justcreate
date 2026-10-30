import { NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/server";
import { toExtensionSession } from "@/lib/extension-session";
import { allow, clientIp } from "@/lib/rate-limit";

/** Lets the extension refresh its session without knowing any Supabase keys. */
export async function POST(request: Request) {
  // Every call reaches Supabase Auth from this server's one address; its per-address limit would
  // sign every user's extension out if a single client looped here.
  if (!allow(`ext-refresh:${clientIp(request.headers)}`, 30)) {
    return NextResponse.json({ error: "Too many requests. Wait a minute." }, { status: 429, headers: { "retry-after": "60" } });
  }
  const body = (await request.json().catch(() => null)) as { refresh_token?: string } | null;
  if (!body?.refresh_token) {
    return NextResponse.json({ error: "refresh_token required" }, { status: 400 });
  }

  const { data, error } = await createAnonClient().auth.refreshSession({
    refresh_token: body.refresh_token,
  });
  if (error || !data.session) {
    return NextResponse.json({ error: "Refresh failed" }, { status: 401 });
  }
  return NextResponse.json({ session: toExtensionSession(data.session) });
}
