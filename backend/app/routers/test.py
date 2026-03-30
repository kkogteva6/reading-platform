from fastapi import APIRouter, HTTPException, Depends
from ..schemas import ApplyTestRequest, ReaderProfile
from ..services.profiles import get_profile, upsert_profile
from ..services.aggregate import merge_sources, clamp01
from ..db import upsert_meta, log_event, save_recommendation_snapshot
from ..services.recommendations import get_recommendations_explain
from pydantic import BaseModel
from ..core.auth import get_current_user_id
from typing import Dict

router = APIRouter()

class ApplyTestMeRequest(BaseModel):
    age: str = "16+"
    test_concepts: Dict[str, float]

@router.post("/me/apply_test", response_model=ReaderProfile)
def apply_test_me(req: ApplyTestMeRequest, user_id: int = Depends(get_current_user_id)):
    reader_id = str(user_id)

    # 1) получить профиль или создать новый
    try:
        profile = get_profile(reader_id)
    except KeyError:
        profile = ReaderProfile(id=reader_id, age=req.age or "16+", concepts={})

    age = req.age or profile.age or "16+"

    # 2) нормализуем входные значения анкеты (0..1)
    test_concepts = {k: clamp01(float(v)) for k, v in (req.test_concepts or {}).items()}

    # 3) смешивание
    last_text = profile.concepts or {}
    last_test = test_concepts
    merged = merge_sources(last_test, last_text, text_count=1, test_count=1)

    updated = ReaderProfile(id=reader_id, age=age, concepts=merged)

    # 4) сохранить профиль
    upsert_profile(updated)

    # 5) meta + event log
    upsert_meta(reader_id, source="test")

    profile_dict = {"id": updated.id, "age": updated.age, "concepts": updated.concepts}
    log_event(
        reader_id=reader_id,
        event_type="test",
        payload={"test_concepts": test_concepts},
        profile_after=profile_dict,
    )

    # 6) snapshot рекомендаций
    try:
        recs = get_recommendations_explain(reader_id, top_n=5)
    except Exception:
        recs = []

    save_recommendation_snapshot(
        reader_id=reader_id,
        source="test",
        top_n=5,
        age=age,
        recs=recs,
        event_id=None,
        gaps=None,
        profile={"top": sorted(list(updated.concepts.items()), key=lambda x: x[1], reverse=True)[:10]},
    )

    return updated


# @router.post("/apply_test", response_model=ReaderProfile)
# def apply_test(req: ApplyTestRequest):
#     reader_id = req.reader_id

#     # 1) получить профиль или создать новый
#     try:
#         profile = get_profile(reader_id)
#     except KeyError:
#         profile = ReaderProfile(id=reader_id, age=req.age or "16+", concepts={})

#     age = req.age or profile.age or "16+"

#     # 2) нормализуем входные значения анкеты (0..1)
#     test_concepts = {k: clamp01(float(v)) for k, v in (req.test_concepts or {}).items()}

#     # 3) берём текущее состояние профиля и пересчитываем “итог”
#     # ВАЖНО: в твоей архитектуре сейчас profile.concepts — это итоговые концепты.
#     # Поэтому "merge_sources" здесь используем так:
#     # - last_test = то, что пришло из анкеты
#     # - last_text = текущие concepts профиля (как накопленное из текстов/прошлого)
#     last_text = profile.concepts or {}
#     last_test = test_concepts

#     # Чтобы веса работали “похоже на историю”, можно оценивать счётчики через profile_meta,
#     # но у тебя они в SQLite (profile_meta), а merge_sources требует числа.
#     # Минимально корректно: просто смешать, считая что уже были тексты, а тест сейчас новый.
#     merged = merge_sources(last_test, last_text, text_count=1, test_count=1)

#     updated = ReaderProfile(id=reader_id, age=age, concepts=merged)

#     # 4) сохраняем профиль (ВАЖНО: это должно писать в SQLite, а не в память)
#     upsert_profile(updated)

#     # 5) meta + event log
#     upsert_meta(reader_id, source="test")

#     profile_dict = {"id": updated.id, "age": updated.age, "concepts": updated.concepts}
#     log_event(
#         reader_id=reader_id,
#         event_type="test",
#         payload={"test_concepts": test_concepts},
#         profile_after=profile_dict,
#     )

#     # 6) сохраняем снимок рекомендаций (чтобы use_saved=1 мог вернуть их завтра)
#     # Если профиль пустой или WORKS пуст — recs может быть [] — это ок.
#     try:
#         recs = get_recommendations_explain(reader_id, top_n=5)
#     except Exception:
#         recs = []

#     recs_jsonable = [r.model_dump() if hasattr(r, "model_dump") else r for r in recs]

#     save_recommendation_snapshot(
#         reader_id=reader_id,
#         source="test",
#         top_n=5,
#         age=age,
#         recs=recs,
#         event_id=None,
#         gaps=None,
#         profile={"top": sorted(list(updated.concepts.items()), key=lambda x: x[1], reverse=True)[:10]},
#     )

#     return updated
