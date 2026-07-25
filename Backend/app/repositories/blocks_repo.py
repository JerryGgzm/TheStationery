"""Repository: `user_blocks`."""

from __future__ import annotations

import asyncpg


async def add(
    conn: asyncpg.Connection, blocker_user_id: str, blocked_user_id: str
) -> None:
    await conn.execute(
        """
        insert into public.user_blocks (blocker_user_id, blocked_user_id)
        values ($1, $2)
        on conflict (blocker_user_id, blocked_user_id) do nothing
        """,
        blocker_user_id,
        blocked_user_id,
    )


async def remove(
    conn: asyncpg.Connection, blocker_user_id: str, blocked_user_id: str
) -> None:
    await conn.execute(
        "delete from public.user_blocks where blocker_user_id = $1 and blocked_user_id = $2",
        blocker_user_id,
        blocked_user_id,
    )


async def is_blocked_either_way(
    conn: asyncpg.Connection, a: str, b: str
) -> bool:
    row = await conn.fetchrow(
        """
        select 1 from public.user_blocks
        where (blocker_user_id = $1 and blocked_user_id = $2)
           or (blocker_user_id = $2 and blocked_user_id = $1)
        """,
        a,
        b,
    )
    return row is not None
