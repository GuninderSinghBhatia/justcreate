"""Thin Supabase client (PostgREST + Storage) using the secret key.

The secret key bypasses row-level security, so every query here filters by user_id explicitly.
"""

from __future__ import annotations

import json
from typing import Any

import httpx

from .config import Settings

BUCKET = "captures"


class Supabase:
    def __init__(self, settings: Settings):
        key = settings.supabase_secret_key
        self._http = httpx.Client(
            base_url=settings.supabase_url,
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
            timeout=60.0,
        )

    def close(self) -> None:
        self._http.close()

    # ---------- PostgREST ----------

    def select(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
        res = self._http.get(f"/rest/v1/{table}", params=params)
        _raise(res)
        return res.json()

    def insert(self, table: str, rows: list[dict[str, Any]] | dict[str, Any], *, upsert_on: str | None = None,
               ignore_duplicates: bool = False) -> list[dict[str, Any]]:
        prefer = ["return=representation"]
        params = {}
        if upsert_on:
            prefer.append("resolution=ignore-duplicates" if ignore_duplicates else "resolution=merge-duplicates")
            params["on_conflict"] = upsert_on
        res = self._http.post(f"/rest/v1/{table}", params=params, content=json.dumps(rows),
                              headers={"Prefer": ",".join(prefer), "Content-Type": "application/json"})
        _raise(res)
        return res.json() if res.content else []

    def update(self, table: str, match: dict[str, str], values: dict[str, Any]) -> None:
        res = self._http.patch(f"/rest/v1/{table}", params=match, content=json.dumps(values),
                               headers={"Content-Type": "application/json", "Prefer": "return=minimal"})
        _raise(res)

    def delete(self, table: str, match: dict[str, str]) -> None:
        res = self._http.delete(f"/rest/v1/{table}", params=match)
        _raise(res)

    def rpc(self, fn: str, args: dict[str, Any]) -> Any:
        res = self._http.post(f"/rest/v1/rpc/{fn}", content=json.dumps(args),
                              headers={"Content-Type": "application/json"})
        _raise(res)
        return res.json()

    # ---------- Storage ----------

    def download(self, path: str) -> bytes:
        res = self._http.get(f"/storage/v1/object/{BUCKET}/{path}")
        _raise(res)
        return res.content

    def upload(self, path: str, data: bytes, content_type: str) -> None:
        res = self._http.post(f"/storage/v1/object/{BUCKET}/{path}", content=data,
                              headers={"Content-Type": content_type, "x-upsert": "true"})
        _raise(res)


def in_list(values: list[str]) -> str:
    """PostgREST `in.(...)` filter value."""
    return "in.(" + ",".join(values) + ")"


def _raise(res: httpx.Response) -> None:
    if res.is_error:
        raise RuntimeError(f"Supabase {res.request.method} {res.request.url.path} -> {res.status_code}: {res.text[:300]}")
