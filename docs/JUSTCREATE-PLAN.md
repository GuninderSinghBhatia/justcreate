# JUSTCREATE — Build Plan

Companion to [JUSTCREATE.md](JUSTCREATE.md). This turns the product spec into phases you can build one at a time. Each phase ends with something that runs and is useful on its own.

**Guiding rule:** ship the thinnest working slice first, then widen. The core loop is *capture → see it on a board → get a design.md*. Everything else is built on top of that.

---

## Tech stack (recommended defaults)

| Layer | Choice | Why |
|---|---|---|
| Browser extension | Chrome Manifest V3, TypeScript, built with **WXT** (or Plasmo) | Hot reload, cross-browser builds later (Firefox/Edge) with one codebase |
| Web app | **Next.js** (App Router) + TypeScript + Tailwind | One repo covers UI and API routes |
| Canvas | **tldraw** SDK | Infinite canvas, drag/resize/group out of the box; custom shapes for reference cards |
| Database + auth + file storage | **Supabase** (Postgres, Auth, Storage) | One service for all three; Postgres has `pgvector` for embeddings |
| Vision / text AI | **Claude** (`claude-sonnet-5-5` for analysis, `claude-haiku-5-5` for cheap per-item tagging) | Strong image understanding; same model writes design.md |
| Embeddings | **Voyage `voyage-multimodal-3`** (images + text in one vector space) | Needed for clustering; Anthropic has no embeddings model |
| Background jobs | Supabase Edge Functions + a `jobs` table (or Inngest) | Analysis runs async after capture |
| Hosting | Vercel (web) + Supabase (data) | Free tiers cover early development |

Change any of these before Phase 0 starts. After that, switching gets expensive.

---

## Data model (core tables)

```
users            id, email, created_at
boards           id, user_id, name, description, created_at
references       id, user_id, type (image|screenshot|video|tweet|webpage),
                 source_url, title, thumbnail_path, file_path,
                 metadata jsonb (timestamps, author, page title, dims…),
                 note, created_at
board_items      board_id, reference_id, x, y, w, h, z      -- canvas placement
analyses         reference_id, model, summary, tags[], colors[], fonts[],
                 layout_notes, components[], effects[], raw jsonb, created_at
embeddings       reference_id, vector(1024), model
clusters         id, board_id, name, status (suggested|accepted|rejected),
                 source (ai|user), created_at
cluster_members  cluster_id, reference_id, score
design_specs     id, board_id, version, markdown, reference_ids[], created_at
api_tokens       id, user_id, hashed_token, scopes, created_at   -- Phase 5
```

A reference can sit on several boards and in several clusters. That's why both use join tables.

---

## Phase 0 — Skeleton (≈1 week)

**Goal:** an image saved by right-click shows up on a web page.

- [ ] Monorepo: `apps/web` (Next.js), `apps/extension` (WXT), `packages/shared` (types)
- [ ] Supabase project: `users`, `references` tables, a `captures` storage bucket
- [ ] Email/Google login on the web app
- [ ] Extension signs in by reusing the web session (open the web login, pass the token back to the extension)
- [ ] Context menu **"Save to JUSTCREATE"** on images → uploads the image and saves `source_url` + page title
- [ ] Web page `/library`: a grid of saved images, newest first

**Done when:** you right-click an image on any site and it appears in `/library` within a few seconds.

---

## Phase 1 — Full capture (≈2 weeks)

**Goal:** every capture type in spec §1 works.

- [ ] **Screenshots:** visible area (`chrome.tabs.captureVisibleTab`), selected region (content-script overlay + crop), and full page (scroll and stitch)
- [ ] **YouTube:** detect video pages, save title, thumbnail, URL, channel, and an optional current timestamp (`?t=`)
- [ ] **X / social posts:** capture the post's text, author, URL, and attached media, plus a screenshot of the post element as a fallback
- [ ] **Web page:** save URL, title, favicon, OG image, and a full-page screenshot
- [ ] Toolbar popup: quick save of the current page, choose a board, add a note
- [ ] Keyboard shortcuts (`chrome.commands`): save page, region screenshot
- [ ] Confirmation toast on the page after each save, plus an offline queue that retries failed uploads

**Done when:** each of the 5 types can be captured in two clicks or fewer, and its source URL and metadata are kept.

**Risk:** X and YouTube change their DOM often. Keep each site's scraping in its own small adapter file, and always fall back to a plain screenshot plus the URL.

---

## Phase 2 — Boards and canvas (≈2–3 weeks)

**Goal:** spec §2, the visual workspace.

- [ ] Boards CRUD and a board switcher
- [ ] tldraw canvas with a custom **ReferenceCard** shape for each type (image, video with play overlay, tweet card, webpage card)
- [ ] Drag, resize, group (tldraw frames), with positions saved to `board_items` (debounced)
- [ ] Side panel for the selected card: note, labels, source link, metadata
- [ ] Library sidebar: drag references from the library onto the canvas
- [ ] Search (title, note, tags) and filters (type, board, date)
- [ ] Inbox: new captures with no board land here

**Done when:** you can build a moodboard of 30+ mixed references, reload, and everything is where you left it.

---

## Phase 3 — AI analysis and clustering (≈3 weeks)

**Goal:** spec §3, AI organizes references while the user stays in control.

**3a. Per-reference analysis (runs on capture, in the background)**
- [ ] Job queue: each new reference creates an `analyze` job
- [ ] Claude vision call returns **structured JSON**: summary, style tags, dominant colors (hex), font guesses, layout notes, UI components seen, effects, mood
- [ ] Separate what is **observed** from what is **inferred** in the schema (spec §4 needs this later)
- [ ] Store the result in `analyses` and show tags on cards
- [ ] Videos: analyze the thumbnail and title. Later, sample frames at the saved timestamp.

**3b. Embeddings and clustering**
- [ ] Embed each reference: its image plus its analysis text, with Voyage multimodal
- [ ] Cluster per board with **HDBSCAN** (no need to choose the number of clusters, and outliers are allowed). For soft or multi-membership, also assign a reference to any other cluster whose centroid is within a similarity threshold.
- [ ] Name each cluster: send Claude a cluster's tags and summaries and get back a short name like "Neon Color Palettes"
- [ ] Show suggested clusters as dashed frames or a side list
- [ ] User actions: **accept, reject, rename, merge, remove a member, create a manual cluster**. Rejected suggestions are remembered so they aren't suggested again.
- [ ] Re-cluster button, plus an automatic re-run after N new references

**Done when:** on a board of about 40 mixed references, the suggested clusters make sense to you, and every suggestion can be overridden.

**Cost control:** Haiku for per-item tagging, Sonnet only for naming and specs. Cache analyses so nothing is analyzed twice. Resize images to about 1024px before sending.

**Good place for you to own the ML:** the clustering step (embedding → HDBSCAN → threshold tuning → evaluation) is a self-contained ML problem. It fits your ML-intern goals well.

---

## Phase 4 — design.md generation (≈2–3 weeks)

**Goal:** spec §4, the headline feature.

- [ ] "Generate design spec" on a board, or on a selection or cluster
- [ ] Pipeline:
  1. Collect all analyses for the selected references (already structured from Phase 3)
  2. **Aggregate** in code first: merge color lists into a palette (k-means on hex values), count font and component frequency
  3. Send Claude the aggregates, the analyses, and a sample of the actual images, using a fixed design.md template with every section from spec §4
  4. Require every claim to cite reference IDs, and mark each one **[observed]** or **[inferred]**
- [ ] Output sections: direction, palette (with hex + roles), typography (with suggested Google Fonts), layout and spacing, components, effects, motion, responsive, implementation guidance (CSS variables / Tailwind config snippet), reference map (links)
- [ ] Markdown editor with live preview (e.g. Milkdown or a split CodeMirror pane)
- [ ] Regenerate the whole document or a single section. Every generation is saved as a version.
- [ ] Download `.md`, plus an optional zip with the reference thumbnails

**Done when:** you hand a generated design.md to Claude Code, it builds a page, and the result clearly matches the board's look.

**Quality check:** keep 3–5 test boards with very different styles, and regenerate after every prompt change to compare outputs side by side.

---

## Phase 5 — Coding-agent integration (≈2 weeks)

**Goal:** spec §5, agents fetch specs directly.

- [ ] Personal API tokens (scoped, revocable) in settings
- [ ] REST: `GET /api/boards`, `GET /api/boards/:id/spec`, `GET /api/references/:id`
- [ ] **MCP server** (`justcreate-mcp`) with tools `list_boards`, `get_design_spec`, `get_reference_images`, so Claude Code and Cursor can pull a spec and its images straight into context
- [ ] "Copy setup command" button for Claude Code and Cursor
- [ ] Docs page for agent setup

**Done when:** in Claude Code, "build a landing page using my *Cyberpunk* board" works with no manual file copying.

---

## Phase 6 — Polish and launch (ongoing)

- [ ] Onboarding: sample board, extension install prompt
- [ ] Firefox/Edge builds (WXT makes this mostly free)
- [ ] Chrome Web Store listing and privacy policy (needed because you store screenshots)
- [ ] Usage limits per account (AI calls cost money)
- [ ] Error tracking (Sentry) and basic analytics
- [ ] Performance: thumbnails, lazy-loading on large canvases
- [ ] Later ideas: shared boards, frame sampling across whole videos, Figma export

---

## Timeline summary

| Phase | Output | Rough time at ~10 hrs/week |
|---|---|---|
| 0 Skeleton | Right-click → library | 1–2 weeks |
| 1 Capture | All 5 capture types | 3–4 weeks |
| 2 Canvas | Moodboard workspace | 4–5 weeks |
| 3 AI clustering | Tags + suggested clusters | 5–6 weeks |
| 4 design.md | Spec generator | 4–5 weeks |
| 5 Agents | API + MCP server | 3 weeks |

About 5–6 months of part-time work for the full vision. A usable personal MVP is ready after Phase 0 + a slice of 1, 2 and 4: image/screenshot capture, a simple board, design.md generation. Clustering can come after that.

### Shortcut MVP (if you want the headline feature sooner)
Phase 0 → screenshots only from Phase 1 → a plain grid board instead of the canvas → Phase 4. That gets you to **capture → design.md** in about 5–6 weeks. Add the canvas and clustering afterwards.

---

## Key risks

| Risk | Mitigation |
|---|---|
| design.md comes out generic | Structured per-item analysis + code-side aggregation + required reference citations |
| AI cost grows with the library | Haiku for tagging, caching, image downscaling, per-user limits |
| Site DOM changes break capture | Per-site adapters, screenshot fallback |
| Copyright of saved images | Store privately per user; never publish others' images; keep source links |
| Canvas performance with many items | Thumbnails on the canvas, full images only on open |

---

## Decisions (2026-10-22)

1. **Who builds what:** Claude builds all parts.
2. **Order:** full phase order, 0 → 6.
3. **Scope:** personal tool first. Per-user limits and billing are deferred.
4. **Project location:** `Desktop\projects\justcreate`.
