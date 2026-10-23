import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bearerToken, createAdminClient } from "@/lib/supabase/server";

/**
 * Personal API tokens for coding agents (the MCP server). Tokens look like `jc_<43 chars>`; only a
 * SHA-256 hash is stored. Agent routes use the secret-key client, so every query below filters by
 * the token owner's user_id explicitly.
 */

export const TOKEN_PREFIX = "jc_";

export function newToken() {
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token), prefix: token.slice(0, 10) };
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export interface AgentContext {
  userId: string;
  db: SupabaseClient;
}

/** Resolves the bearer token to its owner, or returns a 401 response. */
export async function agentAuth(request: Request): Promise<AgentContext | NextResponse> {
  const token = bearerToken(request);
  if (!token?.startsWith(TOKEN_PREFIX)) {
    return NextResponse.json({ error: "Missing or malformed API token (create one in JUSTCREATE → Settings)" }, { status: 401 });
  }
  const db = createAdminClient();
  const { data } = await db
    .from("api_tokens")
    .select("id, user_id")
    .eq("token_hash", hashToken(token))
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) return NextResponse.json({ error: "Invalid or revoked API token" }, { status: 401 });
  await db.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return { userId: data.user_id, db };
}

/** A board by id or (case-insensitive) name, owned by the user. Agents usually know the name. */
export async function findBoard({ userId, db }: AgentContext, board: string) {
  const isId = /^[0-9a-f-]{36}$/i.test(board);
  const query = db.from("boards").select("id, name, updated_at").eq("user_id", userId);
  const { data } = await (isId ? query.eq("id", board) : query.ilike("name", board.replace(/[%_]/g, "\\$&"))).limit(2);
  if (!data?.length) return { error: `No board “${board}”. Call list_boards to see your boards.` } as const;
  if (data.length > 1) return { error: `More than one board is called “${board}”; use its id.` } as const;
  return { board: data[0] } as const;
}
