# JustCreate

**Capture design inspiration, cluster it, and hand a cited `design.md` to your coding agent.**

JustCreate is a personal visual-inspiration workspace. A Chrome extension saves images, screenshots, videos, posts and pages onto one private board per user (a full Excalidraw canvas). AI then groups the references into style clusters and writes a `design.md` that tools like Claude Code and Cursor can build from, through MCP.

**Live:** https://justcreate-seven.vercel.app

## Who it's for

Web developers, indie hackers and designers who build with AI coding agents and want their taste, not generic AI styling, to drive the UI.

## Core loop

1. **Capture** inspiration from any page with the Chrome extension (web pages, X posts, YouTube videos, screenshots, images).
2. **Curate** it on your board (Excalidraw canvas + grid).
3. **Accept clusters** the AI suggests: accept, reject, rename or merge.
4. **Generate `design.md`**: a style spec where every claim cites a saved reference and is tagged *Observed* or *Inferred*.
5. **Hand it to an agent** (Claude Code, Cursor) through the MCP server.

## Product principles

- Every `design.md` claim cites a saved reference.
- You stay in control: AI suggests, you decide.
- Your board is private.

## Repository layout

| Path | What it is |
| --- | --- |
| `apps/web` | Web app: landing page, board, clusters, design.md editor, settings, API routes |
| `apps/extension` | Chrome extension with capture adapters for web pages, X and YouTube, plus screenshots |
| `apps/mcp` | MCP server that lets coding agents read a board's references and design spec |
| `apps/worker` | AI worker (runs on Modal) that clusters references and generates the spec |
| `packages/shared` | Types and code shared across apps |
| `supabase/migrations` | Database schema migrations |
| `docs/`, `scripts/` | Documentation and helper scripts |
| `.github/workflows` | CI |

## Tech stack

TypeScript monorepo · Next.js web app on Vercel · Chrome extension · Excalidraw canvas · Supabase · AI worker on Modal · Model Context Protocol (MCP)

## Getting started

```bash
git clone https://github.com/GuninderSinghBhatia/justcreate.git
cd justcreate
```

Each app has its own `package.json` and `.env.example`. Install and run the web app and extension from their folders (`apps/web`, `apps/extension`), copy the `.env.example` files to `.env` and fill in your own keys. The AI worker runs on demand.

## Status

Actively developed. Currently a single-user, locally run product with the web app and extension live on Vercel.
