"""`/users/{id}/block` — block / unblock another user."""

from __future__ import annotations

import asyncpg
from fastapi import APIRouter, Depends

from app.api.deps import get_current_user, get_db_pool
from app.core.security import CurrentUser
from app.services import block_service

router = APIRouter(prefix="/users", tags=["users"])


@router.post("/{user_id}/block")
async def block_user(
    user_id: str,
    user: CurrentUser = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
):
    return await block_service.block(
        pool, blocker_user_id=user.user_id, target_user_id=user_id
    )


@router.delete("/{user_id}/block")
async def unblock_user(
    user_id: str,
    user: CurrentUser = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
):
    return await block_service.unblock(
        pool, blocker_user_id=user.user_id, target_user_id=user_id
    )
