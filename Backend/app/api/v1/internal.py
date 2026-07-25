"""`/internal/jobs/*` — Cloud Scheduler targets, guarded by X-Internal-Token.

Mounted at the app root (no /api/v1 prefix, no user auth); protected by a shared
secret and, at the platform layer, Cloud Run IAM + OIDC. See Docs/deployment.md.
"""

from __future__ import annotations

import asyncpg
from fastapi import APIRouter, Depends

from app.api.deps import get_db_pool, require_internal_token
from app.services import jobs_service

router = APIRouter(prefix="/internal/jobs", tags=["internal"])


@router.post("/deliver-messages")
async def deliver_messages(
    _: None = Depends(require_internal_token),
    pool: asyncpg.Pool = Depends(get_db_pool),
):
    return await jobs_service.deliver_messages(pool)


@router.post("/process-ai-replies")
async def process_ai_replies(
    _: None = Depends(require_internal_token),
    pool: asyncpg.Pool = Depends(get_db_pool),
):
    return await jobs_service.process_ai_replies(pool)
