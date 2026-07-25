"""The letter wall / board — assembles a batch of deliveries for the viewer."""

from __future__ import annotations

import asyncpg

from app.repositories import deliveries_repo
from app.services import derive

BOARD_SIZE = 5


def _delivery_dto(row: asyncpg.Record, viewer_user_id: str) -> dict:
    letter_id = str(row["letter_id"])
    is_reply = row["audience"] == "directed" and (
        row["recipient_user_id"] is not None
        and str(row["recipient_user_id"]) == viewer_user_id
    )
    return {
        "delivery_id": str(row["delivery_id"]),
        "letter_id": letter_id,
        "position": row["position"],
        "summary": row["summary"],
        "seal": derive.seal_for(letter_id),
        "is_reply": is_reply,
        "opened": row["opened_at"] is not None,
    }


async def get_board(pool: asyncpg.Pool, viewer_user_id: str) -> dict:
    """Reuse the active batch if present; otherwise atomically build a new one."""
    async with pool.acquire() as conn:
        async with conn.transaction():
            batch = await deliveries_repo.get_active_batch(conn, viewer_user_id)

            if batch is None:
                candidates = await deliveries_repo.fetch_candidate_letters(
                    conn, viewer_user_id, BOARD_SIZE
                )
                batch = await deliveries_repo.create_batch(conn, viewer_user_id)
                for position, cand in enumerate(candidates, start=1):
                    await deliveries_repo.insert_delivery(
                        conn,
                        batch_id=str(batch["id"]),
                        viewer_user_id=viewer_user_id,
                        letter_id=str(cand["id"]),
                        position=position,
                    )

            rows = await deliveries_repo.list_batch_deliveries(
                conn, str(batch["id"]), viewer_user_id
            )

    return {
        "batch_id": str(batch["id"]),
        "deliveries": [_delivery_dto(r, viewer_user_id) for r in rows],
    }
