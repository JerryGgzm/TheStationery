"""Opening and replying to a delivered letter (LetterWall detail / reply)."""

from __future__ import annotations

import asyncpg

from app.repositories import (
    conversations_repo,
    deliveries_repo,
    letters_repo,
    messages_repo,
    profiles_repo,
)
from app.constants import MAX_BODY
from app.services.exceptions import ForbiddenError, NotFoundError, ValidationError


async def open_delivery(
    pool: asyncpg.Pool, *, viewer_user_id: str, delivery_id: str
) -> dict:
    async with pool.acquire() as conn:
        async with conn.transaction():
            delivery = await deliveries_repo.get_delivery(conn, delivery_id, viewer_user_id)
            if delivery is None:
                raise NotFoundError("Delivery not found", code="delivery_not_found")
            await deliveries_repo.mark_opened(conn, delivery_id)
            letter = await letters_repo.get_by_id(conn, str(delivery["letter_id"]))
            author = await profiles_repo.get_by_user_id(
                conn, str(letter["author_user_id"])
            )
    return {
        "letter": {
            "id": str(letter["id"]),
            "subject": letter["subject"],
            "title": letter["subject"],
            "body": letter["body"],
            "author_display": author["display_name"] if author else None,
            "language_code": letter["language_code"],
        }
    }


async def _require_delivery(conn, delivery_id: str, viewer_user_id: str):
    delivery = await deliveries_repo.get_delivery(conn, delivery_id, viewer_user_id)
    if delivery is None:
        raise NotFoundError("Delivery not found", code="delivery_not_found")
    return delivery


async def skip_delivery(
    pool: asyncpg.Pool, *, viewer_user_id: str, delivery_id: str
) -> dict:
    async with pool.acquire() as conn:
        await _require_delivery(conn, delivery_id, viewer_user_id)
        await deliveries_repo.mark_skipped(conn, delivery_id)
    return {"skipped": True}


async def hide_delivery(
    pool: asyncpg.Pool, *, viewer_user_id: str, delivery_id: str
) -> dict:
    async with pool.acquire() as conn:
        await _require_delivery(conn, delivery_id, viewer_user_id)
        await deliveries_repo.mark_hidden(conn, delivery_id)
    return {"hidden": True}


async def reply_to_delivery(
    pool: asyncpg.Pool, *, viewer_user_id: str, delivery_id: str, body: str
) -> dict:
    body = (body or "").strip()
    if not (1 <= len(body) <= MAX_BODY):
        raise ValidationError("Reply must be 1–10000 chars", code="body_length")

    async with pool.acquire() as conn:
        async with conn.transaction():
            delivery = await deliveries_repo.get_delivery(conn, delivery_id, viewer_user_id)
            if delivery is None:
                raise NotFoundError("Delivery not found", code="delivery_not_found")

            letter = await letters_repo.get_by_id(conn, str(delivery["letter_id"]))
            author_user_id = str(letter["author_user_id"])
            if author_user_id == viewer_user_id:
                raise ForbiddenError("Can't reply to your own letter", code="reply_self")

            conversation = await conversations_repo.find_human_conversation(
                conn, str(letter["id"]), viewer_user_id
            )
            if conversation is None:
                conversation = await conversations_repo.create_human_conversation(
                    conn,
                    root_letter_id=str(letter["id"]),
                    letter_author_user_id=author_user_id,
                    responder_user_id=viewer_user_id,
                    created_from_delivery_id=delivery_id,
                )

            message = await messages_repo.insert_user_message(
                conn,
                conversation_id=str(conversation["id"]),
                sender_user_id=viewer_user_id,
                body=body,
            )
            await deliveries_repo.mark_replied(
                conn, delivery_id, str(conversation["id"])
            )

    return {
        "conversation_id": str(conversation["id"]),
        "message_id": str(message["id"]),
    }
