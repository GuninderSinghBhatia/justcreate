# JUSTCREATE — Progress

Plan: [JUSTCREATE-PLAN.md](JUSTCREATE-PLAN.md) · Spec: [JUSTCREATE.md](JUSTCREATE.md) · Execution plan: “JUSTCREATE — Execution Plan” (Oct 23, 2026)

Decisions: Claude builds everything, full phase order, personal tool first. AI runs in a Python worker (per the execution plan).

## Running it locally

| Piece | Command | Notes |
|---|---|---|
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
- [ ] Extension ↔ your Chrome: `/connect` didn't get an answer from the extension in your profile — reload the extension on `chrome://extensions` and open `/connect` again; the page now says exactly what failed
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
- [x] Gemini key in `apps/worker/.env` (gitignored). Free tier = 20 requests/day per model: enough to try it, not for daily use
- [x] Tested: worker unit tests 9/9; Phase 3 e2e 14/14 with Gemini (12/12 analysed, clusters 100% pure on a 3-family test board)
- [ ] Hand-labelled 100-reference test set (you: collect references across 5 styles)

## How the pieces fit

- Extension / web uploads → `POST /api/captures` (bearer token or cookie) → Storage + `references` row → `analyze` job.
- Worker: `analyze` → `analyses` + `embeddings` (+ thumbnail) → may queue `cluster`; `cluster` → replaces only *suggested* AI clusters.
- Canvas → `PUT /api/boards/:id/canvas` saves the tldraw document and syncs `board_items`.
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
