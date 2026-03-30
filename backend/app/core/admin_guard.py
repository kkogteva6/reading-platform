# app/core/admin_guard.py
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt

from .settings import settings
from ..db import get_user_by_id

bearer = HTTPBearer(auto_error=False)
ALGO = "HS256"


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[ALGO])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


def get_current_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    if not creds:
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = decode_token(creds.credentials)

    uid_raw = payload.get("sub")
    if not uid_raw:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    try:
        uid = int(uid_raw)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid user id in token")

    user = get_user_by_id(uid)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user


def get_current_user_email(current_user=Depends(get_current_user)) -> str:
    email = (current_user.get("email") or "").strip()
    if not email:
        raise HTTPException(status_code=401, detail="User email not found")
    return email


def require_admin(current_user=Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def require_teacher(current_user=Depends(get_current_user)):
    if current_user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher access required")
    return current_user


def require_teacher_email(current_user=Depends(require_teacher)) -> str:
    email = (current_user.get("email") or "").strip()
    if not email:
        raise HTTPException(status_code=401, detail="Teacher email not found")
    return email


def require_parent(current_user=Depends(get_current_user)):
    if current_user["role"] != "parent":
        raise HTTPException(status_code=403, detail="Parent access required")
    return current_user


def require_parent_email(current_user=Depends(require_parent)) -> str:
    email = (current_user.get("email") or "").strip()
    if not email:
        raise HTTPException(status_code=401, detail="Parent email not found")
    return email