"""Helpers for turning stored object paths into servable URLs."""

from __future__ import annotations

from app.config import get_settings


def avatar_url(avatar_path: str | None) -> str | None:
    """Public URL for an avatar object path in the `avatars` bucket."""
    if not avatar_path:
        return None
    base = get_settings().SUPABASE_URL.rstrip("/")
    obj = avatar_path.lstrip("/")
    if obj.startswith("avatars/"):
        obj = obj[len("avatars/") :]
    return f"{base}/storage/v1/object/public/avatars/{obj}"
