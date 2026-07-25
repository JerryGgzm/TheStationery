"""Local development entrypoint: `python run.py` (auto-reload)."""

import os

import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "app:create_app",
        factory=True,
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8080")),
        reload=True,
    )
