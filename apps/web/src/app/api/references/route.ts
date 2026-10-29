import { NextResponse } from "next/server";
import type { Reference } from "@justcreate/shared";
import { searchReferences, toViews } from "@/lib/references";
import { requestUser } from "@/lib/request-user";

/** Library search for client components (the board's library sidebar). */
export async function GET(request: Request) {
  const auth = await requestUser(request);
  if (!auth) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const { data, error } = await searchReferences(
    auth.supabase,
    {
      q: params.get("q") ?? undefined,
      type: params.get("type") ?? undefined,
      inbox: params.get("view") === "inbox",
    },
    120,
  );
  if (error) {
    console.error("List references failed:", error.message);
    return NextResponse.json({ error: "Couldn't load references" }, { status: 500 });
  }
  return NextResponse.json({ references: await toViews(auth.supabase, (data ?? []) as Reference[]) });
}
