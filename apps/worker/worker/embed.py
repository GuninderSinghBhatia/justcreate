"""CLIP image and text embeddings (open_clip). Both live in one 512-d space, L2-normalised."""

from __future__ import annotations

import threading

import numpy as np
from PIL import Image

from .config import Settings

_lock = threading.Lock()
_model = None


class Clip:
    def __init__(self, settings: Settings):
        import open_clip  # heavy import: only when the worker actually embeds
        import torch

        self._torch = torch
        self.version = f"{settings.clip_model}/{settings.clip_pretrained}"
        self.model, _, self.preprocess = open_clip.create_model_and_transforms(
            settings.clip_model, pretrained=settings.clip_pretrained
        )
        self.model.eval()
        self.tokenizer = open_clip.get_tokenizer(settings.clip_model)

    def image(self, image: Image.Image) -> np.ndarray:
        with self._torch.no_grad():
            tensor = self.preprocess(image.convert("RGB")).unsqueeze(0)
            vec = self.model.encode_image(tensor)[0].float().numpy()
        return _normalise(vec)

    def text(self, text: str) -> np.ndarray:
        with self._torch.no_grad():
            tokens = self.tokenizer([text[:300]])
            vec = self.model.encode_text(tokens)[0].float().numpy()
        return _normalise(vec)


def get_clip(settings: Settings) -> Clip:
    """Loads the model once per process (it takes a few seconds and ~600 MB of RAM)."""
    global _model
    with _lock:
        if _model is None:
            _model = Clip(settings)
        return _model


def _normalise(vec: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(vec)
    return vec / norm if norm else vec
