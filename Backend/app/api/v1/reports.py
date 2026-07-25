"""`/reports` — file an abuse report."""

from __future__ import annotations

import asyncpg
from fastapi import APIRouter, Depends

from app.api.deps import get_current_user, get_db_pool
from app.api.schemas import CreateReport
from app.core.security import CurrentUser
from app.services import report_service

router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("", status_code=201)
async def create_report(
    body: CreateReport,
    user: CurrentUser = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
):
    return await report_service.create_report(
        pool,
        reporter_user_id=user.user_id,
        target_type=body.target_type,
        target_id=body.target_id,
        reason=body.reason,
        details=body.details,
    )
