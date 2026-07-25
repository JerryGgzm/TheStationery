"""FastAPI application factory.

Mirrors ProdMatch's deployment shape (create_app factory + uvicorn --factory)
but keeps a clean 4-layer split: api → service → repository → database.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import get_settings
from app.database.connection import close_pool, create_pool, ping
from app.services.exceptions import AppError

logger = logging.getLogger("stationery")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    settings.validate_production()
    await create_pool()
    logger.info("Database pool ready (env=%s)", settings.ENV)
    try:
        yield
    finally:
        from app.services import openrouter_client

        await openrouter_client.aclose()
        await close_pool()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="The Stationery API",
        version="0.1.0",
        docs_url="/api-docs",
        redoc_url="/api-redoc",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-Internal-Token"],
    )

    _register_rate_limiter(app)
    _register_routers(app)
    _register_error_handlers(app)

    @app.get("/health", tags=["meta"])
    async def health():
        db_ok = False
        try:
            db_ok = await ping()
        except Exception as exc:  # noqa: BLE001
            logger.warning("Health DB check failed: %s", exc)
        status = "healthy" if db_ok else "degraded"
        body = {"status": status, "environment": settings.ENV, "version": "0.1.0",
                "checks": {"database": "ok" if db_ok else "error"}}
        return JSONResponse(body, status_code=200 if db_ok else 503)

    @app.get("/", tags=["meta"])
    async def root():
        return {"service": "the-stationery-api", "version": "0.1.0"}

    return app


def _register_routers(app: FastAPI) -> None:
    from app.api.v1 import (
        ai_characters,
        board,
        conversations,
        deliveries,
        internal,
        letters,
        mailbox,
        me,
        public,
        reports,
        users,
    )

    prefix = get_settings().API_PREFIX
    for module in (me, public, board, letters, deliveries, conversations, mailbox,
                   ai_characters, users, reports):
        app.include_router(module.router, prefix=prefix)
    # Internal job endpoints live at the root (Scheduler-only, token-guarded).
    app.include_router(internal.router)


def _register_rate_limiter(app: FastAPI) -> None:
    from slowapi.errors import RateLimitExceeded

    from app.api.rate_limit import limiter

    app.state.limiter = limiter

    @app.exception_handler(RateLimitExceeded)
    async def _handle_rate_limit(_: Request, exc: RateLimitExceeded):
        return JSONResponse(
            {"error": {"code": "rate_limited",
                       "message": f"Rate limit exceeded: {exc.detail}",
                       "details": {}}},
            status_code=429,
        )


def _register_error_handlers(app: FastAPI) -> None:
    def _envelope(code: str, message: str, details: dict | None = None) -> dict:
        return {"error": {"code": code, "message": message, "details": details or {}}}

    @app.exception_handler(AppError)
    async def _handle_app_error(_: Request, exc: AppError):
        return JSONResponse(
            _envelope(exc.code, exc.message, exc.details), status_code=exc.status_code
        )

    @app.exception_handler(RequestValidationError)
    async def _handle_validation(_: Request, exc: RequestValidationError):
        return JSONResponse(
            _envelope("validation_error", "Request validation failed",
                      {"errors": exc.errors()}),
            status_code=422,
        )

    @app.exception_handler(StarletteHTTPException)
    async def _handle_http(_: Request, exc: StarletteHTTPException):
        detail = exc.detail
        if isinstance(detail, dict) and "error" in detail:
            return JSONResponse(detail, status_code=exc.status_code)
        return JSONResponse(
            _envelope("http_error", str(detail)), status_code=exc.status_code
        )

    @app.exception_handler(Exception)
    async def _handle_unexpected(_: Request, exc: Exception):
        logger.exception("Unhandled error: %s", exc)
        return JSONResponse(
            _envelope("internal_error", "Something went wrong"), status_code=500
        )
