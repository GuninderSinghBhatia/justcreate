# JUSTCREATE MCP server

Read-only access to your JUSTCREATE boards for coding agents (Claude Code, Cursor, any MCP client).

| Tool | What it returns |
|---|---|
| `list_boards` | Boards with reference counts, accepted clusters, latest design.md version |
| `get_design_spec(board, version?)` | The board's design.md (latest by default). `board` is a name or id |
| `get_references(board, cluster?)` | References with source links, 1 hour image URLs, palette, tags, clusters. `ref` matches `[ref:xxxxxx]` citations |

## Setup

1. Build: `npm run build -w @justcreate/mcp` (from the repo root).
2. Create a token in JUSTCREATE → **Settings → Coding agents**. The page shows the exact command / config with your token and path filled in.
3. Claude Code:

   ```sh
   claude mcp add justcreate -e JUSTCREATE_URL=http://localhost:3100 -e JUSTCREATE_TOKEN=jc_… -- node /path/to/justcreate/apps/mcp/dist/index.js
   ```

   Cursor (`.cursor/mcp.json`):

   ```json
   { "mcpServers": { "justcreate": { "command": "node", "args": ["/path/to/justcreate/apps/mcp/dist/index.js"],
     "env": { "JUSTCREATE_URL": "http://localhost:3100", "JUSTCREATE_TOKEN": "jc_…" } } } }
   ```

The server only calls the JUSTCREATE web API (`/api/agent/*`) with your token; it never holds database keys. Revoke a token in Settings to cut access immediately.
