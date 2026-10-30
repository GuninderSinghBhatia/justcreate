"""Thin Supabase client (PostgREST + Storage) using the secret key.

The secret key bypasses row-level security, so every query here filters by user_id explicitly.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any
from urllib.parse import quote

import httpx

from .config import Settings

BUCKET = "captures"
log = logging.getLogger(__name__)
# Storage paths are `<user uuid>/<file name>`; anything else (`../`, a query) never reaches a URL.
STORAGE_PATH = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9._-]+$")
IN_CHUNK = 150  # ids per `in.(...)` filter: the list travels in the URL
PAGE = 1000  # PostgREST returns at most this many rows per request


class SupabaseError(RuntimeError):
    """A failed request. The message names the request and PostgREST's error code (e.g. 23505),
    never the response body: messages end up in `jobs.error`, which users can read."""


def owned_path(path: str | None, user_id: str) -> str | None:
    """The storage path if it is one of `user_id`'s files, else None. Reference rows are written by
    users, and this client reads storage with the secret key."""
    if path and STORAGE_PATH.match(path) and path.split("/", 1)[0] == user_id:
        return path
    return None


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
        """Rows matching `params`. Long `in.(...)` lists are split into several requests, and
        results past PostgREST's page size are fetched page by page (unless a limit is given)."""
        for key, value in params.items():
            if value.startswith("in.(") and value.endswith(")"):
                ids = value[4:-1].split(",") if len(value) > 5 else []
                if len(ids) > IN_CHUNK:
                    rows: list[dict[str, Any]] = []
                    for n in range(0, len(ids), IN_CHUNK):
                        rows += self.select(table, {**params, key: in_list(ids[n:n + IN_CHUNK])})
                    return rows
        if "limit" in params:
            return self._get(table, params)
        rows = []
        while True:
            page = self._get(table, {**params, "limit": str(PAGE), "offset": str(len(rows))})
            rows += page
            if len(page) < PAGE:
                return rows

    def _get(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
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
        res = self._http.get(f"/storage/v1/object/{BUCKET}/{_storage(path)}")
        _raise(res)
        return res.content

    def upload(self, path: str, data: bytes, content_type: str) -> None:
        res = self._http.post(f"/storage/v1/object/{BUCKET}/{_storage(path)}", content=data,
                              headers={"Content-Type": content_type, "x-upsert": "true"})
        _raise(res)


def in_list(values: list[str]) -> str:
    """PostgREST `in.(...)` filter value."""
    return "in.(" + ",".join(values) + ")"


def _storage(path: str) -> str:
    if not STORAGE_PATH.match(path):
        raise SupabaseError("Not a storage path")
    return quote(path, safe="/")


def _raise(res: httpx.Response) -> None:
    if res.is_error:
        try:
            body = res.json()
        except ValueError:
            body = None
        code = (body.get("code") or "") if isinstance(body, dict) else ""
        log.warning("Supabase %s %s -> %s: %s", res.request.method, res.request.url.path, res.status_code, res.text[:500])
        path = res.request.url.path
        target = path.split("/rest/v1/", 1)[1] if "/rest/v1/" in path else "storage"
        raise SupabaseError(f"Supabase {res.request.method} {target} -> {res.status_code} {code}".rstrip())
