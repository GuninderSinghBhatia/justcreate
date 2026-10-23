"""Exact colour palette from pixels (k-means), so hex values don't depend on the LLM's guesses."""

from __future__ import annotations

import numpy as np
from PIL import Image
from sklearn.cluster import KMeans

SAMPLE_SIZE = 96
MIN_SHARE = 0.02  # ignore colours covering less than 2% of the image
MERGE_DISTANCE = 18.0  # RGB distance under which two centres count as the same colour


def extract_palette(image: Image.Image, k: int = 8) -> list[str]:
    """Up to `k` dominant colours as hex strings, most common first."""
    rgb = image.convert("RGB")
    rgb.thumbnail((SAMPLE_SIZE, SAMPLE_SIZE))
    pixels = np.asarray(rgb, dtype=np.float32).reshape(-1, 3)
    distinct = len(np.unique(pixels.astype(np.uint8), axis=0))
    n_clusters = max(1, min(k, distinct))

    model = KMeans(n_clusters=n_clusters, n_init=4, random_state=0).fit(pixels)
    counts = np.bincount(model.labels_, minlength=n_clusters)
    order = np.argsort(-counts)
    total = counts.sum()

    kept: list[np.ndarray] = []
    for idx in order:
        if counts[idx] / total < MIN_SHARE:
            continue
        centre = model.cluster_centers_[idx]
        if any(np.linalg.norm(centre - other) < MERGE_DISTANCE for other in kept):
            continue
        kept.append(centre)
    return [to_hex(c) for c in kept]


def to_hex(rgb: np.ndarray) -> str:
    r, g, b = (int(round(float(v))) for v in np.clip(rgb, 0, 255))
    return f"#{r:02x}{g:02x}{b:02x}"
