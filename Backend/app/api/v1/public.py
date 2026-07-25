"""Public (unauthenticated) endpoints used before a session exists.

Currently just signup-time username availability. Rate-limited by IP to blunt
username enumeration / scraping.
"""

from __future__ import annotations

import asyncpg
from fastapi import APIRouter, Depends, Query, Request

from app.api.deps import get_db_pool
from app.api.rate_limit import LOOKUP_LIMIT, limiter
from app.services import profile_service

router = APIRouter(prefix="/public", tags=["public"])


@router.get("/username-available")
@limiter.limit(LOOKUP_LIMIT)
async def username_available(
    request: Request,
    u: str = Query(..., min_length=1),
    pool: asyncpg.Pool = Depends(get_db_pool),
):
    return await profile_service.username_available(pool, u)
