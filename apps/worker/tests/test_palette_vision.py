from PIL import Image

from worker.palette import extract_palette
from worker.vision import analyze_heuristic


def two_tone(a, b, split=0.7):
    img = Image.new("RGB", (100, 100), a)
    img.paste(Image.new("RGB", (100, int(100 * (1 - split))), b), (0, int(100 * split)))
    return img


def test_palette_finds_both_colours_largest_first():
    palette = extract_palette(two_tone((230, 40, 90), (20, 20, 20)))
    assert palette[0] == "#e6285a"
    assert "#141414" in palette
    assert len(palette) == 2  # duplicates merged, no phantom colours


def test_palette_drops_tiny_specks():
    img = Image.new("RGB", (100, 100), (255, 255, 255))
    img.putpixel((0, 0), (255, 0, 0))
    assert extract_palette(img) == ["#ffffff"]


def test_heuristic_tags_from_metadata_and_palette():
    result = analyze_heuristic(["#101010", "#202020"], {"type": "screenshot", "title": "Neon Dashboard Concepts", "host": "dribbble.com"})
    assert "dark" in result.style_tags
    assert "dribbble.com" in result.style_tags
    assert "neon" in result.style_tags
    assert result.observed.colors == ["#101010", "#202020"]
