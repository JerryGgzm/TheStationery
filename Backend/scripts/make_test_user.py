"""Create (idempotently) a durable, email-confirmed test account for manual /
browser testing, and bootstrap its profile. Does NOT purge afterwards.

    PYTHONPATH=. python scripts/make_test_user.py
"""

import asyncio

import asyncpg
import httpx

from app.config import get_settings
from scripts.e2e_http import ANON, PASSWORD, bearer, create_user, get_token

API = "http://localhost:8080/api/v1"
EMAIL = "drafttester@example.com"
USERNAME = "drafttester"
DISPLAY = "Draft Tester"


async def main() -> None:
    settings = get_settings()
    sup = settings.SUPABASE_URL.rstrip("/")
    pool = await asyncpg.create_pool(dsn=settings.DATABASE_URL, statement_cache_size=0)
    try:
        async with pool.acquire() as conn:
            exists = await conn.fetchval(
                "select 1 from auth.users where email = $1", EMAIL
            )
            if not exists:
                await create_user(conn, EMAIL)
            else:
                print(f"  {EMAIL} already exists")

        async with httpx.AsyncClient(timeout=30) as client:
            token = await get_token(client, sup, EMAIL)
            r = await client.patch(
                f"{API}/me/profile",
                headers=bearer(client, token),
                json={"username": USERNAME, "display_name": DISPLAY},
            )
            # 200 on success; 409 if the username is already taken by this user
            # on a re-run is fine too.
            print("profile PATCH ->", r.status_code, r.text[:200])

    finally:
        await pool.close()
    print(f"\nReady. Log in with:\n  email:    {EMAIL}\n  password: {PASSWORD}")


if __name__ == "__main__":
    asyncio.run(main())
