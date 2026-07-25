"""`/me` — current user's profile (ProfilePanel + registration bootstrap)."""

from __future__ import annotations

import asyncpg
from fastapi import APIRouter, Depends, Query

from app.api.deps import get_current_user, get_db_pool
from app.api.schemas import ProfilePatch
from app.core.security import CurrentUser
from app.services import profile_service

router = APIRouter(prefix="/me", tags=["me"])


@router.get("")
async def get_me(
    user: CurrentUser = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
):
    return await profile_service.get_me(pool, user.user_id)


@router.get("/username-available")
async def username_available(
    u: str = Query(..., min_length=1),
    _: CurrentUser = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
):
    return await profile_service.username_available(pool, u)


@router.patch("/profile")
async def patch_profile(
    body: ProfilePatch,
    user: CurrentUser = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
):
    return await profile_service.upsert_profile(
        pool, user.user_id, body.model_dump(exclude_unset=True)
    )
