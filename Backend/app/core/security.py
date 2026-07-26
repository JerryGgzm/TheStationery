"""Auth primitives.

Supabase issues access tokens signed with the project's **asymmetric JWT
signing key (ES256)**. We verify them with the public keys published at the
project's JWKS endpoint — no shared secret, no admin API key needed. PyJWKClient
fetches and caches the keys.
"""

from __future__ import annotations

from dataclasses import dataclass

import jwt
from jwt import PyJWKClient

from app.config import get_settings
from app.services.exceptions import AuthError

_jwk_client: PyJWKClient | None = None


def _client() -> PyJWKClient:
    global _jwk_client
    if _jwk_client is None:
        settings = get_settings()
        if not settings.SUPABASE_URL:
            raise AuthError("Auth is not configured", code="auth_misconfigured")
        # cache keys ~10 min; refresh handles key rotation automatically.
        _jwk_client = PyJWKClient(settings.jwks_url, cache_keys=True, lifespan=600)
    return _jwk_client


@dataclass
class CurrentUser:
    user_id: str  # auth.users.id (JWT `sub`)


def verify_access_token(token: str) -> CurrentUser:
    try:
        signing_key = _client().get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256"],
            audience="authenticated",
            options={"verify_aud": True},
        )
    except jwt.ExpiredSignatureError as exc:
        raise AuthError("Access token expired", code="token_expired") from exc
    except jwt.InvalidTokenError as exc:
        raise AuthError("Invalid access token", code="invalid_token") from exc
    except AuthError:
        raise
    except Exception as exc:  # JWKS fetch / network / key errors
        raise AuthError("Could not verify token", code="jwks_error") from exc

    sub = payload.get("sub")
    if not sub:
        raise AuthError("Token missing subject", code="invalid_token")
    return CurrentUser(user_id=sub)


def verify_internal_token(provided: str | None) -> None:
    """Guard for Cloud Scheduler → /internal/jobs/* endpoints."""
    settings = get_settings()
    if not settings.INTERNAL_JOB_TOKEN or provided != settings.INTERNAL_JOB_TOKEN:
        raise AuthError("Invalid internal token", code="invalid_internal_token")
