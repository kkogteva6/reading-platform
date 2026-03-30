from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext
from jose import jwt, JWTError
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from ..core.settings import settings
from ..db import create_user, get_user_by_email, get_user_by_id

router = APIRouter(prefix="/auth", tags=["auth"])

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer = HTTPBearer(auto_error=False)

ALGO = "HS256"

ALLOWED_ROLES = {"student", "parent", "teacher", "admin"}

class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str

class LoginIn(BaseModel):
    email: EmailStr
    password: str
    role: str

class AuthOut(BaseModel):
    token: str
    user: dict

def make_token(user_id: int, role: str) -> str:
    return jwt.encode({"sub": str(user_id), "role": role}, settings.jwt_secret, algorithm=ALGO)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[ALGO])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

@router.post("/register", response_model=AuthOut)
def register(data: RegisterIn):
    role = data.role.strip()
    if role not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail="Некорректная роль")

    if len(data.password) < 4:
        raise HTTPException(status_code=400, detail="Пароль слишком короткий")

    email = data.email.lower().strip()
    if get_user_by_email(email):
        raise HTTPException(status_code=409, detail="Пользователь с таким email уже существует")

    pwd = data.password or ""
    if len(pwd.encode("utf-8")) > 72:
        raise HTTPException(status_code=400, detail="Пароль слишком длинный (max 72 байта).")

    password_hash = pwd_ctx.hash(data.password)
    user = create_user(
        email=email,
        name=(data.name.strip() or "Пользователь"),
        role=role,
        password_hash=password_hash,
    )

    token = make_token(user["id"], user["role"])
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "reader_id": str(user["id"]),
            "email": user["email"],
            "name": user["name"],
            "role": user["role"],
        }
    }

@router.post("/login", response_model=AuthOut)
def login(data: LoginIn):
    email = data.email.lower().strip()
    user = get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=401, detail="Неверный email или пароль")

    pwd = data.password or ""
    if len(pwd.encode("utf-8")) > 72:
        raise HTTPException(status_code=400, detail="Пароль слишком длинный (max 72 байта).")

    if not pwd_ctx.verify(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Неверный email или пароль")

    # Если хочешь строго проверять выбранную роль:
    if data.role.strip() != user["role"]:
        raise HTTPException(status_code=403, detail="Роль не соответствует аккаунту")

    token = make_token(user["id"], user["role"])
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "reader_id": str(user["id"]),
            "email": user["email"],
            "name": user["name"],
            "role": user["role"],
        }
    }

@router.get("/me")
def me(creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    if not creds:
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = decode_token(creds.credentials)
    uid = int(payload.get("sub", 0))
    user = get_user_by_id(uid)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"]}