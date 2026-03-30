from fastapi import APIRouter, HTTPException, Depends
from ..schemas import AnalyzeTextRequest, ReaderProfile
from ..services.nlp import analyze_text_to_concepts
from ..services.profiles import get_profile, upsert_profile
from ..services.aggregate import merge_sources, clamp01
from ..db import upsert_meta, log_event, save_recommendation_snapshot
from ..services.recommendations import get_recommendations_explain
from pydantic import BaseModel
from ..core.auth import get_current_user_id

router = APIRouter()

class AnalyzeTextMeRequest(BaseModel):
    text: str

@router.post("/me/analyze_text")
def analyze_text_me(req: AnalyzeTextMeRequest, user_id: int = Depends(get_current_user_id)):
    reader_id = str(user_id)
    text = (req.text or "").strip()

    if len(text) < 30:
        raise HTTPException(status_code=400, detail="text too short (min ~30 chars)")

    # 1) получить профиль или создать новый
    try:
        profile = get_profile(reader_id)
    except KeyError:
        profile = ReaderProfile(id=reader_id, age="16+", concepts={})

    age = profile.age or "16+"

    # 2) анализ текста -> delta концептов (скорее всего 0..1)
    delta = analyze_text_to_concepts(text) or {}
    last_text = {k: clamp01(float(v)) for k, v in delta.items()}

    # 3) пересчитать итоговый профиль
    last_test = profile.concepts or {}
    merged = merge_sources(last_test, last_text, text_count=1, test_count=1)

    updated = ReaderProfile(id=reader_id, age=age, concepts=merged)

    # 4) сохранить профиль
    upsert_profile(updated)

    # 5) meta + event log
    upsert_meta(reader_id, source="text")

    profile_dict = {"id": updated.id, "age": updated.age, "concepts": updated.concepts}
    log_event(
        reader_id=reader_id,
        event_type="text",
        payload={"text_len": len(text)},
        profile_after=profile_dict,
    )

    # 6) snapshot рекомендаций
    try:
        recs = get_recommendations_explain(reader_id, top_n=5)
    except Exception:
        recs = []

    save_recommendation_snapshot(
        reader_id=reader_id,
        source="text",
        top_n=5,
        age=age,
        recs=recs,
        event_id=None,
        gaps=None,
        profile={"top": sorted(list(updated.concepts.items()), key=lambda x: x[1], reverse=True)[:10]},
    )

    return {"ok": True, "profile": updated}    

# @router.post("/analyze_text")
# def analyze_text(req: AnalyzeTextRequest):
#     reader_id = req.reader_id
#     text = (req.text or "").strip()

#     if len(text) < 30:
#         raise HTTPException(status_code=400, detail="text too short (min ~30 chars)")

#     # 1) получить профиль или создать новый
#     try:
#         profile = get_profile(reader_id)
#     except KeyError:
#         profile = ReaderProfile(id=reader_id, age="16+", concepts={})

#     age = profile.age or "16+"

#     # 2) анализ текста -> delta концептов (скорее всего 0..1)
#     delta = analyze_text_to_concepts(text) or {}
#     last_text = {k: clamp01(float(v)) for k, v in delta.items()}

#     # 3) пересчитать итоговый профиль
#     # тут last_test = текущее, что уже было в профиле (если там был вклад теста/истории)
#     # last_text = новый анализ
#     last_test = profile.concepts or {}

#     merged = merge_sources(last_test, last_text, text_count=1, test_count=1)

#     updated = ReaderProfile(id=reader_id, age=age, concepts=merged)

#     # 4) сохранить профиль
#     upsert_profile(updated)

#     # 5) meta + event log
#     upsert_meta(reader_id, source="text")

#     profile_dict = {"id": updated.id, "age": updated.age, "concepts": updated.concepts}
#     log_event(
#         reader_id=reader_id,
#         event_type="text",
#         payload={"text_len": len(text)},
#         profile_after=profile_dict,
#     )

#     # 6) snapshot рекомендаций
#     try:
#         recs = get_recommendations_explain(reader_id, top_n=5)
#     except Exception:
#         recs = []

#     recs_jsonable = [r.model_dump() if hasattr(r, "model_dump") else r for r in recs]

#     save_recommendation_snapshot(
#         reader_id=reader_id,
#         source="text",
#         top_n=5,
#         age=age,
#         recs=recs,
#         event_id=None,
#         gaps=None,
#         profile={"top": sorted(list(updated.concepts.items()), key=lambda x: x[1], reverse=True)[:10]},
#     )

#     return {"ok": True, "profile": updated}
