"""Throwaway end-to-end check for the AI pen-pal flow against the TEST database.

Publishes a public letter, runs the「无人回 → 派 AI」producer (grace forced to 0)
and the AI-reply worker, verifies an AI reply landed in the author's mailbox,
then cleans everything up. Requires seeded AI characters (run
scripts/seed_ai_characters.py first) and a live OPENROUTER_API_KEY.

Run:  PYTHONPATH=. python scripts/verify_ai_penpal.py
"""

import asyncio
import os
import sys

# Force an instant assignment (no grace, no human-like delay) BEFORE settings load.
os.environ["AI_UNANSWERED_GRACE_HOURS"] = "0"
os.environ["AI_REPLY_MIN_DELAY_MINUTES"] = "0"
os.environ["AI_REPLY_MAX_DELAY_MINUTES"] = "0"

import asyncpg  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.database import connection  # noqa: E402
from app.services import (  # noqa: E402
    ai_jobs_service,
    conversation_service,
    letter_service,
    profile_service,
)

EMAIL = "aipenpal_e2e@test.local"


async def purge(conn: asyncpg.Connection) -> None:
    rows = await conn.fetch("select id from auth.users where email = $1", EMAIL)
    ids = [r["id"] for r in rows]
    if not ids:
        return
    # Delete AI jobs first (they FK to letters / conversations / messages).
    await conn.execute(
        """
        delete from public.ai_response_jobs
        where root_letter_id in (
                select id from public.public_letters where author_user_id = any($1::uuid[])
              )
           or conversation_id in (
                select id from public.conversations where letter_author_user_id = any($1::uuid[])
              )
        """,
        ids,
    )
    await conn.execute(
        "update public.conversations set created_from_delivery_id = null where letter_author_user_id = any($1::uuid[])",
        ids,
    )
    await conn.execute(
        """
        delete from public.messages where conversation_id in (
            select id from public.conversations where letter_author_user_id = any($1::uuid[])
        )
        """,
        ids,
    )
    await conn.execute(
        "delete from public.messages where sender_user_id = any($1::uuid[])", ids
    )
    await conn.execute(
        "delete from public.letter_deliveries where viewer_user_id = any($1::uuid[])", ids
    )
    await conn.execute(
        "delete from public.conversations where letter_author_user_id = any($1::uuid[])",
        ids,
    )
    await conn.execute(
        "delete from public.public_letters where author_user_id = any($1::uuid[])", ids
    )
    await conn.execute("delete from public.profiles where user_id = any($1::uuid[])", ids)
    await conn.execute("delete from auth.users where id = any($1::uuid[])", ids)


async def main() -> None:
    settings = get_settings()
    assert settings.AI_UNANSWERED_GRACE_HOURS == 0, "grace override didn't take"
    pool = await asyncpg.create_pool(dsn=settings.DATABASE_URL, statement_cache_size=0)
    connection._pool = pool

    try:
        async with pool.acquire() as conn:
            await purge(conn)
            author_id = await conn.fetchval(
                "insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id",
                EMAIL,
            )
        await profile_service.upsert_profile(
            pool, str(author_id), {"username": "aipenpal_e2e", "display_name": "Wanderer"}
        )
        print("seeded author:", author_id)

        draft = await letter_service.create_draft(
            pool,
            author_user_id=str(author_id),
            body=(
                "It's late and the shop is quiet. I keep thinking about a friend "
                "I lost touch with years ago, and whether they still remember me."
            ),
            subject="A late-night thought",
            recipient_username=None,
            language_code="en",
        )
        await letter_service.publish(pool, user_id=str(author_id), letter_id=draft["letter_id"])
        print("published public letter:", draft["letter_id"])

        assigned = await ai_jobs_service.assign_unanswered_letters(pool)
        print("producer result:", assigned)
        assert assigned["assigned"] == 1, f"expected 1 assignment, got {assigned}"

        worked = await ai_jobs_service.process_ai_replies(pool)
        print("worker result:", worked)
        assert worked["completed"] == 1, f"expected 1 completed reply, got {worked}"

        mailbox = await conversation_service.get_mailbox(pool, str(author_id))
        assert mailbox["bundles"], "author should now see an AI bundle"
        bundle = mailbox["bundles"][0]
        print(
            "mailbox bundle:",
            {
                "type": bundle["correspondent"]["type"],
                "name": bundle["correspondent"].get("display_name"),
                "count": bundle["letter_count"],
            },
        )
        assert bundle["correspondent"]["type"] == "ai_character"

        thread = await conversation_service.get_conversation(
            pool, str(author_id), bundle["conversation_id"]
        )
        for m in thread["messages"]:
            print(f"  [{m['sender']}] {m['body'][:200]}")

        print("\nAI PEN-PAL E2E OK")
    finally:
        async with pool.acquire() as conn:
            await purge(conn)
        await pool.close()
        print("cleaned up")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except AssertionError as e:
        print("ASSERTION FAILED:", e)
        sys.exit(1)
