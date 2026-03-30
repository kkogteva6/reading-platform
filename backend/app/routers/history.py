from fastapi import APIRouter, HTTPException
from ..db import get_meta, get_history

router = APIRouter()

@router.get("/profile_meta/{reader_id}")
def profile_meta(reader_id: str):
    meta = get_meta(reader_id)
    if not meta:
        # если ещё не было событий — не ошибка, просто пусто
        return {
            "reader_id": reader_id,
            "test_count": 0,
            "text_count": 0,
            "last_update_at": None,
            "last_source": None,
            "last_test_at": None,
            "last_text_at": None,
        }
    return meta

@router.get("/profile_history/{reader_id}")
def profile_history(reader_id: str, limit: int = 20):
    return get_history(reader_id, limit=limit)
