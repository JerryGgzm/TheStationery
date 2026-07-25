"""`/mailbox` — past correspondence grouped by person (the book-shelf)."""

from __future__ import annotations

import asyncpg
from fastapi import APIRouter, Depends

from app.api.deps import get_current_user, get_db_pool
from app.core.security import CurrentUser
from app.services import conversation_service

router = APIRouter(prefix="/mailbox", tags=["mailbox"])


@router.get("")
async def get_mailbox(
    user: CurrentUser = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
):
    return await conversation_service.get_mailbox(pool, user.user_id)
