import { NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/server";
import { toExtensionSession } from "@/lib/extension-session";

/** Lets the extension refresh its session without knowing any Supabase keys. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { refresh_token?: string } | null;
  if (!body?.refresh_token) {
    return NextResponse.json({ error: "refresh_token required" }, { status: 400 });
  }

  const { data, error } = await createAnonClient().auth.refreshSession({
    refresh_token: body.refresh_token,
  });
  if (error || !data.session) {
    return NextResponse.json({ error: error?.message ?? "Refresh failed" }, { status: 401 });
  }
  return NextResponse.json({ session: toExtensionSession(data.session) });
}
