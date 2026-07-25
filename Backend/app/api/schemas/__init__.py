"""Pydantic request models for the v1 API. Responses are returned as plain
dicts assembled in the service layer.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class ProfilePatch(BaseModel):
    username: str | None = None
    display_name: str | None = None
    avatar_path: str | None = None
    language_code: str | None = None
    allow_ai_replies: bool | None = None
    allow_human_replies: bool | None = None


class CreateLetter(BaseModel):
    body: str = Field(min_length=1, max_length=10000)
    subject: str | None = Field(default=None, max_length=160)
    recipient_username: str | None = None
    language_code: str = "en"


class ReplyBody(BaseModel):
    body: str = Field(min_length=1, max_length=10000)


class UpdateLetter(BaseModel):
    body: str | None = Field(default=None, max_length=10000)
    subject: str | None = Field(default=None, max_length=160)
    recipient_username: str | None = None
    language_code: str | None = None


class CreateReport(BaseModel):
    target_type: str
    target_id: str
    reason: str
    details: str | None = Field(default=None, max_length=2000)
