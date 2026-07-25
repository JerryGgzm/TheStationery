"""Throwaway end-to-end smoke test against the TEST database.

Seeds two auth.users + profiles, runs the full letter loop through the service
layer (real SQL, real schema), prints results, then cleans everything up.
Run:  python scripts/e2e_smoke.py
"""

import asyncio
import sys

import asyncpg

from app.config import get_settings
from app.database import connection
from app.services import (
    board_service,
    conversation_service,
    delivery_service,
    letter_service,
    profile_service,
)

TEST_EMAILS = ("alice_e2e@test.local", "bob_e2e@test.local")


async def purge(conn: asyncpg.Connection) -> None:
    """Idempotently remove all rows belonging to the test users, in FK-safe order."""
    rows = await conn.fetch(
        "select id from auth.users where email = any($1::text[])", list(TEST_EMAILS)
    )
    ids = [r["id"] for r in rows]
    if not ids:
        return
    # conversations <-> letter_deliveries reference each other; break the cycle first.
    await conn.execute(
        "update public.conversations set created_from_delivery_id = null where letter_author_user_id = any($1::uuid[]) or responder_user_id = any($1::uuid[])",
        ids,
    )
    await conn.execute(
        "update public.letter_deliveries set created_conversation_id = null where viewer_user_id = any($1::uuid[])",
        ids,
    )
    await conn.execute(
        """
        delete from public.messages where conversation_id in (
            select id from public.conversations
            where letter_author_user_id = any($1::uuid[]) or responder_user_id = any($1::uuid[])
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
        "delete from public.conversations where letter_author_user_id = any($1::uuid[]) or responder_user_id = any($1::uuid[])",
        ids,
    )
    await conn.execute(
        "delete from public.letter_delivery_batches where viewer_user_id = any($1::uuid[])",
        ids,
    )
    await conn.execute(
        "delete from public.public_letters where author_user_id = any($1::uuid[])", ids
    )
    await conn.execute("delete from public.profiles where user_id = any($1::uuid[])", ids)
    await conn.execute("delete from auth.users where id = any($1::uuid[])", ids)


async def main() -> None:
    settings = get_settings()
    pool = await asyncpg.create_pool(dsn=settings.DATABASE_URL, statement_cache_size=0)
    connection._pool = pool  # let services use get_pool() too if needed

    author_id = reader_id = None
    try:
        # Clear any leftovers from a previous interrupted run.
        async with pool.acquire() as conn:
            await purge(conn)
        async with pool.acquire() as conn:
            author_id = await conn.fetchval(
                "insert into auth.users (id, email) values (gen_random_uuid(), 'alice_e2e@test.local') returning id"
            )
            reader_id = await conn.fetchval(
                "insert into auth.users (id, email) values (gen_random_uuid(), 'bob_e2e@test.local') returning id"
            )
        print("seeded auth.users:", author_id, reader_id)

        await profile_service.upsert_profile(
            pool, str(author_id), {"username": "alice_e2e", "display_name": "Alice"}
        )
        await profile_service.upsert_profile(
            pool, str(reader_id), {"username": "bob_e2e", "display_name": "Bob"}
        )
        print("profiles created")

        draft = await letter_service.create_draft(
            pool, author_user_id=str(author_id),
            body="I planted roses in my grandmother's memory this spring.",
            subject="Roses", recipient_username=None, language_code="en",
        )
        print("draft:", draft)
        pub = await letter_service.publish(
            pool, user_id=str(author_id), letter_id=draft["letter_id"]
        )
        print("published:", pub)

        board = await board_service.get_board(pool, str(reader_id))
        print("board deliveries:", len(board["deliveries"]))
        assert board["deliveries"], "board should contain the published letter"
        delivery = board["deliveries"][0]
        print("  first card:", {k: delivery[k] for k in ("summary", "seal", "is_reply")})

        opened = await delivery_service.open_delivery(
            pool, viewer_user_id=str(reader_id), delivery_id=delivery["delivery_id"]
        )
        print("opened letter title:", opened["letter"]["title"])

        reply = await delivery_service.reply_to_delivery(
            pool, viewer_user_id=str(reader_id),
            delivery_id=delivery["delivery_id"], body="What was her name?",
        )
        print("reply:", reply)

        mailbox = await conversation_service.get_mailbox(pool, str(author_id))
        print("author mailbox bundles:", len(mailbox["bundles"]))
        assert mailbox["bundles"], "author should see the reply bundle"
        conv_id = mailbox["bundles"][0]["conversation_id"]

        thread = await conversation_service.get_conversation(pool, str(author_id), conv_id)
        print("thread messages:", [(m["sender"], m["body"]) for m in thread["messages"]])

        mine = await letter_service.list_mine(pool, user_id=str(author_id))
        print("author letters:", [(l["status"], l["summary"]) for l in mine["letters"]])

        print("\nE2E OK")
    finally:
        # Clean up everything we created (FK-safe order, idempotent by email).
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
