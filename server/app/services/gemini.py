"""Gemini on Vertex AI (spec §15.1, AGENT_PROMPTS.md A2–A3). The only module that talks to the model.

- `google-genai` in Vertex mode; credentials from the service-account key file named in `.env` (project read from the key file),
  location `global`, model `GEMINI_MODEL`. The key is never logged or sent anywhere but Google's auth endpoint.
- Every call is structured: `response_mime_type="application/json"` + a Pydantic `response_schema`. The text is validated with the
  same model; on a validation error the call is retried ONCE with the error appended; after that the caller falls back.
- Transport errors (timeouts, 429, 5xx) are retried with backoff 1 s, 2 s, 4 s (+ jitter), up to GEMINI_MAX_RETRIES.
- Images are re-encoded to WebP, longest side ≤ 1280 px, before they are sent (token discipline).
- Each attempt is recorded (rendered prompt, raw response, tokens, latency) in a `CallRecord` that the pipeline run stores for the
  Dev Tools inspector.

Tests replace `_transport` (one model request) so no network is ever used in pytest.
"""
from __future__ import annotations

import asyncio
import io
import logging
import random
import time
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any, Awaitable, Callable

from PIL import Image, ImageOps
from pydantic import BaseModel, ValidationError

from ..config import get_settings

log = logging.getLogger("amc.gemini")

THINKING = {"low": "LOW", "medium": "MEDIUM", "high": "HIGH", "minimal": "MINIMAL"}
BACKOFF_S = (1, 2, 4)
MAX_IMAGE_SIDE = 1280

# Runtime LLM mode set from Dev Tools (None → the .env value). Kept in memory and mirrored to data/runtime_settings.json by the router.
_mode_override: str | None = None


class GeminiError(RuntimeError):
    """The step could not get a valid answer from the model (after retries). The caller falls back."""

    def __init__(self, message: str, *, kind: str = "error"):
        super().__init__(message)
        self.kind = kind   # unavailable | transport | schema | error


@dataclass
class CallRecord:
    agent: str
    model: str
    prompt: str = ""
    attempts: list[dict] = field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0
    thinking_tokens: int = 0
    latency_ms: int = 0
    ok: bool = False
    error: str | None = None
    media: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {"agent": self.agent, "model": self.model, "prompt": self.prompt, "attempts": self.attempts, "media": self.media,
                "input_tokens": self.input_tokens, "output_tokens": self.output_tokens, "thinking_tokens": self.thinking_tokens,
                "total_tokens": self.input_tokens + self.output_tokens + self.thinking_tokens,
                "latency_ms": self.latency_ms, "ok": self.ok, "error": self.error}


# ------------------------------------------------------------------------------------------------ mode

def set_mode_override(mode: str | None) -> None:
    global _mode_override
    _mode_override = mode if mode in ("auto", "live", "demo") else None


def configured_mode() -> str:
    return _mode_override or get_settings().llm_mode


def effective_mode() -> str:
    """auto | live | demo. Without the key file only demo is possible."""
    return configured_mode() if get_settings().credentials_present else "demo"


def is_live() -> bool:
    return effective_mode() in ("auto", "live")


# ------------------------------------------------------------------------------------------------ client

@lru_cache(maxsize=1)
def _client():
    from google import genai
    from google.oauth2 import service_account

    s = get_settings()
    if not s.credentials_present:
        raise GeminiError("Vertex key file not found", kind="unavailable")
    creds = service_account.Credentials.from_service_account_file(
        str(s.credentials_path), scopes=["https://www.googleapis.com/auth/cloud-platform"])
    return genai.Client(vertexai=True, project=s.project_id, location=s.google_cloud_location, credentials=creds)


def reset_client() -> None:
    _client.cache_clear()


# ------------------------------------------------------------------------------------------------ media

@dataclass(frozen=True)
class MediaPart:
    data: bytes
    mime_type: str
    label: str            # e.g. "m_1 | front" — sent as a text part right before the media


def image_part(path_or_bytes, label: str) -> MediaPart:
    """WebP, longest side ≤ 1280 px (never upscaled), EXIF orientation applied."""
    im = Image.open(io.BytesIO(path_or_bytes) if isinstance(path_or_bytes, bytes) else path_or_bytes)
    im = ImageOps.exif_transpose(im).convert("RGB")
    im.thumbnail((MAX_IMAGE_SIDE, MAX_IMAGE_SIDE), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=82)
    return MediaPart(buf.getvalue(), "image/webp", label)


# ------------------------------------------------------------------------------------------------ transport

@dataclass
class RawResult:
    text: str
    input_tokens: int = 0
    output_tokens: int = 0
    thinking_tokens: int = 0


async def _default_transport(*, system: str, contents: list, schema: type[BaseModel], temperature: float, thinking: str | None,
                             max_output_tokens: int, timeout_s: float) -> RawResult:
    from google.genai import types

    parts: list = []
    for c in contents:
        if isinstance(c, MediaPart):
            parts.append(types.Part.from_text(text=c.label))
            parts.append(types.Part.from_bytes(data=c.data, mime_type=c.mime_type))
        else:
            parts.append(types.Part.from_text(text=str(c)))
    config = types.GenerateContentConfig(
        system_instruction=system, response_mime_type="application/json", response_schema=schema, temperature=temperature,
        max_output_tokens=max_output_tokens,
        thinking_config=types.ThinkingConfig(thinking_level=THINKING[thinking]) if thinking else None,
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
    )
    resp = await asyncio.wait_for(
        _client().aio.models.generate_content(model=get_settings().gemini_model, contents=[types.Content(role="user", parts=parts)],
                                              config=config),
        timeout=timeout_s)
    u = resp.usage_metadata
    return RawResult(text=resp.text or "", input_tokens=(u and u.prompt_token_count) or 0,
                     output_tokens=(u and u.candidates_token_count) or 0, thinking_tokens=(u and u.thoughts_token_count) or 0)


# Replaced in tests (and by Dev Tools' "force failure" switch) — signature of _default_transport.
_transport: Callable[..., Awaitable[RawResult]] = _default_transport
_forced_failures: set[str] = set()   # agent names whose next live calls fail (Dev Tools resilience demo)


def force_failure(agent: str, on: bool = True) -> None:
    (_forced_failures.add if on else _forced_failures.discard)(agent)


def forced_failures() -> list[str]:
    return sorted(_forced_failures)


def _retryable(exc: BaseException) -> bool:
    if isinstance(exc, (asyncio.TimeoutError, TimeoutError, ConnectionError)):
        return True
    code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
    return isinstance(code, int) and (code == 429 or code >= 500)


def _summ(exc: BaseException) -> str:
    text = str(exc) or exc.__class__.__name__
    return text[:300]


async def generate(*, agent: str, system: str, contents: list, schema: type[BaseModel], temperature: float,
                   thinking: str | None = None, max_output_tokens: int = 8192,
                   on_retry: Callable[[int, str], Awaitable[None]] | None = None) -> tuple[BaseModel, CallRecord]:
    """One structured call. Returns (validated model, record). Raises GeminiError (record attached as .record) when it gives up."""
    s = get_settings()
    rec = CallRecord(agent=agent, model=s.gemini_model, prompt=system,
                     media=[c.label for c in contents if isinstance(c, MediaPart)])
    if not is_live():
        err = GeminiError("LLM mode is demo", kind="unavailable")
        err.record = rec  # type: ignore[attr-defined]
        raise err

    msgs = list(contents)
    transport_tries, schema_retry_used = 0, False
    started = time.perf_counter()
    while True:
        t0 = time.perf_counter()
        attempt: dict[str, Any] = {"n": len(rec.attempts) + 1}
        try:
            if agent in _forced_failures:
                raise asyncio.TimeoutError(f"Forced failure for {agent} (Dev Tools)")
            raw = await _transport(system=system, contents=msgs, schema=schema, temperature=temperature, thinking=thinking,
                                   max_output_tokens=max_output_tokens, timeout_s=s.gemini_timeout_seconds)
        except Exception as exc:  # noqa: BLE001 — classified below
            attempt |= {"latency_ms": int((time.perf_counter() - t0) * 1000), "error": _summ(exc)}
            rec.attempts.append(attempt)
            if _retryable(exc) and transport_tries < min(s.gemini_max_retries, len(BACKOFF_S)):
                delay = BACKOFF_S[transport_tries] + (random.uniform(0, 0.3) if BACKOFF_S[transport_tries] else 0)
                transport_tries += 1
                if on_retry:
                    await on_retry(len(rec.attempts) + 1, f"{exc.__class__.__name__} — retrying in {delay:.0f} s")
                await asyncio.sleep(delay)
                continue
            rec.error, rec.latency_ms = _summ(exc), int((time.perf_counter() - started) * 1000)
            err = GeminiError(rec.error, kind="transport" if _retryable(exc) else "error")
            err.record = rec  # type: ignore[attr-defined]
            raise err from exc

        rec.input_tokens += raw.input_tokens
        rec.output_tokens += raw.output_tokens
        rec.thinking_tokens += raw.thinking_tokens
        attempt |= {"latency_ms": int((time.perf_counter() - t0) * 1000), "raw": raw.text[:20000],
                    "input_tokens": raw.input_tokens, "output_tokens": raw.output_tokens, "thinking_tokens": raw.thinking_tokens}
        try:
            parsed = schema.model_validate_json(raw.text)
        except ValidationError as exc:
            problem = "; ".join(f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors()[:6])
            attempt["error"] = f"Schema validation failed: {problem}"
            rec.attempts.append(attempt)
            if not schema_retry_used:
                schema_retry_used = True
                if on_retry:
                    await on_retry(len(rec.attempts) + 1, "Output did not match the schema — retrying with the error")
                msgs = list(contents) + [f"Your previous output failed validation: {problem}. Return ONE JSON object that matches the "
                                         "schema exactly."]
                continue
            rec.error, rec.latency_ms = attempt["error"], int((time.perf_counter() - started) * 1000)
            err = GeminiError(rec.error, kind="schema")
            err.record = rec  # type: ignore[attr-defined]
            raise err from exc
        rec.attempts.append(attempt)
        rec.ok, rec.latency_ms = True, int((time.perf_counter() - started) * 1000)
        log.info("gemini %s ok in %d ms (in %d / out %d / thinking %d tokens)", agent, rec.latency_ms, rec.input_tokens,
                 rec.output_tokens, rec.thinking_tokens)
        return parsed, rec


class _Ping(BaseModel):
    ok: bool
    reply: str


async def test_connection() -> dict:
    """Dev Tools "Test Vertex connection": one tiny structured call. Never returns secrets."""
    s = get_settings()
    if not s.credentials_present:
        return {"ok": False, "model": s.gemini_model, "message": "Key file not found — demo mode", "latency_ms": 0}
    t0 = time.perf_counter()
    try:
        raw = await _transport(system="Reply with ok=true and reply='pong'.", contents=["ping"], schema=_Ping, temperature=0,
                               thinking="low", max_output_tokens=256, timeout_s=s.gemini_timeout_seconds)
        out = _Ping.model_validate_json(raw.text)
        return {"ok": out.ok, "model": s.gemini_model, "location": s.google_cloud_location, "message": "Connected",
                "latency_ms": int((time.perf_counter() - t0) * 1000), "tokens": raw.input_tokens + raw.output_tokens + raw.thinking_tokens}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "model": s.gemini_model, "message": _summ(exc), "latency_ms": int((time.perf_counter() - t0) * 1000)}
