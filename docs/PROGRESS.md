# JUSTCREATE — Progress

Plan: [JUSTCREATE-PLAN.md](JUSTCREATE-PLAN.md) · Spec: [JUSTCREATE.md](JUSTCREATE.md) · Execution plan: “JUSTCREATE — Execution Plan” (Oct 23, 2026)

Decisions: Claude builds everything, full phase order, personal tool first. AI runs in a Python worker (per the execution plan).

## Running it locally

| Piece | Command | Notes |
|---|---|---|
| **Use the app** | `npm start` | Production build of the web app + worker, http://localhost:3100: much faster than dev mode (minified bundles, no on-demand compiling) |
| Web + worker (developing) | `npm run dev` | Both in one terminal (or `dev:web` / `dev:worker` separately); hot reload, but slow pages |
| Web app | `npm run dev:web` | http://localhost:3100 (3000 is used by another local project) |
| Worker | `cd apps/worker && uv run python -m worker serve` | Polls the `jobs` table; web app pokes `WORKER_URL/wake` |
| Extension | `npm run build -w extension` → load `apps/extension/.output/chrome-mv3` unpacked | Reload it on `chrome://extensions` after every rebuild |
| Worker tests | `cd apps/worker && uv run --group dev pytest` | |
| Cluster metric | `cd apps/worker && uv run python -m worker eval` | “kept or only renamed” rate, target 70% |

Secrets: `apps/web/.env.local` (gitignored) holds Supabase URL + keys; the worker reads it too. LLM key (`GEMINI_API_KEY` or `ANTHROPIC_API_KEY`) goes in `apps/worker/.env` (gitignored) — never in `.env.example`.

## Phase 0 — Skeleton

- [x] Monorepo (npm workspaces): `apps/web` (Next.js 16), `apps/extension` (WXT), `apps/worker` (Python/uv), `packages/shared`
- [x] Supabase: keys in env, `captures` bucket, pgvector, migrations `supabase/migrations/0001…0004` (all applied)
- [x] Login (email magic link); Site URL + redirect set to `localhost:3100`
- [x] `.env.example` files (web, extension, worker)
- [x] GitHub Actions workflow (`.github/workflows/ci.yml`): type-check, lint, builds, worker tests — runs once a GitHub remote exists
- [ ] Google login — needs a Google Cloud OAuth client (you), then enable in Supabase → Auth → Providers
- [ ] Deploy to Vercel — needs your Vercel account
- [ ] Sentry — needs your Sentry account/DSN

## Phase 1 — Capture

- [x] Right-click image save; screenshots (visible / region / full page); YouTube; X posts (+ oEmbed fallback); web pages
- [x] Web pages: viewport screenshot as card image + full-page screenshot as file
- [x] Popup: board picker (default board for all saves), note, save page, screenshots
- [x] Shortcuts Alt+Shift+S / Alt+Shift+R, toast, offline queue (IndexedDB, retried every minute)
- [x] Every capture queues an `analyze` job
- [x] Tested: API e2e script, Playwright extension run (8/8), live X selectors
- [x] Extension ↔ your Chrome: connected (confirmed on `/connect`, 2026-10-23)
- [ ] Offline queue not exercised by automation

## Phase 2 — Boards, canvas, grid

- [x] Boards: create, rename, delete, cover image (chosen or most recent), item counts, switcher
- [x] tldraw canvas: custom reference card shape; drag, resize, multi-select, frames; debounced save; `board_items` kept in sync
- [x] Library sidebar on the board: search, inbox filter, drag or + onto the canvas
- [x] Grid view (masonry) with canvas/grid toggle; detail drawer (preview, source, note, labels, description, YouTube timestamp link, AI analysis, add to board, cover, remove, delete)
- [x] Full-text search (title, labels, note, description), filters by type, label, date; inbox view
- [x] Drop or paste images into the grid or canvas → uploaded as references
- [x] Tested: Playwright Phase 2 run 23/23 (create board, add/drag/move/persist, drawer edits, cover, drop upload, search, label filter, inbox, extension board API, manual cluster)
- [ ] Performance gate (300 references < 2 s) not measured yet; worker makes 640px webp thumbnails for large files
- [ ] tldraw needs a license key for production (free in development)

## Phase 3 — AI analysis and clustering (Python worker)

- [x] Job queue: `jobs` table + `claim_jobs()` (skip-locked), retries with backoff, stale-run recovery
- [x] Analysis: palette by k-means on pixels; vision LLM with a fixed schema, `observed` vs `inferred`; cached by image hash
- [x] LLM providers: Gemini (`gemini-3.5-flash-lite` for analysis, `gemini-3.5-flash` for naming) — active now; Claude (`claude-haiku-5-5` / `claude-sonnet-5-5`) used instead if `ANTHROPIC_API_KEY` is set
- [x] Quota/outage safe: in-job retries on 429/5xx, then fallback tags so embeddings + clustering still run; `python -m worker reanalyze` upgrades fallback-tagged references later
- [x] Keyless fallback: metadata + colour tags, so the pipeline works before an API key is added
- [x] Embeddings: CLIP ViT-B-32 image + caption/tag text (512-d each, pgvector)
- [x] Clustering: joined weighted embeddings → HDBSCAN (scikit-learn); multi-membership by centre similarity or a strong rare tag
- [x] Naming + one-line summary per cluster (LLM, fallback: top tags)
- [x] Accepted, user-made and rejected clusters are never changed by a re-run; rejected groups aren't suggested again
- [x] UI: accept, reject (+ restore), rename, merge, remove / add members, make a cluster from the canvas selection, show on canvas, re-cluster
- [x] Auto re-cluster after 10 new references; first clustering once 6 references on a board are analysed
- [x] `python -m worker eval`: kept-or-renamed rate
- [x] Groq is the active provider (`LLM_PROVIDER=groq` in `apps/worker/.env`): `qwen/qwen3.8-27b` analyses images, `openai/gpt-oss-120b` names clusters and writes design.md; free-tier per-minute limits are waited out by the SDK. Gemini key kept as a fallback provider
- [x] Tested: worker unit tests 9/9; Phase 3 e2e 14/14 with Gemini (12/12 analysed, clusters 100% pure on a 3-family test board)
- [ ] Hand-labelled 100-reference test set (you: collect references across 5 styles)

## Phase 4 — design.md generation

- [x] `spec` worker job (migration 0005: `design_specs` versions, `jobs.params`); waits until the board's analyses are done
- [x] Aggregates in code: weighted k-means palette over every analysed palette + font/component/effect/tag counts, each with citations
- [x] Map → reduce: one brief per cluster (accepted/user clusters, else suggested, else the whole board), then the full document with 3–6 key images attached
- [x] Fixed sections: direction, palette, typography, layout, components, effects, motion, responsive, implementation (CSS `:root` tokens + Tailwind snippet), reference map
- [x] Every claim cited `[ref:xxxxxx]` and tagged **Observed** / **Inferred**; invented citations stripped, grouped ones split; model headings can't break the section structure
- [x] Reference map built in code from the citations (title, type, which sections cite it, source link)
- [x] Fallback chain: main model → cheaper model (separate quota) → a data-only draft (kind `draft`), so generation never just fails
- [x] Editor at `/boards/:id/spec`: edit / split / preview, citations link to sources, generate (all or chosen clusters), regenerate one section (keeps your edits elsewhere), save as version, version picker, download `.md`, copy
- [x] Tested: worker unit tests 19/19; Phase 4 e2e 20/21 → the one failure was a broken check in the test itself, verified passing on the downloaded file
- [x] Exit gate: 3 boards (dark product / warm editorial / bright playful) → design.md → Claude Code built a page from each spec alone → 3 of 3 in style (gate: 2 of 3). Write-up: [EXIT-GATE.md](EXIT-GATE.md)
- [ ] Optional zip download with reference thumbnails (not built)

## Phase 5 — Coding agents and launch

- [x] Personal API tokens (migration 0006): `jc_…`, SHA-256 hash only, shown once, revocable, last-used tracking
- [x] Agent API `/api/agent/boards`, `/boards/:board/spec`, `/boards/:board/references?cluster=` — token auth, scoped to the owner, boards by name or id
- [x] `apps/mcp`: stdio MCP server with `list_boards`, `get_design_spec`, `get_references` (read-only, readable tool errors) — see `apps/mcp/README.md`
- [x] Settings page: usage this month, tokens, copy-paste setup for Claude Code and Cursor (token + path filled in)
- [x] Free tier cap: 30 AI design.md generations / month (`AI_MONTHLY_GENERATIONS`), enforced on generate + section rewrite
- [x] Landing page at `/` (signed-out), privacy policy + terms drafts, branded 404, footer legal links
- [x] Tested: Phase 5 e2e 21/21 (UI token flow, API auth + scoping, MCP over stdio with the real client SDK, revoke, cap); landing checked light/dark/mobile, no overflow, no orphaned words
- [x] Extension ↔ your Chrome: connected (confirmed on `/connect`)
- [x] Launch prep: extension icons + web favicon; permissions trimmed to contextMenus/storage/scripting/alarms + host (extension e2e still 8/8); store zip with production URL verified; web production build passes; worker Dockerfile (CPU torch, CLIP baked in; not built locally — no Docker here) and HOST/PORT env; full steps in [LAUNCH.md](LAUNCH.md)
- [ ] Legal review — deferred (local use first)
- [ ] Chrome Web Store submission — deferred (local use first)
- [x] Code on GitHub (private): https://github.com/GuninderSinghBhatia/justcreate — CI green (web, extension, MCP, worker)
- [x] Supabase secret key rotated (new key `justcreate_server` in `.env.local`, everything verified on it)
- [x] Old leaked secret key deleted (you)
- [x] Decision: run locally for now (`npm run dev` starts web + worker). `render.yaml` is ready for when the worker should run without your laptop (needs a paid ~2 GB instance)
- [ ] Apply migration 0007 (security hardening: token rows server-only, AI design.md versions worker-only, one board per user) in the Supabase SQL editor (you)
- [ ] Before deploying: set SITE_URL to the public address; Supabase Auth redirect allow-list = exact callback URLs only
- [ ] 60-second demo video for the landing page; launch posts
- [ ] Optional: publish `@justcreate/mcp` to npm so setup is `npx -y @justcreate/mcp`

## How the pieces fit

- Extension / web uploads → `POST /api/captures` (bearer token or cookie) → Storage + `references` row → `analyze` job.
- Worker: `analyze` → `analyses` + `embeddings` (+ thumbnail) → may queue `cluster`; `cluster` → replaces only *suggested* AI clusters.
- Canvas → `PUT /api/boards/:id/canvas` saves the tldraw document and syncs `board_items`.
- design.md: server action queues a `spec` job (params: cluster ids or one section) → worker writes a new `design_specs` version → the spec page refreshes.
- The secret key is used server-side only: minting extension sessions, queueing jobs, and the worker.

## Differences from the execution plan (on purpose)

- npm workspaces instead of pnpm + Turborepo (works; not worth switching at this size).
- Data model: file paths live on `references` (`file_path`, `thumbnail_path`) instead of a separate `assets` table; positions in `board_items` + the tldraw document instead of only `boards.canvas_state`.
- Extension auth uses a dedicated Supabase session (minted at `/connect`) instead of personal API tokens; `api_tokens` arrives with the MCP server in Phase 5.
- scikit-learn's `HDBSCAN` instead of the `hdbscan` package (same algorithm, installs cleanly on Windows).

## Log

- 2026-10-22: plan written, repo initialised; Phase 0 + 1 built and tested; moved to port 3100.
- 2026-10-23: Phase 2 built and browser-tested; Phase 3 worker built; migrations 0002–0004 applied via the SQL editor.
- 2026-10-23: Gemini provider added; Phase 3 e2e 14/14; compaction pass (shared card sizing, one canvas placeCard, shared requireUser, cluster-action wrapper); lockfile regenerated so ESLint runs clean.
- 2026-10-23: Phase 4 (design.md) built and tested; fixed an accidental edit in migration 0001 that had slipped into the Phase 3 commit.
- 2026-10-23: Phase 5 built and tested: API tokens, agent API, MCP server, settings, usage cap, landing + legal pages.
- 2026-10-23: launch prep (icons, permissions, store listing text, Dockerfile, production build); extension confirmed connected in your Chrome.
- 2026-10-23: key rotated, private GitHub repo + green CI, Phase 4 exit gate passed 3/3.
- 2026-10-29: switched to Groq (live e2e: 6 analyses, cluster names, design.md with 10 sections / 46 citations); Render Blueprint for the worker; CI builds the worker Docker image.
- 2026-10-29: UI font is Virgil. One board per user: signed-in `/` opens `/board`, every capture and upload lands on it, clusters group it (no board list, picker or delete; old `/boards/...` links redirect; extension popup picker removed). The canvas is Excalidraw 0.18 (MIT) instead of tldraw: all its tools, menu, library, export; references are image elements tagged `customData.referenceId`, images dropped/pasted/inserted on the canvas upload as references; saves only delete references the tab itself removed. Browser e2e 9/9.
- 2026-10-29: UI handwriting is Kalam (felt-tip, Google Fonts) instead of Virgil; body stays Nunito.
- 2026-10-29: Canvas as art paper: warm grain and vignette under a transparent Excalidraw background; each image sits on a mat with a shadow and a strip of washi tape (DOM layers in components/canvas/decor.tsx, tape between Excalidraw's static and selection canvases).
- 2026-10-29: Double-click an image on the canvas opens a full-size view (fit or actual size, source link; Esc closes; keys don't reach Excalidraw while open). Replaces Excalidraw's double-click crop mode.
- 2026-10-29: Images save at full quality: `imageUrlCandidates` (shared) maps CDN resizes back to originals (Pinterest /originals/, X name=orig, Dribbble, Behance, Unsplash) for the extension and the server download; images dropped or pasted on the canvas upload the original, not Excalidraw's 1440px copy (`generateIdForFile`). Existing Pinterest references were upgraded (8 of 11).
- 2026-10-29: Motion: the full-size view grows out of the image on the canvas (crop-aware, Web Animations) and shrinks back; side panels slide in, Canvas/Grid fade, grid cards lift on hover; all off under prefers-reduced-motion.
- 2026-10-29: Board opens spacious: Clusters panel closed until toggled; the canvas fits the whole board with wide margins (never above 100% zoom).
- 2026-10-30: In a cluster/style grid a card opens the full-screen viewer (no side drawer over the grid) with ‹ › and arrow keys through the cluster and an n / total counter; Esc returns to the grid. `ReferenceGrid` takes `onOpen`; `Lightbox` takes `nav`.
- 2026-10-30: Bar simplified: no Board/design.md tabs, no board name or reference count (the logo goes to the board; board context is just save status). design.md is per cluster only: no whole-board option; /board/spec without ?c opens a cluster that has one (else the first). Getting back: the cluster/style gallery has a Board back button and its own browser-history entry (Back closes it without reloading; Next's history state is kept), design.md has a Board back link.
- 2026-10-30: Top bar coloured like the canvas (`--bar-bg`: the paper colour mixed 72/28 with the page background) on every page; the canvas colour now lives on `<html data-paper>`, set from localStorage by an inline script before first paint, so the bar follows the picker everywhere with no flash.
- 2026-10-30: The app is Nunito throughout (headings, buttons, labels on Settings, Extension, panels, drawer, design.md); the handwriting face is only the landing page's (`.handwritten` on its main) or where `.font-hand` asks.
- 2026-10-30: One top bar on every signed-in page (site-header.tsx): logo │ Board · design.md tabs (underlined when active) │ context (board name, count, save status · which design.md and version · page title) … tools │ account (filled avatar). Settings and Extension use it too; dropdowns share `BarSelect`; Copy/Download icon-only below xl so the design.md bar never overlaps at 1024px.
- 2026-10-30: Canvas colour: sage by default, with Slate, Blush and the original Paper in the tool strip's More menu (per browser, localStorage; `.board-canvas[data-paper]` overrides with dark twins).
- 2026-10-30: A design.md per cluster: spec jobs take `cluster_id` (written from that cluster only, told it is one style family, titled after it) and save with `sources.cluster_id` (board-level = none; versions stay unique per board, numbered per document in the UI). Every design.md ends with "Key references" built in code (image: the public file or `ref:<id>`, style, palette, caption, source) before the reference map. Page: switcher Whole board / each cluster, scoped versions, rewrites and edits, cluster empty state; Clusters panel and gallery link to each cluster's design.md; generating one accepts the cluster. Agent API `spec?cluster=` and MCP `get_design_spec(cluster)`; list_boards lists `cluster_specs`. Batches retry once on incomplete strict JSON. Generated for the Pixel Art cluster.
- 2026-10-30: JUSTCREATE wordmark in the body face (Nunito 800, spaced; `.wordmark` in globals.css) on every header, the landing page and legal pages.
- 2026-10-30: Clicking a cluster (name or thumbnails) or a style chip opens its images as a grid over the board (components/cluster-gallery.tsx: same cards and details drawer as Grid view; canvas stays mounted; Esc closes); "Show on canvas" keeps the old jump-and-select.
- 2026-10-30: Clustering by named design style first: a 40-style taxonomy (worker/styles.py: ASCII Art, Brutalism, Neo-Brutalism, Swiss, Glassmorphism, Retro OS, Pixel Art…), each reference scored by CLIP zero-shot (prompt-ensembled style descriptions vs its image and caption embeddings) plus the style words in its analysis and the vision model's own pick from the list (new `design_styles` field, enum-constrained). A style with 2+ references is a cluster named after it; the rest are clustered by similarity as before. Styles are stored in `analyses.inferred.styles`, shown as chips on the reference panel, listed (with counts, click to select) at the top of the Clusters panel, and given to design.md. Real board: Pixel Art, Retro OS / Windows 95, Masonry, Neumorphism, Bento Grid.
- 2026-10-29: Top bar controls unified (components/bar.tsx): 32px, body font, segmented Canvas/Grid, icon toggles with the tool strip's lilac "on" tint, one primary action, save-status dot; same set on the design.md bar.
- 2026-10-29: Clustering: blended similarity (image, caption, IDF-weighted tags; each part rescaled to the board), min cluster size 3 on small boards, one split of a dominant cluster, soft members capped at half the core; fallback-tagged references compare on their picture only and are re-queued hourly (re-cluster when upgraded). Real board: 0 → 3 clusters. design.md: on Groq written in 4 batches that fit the 8k tokens-per-minute cap (was failing with 413 every time and falling back to a draft), gpt-oss reasoning effort low, stricter Observed/Inferred, new "Do and don't" section, drafts record why; page has one bar, section nav with per-section rewrite, citation chips with thumbnails, hex swatches, opens in Preview. Canvas shows original files for saved images (not the 640px grid thumbnail).
- 2026-10-29: Board has one 48px top bar: logo, board name and controls, and an account menu (Extension, Settings, Sign out); other pages keep the full header. Fixed: a brand-new account's first /board visit crashed (the reload after creating the board was served the memoized empty result; it now loads by id).
- 2026-10-29: Own tool strip (components/canvas/tool-strip.tsx) replaces Excalidraw's tool bar: Select, Shapes (rectangle/diamond/ellipse pop-out), Arrow/Line pop-out, Pen, Text, More (hand, image, eraser, frame, embed, laser, keep tool active). Excalidraw's bar stays mounted but hidden; built-in tools switch by clicking its inputs, so shortcuts, the image picker and the lock behave as before.
- 2026-10-29: Images added to the board land scattered in free spots, slightly tilted and varied in size (moodboard feel). Nav is just Extension, Settings, Sign out: the Library page is gone (the board's Grid view and References sidebar cover it; `/library` redirects to `/board`).
- 2026-10-30: Security test pass (test plan run against the local production build) and fixes. Captures: remote images are fetched only from public addresses (checked at connect time, redirects re-checked, 50 MB cap while streaming: `lib/safe-fetch.ts`); stored files must be JPEG/PNG/GIF/WebP/AVIF by their bytes (no SVG/HTML, no empty files); request size checked before parsing; only http(s) source/page URLs kept. design.md and re-cluster actions check board/cluster ownership before queueing (jobs are written with the secret key); section names validated; actions return `{ error }` so messages show in production. AI usage counted from `spec` jobs (users can't delete them). Security headers (no framing, nosniff, referrer policy, HSTS), no x-powered-by. Magic links use `SITE_URL`, never the request Origin. In-memory rate limits on captures, agent API and sign-in links. design.md preview loads only this board's images. Raw database errors stay in the server log. API tokens created/revoked server-side. Worker: every read in a spec job filtered by user; reference links in design.md http(s) only. Extension: session accepted only from the app's /connect page; one failing capture no longer blocks the offline queue.
