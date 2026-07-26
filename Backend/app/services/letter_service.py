"""Business logic for writing and publishing letters (the desk / LetterWriter)."""

from __future__ import annotations

import asyncpg

from app.constants import MAX_BODY
from app.repositories import letters_repo, profiles_repo
from app.services import ai_service, handles
from app.services.exceptions import (
    ForbiddenError,
    NotFoundError,
    SafetyRejectedError,
    ValidationError,
)


async def create_draft(
    pool: asyncpg.Pool,
    *,
    author_user_id: str,
    body: str,
    subject: str | None,
    recipient_username: str | None,
    language_code: str,
) -> dict:
    body = (body or "").strip()
    if not (1 <= len(body) <= MAX_BODY):
        raise ValidationError("Letter body must be 1–10000 chars", code="body_length")

    audience = "public"
    recipient_user_id: str | None = None

    if recipient_username:
        handle = handles.normalize(recipient_username)
        if not handles.is_valid(handle):
            raise ValidationError("Invalid recipient username", code="recipient_format")
        async with pool.acquire() as conn:
            recipient = await profiles_repo.get_by_username(conn, handle)
        if recipient is None:
            raise ValidationError("No such user", code="recipient_not_found")
        recipient_user_id = str(recipient["user_id"])
        if recipient_user_id == author_user_id:
            raise ValidationError("You can't write to yourself", code="recipient_self")
        audience = "directed"

    async with pool.acquire() as conn:
        row = await letters_repo.insert_draft(
            conn,
            author_user_id=author_user_id,
            body=body,
            subject=subject,
            audience=audience,
            recipient_user_id=recipient_user_id,
            language_code=language_code or "en",
        )
    return {"letter_id": str(row["id"]), "status": row["status"]}


async def publish(pool: asyncpg.Pool, *, user_id: str, letter_id: str) -> dict:
    async with pool.acquire() as conn:
        letter = await letters_repo.get_by_id(conn, letter_id)
    if letter is None:
        raise NotFoundError("Letter not found", code="letter_not_found")
    if str(letter["author_user_id"]) != user_id:
        raise ForbiddenError("Not your letter", code="not_author")
    if letter["status"] != "draft":
        raise ValidationError("Letter is not a draft", code="not_draft")

    if not await ai_service.is_content_safe(letter["body"]):
        raise SafetyRejectedError("Letter rejected by safety review", code="safety_rejected")

    summary = await ai_service.summarize_letter(letter["body"])

    async with pool.acquire() as conn:
        row = await letters_repo.mark_published(conn, letter_id, summary)
    return {
        "status": row["status"],
        "published_at": row["published_at"].isoformat() if row["published_at"] else None,
    }


def _letter_dto(row) -> dict:
    return {
        "letter_id": str(row["id"]),
        "subject": row["subject"],
        "body": row["body"],
        "summary": row["summary"],
        "audience": row["audience"],
        "recipient_user_id": str(row["recipient_user_id"])
        if row["recipient_user_id"]
        else None,
        # Present only on the drafts/list query (joined); handy for repopulating
        # the "To @handle" field when continuing a directed draft.
        "recipient_username": row.get("recipient_username"),
        "status": row["status"],
        "published_at": row["published_at"].isoformat() if row["published_at"] else None,
        "created_at": row["created_at"].isoformat(),
        "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
    }


async def list_mine(
    pool: asyncpg.Pool, *, user_id: str, status: str | None = None
) -> dict:
    async with pool.acquire() as conn:
        rows = await letters_repo.list_by_author(conn, user_id, status)
    return {"letters": [_letter_dto(r) for r in rows]}


async def _load_owned_letter(conn, user_id: str, letter_id: str):
    letter = await letters_repo.get_by_id(conn, letter_id)
    if letter is None or letter["deleted_at"] is not None:
        raise NotFoundError("Letter not found", code="letter_not_found")
    if str(letter["author_user_id"]) != user_id:
        raise ForbiddenError("Not your letter", code="not_author")
    return letter


async def update_draft(
    pool: asyncpg.Pool, *, user_id: str, letter_id: str, patch: dict
) -> dict:
    fields: dict = {}
    if "body" in patch and patch["body"] is not None:
        body = patch["body"].strip()
        if not (1 <= len(body) <= MAX_BODY):
            raise ValidationError("Letter body must be 1–10000 chars", code="body_length")
        fields["body"] = body
    if "subject" in patch:
        fields["subject"] = patch["subject"]
    if "language_code" in patch and patch["language_code"] is not None:
        fields["language_code"] = patch["language_code"]

    # Recipient can be changed while still a draft.
    if "recipient_username" in patch:
        rname = patch["recipient_username"]
        if not rname:
            fields["audience"] = "public"
            fields["recipient_user_id"] = None
        else:
            handle = handles.normalize(rname)
            if not handles.is_valid(handle):
                raise ValidationError("Invalid recipient username", code="recipient_format")
            async with pool.acquire() as conn:
                recipient = await profiles_repo.get_by_username(conn, handle)
            if recipient is None:
                raise ValidationError("No such user", code="recipient_not_found")
            if str(recipient["user_id"]) == user_id:
                raise ValidationError("You can't write to yourself", code="recipient_self")
            fields["audience"] = "directed"
            fields["recipient_user_id"] = str(recipient["user_id"])

    async with pool.acquire() as conn:
        async with conn.transaction():
            letter = await _load_owned_letter(conn, user_id, letter_id)
            if letter["status"] != "draft":
                raise ValidationError("Only drafts can be edited", code="not_draft")
            row = await letters_repo.update_draft(conn, letter_id, fields)
    return _letter_dto(row)


async def close(pool: asyncpg.Pool, *, user_id: str, letter_id: str) -> dict:
    async with pool.acquire() as conn:
        async with conn.transaction():
            await _load_owned_letter(conn, user_id, letter_id)
            row = await letters_repo.close_letter(conn, letter_id)
    return {"status": row["status"]}


async def delete(pool: asyncpg.Pool, *, user_id: str, letter_id: str) -> dict:
    async with pool.acquire() as conn:
        async with conn.transaction():
            await _load_owned_letter(conn, user_id, letter_id)
            await letters_repo.soft_delete(conn, letter_id)
    return {"deleted": True}
