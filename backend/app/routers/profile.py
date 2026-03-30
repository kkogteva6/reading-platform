from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from ..schemas import ReaderProfile
from ..services.profiles import get_profile, upsert_profile
from ..core.auth import get_current_user_id
from ..db import get_account_info, upsert_account_info, get_profile_growth

router = APIRouter()


class AccountInfo(BaseModel):
    user_id: int
    email: str
    role: str
    full_name: str | None = None
    city: str | None = None
    school: str | None = None
    class_name: str | None = None
    avatar_url: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


class AccountInfoUpdate(BaseModel):
    full_name: str | None = None
    city: str | None = None
    school: str | None = None
    class_name: str | None = None
    avatar_url: str | None = None


@router.get("/me/profile", response_model=ReaderProfile)
def get_my_profile(user_id: int = Depends(get_current_user_id)):
    profile_id = str(user_id)
    try:
        return get_profile(profile_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="profile not found")


@router.post("/me/profile", response_model=ReaderProfile)
def post_my_profile(profile: ReaderProfile, user_id: int = Depends(get_current_user_id)):
    profile.id = str(user_id)
    return upsert_profile(profile)


@router.get("/profile/{profile_id}", response_model=ReaderProfile)
def get_profile_api(profile_id: str):
    try:
        return get_profile(profile_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="profile not found")


@router.get("/me/account", response_model=AccountInfo)
def get_my_account(user_id: int = Depends(get_current_user_id)):
    try:
        return get_account_info(user_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="user not found")


@router.put("/me/account", response_model=AccountInfo)
def put_my_account(data: AccountInfoUpdate, user_id: int = Depends(get_current_user_id)):
    try:
        return upsert_account_info(
            user_id=user_id,
            full_name=data.full_name,
            city=data.city,
            school=data.school,
            class_name=data.class_name,
            avatar_url=data.avatar_url,
        )
    except KeyError:
        raise HTTPException(status_code=404, detail="user not found")


@router.get("/profile_growth/{reader_id}")
def profile_growth(reader_id: str):
    return get_profile_growth(reader_id)