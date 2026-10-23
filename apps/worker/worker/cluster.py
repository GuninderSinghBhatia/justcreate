"""Board clustering: HDBSCAN over joined CLIP embeddings, plus soft multi-membership.

Pure functions (no I/O) so they can be tested on synthetic data.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field

import numpy as np
from sklearn.cluster import HDBSCAN

IMAGE_WEIGHT = 0.6  # image similarity matters a bit more than caption/tag similarity
STRONG_TAG_SHARE = 0.6  # a tag on >= 60% of a cluster's members...
RARE_TAG_SHARE = 0.4  # ...and on < 40% of the board counts as "strong" for multi-membership
REJECTED_OVERLAP = 0.5  # suggestions this similar to a rejected cluster are not shown again
PROTECTED_OVERLAP = 0.6  # ...or to an accepted / user cluster (already covered)


@dataclass
class Suggestion:
    members: dict[str, float]  # reference_id -> similarity to the cluster centre
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


def suggest_clusters(ids: list[str], vectors: np.ndarray, tags: dict[str, list[str]] | None = None,
                     min_cluster_size: int | None = None) -> list[Suggestion]:
    """Groups references; outliers stay unclustered. A reference can join further clusters when
    it is as close to that cluster's centre as its weakest real member, or shares a strong tag."""
    n = len(ids)
    if n < 4:
        return []
    size = min_cluster_size or max(2, min(6, n // 8 + 2))
    labels = HDBSCAN(min_cluster_size=size, metric="euclidean", copy=True).fit_predict(vectors)

    tags = tags or {}
    board_tag_share = _tag_share(ids, tags)
    suggestions: list[Suggestion] = []
    for label in sorted(set(labels) - {-1}):
        idx = np.where(labels == label)[0]
        centre = _unit(vectors[idx].mean(axis=0))
        sims = vectors @ centre
        core = {ids[i] for i in idx}
        members = {ids[i]: float(sims[i]) for i in idx}
        weakest = float(sims[idx].min())

        cluster_tags = _tag_share([ids[i] for i in idx], tags)
        strong = {t for t, share in cluster_tags.items() if share >= STRONG_TAG_SHARE and board_tag_share.get(t, 0) < RARE_TAG_SHARE}
        for i, ref in enumerate(ids):
            if ref in members:
                continue
            if sims[i] >= weakest or strong.intersection(tags.get(ref, [])):
                members[ref] = float(sims[i])
        suggestions.append(Suggestion(members=members, core=core))

    suggestions.sort(key=lambda s: -len(s.members))
    return suggestions


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


def _tag_share(ids: list[str], tags: dict[str, list[str]]) -> dict[str, float]:
    if not ids:
        return {}
    counts = Counter(t for ref in ids for t in set(tags.get(ref, [])))
    return {t: c / len(ids) for t, c in counts.items()}


def _unit(v: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(v)
    return v / norm if norm else v
