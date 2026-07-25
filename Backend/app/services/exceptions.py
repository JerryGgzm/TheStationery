"""Business exceptions.

Services raise these; the API layer maps them to HTTP responses via a single
handler in `app/__init__.py`. Each carries a stable machine `code` used in the
unified error envelope: {"error": {"code", "message", "details"}}.
"""

from __future__ import annotations

from typing import Any


class AppError(Exception):
    status_code: int = 400
    code: str = "bad_request"

    def __init__(
        self,
        message: str,
        *,
        code: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        if code:
            self.code = code
        self.details = details or {}


class ValidationError(AppError):
    status_code = 400
    code = "validation_error"


class AuthError(AppError):
    status_code = 401
    code = "unauthorized"


class ForbiddenError(AppError):
    status_code = 403
    code = "forbidden"


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"


class ConflictError(AppError):
    status_code = 409
    code = "conflict"


class SafetyRejectedError(AppError):
    status_code = 422
    code = "safety_rejected"
