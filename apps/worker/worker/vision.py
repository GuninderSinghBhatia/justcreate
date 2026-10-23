"""Per-reference analysis with a vision LLM, returning a fixed schema.

`observed` holds what is visible in the image; `inferred` holds guesses (font names, motion,
intent). design.md generation (Phase 4) relies on keeping the two apart.
"""

from __future__ import annotations

import re
from typing import Any

from PIL import Image
from pydantic import BaseModel, Field

from .config import Settings
from .llm import structured


class Observed(BaseModel):
    """Directly visible in the image."""

    colors: list[str] = Field(description="Dominant colours as hex codes, most prominent first")
    typography: list[str] = Field(description="Visible type treatments, e.g. 'bold condensed sans headline', 'monospace labels'")
    layout: str = Field(description="Composition and grid as seen: columns, alignment, spacing, hierarchy")
    components: list[str] = Field(description="UI components present, e.g. 'navbar', 'card', 'pill button'")
    effects: list[str] = Field(description="Visual effects present, e.g. 'glassmorphism', 'grain', 'glow', 'gradient mesh'")


class Inferred(BaseModel):
    """Estimated, not directly visible."""

    font_guesses: list[str] = Field(description="Likely font families or close matches")
    motion_hints: list[str] = Field(description="Likely animation or interaction patterns suggested by the design")
    purpose: str = Field(description="What the design is probably for")


class ReferenceAnalysis(BaseModel):
    caption: str = Field(description="One sentence describing the reference")
    summary: str = Field(description="2-3 sentences on the visual style and why it is distinctive")
    style_tags: list[str] = Field(description="5-10 short lowercase style tags, e.g. 'dark ui', 'neon', 'brutalist', 'editorial'")
    mood: list[str] = Field(description="2-4 mood words")
    observed: Observed
    inferred: Inferred


SYSTEM = (
    "You analyse saved design references (websites, UI screenshots, images, video thumbnails, social posts) "
    "for a designer's moodboard tool. Describe the visual design itself, specifically and concretely, so similar "
    "references can be grouped and the style can later be rebuilt. Put only what is visible under `observed`; "
    "put guesses under `inferred`. Tags are short, lowercase and reusable across references."
)


def analyze_with_llm(settings: Settings, image: Image.Image | None, context: dict[str, Any]) -> ReferenceAnalysis:
    return structured(settings, "analysis", SYSTEM, _context_text(context), ReferenceAnalysis,
                      [image] if image is not None else None)


HEURISTIC_VERSION = "heuristic-v1"


def analyze_heuristic(palette: list[str], context: dict[str, Any]) -> ReferenceAnalysis:
    """Keyless fallback: tags from the reference's own metadata and palette, so the pipeline
    (embeddings, clustering, UI) still works before an API key is added. Clearly weaker."""
    title = context.get("title") or ""
    host = context.get("host") or ""
    words = [w.lower() for w in re.findall(r"[A-Za-z][A-Za-z-]{2,}", title) if w.lower() not in _STOP][:6]
    tone = _tone(palette)
    tags = list(dict.fromkeys([context.get("type", "image"), *tone, *([host] if host else []), *words]))[:10]
    return ReferenceAnalysis(
        caption=title or f"Saved {context.get('type', 'reference')}",
        summary="Automatic tags from metadata and colours (no AI key configured).",
        style_tags=tags,
        mood=tone[:2],
        observed=Observed(colors=palette, typography=[], layout="", components=[], effects=[]),
        inferred=Inferred(font_guesses=[], motion_hints=[], purpose=""),
    )


def _tone(palette: list[str]) -> list[str]:
    if not palette:
        return []
    rgb = [tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) for h in palette[:3]]
    light = sum(0.2126 * r + 0.7152 * g + 0.0722 * b for r, g, b in rgb) / len(rgb)
    sat = sum((max(c) - min(c)) / 255 for c in rgb) / len(rgb)
    tags = ["dark" if light < 90 else "light" if light > 180 else "mid-tone"]
    tags.append("vivid" if sat > 0.55 else "muted" if sat < 0.2 else "balanced colour")
    return tags


_STOP = {"the", "and", "for", "with", "from", "this", "that", "your", "you", "are", "com", "www", "http", "https"}


def _context_text(context: dict[str, Any]) -> str:
    lines = [f"Reference type: {context.get('type')}"]
    for key in ("title", "host", "note", "text", "channel", "author"):
        if context.get(key):
            lines.append(f"{key.capitalize()}: {str(context[key])[:500]}")
    if context.get("palette"):
        lines.append(f"Measured palette (exact, from pixels): {', '.join(context['palette'])}")
    lines.append("Analyse this reference.")
    return "\n".join(lines)

