import numpy as np

from worker.cluster import style_groups
from worker.llm import strict_schema
from worker.styles import BY_KEY, STYLES, assign, style_scores, word_scores
from worker.vision import ReferenceAnalysis

K = len(STYLES)
IDX = {s.key: j for j, s in enumerate(STYLES)}


def test_style_keys_and_names_are_unique():
    assert len({s.key for s in STYLES}) == K and len({s.name for s in STYLES}) == K


def test_words_name_their_styles_and_model_picks_count_fully():
    w = word_scores(["neo-brutalism, hard shadow, bold", "a caption about nothing", ""], [[], ["Glassmorphism"], []])
    assert w[0, IDX["neo-brutalism"]] == 1.0  # two aliases
    assert w[0, IDX["brutalism"]] == 0  # "neo-brutalism" doesn't count as plain brutalism
    assert w[1, IDX["glassmorphism"]] == 1.0 and w[1].sum() == 1.0
    assert w[2].sum() == 0


def test_scores_follow_the_image_when_words_are_missing():
    dim = 8
    matrix = np.eye(K, dim) if K <= dim else np.random.default_rng(0).normal(size=(K, dim))
    matrix = matrix / np.linalg.norm(matrix, axis=1, keepdims=True)
    img = matrix[IDX["ascii-art"]]
    s = style_scores([img, None], [None, None], np.zeros((2, K)), matrix)
    assert s[0].argmax() == IDX["ascii-art"]
    assert np.allclose(s[1], 1 / K)  # nothing known: uniform, so no confident style
    assert assign(s)[1] == []


def test_assign_takes_a_close_second_style():
    row = np.full(K, 0.01)
    row[IDX["neo-brutalism"]], row[IDX["corporate-saas"]] = 0.45, 0.3
    calls = assign(np.array([row]))[0]
    assert [c.key for c in calls] == ["neo-brutalism", "corporate-saas"]


def test_style_groups_need_two_references_and_a_core_member():
    calls = [[("pixel-art", 0.6)], [("pixel-art", 0.5), ("ascii-art", 0.4)], [("ascii-art", 0.7)], [("glitch", 0.5)]]
    groups = {g.style: g.suggestion for g in style_groups(["a", "b", "c", "d"], calls)}
    assert set(groups) == {"pixel-art", "ascii-art"}  # glitch has one reference
    assert groups["pixel-art"].core == {"a", "b"}
    assert groups["ascii-art"].core == {"c"} and set(groups["ascii-art"].members) == {"b", "c"}


def test_the_model_can_only_pick_known_styles():
    schema = strict_schema(ReferenceAnalysis)
    enum = schema["properties"]["design_styles"]["items"]["enum"]
    assert enum == [s.name for s in STYLES] and BY_KEY["ascii-art"].name in enum
