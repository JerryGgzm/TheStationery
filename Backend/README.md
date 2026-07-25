# The Stationery — Backend

FastAPI service for The Stationery, deployed to **Google Cloud Run**. It is the
only tier that touches business tables in Supabase Postgres (service-role /
direct DB credentials, bypassing RLS). The browser only uses Supabase for Auth
sessions and the `avatars` Storage bucket.

## Architecture (4 layers)

```
api  (routers + request schemas)        app/api/
  └─ service   (business logic + external APIs)   app/services/
       └─ repository   (pure SQL reads/writes)    app/repositories/
            └─ database (asyncpg pool)            app/database/
```

- **Auth**: Supabase access tokens verified via the project's JWKS public keys
  (ES256) in `app/core/security.py` — no shared secret or API key needed.
- **LLM**: OpenRouter (OpenAI-compatible) via `app/services/openrouter_client.py`.
- **Errors**: services raise `AppError` subclasses (`app/services/exceptions.py`);
  a single handler maps them to `{"error": {"code","message","details"}}`.

## Local development

```bash
cd Backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env      # fill in values (DATABASE_URL, SUPABASE_*, OPENROUTER_*)
python run.py             # http://localhost:8080  (docs at /api-docs)
```

`DATABASE_URL` is the Supabase **Supavisor pooler** connection string
(port 6543, `sslmode=require`). Startup fails fast if it's missing.

## Deploy (Cloud Run)

Uses the same shape as ProdMatch: Cloud Run builds the `Backend/Dockerfile`
(uvicorn `--factory app:create_app`, single worker). Set env vars via Cloud Run
+ Secret Manager. Health check: `GET /health`.

## Status

Implemented endpoints and the remaining backlog are tracked in
`../Docs/backend_build_status.md`. API contracts live in
`../Docs/frontend_backend_integration.md`.
