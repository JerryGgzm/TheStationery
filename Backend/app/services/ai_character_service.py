"""Read-only listing of AI characters (not rendered in the MVP scene yet)."""

from __future__ import annotations

import asyncpg

from app.repositories import ai_characters_repo


async def list_characters(pool: asyncpg.Pool) -> dict:
    async with pool.acquire() as conn:
        rows = await ai_characters_repo.list_active(conn)
    return {
        "characters": [
            {
                "id": str(r["id"]),
                "slug": r["slug"],
                "display_name": r["display_name"],
                "short_description": r["short_description"],
                "visual_asset_key": r["visual_asset_key"],
            }
            for r in rows
        ]
    }
