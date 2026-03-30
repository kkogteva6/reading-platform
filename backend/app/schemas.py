from pydantic import BaseModel
from typing import Dict, List, Optional, Literal



class Work(BaseModel):
    id: str
    title: str
    author: str
    age: str
    concepts: Dict[str, float]
    cover_image: Optional[str] = None
    annotation: Optional[str] = None

class ReaderProfile(BaseModel):
    id: str
    age: str
    concepts: Dict[str, float]


class AnalyzeTextRequest(BaseModel):
    reader_id: str
    text: str


class ApplyTestRequest(BaseModel):
    reader_id: str
    age: str = "16+"
    test_concepts: Dict[str, float]  # 0..1


class GapItem(BaseModel):
    concept: str
    target: float
    current: float
    gap: float
    direction: Literal["below", "above"]
    weight: float
    via: Optional[str] = None  # если алиас → какой core


class WhyBlock(BaseModel):
    mode: Literal["correction", "deepening"]
    score: float
    gaps: List[GapItem]


class ExplainedRecommendation(BaseModel):
    work: Work
    why: WhyBlock


class GapSummaryItem(BaseModel):
    concept: str
    target: float
    current: float
    gap: float
    direction: Literal["below", "above"]
