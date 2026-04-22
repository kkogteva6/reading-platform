from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, Tuple

from ..db import list_read_book_ids
from ..schemas import ExplainedRecommendation, GapItem, ReaderProfile, WhyBlock, Work
from ..services.profiles import get_profile
from ..store import WORKS
from .graph import get_works_from_neo4j
from .targets import CONCEPT_ALIASES, TARGET_PROFILES


def parse_min_age(age: str) -> Optional[int]:
    try:
        return int(age.replace("+", "").strip())
    except Exception:
        return None


def is_age_compatible(reader_age: str, work_age: str) -> bool:
    r_min = parse_min_age(reader_age)
    w_min = parse_min_age(work_age)
    if r_min is None or w_min is None:
        return False
    return r_min >= w_min


def compute_gaps(profile: ReaderProfile, target: Dict[str, float]) -> List[Dict[str, Any]]:
    gaps: List[Dict[str, Any]] = []
    all_keys = set(target.keys()) | set(profile.concepts.keys())
    for key in all_keys:
        target_value = float(target.get(key, 0.0))
        current_value = float(profile.concepts.get(key, 0.0))
        gap = target_value - current_value
        if abs(gap) < 1e-9:
            continue
        gaps.append(
            {
                "concept": key,
                "target": target_value,
                "current": current_value,
                "gap": gap,
                "direction": "below" if gap > 0 else "above",
            }
        )
    return gaps


def iter_concept_weights_for_work(core_concept: str, work: Work) -> List[Tuple[str, float, Optional[str]]]:
    items: List[Tuple[str, float, Optional[str]]] = []
    base_weight = float(work.concepts.get(core_concept, 0.0))
    if base_weight > 0:
        items.append((core_concept, base_weight, None))

    aliases = CONCEPT_ALIASES.get(core_concept, {})
    for alias, coef in aliases.items():
        alias_weight = float(work.concepts.get(alias, 0.0)) * float(coef)
        if alias_weight > 0:
            items.append((alias, alias_weight, core_concept))
    return items


def work_score_by_gaps_with_explain(
    gaps: List[Dict[str, Any]],
    work: Work,
    mode: Literal["correction", "deepening"],
) -> Tuple[float, List[GapItem]]:
    score = 0.0
    why_items: List[GapItem] = []

    for gap_item in gaps:
        gap = float(gap_item["gap"])

        if mode == "correction" and gap <= 0:
            continue
        if mode == "deepening" and gap >= 0:
            continue

        core = str(gap_item["concept"])
        target = float(gap_item["target"])
        current = float(gap_item["current"])
        direction: Literal["below", "above"] = gap_item["direction"]

        deepening_factor = 0.45

        for concept_name, effective_weight, via in iter_concept_weights_for_work(core, work):
            if effective_weight <= 0:
                continue

            if mode == "correction":
                contribution = gap * effective_weight
                shown_gap = gap
            else:
                contribution = abs(gap) * effective_weight * deepening_factor
                shown_gap = gap

            if contribution <= 0:
                continue

            score += contribution
            why_items.append(
                GapItem(
                    concept=concept_name,
                    target=target,
                    current=current,
                    gap=shown_gap,
                    direction=direction,
                    weight=float(effective_weight),
                    via=via,
                )
            )

    why_items.sort(key=lambda item: abs(item.gap) * item.weight, reverse=True)
    return score, why_items[:10]


def has_meaningful_profile_data(profile: ReaderProfile) -> bool:
    if not profile.concepts:
        return False
    return sum(float(value) for value in profile.concepts.values()) > 1e-6


def ensure_works_loaded() -> None:
    if WORKS:
        return

    try:
        works = get_works_from_neo4j()
    except Exception as e:
        print("FAILED to lazy-load WORKS from neo4j:", repr(e))
        return

    if works:
        WORKS.clear()
        WORKS.extend(works)
        print("WORKS size after lazy neo4j load:", len(WORKS))


def select_priority_gaps(
    gaps: List[Dict[str, Any]],
    mode: Literal["correction", "deepening"],
    limit: int = 4,
) -> List[Dict[str, Any]]:
    if mode == "correction":
        relevant = [gap for gap in gaps if float(gap["gap"]) > 0]
        relevant.sort(key=lambda gap: float(gap["gap"]), reverse=True)
    else:
        relevant = [gap for gap in gaps if float(gap["gap"]) < 0]
        relevant.sort(key=lambda gap: abs(float(gap["gap"])), reverse=True)

    return relevant[:limit]


def recommend_works_explain(
    profile: ReaderProfile,
    works: List[Work],
    top_n: int = 5,
) -> List[ExplainedRecommendation]:
    if not has_meaningful_profile_data(profile):
        return []

    target = TARGET_PROFILES.get(profile.age)
    if not target and profile.age == "18+":
        target = TARGET_PROFILES.get("16+")
    if not target and profile.age == "средняя школа":
        target = TARGET_PROFILES.get("12+")
    if not target:
        return []

    gaps = compute_gaps(profile, target)
    has_below = any(float(item["gap"]) > 0 for item in gaps)
    mode: Literal["correction", "deepening"] = "correction" if has_below else "deepening"
    priority_gaps = select_priority_gaps(gaps, mode=mode, limit=4)

    scored: List[Tuple[float, Work, List[GapItem]]] = []
    for work in works:
        if not is_age_compatible(profile.age, work.age):
            continue

        score, why_items = work_score_by_gaps_with_explain(priority_gaps, work, mode)
        if score > 0:
            scored.append((score, work, why_items))

    if not scored:
        scored = [(0.0, work, []) for work in works if is_age_compatible(profile.age, work.age)]

    scored.sort(key=lambda item: item[0], reverse=True)

    return [
        ExplainedRecommendation(
            work=work,
            why=WhyBlock(mode=mode, score=float(score), gaps=why_items),
        )
        for score, work, why_items in scored[:top_n]
    ]


def get_recommendations_explain(reader_id: str, top_n: int = 5):
    profile = get_profile(reader_id)

    if isinstance(profile, str):
        raise TypeError(f"get_profile() returned str, expected ReaderProfile. value={profile!r}")

    ensure_works_loaded()

    read_ids = {str(item).strip().lower() for item in list_read_book_ids(reader_id)}
    works_filtered = [work for work in WORKS if str(work.id).strip().lower() not in read_ids]
    return recommend_works_explain(profile, works_filtered, top_n=top_n)
