"""Board clustering: HDBSCAN over a blended similarity (image, caption and rare-tag overlap),
plus soft multi-membership.

Pure functions (no I/O) so they can be tested on synthetic data.
"""

from __future__ import annotations

import math
from collections import Counter
from dataclasses import dataclass, field

import numpy as np
from sklearn.cluster import HDBSCAN

IMAGE_WEIGHT = 0.6  # in join_embeddings: image similarity matters a bit more than caption/tag similarity
# Blend for similarity(): what the picture looks like counts most; captions and shared rare tags
# separate references CLIP sees as alike (all-monochrome boards, screenshots of one product).
SIM_WEIGHTS = {"image": 0.55, "text": 0.2, "tags": 0.25}
STRONG_TAG_SHARE = 0.6  # a tag on >= 60% of a cluster's members...
RARE_TAG_SHARE = 0.4  # ...and on < 40% of the board counts as "strong" for multi-membership
REJECTED_OVERLAP = 0.5  # suggestions this similar to a rejected cluster are not shown again
PROTECTED_OVERLAP = 0.6  # ...or to an accepted / user cluster (already covered)
SPLIT_SHARE = 0.45  # a cluster holding more of the board than this is split once, if it splits cleanly


@dataclass
class Suggestion:
    members: dict[str, float]  # reference_id -> similarity to the cluster (0..1)
    core: set[str] = field(default_factory=set)  # members HDBSCAN assigned (before soft membership)


def join_embeddings(image: np.ndarray | None, text: np.ndarray | None, image_weight: float = IMAGE_WEIGHT) -> np.ndarray:
    """Weighted concat of normalised image and text vectors, normalised again."""
    parts = []
    if image is not None:
        parts.append(_unit(image) * np.sqrt(image_weight))
    else:
        parts.append(np.zeros_like(text))
    if text is not None:
        parts.append(_unit(text) * np.sqrt(1 - image_weight))
    else:
        parts.append(np.zeros_like(image))
    return _unit(np.concatenate(parts))


def similarity(images: list[np.ndarray | None], texts: list[np.ndarray | None], tags: list[list[str]]) -> np.ndarray:
    """Pairwise similarity in 0..1, rescaled to this board's own spread.

    Each pair blends what both references have (image, caption embedding, tags weighted by how rare
    they are on the board); a missing part drops out and the rest are reweighted. Pass None / [] for
    a reference whose caption and tags are only a fallback, so it is compared on its picture alone.
    """
    n = len(images)
    parts: list[tuple[str, np.ndarray, np.ndarray]] = []
    for key, vectors in (("image", images), ("text", texts)):
        have = np.array([v is not None for v in vectors])
        if not have.any():
            continue
        dim = next(v for v in vectors if v is not None).shape[0]
        m = np.array([_unit(v) if v is not None else np.zeros(dim) for v in vectors])
        parts.append((key, m @ m.T, np.outer(have, have)))
    has_tags = np.array([bool(ts) for ts in tags])
    parts.append(("tags", tag_similarity(tags), np.outer(has_tags, has_tags)))

    total = np.zeros((n, n))
    weight = np.zeros((n, n))
    for key, part, mask in parts:
        # Each part on its own scale first: CLIP similarities sit high and close together, tag
        # overlap mostly low. Blending raw values would make a pair compared on fewer parts look
        # closer than the rest, and such references would chain unrelated families together.
        total += SIM_WEIGHTS[key] * _rescale(part, mask) * mask
        weight += SIM_WEIGHTS[key] * mask
    s = np.divide(total, weight, out=np.zeros((n, n)), where=weight > 0)
    return _rescale(s)


def tag_similarity(tags: list[list[str]]) -> np.ndarray:
    """Cosine over tag sets with IDF weights: sharing a rare tag means more than sharing a common one."""
    docs = [{t.strip().lower() for t in ts if t and t.strip()} for ts in tags]
    n = len(docs)
    df = Counter(t for d in docs for t in d)
    idf = {t: math.log((1 + n) / (1 + c)) + 1 for t, c in df.items()}
    norms = [math.sqrt(sum(idf[t] ** 2 for t in d)) for d in docs]
    out = np.zeros((n, n))
    for i in range(n):
        for j in range(i, n):
            if docs[i] and docs[j]:
                v = sum(idf[t] ** 2 for t in docs[i] & docs[j]) / (norms[i] * norms[j])
                out[i, j] = out[j, i] = v
    return out


def suggest_clusters(ids: list[str], vectors: np.ndarray, tags: dict[str, list[str]] | None = None,
                     min_cluster_size: int | None = None) -> list[Suggestion]:
    """Clusters plain embedding vectors (cosine), with tags as the soft-membership signal."""
    sim = _rescale(np.clip(np.array([[float(a @ b) for b in vectors] for a in vectors]), -1, 1))
    return suggest_from_similarity(ids, sim, tags, min_cluster_size)


def suggest_from_similarity(ids: list[str], sim: np.ndarray, tags: dict[str, list[str]] | None = None,
                            min_cluster_size: int | None = None) -> list[Suggestion]:
    """Groups references; outliers stay unclustered. A cluster that takes most of the board is split
    once when it splits cleanly. A reference can also join other clusters (up to half the core's
    size, closest first) when it is as close to one as its weakest real member, or shares a strong tag."""
    n = len(ids)
    if n < 4:
        return []
    size = min_cluster_size or default_min_size(n)
    groups = _hdbscan(sim, size)
    split: list[np.ndarray] = []
    for g in groups:
        if len(g) > max(2 * size, SPLIT_SHARE * n):
            parts = _hdbscan(sim[np.ix_(g, g)], size)
            if len(parts) >= 2:
                split.extend(g[p] for p in parts)
                continue
        split.append(g)

    tags = tags or {}
    board_tag_share = _tag_share(ids, tags)
    suggestions: list[Suggestion] = []
    for idx in split:
        closeness = sim[:, idx].mean(axis=1)  # mean similarity to the cluster's members
        core = {ids[i] for i in idx}
        members = {ids[i]: float(closeness[i]) for i in idx}
        weakest = float(closeness[idx].min())
        cluster_tags = _tag_share([ids[i] for i in idx], tags)
        strong = {t for t, share in cluster_tags.items() if share >= STRONG_TAG_SHARE and board_tag_share.get(t, 0) < RARE_TAG_SHARE}
        extra = [i for i, ref in enumerate(ids)
                 if ref not in members and (closeness[i] >= weakest or strong.intersection(tags.get(ref, [])))]
        # Closest first, and at most half as many as the core: a small cluster must not absorb the board.
        for i in sorted(extra, key=lambda i: -closeness[i])[:max(1, len(idx) // 2)]:
            members[ids[i]] = float(closeness[i])
        suggestions.append(Suggestion(members=members, core=core))

    suggestions.sort(key=lambda s: -len(s.members))
    return suggestions


@dataclass
class StyleGroup:
    style: str  # styles.STYLES key
    suggestion: Suggestion


def style_groups(ids: list[str], calls: list[list[tuple[str, float]]], min_size: int = 2) -> list[StyleGroup]:
    """References grouped by named design style: a reference's top style makes it a core member,
    a close second style a soft one. Styles with fewer than `min_size` references (or no core
    member) don't make a cluster; those references are left for similarity clustering."""
    by_style: dict[str, Suggestion] = {}
    for ref, picks in zip(ids, calls):
        for rank, (key, score) in enumerate(picks):
            s = by_style.setdefault(key, Suggestion(members={}))
            s.members[ref] = score
            if rank == 0:
                s.core.add(ref)
    groups = [StyleGroup(k, s) for k, s in by_style.items() if len(s.members) >= min_size and s.core]
    groups.sort(key=lambda g: (-len(g.suggestion.core), -len(g.suggestion.members)))
    return groups


def default_min_size(n: int) -> int:
    """3 on small boards (a moodboard of 20 has a few small families), growing slowly with size."""
    return max(3, min(8, n // 15 + 2))


def filter_known(suggestions: list[Suggestion], rejected: list[set[str]], protected: list[set[str]]) -> list[Suggestion]:
    """Drops suggestions the user already rejected or already has as an accepted/own cluster."""
    kept = []
    for s in suggestions:
        group = set(s.members)
        if any(jaccard(group, r) >= REJECTED_OVERLAP for r in rejected):
            continue
        if any(jaccard(group, p) >= PROTECTED_OVERLAP for p in protected):
            continue
        kept.append(s)
    return kept


def fallback_name(member_tags: list[list[str]]) -> str:
    """Name from the most common tags, used when no LLM is configured."""
    counts = Counter(t for tags in member_tags for t in dict.fromkeys(tags))
    top = [t for t, _ in counts.most_common(2)]
    return " · ".join(t.title() for t in top) if top else "Untitled cluster"


def jaccard(a: set[str], b: set[str]) -> float:
    return len(a & b) / len(a | b) if a or b else 0.0


def _hdbscan(sim: np.ndarray, size: int) -> list[np.ndarray]:
    if len(sim) < size:
        return []
    dist = np.clip(1 - sim, 0, None)
    np.fill_diagonal(dist, 0)
    labels = HDBSCAN(min_cluster_size=size, min_samples=1, metric="precomputed", copy=True).fit_predict(dist)
    return [np.where(labels == label)[0] for label in sorted(set(labels) - {-1})]


def _rescale(s: np.ndarray, mask: np.ndarray | None = None) -> np.ndarray:
    """Stretch the off-diagonal spread (of the pairs in `mask`) to 0..1, so a board whose
    references are all fairly alike (one palette, one medium) still separates into families."""
    n = len(s)
    if n < 3:
        return s
    iu = np.triu_indices(n, 1)
    off = s[iu] if mask is None else s[iu][mask[iu]]
    if len(off) < 2:
        return s
    lo, hi = np.percentile(off, 5), np.percentile(off, 98)
    out = np.clip((s - lo) / (hi - lo), 0, 1) if hi > lo else np.ones_like(s)
    np.fill_diagonal(out, 1)
    return out


def _tag_share(ids: list[str], tags: dict[str, list[str]]) -> dict[str, float]:
    if not ids:
        return {}
    counts = Counter(t for ref in ids for t in set(tags.get(ref, [])))
    return {t: c / len(ids) for t, c in counts.items()}


def _unit(v: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(v)
    return v / norm if norm else v
