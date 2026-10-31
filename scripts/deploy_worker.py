"""Deploys the AI worker (apps/worker) to a private Hugging Face Space, built from its Dockerfile.

    uv run --with huggingface_hub python scripts/deploy_worker.py <user>/justcreate-worker [--secrets]

Creates the Space (private, Docker) if it doesn't exist, then replaces its files with apps/worker's.
--secrets also copies the worker's settings into the Space's secrets and variables, from the same
files the worker reads locally (apps/web/.env.local, then apps/worker/.env). Auth: `hf auth login`
or HF_TOKEN. CI runs it without --secrets on every push that changes apps/worker.
"""

from __future__ import annotations

import hashlib
import sys
from pathlib import Path

from huggingface_hub import CommitOperationAdd, CommitOperationDelete, HfApi
from huggingface_hub.hf_api import RepoFile

ROOT = Path(__file__).resolve().parent.parent
WORKER = ROOT / "apps" / "worker"
FILES = ["Dockerfile", "pyproject.toml", "uv.lock", ".python-version"]

# The image sets PORT=8100; Spaces route the public URL to app_port.
README = """---
title: JustCreate worker
sdk: docker
app_port: 8100
pinned: false
---

JustCreate's AI worker: analysis, CLIP embeddings, clustering and design.md. Deployed from
`apps/worker` by `scripts/deploy_worker.py`; edit it there, not here.
"""

SECRETS = ["SUPABASE_SECRET_KEY", "GROQ_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"]
VARIABLES = [
    "SUPABASE_URL", "LLM_PROVIDER", "POLL_SECONDS",
    "GROQ_VISION_MODEL", "GROQ_TEXT_MODEL", "GEMINI_MODEL", "GEMINI_NAMING_MODEL",
    "ANALYSIS_MODEL", "NAMING_MODEL",
]


def read_env(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    out = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        key, sep, value = line.strip().partition("=")
        if sep and key and not key.startswith("#"):
            out[key.strip()] = value.strip().strip('"').strip("'")
    return out


def settings() -> dict[str, str]:
    env = read_env(ROOT / "apps" / "web" / ".env.local")
    env.setdefault("SUPABASE_URL", env.get("NEXT_PUBLIC_SUPABASE_URL", ""))
    env.update(read_env(WORKER / ".env"))
    return {k: v for k, v in env.items() if v}


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1 or "/" not in args[0]:
        raise SystemExit(__doc__)
    space = args[0]
    api = HfApi()

    api.create_repo(space, repo_type="space", space_sdk="docker", private=True, exist_ok=True)

    if "--secrets" in sys.argv:
        env = settings()
        for key in SECRETS:
            if key in env:
                api.add_space_secret(space, key, env[key])
        for key in VARIABLES:
            if key in env:
                api.add_space_variable(space, key, env[key])
        print("settings:", ", ".join(k for k in SECRETS + VARIABLES if k in env))

    wanted = {name: (WORKER / name).read_bytes() for name in FILES}
    for path in sorted((WORKER / "worker").rglob("*.py")):
        wanted[path.relative_to(WORKER).as_posix()] = path.read_bytes()
    wanted["README.md"] = README.encode()

    # Every commit rebuilds the image: only send files that changed, and nothing if none did.
    existing = {
        f.path: f.blob_id
        for f in api.list_repo_tree(space, repo_type="space", recursive=True)
        if isinstance(f, RepoFile)
    }
    operations = [
        CommitOperationAdd(path_in_repo=p, path_or_fileobj=b)
        for p, b in wanted.items()
        if existing.get(p) != git_blob_id(b)
    ]
    operations += [CommitOperationDelete(path_in_repo=p) for p in existing.keys() - wanted.keys() - {".gitattributes"}]
    url = f"https://{space.replace('/', '-').replace('_', '-').replace('.', '-').lower()}.hf.space"
    if not operations:
        print(f"worker unchanged: {url}")
        return
    commit = api.create_commit(space, repo_type="space", operations=operations, commit_message="Deploy worker")
    print(f"deployed {len(operations)} changes: {commit.commit_url}")
    print(f"URL: {url} (the Space rebuilds the image first: a few minutes)")


def git_blob_id(content: bytes) -> str:
    return hashlib.sha1(b"blob %d\0" % len(content) + content).hexdigest()


if __name__ == "__main__":
    main()
