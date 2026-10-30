# JustCreate — Launch checklist

Everything here needs your accounts. Do it in order: the Chrome Web Store needs the live privacy policy URL, and the extension build needs the production web URL.

## 1. Deploy the web app (Vercel)

1. The repo is already on GitHub (private): `GuninderSinghBhatia/justcreate`. Import it in Vercel, set **Root Directory** to `apps/web` (Vercel detects the npm workspace).
2. Environment variables (Production):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://gvqubavzxctimdswjnoq.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` |
   | `SUPABASE_SECRET_KEY` | the `justcreate_server` secret key (copy it from Supabase → API Keys; the old `default` key should be deleted) |
   | `WORKER_URL` | the worker URL from step 2 (optional; the worker also polls) |
   | `AI_MONTHLY_GENERATIONS` | `30` (optional) |

3. tldraw needs a license key in production: get one at tldraw.dev and pass it to `<Tldraw licenseKey=…>` in `apps/web/src/components/canvas/board-canvas.tsx`.
4. Supabase → Authentication → URL Configuration: set **Site URL** to the production URL and add `https://<your-domain>/**` to Redirect URLs (keep the localhost entry for development).

## 2. Deploy the worker (Railway, Render or Fly.io)

- Build from `apps/worker` with its `Dockerfile` (CPU-only torch; CLIP weights baked in, image ≈ 1.5 GB). The Dockerfile has not been built locally: Docker isn't installed on this machine.
- Environment: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and `GEMINI_API_KEY` or `ANTHROPIC_API_KEY`. The platform sets `PORT`; the image sets `HOST=0.0.0.0`.
- One always-on instance with ~2 GB RAM is enough (CLIP runs on CPU). Health check: `GET /health`.
- Gemini's free tier is 20 requests/day per model; enable billing on the key (or use Claude) before real users arrive.

## 3. Build the extension for the store

```sh
cd apps/extension
WXT_APP_URL=https://<your-domain> npx wxt zip
# → .output/extension-0.1.0-chrome.zip
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
