"""`/ai-characters` — list active AI pen-pals (not rendered in the MVP scene)."""

from __future__ import annotations

import asyncpg
from fastapi import APIRouter, Depends

from app.api.deps import get_current_user, get_db_pool
from app.core.security import CurrentUser
from app.services import ai_character_service

router = APIRouter(prefix="/ai-characters", tags=["ai-characters"])


@router.get("")
async def list_ai_characters(
    _: CurrentUser = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
):
    return await ai_character_service.list_characters(pool)
