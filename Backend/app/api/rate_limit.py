"""Rate limiting (slowapi, in-memory).

Keyed by the caller's bearer token (so it's per-user) falling back to client IP.
NOTE: in-memory limits are per Cloud Run instance; for strict global limits back
this with Redis (`storage_uri`) later.
"""

from __future__ import annotations

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request


def _key(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return get_remote_address(request)


limiter = Limiter(key_func=_key)

# Sensible defaults for user-initiated writes.
WRITE_LIMIT = "30/hour"
PUBLISH_LIMIT = "20/hour"
# Unauthenticated lookups (e.g. signup username availability), keyed by IP.
LOOKUP_LIMIT = "60/minute"
