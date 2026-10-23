import { NextResponse } from "next/server";
import { requestUser } from "@/lib/request-user";

/** Board list for the extension popup's board picker. */
export async function GET(request: Request) {
  const auth = await requestUser(request);
  if (!auth) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data, error } = await auth.supabase
    .from("boards")
    .select("id, name")
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ boards: data });
}
