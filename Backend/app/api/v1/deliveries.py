"""`/deliveries/{id}` — open a delivered letter and reply to it (LetterWall)."""

from __future__ import annotations

import asyncpg
from fastapi import APIRouter, Depends, Request

from app.api.deps import get_current_user, get_db_pool
from app.api.rate_limit import WRITE_LIMIT, limiter
from app.api.schemas import ReplyBody
from app.core.security import CurrentUser
from app.services import delivery_service

router = APIRouter(prefix="/deliveries", tags=["deliveries"])


@router.post("/{delivery_id}/open")
async def open_delivery(
    delivery_id: str,
    user: CurrentUser = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
):
    return await delivery_service.open_delivery(
        pool, viewer_user_id=user.user_id, delivery_id=delivery_id
    )


@router.post("/{delivery_id}/reply")
@limiter.limit(WRITE_LIMIT)
async def reply_delivery(
    request: Request,
    delivery_id: str,
    body: ReplyBody,
    user: CurrentUser = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
):
    return await delivery_service.reply_to_delivery(
        pool, viewer_user_id=user.user_id, delivery_id=delivery_id, body=body.body
    )


@router.post("/{delivery_id}/skip")
async def skip_delivery(
    delivery_id: str,
    user: CurrentUser = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
):
    return await delivery_service.skip_delivery(
        pool, viewer_user_id=user.user_id, delivery_id=delivery_id
    )


@router.post("/{delivery_id}/hide")
async def hide_delivery(
    delivery_id: str,
    user: CurrentUser = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
):
    return await delivery_service.hide_delivery(
        pool, viewer_user_id=user.user_id, delivery_id=delivery_id
    )
