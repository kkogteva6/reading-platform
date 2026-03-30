from fastapi import APIRouter, HTTPException
from ..schemas import GapSummaryItem
from ..services.profiles import get_profile
from ..services.targets import TARGET_PROFILES

router = APIRouter()

@router.get("/gaps/{reader_id}", response_model=list[GapSummaryItem])
def get_gaps(reader_id: str):
    try:
        profile = get_profile(reader_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="profile not found")

    target = TARGET_PROFILES.get(profile.age)
    if not target:
        return []

    out: list[GapSummaryItem] = []
    keys = set(target.keys()) | set(profile.concepts.keys())
    for k in keys:
        t = float(target.get(k, 0.0))
        c = float(profile.concepts.get(k, 0.0))
        gap = t - c
        if abs(gap) < 1e-9:
            continue
        out.append(GapSummaryItem(
            concept=k,
            target=t,
            current=c,
            gap=gap,
            direction="below" if gap > 0 else "above",
        ))

    # сначала дефициты (gap>0), потом "сильные стороны"
    out.sort(key=lambda x: (x.direction != "below", -abs(x.gap)))
    return out[:15]
