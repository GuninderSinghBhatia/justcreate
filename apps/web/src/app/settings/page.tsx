import path from "node:path";
import { headers } from "next/headers";
import { connection } from "next/server";
import { BarTitle, SiteHeader } from "@/components/site-header";
import { requireUser } from "@/lib/require-user";
import { generationsThisMonth } from "@/lib/usage";
import { TokenManager } from "./token-manager";

// Per-user page: nothing useful to prerender.
export const instant = false;

export default async function SettingsPage() {
  await connection();
  const { supabase, user } = await requireUser();
  const [{ data: tokens }, usage, h] = await Promise.all([
    supabase
      .from("api_tokens")
      .select("id, name, prefix, created_at, last_used_at, revoked_at")
      .order("created_at", { ascending: false }),
    generationsThisMonth(supabase, user.id),
    headers(),
  ]);
  const appUrl = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3100"}`;
  // The MCP server lives next to the web app in the monorepo (apps/mcp).
  const mcpPath = path.resolve(process.cwd(), "..", "mcp", "dist", "index.js");

  return (
    <>
      <SiteHeader context={<BarTitle>Settings</BarTitle>} />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-semibold">Settings</h1>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Usage this month</h2>
          <p className="text-sm text-foreground/70">
            {usage.used} of {usage.limit} AI design.md generations used (full runs and section rewrites).{" "}
            {usage.left ? `${usage.left} left.` : "Limit reached — editing and downloading still work."}
          </p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/10" aria-hidden>
            <div className="h-full bg-foreground" style={{ width: `${Math.min(100, (usage.used / usage.limit) * 100)}%` }} />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Coding agents (MCP)</h2>
          <p className="text-sm text-foreground/70">
            Let Claude Code, Cursor and other MCP clients read your boards: <code>list_boards</code>,{" "}
            <code>get_design_spec</code> and <code>get_references</code>. Access is read-only, and you can revoke a token
            at any time.
          </p>
          <TokenManager
            appUrl={appUrl}
            mcpPath={mcpPath}
            tokens={(tokens ?? []).map((t) => ({
              id: t.id,
              name: t.name,
              prefix: t.prefix,
              createdAt: t.created_at,
              lastUsedAt: t.last_used_at,
              revoked: Boolean(t.revoked_at),
            }))}
          />
        </section>
      </main>
    </>
  );
}
