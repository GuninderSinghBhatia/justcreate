import numpy as np

from worker.cluster import fallback_name, filter_known, jaccard, join_embeddings, suggest_clusters


def blobs(seed=0, per=6, dim=32, noise=0.05):
    """Three well-separated groups of unit vectors plus one outlier."""
    rng = np.random.default_rng(seed)
    centres = np.eye(dim)[:3]
    ids, vecs = [], []
    for g, c in enumerate(centres):
        for i in range(per):
            v = c + rng.normal(0, noise, dim)
            vecs.append(v / np.linalg.norm(v))
            ids.append(f"g{g}-{i}")
    outlier = np.eye(dim)[10]
    ids.append("outlier")
    vecs.append(outlier)
    return ids, np.array(vecs)


def test_finds_the_three_groups_and_leaves_outlier_out():
    ids, vecs = blobs()
    out = suggest_clusters(ids, vecs, min_cluster_size=3)
    groups = [{i.split("-")[0] for i in s.core} for s in out]
    assert len(out) == 3
    assert all(len(g) == 1 for g in groups)  # each cluster is one pure group
    assert all("outlier" not in s.members for s in out)


def test_too_few_references_gives_no_clusters():
    ids, vecs = blobs(per=1)
    assert suggest_clusters(ids[:3], vecs[:3]) == []


def test_strong_rare_tag_adds_second_membership():
    ids, vecs = blobs()
    tags = {i: [] for i in ids}
    for i in ids:
        if i.startswith("g0"):
            tags[i] = ["neon palette"]
    tags["g1-0"] = ["neon palette"]  # shares the strong tag with group 0
    out = suggest_clusters(ids, vecs, tags, min_cluster_size=3)
    g0 = next(s for s in out if any(m.startswith("g0") for m in s.core))
    assert "g1-0" in g0.members and "g1-0" not in g0.core
    in_how_many = sum("g1-0" in s.members for s in out)
    assert in_how_many == 2  # its own group + the neon group


def test_rejected_and_accepted_groups_are_not_suggested_again():
    ids, vecs = blobs()
    out = suggest_clusters(ids, vecs, min_cluster_size=3)
    rejected = [set(out[0].members)]
    protected = [set(out[1].members)]
    kept = filter_known(out, rejected, protected)
    assert len(kept) == 1 and set(kept[0].members) == set(out[2].members)


def test_join_embeddings_handles_missing_parts():
    img = np.ones(4)
    txt = np.arange(4, dtype=float)
    both = join_embeddings(img, txt)
    assert both.shape == (8,) and np.isclose(np.linalg.norm(both), 1)
    only_text = join_embeddings(None, txt)
    assert np.allclose(only_text[:4], 0) and np.isclose(np.linalg.norm(only_text), 1)


def test_helpers():
    assert jaccard({"a", "b"}, {"b", "c"}) == 1 / 3
    assert fallback_name([["dark ui", "neon"], ["neon", "grid"]]).startswith("Neon")
