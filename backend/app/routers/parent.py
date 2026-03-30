from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from ..core.admin_guard import require_parent_email
from ..db import (
    add_parent_child,
    list_parent_children,
    remove_parent_child,
    get_user_by_email,  # добавить
)

router = APIRouter(prefix="/parent", tags=["parent"])


class AddChildIn(BaseModel):
    child_id: str
    child_name: str | None = None
    class_name: str | None = None


@router.get("/children")
def api_list_children(parent_email: str = Depends(require_parent_email)):
    return list_parent_children(parent_email)


@router.post("/children")
def api_add_child(
    data: AddChildIn,
    parent_email: str = Depends(require_parent_email),
):
    raw_child = (data.child_id or "").strip()
    if not raw_child:
        raise HTTPException(status_code=400, detail="child_id is required")

    child_name = (data.child_name or "").strip() or None
    class_name = (data.class_name or "").strip() or None

    resolved_child_id = raw_child

    try:
        # если введён email — ищем пользователя и берём его реальный id
        if "@" in raw_child:
            user = get_user_by_email(raw_child.lower())
            if not user:
                raise HTTPException(status_code=404, detail="child with this email not found")

            # если в users id числовой/строковый
            resolved_child_id = str(user["id"])

        return add_parent_child(parent_email, resolved_child_id, child_name, class_name)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/children/{child_id}")
def api_remove_child(
    child_id: str,
    parent_email: str = Depends(require_parent_email),
):
    ok = remove_parent_child(parent_email, child_id)
    if not ok:
        raise HTTPException(status_code=404, detail="child not found")

    return {"ok": True}