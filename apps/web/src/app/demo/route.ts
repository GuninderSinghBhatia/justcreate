import { NextResponse } from "next/server";
import { allow, clientIp } from "@/lib/rate-limit";
import { createDemoAccount } from "@/lib/demo-clone";
import { createAdminClient, createClient } from "@/lib/supabase/server";

// Copying a board's files and rows takes a few seconds.
export const maxDuration = 60;

/**
 * "Try the demo board": a throwaway account holding a copy of the template board, signed in on the
 * spot. POST only, so a link preview or prefetch can't create accounts.
 */
export async function POST(request: Request) {
  const back = (error: string) => NextResponse.redirect(new URL(`/login?error=${error}`, request.url), { status: 303 });
  const templateId = process.env.DEMO_TEMPLATE_USER_ID;
  if (!templateId) return back("demo");
  if (!allow(`demo:${clientIp(request.headers)}`, 5, 10 * 60_000)) return back("demo-busy");

  try {
    const demo = await createDemoAccount(templateId);
    if ("error" in demo) return back(demo.error === "busy" ? "demo-busy" : "demo");
    const { data: link, error } = await createAdminClient().auth.admin.generateLink({ type: "magiclink", email: demo.email });
    if (error || !link) throw new Error(error?.message ?? "no link");
    // Verifying the link here sets the session cookies on this response.
    const supabase = await createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
    if (verifyError) throw new Error(verifyError.message);
  } catch (err) {
    console.error("demo board:", err);
    return back("demo");
  }
  return NextResponse.redirect(new URL("/board", request.url), { status: 303 });
}
