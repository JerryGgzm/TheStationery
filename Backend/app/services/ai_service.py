"""AI-backed helpers: letter summaries and (placeholder) safety moderation.

All LLM access goes through OpenRouter. When OpenRouter isn't configured (e.g.
local dev without a key) these degrade gracefully so the core flow still works.
"""

from __future__ import annotations

import logging

from app.services import openrouter_client

logger = logging.getLogger("stationery.ai")

_SUMMARY_SYSTEM = (
    "You write a single-sentence teaser for a handwritten letter, shown on a "
    "card in a cozy pixel bookstore. Capture the emotional heart in under 20 "
    "words. No quotes, no preamble, just the sentence."
)


def _fallback_summary(body: str, limit: int = 140) -> str:
    text = " ".join(body.split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


async def summarize_letter(body: str) -> str:
    """Short excerpt shown on wall/board cards (public_letters.summary)."""
    if not openrouter_client.is_configured():
        return _fallback_summary(body)
    try:
        text = await openrouter_client.chat(
            [
                {"role": "system", "content": _SUMMARY_SYSTEM},
                {"role": "user", "content": body},
            ],
            temperature=0.7,
            max_tokens=60,
        )
        return text[:280] or _fallback_summary(body)
    except Exception as exc:  # noqa: BLE001
        logger.warning("summarize_letter failed, using fallback: %s", exc)
        return _fallback_summary(body)


_MODERATION_SYSTEM = (
    "You are a content-safety classifier for a gentle pen-pal letter app. "
    "Decide if the letter clearly violates policy: sexual content involving "
    "minors, credible threats or incitement of violence, harassment or hate, "
    "or instructions for serious self-harm. Ordinary sadness, venting, or "
    "romance between adults is ALLOWED. Reply with exactly one word: SAFE or "
    "UNSAFE."
)


async def is_content_safe(text: str) -> bool:
    """Pre-publish moderation. Fail-open only when OpenRouter isn't configured
    (local dev); otherwise a model verdict of UNSAFE blocks publishing (422)."""
    if not openrouter_client.is_configured():
        return True
    try:
        verdict = await openrouter_client.chat(
            [
                {"role": "system", "content": _MODERATION_SYSTEM},
                {"role": "user", "content": text},
            ],
            temperature=0.0,
            max_tokens=4,
        )
    except Exception as exc:  # noqa: BLE001
        # Don't hard-block users on a transient moderation outage.
        logger.warning("moderation call failed, allowing: %s", exc)
        return True
    return "UNSAFE" not in verdict.strip().upper()
