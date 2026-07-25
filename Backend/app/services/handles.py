"""Username handle rules — kept in sync with profiles.username_format and the
frontend (LetterWriter / ProfilePanel): 3–20 chars, starts with a letter, then
letters / digits / underscore. Case-insensitive; normalised to lowercase.
"""

from __future__ import annotations

import re

USERNAME_RE = re.compile(r"^[a-z][a-z0-9_]{2,19}$")


def normalize(raw: str) -> str:
    return raw.strip().lstrip("@").lower()


def is_valid(handle: str) -> bool:
    return bool(USERNAME_RE.match(handle))
