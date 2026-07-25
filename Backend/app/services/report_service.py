"""Filing abuse reports."""

from __future__ import annotations

import asyncpg

from app.repositories import reports_repo
from app.services.exceptions import ValidationError

_TARGET_TYPES = {"public_letter", "message", "user"}
_REASONS = {
    "harassment",
    "sexual_content",
    "self_harm",
    "personal_information",
    "spam",
    "impersonation",
    "other",
}


async def create_report(
    pool: asyncpg.Pool,
    *,
    reporter_user_id: str,
    target_type: str,
    target_id: str,
    reason: str,
    details: str | None,
) -> dict:
    if target_type not in _TARGET_TYPES:
        raise ValidationError("Invalid target_type", code="target_type")
    if reason not in _REASONS:
        raise ValidationError("Invalid reason", code="reason")
    if details is not None and len(details) > 2000:
        raise ValidationError("Details too long", code="details_length")

    async with pool.acquire() as conn:
        row = await reports_repo.insert(
            conn,
            reporter_user_id=reporter_user_id,
            target_type=target_type,
            target_id=target_id,
            reason=reason,
            details=details,
        )
    return {"report_id": str(row["id"]), "status": row["status"]}
