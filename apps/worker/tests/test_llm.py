from dataclasses import replace

from worker.config import Settings
from worker.llm import model_for, prompt_budget, strict_schema
from worker.spec import reference_lines
from worker.vision import ReferenceAnalysis

from test_spec import A, B, C, board

BASE = Settings(
    supabase_url="https://x.supabase.co", supabase_secret_key="k", anthropic_api_key=None, gemini_api_key=None,
    groq_api_key=None, llm_provider=None, analysis_model="claude-haiku-5-5", naming_model="claude-sonnet-5-5",
    gemini_model="gemini-lite", gemini_naming_model="gemini-flash", groq_vision_model="qwen/q", groq_text_model="openai/gpt-oss",
    clip_model="ViT-B-32", clip_pretrained="x", poll_seconds=5, max_attempts=5,
)


def test_provider_order_and_override():
    assert BASE.provider is None and BASE.analysis_model_name == "heuristic-v1"
    both = replace(BASE, gemini_api_key="g", groq_api_key="q")
    assert both.provider == "groq"  # Claude > Groq > Gemini by default
    assert replace(both, llm_provider="gemini").provider == "gemini"
    assert replace(BASE, gemini_api_key="g", llm_provider="groq").provider == "gemini"  # override needs its key


def test_groq_models_by_task():
    groq = replace(BASE, groq_api_key="q")
    assert model_for(groq, "analysis") == "qwen/q"  # needs vision
    assert model_for(groq, "spec") == model_for(groq, "naming") == "openai/gpt-oss"
    assert prompt_budget(groq) < prompt_budget(replace(BASE, gemini_api_key="g"))


def test_strict_schema_inlines_and_requires_everything():
    s = strict_schema(ReferenceAnalysis)
    assert "$defs" not in str(s) and "$ref" not in str(s)
    assert s["additionalProperties"] is False and set(s["required"]) == set(s["properties"])
    observed = s["properties"]["observed"]
    assert observed["type"] == "object" and observed["additionalProperties"] is False
    assert set(observed["required"]) == set(observed["properties"])


def test_reference_lines_respect_budget_and_put_cluster_members_first():
    b = board()
    full = reference_lines(b)
    assert full.count("[ref:") == 3
    first = full.splitlines()[0]
    assert b.short[A] in first  # first member of the first group comes first
    tight = reference_lines(b, budget=len(first) + 5)
    assert tight.count("[ref:") == 1 and "+2 more references" in tight
    assert {b.short[B], b.short[C]}.isdisjoint(set(tight.split("[ref:")[1:2]))
