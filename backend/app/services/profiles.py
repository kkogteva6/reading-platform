from ..schemas import ReaderProfile
from ..db import load_profile, save_profile

def get_profile(profile_id: str) -> ReaderProfile:
    data = load_profile(profile_id)
    if not data:
        raise KeyError("profile not found")
    return ReaderProfile(**data)

def upsert_profile(profile: ReaderProfile) -> ReaderProfile:
    save_profile(profile.id, profile.age, profile.concepts or {})
    return profile
