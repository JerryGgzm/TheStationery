"""Database layer — a single asyncpg connection pool.

The backend talks to Supabase Postgres directly (Supavisor pooler) with the
service role's DB credentials, so it bypasses RLS and is the only tier allowed
to touch business tables. Repositories receive a `Connection` (or the pool) and
run SQL; services own transactions via `pool.acquire()` + `conn.transaction()`.
"""

from __future__ import annotations

import asyncpg

from app.config import get_settings

_pool: asyncpg.Pool | None = None


async def create_pool() -> asyncpg.Pool:
    """Create the global pool. Called once on app startup (lifespan)."""
    global _pool
    if _pool is not None:
        return _pool
    settings = get_settings()
    if not settings.DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not configured")
    _pool = await asyncpg.create_pool(
        dsn=settings.DATABASE_URL,
        # Keep the per-instance pool small: Cloud Run scales horizontally with
        # many instances, so a large pool per instance would exhaust Supavisor.
        # Scale throughput via Cloud Run instances, not a big local pool.
        min_size=1,
        max_size=5,
        # Supavisor's transaction pooler (port 6543) does not support prepared
        # statement caching across checkouts; disable it to avoid errors.
        statement_cache_size=0,
        command_timeout=30,
    )
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def get_pool() -> asyncpg.Pool:
    """Return the initialized pool (raises if startup hasn't run)."""
    if _pool is None:
        raise RuntimeError("Database pool is not initialized")
    return _pool


async def ping() -> bool:
    """Lightweight connectivity check for the health endpoint."""
    pool = get_pool()
    async with pool.acquire() as conn:
        return await conn.fetchval("select 1") == 1
