# app/routers/teacher.py
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from ..core.admin_guard import require_teacher_email
from ..db import (
    create_teacher_class,
    list_teacher_classes,
    delete_teacher_class,
    add_student_to_class,
    list_class_students,
    remove_student_from_class,
    get_class_analytics,
    get_user_by_email,  # 👈 добавили
)

router = APIRouter(prefix="/teacher", tags=["teacher"])


class CreateClassIn(BaseModel):
    class_name: str


class AddStudentToClassIn(BaseModel):
    student_id: str
    student_name: str | None = None


@router.get("/classes")
def api_list_classes(teacher_email: str = Depends(require_teacher_email)):
    return list_teacher_classes(teacher_email)


@router.post("/classes")
def api_create_class(
    data: CreateClassIn,
    teacher_email: str = Depends(require_teacher_email),
):
    class_name = (data.class_name or "").strip()
    if not class_name:
        raise HTTPException(status_code=400, detail="class_name is required")

    try:
        return create_teacher_class(teacher_email, class_name)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/classes/{class_id}")
def api_delete_class(
    class_id: int,
    teacher_email: str = Depends(require_teacher_email),
):
    ok = delete_teacher_class(class_id, teacher_email)
    if not ok:
        raise HTTPException(status_code=404, detail="class not found")
    return {"ok": True}


@router.get("/classes/{class_id}/students")
def api_list_students(
    class_id: int,
    teacher_email: str = Depends(require_teacher_email),
):
    try:
        get_class_analytics(class_id, teacher_email)
    except KeyError:
        raise HTTPException(status_code=404, detail="class not found")

    return list_class_students(class_id)


@router.post("/classes/{class_id}/students")
def api_add_student(
    class_id: int,
    data: AddStudentToClassIn,
    teacher_email: str = Depends(require_teacher_email),
):
    try:
        get_class_analytics(class_id, teacher_email)
    except KeyError:
        raise HTTPException(status_code=404, detail="class not found")

    raw_student = (data.student_id or "").strip()
    if not raw_student:
        raise HTTPException(status_code=400, detail="student_id is required")

    student_name = (data.student_name or "").strip() or None

    resolved_student_id = raw_student

    try:
        # 🔥 если введён email — ищем пользователя
        if "@" in raw_student:
            user = get_user_by_email(raw_student.lower())
            if not user:
                raise HTTPException(status_code=404, detail="student with this email not found")

            # 👇 берём реальный id пользователя
            resolved_student_id = str(user["id"])

        return add_student_to_class(class_id, resolved_student_id, student_name)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/classes/{class_id}/students/{student_id}")
def api_remove_student(
    class_id: int,
    student_id: str,
    teacher_email: str = Depends(require_teacher_email),
):
    try:
        get_class_analytics(class_id, teacher_email)
    except KeyError:
        raise HTTPException(status_code=404, detail="class not found")

    ok = remove_student_from_class(class_id, student_id)
    if not ok:
        raise HTTPException(status_code=404, detail="student not found in class")

    return {"ok": True}


@router.get("/classes/{class_id}/analytics")
def api_get_class_analytics(
    class_id: int,
    teacher_email: str = Depends(require_teacher_email),
):
    try:
        return get_class_analytics(class_id, teacher_email)
    except KeyError:
        raise HTTPException(status_code=404, detail="class not found")