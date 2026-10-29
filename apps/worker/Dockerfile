# JUSTCREATE AI worker. Build from apps/worker:  docker build -t justcreate-worker .
# Runs the job loop + /health and /wake on $PORT. Needs SUPABASE_URL, SUPABASE_SECRET_KEY and
# GEMINI_API_KEY or ANTHROPIC_API_KEY (see .env.example).
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.13.1 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_NO_DEV=1 \
    HF_HOME=/opt/hf PATH="/app/.venv/bin:$PATH"
WORKDIR /app

# Dependencies first (cached layer); CPU-only torch on Linux via pyproject's pytorch-cpu index.
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-install-project

# Bake the CLIP weights into the image so cold starts don't download ~600 MB.
RUN python -c "import open_clip; open_clip.create_model_and_transforms('ViT-B-32', pretrained='laion2b_s34b_b79k')"
# From here on the weights come from the image only: no Hub calls at runtime.
ENV HF_HUB_OFFLINE=1

COPY worker ./worker

ENV HOST=0.0.0.0 PORT=8100
EXPOSE 8100
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import os,urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/health')"
CMD ["python", "-m", "worker", "serve"]
