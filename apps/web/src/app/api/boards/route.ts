import { NextResponse } from "next/server";
import { homeBoard } from "@/lib/boards";
import { requestUser } from "@/lib/request-user";

/** The user's board, as a one-item list (older extension popups still show a board picker). */
export async function GET(request: Request) {
  const auth = await requestUser(request);
  if (!auth) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    return NextResponse.json({ boards: [await homeBoard(auth.supabase, auth.user.id)] });
  } catch (err) {
    console.error("Load board failed:", err);
    return NextResponse.json({ error: "Couldn't load board" }, { status: 500 });
  }
}
