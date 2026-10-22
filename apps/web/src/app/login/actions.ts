"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { status: "idle" | "sent" | "error"; message?: string };

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const next = safeNext(String(formData.get("next") ?? "/library"));
  if (!email) return { status: "error", message: "Enter your email." };

  const origin = (await headers()).get("origin") ?? "http://localhost:3100";
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
  return next.startsWith("/") && !next.startsWith("//") ? next : "/library";
}
