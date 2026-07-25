"""AI reply queue: enqueue jobs and drain them (the worker behind
`POST /internal/jobs/process-ai-replies`)."""

from __future__ import annotations

import logging
import random
from datetime import datetime, timedelta, timezone

import asyncpg

from app.config import get_settings
from app.repositories import (
    ai_characters_repo,
    ai_jobs_repo,
    conversations_repo,
    letters_repo,
    messages_repo,
)
from app.services import ai_service, openrouter_client

logger = logging.getLogger("stationery.aijobs")

_MAX_CONTEXT_MESSAGES = 20


def _human_like_delay() -> timedelta:
    """A randomized short delay so the AI doesn't reply instantly (feels human)."""
    settings = get_settings()
    lo = max(0, settings.AI_REPLY_MIN_DELAY_MINUTES)
    hi = max(lo, settings.AI_REPLY_MAX_DELAY_MINUTES)
    return timedelta(minutes=random.randint(lo, hi))


async def assign_unanswered_letters(pool: asyncpg.Pool) -> dict:
    """Producer for「公开信无人回 → 派 AI」: scan published public letters that
    nobody answered within the grace window and enqueue one AI reply job each.

    Idempotent & safe to run frequently: the candidate query excludes letters
    that already have a conversation or a queued/running/done AI job, so a letter
    is assigned at most once. The `process-ai-replies` worker then generates the
    reply, lazily creating the AI conversation.
    """
    settings = get_settings()
    result = {"candidates": 0, "assigned": 0, "skipped_no_character": 0}

    async with pool.acquire() as conn:
        async with conn.transaction():
            letters = await letters_repo.list_unanswered_public(
                conn,
                grace_hours=settings.AI_UNANSWERED_GRACE_HOURS,
                limit=settings.AI_ASSIGN_BATCH_LIMIT,
            )
            result["candidates"] = len(letters)
            for letter in letters:
                pick = await ai_characters_repo.pick_random_active_with_prompt(conn)
                if pick is None:
                    # No seeded/active character with an active prompt — nothing
                    # we can assign this run. Stop early (applies to all letters).
                    logger.warning(
                        "assign_unanswered_letters: no active AI character with an "
                        "active prompt; %d candidate(s) left unassigned",
                        len(letters) - result["assigned"],
                    )
                    result["skipped_no_character"] = len(letters) - result["assigned"]
                    break
                scheduled_for = datetime.now(timezone.utc) + _human_like_delay()
                await ai_jobs_repo.enqueue(
                    conn,
                    ai_character_id=str(pick["ai_character_id"]),
                    prompt_version_id=str(pick["prompt_version_id"]),
                    trigger_reason="unanswered_public_letter",
                    scheduled_for=scheduled_for,
                    root_letter_id=str(letter["id"]),
                )
                result["assigned"] += 1
    logger.info("assign_unanswered_letters: %s", result)
    return result


async def enqueue_conversation_reply(
    conn: asyncpg.Connection,
    *,
    conversation_id: str,
    ai_character_id: str,
    prompt_version_id: str,
    reply_to_message_id: str,
    scheduled_for,
) -> None:
    await ai_jobs_repo.enqueue(
        conn,
        ai_character_id=ai_character_id,
        prompt_version_id=prompt_version_id,
        trigger_reason="conversation_reply",
        scheduled_for=scheduled_for,
        conversation_id=conversation_id,
        reply_to_message_id=reply_to_message_id,
    )


async def _build_prompt(conn, job) -> tuple[list[dict], str]:
    """Return (chat messages, system_prompt) for the LLM call."""
    prompt = await ai_characters_repo.get_active_prompt(
        conn, str(job["ai_character_id"])
    )
    system_prompt = prompt["system_prompt"] if prompt else "You are a kind pen pal."

    chat: list[dict] = [{"role": "system", "content": system_prompt}]

    if job["conversation_id"] is not None:
        conversation = await conversations_repo.get_by_id(
            conn, str(job["conversation_id"])
        )
        root = await letters_repo.get_by_id(conn, str(conversation["root_letter_id"]))
        if root:
            chat.append(
                {"role": "user", "content": f"The letter you received:\n\n{root['body']}"}
            )
        history = await messages_repo.list_for_conversation(
            conn, str(job["conversation_id"])
        )
        for m in history[-_MAX_CONTEXT_MESSAGES:]:
            role = "assistant" if m["sender_type"] == "ai_character" else "user"
            chat.append({"role": role, "content": m["body"]})
    else:
        root = await letters_repo.get_by_id(conn, str(job["root_letter_id"]))
        if root:
            chat.append(
                {"role": "user", "content": f"The letter you received:\n\n{root['body']}"}
            )
    return chat, system_prompt


async def _process_one(pool: asyncpg.Pool, job) -> str:
    """Generate one AI reply. Returns 'completed' | 'failed' | 'blocked'."""
    async with pool.acquire() as conn:
        chat, _ = await _build_prompt(conn, job)

    try:
        reply = await openrouter_client.chat(chat)
    except Exception as exc:  # noqa: BLE001
        logger.warning("AI job %s generation failed: %s", job["id"], exc)
        async with pool.acquire() as conn:
            await ai_jobs_repo.mark_failed(conn, str(job["id"]), str(exc))
        return "failed"

    if not await ai_service.is_content_safe(reply):
        async with pool.acquire() as conn:
            await ai_jobs_repo.mark_failed(
                conn, str(job["id"]), "unsafe_output", blocked=True
            )
        return "blocked"

    model_name = get_settings().OPENROUTER_MODEL
    async with pool.acquire() as conn:
        async with conn.transaction():
            conversation_id = job["conversation_id"]
            if conversation_id is None:
                root = await letters_repo.get_by_id(conn, str(job["root_letter_id"]))
                conversation = await conversations_repo.create_ai_conversation(
                    conn,
                    root_letter_id=str(root["id"]),
                    letter_author_user_id=str(root["author_user_id"]),
                    responder_ai_character_id=str(job["ai_character_id"]),
                )
                conversation_id = conversation["id"]
            message = await messages_repo.insert_ai_message(
                conn,
                conversation_id=str(conversation_id),
                sender_ai_character_id=str(job["ai_character_id"]),
                body=reply,
                reply_to_message_id=str(job["reply_to_message_id"])
                if job["reply_to_message_id"]
                else None,
            )
            await ai_jobs_repo.mark_completed(
                conn, str(job["id"]), str(message["id"]), model_name
            )
    return "completed"


async def process_ai_replies(pool: asyncpg.Pool, limit: int = 20) -> dict:
    async with pool.acquire() as conn:
        async with conn.transaction():
            jobs = await ai_jobs_repo.claim_due(conn, limit)

    summary = {"claimed": len(jobs), "completed": 0, "failed": 0, "blocked": 0}
    for job in jobs:
        result = await _process_one(pool, job)
        summary[result] = summary.get(result, 0) + 1
    return summary
