"""`/letters` — create, publish, edit, list, close and delete letters (the desk)."""

from __future__ import annotations

import asyncpg
from fastapi import APIRouter, Depends, Query, Request

from app.api.deps import get_current_user, get_db_pool
from app.api.rate_limit import PUBLISH_LIMIT, WRITE_LIMIT, limiter
from app.api.schemas import CreateLetter, UpdateLetter
from app.core.security import CurrentUser
from app.services import letter_service

router = APIRouter(prefix="/letters", tags=["letters"])


@router.post("", status_code=201)
@limiter.limit(WRITE_LIMIT)
async def create_letter(
    request: Request,
    body: CreateLetter,
    user: CurrentUser = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
):
    return await letter_service.create_draft(
        pool,
        author_user_id=user.user_id,
        body=body.body,
        subject=body.subject,
        recipient_username=body.recipient_username,
        language_code=body.language_code,
    )


@router.get("/mine")
async def list_my_letters(
    status: str | None = Query(default=None),
    user: CurrentUser = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
):
    return await letter_service.list_mine(pool, user_id=user.user_id, status=status)


@router.post("/{letter_id}/publish")
@limiter.limit(PUBLISH_LIMIT)
async def publish_letter(
    request: Request,
    letter_id: str,
    user: CurrentUser = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
):
    return await letter_service.publish(pool, user_id=user.user_id, letter_id=letter_id)


@router.patch("/{letter_id}")
async def update_letter(
    letter_id: str,
    body: UpdateLetter,
    user: CurrentUser = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
):
    return await letter_service.update_draft(
        pool,
        user_id=user.user_id,
        letter_id=letter_id,
        patch=body.model_dump(exclude_unset=True),
    )


@router.post("/{letter_id}/close")
async def close_letter(
    letter_id: str,
    user: CurrentUser = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
):
    return await letter_service.close(pool, user_id=user.user_id, letter_id=letter_id)


@router.delete("/{letter_id}")
async def delete_letter(
    letter_id: str,
    user: CurrentUser = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
):
    return await letter_service.delete(pool, user_id=user.user_id, letter_id=letter_id)
