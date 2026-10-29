import numpy as np

from worker.cluster import (
    default_min_size, fallback_name, filter_known, jaccard, join_embeddings, similarity, suggest_clusters,
    suggest_from_similarity, tag_similarity,
)


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


def test_rare_shared_tags_count_more_than_common_ones():
    t = tag_similarity([["dark", "neon"], ["dark", "neon"], ["dark", "pastel"], ["dark", "grid"]])
    assert t[0, 1] > t[0, 2]  # sharing the rarer "neon" beats sharing only the everywhere "dark"
    assert np.isclose(t[0, 0], 1)


def test_fallback_references_are_compared_on_their_picture_alone():
    # Two references whose images differ but whose (fallback) text and tags are identical must not
    # look alike; with real text and tags they would.
    rng = np.random.default_rng(1)
    imgs = [rng.normal(size=16) for _ in range(6)]
    txt = np.ones(16)
    same_tags = ["pin", "grey"]
    real = similarity(imgs, [txt] * 6, [same_tags] * 6)
    fallback = similarity(imgs, [None] * 6, [[]] * 6)
    assert real[0, 1] > fallback[0, 1] or np.isclose(fallback[0, 1], 0)
    assert np.allclose(np.diag(fallback), 1)


def test_a_cluster_taking_most_of_the_board_is_split():
    # Two tight families that sit close together (one broad "family" at first glance) plus outliers.
    rng = np.random.default_rng(3)
    dim = 32
    base = np.eye(dim)[0]
    a_dir, b_dir = base + 0.35 * np.eye(dim)[1], base + 0.35 * np.eye(dim)[2]
    ids, vecs = [], []
    for name, d in (("a", a_dir), ("b", b_dir)):
        for i in range(7):
            v = d + rng.normal(0, 0.03, dim)
            vecs.append(v / np.linalg.norm(v))
            ids.append(f"{name}{i}")
    for i in range(3):
        ids.append(f"x{i}")
        vecs.append(np.eye(dim)[10 + i])
    out = suggest_clusters(ids, np.array(vecs), min_cluster_size=3)
    cores = [{m[0] for m in s.core} for s in out]
    assert {"a"} in cores and {"b"} in cores


def test_small_boards_get_small_clusters():
    assert default_min_size(19) == 3
    assert default_min_size(200) == 8
    ids, vecs = blobs(per=3)  # three families of 3 on a 10-reference board
    sim = np.clip(vecs @ vecs.T, 0, 1)
    assert len(suggest_from_similarity(ids, sim)) == 3
