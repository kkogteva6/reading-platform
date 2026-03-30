from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from ..core.auth import get_current_user_id
from ..schemas import ReaderProfile
from ..services.nlp import analyze_text_to_concepts
from ..services.profiles import get_profile, upsert_profile
from ..services.aggregate import merge_sources, clamp01
from ..services.recommendations import get_recommendations_explain
from ..db import (
    add_read_book,
    list_read_books,
    get_read_book,
    delete_read_book,
    upsert_meta,
    log_event,
    save_recommendation_snapshot,
)

router = APIRouter(prefix="/reading", tags=["reading"])


class AddReadBookIn(BaseModel):
    work_id: str
    title: str
    author: str | None = None
    age: str | None = None
    rating: int | None = Field(default=None, ge=1, le=5)
    impression_text: str | None = None


@router.get("/read-books")
def api_list_read_books(user_id: int = Depends(get_current_user_id)):
    reader_id = str(user_id)
    return list_read_books(reader_id)


@router.get("/read-books/{read_book_id}")
def api_get_read_book(read_book_id: int, user_id: int = Depends(get_current_user_id)):
    reader_id = str(user_id)
    item = get_read_book(reader_id, read_book_id)
    if not item:
        raise HTTPException(status_code=404, detail="read book not found")
    return item


@router.delete("/read-books/{read_book_id}")
def api_delete_read_book(read_book_id: int, user_id: int = Depends(get_current_user_id)):
    reader_id = str(user_id)
    ok = delete_read_book(reader_id, read_book_id)
    if not ok:
        raise HTTPException(status_code=404, detail="read book not found")
    return {"ok": True}


@router.post("/read-books")
def api_add_read_book(data: AddReadBookIn, user_id: int = Depends(get_current_user_id)):
    reader_id = str(user_id)

    work_id = (data.work_id or "").strip()
    title = (data.title or "").strip()
    author = (data.author or "").strip() or None
    age = (data.age or "").strip() or None
    impression_text = (data.impression_text or "").strip() or None

    if not work_id:
        raise HTTPException(status_code=400, detail="work_id is required")
    if not title:
        raise HTTPException(status_code=400, detail="title is required")

    # 1) анализ впечатления как текста
    concepts = {}
    updated_profile = None

    try:
        profile = get_profile(reader_id)
    except KeyError:
        profile = ReaderProfile(id=reader_id, age="16+", concepts={})

    profile_age = profile.age or "16+"

    if impression_text and len(impression_text) >= 30:
        delta = analyze_text_to_concepts(impression_text) or {}
        concepts = {k: clamp01(float(v)) for k, v in delta.items()}

        last_test = profile.concepts or {}
        merged = merge_sources(last_test, concepts, text_count=1, test_count=1)

        updated_profile = ReaderProfile(id=reader_id, age=profile_age, concepts=merged)
        upsert_profile(updated_profile)

        upsert_meta(reader_id, source="text")

        profile_dict = {
            "id": updated_profile.id,
            "age": updated_profile.age,
            "concepts": updated_profile.concepts,
        }

        log_event(
            reader_id=reader_id,
            event_type="book_review",
            payload={
                "work_id": work_id,
                "title": title,
                "author": author,
                "rating": data.rating,
                "impression_text": impression_text,
                "concepts": concepts,
            },
            profile_after=profile_dict,
        )

        try:
            recs = get_recommendations_explain(reader_id, top_n=5)
        except Exception:
            recs = []

        save_recommendation_snapshot(
            reader_id=reader_id,
            source="text",
            top_n=5,
            age=profile_age,
            recs=recs,
            event_id=None,
            gaps=None,
            profile={"top": sorted(list(updated_profile.concepts.items()), key=lambda x: x[1], reverse=True)[:10]},
        )

    item = add_read_book(
        reader_id=reader_id,
        work_id=work_id,
        title=title,
        author=author,
        age=age,
        rating=data.rating,
        impression_text=impression_text,
        concepts=concepts,
    )

    return {
        "ok": True,
        "item": item,
        "profile": updated_profile,
    }