"""Application settings.

Loads a local `.env` in development (via python-dotenv) and reads everything
through a cached pydantic-settings object. Cloud Run injects real env vars, so
the `.env` file is only used locally.
"""

from __future__ import annotations

from functools import lru_cache

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

load_dotenv()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # ── Runtime ──
    ENV: str = "development"
    PORT: int = 8080
    API_PREFIX: str = "/api/v1"
    # Dev default accepts the Next.js dev server on either host alias so the app
    # works whether opened via localhost or 127.0.0.1. Override in production.
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    # ── Supabase ──
    # HTTPS API gateway — used for the JWKS endpoint (verify ES256 access tokens)
    # and for building public avatar URLs. NOT a database connection.
    SUPABASE_URL: str = ""
    # Direct Postgres wire connection (asyncpg) via the Supavisor pooler.
    DATABASE_URL: str = ""
    # Optional server-side secret key (sb_secret_…). Only needed later if the
    # backend calls Supabase admin/Storage/REST APIs; unused for now.
    SUPABASE_SECRET_KEY: str = ""

    # ── OpenRouter ──
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    OPENROUTER_MODEL: str = "openai/gpt-4o-mini"
    OPENROUTER_HTTP_REFERER: str = ""
    OPENROUTER_APP_TITLE: str = "The Stationery"

    # ── Internal jobs ──
    INTERNAL_JOB_TOKEN: str = ""

    # ── LLM defaults ──
    LLM_TEMPERATURE: float = 0.8
    LLM_MAX_TOKENS: int = 800

    @property
    def is_production(self) -> bool:
        return self.ENV.lower() == "production"

    @property
    def jwks_url(self) -> str:
        return f"{self.SUPABASE_URL.rstrip('/')}/auth/v1/.well-known/jwks.json"

    @property
    def cors_origins_list(self) -> list[str]:
        raw = (self.CORS_ORIGINS or "").strip()
        if raw == "*":
            return ["*"]
        return [o.strip() for o in raw.split(",") if o.strip()]

    def validate_production(self) -> None:
        """Fail fast on obvious misconfiguration when running in production."""
        if not self.is_production:
            return
        missing = [
            name
            for name in (
                "DATABASE_URL",
                "SUPABASE_URL",
                "INTERNAL_JOB_TOKEN",
            )
            if not getattr(self, name)
        ]
        if missing:
            raise RuntimeError(f"Missing required env vars in production: {missing}")
        if "*" in self.cors_origins_list:
            raise RuntimeError("CORS_ORIGINS must not be '*' in production")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
