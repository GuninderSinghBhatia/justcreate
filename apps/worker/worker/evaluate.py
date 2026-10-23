"""Cluster quality metric from the execution plan: share of decided AI suggestions that were
kept as suggested or only renamed (target: 70%). Run weekly and track the number."""

from __future__ import annotations

from .db import Supabase


def report(db: Supabase) -> dict:
    clusters = db.select("clusters", {"source": "eq.ai", "select": "status,name,ai_name"})
    decided = [c for c in clusters if c["status"] in ("accepted", "rejected")]
    kept = [c for c in decided if c["status"] == "accepted"]
    renamed = [c for c in kept if c["ai_name"] and c["name"] != c["ai_name"]]
    pending = len(clusters) - len(decided)
    rate = len(kept) / len(decided) if decided else None
    result = {
        "ai_clusters": len(clusters),
        "decided": len(decided),
        "kept_or_renamed": len(kept),
        "of_which_renamed": len(renamed),
        "rejected": len(decided) - len(kept),
        "undecided": pending,
        "kept_rate": None if rate is None else round(rate, 3),
        "target": 0.7,
    }
    for key, value in result.items():
        print(f"{key:>18}: {value}")
    return result
