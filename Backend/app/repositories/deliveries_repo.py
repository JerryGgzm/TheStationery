"""Repository: `letter_delivery_batches` + `letter_deliveries`."""

from __future__ import annotations

import asyncpg


async def get_active_batch(
    conn: asyncpg.Connection, viewer_user_id: str
) -> asyncpg.Record | None:
    return await conn.fetchrow(
        """
        select id, viewer_user_id, reason, status, created_at, expires_at
        from public.letter_delivery_batches
        where viewer_user_id = $1 and status = 'active'
        order by created_at desc
        limit 1
        """,
        viewer_user_id,
    )


async def create_batch(
    conn: asyncpg.Connection, viewer_user_id: str, reason: str = "bookstore_visit"
) -> asyncpg.Record:
    return await conn.fetchrow(
        """
        insert into public.letter_delivery_batches (viewer_user_id, reason, status)
        values ($1, $2, 'active')
        returning id, viewer_user_id, reason, status, created_at, expires_at
        """,
        viewer_user_id,
        reason,
    )


async def fetch_candidate_letters(
    conn: asyncpg.Connection, viewer_user_id: str, limit: int
) -> list[asyncpg.Record]:
    """Directed-to-me letters first, then the oldest unseen public letters.

    The wall is for first contact only: it excludes the viewer's own letters,
    anything already delivered to them, letters from/to blocked users, and
    letters from anyone the viewer already has a conversation with (those live in
    the correspondence shelf, not the wall).
    """
    return await conn.fetch(
        """
        select l.id, l.summary, l.audience, l.recipient_user_id, l.published_at
        from public.public_letters l
        where l.status = 'published'
          and l.deleted_at is null
          and l.author_user_id <> $1
          and (
                (l.audience = 'public' and l.allow_human_replies = true)
             or (l.audience = 'directed' and l.recipient_user_id = $1)
          )
          and not exists (
                select 1 from public.letter_deliveries d
                where d.viewer_user_id = $1 and d.letter_id = l.id
          )
          and not exists (
                select 1 from public.conversations c
                where (c.letter_author_user_id = $1 and c.responder_user_id = l.author_user_id)
                   or (c.responder_user_id = $1 and c.letter_author_user_id = l.author_user_id)
          )
          and not exists (
                select 1 from public.user_blocks b
                where (b.blocker_user_id = $1 and b.blocked_user_id = l.author_user_id)
                   or (b.blocker_user_id = l.author_user_id and b.blocked_user_id = $1)
          )
        order by
          (l.audience = 'directed' and l.recipient_user_id = $1) desc,
          l.published_at asc
        limit $2
        """,
        viewer_user_id,
        limit,
    )


async def insert_delivery(
    conn: asyncpg.Connection,
    *,
    batch_id: str,
    viewer_user_id: str,
    letter_id: str,
    position: int,
) -> asyncpg.Record:
    return await conn.fetchrow(
        """
        insert into public.letter_deliveries (batch_id, viewer_user_id, letter_id, position)
        values ($1, $2, $3, $4)
        returning id, letter_id, position
        """,
        batch_id,
        viewer_user_id,
        letter_id,
        position,
    )


async def list_batch_deliveries(
    conn: asyncpg.Connection, batch_id: str, viewer_user_id: str
) -> list[asyncpg.Record]:
    """Deliveries in a batch joined with letter fields needed for wall cards."""
    return await conn.fetch(
        """
        select d.id as delivery_id, d.letter_id, d.position, d.opened_at,
               l.summary, l.audience, l.recipient_user_id
        from public.letter_deliveries d
        join public.public_letters l on l.id = d.letter_id
        where d.batch_id = $1 and d.viewer_user_id = $2
        order by d.position asc
        """,
        batch_id,
        viewer_user_id,
    )


async def get_delivery(
    conn: asyncpg.Connection, delivery_id: str, viewer_user_id: str
) -> asyncpg.Record | None:
    return await conn.fetchrow(
        """
        select id as delivery_id, batch_id, viewer_user_id, letter_id, position,
               opened_at, replied_at, created_conversation_id
        from public.letter_deliveries
        where id = $1 and viewer_user_id = $2
        """,
        delivery_id,
        viewer_user_id,
    )


async def mark_opened(conn: asyncpg.Connection, delivery_id: str) -> None:
    await conn.execute(
        "update public.letter_deliveries set opened_at = coalesce(opened_at, now()) where id = $1",
        delivery_id,
    )


async def mark_replied(
    conn: asyncpg.Connection, delivery_id: str, conversation_id: str
) -> None:
    await conn.execute(
        """
        update public.letter_deliveries
        set replied_at = now(), created_conversation_id = $2
        where id = $1
        """,
        delivery_id,
        conversation_id,
    )


async def mark_skipped(conn: asyncpg.Connection, delivery_id: str) -> None:
    await conn.execute(
        "update public.letter_deliveries set skipped_at = coalesce(skipped_at, now()) where id = $1",
        delivery_id,
    )


async def mark_hidden(conn: asyncpg.Connection, delivery_id: str) -> None:
    await conn.execute(
        "update public.letter_deliveries set hidden_at = coalesce(hidden_at, now()) where id = $1",
        delivery_id,
    )
