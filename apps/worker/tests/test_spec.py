from worker.spec import (
    CITE, REF_MAP, SECTIONS, Board, aggregate, assemble, clean_body, draft_sections, replace_section,
    short_ids, split_sections, with_reference_map,
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
    assert [t for t, _ in parts] == [t for _, t, _ in SECTIONS] + [REF_MAP]
    ref_map = parts[-1][1]
    assert "§1, §2" in ref_map  # A cited in every section
    assert "Pastel / site" in ref_map  # pipes escaped in titles
    assert md.count("## 10. Reference map") == 1


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
