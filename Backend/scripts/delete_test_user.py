"""Delete test account(s) by email (FK-safe, idempotent). Reuses e2e_http.purge.

    PYTHONPATH=. python scripts/delete_test_user.py drafttester@example.com
"""

import asyncio
import sys

import asyncpg

from app.config import get_settings
from scripts import e2e_http


async def main(emails: list[str]) -> None:
    e2e_http.EMAILS = emails  # purge() reads this module global
    settings = get_settings()
    pool = await asyncpg.create_pool(dsn=settings.DATABASE_URL, statement_cache_size=0)
    try:
        async with pool.acquire() as conn:
            await e2e_http.purge(conn)
        print("deleted:", ", ".join(emails))
    finally:
        await pool.close()


if __name__ == "__main__":
    args = sys.argv[1:] or ["drafttester@example.com"]
    asyncio.run(main(args))
