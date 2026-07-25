"""FastAPI dependencies: auth + DB pool access."""

from __future__ import annotations

import asyncpg
from fastapi import Depends, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.security import CurrentUser, verify_access_token, verify_internal_token
from app.database.connection import get_pool

_bearer = HTTPBearer(auto_error=True)


def get_db_pool() -> asyncpg.Pool:
    return get_pool()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> CurrentUser:
    return verify_access_token(credentials.credentials)


def require_internal_token(x_internal_token: str | None = Header(default=None)) -> None:
    verify_internal_token(x_internal_token)
