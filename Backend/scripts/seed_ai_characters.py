"""Seed the AI pen-pals (`ai_characters` + an active `ai_prompt_versions`).

Idempotent — safe to run repeatedly:
  - Upserts each character by its unique `slug` (persona / display fields are
    refreshed on re-run).
  - Ensures each character has an active prompt version; only inserts one if the
    character currently has no active prompt (existing prompts are left alone so
    you don't silently clobber a hand-tuned production prompt).

Run from the Backend/ directory:
    PYTHONPATH=. python scripts/seed_ai_characters.py

The AI-reply worker (`/internal/jobs/process-ai-replies`) and the assignment
producer (`/internal/jobs/assign-ai-penpals`) need at least one active character
with an active prompt, so run this once before exercising the AI flow.
"""

import asyncio

import asyncpg

from app.config import get_settings

# Shared writing rules injected into every character's system prompt. Keeps the
# per-character block focused on personality. `{name}` is the character's name.
_STYLE = """\
How you write back:
- Write a warm, sincere hand-written letter — not a chatbot reply.
- You are simply a fellow reader at the bookstore who picked up their letter; \
never say or imply you are an AI, a model, a bot, or automated.
- Reply in the SAME language the letter was written in (Chinese letter → reply \
in Chinese; English letter → reply in English).
- Respond to what they actually wrote: reflect it back, then share a little of \
your own perspective. Stay personal and grounded, never generic.
- Keep it to a short-to-medium letter, about 2–4 short paragraphs. Don't ramble.
- End with a gentle question or an open thread that invites them to write again.
- No markdown, no headings, no bullet lists — just letter prose.
- Sign off naturally with your name, "{name}", in the letter's language."""

# slug -> character definition. `visual_asset_key` matches the frontend pixel
# folders under Frontend/public/assets/pixel/characters/<slug>/.
CHARACTERS = [
    {
        "slug": "night_regular",
        "display_name": "The Night Regular",
        "short_description": "A quiet late-night regular who is a patient listener.",
        "persona_summary": (
            "A regular who haunts the bookstore after midnight. Quiet, "
            "introspective, and a patient listener. Notices small details, "
            "speaks softly, and tends toward reflection and gentle questions "
            "rather than advice."
        ),
        "visual_asset_key": "characters/night_regular",
        "persona_prompt": (
            "You are {name}, a regular who lingers in this quiet bookstore long "
            "after midnight. You are introspective and a patient listener; you "
            "notice small details and sit with feelings rather than rushing to "
            "fix them. Your letters are calm and a little poetic, and you often "
            "answer a worry with a gentle question."
        ),
    },
    {
        "slug": "traveler",
        "display_name": "The Traveler",
        "short_description": "A warm wanderer full of stories from far places.",
        "persona_summary": (
            "A wanderer passing through, carrying stories from far-off places. "
            "Warm, encouraging, and curious about the writer's world; brings a "
            "sense of horizon and quiet hope to every letter."
        ),
        "visual_asset_key": "characters/traveler",
        "persona_prompt": (
            "You are {name}, a traveler passing through town who stopped into "
            "this bookstore. You've seen many places and people, and you write "
            "with warmth, curiosity, and quiet encouragement. You like to open "
            "small windows onto the wider world, reminding the writer that their "
            "story is part of something larger — without ever being preachy."
        ),
    },
]


def _system_prompt(char: dict) -> str:
    name = char["display_name"]
    persona = char["persona_prompt"].format(name=name)
    style = _STYLE.format(name=name)
    return f"{persona}\n\n{style}"


async def _upsert_character(conn: asyncpg.Connection, char: dict) -> str:
    row = await conn.fetchrow(
        """
        insert into public.ai_characters
            (slug, display_name, short_description, persona_summary, visual_asset_key, active)
        values ($1, $2, $3, $4, $5, true)
        on conflict (slug) do update set
            display_name = excluded.display_name,
            short_description = excluded.short_description,
            persona_summary = excluded.persona_summary,
            visual_asset_key = excluded.visual_asset_key,
            active = true,
            updated_at = now()
        returning id
        """,
        char["slug"],
        char["display_name"],
        char["short_description"],
        char["persona_summary"],
        char["visual_asset_key"],
    )
    return str(row["id"])


async def _ensure_active_prompt(
    conn: asyncpg.Connection, character_id: str, system_prompt: str
) -> str:
    existing = await conn.fetchval(
        """
        select id from public.ai_prompt_versions
        where ai_character_id = $1 and status = 'active'
        limit 1
        """,
        character_id,
    )
    if existing is not None:
        return "kept existing active prompt"

    next_version = await conn.fetchval(
        "select coalesce(max(version), 0) + 1 from public.ai_prompt_versions where ai_character_id = $1",
        character_id,
    )
    await conn.execute(
        """
        insert into public.ai_prompt_versions
            (ai_character_id, version, system_prompt, status, activated_at)
        values ($1, $2, $3, 'active', now())
        """,
        character_id,
        next_version,
        system_prompt,
    )
    return f"inserted active prompt v{next_version}"


async def main() -> None:
    settings = get_settings()
    pool = await asyncpg.create_pool(
        dsn=settings.DATABASE_URL, statement_cache_size=0
    )
    try:
        async with pool.acquire() as conn:
            for char in CHARACTERS:
                async with conn.transaction():
                    character_id = await _upsert_character(conn, char)
                    note = await _ensure_active_prompt(
                        conn, character_id, _system_prompt(char)
                    )
                print(f"  {char['slug']:<14} {character_id}  — {note}")
    finally:
        await pool.close()
    print("\nDone. Active AI pen-pals are ready to be assigned.")


if __name__ == "__main__":
    asyncio.run(main())
