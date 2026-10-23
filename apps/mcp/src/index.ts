#!/usr/bin/env node
/**
 * JUSTCREATE MCP server (stdio). Gives coding agents read-only access to your boards:
 *   list_boards · get_design_spec · get_references
 *
 * Env: JUSTCREATE_TOKEN (Settings → Coding agents), JUSTCREATE_URL (default http://localhost:3100).
 * It only talks to the JUSTCREATE web API with your token; it never sees database keys.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE = (process.env.JUSTCREATE_URL ?? "http://localhost:3100").replace(/\/$/, "");
const TOKEN = process.env.JUSTCREATE_TOKEN;

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const text = (t: string, isError = false): ToolResult => ({ content: [{ type: "text", text: t }], isError });

async function api<T>(path: string): Promise<T> {
  if (!TOKEN) throw new Error("JUSTCREATE_TOKEN is not set. Create a token in JUSTCREATE → Settings → Coding agents.");
  const res = await fetch(`${BASE}/api/agent${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `JUSTCREATE API ${res.status}`);
  return body;
}

/** Runs a tool body, turning thrown errors into a readable tool error instead of a protocol failure. */
const safe =
  <A>(fn: (args: A) => Promise<ToolResult>) =>
  async (args: A): Promise<ToolResult> => {
    try {
      return await fn(args);
    } catch (err) {
      return text(err instanceof Error ? err.message : String(err), true);
    }
  };

const board = (b: string) => encodeURIComponent(b);
const readOnly = { readOnlyHint: true, openWorldHint: false } as const;

const server = new McpServer({ name: "justcreate", version: "0.1.0" });

server.registerTool(
  "list_boards",
  {
    title: "List JUSTCREATE boards",
    description: "Lists the user's JUSTCREATE moodboards with reference counts, accepted clusters and whether a design.md exists.",
    annotations: readOnly,
  },
  safe(async () => {
    const { boards } = await api<{
      boards: { id: string; name: string; references: number; clusters: string[]; design_spec: { version: number } | null }[];
    }>("/boards");
    if (!boards.length) return text("No boards yet.");
    return text(
      boards
        .map(
          (b) =>
            `- ${b.name} (id ${b.id}): ${b.references} references` +
            (b.clusters.length ? `; clusters: ${b.clusters.join(", ")}` : "") +
            (b.design_spec ? `; design.md v${b.design_spec.version}` : "; no design.md yet"),
        )
        .join("\n"),
    );
  }),
);

server.registerTool(
  "get_design_spec",
  {
    title: "Get a board's design.md",
    description:
      "Returns the design.md for a JUSTCREATE board: visual direction, palette (hex), typography, layout, components, effects, motion, " +
      "responsive rules, implementation tokens (CSS variables / Tailwind) and a reference map. Claims cite [ref:xxxxxx] ids — " +
      "use get_references to see those images. Use this as the design brief when building UI.",
    inputSchema: {
      board: z.string().describe("Board name (case-insensitive) or id"),
      version: z.number().int().positive().optional().describe("A specific version; latest if omitted"),
    },
    annotations: readOnly,
  },
  safe(async ({ board: b, version }) => {
    const spec = await api<{ board: { name: string }; version: number; kind: string; created_at: string; markdown: string }>(
      `/boards/${board(b)}/spec${version ? `?version=${version}` : ""}`,
    );
    return text(`<!-- JUSTCREATE board “${spec.board.name}”, design.md v${spec.version} (${spec.kind}, ${spec.created_at}) -->\n\n${spec.markdown}`);
  }),
);

server.registerTool(
  "get_references",
  {
    title: "Get a board's references",
    description:
      "Returns a board's saved references (optionally one cluster): title, type, source link, a temporary image URL (valid ~1 hour), " +
      "palette, tags and clusters. `ref` matches the [ref:xxxxxx] citations in design.md.",
    inputSchema: {
      board: z.string().describe("Board name (case-insensitive) or id"),
      cluster: z.string().optional().describe("Only references in this cluster (name or id)"),
    },
    annotations: readOnly,
  },
  safe(async ({ board: b, cluster }) => {
    const data = await api<{
      board: { name: string };
      clusters: { name: string; status: string; size: number }[];
      references: {
        ref: string; type: string; title: string | null; source_url: string | null; image_url: string | null;
        palette: string[]; tags: string[]; clusters: string[]; caption: string | null; note: string | null;
      }[];
    }>(`/boards/${board(b)}/references${cluster ? `?cluster=${encodeURIComponent(cluster)}` : ""}`);
    const head =
      `Board “${data.board.name}” — ${data.references.length} references` +
      (data.clusters.length ? `\nClusters: ${data.clusters.map((c) => `${c.name} (${c.status}, ${c.size})`).join("; ")}` : "");
    const rows = data.references.map((r) =>
      [
        `- [ref:${r.ref}] ${r.type}: ${r.title ?? "untitled"}`,
        r.caption && `  caption: ${r.caption}`,
        r.palette.length && `  palette: ${r.palette.join(" ")}`,
        r.tags.length && `  tags: ${r.tags.join(", ")}`,
        r.clusters.length && `  clusters: ${r.clusters.join(", ")}`,
        r.note && `  note: ${r.note}`,
        r.source_url && `  source: ${r.source_url}`,
        r.image_url && `  image: ${r.image_url}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
    return text([head, ...rows].join("\n"));
  }),
);

await server.connect(new StdioServerTransport());
