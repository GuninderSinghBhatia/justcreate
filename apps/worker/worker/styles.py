"""Design-style taxonomy and zero-shot style scoring.

Each reference gets a score per named style (ASCII art, brutalism, neo-brutalism, glassmorphism…)
from three signals: CLIP zero-shot on the image (style prompts embedded in CLIP's shared
image-text space, several phrasings each), the same on its caption embedding, and the style
words its analysis already used (tags, caption, effects, and the model's own pick of styles from
this list). Boards are then clustered by style first (cluster.py), so a group is "Neo-brutalism",
not "these five look alike".

Scoring is pure (vectors in, scores out) so it can be tested without the model.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class Style:
    key: str
    name: str
    look: str  # what it looks like, for CLIP prompts and the naming summary
    aliases: tuple[str, ...]  # words in tags/captions that name it


STYLES: tuple[Style, ...] = (
    Style("ascii-art", "ASCII Art", "pictures and layouts made of monospace text characters, symbols and terminal glyphs",
          ("ascii", "ascii art", "ascii-art", "text art", "character art", "ansi art")),
    Style("pixel-art", "Pixel Art", "low-resolution pixel illustrations with visible square pixels and limited colour palette",
          ("pixel art", "pixel-art", "pixelated", "8-bit", "16-bit", "low-res", "sprite")),
    Style("dithering", "Dithering & Halftone", "images rendered with dither patterns, halftone dots or 1-bit black and white noise",
          ("dither", "dithering", "dithered", "halftone", "1-bit", "bitmap")),
    Style("brutalism", "Brutalism", "raw unstyled web design: default system fonts, harsh grids, plain links, exposed structure, deliberately ugly",
          ("brutalism", "brutalist", "brutal", "raw html", "anti-design", "web brutalism")),
    Style("neo-brutalism", "Neo-Brutalism", "thick black outlines, hard offset drop shadows, flat saturated colours, chunky rounded buttons",
          ("neo-brutalism", "neobrutalism", "neo brutalism", "neubrutalism", "neo-brutalist", "hard shadow", "thick outlines")),
    Style("swiss", "Swiss / International", "strict modular grid, flush-left grotesk type, asymmetric layout, lots of white space, objective",
          ("swiss", "swiss style", "international typographic", "grid-based", "helvetica", "modernist")),
    Style("minimalism", "Minimalism", "very few elements, generous white space, restrained neutral palette, clean thin typography",
          ("minimal", "minimalist", "minimalism", "clean", "whitespace", "simple")),
    Style("maximalism", "Maximalism", "dense, loud, layered composition with clashing colours, many patterns and oversized type",
          ("maximalism", "maximalist", "loud", "busy", "clashing colors")),
    Style("editorial", "Editorial", "magazine-like layout with large serif headlines, columns of text, pull quotes and photography",
          ("editorial", "magazine", "serif headline", "print-inspired", "newspaper", "publication")),
    Style("bento", "Bento Grid", "dashboard of rounded rectangular tiles of different sizes arranged like a bento box",
          ("bento", "bento grid", "bento-grid", "tile grid", "card grid")),
    Style("glassmorphism", "Glassmorphism", "frosted translucent glass panels with background blur over colourful gradients",
          ("glassmorphism", "glass", "frosted", "frosted glass", "backdrop blur", "translucent")),
    Style("neumorphism", "Neumorphism", "soft extruded plastic UI with light and dark inner and outer shadows on a single pastel colour",
          ("neumorphism", "neumorphic", "soft ui", "soft shadows", "extruded")),
    Style("claymorphism", "Claymorphism", "puffy inflated 3D clay shapes with soft rounded forms and pastel colours",
          ("claymorphism", "clay", "inflated", "puffy 3d")),
    Style("skeuomorphism", "Skeuomorphism", "realistic textures and materials imitating physical objects: leather, metal, paper, knobs",
          ("skeuomorphism", "skeuomorphic", "realistic texture", "leather", "brushed metal")),
    Style("flat", "Flat Design", "flat solid colours, simple geometric icons, no gradients or shadows",
          ("flat design", "flat", "flat ui", "flat colors", "solid colors")),
    Style("material", "Material Design", "Google material: cards with elevation shadows, floating action buttons, bold primary colours",
          ("material design", "material", "material ui", "elevation")),
    Style("corporate-saas", "Clean SaaS", "polished startup landing page: hero headline, product screenshot, soft gradients, sans-serif, CTA buttons",
          ("saas", "landing page", "startup", "product page", "corporate", "b2b", "clean ui")),
    Style("dark-dashboard", "Dark Dashboard UI", "dark mode app interface with data panels, charts, sidebars and small sans-serif labels",
          ("dashboard", "dark ui", "dark mode", "dark-ui", "admin panel", "analytics")),
    Style("terminal", "Terminal / Hacker UI", "command-line look: monospace green or amber text on black, prompts, code, CRT scanlines",
          ("terminal", "command line", "cli", "hacker", "monospace", "crt", "console", "code editor")),
    Style("retro-os", "Retro OS / Windows 95", "old desktop operating system UI: grey bevelled windows, title bars, pixel icons, dialog boxes",
          ("windows 95", "win95", "retro os", "retro computing", "retro-computing", "mac os 9", "desktop ui", "bevel", "vintage os")),
    Style("y2k", "Y2K", "late-90s/2000s futurism: chrome, iridescent bubbles, holographic gradients, techno fonts",
          ("y2k", "chrome", "iridescent", "holographic", "2000s", "millennium")),
    Style("vaporwave", "Vaporwave", "pastel pink and cyan, sunsets, greek statues, palm trees, 80s grids, glitchy nostalgia",
          ("vaporwave", "synthwave", "outrun", "retrowave", "80s")),
    Style("cyberpunk", "Cyberpunk / Neon", "dark backgrounds with neon magenta and cyan glow, futuristic HUD, high-tech dystopian",
          ("cyberpunk", "neon", "glow", "futuristic", "sci-fi", "hud")),
    Style("glitch", "Glitch Art", "corrupted digital images: RGB channel shifts, scan lines, pixel sorting, distortion",
          ("glitch", "glitch art", "glitchy", "distortion", "datamosh", "rgb split", "pixel sorting")),
    Style("grunge", "Grunge", "dirty textures, distressed type, photocopy grain, torn paper, punk zine energy",
          ("grunge", "distressed", "grainy", "grain", "gritty", "zine", "punk", "photocopy")),
    Style("collage", "Collage / Scrapbook", "cut-out photos, stickers, tape and paper scraps layered in a scrapbook collage",
          ("collage", "scrapbook", "cut-out", "cutout", "mixed media", "stickers")),
    Style("memphis", "Memphis", "80s Memphis design: squiggles, confetti, bold geometric shapes and clashing bright colours",
          ("memphis", "squiggle", "confetti", "geometric shapes")),
    Style("bauhaus", "Bauhaus", "primary colours, circles squares and triangles, geometric sans type, constructivist composition",
          ("bauhaus", "constructivist", "constructivism", "primary colors", "geometric")),
    Style("art-deco", "Art Deco", "gold and black, symmetric geometric ornament, fan motifs, elegant tall display type",
          ("art deco", "art-deco", "gatsby", "ornamental", "gold")),
    Style("hand-drawn", "Hand-Drawn / Sketch", "sketchy hand-drawn lines, doodles, handwritten fonts, marker and pencil textures",
          ("hand-drawn", "hand drawn", "sketch", "sketchy", "doodle", "handwritten", "illustrated")),
    Style("illustration", "Flat Illustration", "friendly vector characters and scenes in flat colours, used as hero art",
          ("illustration", "illustrative", "vector illustration", "character illustration", "mascot")),
    Style("3d-render", "3D Render", "glossy 3D rendered objects and scenes, soft studio lighting, depth",
          ("3d", "3d render", "render", "isometric", "blender", "cgi")),
    Style("isometric", "Isometric", "isometric 3/4 view illustrations of rooms, buildings or devices on a grid",
          ("isometric", "isometric illustration", "axonometric")),
    Style("gradient", "Gradient / Aurora", "soft blurred mesh gradients and aurora glows as the main visual",
          ("gradient", "mesh gradient", "aurora", "gradients", "blurred gradient", "color gradient")),
    Style("monochrome", "Monochrome", "single-colour or black-and-white design with no accent colour",
          ("monochrome", "black and white", "black-and-white", "grayscale", "greyscale", "b&w")),
    Style("organic", "Organic / Earthy", "natural textures, earthy beige and green tones, rounded organic blobs, calm",
          ("organic", "earthy", "natural", "botanical", "blob", "warm neutrals")),
    Style("luxury", "Luxury / Premium", "dark or cream backgrounds, thin elegant serif type, lots of space, gold accents, high-end",
          ("luxury", "premium", "elegant", "high-end", "sophisticated")),
    Style("kinetic-type", "Bold Typography", "giant expressive type as the main visual, oversized headlines, type-only posters",
          ("typographic", "typography-led", "big type", "bold typography", "kinetic type", "oversized type", "poster")),
    Style("photography", "Photo-Led", "full-bleed photography dominates the design, minimal UI on top",
          ("photography", "photo", "full-bleed", "photographic", "image-led")),
    Style("masonry", "Masonry / Pinterest Feed", "staggered masonry grid of image cards of varying heights, like a Pinterest feed",
          ("masonry", "pinterest", "feed", "image grid", "gallery")),
)
BY_KEY = {s.key: s for s in STYLES}
STYLE_NAMES = tuple(s.name for s in STYLES)  # the choices offered to the vision model

TEMPLATES = (
    "a {name} design",
    "a website designed in the {name} style",
    "{name}: {look}",
    "an interface with {look}",
)
CLIP_SCALE = 100.0  # CLIP's learned logit scale: turns cosine similarities into a softmax
# Weights of the three signals in a reference's style score.
W_IMAGE, W_TEXT, W_WORDS = 0.45, 0.2, 0.35


def prompts(style: Style) -> list[str]:
    return [t.format(name=style.name.split(" /")[0].lower(), look=style.look) for t in TEMPLATES]


def style_text_matrix(embed_text) -> np.ndarray:
    """(styles × dim): the mean of each style's prompt embeddings, normalised (prompt ensembling)."""
    rows = []
    for s in STYLES:
        v = np.mean([_unit(embed_text(p)) for p in prompts(s)], axis=0)
        rows.append(_unit(v))
    return np.array(rows)


def word_scores(texts: list[str], picked: list[list[str]] | None = None) -> np.ndarray:
    """(refs × styles) in 0..1: which styles a reference's own words name. `texts` are its tags,
    caption and effects joined; `picked` are style names the vision model chose from STYLE_NAMES."""
    out = np.zeros((len(texts), len(STYLES)))
    names = {s.name.lower(): j for j, s in enumerate(STYLES)}
    for i, text in enumerate(texts):
        t = " " + re.sub(r"[^a-z0-9&+ -]+", " ", text.lower()) + " "
        for j, s in enumerate(STYLES):
            hits = sum(1 for a in s.aliases if f" {a} " in t or f" {a}s " in t)
            if hits:
                out[i, j] = min(1.0, 0.5 + 0.25 * hits)
        for name in (picked[i] if picked else []):
            j = names.get(name.strip().lower())
            if j is not None:
                out[i, j] = 1.0  # the model said so, from the list
    return out


def style_scores(images: list[np.ndarray | None], texts: list[np.ndarray | None], words: np.ndarray,
                 style_matrix: np.ndarray) -> np.ndarray:
    """(refs × styles) probabilities: zero-shot CLIP on image and caption embeddings plus named words."""
    n, k = len(images), len(STYLES)
    total = np.zeros((n, k))
    weight = np.zeros(n)
    for vectors, w in ((images, W_IMAGE), (texts, W_TEXT)):
        for i, v in enumerate(vectors):
            if v is None:
                continue
            total[i] += w * _softmax(CLIP_SCALE * (style_matrix @ _unit(v)))
            weight[i] += w
    has_words = words.sum(axis=1) > 0
    total[has_words] += W_WORDS * words[has_words] / words[has_words].sum(axis=1, keepdims=True)
    weight[has_words] += W_WORDS
    return np.divide(total, weight[:, None], out=np.full((n, k), 1 / k), where=weight[:, None] > 0)


@dataclass
class StyleCall:
    key: str
    score: float


def assign(scores: np.ndarray, min_score: float = 0.22, second_ratio: float = 0.6) -> list[list[StyleCall]]:
    """Each reference's confident styles, best first: the top style when it clears `min_score`, and a
    second when it is close behind (a neo-brutalist landing page can also be Clean SaaS)."""
    calls = []
    for row in scores:
        order = np.argsort(-row)
        top, second = order[0], order[1]
        picks = []
        if row[top] >= min_score:
            picks.append(StyleCall(STYLES[top].key, float(row[top])))
            if row[second] >= max(min_score * 0.8, second_ratio * row[top]):
                picks.append(StyleCall(STYLES[second].key, float(row[second])))
        calls.append(picks)
    return calls


def _softmax(x: np.ndarray) -> np.ndarray:
    e = np.exp(x - x.max())
    return e / e.sum()


def _unit(v: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(v)
    return v / norm if norm else v
