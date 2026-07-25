"""Repository: `reports`."""

from __future__ import annotations

import asyncpg


async def insert(
    conn: asyncpg.Connection,
    *,
    reporter_user_id: str,
    target_type: str,
    target_id: str,
    reason: str,
    details: str | None,
) -> asyncpg.Record:
    return await conn.fetchrow(
        """
        insert into public.reports
            (reporter_user_id, target_type, target_id, reason, details)
        values ($1, $2, $3, $4, $5)
        returning id, status, created_at
        """,
        reporter_user_id,
        target_type,
        target_id,
        reason,
        details,
    )
