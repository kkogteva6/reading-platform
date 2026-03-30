# app/routers/recommendations.py
from __future__ import annotations

import json
from fastapi import APIRouter
from ..services.recommendations import get_recommendations_explain
from ..db import get_conn

router = APIRouter()


@router.get("/recommendations_explain/{reader_id}")
def recommendations_explain(reader_id: str, top_n: int = 5, use_saved: int = 1):
    """
    Пытаемся посчитать рекомендации "вживую".
    Если профиля нет или результат пустой и use_saved=1 —
    отдаём последний сохранённый снапшот из SQLite.
    """
    try:
        recs = get_recommendations_explain(reader_id, top_n=top_n)
    except KeyError:
        recs = []
    except Exception:
        recs = []

    if recs:
        return recs

    if not use_saved:
        return []

    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT recs_json
            FROM recommendation_snapshots
            WHERE reader_id = ?
            ORDER BY created_at DESC
            LIMIT 1;
            """,
            (reader_id,),
        ).fetchone()

    if not row:
        return []

    try:
        return json.loads(row["recs_json"])
    except Exception:
        return []


@router.get("/recommendations_saved/{reader_id}")
def recommendations_saved(reader_id: str, limit: int = 20):
    limit = max(1, min(100, int(limit)))

    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, reader_id, created_at, source, top_n, gaps_json, profile_json, recs_json
            FROM recommendation_snapshots
            WHERE reader_id = ?
            ORDER BY created_at DESC
            LIMIT ?;
            """,
            (reader_id, limit),
        ).fetchall()

    out = []
    for r in rows:
        out.append(
            {
                "id": r["id"],
                "reader_id": r["reader_id"],
                "created_at": r["created_at"],
                "source": r["source"],
                "top_n": r["top_n"],
                "gaps": json.loads(r["gaps_json"]) if r["gaps_json"] else None,
                "profile": json.loads(r["profile_json"]) if r["profile_json"] else None,
                "recs": json.loads(r["recs_json"]) if r["recs_json"] else [],
            }
        )
    return out