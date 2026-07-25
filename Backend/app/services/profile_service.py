"""Business logic for the current user's profile (`/me`)."""

from __future__ import annotations

import asyncpg

from app.repositories import profiles_repo
from app.services import handles
from app.services.exceptions import ConflictError, NotFoundError, ValidationError
from app.services.media import avatar_url


def _to_dict(row: asyncpg.Record) -> dict:
    return {
        "user_id": str(row["user_id"]),
        "username": row["username"],
        "display_name": row["display_name"],
        "avatar_url": avatar_url(row["avatar_path"]),
        "language_code": row["language_code"],
        "allow_ai_replies": row["allow_ai_replies"],
        "allow_human_replies": row["allow_human_replies"],
    }


async def get_me(pool: asyncpg.Pool, user_id: str) -> dict:
    async with pool.acquire() as conn:
        row = await profiles_repo.get_by_user_id(conn, user_id)
    if row is None:
        raise NotFoundError("Profile not set up yet", code="profile_not_found")
    return _to_dict(row)


async def username_available(pool: asyncpg.Pool, raw: str) -> dict:
    handle = handles.normalize(raw or "")
    if not handles.is_valid(handle):
        return {"available": False, "reason": "format"}
    async with pool.acquire() as conn:
        taken = await profiles_repo.username_taken(conn, handle)
    return {"available": not taken}


async def upsert_profile(pool: asyncpg.Pool, user_id: str, patch: dict) -> dict:
    """Create the profile on first call (bootstrap after signup) or update it."""
    fields: dict = {}

    if "username" in patch and patch["username"] is not None:
        handle = handles.normalize(patch["username"])
        if not handles.is_valid(handle):
            raise ValidationError("Invalid username format", code="username_format")
        fields["username"] = handle
    if "display_name" in patch and patch["display_name"] is not None:
        name = patch["display_name"].strip()
        if not (1 <= len(name) <= 40):
            raise ValidationError("display_name must be 1–40 chars", code="display_name")
        fields["display_name"] = name
    for key in ("avatar_path", "language_code", "allow_ai_replies", "allow_human_replies"):
        if key in patch and patch[key] is not None:
            fields[key] = patch[key]

    async with pool.acquire() as conn:
        async with conn.transaction():
            existing = await profiles_repo.get_by_user_id(conn, user_id)

            if "username" in fields and await profiles_repo.username_taken(
                conn, fields["username"], exclude_user_id=user_id
            ):
                raise ConflictError("Username already taken", code="username_taken")

            if existing is None:
                # Bootstrap: need at least a username and display_name.
                username = fields.get("username")
                display_name = fields.get("display_name") or (
                    username if username else None
                )
                if not username or not display_name:
                    raise ValidationError(
                        "username and display_name are required to create a profile",
                        code="profile_incomplete",
                    )
                row = await profiles_repo.insert(
                    conn,
                    user_id=user_id,
                    username=username,
                    display_name=display_name,
                    avatar_path=fields.get("avatar_path"),
                    language_code=fields.get("language_code", "en"),
                )
            else:
                row = await profiles_repo.update(conn, user_id, fields)
    return _to_dict(row)
