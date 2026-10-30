"use server";

import { headers } from "next/headers";
import { allow, clientIp } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { status: "idle" | "sent" | "error"; message?: string };

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const next = safeNext(String(formData.get("next") ?? "/board"));
  if (!email) return { status: "error", message: "Enter your email." };
  const ip = clientIp(await headers());
  if (!allow(`magic-link:${ip}`, 5) || !allow(`magic-link:${email.toLowerCase()}`, 3)) {
    return { status: "error", message: "Too many sign-in links requested. Wait a minute and try again." };
  }

  // The link always points at our own site: never at an address taken from the request.
  const origin = process.env.SITE_URL ?? "http://localhost:3100";
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });

  if (error) return { status: "error", message: error.message };
  return { status: "sent", message: `Check ${email} for a sign-in link.` };
}

/** Only allow same-site relative paths, so the link can't bounce you to another site. */
function safeNext(next: string) {
  return next.startsWith("/") && !next.startsWith("//") ? next : "/board";
}
