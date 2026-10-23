"use server";

import { revalidatePath } from "next/cache";
import { newToken } from "@/lib/agent";
import { must, requireUser } from "@/lib/require-user";

/** Creates a token and returns it once; only its hash is stored. */
export async function createToken(name: string) {
  const { supabase, user } = await requireUser();
  const { token, hash, prefix } = newToken();
  must(
    await supabase
      .from("api_tokens")
      .insert({ user_id: user.id, name: name.trim() || "Coding agent", token_hash: hash, prefix }),
  );
  revalidatePath("/settings");
  return token;
}

export async function revokeToken(tokenId: string) {
  const { supabase } = await requireUser();
  must(await supabase.from("api_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", tokenId));
  revalidatePath("/settings");
}
