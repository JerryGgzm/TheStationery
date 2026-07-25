"""Repository: `public_letters` (carries both public and directed letters)."""

from __future__ import annotations

import asyncpg

_COLUMNS = (
    "id, author_user_id, subject, body, summary, audience, recipient_user_id, "
    "language_code, allow_human_replies, allow_ai_replies, status, published_at, "
    "closed_at, created_at, updated_at, deleted_at"
)


async def insert_draft(
    conn: asyncpg.Connection,
    *,
    author_user_id: str,
    body: str,
    subject: str | None,
    audience: str,
    recipient_user_id: str | None,
    language_code: str,
) -> asyncpg.Record:
    return await conn.fetchrow(
        f"""
        insert into public.public_letters
            (author_user_id, body, subject, audience, recipient_user_id, language_code, status)
        values ($1, $2, $3, $4, $5, $6, 'draft')
        returning {_COLUMNS}
        """,
        author_user_id,
        body,
        subject,
        audience,
        recipient_user_id,
        language_code,
    )


async def get_by_id(conn: asyncpg.Connection, letter_id: str) -> asyncpg.Record | None:
    return await conn.fetchrow(
        f"select {_COLUMNS} from public.public_letters where id = $1", letter_id
    )


async def mark_published(
    conn: asyncpg.Connection, letter_id: str, summary: str | None
) -> asyncpg.Record:
    return await conn.fetchrow(
        f"""
        update public.public_letters
        set status = 'published', published_at = now(), summary = $2
        where id = $1
        returning {_COLUMNS}
        """,
        letter_id,
        summary,
    )


async def list_by_author(
    conn: asyncpg.Connection, author_user_id: str, status: str | None = None
) -> list[asyncpg.Record]:
    # Ordered by updated_at desc ("most recently edited first") to match the
    # draft box; idx_public_letters_author_status_updated backs this. Joins the
    # recipient profile so directed drafts can show / repopulate the @handle.
    return await conn.fetch(
        """
        select pl.*, rp.username as recipient_username
        from public.public_letters pl
        left join public.profiles rp on rp.user_id = pl.recipient_user_id
        where pl.author_user_id = $1
          and pl.deleted_at is null
          and ($2::public.letter_status is null or pl.status = $2)
        order by pl.updated_at desc
        """,
        author_user_id,
        status,
    )


# Draft-only mutable columns for PATCH /letters/{id}.
_DRAFT_UPDATABLE = {"body", "subject", "audience", "recipient_user_id", "language_code"}


async def update_draft(
    conn: asyncpg.Connection, letter_id: str, fields: dict
) -> asyncpg.Record | None:
    sets = {k: v for k, v in fields.items() if k in _DRAFT_UPDATABLE}
    if not sets:
        return await get_by_id(conn, letter_id)
    assignments = ", ".join(f"{col} = ${i + 2}" for i, col in enumerate(sets))
    return await conn.fetchrow(
        f"""
        update public.public_letters set {assignments}
        where id = $1 and status = 'draft'
        returning {_COLUMNS}
        """,
        letter_id,
        *sets.values(),
    )


async def list_unanswered_public(
    conn: asyncpg.Connection, *, grace_hours: int, limit: int
) -> list[asyncpg.Record]:
    """Published public letters that nobody has replied to yet — candidates for
    an AI pen-pal (the「公开信无人回 → 派 AI」producer).

    A letter qualifies when:
      - it's a published, non-deleted public letter,
      - both the letter and its author allow AI replies,
      - it was published more than `grace_hours` ago (humans got first shot),
      - no conversation exists on it yet (truly unanswered), and
      - no AI job is already queued/running/done for it (no double-assign).
    Oldest-published first so the longest-waiting letters get answered first.
    """
    return await conn.fetch(
        """
        select pl.id, pl.author_user_id, pl.body
        from public.public_letters pl
        join public.profiles au on au.user_id = pl.author_user_id
        where pl.audience = 'public'
          and pl.status = 'published'
          and pl.deleted_at is null
          and pl.allow_ai_replies = true
          and au.allow_ai_replies = true
          and pl.published_at <= now() - make_interval(hours => $1)
          and not exists (
              select 1 from public.conversations c
              where c.root_letter_id = pl.id
          )
          and not exists (
              select 1 from public.ai_response_jobs j
              where j.root_letter_id = pl.id
                and j.status in ('scheduled', 'processing', 'completed')
          )
        order by pl.published_at asc
        limit $2
        """,
        grace_hours,
        limit,
    )


async def close_letter(conn: asyncpg.Connection, letter_id: str) -> asyncpg.Record:
    return await conn.fetchrow(
        f"""
        update public.public_letters
        set status = 'closed', closed_at = now()
        where id = $1
        returning {_COLUMNS}
        """,
        letter_id,
    )


async def soft_delete(conn: asyncpg.Connection, letter_id: str) -> None:
    await conn.execute(
        "update public.public_letters set deleted_at = now() where id = $1",
        letter_id,
    )
