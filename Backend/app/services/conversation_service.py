"""Correspondence (book-shelf) + in-conversation replies."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import asyncpg

from app.repositories import (
    ai_characters_repo,
    conversations_repo,
    letters_repo,
    messages_repo,
)
from app.constants import MAX_BODY
from app.services import ai_jobs_service, derive
from app.services.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.services.media import avatar_url


def _correspondent(row: asyncpg.Record) -> dict:
    if row["corr_user_id"] is not None:
        return {
            "type": "human",
            "username": row["corr_username"],
            "display_name": row["corr_display_name"],
            "avatar_url": avatar_url(row["corr_avatar_path"]),
        }
    return {
        "type": "ai_character",
        "username": row["ai_slug"],
        "display_name": row["ai_display_name"],
        "avatar_url": None,
    }


async def get_mailbox(pool: asyncpg.Pool, user_id: str) -> dict:
    async with pool.acquire() as conn:
        rows = await conversations_repo.list_for_user(conn, user_id)
    bundles = [
        {
            "conversation_id": str(r["conversation_id"]),
            "correspondent": _correspondent(r),
            "letter_count": r["message_count"],
            "unread_count": r["unread_count"],
            "last_message_at": r["last_message_at"].isoformat(),
            "tie": derive.tie_for(str(r["conversation_id"])),
        }
        for r in rows
    ]
    return {"bundles": bundles}


async def get_conversation(
    pool: asyncpg.Pool, user_id: str, conversation_id: str
) -> dict:
    async with pool.acquire() as conn:
        conversation = await conversations_repo.get_by_id(conn, conversation_id)
        if conversation is None:
            raise NotFoundError("Conversation not found", code="conversation_not_found")
        if not conversations_repo.is_participant(conversation, user_id):
            raise ForbiddenError("Not your conversation", code="not_participant")
        root = await letters_repo.get_by_id(conn, str(conversation["root_letter_id"]))
        messages = await messages_repo.list_for_conversation(conn, conversation_id)
        # Opening the thread counts as reading it — clear the unread badge.
        await messages_repo.mark_conversation_read(conn, conversation_id, user_id)

    def _msg(m: asyncpg.Record) -> dict:
        mine = (
            m["sender_type"] == "user"
            and m["sender_user_id"] is not None
            and str(m["sender_user_id"]) == user_id
        )
        return {
            "id": str(m["id"]),
            "sender": "user" if mine else "correspondent",
            "body": m["body"],
            "created_at": m["created_at"].isoformat(),
            "is_reply": not mine,
        }

    root_mine = str(conversation["letter_author_user_id"]) == user_id

    return {
        "conversation_id": str(conversation["id"]),
        "root_letter": {
            "id": str(root["id"]),
            "title": root["subject"],
            "body": root["body"],
            "sender": "user" if root_mine else "correspondent",
        }
        if root
        else None,
        "messages": [_msg(m) for m in messages],
    }


async def post_message(
    pool: asyncpg.Pool, *, user_id: str, conversation_id: str, body: str
) -> dict:
    body = (body or "").strip()
    if not (1 <= len(body) <= MAX_BODY):
        raise ValidationError("Message must be 1–10000 chars", code="body_length")

    async with pool.acquire() as conn:
        async with conn.transaction():
            conversation = await conversations_repo.get_by_id(conn, conversation_id)
            if conversation is None:
                raise NotFoundError(
                    "Conversation not found", code="conversation_not_found"
                )
            if not conversations_repo.is_participant(conversation, user_id):
                raise ForbiddenError("Not your conversation", code="not_participant")
            if conversation["status"] != "active":
                raise ValidationError("Conversation is closed", code="conversation_closed")

            message = await messages_repo.insert_user_message(
                conn,
                conversation_id=conversation_id,
                sender_user_id=user_id,
                body=body,
            )

            # If the other party is an AI character, queue a reply job.
            if (
                conversation["responder_type"] == "ai_character"
                and str(conversation["letter_author_user_id"]) == user_id
            ):
                prompt = await ai_characters_repo.get_active_prompt(
                    conn, str(conversation["responder_ai_character_id"])
                )
                if prompt is not None:
                    await ai_jobs_service.enqueue_conversation_reply(
                        conn,
                        conversation_id=conversation_id,
                        ai_character_id=str(conversation["responder_ai_character_id"]),
                        prompt_version_id=str(prompt["id"]),
                        reply_to_message_id=str(message["id"]),
                        scheduled_for=datetime.now(timezone.utc) + timedelta(minutes=1),
                    )

    return {"message_id": str(message["id"])}


async def close_conversation(
    pool: asyncpg.Pool, *, user_id: str, conversation_id: str
) -> dict:
    async with pool.acquire() as conn:
        async with conn.transaction():
            conversation = await conversations_repo.get_by_id(conn, conversation_id)
            if conversation is None:
                raise NotFoundError(
                    "Conversation not found", code="conversation_not_found"
                )
            if not conversations_repo.is_participant(conversation, user_id):
                raise ForbiddenError("Not your conversation", code="not_participant")
            row = await conversations_repo.set_status(conn, conversation_id, "closed")
    return {"status": row["status"]}
