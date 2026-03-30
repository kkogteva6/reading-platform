from pydantic import BaseModel
from typing import Any, Optional, List
from datetime import datetime

class RecommendationSnapshotOut(BaseModel):
    id: int
    reader_id: str
    created_at: datetime
    source: str
    event_id: Optional[int] = None
    age: Optional[str] = None
    top_n: int
    gaps: Optional[Any] = None
    profile: Optional[Any] = None
    recs: Any

    class Config:
        from_attributes = True
