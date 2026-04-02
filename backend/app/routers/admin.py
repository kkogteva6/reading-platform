# app/routers/admin.py
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel
from pathlib import Path
import csv
import subprocess
import sys
import shutil
import uuid

from ..db import (
    list_users,
    get_user_full,
    delete_user_by_id,
    reset_user_profile_by_email,
    update_user_role,
    get_admin_analytics,
)

from ..core.admin_guard import require_admin
from ..store import WORKS
from ..services.graph import get_works_from_neo4j

router = APIRouter(prefix="/admin", tags=["admin"])

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
SCRIPTS_DIR = Path(__file__).resolve().parents[2] / "scripts"
COVERS_DIR = DATA_DIR / "covers"

CSV_PATH = DATA_DIR / "input_books.csv"
WORKS_JSON = DATA_DIR / "works.json"

BUILD_SCRIPT = SCRIPTS_DIR / "build_works_from_csv_sbert.py"
IMPORT_SCRIPT = SCRIPTS_DIR / "import_generated_works_to_neo4j.py"

COVERS_DIR.mkdir(parents=True, exist_ok=True)


class BookIn(BaseModel):
    id: str
    title: str
    author: str
    age: str = "12+"
    annotation: str = ""
    cover_image: str = ""


def _ensure_csv_exists() -> None:
    if not CSV_PATH.exists():
        raise HTTPException(status_code=404, detail=f"Нет файла {CSV_PATH}")


def _csv_fieldnames() -> list[str]:
    return ["id", "title", "author", "age", "annotation", "cover_image"]


def _run_script(script_path: Path) -> dict:
    if not script_path.exists():
        raise HTTPException(status_code=500, detail=f"Нет скрипта: {script_path}")

    proc = subprocess.run(
        [sys.executable, str(script_path)],
        cwd=str(script_path.parent),
        capture_output=True,
        text=True,
    )

    if proc.returncode != 0:
        msg = (proc.stderr or proc.stdout or "").strip()
        raise HTTPException(status_code=500, detail=f"Script failed: {script_path.name}\n{msg}")

    return {"ok": True, "stdout": (proc.stdout or "").strip()}


def _safe_ext(filename: str) -> str:
    ext = Path(filename or "").suffix.lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise HTTPException(status_code=400, detail="Разрешены только .jpg, .jpeg, .png, .webp")
    return ext


def _delete_cover_if_local(cover_path: str | None):
    if not cover_path:
        return
    s = str(cover_path).strip()
    if not s.startswith("/covers/"):
        return

    fname = s.replace("/covers/", "", 1).strip()
    if not fname:
        return

    p = COVERS_DIR / fname
    if p.exists() and p.is_file():
        p.unlink(missing_ok=True)


@router.post("/upload_cover")
def upload_cover(file: UploadFile = File(...), _admin=Depends(require_admin)):
    ext = _safe_ext(file.filename or "")
    new_name = f"{uuid.uuid4().hex}{ext}"
    out_path = COVERS_DIR / new_name

    with out_path.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    return {
        "ok": True,
        "cover_image": f"/covers/{new_name}",
        "filename": new_name,
    }


@router.get("/books")
def list_books(_admin=Depends(require_admin)):
    _ensure_csv_exists()
    fieldnames = _csv_fieldnames()

    with CSV_PATH.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        raw_rows = list(reader)

    rows = []
    for r in raw_rows:
        clean = {k: (r.get(k) or "").strip() for k in fieldnames}
        rows.append(clean)

    return rows


@router.post("/books")
def add_book(book: BookIn, _admin=Depends(require_admin)):
    _ensure_csv_exists()

    bid = (book.id or "").strip()
    if not bid:
        raise HTTPException(status_code=400, detail="id пустой")

    title = (book.title or "").strip()
    author = (book.author or "").strip()
    if not title or not author:
        raise HTTPException(status_code=400, detail="title/author обязательны")

    with CSV_PATH.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        existing_ids = {(r.get("id") or "").strip() for r in rows}

    if bid in existing_ids:
        raise HTTPException(status_code=400, detail=f"id уже существует: {bid}")

    with CSV_PATH.open("a", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=_csv_fieldnames())
        if CSV_PATH.stat().st_size == 0:
            writer.writeheader()

        writer.writerow(
            {
                "id": bid,
                "title": title,
                "author": author,
                "age": (book.age or "12+").strip() or "12+",
                "annotation": (book.annotation or "").strip(),
                "cover_image": (book.cover_image or "").strip(),
            }
        )

    return {"ok": True, "added": bid}


@router.put("/books/{book_id}")
def update_book(book_id: str, book: BookIn, _admin=Depends(require_admin)):
    _ensure_csv_exists()

    fieldnames = _csv_fieldnames()

    with CSV_PATH.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        raw_rows = list(reader)

    # очищаем строки от лишних ключей, включая None
    rows = []
    for r in raw_rows:
        clean = {k: (r.get(k) or "").strip() for k in fieldnames}
        rows.append(clean)

    found = False
    old_cover = ""

    for row in rows:
        if (row.get("id") or "").strip() == book_id.strip():
            old_cover = (row.get("cover_image") or "").strip()

            row["id"] = (book.id or "").strip()
            row["title"] = (book.title or "").strip()
            row["author"] = (book.author or "").strip()
            row["age"] = (book.age or "12+").strip() or "12+"
            row["annotation"] = (book.annotation or "").strip()
            row["cover_image"] = (book.cover_image or "").strip()

            found = True
            break

    if not found:
        raise HTTPException(status_code=404, detail=f"Книга не найдена: {book_id}")

    with CSV_PATH.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    new_cover = (book.cover_image or "").strip()
    if old_cover and old_cover != new_cover:
        _delete_cover_if_local(old_cover)

    return {"ok": True, "updated": book_id}

@router.delete("/books/{book_id}")
def delete_book(book_id: str, _admin=Depends(require_admin)):
    _ensure_csv_exists()

    fieldnames = _csv_fieldnames()

    with CSV_PATH.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        raw_rows = list(reader)

    rows = []
    for r in raw_rows:
        clean = {k: (r.get(k) or "").strip() for k in fieldnames}
        rows.append(clean)

    deleted_row = None
    new_rows = []

    for row in rows:
        if (row.get("id") or "").strip() == book_id.strip():
            deleted_row = row
        else:
            new_rows.append(row)

    if deleted_row is None:
        raise HTTPException(status_code=404, detail=f"Книга не найдена: {book_id}")

    with CSV_PATH.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(new_rows)

    _delete_cover_if_local((deleted_row.get("cover_image") or "").strip())

    return {"ok": True, "deleted": book_id}


@router.post("/rebuild_works")
def rebuild_works(_admin=Depends(require_admin)):
    return _run_script(BUILD_SCRIPT)


@router.post("/import_works_neo4j")
def import_works_neo4j(_admin=Depends(require_admin)):
    if not WORKS_JSON.exists():
        raise HTTPException(status_code=400, detail="Нет works.json. Сначала вызови POST /admin/rebuild_works")
    result = _run_script(IMPORT_SCRIPT)

    try:
        works = get_works_from_neo4j()
        WORKS.clear()
        WORKS.extend(works)
        result["works_cached"] = len(WORKS)
    except Exception as e:
        result["works_cached"] = len(WORKS)
        result["cache_warning"] = f"Neo4j cache refresh failed: {e!r}"

    return result


@router.post("/publish")
def publish(_admin=Depends(require_admin)):
    a = rebuild_works(_admin=_admin)
    b = import_works_neo4j(_admin=_admin)
    return {"ok": True, "rebuild": a, "import": b}



class UserRoleIn(BaseModel):
    role: str


@router.get("/analytics")
def admin_analytics(_admin=Depends(require_admin)):
    return get_admin_analytics()


@router.get("/users")
def admin_list_users(_admin=Depends(require_admin)):
    return list_users()


@router.get("/users/{user_id}")
def admin_get_user(user_id: int, _admin=Depends(require_admin)):
    user = get_user_full(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return user


@router.put("/users/{user_id}/role")
def admin_update_user_role(user_id: int, data: UserRoleIn, _admin=Depends(require_admin)):
    role = (data.role or "").strip()
    if role not in {"student", "parent", "teacher", "admin"}:
        raise HTTPException(status_code=400, detail="Некорректная роль")

    try:
        update_user_role(user_id, role)
    except KeyError:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    return {"ok": True, "user_id": user_id, "role": role}


@router.post("/users/{user_id}/reset_profile")
def admin_reset_user_profile(user_id: int, _admin=Depends(require_admin)):
    user = get_user_full(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    reset_user_profile_by_email(user["email"])
    return {"ok": True, "user_id": user_id}


@router.delete("/users/{user_id}")
def admin_delete_user(user_id: int, _admin=Depends(require_admin)):
    try:
        delete_user_by_id(user_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    return {"ok": True, "user_id": user_id}
