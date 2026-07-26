"""End-to-end smoke test over **HTTP** (real Supabase JWT -> FastAPI).

Unlike e2e_smoke.py (which calls the service layer directly), this exercises the
full request path a browser uses: obtain a Supabase access token, then hit the
API with a Bearer token. It:

  1. creates two confirmed auth users directly in auth.users/auth.identities
     (bcrypt-hashed password; skips GoTrue signup to avoid its email rate limit),
  2. gets access tokens via the password grant,
  3. bootstraps profiles (PATCH /me/profile),
  4. Alice publishes a public letter (POST /letters -> /publish),
  5. Bob reads the board, opens the letter, and replies,
  6. verifies Alice's mailbox/thread, then cleans everything up.

Run (backend must be running on :8080):
    PYTHONPATH=. python scripts/e2e_http.py
"""

import asyncio
import sys

import asyncpg
import httpx

from app.config import get_settings

# Public, browser-safe anon key (from Frontend/.env.local) — used only as the
# GoTrue `apikey` header; RLS still applies.
ANON = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkcHp3eGx2bmVmeXJkaWt6ZXhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1OTg0NDYsImV4cCI6MjEwMDE3NDQ0Nn0."
    "z_78IjezfBfSEVWb6G2FhLsYm2LVMV9UgahYoltxFf8"
)

API = "http://localhost:8080/api/v1"
PASSWORD = "Test-Passw0rd!"

USERS = [
    {"email": "alice_http_e2e@example.com", "username": "alice_http", "display": "Alice"},
    {"email": "bob_http_e2e@example.com", "username": "bob_http", "display": "Bob"},
]
EMAILS = [u["email"] for u in USERS]


# --- cleanup (copied from e2e_smoke.py, FK-safe + idempotent by email) --------
async def purge(conn: asyncpg.Connection) -> None:
    rows = await conn.fetch(
        "select id from auth.users where email = any($1::text[])", EMAILS
    )
    ids = [r["id"] for r in rows]
    if not ids:
        return
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


async def create_user(conn: asyncpg.Connection, email: str) -> None:
    """Create a confirmed auth user directly (pgcrypto-hashed password).

    Avoids GoTrue's signup path, which sends a confirmation email and trips
    Supabase's built-in email send rate limit. The password is still a real
    bcrypt hash, so the normal password grant works.
    """
    uid = await conn.fetchval(
        """
        insert into auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
            created_at, updated_at,
            confirmation_token, email_change, email_change_token_new, recovery_token
        ) values (
            '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
            'authenticated', 'authenticated', $1, crypt($2, gen_salt('bf')),
            now(), '{"provider":"email","providers":["email"]}', '{}',
            now(), now(),
            '', '', '', ''
        )
        returning id
        """,
        email,
        PASSWORD,
    )
    # GoTrue's token grant joins auth.identities; a manual user without one
    # yields "Database error querying schema" on login.
    await conn.execute(
        """
        insert into auth.identities (
            id, provider_id, user_id, identity_data, provider,
            last_sign_in_at, created_at, updated_at
        ) values (
            gen_random_uuid(), $1, $2, $3::jsonb, 'email',
            now(), now(), now()
        )
        """,
        str(uid),
        uid,
        f'{{"sub": "{uid}", "email": "{email}"}}',
    )
    print(f"  created {email}")


async def get_token(client: httpx.AsyncClient, sup: str, email: str) -> str:
    r = await client.post(
        f"{sup}/auth/v1/token?grant_type=password",
        headers={"apikey": ANON, "Content-Type": "application/json"},
        json={"email": email, "password": PASSWORD},
    )
    if r.status_code != 200:
        raise RuntimeError(f"token {email} failed: {r.status_code} {r.text}")
    return r.json()["access_token"]


def bearer(client: httpx.AsyncClient, token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


async def expect(r: httpx.Response, *ok: int) -> dict:
    if r.status_code not in ok:
        raise RuntimeError(f"{r.request.method} {r.request.url} -> {r.status_code} {r.text}")
    return r.json() if r.content else {}


async def main() -> None:
    settings = get_settings()
    sup = settings.SUPABASE_URL.rstrip("/")
    pool = await asyncpg.create_pool(dsn=settings.DATABASE_URL, statement_cache_size=0)

    try:
        async with pool.acquire() as conn:
            await purge(conn)

        async with httpx.AsyncClient(timeout=30) as client:
            # 1. create both users directly (confirmed, hashed password)
            print("creating users…")
            async with pool.acquire() as conn:
                for u in USERS:
                    await create_user(conn, u["email"])

            # 3. tokens via password grant
            tokens = {}
            for u in USERS:
                tokens[u["email"]] = await get_token(client, sup, u["email"])
            print("tokens obtained")
            alice = tokens[USERS[0]["email"]]
            bob = tokens[USERS[1]["email"]]

            # 4. bootstrap profiles
            for u in USERS:
                await expect(
                    await client.patch(
                        f"{API}/me/profile",
                        headers=bearer(client, tokens[u["email"]]),
                        json={"username": u["username"], "display_name": u["display"]},
                    ),
                    200,
                )
            me = await expect(
                await client.get(f"{API}/me", headers=bearer(client, alice)), 200
            )
            print("profiles bootstrapped; alice =", me["username"])

            # 4b. public username availability (should be taken now)
            avail = await expect(
                await client.get(f"{API}/public/username-available?u=alice_http"), 200
            )
            print("public username-available alice_http ->", avail)
            assert avail["available"] is False, "alice_http should be taken"

            # 4c. Draft box lifecycle: save -> list -> continue(PATCH) -> discard
            saved = await expect(
                await client.post(
                    f"{API}/letters",
                    headers=bearer(client, alice),
                    json={"body": "half a thought about the sea", "subject": "Unfinished"},
                ),
                201,
            )
            draft_id = saved["letter_id"]
            mine = await expect(
                await client.get(
                    f"{API}/letters/mine?status=draft", headers=bearer(client, alice)
                ),
                200,
            )
            row = next((r for r in mine["letters"] if r["letter_id"] == draft_id), None)
            assert row, "draft should show up in /letters/mine?status=draft"
            assert row["body"] == "half a thought about the sea", "DTO must carry body"
            assert row["updated_at"], "DTO must carry updated_at (for 'edited X ago')"
            assert "recipient_username" in row, "DTO must carry recipient_username"

            edited = await expect(
                await client.patch(
                    f"{API}/letters/{draft_id}",
                    headers=bearer(client, alice),
                    json={"body": "a fuller thought about the sea", "subject": "Still unfinished"},
                ),
                200,
            )
            assert edited["body"] == "a fuller thought about the sea", "PATCH should edit body"
            await expect(
                await client.delete(
                    f"{API}/letters/{draft_id}", headers=bearer(client, alice)
                ),
                200, 204,
            )
            gone = await expect(
                await client.get(
                    f"{API}/letters/mine?status=draft", headers=bearer(client, alice)
                ),
                200,
            )
            assert all(r["letter_id"] != draft_id for r in gone["letters"]), (
                "discarded draft should be gone"
            )
            print("draft box lifecycle OK")

            # 5. Alice publishes a public letter
            draft = await expect(
                await client.post(
                    f"{API}/letters",
                    headers=bearer(client, alice),
                    json={"body": "I planted roses in my grandmother's memory this spring.",
                          "subject": "Roses"},
                ),
                201,
            )
            print("draft:", draft)
            pub = await expect(
                await client.post(
                    f"{API}/letters/{draft['letter_id']}/publish",
                    headers=bearer(client, alice),
                ),
                200,
            )
            print("published:", pub)

            # 6. Bob reads the board, opens the letter, replies
            board = await expect(
                await client.get(f"{API}/board", headers=bearer(client, bob)), 200
            )
            print("bob board deliveries:", len(board["deliveries"]))
            mine_letter = next(
                (d for d in board["deliveries"] if d["letter_id"] == draft["letter_id"]),
                None,
            )
            assert mine_letter, "Bob's board should include Alice's published letter"
            print("  card:", {k: mine_letter[k] for k in ("summary", "seal", "is_reply")})

            opened = await expect(
                await client.post(
                    f"{API}/deliveries/{mine_letter['delivery_id']}/open",
                    headers=bearer(client, bob),
                ),
                200,
            )
            print("opened title:", opened["letter"]["title"])

            reply = await expect(
                await client.post(
                    f"{API}/deliveries/{mine_letter['delivery_id']}/reply",
                    headers=bearer(client, bob),
                    json={"body": "What was her name? — a stranger"},
                ),
                200, 201,
            )
            print("reply:", reply)

            # 7. Alice sees the conversation in her mailbox
            mailbox = await expect(
                await client.get(f"{API}/mailbox", headers=bearer(client, alice)), 200
            )
            print("alice mailbox bundles:", len(mailbox["bundles"]))
            assert mailbox["bundles"], "Alice should see Bob's reply bundle"
            conv_id = mailbox["bundles"][0]["conversation_id"]
            thread = await expect(
                await client.get(f"{API}/conversations/{conv_id}", headers=bearer(client, alice)),
                200,
            )
            print("thread:", [(m["sender"], m["body"]) for m in thread["messages"]])

            print("\nHTTP E2E OK")
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
