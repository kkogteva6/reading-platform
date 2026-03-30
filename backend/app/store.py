from typing import Dict, List, TypedDict, Optional
from .schemas import Work, ReaderProfile

WORKS: List[Work] = []
PROFILES: Dict[str, ReaderProfile] = {}

class ProfileMeta(TypedDict, total=False):
    text_count: int
    test_count: int
    last_text: dict[str, float]
    last_test: dict[str, float]

PROFILES_META: Dict[str, ProfileMeta] = {}