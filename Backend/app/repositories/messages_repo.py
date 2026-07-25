"""Repository: `messages`."""

from __future__ import annotations

import asyncpg

_COLUMNS = (
    "id, conversation_id, sender_type, sender_user_id, sender_ai_character_id, body, "
    "reply_to_message_id, delivery_status, scheduled_for, delivered_at, read_at, created_at"
)


async def insert_user_message(
    conn: asyncpg.Connection,
    *,
    conversation_id: str,
    sender_user_id: str,
    body: str,
    reply_to_message_id: str | None = None,
) -> asyncpg.Record:
    """A human reply is delivered immediately (delivery_status='delivered')."""
    return await conn.fetchrow(
        f"""
        insert into public.messages
            (conversation_id, sender_type, sender_user_id, body, reply_to_message_id,
             delivery_status, delivered_at)
        values ($1, 'user', $2, $3, $4, 'delivered', now())
        returning {_COLUMNS}
        """,
        conversation_id,
        sender_user_id,
        body,
        reply_to_message_id,
    )


async def insert_ai_message(
    conn: asyncpg.Connection,
    *,
    conversation_id: str,
    sender_ai_character_id: str,
    body: str,
    reply_to_message_id: str | None = None,
    delivered: bool = True,
) -> asyncpg.Record:
    """AI reply. When `delivered`, it lands immediately; otherwise it's
    'scheduled' (the deliver-messages job flips it later)."""
    status = "delivered" if delivered else "scheduled"
    return await conn.fetchrow(
        f"""
        insert into public.messages
            (conversation_id, sender_type, sender_ai_character_id, body,
             reply_to_message_id, delivery_status, scheduled_for, delivered_at)
        values ($1, 'ai_character', $2, $3, $4, $5::public.message_delivery_status,
                case when $5::public.message_delivery_status = 'scheduled' then now() else null end,
                case when $5::public.message_delivery_status = 'delivered' then now() else null end)
        returning {_COLUMNS}
        """,
        conversation_id,
        sender_ai_character_id,
        body,
        reply_to_message_id,
        status,
    )


async def list_for_conversation(
    conn: asyncpg.Connection, conversation_id: str
) -> list[asyncpg.Record]:
    return await conn.fetch(
        f"""
        select {_COLUMNS} from public.messages
        where conversation_id = $1 and deleted_at is null
        order by created_at asc
        """,
        conversation_id,
    )


async def deliver_due(conn: asyncpg.Connection, limit: int = 500) -> list[asyncpg.Record]:
    """Flip scheduled messages whose time has come to 'delivered'."""
    return await conn.fetch(
        """
        update public.messages
        set delivery_status = 'delivered', delivered_at = now()
        where id in (
            select id from public.messages
            where delivery_status = 'scheduled' and scheduled_for <= now()
            order by scheduled_for asc
            limit $1
        )
        returning id, conversation_id
        """,
        limit,
    )
