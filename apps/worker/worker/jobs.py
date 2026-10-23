"""Job handlers: `analyze` (palette + vision tags + CLIP embeddings + thumbnail) and `cluster`."""

from __future__ import annotations

import hashlib
import io
import logging
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

import numpy as np
from PIL import Image

from . import vision
from .cluster import filter_known, join_embeddings, suggest_clusters
from .config import Settings
from .db import Supabase, in_list
from .embed import get_clip
from .naming import name_clusters
from .palette import extract_palette

log = logging.getLogger(__name__)

THUMB_MAX = 640
THUMB_SKIP_BYTES = 150_000  # files this small are already fine as card images
FIRST_CLUSTER_AT = 6  # a board gets its first clustering once this many references are analysed


class Defer(Exception):
    """Job can't run yet (e.g. clustering while analyses are pending); retry later."""

    def __init__(self, reason: str, seconds: int = 30):
        super().__init__(reason)
        self.seconds = seconds


class Worker:
    def __init__(self, settings: Settings, db: Supabase):
        self.settings = settings
        self.db = db

    # ---------- loop ----------

    def run_due(self, batch: int = 4) -> int:
        """Claims and runs due jobs until none are left. Returns how many ran."""
        ran = 0
        while True:
            jobs = self.db.rpc("claim_jobs", {"n": batch})
            if not jobs:
                return ran
            for job in jobs:
                self._run(job)
                ran += 1

    def _run(self, job: dict) -> None:
        try:
            if job["kind"] == "analyze":
                self.analyze(job["user_id"], job["reference_id"])
            elif job["kind"] == "cluster":
                self.cluster(job["user_id"], job["board_id"])
            self.db.update("jobs", {"id": f"eq.{job['id']}"}, {"status": "done", "error": None, "updated_at": _now()})
            log.info("job %s %s done", job["kind"], job["id"])
        except Defer as wait:
            # Not a failure: put it back without using up an attempt.
            self.db.update("jobs", {"id": f"eq.{job['id']}"}, {
                "status": "pending",
                "attempts": max(0, job["attempts"] - 1),
                "run_after": (datetime.now(timezone.utc) + timedelta(seconds=wait.seconds)).isoformat(),
                "updated_at": _now(),
            })
            log.info("job %s %s deferred: %s", job["kind"], job["id"], wait)
        except Exception as err:  # noqa: BLE001 - one bad job must not stop the worker
            log.exception("job %s %s failed", job["kind"], job["id"])
            final = job["attempts"] >= self.settings.max_attempts
            retry_at = datetime.now(timezone.utc) + timedelta(minutes=2 ** job["attempts"])
            self.db.update("jobs", {"id": f"eq.{job['id']}"}, {
                "status": "failed" if final else "pending",
                "error": str(err)[:1000],
                "run_after": retry_at.isoformat(),
                "updated_at": _now(),
            })

    # ---------- analyze ----------

    def analyze(self, user_id: str, reference_id: str) -> None:
        rows = self.db.select("references", {"id": f"eq.{reference_id}", "user_id": f"eq.{user_id}", "select": "*"})
        if not rows:
            return  # deleted since the job was queued
        ref = rows[0]
        meta = ref.get("metadata") or {}

        image = None
        image_hash = None
        raw = None
        path = ref.get("thumbnail_path") or ref.get("file_path")
        if path:
            raw = self.db.download(path)
            image_hash = hashlib.sha256(raw).hexdigest()
            image = _open(raw)

        context = {
            "type": ref["type"],
            "title": ref.get("title"),
            "host": urlparse(ref.get("source_url") or ref.get("page_url") or "").hostname,
            "note": ref.get("note"),
            "text": meta.get("text"),
            "channel": meta.get("channel"),
            "author": meta.get("author"),
        }

        cached = self._cached_analysis(user_id, image_hash, reference_id) if image_hash else None
        if cached:
            analysis_row = {**cached, "reference_id": reference_id}
        else:
            palette = extract_palette(image) if image is not None else []
            context["palette"] = palette
            result, model_version = None, self.settings.analysis_model_name
            if self.settings.provider:
                try:
                    result = vision.analyze_with_llm(self.settings, image, context)
                except Exception as err:  # noqa: BLE001 - quota/outage must not stall embeddings + clustering
                    log.warning("LLM analysis failed for %s, using fallback tags (reanalyze later): %s", reference_id, str(err)[:200])
            if result is None:
                result, model_version = vision.analyze_heuristic(palette, context), vision.HEURISTIC_VERSION
            analysis_row = {
                "reference_id": reference_id,
                "user_id": user_id,
                "model_version": model_version,
                "caption": result.caption,
                "summary": result.summary,
                "tags": _clean(result.style_tags),
                "mood": _clean(result.mood),
                "palette": palette,
                "colors": result.observed.colors,
                "fonts": result.inferred.font_guesses,
                "layout_notes": result.observed.layout,
                "components": _clean(result.observed.components),
                "effects": _clean(result.observed.effects),
                "observed": result.observed.model_dump(),
                "inferred": result.inferred.model_dump(),
                "raw": result.model_dump(),
                "image_hash": image_hash,
            }
        self.db.insert("analyses", analysis_row, upsert_on="reference_id")

        clip = get_clip(self.settings)
        text = " ".join(filter(None, [analysis_row.get("caption"), ", ".join(analysis_row.get("tags") or []),
                                      ", ".join(analysis_row.get("mood") or [])]))
        self.db.insert("embeddings", {
            "reference_id": reference_id,
            "user_id": user_id,
            "model_version": clip.version,
            "image_embedding": _vec(clip.image(image)) if image is not None else None,
            "text_embedding": _vec(clip.text(text)) if text else None,
        }, upsert_on="reference_id")

        if image is not None and raw is not None and ref.get("thumbnail_path") == ref.get("file_path"):
            self._make_thumbnail(ref, image, len(raw))
        self._maybe_queue_first_cluster(user_id, reference_id)

    def _cached_analysis(self, user_id: str, image_hash: str, reference_id: str) -> dict | None:
        """Same image saved twice → reuse its analysis instead of paying for another LLM call."""
        rows = self.db.select("analyses", {
            "user_id": f"eq.{user_id}", "image_hash": f"eq.{image_hash}",
            "reference_id": f"neq.{reference_id}", "select": "*", "limit": "1",
        })
        if not rows:
            return None
        row = rows[0]
        row.pop("created_at", None)
        return row

    def _make_thumbnail(self, ref: dict, image: Image.Image, size: int) -> None:
        """Card-sized webp for large files, so boards with hundreds of cards stay light."""
        if size < THUMB_SKIP_BYTES and max(image.size) <= THUMB_MAX * 2:
            return
        thumb = image.convert("RGB")
        thumb.thumbnail((THUMB_MAX, THUMB_MAX * 3))
        buf = io.BytesIO()
        thumb.save(buf, format="WEBP", quality=82)
        path = f"{ref['user_id']}/thumb-{ref['id']}.webp"
        self.db.upload(path, buf.getvalue(), "image/webp")
        self.db.update("references", {"id": f"eq.{ref['id']}"}, {"thumbnail_path": path})

    def _maybe_queue_first_cluster(self, user_id: str, reference_id: str) -> None:
        boards = self.db.select("board_items", {"reference_id": f"eq.{reference_id}", "select": "board_id"})
        for b in boards:
            board = self.db.select("boards", {"id": f"eq.{b['board_id']}", "select": "clustered_at"})
            if not board or board[0]["clustered_at"]:
                continue
            members = [i["reference_id"] for i in self.db.select("board_items", {"board_id": f"eq.{b['board_id']}", "select": "reference_id"})]
            analysed = self.db.select("embeddings", {"reference_id": in_list(members), "select": "reference_id"})
            if len(analysed) >= FIRST_CLUSTER_AT:
                try:
                    self.db.insert("jobs", {"user_id": user_id, "kind": "cluster", "board_id": b["board_id"]})
                except RuntimeError as err:
                    if "23505" not in str(err):  # already queued
                        raise

    # ---------- cluster ----------

    def cluster(self, user_id: str, board_id: str) -> None:
        items = self.db.select("board_items", {"board_id": f"eq.{board_id}", "user_id": f"eq.{user_id}", "select": "reference_id"})
        ids_on_board = [i["reference_id"] for i in items]
        if not ids_on_board:
            return
        waiting = self.db.select("jobs", {"kind": "eq.analyze", "status": "in.(pending,running)",
                                          "reference_id": in_list(ids_on_board), "select": "id", "limit": "1"})
        if waiting:
            raise Defer("references on this board are still being analysed", seconds=30)
        emb = self.db.select("embeddings", {"reference_id": in_list(ids_on_board), "select": "reference_id,image_embedding,text_embedding"})
        ana = {a["reference_id"]: a for a in self.db.select("analyses", {"reference_id": in_list(ids_on_board), "select": "reference_id,tags,mood,caption"})}

        ids, vectors = [], []
        for e in emb:
            img, txt = _parse_vec(e["image_embedding"]), _parse_vec(e["text_embedding"])
            if img is None and txt is None:
                continue
            ids.append(e["reference_id"])
            vectors.append(join_embeddings(img, txt))
        tags = {r: (ana.get(r, {}).get("tags") or []) + (ana.get(r, {}).get("mood") or []) for r in ids}

        existing = self.db.select("clusters", {"board_id": f"eq.{board_id}", "select": "id,name,status,source,cluster_members(reference_id)"})
        members_of = lambda c: {m["reference_id"] for m in c["cluster_members"]}  # noqa: E731
        rejected = [members_of(c) for c in existing if c["status"] == "rejected"]
        protected = [members_of(c) for c in existing if c["status"] == "accepted" or c["source"] == "user"]

        suggestions = suggest_clusters(ids, np.array(vectors), tags) if len(ids) >= 4 else []
        suggestions = filter_known(suggestions, rejected, protected)

        # Replace only previous *suggestions*; accepted, user-made and rejected clusters stay.
        stale = [c["id"] for c in existing if c["status"] == "suggested" and c["source"] == "ai"]
        if stale:
            self.db.delete("clusters", {"id": in_list(stale)})

        keep_names = [c["name"] for c in existing if c["id"] not in stale]
        names = name_clusters(self.settings, [
            {"tags": [tags.get(r, []) for r in s.members], "captions": [ana.get(r, {}).get("caption") for r in s.members]}
            for s in suggestions
        ], keep_names)

        for s, (name, summary) in zip(suggestions, names):
            created = self.db.insert("clusters", {
                "board_id": board_id, "user_id": user_id, "name": name, "ai_name": name,
                "summary": summary, "status": "suggested", "source": "ai",
            })[0]
            self.db.insert("cluster_members", [
                {"cluster_id": created["id"], "reference_id": r, "user_id": user_id, "score": round(score, 4)}
                for r, score in s.members.items()
            ])
        self.db.update("boards", {"id": f"eq.{board_id}"}, {"clustered_at": _now()})
        log.info("board %s: %d references → %d suggestions", board_id, len(ids), len(suggestions))


def _open(raw: bytes) -> Image.Image | None:
    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
        return img
    except Exception:  # noqa: BLE001 - SVG and other non-raster files
        return None


def _clean(values: list[str]) -> list[str]:
    return list(dict.fromkeys(v.strip().lower() for v in values if v and v.strip()))[:15]


def _vec(v: np.ndarray) -> str:
    return "[" + ",".join(f"{x:.6f}" for x in v.tolist()) + "]"


def _parse_vec(v) -> np.ndarray | None:
    if v is None:
        return None
    if isinstance(v, str):
        v = [float(x) for x in v.strip("[]").split(",")]
    return np.asarray(v, dtype=np.float32)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()
