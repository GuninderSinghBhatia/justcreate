"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createToken, revokeToken } from "@/lib/token-actions";

interface TokenRow {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revoked: boolean;
}

/** Create / revoke API tokens; a new token is shown once, already filled into the setup snippets. */
export function TokenManager({ tokens, appUrl, mcpPath }: { tokens: TokenRow[]; appUrl: string; mcpPath: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("Claude Code");
  const [fresh, setFresh] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const token = fresh ?? "<your token>";

  const claudeCode = `claude mcp add justcreate -e JUSTCREATE_URL=${appUrl} -e JUSTCREATE_TOKEN=${token} -- node "${mcpPath}"`;
  const cursor = JSON.stringify(
    { mcpServers: { justcreate: { command: "node", args: [mcpPath], env: { JUSTCREATE_URL: appUrl, JUSTCREATE_TOKEN: token } } } },
    null,
    2,
  );

  return (
    <div className="flex flex-col gap-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            try {
              setError(null);
              setFresh(await createToken(name));
              router.refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Couldn't create token");
            }
          });
        }}
        className="flex flex-wrap gap-2"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Token name"
          className="min-w-0 flex-1 rounded-md sketch border-foreground/70 bg-transparent px-3 py-1.5 text-sm"
        />
        <button disabled={pending} className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50">
          Create token
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {fresh && (
        <div className="flex flex-col gap-2 rounded-md sketch border-foreground/80 p-3 text-sm">
          <p className="font-medium">Copy this token now — it won&apos;t be shown again.</p>
          <CopyBox text={fresh} label="API token" />
        </div>
      )}

      <div className="flex flex-col gap-2 text-sm">
        <h3 className="font-semibold">Claude Code</h3>
        <p className="text-foreground/60">Run in your project folder (once the MCP server is built: <code>npm run build -w @justcreate/mcp</code>):</p>
        <CopyBox text={claudeCode} label="Claude Code command" />
        <h3 className="mt-3 font-semibold">Cursor</h3>
        <p className="text-foreground/60">
          Save as <code>.cursor/mcp.json</code> in your project:
        </p>
        <CopyBox text={cursor} label="Cursor config" />
        <p className="text-foreground/60">
          Then ask your agent: “Use JustCreate’s design spec for the board <em>My board</em> and build the landing page.”
          Prefer no setup? Download design.md from the board and add it to your repo.
        </p>
      </div>

      {tokens.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-foreground/50">
            <tr>
              <th className="py-1 font-normal">Name</th>
              <th className="font-normal">Token</th>
              <th className="font-normal">Last used</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tokens.map((t) => (
              <tr key={t.id} className={`border-t border-foreground/20 ${t.revoked ? "text-foreground/40" : ""}`}>
                <td className="py-2">{t.name}</td>
                <td>
                  <code>{t.prefix}…</code>
                </td>
                <td>{t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString() : "never"}</td>
                <td className="text-right">
                  {t.revoked ? (
                    "revoked"
                  ) : (
                    <button
                      disabled={pending}
                      onClick={() => start(async () => (await revokeToken(t.id), router.refresh()))}
                      className="text-xs text-red-600 underline"
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CopyBox({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre aria-label={label} className="overflow-x-auto rounded-md bg-foreground/5 p-3 pr-16 text-xs">
        {text}
      </pre>
      <button
        type="button"
        onClick={() => navigator.clipboard.writeText(text).then(() => setCopied(true))}
        className="absolute right-2 top-2 rounded sketch border-foreground/70 bg-background px-2 py-0.5 text-xs"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
