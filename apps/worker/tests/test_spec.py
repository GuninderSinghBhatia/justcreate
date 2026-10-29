from worker.spec import (
    CITE, KEY_REFS, REF_MAP, SECTIONS, Board, aggregate, assemble, clean_body, draft_sections, replace_section,
    md_url, short_ids, split_sections, with_reference_map,
)

A = "aaaaaa11-0000-0000-0000-000000000001"
B = "aaaaaa22-0000-0000-0000-000000000002"
C = "bbbbbb33-0000-0000-0000-000000000003"


def board() -> Board:
    refs = {
        A: {"id": A, "type": "image", "title": "Neon card", "source_url": "https://ex.com/a", "thumbnail_path": "a"},
        B: {"id": B, "type": "screenshot", "title": "Dark dash", "source_url": None, "page_url": "https://ex.com/b"},
        C: {"id": C, "type": "webpage", "title": "Pastel | site", "source_url": "https://ex.com/c"},
    }
    analyses = {
        A: {"palette": ["#ff0080", "#0a0a0a"], "fonts": ["Space Grotesk"], "components": ["card"], "effects": ["glow"],
            "tags": ["neon", "dark ui"], "mood": ["energetic"], "layout_notes": "Bento grid"},
        B: {"palette": ["#0b0b0b", "#ff1088"], "fonts": ["Space Grotesk", "Inter"], "components": ["card", "navbar"],
            "effects": ["glow"], "tags": ["dark ui"], "mood": ["focused"]},
        C: {"palette": ["#f6d6e8"], "fonts": ["Inter"], "components": ["hero"], "effects": [], "tags": ["pastel"], "mood": ["calm"]},
    }
    return Board(id="b", name="Test", refs=refs, analyses=analyses, short=short_ids(list(refs)),
                 groups=[("Neon", [A, B]), ("Pastel", [C])])


def test_short_ids_grow_until_unique():
    ids = short_ids([A, B, C])
    assert len(set(ids.values())) == 3
    # A and B share 6 chars → every id grows to the same, shortest unique length
    assert {len(s) for s in ids.values()} == {7}


def test_aggregate_merges_palettes_and_counts():
    agg = aggregate(board())
    assert agg["palette"][0]["share"] >= agg["palette"][-1]["share"]
    assert len(agg["palette"]) <= 8
    top = {f["value"]: f["count"] for f in agg["fonts"]}
    assert top["Space Grotesk"] == 2 and top["Inter"] == 2
    assert agg["components"][0]["value"] == "card" and agg["components"][0]["count"] == 2


def test_unknown_citations_are_stripped():
    b = board()
    good = f"[ref:{b.short[A]}]"
    assert clean_body(f"Pink {good} and fake [ref:deadbeef]", b) == f"Pink {good} and fake"


def test_grouped_citations_are_split_and_validated():
    b = board()
    a, c = b.short[A], b.short[C]
    out = clean_body(f"x [ref:{a}, ref:{c}] y [ref:{a}, deadbeef]", b)
    assert out == f"x [ref:{a}] [ref:{c}] y [ref:{a}]"


def test_model_headings_cannot_split_the_document():
    b = board()
    body = "## Color palette\n\nIntro\n\n## Primary\n- pink\n### Notes\nok"
    out = clean_body(body, b, "Color palette")
    assert not out.startswith("#") and "### Primary" in out and "### Notes" in out
    assert clean_body("### Color Palette\nx", b, "Color palette") == "x"  # repeated title, any level
    assert clean_body("### Primary colours\nx", b, "Color palette").startswith("### Primary colours")
    md = assemble(b, {k: f"AI {k}" for k, _, _ in SECTIONS})
    out = replace_section(md, "Color palette", clean_body("## 2. Color palette\n\nNEW", b, "Color palette"))
    assert [t for t, _ in split_sections(out)[1]] == [t for _, t, _ in SECTIONS]


def test_spacing_stays_single_blank_lines_after_many_passes():
    b = board()
    md = with_reference_map(assemble(b, {k: f"AI {k}\n\n\n" for k, _, _ in SECTIONS}), b)
    for _ in range(3):
        md = with_reference_map(replace_section(md, "Typography", "NEW\n\n"), b)
    assert "\n\n\n" not in md


def test_blank_line_after_heading_survives_round_trip():
    b = board()
    md = assemble(b, {k: f"AI {k}" for k, _, _ in SECTIONS})
    out = replace_section(md, "Typography", "NEW")
    assert "## 1. Overall design direction\n\nAI direction" in out
    assert "## 3. Typography\n\nNEW" in out


def test_assemble_has_fixed_section_order_and_reference_map():
    b = board()
    md = with_reference_map(assemble(b, {k: f"Body {k} [ref:{b.short[A]}]" for k, _, _ in SECTIONS}), b)
    _, parts = split_sections(md)
    assert [t for t, _ in parts] == [t for _, t, _ in SECTIONS] + [KEY_REFS, REF_MAP]
    ref_map = parts[-1][1]
    assert "§1, §2" in ref_map  # A cited in every section
    assert "Pastel / site" in ref_map  # pipes escaped in titles
    assert md.count(f"## {len(SECTIONS) + 2}. Reference map") == 1


def test_replace_section_keeps_user_edits_elsewhere():
    b = board()
    md = assemble(b, {k: f"AI {k}" for k, _, _ in SECTIONS}).replace("AI direction", "MY EDITED DIRECTION")
    out = replace_section(md, "Color palette", "NEW PALETTE")
    assert "MY EDITED DIRECTION" in out and "NEW PALETTE" in out and "AI palette" not in out
    assert out.index("NEW PALETTE") < out.index("## 3. Typography")


def test_reference_map_rebuilt_not_duplicated():
    b = board()
    md = with_reference_map(with_reference_map(assemble(b, {"direction": f"x [ref:{b.short[C]}]"}), b), b)
    assert md.count("Reference map") == 1


def test_draft_is_cited_and_has_tokens():
    b = board()
    d = draft_sections(b)
    assert set(d) == {k for k, _, _ in SECTIONS}
    assert CITE.search(d["palette"]) and "--color-primary:" in d["implementation"]
    assert all(s in b.long for s in CITE.findall("\n".join(d.values())))


def test_groq_batches_cover_every_section_once_and_fit_one_request():
    from worker.spec import CHARS_PER_TOKEN, GROQ_REQUEST_TOKENS, SECTION_BATCHES, SYSTEM, _room

    keys = [k for batch, _ in SECTION_BATCHES for k in batch]
    assert sorted(keys) == sorted(k for k, _, _ in SECTIONS) and len(keys) == len(set(keys))
    for _, out_tokens in SECTION_BATCHES:
        fixed = "x" * 3000  # header + aggregates + earlier sections
        prompt_tokens = (len(SYSTEM) + len(fixed) + _room(out_tokens, fixed)) / CHARS_PER_TOKEN
        assert prompt_tokens + out_tokens + 400 <= GROQ_REQUEST_TOKENS + 1


def test_failure_reason_reads_quota_errors():
    from worker.spec import failure_reason

    assert "daily limit" in failure_reason(["Error code: 429 - Rate limit reached ... tokens per day (TPD): Limit 200000"])
    assert "too large" in failure_reason(["Error code: 413 - Request too large for model"])
    assert "rate-limiting" in failure_reason(["Error code: 429 - Rate limit reached on tokens per minute"])


def test_key_references_embed_public_images_and_point_to_stored_ones():
    from worker.spec import key_references

    b = board()
    b.refs[A]["type"], b.refs[A]["source_url"] = "image", "https://i.pinimg.com/originals/aa/bb/cc/x.jpg"
    b.analyses[A] = {**b.analyses.get(A, {}), "caption": "Neon dashboard", "palette": ["#0f0f1a"],
                     "inferred": {"styles": [{"key": "cyberpunk", "name": "Cyberpunk / Neon", "score": 0.5}]}}
    section = key_references(b)
    assert "![Neon dashboard](https://i.pinimg.com/originals/aa/bb/cc/x.jpg)" in section
    assert "**Style:** Cyberpunk / Neon" in section and "`#0f0f1a`" in section
    others = [r for r in b.refs if r != A]
    assert all(f"(ref:{b.short[r]})" in section for r in others)  # no public file: the stored image's id
    assert "get_references" in section


def test_a_cluster_design_md_is_titled_and_scoped_to_its_style():
    from worker.spec import Focus

    b = board()
    b.focus = Focus(cluster_id="c1", name="Neo-Brutalism", look="thick black outlines, hard offset drop shadows")
    md = assemble(b, {k: "x" for k, _, _ in SECTIONS})
    assert md.startswith("# design.md — Neo-Brutalism")
    assert "“Neo-Brutalism” cluster on board “Test”" in md
    assert "ONE style family only: “Neo-Brutalism” — thick black outlines" in b.focus_line()


def test_md_url_keeps_only_web_links_and_brackets_awkward_ones():
    assert md_url("https://ex.com/a.png") == "https://ex.com/a.png"
    assert md_url("https://ex.com/a (1).png") == "<https://ex.com/a (1).png>"
    assert md_url("javascript:alert(1)") == ""
    assert md_url("https://ex.com/a>b") == ""
    assert md_url("https://ex.com/a\nb") == ""
    assert md_url(None) == ""
