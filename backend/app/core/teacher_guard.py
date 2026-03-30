from fastapi import Header, HTTPException
from app.auth import get_role_by_email  # мы сейчас добавим этот helper

def require_teacher(x_user_email: str | None = Header(default=None, alias="X-User-Email")):
    if not x_user_email:
        raise HTTPException(status_code=401, detail="Missing X-User-Email")

    role = get_role_by_email(x_user_email)
    if role != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")

    return {"email": x_user_email, "role": role}
