"""`/conversations/{id}` — read a thread, reply in it, or close it."""

from __future__ import annotations

import asyncpg
from fastapi import APIRouter, Depends, Request

from app.api.deps import get_current_user, get_db_pool
from app.api.rate_limit import WRITE_LIMIT, limiter
from app.api.schemas import ReplyBody
from app.core.security import CurrentUser
from app.services import conversation_service

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get("/{conversation_id}")
async def get_conversation(
    conversation_id: str,
    user: CurrentUser = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
):
    return await conversation_service.get_conversation(pool, user.user_id, conversation_id)


@router.post("/{conversation_id}/messages")
@limiter.limit(WRITE_LIMIT)
async def post_message(
    request: Request,
    conversation_id: str,
    body: ReplyBody,
    user: CurrentUser = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
):
    return await conversation_service.post_message(
        pool, user_id=user.user_id, conversation_id=conversation_id, body=body.body
    )


@router.post("/{conversation_id}/close")
async def close_conversation(
    conversation_id: str,
    user: CurrentUser = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
):
    return await conversation_service.close_conversation(
        pool, user_id=user.user_id, conversation_id=conversation_id
    )
