"""Blocking / unblocking other users."""

from __future__ import annotations

import asyncpg

from app.repositories import blocks_repo, profiles_repo
from app.services.exceptions import NotFoundError, ValidationError


async def block(pool: asyncpg.Pool, *, blocker_user_id: str, target_user_id: str) -> dict:
    if blocker_user_id == target_user_id:
        raise ValidationError("You can't block yourself", code="block_self")
    async with pool.acquire() as conn:
        target = await profiles_repo.get_by_user_id(conn, target_user_id)
        if target is None:
            raise NotFoundError("User not found", code="user_not_found")
        await blocks_repo.add(conn, blocker_user_id, target_user_id)
    return {"blocked": True}


async def unblock(
    pool: asyncpg.Pool, *, blocker_user_id: str, target_user_id: str
) -> dict:
    async with pool.acquire() as conn:
        await blocks_repo.remove(conn, blocker_user_id, target_user_id)
    return {"blocked": False}
