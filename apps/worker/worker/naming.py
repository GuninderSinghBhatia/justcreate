"""Names and one-line summaries for suggested clusters, from their members' tags and captions."""

from __future__ import annotations

import logging

from pydantic import BaseModel, Field

from .cluster import fallback_name
from .config import Settings
from .llm import structured

log = logging.getLogger(__name__)


class ClusterName(BaseModel):
    index: int = Field(description="The cluster's index from the input")
    name: str = Field(description="2-4 word title-case name, e.g. 'Neon Color Palettes', 'Dark Dashboards'")
    summary: str = Field(description="One sentence on what the references share visually")


class ClusterNames(BaseModel):
    clusters: list[ClusterName]


SYSTEM = (
    "You name groups of saved design references for a moodboard tool. Each name says what visually unites "
    "the group (style, palette, layout, component or motion), not the subject matter or the source site. "
    "Names in one board must be distinct from each other and from the existing cluster names you are given."
)


def name_clusters(settings: Settings, groups: list[dict], existing_names: list[str]) -> list[tuple[str, str | None]]:
    """`groups`: [{"tags": [[...], ...], "captions": [...]}]. Returns (name, summary) per group."""
    if not groups:
        return []
    if not settings.provider:
        return [(fallback_name(g["tags"]), None) for g in groups]

    lines = []
    for i, g in enumerate(groups):
        tags = sorted({t for ts in g["tags"] for t in ts})[:40]
        captions = "; ".join(c for c in g["captions"][:12] if c)
        lines.append(f"Cluster {i}: tags = {', '.join(tags)} | captions = {captions}")
    prompt = "Existing cluster names (do not reuse): " + (", ".join(existing_names) or "none") + "\n\n" + "\n".join(lines)

    try:
        parsed = structured(settings, "naming", SYSTEM, prompt, ClusterNames)
        by_index = {c.index: (c.name.strip(), c.summary.strip()) for c in parsed.clusters}
    except Exception as err:  # noqa: BLE001 - naming is cosmetic: fall back to tag names
        log.warning("cluster naming failed, using tag names: %s", err)
        by_index = {}
    return [by_index.get(i) or (fallback_name(g["tags"]), None) for i, g in enumerate(groups)]
