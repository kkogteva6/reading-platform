from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError

from .settings import settings

bearer = HTTPBearer(auto_error=False)
ALGO = "HS256"

def get_current_user_id(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> int:
    if not creds:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        payload = jwt.decode(creds.credentials, settings.jwt_secret, algorithms=[ALGO])
        uid = int(payload.get("sub", 0))
    except (JWTError, ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid token")

    if uid <= 0:
        raise HTTPException(status_code=401, detail="Invalid token")
    return uid