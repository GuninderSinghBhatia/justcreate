"use server";

import { revalidatePath } from "next/cache";
import { newToken } from "@/lib/agent";
import { must, requireUser } from "@/lib/require-user";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Token rows are written here with the secret key, never by the browser: users can only read
 * theirs (migration 0007), so a revoked token can't be switched back on or given another hash.
 */

/** Creates a token and returns it once; only its hash is stored. */
export async function createToken(name: string) {
  const { user } = await requireUser();
  const { token, hash, prefix } = newToken();
  const label = typeof name === "string" ? name.trim().slice(0, 80) : "";
  must(
    await createAdminClient()
      .from("api_tokens")
      .insert({ user_id: user.id, name: label || "Coding agent", token_hash: hash, prefix }),
  );
  revalidatePath("/settings");
  return token;
}

export async function revokeToken(tokenId: string) {
  const { user } = await requireUser();
  must(
    await createAdminClient()
      .from("api_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", tokenId)
      .eq("user_id", user.id)
      .is("revoked_at", null),
  );
  revalidatePath("/settings");
}
