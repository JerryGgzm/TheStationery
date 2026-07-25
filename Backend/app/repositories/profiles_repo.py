"""Repository: `profiles`. Pure DB reads/writes, no business logic."""

from __future__ import annotations

import asyncpg

_COLUMNS = (
    "user_id, username, display_name, avatar_path, language_code, timezone, "
    "account_status, allow_ai_replies, allow_human_replies, created_at, updated_at"
)


async def get_by_user_id(conn: asyncpg.Connection, user_id: str) -> asyncpg.Record | None:
    return await conn.fetchrow(
        f"select {_COLUMNS} from public.profiles where user_id = $1", user_id
    )


async def get_by_username(conn: asyncpg.Connection, username: str) -> asyncpg.Record | None:
    return await conn.fetchrow(
        f"select {_COLUMNS} from public.profiles where username = $1", username
    )


async def username_taken(
    conn: asyncpg.Connection, username: str, exclude_user_id: str | None = None
) -> bool:
    row = await conn.fetchrow(
        "select 1 from public.profiles where username = $1 and ($2::uuid is null or user_id <> $2)",
        username,
        exclude_user_id,
    )
    return row is not None


async def insert(
    conn: asyncpg.Connection,
    *,
    user_id: str,
    username: str,
    display_name: str,
    avatar_path: str | None = None,
    language_code: str = "en",
) -> asyncpg.Record:
    return await conn.fetchrow(
        f"""
        insert into public.profiles (user_id, username, display_name, avatar_path, language_code)
        values ($1, $2, $3, $4, $5)
        returning {_COLUMNS}
        """,
        user_id,
        username,
        display_name,
        avatar_path,
        language_code,
    )


# Whitelisted mutable columns for PATCH /me/profile.
_UPDATABLE = {
    "username",
    "display_name",
    "avatar_path",
    "language_code",
    "allow_ai_replies",
    "allow_human_replies",
}


async def update(
    conn: asyncpg.Connection, user_id: str, fields: dict
) -> asyncpg.Record | None:
    sets = {k: v for k, v in fields.items() if k in _UPDATABLE}
    if not sets:
        return await get_by_user_id(conn, user_id)
    assignments = ", ".join(f"{col} = ${i + 2}" for i, col in enumerate(sets))
    values = list(sets.values())
    return await conn.fetchrow(
        f"update public.profiles set {assignments} where user_id = $1 returning {_COLUMNS}",
        user_id,
        *values,
    )
