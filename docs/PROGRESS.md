# JUSTCREATE — Progress

Plan: [JUSTCREATE-PLAN.md](JUSTCREATE-PLAN.md) · Spec: [JUSTCREATE.md](JUSTCREATE.md)

Decisions: Claude builds everything, full phase order, personal tool first.

## Phase 0 — Skeleton

- [x] Project folder, docs, git repo
- [x] Supabase project created; URL + secret key in `apps/web/.env.local` (gitignored)
- [x] Publishable key added to `apps/web/.env.local`
- [x] Monorepo (npm workspaces): `apps/web` (Next.js 16), `apps/extension` (WXT), `packages/shared`
- [x] `captures` storage bucket (private) — created via API
- [x] `references` table + RLS + storage policies (`supabase/migrations/0001_references.sql`)
- [x] Supabase Auth → URL Configuration: Site URL `http://localhost:3100`, redirect `http://localhost:3100/**`
- [x] Login on web app (email magic link)
- [x] Extension sign-in via web session (`/connect` mints a separate session for the extension)
- [x] Right-click "Save image to JUSTCREATE"
- [x] `/library` grid page (auto-refreshes every 5 s)

## Phase 1 — Full capture

- [x] Screenshots: visible, region (drag overlay), full page (scroll + stitch, max 32 000 px tall)
- [x] YouTube: title, channel, thumbnail, URL with `?t=` timestamp
- [x] X posts: text, author, handle, permalink, media URLs, element screenshot
- [x] Web page: URL, title, favicon, OG image, description, full-page screenshot
- [x] Toolbar popup: save page (auto-detects YouTube / X), screenshots, note
- [ ] Popup board picker — deferred to Phase 2 (boards don't exist yet)
- [x] Keyboard shortcuts: Alt+Shift+S save page, Alt+Shift+R region screenshot
- [x] On-page toast after each save; offline queue (IndexedDB) retried every minute
- [x] Capture API tested end to end (scripted: uploads, remote fetch, RLS isolation, signed URLs, token refresh)
- [x] Web login tested in real Chrome (magic link → /library)
- [x] Extension tested in Playwright Chromium (`--load-extension`, dev build test hook): connect, image, visible/region/full-page screenshots, web page, YouTube — 8/8
- [x] X post selectors verified on live logged-in X (handle, permalink, date, text, media)
- [ ] Offline queue not exercised by automation yet
- [ ] User loads the unpacked extension in their own Chrome (chrome://extensions can't be automated)

## How the pieces fit

- Web app runs on **port 3100** (3000 is used by another local project). Extension defaults to it; override with `WXT_APP_URL`.
- Extension → `POST /api/captures` (multipart: `meta` JSON + optional `file`) with a bearer token.
  The route acts as the user, so RLS applies. The secret key is only used to mint extension sessions.
- Extension sessions refresh through `POST /api/extension/refresh`; the extension holds no Supabase keys.
- Site scraping lives in `apps/extension/lib/adapters/` (one file per site), falling back to a screenshot + URL.

## Log

- 2026-10-22: plan written, decisions made, repo initialized.
- 2026-10-22: Phase 0 + Phase 1 code written. Waiting on publishable key and migration to test.
- 2026-10-22: keys + migration in; API e2e passing; moved to port 3100.
- 2026-10-22: browser-tested. Fixed full-page stitching blanking X (only hide header-sized fixed/sticky elements); /connect waits 10 s for the extension.
