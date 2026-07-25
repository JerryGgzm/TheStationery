"""Repository: `conversations`."""

from __future__ import annotations

import asyncpg

_COLUMNS = (
    "id, root_letter_id, letter_author_user_id, responder_type, responder_user_id, "
    "responder_ai_character_id, created_from_delivery_id, status, last_message_at, created_at"
)


async def find_human_conversation(
    conn: asyncpg.Connection, root_letter_id: str, responder_user_id: str
) -> asyncpg.Record | None:
    return await conn.fetchrow(
        f"""
        select {_COLUMNS} from public.conversations
        where root_letter_id = $1 and responder_type = 'human' and responder_user_id = $2
        """,
        root_letter_id,
        responder_user_id,
    )


async def create_human_conversation(
    conn: asyncpg.Connection,
    *,
    root_letter_id: str,
    letter_author_user_id: str,
    responder_user_id: str,
    created_from_delivery_id: str | None,
) -> asyncpg.Record:
    return await conn.fetchrow(
        f"""
        insert into public.conversations
            (root_letter_id, letter_author_user_id, responder_type, responder_user_id,
             created_from_delivery_id, status)
        values ($1, $2, 'human', $3, $4, 'active')
        returning {_COLUMNS}
        """,
        root_letter_id,
        letter_author_user_id,
        responder_user_id,
        created_from_delivery_id,
    )


async def create_ai_conversation(
    conn: asyncpg.Connection,
    *,
    root_letter_id: str,
    letter_author_user_id: str,
    responder_ai_character_id: str,
) -> asyncpg.Record:
    return await conn.fetchrow(
        f"""
        insert into public.conversations
            (root_letter_id, letter_author_user_id, responder_type,
             responder_ai_character_id, status)
        values ($1, $2, 'ai_character', $3, 'active')
        returning {_COLUMNS}
        """,
        root_letter_id,
        letter_author_user_id,
        responder_ai_character_id,
    )


async def get_by_id(
    conn: asyncpg.Connection, conversation_id: str
) -> asyncpg.Record | None:
    return await conn.fetchrow(
        f"select {_COLUMNS} from public.conversations where id = $1", conversation_id
    )


async def list_for_user(
    conn: asyncpg.Connection, user_id: str
) -> list[asyncpg.Record]:
    """Mailbox: one row per conversation the user participates in, with the
    correspondent (the other party) resolved to a human profile or AI character.
    """
    return await conn.fetch(
        """
        select
          c.id as conversation_id,
          c.root_letter_id,
          c.responder_type,
          c.status,
          c.last_message_at,
          case when c.letter_author_user_id = $1 then c.responder_user_id
               else c.letter_author_user_id end as corr_user_id,
          c.responder_ai_character_id,
          p.username        as corr_username,
          p.display_name    as corr_display_name,
          p.avatar_path     as corr_avatar_path,
          ac.display_name   as ai_display_name,
          ac.slug           as ai_slug,
          ac.visual_asset_key as ai_visual_asset_key,
          (select count(*) from public.messages m
             where m.conversation_id = c.id and m.deleted_at is null) as message_count
        from public.conversations c
        left join public.profiles p
          on p.user_id = (case when c.letter_author_user_id = $1
                               then c.responder_user_id
                               else c.letter_author_user_id end)
        left join public.ai_characters ac
          on ac.id = c.responder_ai_character_id and c.responder_type = 'ai_character'
        where c.status <> 'removed'
          and (
                c.letter_author_user_id = $1
             or (c.responder_type = 'human' and c.responder_user_id = $1)
          )
        order by c.last_message_at desc
        """,
        user_id,
    )


def is_participant(conversation: asyncpg.Record, user_id: str) -> bool:
    if str(conversation["letter_author_user_id"]) == user_id:
        return True
    responder = conversation["responder_user_id"]
    return (
        conversation["responder_type"] == "human"
        and responder is not None
        and str(responder) == user_id
    )


async def set_status(
    conn: asyncpg.Connection, conversation_id: str, status: str
) -> asyncpg.Record:
    return await conn.fetchrow(
        f"""
        update public.conversations set status = $2
        where id = $1
        returning {_COLUMNS}
        """,
        conversation_id,
        status,
    )
