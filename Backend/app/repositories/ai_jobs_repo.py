"""Repository: `ai_response_jobs` — the queue the AI-reply worker drains."""

from __future__ import annotations

import asyncpg

_COLUMNS = (
    "id, root_letter_id, conversation_id, reply_to_message_id, ai_character_id, "
    "prompt_version_id, trigger_reason, status, scheduled_for, model_name, retry_count, "
    "output_message_id"
)


async def enqueue(
    conn: asyncpg.Connection,
    *,
    ai_character_id: str,
    prompt_version_id: str,
    trigger_reason: str,
    scheduled_for,
    root_letter_id: str | None = None,
    conversation_id: str | None = None,
    reply_to_message_id: str | None = None,
) -> asyncpg.Record:
    return await conn.fetchrow(
        f"""
        insert into public.ai_response_jobs
            (root_letter_id, conversation_id, reply_to_message_id, ai_character_id,
             prompt_version_id, trigger_reason, status, scheduled_for)
        values ($1, $2, $3, $4, $5, $6, 'scheduled', $7)
        returning {_COLUMNS}
        """,
        root_letter_id,
        conversation_id,
        reply_to_message_id,
        ai_character_id,
        prompt_version_id,
        trigger_reason,
        scheduled_for,
    )


async def claim_due(conn: asyncpg.Connection, limit: int = 20) -> list[asyncpg.Record]:
    """Atomically mark due scheduled jobs as processing and return them.

    `for update skip locked` lets multiple workers run without double-processing.
    """
    # `due` aliases its id to `due_id` so the RETURNING column list (`_COLUMNS`,
    # which starts with a bare `id`) isn't ambiguous across `j` and the CTE.
    return await conn.fetch(
        f"""
        with due as (
            select id as due_id from public.ai_response_jobs
            where status = 'scheduled' and scheduled_for <= now()
            order by scheduled_for asc
            limit $1
            for update skip locked
        )
        update public.ai_response_jobs j
        set status = 'processing', started_at = now()
        from due
        where j.id = due.due_id
        returning {_COLUMNS}
        """,
        limit,
    )


async def mark_completed(
    conn: asyncpg.Connection, job_id: str, output_message_id: str, model_name: str | None
) -> None:
    await conn.execute(
        """
        update public.ai_response_jobs
        set status = 'completed', completed_at = now(),
            output_message_id = $2, model_name = $3
        where id = $1
        """,
        job_id,
        output_message_id,
        model_name,
    )


async def mark_failed(
    conn: asyncpg.Connection, job_id: str, error_code: str, *, blocked: bool = False
) -> None:
    await conn.execute(
        """
        update public.ai_response_jobs
        set status = $3, completed_at = now(),
            error_code = $2, retry_count = retry_count + 1
        where id = $1
        """,
        job_id,
        error_code[:128],
        "blocked_by_safety" if blocked else "failed",
    )
