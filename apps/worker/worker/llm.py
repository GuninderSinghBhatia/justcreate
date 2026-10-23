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
_gemini_client = None
RETRY_WAITS = (3, 8)  # seconds between in-job retries on 429/5xx


def structured(settings: Settings, task: str, system: str, text: str, schema: type[T],
               image: Image.Image | None = None) -> T:
    """`task` is "analysis" (cheap, per reference) or "naming" (per clustering run)."""
    jpeg = _jpeg(image) if image is not None else None
    if settings.provider == "anthropic":
        return _claude(settings, task, system, text, schema, jpeg)
    if settings.provider == "gemini":
        return _gemini(settings, task, system, text, schema, jpeg)
    raise RuntimeError("no LLM provider configured")


def _claude(settings: Settings, task: str, system: str, text: str, schema: type[T], jpeg: bytes | None) -> T:
    import anthropic

    content: list[dict] = []
    if jpeg:
        content.append({"type": "image", "source": {"type": "base64", "media_type": "image/jpeg",
                                                    "data": base64.standard_b64encode(jpeg).decode("ascii")}})
    content.append({"type": "text", "text": text})
    response = anthropic.Anthropic(api_key=settings.anthropic_api_key).messages.parse(
        model=settings.analysis_model if task == "analysis" else settings.naming_model,
        max_tokens=4000,
        system=system,
        output_config={"effort": "low"},  # tagging and naming: fast and cheap is enough
        messages=[{"role": "user", "content": content}],
        output_format=schema,
    )
    if response.stop_reason == "refusal" or response.parsed_output is None:
        raise RuntimeError(f"Claude returned no structured output (stop_reason={response.stop_reason})")
    return response.parsed_output


def _gemini(settings: Settings, task: str, system: str, text: str, schema: type[T], jpeg: bytes | None) -> T:
    from google import genai
    from google.genai import errors, types

    global _gemini_client
    # Keep one client: the SDK closes its HTTP client when the Client object is garbage-collected.
    _gemini_client = _gemini_client or genai.Client(api_key=settings.gemini_api_key)
    parts = [types.Part.from_bytes(data=jpeg, mime_type="image/jpeg")] if jpeg else []
    config = types.GenerateContentConfig(
        system_instruction=system, response_mime_type="application/json", response_schema=schema,
    )
    for wait in (*RETRY_WAITS, None):
        try:
            response = _gemini_client.models.generate_content(
                model=settings.gemini_model if task == "analysis" else settings.gemini_naming_model,
                contents=[*parts, text], config=config,
            )
            break
        except errors.APIError as err:
            # Overloaded / rate-limited: short in-job retries, then the job queue's backoff.
            if wait is None or err.code not in (429, 500, 503):
                raise
            time.sleep(wait)
    if isinstance(response.parsed, schema):
        return response.parsed
    if response.text:
        return schema.model_validate_json(response.text)
    raise RuntimeError(f"Gemini returned no structured output ({task})")


def _jpeg(image: Image.Image) -> bytes:
    img = image.convert("RGB")
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()
