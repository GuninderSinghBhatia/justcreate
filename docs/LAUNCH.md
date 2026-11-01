# JustCreate — Launch checklist

Everything here needs your accounts. Do it in order: the Chrome Web Store needs the live privacy policy URL, and the extension build needs the production web URL.

## 1. Deploy the AI worker (Modal, free credit)

**Live (2026-11-01):** Modal app `justcreate-worker` (workspace `guninder-growth`), wake URL `https://guninder-growth--justcreate-worker-web.us-east.modal.run`. It runs only when there's work: the web app POSTs `/wake` after queueing a job, a run works through every due job (and keeps checking every 5 s while a retry is due within 5 minutes), then stops; a sweep every 10 minutes catches retries and missed wakes. 1 CPU + 2 GB per run (CLIP), well inside Modal's $30/month free credit for personal use. Code: `apps/worker/modal_app.py`, same `uv.lock` and baked CLIP weights as the Dockerfile.

1. `uvx modal token new` (browser sign-in).
2. `node scripts/setup-worker-secret.mjs`: Modal secret `justcreate-worker` (Supabase URL + secret key, LLM settings, from `apps/web/.env.local` and `apps/worker/.env`, plus a new `WAKE_TOKEN`) and the same token as Vercel's `WORKER_TOKEN`. Re-run it after changing keys.
3. `cd apps/worker && uvx modal deploy modal_app.py`. CI does this on every push to `main` after the worker tests and image build pass, once the repo has the `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET` secrets.
4. Vercel env: `WORKER_URL` = the wake URL above.

Logs and runs: the Modal dashboard (Apps → justcreate-worker). The local worker (`npm run dev:worker`) still works alongside it: jobs are claimed one at a time, never twice.

Other hosts: `apps/worker/Dockerfile` runs anywhere with ~2 GB RAM (`render.yaml` is ready, ~$25/month). Hugging Face Docker Spaces need PRO.

## 2. Deploy the web app (Vercel, free)

**Live: https://justcreate-seven.vercel.app** (Vercel project `justcreate`, deploys every push to `main`; this folder is linked with `vercel link`). Production env vars are set, including `WORKER_URL` and `WORKER_TOKEN` for the Modal worker.

1. Vercel → Add New → Project → import `GuninderSinghBhatia/justcreate` (private). **Root Directory**: `apps/web` (Vercel installs the npm workspace from the repo root). `apps/web/vercel.json` pins functions to Mumbai (`bom1`), next to the Supabase project; change it if the project's region (Supabase → Settings → General) is elsewhere.
2. Environment variables (Production):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://gvqubavzxctimdswjnoq.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` (from `apps/web/.env.local`) |
   | `SUPABASE_SECRET_KEY` | `sb_secret_…` (from `apps/web/.env.local`) |
   | `SITE_URL` | `https://<your-domain>` (no trailing slash): magic links point here |
   | `TRUSTED_PROXY_HOPS` | `1` (rate limits per visitor, from Vercel's `X-Forwarded-For`) |
   | `WORKER_URL` | the Modal wake URL (§1) |
   | `WORKER_TOKEN` | set by `scripts/setup-worker-secret.mjs` |
   | `AI_MONTHLY_GENERATIONS` | `30` (optional) |

3. Supabase → Authentication → URL Configuration: **Site URL** = the production URL; add `https://<your-domain>/auth/callback**` to Redirect URLs (keep the localhost entry for development).
4. Check it: `node scripts/e2e-uploads.mjs https://<your-domain>` (a throwaway user, deleted afterwards): uploads over 4.5 MB, byte-identical storage, refused bad uploads, gzipped board saves.

Uploads never pass through Vercel (its functions accept 4.5 MB per request): the app and extension get signed URLs from `/api/captures/uploads` and PUT the original bytes straight to Supabase Storage; `/api/captures` then checks each file's bytes and type before saving. Board saves over 1 MB are sent gzipped.

The canvas is Excalidraw (MIT): no license key needed.

## 3. Build the extension

`apps/extension/.env.production` holds the live address, so builds use it (dev mode keeps localhost):

```sh
npm run build -w extension              # for yourself: load apps/extension/.output/chrome-mv3 unpacked
cd apps/extension && npx wxt zip        # for the store: .output/extension-0.1.0-chrome.zip
```

Bump `version` in `apps/extension/package.json` for every upload.

## 4. Chrome Web Store listing

Developer account: one-time $5 fee at the Chrome Web Store developer dashboard.

**Name:** JustCreate

**Short description (≤132 chars):** Save images, screenshots, YouTube videos, X posts and pages to your JustCreate boards in two clicks.

**Description:**
> JustCreate collects design inspiration from anywhere on the web and turns it into a design.md your coding agent can build from.
>
> • Right click any image to save it
> • Screenshot the visible area, a region you drag, or the full page
> • Save YouTube videos with their timestamp, and X posts with their text and media
> • Save whole pages with their title, preview image and a full-page screenshot
> • Pick the board from the toolbar popup, add a note, or use Alt+Shift+S and Alt+Shift+R
>
> Everything keeps its source link. On the web app, references are grouped into style clusters and turned into a cited design.md with real colours, type and spacing.

**Category:** Productivity (or Developer Tools)

**Single purpose:** Save visual references from web pages (images, screenshots, video and post details, page metadata) to the user's JustCreate account.

**Permission justifications:**

| Permission | Why |
|---|---|
| `contextMenus` | Adds “Save image/post/video/page to JustCreate” and screenshot items to the right-click menu. |
| `storage` | Keeps the user's sign-in session and chosen default board on the device. |
| `scripting` | Injects the capture script into tabs that were open before the extension was installed, so saving works without a reload. |
| `alarms` | Retries saves that failed while offline, once a minute. |
| Host permission `<all_urls>` | The user can save from any site: reading the chosen image, taking screenshots of the current tab, reading page metadata (title, preview image, video or post details) at the moment they save, and sending it to the JustCreate API. |

**Remote code:** No. All code ships in the package.

**Data usage disclosures** (check these in the dashboard):
- Collects: *Website content* (images, screenshots, page titles and text the user chooses to save), *Authentication information* (session token).
- Not collected: browsing history, location, personal communications, financial or health data.
- Certify: not sold to third parties; not used for unrelated purposes; not used for creditworthiness.

**Privacy policy URL:** `https://<your-domain>/privacy`

**Screenshots (1280×800, at least 1):** the board canvas with a few cards, the cluster panel, the design.md editor in split view, the popup with the board picker, the right-click menu on an image.

**Icon:** `apps/extension/public/icon/128.png`

## 5. After launch

- Collect ~100 references across 5 styles and track `uv run python -m worker eval` (target: 70% of AI clusters kept or only renamed).
- Phase 4 exit gate: give 3 boards' design.md to Claude Code (“build a landing page from design.md”); 2 of 3 should be recognisably in the board's style.
- Record the 60-second demo (save → cluster → design.md → agent builds the page) for the landing page.
