"""Settings, read from the environment, then apps/worker/.env, then apps/web/.env.local.

The web app's env file already holds the Supabase URL and secret key, so a local setup only
needs ANTHROPIC_API_KEY added to apps/worker/.env (or the shell).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

_HERE = Path(__file__).resolve()
# Repo root in the monorepo (apps/worker/worker/config.py → 3 up). In a container there is no
# monorepo, so fall back to env vars only.
ROOT = _HERE.parents[3] if len(_HERE.parents) > 3 else _HERE.parent


def _read_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def _env() -> dict[str, str]:
    merged = _read_env_file(ROOT / "apps" / "web" / ".env.local")
    merged.update(_read_env_file(ROOT / "apps" / "worker" / ".env"))
    merged.update({k: v for k, v in os.environ.items() if v})
    return merged


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    supabase_secret_key: str
    anthropic_api_key: str | None
    gemini_api_key: str | None
    # Per-reference tagging runs on every save, so it uses the cheap model; naming clusters
    # needs more judgement. Both overridable.
    analysis_model: str
    naming_model: str
    gemini_model: str  # per-reference analysis (one call per save: the lite model saves quota)
    gemini_naming_model: str
    clip_model: str
    clip_pretrained: str
    poll_seconds: float
    max_attempts: int

    @property
    def provider(self) -> str | None:
        """Claude if its key is set, else Gemini, else None (metadata/colour fallback)."""
        if self.anthropic_api_key:
            return "anthropic"
        if self.gemini_api_key:
            return "gemini"
        return None

    @property
    def analysis_model_name(self) -> str:
        return {"anthropic": self.analysis_model, "gemini": self.gemini_model}.get(self.provider or "", "heuristic-v1")


def load_settings() -> Settings:
    env = _env()
    url = env.get("SUPABASE_URL") or env.get("NEXT_PUBLIC_SUPABASE_URL")
    key = env.get("SUPABASE_SECRET_KEY")
    if not url or not key:
        raise SystemExit("Missing SUPABASE_URL / SUPABASE_SECRET_KEY (see apps/worker/.env.example)")
    return Settings(
        supabase_url=url.rstrip("/"),
        supabase_secret_key=key,
        anthropic_api_key=env.get("ANTHROPIC_API_KEY") or None,
        gemini_api_key=env.get("GEMINI_API_KEY") or env.get("GOOGLE_API_KEY") or None,
        analysis_model=env.get("ANALYSIS_MODEL", "claude-haiku-5-5"),
        naming_model=env.get("NAMING_MODEL", "claude-sonnet-5-5"),
        gemini_model=env.get("GEMINI_MODEL", "gemini-3.5-flash-lite"),
        gemini_naming_model=env.get("GEMINI_NAMING_MODEL", "gemini-3.5-flash"),
        clip_model=env.get("CLIP_MODEL", "ViT-B-32"),
        clip_pretrained=env.get("CLIP_PRETRAINED", "laion2b_s34b_b79k"),
        poll_seconds=float(env.get("POLL_SECONDS", "5")),
        max_attempts=int(env.get("MAX_ATTEMPTS", "5")),
    )
