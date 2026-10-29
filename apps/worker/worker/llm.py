"""One structured-output call over whichever LLM is configured (Claude, Groq or Gemini).

Both providers return a validated Pydantic object, so callers don't care which one ran.
"""

from __future__ import annotations

import base64
import io
import time
from typing import TypeVar

from PIL import Image
from pydantic import BaseModel

from .config import Settings

T = TypeVar("T", bound=BaseModel)
MAX_SIDE = 1024  # resize images before sending: cheaper, and enough detail for style analysis
RETRY_WAITS = (3, 8)  # seconds between in-job retries on 429/5xx
_gemini_client = None
_groq_client = None


def model_for(settings: Settings, task: str) -> str:
    """"analysis" runs once per reference (cheap model); "naming" and "spec" use the stronger one."""
    if settings.provider == "anthropic":
        return settings.analysis_model if task == "analysis" else settings.naming_model
    if settings.provider == "groq":
        return settings.groq_vision_model if task == "analysis" else settings.groq_text_model
    return settings.gemini_model if task == "analysis" else settings.gemini_naming_model


def prompt_budget(settings: Settings) -> int:
    """Characters of reference detail a spec prompt may use. Groq's free tier caps a request
    at ~8k tokens per minute (input + output), so its prompts must stay small."""
    return 9_000 if settings.provider == "groq" else 60_000


def structured(settings: Settings, task: str, system: str, text: str, schema: type[T],
               images: list[Image.Image] | None = None, model: str | None = None) -> T:
    model = model or model_for(settings, task)
    if settings.provider == "groq":
        # Only the vision model takes images; smaller images keep Groq's per-minute token budget.
        jpegs = [_jpeg(i, 768) for i in images or []] if model == settings.groq_vision_model else []
        return _groq(settings, model, task, system, text, schema, jpegs)
    jpegs = [_jpeg(i) for i in images or []]
    if settings.provider == "anthropic":
        return _claude(settings, model, task, system, text, schema, jpegs)
    if settings.provider == "gemini":
        return _gemini(settings, model, system, text, schema, jpegs)
    raise RuntimeError("no LLM provider configured")


def _groq(settings: Settings, model: str, task: str, system: str, text: str, schema: type[T], jpegs: list[bytes]) -> T:
    from groq import Groq

    global _groq_client
    # The SDK waits out 429s itself (honouring retry-after), which free-tier per-minute limits need.
    _groq_client = _groq_client or Groq(api_key=settings.groq_api_key, max_retries=6, timeout=180)
    content: str | list[dict] = text
    if jpegs:
        content = [
            *({"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + base64.standard_b64encode(j).decode("ascii")}} for j in jpegs),
            {"type": "text", "text": text},
        ]
    extra: dict = {}
    if model.startswith("qwen/"):
        extra["reasoning_format"] = "hidden"  # otherwise strict JSON decoding returns empty strings
    response = _groq_client.chat.completions.create(
        model=model,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": content}],
        response_format={"type": "json_schema", "json_schema": {"name": schema.__name__, "schema": strict_schema(schema), "strict": True}},
        max_completion_tokens=6000 if task == "spec" else 2500,
        **extra,
    )
    out = response.choices[0].message.content
    if not out:
        raise RuntimeError(f"Groq returned no structured output ({model}, finish={response.choices[0].finish_reason})")
    return schema.model_validate_json(out)


def strict_schema(model: type[BaseModel]) -> dict:
    """Pydantic JSON schema → strict-mode schema: $refs inlined, every property required,
    no additional properties."""
    raw = model.model_json_schema()
    defs = raw.pop("$defs", {})

    def walk(node):
        if isinstance(node, dict):
            if "$ref" in node:
                return walk(defs[node["$ref"].split("/")[-1]])
            node = {k: walk(v) for k, v in node.items() if k != "title"}
            if node.get("type") == "object" and "properties" in node:
                node["required"] = list(node["properties"])
                node["additionalProperties"] = False
            return node
        if isinstance(node, list):
            return [walk(v) for v in node]
        return node

    return walk(raw)


def _claude(settings: Settings, model: str, task: str, system: str, text: str, schema: type[T], jpegs: list[bytes]) -> T:
    import anthropic

    content: list[dict] = [
        {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg",
                                     "data": base64.standard_b64encode(j).decode("ascii")}}
        for j in jpegs
    ]
    content.append({"type": "text", "text": text})
    response = anthropic.Anthropic(api_key=settings.anthropic_api_key).messages.parse(
        model=model,
        max_tokens=16000,
        system=system,
        # Tagging and naming: fast is enough. The spec is the product: give it more thought.
        output_config={"effort": "medium" if task == "spec" else "low"},
        messages=[{"role": "user", "content": content}],
        output_format=schema,
    )
    if response.stop_reason == "refusal" or response.parsed_output is None:
        raise RuntimeError(f"Claude returned no structured output (stop_reason={response.stop_reason})")
    return response.parsed_output


def _gemini(settings: Settings, model: str, system: str, text: str, schema: type[T], jpegs: list[bytes]) -> T:
    from google import genai
    from google.genai import errors, types

    global _gemini_client
    # Keep one client: the SDK closes its HTTP client when the Client object is garbage-collected.
    _gemini_client = _gemini_client or genai.Client(api_key=settings.gemini_api_key)
    parts = [types.Part.from_bytes(data=j, mime_type="image/jpeg") for j in jpegs]
    config = types.GenerateContentConfig(
        system_instruction=system, response_mime_type="application/json", response_schema=schema,
    )
    for wait in (*RETRY_WAITS, None):
        try:
            response = _gemini_client.models.generate_content(model=model, contents=[*parts, text], config=config)
            break
        except errors.APIError as err:
            # Overloaded / rate-limited: short in-job retries, then the caller's fallback or the queue's backoff.
            if wait is None or err.code not in (429, 500, 503):
                raise
            time.sleep(wait)
    if isinstance(response.parsed, schema):
        return response.parsed
    if response.text:
        return schema.model_validate_json(response.text)
    raise RuntimeError(f"Gemini returned no structured output ({model})")


def _jpeg(image: Image.Image, max_side: int = MAX_SIDE) -> bytes:
    img = image.convert("RGB")
    img.thumbnail((max_side, max_side))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()
