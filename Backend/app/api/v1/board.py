"""`/board` — the letter wall batch shown on entering the shop / clicking the wall."""

from __future__ import annotations

import asyncpg
from fastapi import APIRouter, Depends

from app.api.deps import get_current_user, get_db_pool
from app.core.security import CurrentUser
from app.services import board_service

router = APIRouter(prefix="/board", tags=["board"])


@router.get("")
async def get_board(
    user: CurrentUser = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
):
    return await board_service.get_board(pool, user.user_id)
