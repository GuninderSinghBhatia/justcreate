"""The AI worker on Modal: it runs only when there's work, so Modal's free monthly credit covers it.

    cd apps/worker && uvx modal deploy modal_app.py

- POST /wake (Authorization: Bearer $WAKE_TOKEN): the web app calls it after queueing a job; a run
  works through every due job, then stops.
- Every 10 minutes, a run anyway: retries, deferred jobs and anything a missed wake left, plus
  another try for references that only got fallback tags.
Settings come from the Modal secret "justcreate-worker": SUPABASE_URL, SUPABASE_SECRET_KEY,
LLM_PROVIDER and the LLM key(s), and WAKE_TOKEN (the web app's WORKER_TOKEN).
"""

from __future__ import annotations

import hmac
import os

import modal

CLIP_MODEL, CLIP_PRETRAINED = "ViT-B-32", "laion2b_s34b_b79k"  # worker.config defaults

# The same environment as the Dockerfile: uv.lock (CPU-only torch), CLIP weights baked in.
image = (
    modal.Image.debian_slim(python_version="3.12")
    .uv_sync(".", frozen=True)
    .env({"HF_HOME": "/opt/hf"})
    .run_commands(
        f"python -c \"import open_clip; open_clip.create_model_and_transforms('{CLIP_MODEL}', pretrained='{CLIP_PRETRAINED}')\""
    )
    .env({"HF_HUB_OFFLINE": "1"})
    .add_local_python_source("worker")
)

app = modal.App("justcreate-worker", image=image)
settings_secret = modal.Secret.from_name("justcreate-worker")


# One runner at a time (extra wakes queue behind it and find nothing left); it stays warm a minute
# for the next capture. CLIP on CPU needs ~2 GB.
@app.function(secrets=[settings_secret], cpu=1.0, memory=2048, timeout=3600, max_containers=1, scaledown_window=60)
def run(requeue_fallbacks: bool = False) -> int:
    from worker.config import load_settings
    from worker.db import Supabase
    from worker.jobs import Worker

    settings = load_settings()
    db = Supabase(settings)
    try:
        worker = Worker(settings, db)
        if requeue_fallbacks:
            worker.requeue_fallbacks()
        return worker.drain()
    finally:
        db.close()


@app.function(schedule=modal.Period(minutes=10))
def sweep() -> None:
    run.spawn(requeue_fallbacks=True)


@app.function(secrets=[settings_secret])
@modal.asgi_app()
def web():
    from fastapi import FastAPI, Header, HTTPException

    api = FastAPI(title="JustCreate worker")

    @api.get("/health")
    def health() -> dict:
        return {"ok": True}

    @api.post("/wake")
    def wake(authorization: str = Header("")) -> dict:
        if not hmac.compare_digest(authorization.encode(), f"Bearer {os.environ['WAKE_TOKEN']}".encode()):
            raise HTTPException(status_code=401)
        run.spawn()
        return {"ok": True}

    return api
