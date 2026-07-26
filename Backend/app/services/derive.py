"""Stable, deterministic derivation of decorative styles from ids.

The frontend renders a wax seal per letter and a tie per correspondence bundle.
These carry no data meaning, but must be *stable* for a given id so a letter
always looks the same. We hash the id and index into the frontend's style sets.
"""

from __future__ import annotations

import hashlib

# Must match Frontend/lib/derive.ts
SEALS = ("wax", "clip", "pin", "tape", "ribbon")
TIES = ("red-string", "green-string", "clip", "twine-wax", "green-band")


def _index(value: str, modulo: int) -> int:
    digest = hashlib.sha1(value.encode("utf-8")).digest()
    return int.from_bytes(digest[:4], "big") % modulo


def seal_for(letter_id: str) -> str:
    return SEALS[_index(letter_id, len(SEALS))]


def tie_for(key: str) -> str:
    return TIES[_index(key, len(TIES))]
