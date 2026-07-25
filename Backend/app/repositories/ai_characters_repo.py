"""Repository: `ai_characters` + `ai_prompt_versions`."""

from __future__ import annotations

import asyncpg

_COLUMNS = (
    "id, slug, display_name, short_description, persona_summary, visual_asset_key, "
    "active, active_time_rules, reply_delay_rules, topic_preferences"
)


async def list_active(conn: asyncpg.Connection) -> list[asyncpg.Record]:
    return await conn.fetch(
        f"select {_COLUMNS} from public.ai_characters where active = true order by slug"
    )


async def get_by_id(conn: asyncpg.Connection, character_id: str) -> asyncpg.Record | None:
    return await conn.fetchrow(
        f"select {_COLUMNS} from public.ai_characters where id = $1", character_id
    )


async def get_active_prompt(
    conn: asyncpg.Connection, character_id: str
) -> asyncpg.Record | None:
    return await conn.fetchrow(
        """
        select id, ai_character_id, version, system_prompt, model_config
        from public.ai_prompt_versions
        where ai_character_id = $1 and status = 'active'
        order by version desc
        limit 1
        """,
        character_id,
    )
