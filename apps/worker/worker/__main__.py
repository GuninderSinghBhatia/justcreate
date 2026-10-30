"""Entry points.

    uv run python -m worker serve   # FastAPI on :8100 + background job loop (the normal way)
    uv run python -m worker once    # run all due jobs, then exit (tests, cron)
    uv run python -m worker eval    # cluster-quality numbers for the weekly metric
    uv run python -m worker reanalyze  # re-run AI analysis on fallback-tagged references
"""

from __future__ import annotations

import logging
import os
import sys
import threading
import time

from .config import load_settings
from .db import Supabase
from .jobs import Worker

REQUEUE_SECONDS = 3600

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("worker")


def serve() -> None:
    import uvicorn
    from fastapi import FastAPI

    settings = load_settings()
    wake = threading.Event()
    app = FastAPI(title="JustCreate worker")

    @app.get("/health")
    def health() -> dict:
        return {"ok": True, "provider": settings.provider, "analysis_model": settings.analysis_model_name}

    @app.post("/wake")
    def wake_up() -> dict:
        wake.set()
        return {"ok": True}

    def loop() -> None:
        db = Supabase(settings)
        worker = Worker(settings, db)
        next_requeue = 0.0
        while True:
            try:
                # Fallback-tagged references get another try at a real analysis every hour.
                if time.monotonic() >= next_requeue:
                    next_requeue = time.monotonic() + REQUEUE_SECONDS
                    if queued := worker.requeue_fallbacks():
                        log.info("re-queued %d fallback-tagged references for analysis", queued)
                worker.run_due()
            except Exception:  # noqa: BLE001 - keep polling after transient failures
                log.exception("job loop error")
            wake.wait(settings.poll_seconds)
            wake.clear()

    threading.Thread(target=loop, daemon=True, name="jobs").start()
    log.info("LLM provider: %s (%s)", settings.provider or "none — metadata/colour tags", settings.analysis_model_name)
    # Local default: loopback only. Containers set HOST=0.0.0.0 and the platform's PORT.
    host, port = os.environ.get("HOST", "127.0.0.1"), int(os.environ.get("PORT", "8100"))
    uvicorn.run(app, host=host, port=port, log_level="warning")


def once() -> None:
    settings = load_settings()
    db = Supabase(settings)
    try:
        ran = Worker(settings, db).run_due()
        log.info("ran %d jobs", ran)
    finally:
        db.close()


def reanalyze() -> None:
    """Re-queues references that only got fallback tags (no key yet, quota hit, outage)."""
    settings = load_settings()
    db = Supabase(settings)
    try:
        log.info("queued %d fallback-tagged references for re-analysis", Worker(settings, db).requeue_fallbacks())
    finally:
        db.close()


def evaluate() -> None:
    from .evaluate import report

    settings = load_settings()
    db = Supabase(settings)
    try:
        report(db)
    finally:
        db.close()


if __name__ == "__main__":
    command = sys.argv[1] if len(sys.argv) > 1 else "serve"
    {"serve": serve, "once": once, "eval": evaluate, "reanalyze": reanalyze}.get(command, serve)()
