"""One structured-output call over whichever LLM is configured (Claude or Gemini).

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


def model_for(settings: Settings, task: str) -> str:
    """"analysis" runs once per reference (cheap model); "naming" and "spec" use the stronger one."""
    if settings.provider == "anthropic":
        return settings.analysis_model if task == "analysis" else settings.naming_model
    return settings.gemini_model if task == "analysis" else settings.gemini_naming_model


def structured(settings: Settings, task: str, system: str, text: str, schema: type[T],
               images: list[Image.Image] | None = None, model: str | None = None) -> T:
    jpegs = [_jpeg(i) for i in images or []]
    model = model or model_for(settings, task)
    if settings.provider == "anthropic":
        return _claude(settings, model, task, system, text, schema, jpegs)
    if settings.provider == "gemini":
        return _gemini(settings, model, system, text, schema, jpegs)
    raise RuntimeError("no LLM provider configured")


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


def _jpeg(image: Image.Image) -> bytes:
    img = image.convert("RGB")
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()
