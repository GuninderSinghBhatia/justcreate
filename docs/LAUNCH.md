# JustCreate — Launch checklist

Everything here needs your accounts. Do it in order: the Chrome Web Store needs the live privacy policy URL, and the extension build needs the production web URL.

## 1. Deploy the AI worker (Hugging Face Space, free)

The worker needs ~2 GB of RAM for CLIP; a free CPU Space has 16 GB. It runs from `apps/worker/Dockerfile` as a **private** Space.

1. Hugging Face → Settings → Access Tokens → **New token**, type *Write*. Then `uvx --from huggingface_hub hf auth login` and paste it.
2. Create the Space, copy the worker's settings into its secrets, and upload the code:

   ```sh
   uv run --no-project --with huggingface_hub python scripts/deploy_worker.py <hf-user>/justcreate-worker --secrets
   ```

   Secrets/variables come from the same files the worker reads locally (`apps/web/.env.local`, then `apps/worker/.env`): `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `LLM_PROVIDER`, `GROQ_API_KEY` (and any other LLM keys present). The first build takes ~10 minutes; the Space's page shows the log.
3. Automatic deploys: GitHub repo → Settings → Secrets and variables → Actions: variable `HF_SPACE_ID` = `<hf-user>/justcreate-worker`, secret `HF_TOKEN` = the token. CI then pushes `apps/worker` after its tests and image build pass, only when files changed.
4. For the web app (next step), make a **fine-grained** token limited to this Space with write access to its contents/settings. It's `WORKER_TOKEN`: it lets the app reach the private Space's `/wake`, and start the Space when it went to sleep.

Free Spaces sleep after 48 hours without requests. Nothing is lost: jobs wait in the `jobs` table, the next capture or cluster request starts the Space, and it works through the queue (about a minute later than usual).

## 2. Deploy the web app (Vercel, free)

1. Vercel → Add New → Project → import `GuninderSinghBhatia/justcreate` (private). **Root Directory**: `apps/web` (Vercel installs the npm workspace from the repo root). `apps/web/vercel.json` pins functions to Mumbai (`bom1`), next to the Supabase project; change it if the project's region (Supabase → Settings → General) is elsewhere.
2. Environment variables (Production):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://gvqubavzxctimdswjnoq.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` (from `apps/web/.env.local`) |
   | `SUPABASE_SECRET_KEY` | `sb_secret_…` (from `apps/web/.env.local`) |
   | `SITE_URL` | `https://<your-domain>` (no trailing slash): magic links point here |
   | `TRUSTED_PROXY_HOPS` | `1` (rate limits per visitor, from Vercel's `X-Forwarded-For`) |
   | `WORKER_URL` | `https://<hf-user>-justcreate-worker.hf.space` |
   | `WORKER_TOKEN` | the fine-grained Hugging Face token from step 1.4 |
   | `HF_SPACE_ID` | `<hf-user>/justcreate-worker` |
   | `AI_MONTHLY_GENERATIONS` | `30` (optional) |

3. Supabase → Authentication → URL Configuration: **Site URL** = the production URL; add `https://<your-domain>/auth/callback**` to Redirect URLs (keep the localhost entry for development).
4. Check it: `node scripts/e2e-uploads.mjs https://<your-domain>` (a throwaway user, deleted afterwards): uploads over 4.5 MB, byte-identical storage, refused bad uploads, gzipped board saves.

Uploads never pass through Vercel (its functions accept 4.5 MB per request): the app and extension get signed URLs from `/api/captures/uploads` and PUT the original bytes straight to Supabase Storage; `/api/captures` then checks each file's bytes and type before saving. Board saves over 1 MB are sent gzipped.

The canvas is Excalidraw (MIT): no license key needed.

## 3. Build the extension

```sh
cd apps/extension
WXT_APP_URL=https://<your-domain> npx wxt build   # for yourself: load .output/chrome-mv3 unpacked
WXT_APP_URL=https://<your-domain> npx wxt zip     # for the store: .output/extension-0.1.0-chrome.zip
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
