"""OpenRouter client (OpenAI-compatible chat completions).

Thin async wrapper over httpx. A single AsyncClient is reused across requests.
"""

from __future__ import annotations

import logging

import httpx

from app.config import get_settings

logger = logging.getLogger("stationery.openrouter")

_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        settings = get_settings()
        headers = {"Authorization": f"Bearer {settings.OPENROUTER_API_KEY}"}
        if settings.OPENROUTER_HTTP_REFERER:
            headers["HTTP-Referer"] = settings.OPENROUTER_HTTP_REFERER
        if settings.OPENROUTER_APP_TITLE:
            headers["X-Title"] = settings.OPENROUTER_APP_TITLE
        _client = httpx.AsyncClient(
            base_url=settings.OPENROUTER_BASE_URL,
            headers=headers,
            timeout=httpx.Timeout(60.0, connect=10.0),
        )
    return _client


async def aclose() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


def is_configured() -> bool:
    return bool(get_settings().OPENROUTER_API_KEY)


async def chat(
    messages: list[dict],
    *,
    model: str | None = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
) -> str:
    """Run a chat completion and return the assistant text."""
    settings = get_settings()
    payload = {
        "model": model or settings.OPENROUTER_MODEL,
        "messages": messages,
        "temperature": settings.LLM_TEMPERATURE if temperature is None else temperature,
        "max_tokens": settings.LLM_MAX_TOKENS if max_tokens is None else max_tokens,
    }
    resp = await _get_client().post("/chat/completions", json=payload)
    resp.raise_for_status()
    data = resp.json()
    return data["choices"][0]["message"]["content"].strip()
