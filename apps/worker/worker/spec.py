"""design.md generation.

Map → reduce over stored analyses (never the raw images, except 3–6 key ones in the final call):
one brief per cluster, then the full document in a fixed section order. Every claim cites
references as [ref:xxxxxx] and is tagged **Observed** or **Inferred**. The reference map is
built in code from the citations, and unknown citations are stripped, so links never lie.
"""

from __future__ import annotations

import io
import json
import logging
import re
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone

import numpy as np
from PIL import Image
from pydantic import BaseModel, Field, create_model
from sklearn.cluster import KMeans

from .config import Settings
from .db import Supabase, in_list
from .llm import model_for, prompt_budget, structured
from .palette import to_hex

log = logging.getLogger(__name__)

SECTIONS: list[tuple[str, str, str]] = [
    ("direction", "Overall design direction", "Visual style, mood, atmosphere and creative identity in a few sharp paragraphs."),
    ("palette", "Color palette", "Primary, secondary, background, surface, text and accent colours as a table: role, hex, usage, citations. Contrast notes."),
    ("typography", "Typography", "Type styles and hierarchy (display, heading, body, label, mono) with sizes, weights, tracking, and Google Fonts suggestions with fallbacks."),
    ("layout", "Layout and composition", "Grid, max widths, spacing scale (px), alignment, density and visual hierarchy."),
    ("components", "UI components", "Recurring components (nav, cards, buttons, panels…) with concrete styling: radius, borders, padding, states."),
    ("effects", "Visual effects", "Gradients, shadows, textures, borders, glass, glow — as concrete CSS-level values."),
    ("motion", "Animations and interactions", "Motion style, durations, easing, hover and transition patterns. Mostly Inferred unless visible."),
    ("responsive", "Responsive design", "How the direction adapts to mobile, tablet and desktop: breakpoints, what stacks, what scales."),
    ("implementation", "Implementation guidance", "Practical build steps, then a ```css :root {}``` block of design tokens (colours, fonts, spacing, radius, shadows) and a Tailwind theme.extend snippet."),
]
TITLE = {key: title for key, title, _ in SECTIONS}
REF_MAP = "Reference map"
CITE = re.compile(r"\[ref:([0-9a-f]{6,12})\]")
# Models sometimes group citations: [ref:a1b2c3, ref:d4e5f6] or [ref:a1b2c3, d4e5f6]
CITE_GROUP = re.compile(r"\[ref:\s*([0-9a-f]{6,12}(?:\s*[,;]\s*(?:ref:)?\s*[0-9a-f]{6,12})+)\s*\]")
HEADING = re.compile(r"^## (?:\d+\.[ \t]*)?(.+?)[ \t]*$", re.M)
LEADING_HEADING = re.compile(r"^\s*#{1,6} [^\n]*\n")
TOP_HEADINGS = re.compile(r"^#{1,2} ", re.M)
MAX_IMAGES = 6

SYSTEM = (
    "You write design.md files: design specifications a coding agent (Claude Code, Cursor) will build from. "
    "Be specific and concrete — hex codes, px values, font names, durations — never generic adjectives. "
    "Rules: (1) Every claim cites one or more references inline as [ref:xxxxxx] using only the ids you are given, "
    "one id per bracket: [ref:a1b2c3] [ref:d4e5f6]. "
    "(2) Tag every claim **Observed** (visible in the references or their analyses) or **Inferred** (your estimate). "
    "(3) Describe the style so it can be rebuilt; never copy logos, text or assets. "
    "(4) Write GitHub-flavoured markdown without top-level headings; tables and bullet lists are welcome."
)


def _section_model() -> type[BaseModel]:
    fields = {key: (str, Field(description=f"Markdown body for '{title}'. {hint}")) for key, title, hint in SECTIONS}
    return create_model("DesignSpecSections", **fields)


SpecSections = _section_model()


class ClusterBrief(BaseModel):
    essence: str = Field(description="2-3 sentences: what defines this group visually, with citations")
    palette: str = Field(description="Colours with hex and role, cited, Observed/Inferred")
    typography: str = Field(description="Type treatments, cited, Observed/Inferred")
    layout: str = Field(description="Layout and spacing traits, cited")
    components_and_effects: str = Field(description="Recurring components and effects, cited")
    motion: str = Field(description="Likely motion/interaction, mostly Inferred, cited")


class SectionText(BaseModel):
    markdown: str = Field(description="The new markdown body for the requested section only")


@dataclass
class Board:
    id: str
    name: str
    refs: dict[str, dict]  # reference id → reference row
    analyses: dict[str, dict]  # reference id → analysis row
    short: dict[str, str]  # reference id → short citation id
    groups: list[tuple[str, list[str]]]  # (cluster name, member ids, best first)
    long: dict[str, str] = field(default_factory=dict)  # short id → reference id

    def __post_init__(self):
        self.long = {s: r for r, s in self.short.items()}


# ---------- job entry ----------

def run_spec_job(settings: Settings, db: Supabase, user_id: str, board_id: str, params: dict) -> None:
    board = load_board(db, user_id, board_id, params.get("cluster_ids") or [])
    if not board.refs:
        raise RuntimeError("board has no references")
    section = params.get("section")
    if section:
        current = latest_spec(db, board_id)
        if not current:
            section = None  # nothing to patch yet: generate the whole document
    if section:
        body, model = _with_fallback(settings, lambda m: regenerate_section(settings, board, current["markdown"], section, m))
        if body is None:
            raise RuntimeError("section regeneration failed: no LLM available")
        markdown = replace_section(current["markdown"], TITLE[section], clean_body(body, board, TITLE[section]))
        kind, extra = "section", {"section": section}
    else:
        sections, model = _with_fallback(settings, lambda m: generate_sections(settings, db, board, m))
        if sections is None:
            sections, model, kind = draft_sections(board), "draft-v1", "draft"
        else:
            kind = "generated"
        markdown = assemble(board, {k: clean_body(v, board, TITLE[k]) for k, v in sections.items()})
        extra = {}
    markdown = with_reference_map(markdown, board)
    save_version(db, user_id, board_id, markdown, kind, {
        **extra, "model": model, "cluster_ids": params.get("cluster_ids") or [],
        "cited": sorted({board.long[s] for s in CITE.findall(markdown) if s in board.long}),
    })


def _with_fallback(settings: Settings, call):
    """Main model, then the cheaper one (separate quota), then None (caller decides)."""
    if not settings.provider:
        return None, None
    tried = []
    for model in dict.fromkeys([model_for(settings, "spec"), model_for(settings, "analysis")]):
        try:
            return call(model), model
        except Exception as err:  # noqa: BLE001 - quota/outage: try the next model
            tried.append(f"{model}: {str(err)[:160]}")
            log.warning("spec generation with %s failed: %s", model, str(err)[:300])
    log.warning("all models failed: %s", tried)
    return None, None


# ---------- data ----------

def load_board(db: Supabase, user_id: str, board_id: str, cluster_ids: list[str]) -> Board:
    board = db.select("boards", {"id": f"eq.{board_id}", "user_id": f"eq.{user_id}", "select": "id,name"})[0]
    clusters = db.select("clusters", {"board_id": f"eq.{board_id}", "select": "id,name,status,source,cluster_members(reference_id,score)"})
    if cluster_ids:
        chosen = [c for c in clusters if c["id"] in cluster_ids]
    else:
        chosen = [c for c in clusters if c["status"] == "accepted" or c["source"] == "user"] or \
                 [c for c in clusters if c["status"] == "suggested"]
    groups = [(c["name"], [m["reference_id"] for m in sorted(c["cluster_members"], key=lambda m: -m["score"])]) for c in chosen]

    on_board = [i["reference_id"] for i in db.select("board_items", {"board_id": f"eq.{board_id}", "select": "reference_id"})]
    ids = sorted({r for _, members in groups for r in members}) if cluster_ids else on_board
    if not groups:
        groups = [("Whole board", ids)]
    refs = {r["id"]: r for r in db.select("references", {"id": in_list(ids), "select": "id,type,title,source_url,page_url,thumbnail_path,file_path,note,labels"})} if ids else {}
    analyses = {a["reference_id"]: a for a in db.select("analyses", {"reference_id": in_list(ids), "select": "*"})} if ids else {}
    groups = [(name, [m for m in members if m in refs]) for name, members in groups]
    return Board(id=board_id, name=board["name"], refs=refs, analyses=analyses, short=short_ids(list(refs)), groups=groups)


def short_ids(ids: list[str]) -> dict[str, str]:
    """Shortest unique hex prefix (min 6) per reference, for readable citations."""
    for n in range(6, 13):
        short = {i: i.replace("-", "")[:n] for i in ids}
        if len(set(short.values())) == len(ids):
            return short
    return {i: i.replace("-", "")[:12] for i in ids}


def latest_spec(db: Supabase, board_id: str) -> dict | None:
    rows = db.select("design_specs", {"board_id": f"eq.{board_id}", "select": "version,markdown", "order": "version.desc", "limit": "1"})
    return rows[0] if rows else None


def save_version(db: Supabase, user_id: str, board_id: str, markdown: str, kind: str, sources: dict) -> int:
    for _ in range(3):  # another writer may take the same version number: retry
        current = latest_spec(db, board_id)
        version = (current["version"] if current else 0) + 1
        try:
            db.insert("design_specs", {"board_id": board_id, "user_id": user_id, "version": version,
                                       "markdown": markdown, "kind": kind, "sources": sources})
            return version
        except RuntimeError as err:
            if "23505" not in str(err):
                raise
    raise RuntimeError("could not save spec version")


# ---------- aggregation (in code, exact) ----------

def aggregate(board: Board) -> dict:
    """Palette by weighted k-means over every analysed palette, plus frequency counts with citations."""
    colours, weights, owners = [], [], []
    for ref_id, a in board.analyses.items():
        for rank, hex_ in enumerate(a.get("palette") or []):
            colours.append([int(hex_[i:i + 2], 16) for i in (1, 3, 5)])
            weights.append(1 / (rank + 1))
            owners.append(ref_id)
    palette = []
    if colours:
        x = np.array(colours, dtype=float)
        k = min(8, len({tuple(c) for c in colours}))
        model = KMeans(n_clusters=k, n_init=4, random_state=0).fit(x, sample_weight=weights)
        total = sum(weights)
        for label in range(k):
            idx = [i for i, lab in enumerate(model.labels_) if lab == label]
            share = sum(weights[i] for i in idx) / total
            refs = sorted({board.short[owners[i]] for i in idx})
            palette.append({"hex": to_hex(model.cluster_centers_[label]), "share": round(share, 3), "refs": refs})
        palette.sort(key=lambda p: -p["share"])

    def counted(column: str, limit: int = 12):
        counts, where = Counter(), {}
        for ref_id, a in board.analyses.items():
            for value in dict.fromkeys(a.get(column) or []):
                counts[value] += 1
                where.setdefault(value, []).append(board.short[ref_id])
        return [{"value": v, "count": c, "refs": where[v][:6]} for v, c in counts.most_common(limit)]

    return {"palette": palette, "fonts": counted("fonts"), "components": counted("components"),
            "effects": counted("effects"), "tags": counted("tags", 15), "mood": counted("mood", 8)}


def reference_lines(board: Board, ids: list[str] | None = None, budget: int | None = None) -> str:
    """One line per reference, best-scoring cluster members first. With a character budget,
    stops when it's used up; the aggregates still cover every reference."""
    ordered = ids or list(dict.fromkeys([r for _, members in board.groups for r in members] + list(board.refs)))
    lines: list[str] = []
    used = 0
    for n, ref_id in enumerate(ordered):
        line = _reference_line(board, ref_id)
        if budget is not None and used + len(line) > budget and lines:
            lines.append(f"(+{len(ordered) - n} more references not listed; their colours, fonts and components are in the aggregates)")
            break
        lines.append(line)
        used += len(line) + 1
    return "\n".join(lines)


def _reference_line(board: Board, ref_id: str) -> str:
    r, a = board.refs[ref_id], board.analyses.get(ref_id) or {}
    obs, inf = a.get("observed") or {}, a.get("inferred") or {}
    parts = [f"[ref:{board.short[ref_id]}] {r['type']}: {r.get('title') or 'untitled'}"]
    for label, value in [("caption", a.get("caption")), ("tags", a.get("tags")), ("palette", a.get("palette")),
                         ("typography (observed)", obs.get("typography")), ("layout (observed)", obs.get("layout")),
                         ("components", a.get("components")), ("effects", a.get("effects")),
                         ("fonts (inferred)", inf.get("font_guesses")), ("motion (inferred)", inf.get("motion_hints")),
                         ("user note", r.get("note")), ("labels", r.get("labels"))]:
        if value:
            parts.append(f"{label}: {', '.join(value) if isinstance(value, list) else value}")
    return " · ".join(parts)[:900]


# ---------- LLM steps ----------

def generate_sections(settings: Settings, db: Supabase, board: Board, model: str) -> dict[str, str]:
    agg = aggregate(board)
    budget = prompt_budget(settings)
    briefs = ""
    if len(board.groups) > 1:  # map: one brief per cluster
        out = []
        for name, members in board.groups:
            brief = structured(settings, "spec", SYSTEM, f"Cluster “{name}” on board “{board.name}”.\n\nReferences:\n"
                               f"{reference_lines(board, members, budget)}\n\nWrite the brief.", ClusterBrief, model=model)
            out.append(f"### {name}\n" + "\n".join(f"- {k}: {v}" for k, v in brief.model_dump().items()))
        briefs = "Cluster briefs:\n" + "\n\n".join(out) + "\n\n"
    prompt = (
        f"Board: “{board.name}” — {len(board.refs)} references in {len(board.groups)} group(s): "
        f"{', '.join(n for n, _ in board.groups)}.\n\n"
        f"Measured aggregates (exact, from pixels and analyses):\n{json.dumps(agg, separators=(',', ':'))}\n\n{briefs}"
        f"References:\n{reference_lines(board, budget=budget)}\n\n"
        f"The attached images are key references: {', '.join(f'[ref:{board.short[r]}]' for r in key_images(board))}.\n"
        "Write every section of design.md."
    )
    result = structured(settings, "spec", SYSTEM, prompt, SpecSections, images=load_images(db, board), model=model)
    return result.model_dump()


def regenerate_section(settings: Settings, board: Board, current_markdown: str, section: str, model: str) -> str:
    key, title, hint = next(s for s in SECTIONS if s[0] == section)
    budget = prompt_budget(settings)  # the current document shares the budget with the references
    prompt = (
        f"Board: “{board.name}”. Measured aggregates:\n{json.dumps(aggregate(board), separators=(',', ':'))}\n\n"
        f"References:\n{reference_lines(board, budget=budget // 2)}\n\n"
        f"Current design.md (the user may have edited it — stay consistent with it):\n{current_markdown[:budget]}\n\n"
        f"Rewrite only the section “{title}”. {hint}"
    )
    return structured(settings, "spec", SYSTEM, prompt, SectionText, model=model).markdown


def key_images(board: Board) -> list[str]:
    """Best-scoring member of each group first, then the next best, up to MAX_IMAGES."""
    picks: list[str] = []
    for depth in range(MAX_IMAGES):
        for _, members in board.groups:
            if depth < len(members) and members[depth] not in picks and board.refs[members[depth]].get("thumbnail_path"):
                picks.append(members[depth])
            if len(picks) == MAX_IMAGES:
                return picks
    return picks


def load_images(db: Supabase, board: Board) -> list[Image.Image]:
    images = []
    for ref_id in key_images(board):
        try:
            img = Image.open(io.BytesIO(db.download(board.refs[ref_id]["thumbnail_path"])))
            img.load()
            images.append(img)
        except Exception:  # noqa: BLE001 - a missing image just means one fewer key reference
            continue
    return images


# ---------- fallback draft (no LLM) ----------

def draft_sections(board: Board) -> dict[str, str]:
    """Built only from stored analyses: less prose, but every value is real and cited."""
    agg = aggregate(board)
    cite = lambda refs: " ".join(f"[ref:{r}]" for r in refs[:4])  # noqa: E731
    rows = lambda items: "\n".join(f"- {i['value']} ({i['count']}×) {cite(i['refs'])}" for i in items) or "- Not enough data yet."  # noqa: E731
    roles = ["Primary", "Secondary", "Accent", "Background", "Surface", "Muted", "Highlight", "Extra"]
    palette = "| Role | Hex | Share | References |\n|---|---|---|---|\n" + "\n".join(
        f"| {roles[i]} | `{p['hex']}` | {p['share']:.0%} | {cite(p['refs'])} |" for i, p in enumerate(agg["palette"]))
    tokens = "\n".join(f"  --color-{roles[i].lower()}: {p['hex']};" for i, p in enumerate(agg["palette"]))
    fonts = [f["value"] for f in agg["fonts"][:2]] or ["Inter"]
    note = "_Draft built from stored analyses without an AI model; regenerate when a model is available._\n\n"
    layout = "\n".join(f"- {a['layout_notes']} [ref:{board.short[r]}]" for r, a in board.analyses.items() if a.get("layout_notes"))
    return {
        "direction": note + "**Inferred** from analysis tags and mood:\n" + rows(agg["tags"][:8] + agg["mood"][:4]),
        "palette": "**Observed** — measured from pixels across the references.\n\n" + palette,
        "typography": "**Inferred** font matches from the analyses:\n" + rows(agg["fonts"]),
        "layout": "**Observed** layout notes:\n" + (layout[:3000] or "- Not enough data yet."),
        "components": "**Observed** components:\n" + rows(agg["components"]),
        "effects": "**Observed** effects:\n" + rows(agg["effects"]),
        "motion": "**Inferred**: no motion data in a draft; regenerate with a model.",
        "responsive": "**Inferred**: mobile-first; stack multi-column layouts below 768px.",
        "implementation": f"```css\n:root {{\n{tokens}\n  --font-display: '{fonts[0]}', system-ui, sans-serif;\n"
                          f"  --font-body: '{fonts[-1]}', system-ui, sans-serif;\n}}\n```",
    }


# ---------- markdown assembly ----------

def assemble(board: Board, sections: dict[str, str]) -> str:
    date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    head = (f"# design.md — {board.name}\n\n> Generated by JUSTCREATE on {date} from {len(board.refs)} references "
            f"({', '.join(n for n, _ in board.groups)}). **Observed** = visible in the references · **Inferred** = estimated. "
            "Citations like [ref:xxxxxx] point to the reference map.\n")
    body = "\n".join(f"\n## {n}. {title}\n\n{sections.get(key, '').strip()}\n" for n, (key, title, _) in enumerate(SECTIONS, 1))
    return head + body


def split_sections(markdown: str) -> tuple[str, list[tuple[str, str]]]:
    """(preamble, [(title, body)]) by `## n. Title` headings."""
    matches = list(HEADING.finditer(markdown))
    if not matches:
        return markdown, []
    parts = [(m.group(1), markdown[m.end():matches[i + 1].start() if i + 1 < len(matches) else len(markdown)])
             for i, m in enumerate(matches)]
    return markdown[:matches[0].start()], parts


def replace_section(markdown: str, title: str, body: str) -> str:
    preamble, parts = split_sections(markdown)
    if not any(t == title for t, _ in parts):
        parts.append((title, ""))
    return _join(preamble, [(t, f"\n\n{body.strip()}\n" if t == title else b) for t, b in parts])


def with_reference_map(markdown: str, board: Board) -> str:
    preamble, parts = split_sections(markdown)
    parts = [(t, b) for t, b in parts if t != REF_MAP]
    cited_in: dict[str, list[int]] = {}
    for n, (_, b) in enumerate(parts, 1):
        for s in CITE.findall(b):
            cited_in.setdefault(s, []).append(n)
    rows = []
    for ref_id, r in board.refs.items():
        s = board.short[ref_id]
        link = r.get("source_url") or r.get("page_url")
        title = (r.get("title") or "untitled").replace("|", "/")[:80]
        where = ", ".join(f"§{n}" for n in sorted(set(cited_in.get(s, [])))) or "—"
        rows.append(f"| {s} | {title} | {r['type']} | {where} | {f'[source]({link})' if link else '—'} |")
    table = "\n\n| Ref | Title | Type | Cited in | Source |\n|---|---|---|---|---|\n" + "\n".join(rows) + "\n"
    return _join(preamble, parts + [(REF_MAP, table)])


def clean_body(text: str, board: Board, title: str | None = None) -> str:
    """Model output for one section: drop a repeated section heading, demote any `#`/`##` headings so
    they can't split the document, and drop citations to ids that aren't on this board."""
    lead = LEADING_HEADING.match(text)
    if lead:
        level, words = re.match(r"\s*(#+) (?:\d+\.\s*)?(.*)", lead.group(0)).groups()
        if len(level) <= 2 or (title and words.strip().lower() == title.lower()):
            text = text[lead.end():]
    text = TOP_HEADINGS.sub("### ", text)
    text = CITE_GROUP.sub(lambda m: " ".join(f"[ref:{i}]" for i in re.findall(r"[0-9a-f]{6,12}", m.group(1))), text)
    return CITE.sub(lambda m: m.group(0) if m.group(1) in board.long else "", text).strip()


def _join(preamble: str, parts: list[tuple[str, str]]) -> str:
    """One blank line around every heading, however many the bodies carried in."""
    return preamble.rstrip() + "\n" + "".join(f"\n## {n}. {t}\n\n{b.strip()}\n"
                                               for n, (t, b) in enumerate(parts, 1)).rstrip() + "\n"
