"""Background job entrypoints behind the protected `/internal/jobs/*` endpoints.

Triggered by Cloud Scheduler; each is idempotent and safe to run frequently.
"""

from __future__ import annotations

import asyncpg

from app.repositories import messages_repo
from app.services import ai_jobs_service


async def deliver_messages(pool: asyncpg.Pool) -> dict:
    """Flip scheduled messages whose scheduled_for has passed to delivered."""
    async with pool.acquire() as conn:
        async with conn.transaction():
            delivered = await messages_repo.deliver_due(conn)
    return {"delivered": len(delivered)}


async def process_ai_replies(pool: asyncpg.Pool) -> dict:
    return await ai_jobs_service.process_ai_replies(pool)


async def assign_ai_penpals(pool: asyncpg.Pool) -> dict:
    """Assign AI pen-pals to public letters nobody answered in time."""
    return await ai_jobs_service.assign_unanswered_letters(pool)
