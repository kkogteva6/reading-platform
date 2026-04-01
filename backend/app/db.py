import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
import csv

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "app.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    return conn


def init_db() -> None:
    with get_conn() as conn:
        conn.execute("""
        CREATE TABLE IF NOT EXISTS profile_meta (
            reader_id TEXT PRIMARY KEY,
            test_count INTEGER NOT NULL DEFAULT 0,
            text_count INTEGER NOT NULL DEFAULT 0,
            last_update_at TEXT,
            last_source TEXT,
            last_test_at TEXT,
            last_text_at TEXT
        );
        """)

        conn.execute("""
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reader_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            type TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            profile_after_json TEXT NOT NULL
        );
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_events_reader_id ON events(reader_id);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);")

        conn.execute("""
        CREATE TABLE IF NOT EXISTS recommendation_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reader_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            source TEXT NOT NULL,
            top_n INTEGER NOT NULL DEFAULT 5,
            age TEXT,
            event_id INTEGER,
            gaps_json TEXT,
            profile_json TEXT,
            recs_json TEXT NOT NULL
        );
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_recs_reader_id ON recommendation_snapshots(reader_id);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_recs_created_at ON recommendation_snapshots(created_at);")

        conn.execute("""
        CREATE TABLE IF NOT EXISTS profiles (
            reader_id TEXT PRIMARY KEY,
            age TEXT NOT NULL,
            concepts_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        """)

        conn.execute("""
        CREATE TABLE IF NOT EXISTS teacher_students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            teacher_email TEXT NOT NULL,
            student_id TEXT NOT NULL,
            student_name TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(teacher_email, student_id)
        );
        """)

        conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            role TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);")

        conn.execute("""
        CREATE TABLE IF NOT EXISTS user_profile_info (
            user_id INTEGER PRIMARY KEY,
            full_name TEXT,
            city TEXT,
            school TEXT,
            class_name TEXT,
            avatar_url TEXT,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        """)

        conn.execute("""
        CREATE TABLE IF NOT EXISTS teacher_classes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            teacher_email TEXT NOT NULL,
            class_name TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(teacher_email, class_name)
        );
        """)

        conn.execute("""
        CREATE TABLE IF NOT EXISTS class_students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            class_id INTEGER NOT NULL,
            student_id TEXT NOT NULL,
            student_name TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(class_id, student_id),
            FOREIGN KEY (class_id) REFERENCES teacher_classes(id) ON DELETE CASCADE
        );
        """)

        conn.execute("CREATE INDEX IF NOT EXISTS idx_teacher_classes_email ON teacher_classes(teacher_email);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_class_students_class_id ON class_students(class_id);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_class_students_student_id ON class_students(student_id);")

        conn.execute("""
        CREATE TABLE IF NOT EXISTS parent_children (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            parent_email TEXT NOT NULL,
            child_id TEXT NOT NULL,
            child_name TEXT,
            class_name TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(parent_email, child_id)
        );
        """)

        conn.execute("CREATE INDEX IF NOT EXISTS idx_parent_children_parent_email ON parent_children(parent_email);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_parent_children_child_id ON parent_children(child_id);")

        conn.execute("""
        CREATE TABLE IF NOT EXISTS read_books (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reader_id TEXT NOT NULL,
            work_id TEXT NOT NULL,
            title TEXT NOT NULL,
            author TEXT,
            age TEXT,
            rating INTEGER,
            impression_text TEXT,
            concepts_json TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(reader_id, work_id)
        );
        """)

        conn.execute("CREATE INDEX IF NOT EXISTS idx_read_books_reader_id ON read_books(reader_id);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_read_books_work_id ON read_books(work_id);")


def upsert_meta(reader_id: str, source: str) -> None:
    at = now_iso()
    with get_conn() as conn:
        conn.execute("""
        INSERT INTO profile_meta (reader_id, last_update_at, last_source)
        VALUES (?, ?, ?)
        ON CONFLICT(reader_id) DO UPDATE SET
          last_update_at=excluded.last_update_at,
          last_source=excluded.last_source;
        """, (reader_id, at, source))

        if source == "test":
            conn.execute("""
            UPDATE profile_meta
            SET test_count = test_count + 1,
                last_test_at = ?
            WHERE reader_id = ?;
            """, (at, reader_id))
        elif source == "text":
            conn.execute("""
            UPDATE profile_meta
            SET text_count = text_count + 1,
                last_text_at = ?
            WHERE reader_id = ?;
            """, (at, reader_id))


def log_event(reader_id: str, event_type: str, payload: dict[str, Any], profile_after: dict[str, Any]) -> None:
    with get_conn() as conn:
        conn.execute("""
        INSERT INTO events (reader_id, created_at, type, payload_json, profile_after_json)
        VALUES (?, ?, ?, ?, ?);
        """, (
            reader_id,
            now_iso(),
            event_type,
            json.dumps(payload, ensure_ascii=False),
            json.dumps(profile_after, ensure_ascii=False),
        ))


def get_meta(reader_id: str) -> Optional[dict[str, Any]]:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM profile_meta WHERE reader_id = ?;", (reader_id,)).fetchone()
        return dict(row) if row else None


def get_history(reader_id: str, limit: int = 20) -> list[dict[str, Any]]:
    limit = max(1, min(100, int(limit)))
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT id, reader_id, created_at, type, payload_json, profile_after_json
            FROM events
            WHERE reader_id = ?
            ORDER BY created_at DESC
            LIMIT ?;
        """, (reader_id, limit)).fetchall()

    out: list[dict[str, Any]] = []
    for r in rows:
        out.append({
            "id": r["id"],
            "reader_id": r["reader_id"],
            "created_at": r["created_at"],
            "type": r["type"],
            "payload": json.loads(r["payload_json"]),
            "profile_after": json.loads(r["profile_after_json"]),
        })
    return out


def save_recommendation_snapshot(
    reader_id: str,
    source: str,
    top_n: int,
    age: str | None,
    recs: Any,
    event_id: int | None = None,
    gaps: Any | None = None,
    profile: Any | None = None,
) -> int:
    with get_conn() as conn:
        cur = conn.execute(
            """
            INSERT INTO recommendation_snapshots
              (reader_id, created_at, source, top_n, age, event_id, gaps_json, profile_json, recs_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
            """,
            (
                reader_id,
                now_iso(),
                source,
                int(top_n),
                age,
                event_id,
                json.dumps(gaps, ensure_ascii=False) if gaps is not None else None,
                json.dumps(profile, ensure_ascii=False) if profile is not None else None,
                json.dumps([to_jsonable(r) for r in recs], ensure_ascii=False),
            ),
        )
        return int(cur.lastrowid)


def get_last_recommendation_snapshot(reader_id: str) -> Optional[dict[str, Any]]:
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT id, reader_id, created_at, source, top_n, age, event_id, gaps_json, profile_json, recs_json
            FROM recommendation_snapshots
            WHERE reader_id = ?
            ORDER BY created_at DESC
            LIMIT 1;
            """,
            (reader_id,),
        ).fetchone()

    if not row:
        return None

    return {
        "id": row["id"],
        "reader_id": row["reader_id"],
        "created_at": row["created_at"],
        "source": row["source"],
        "top_n": row["top_n"],
        "age": row["age"],
        "event_id": row["event_id"],
        "gaps": json.loads(row["gaps_json"]) if row["gaps_json"] else None,
        "profile": json.loads(row["profile_json"]) if row["profile_json"] else None,
        "recs": json.loads(row["recs_json"]) if row["recs_json"] else [],
    }


def save_profile(reader_id: str, age: str, concepts: dict[str, Any]) -> None:
    with get_conn() as conn:
        conn.execute("""
        INSERT INTO profiles (reader_id, age, concepts_json, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(reader_id) DO UPDATE SET
          age=excluded.age,
          concepts_json=excluded.concepts_json,
          updated_at=excluded.updated_at;
        """, (reader_id, age, json.dumps(concepts, ensure_ascii=False), now_iso()))


def load_profile(reader_id: str) -> Optional[dict[str, Any]]:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT reader_id, age, concepts_json FROM profiles WHERE reader_id=?;",
            (reader_id,),
        ).fetchone()

    if not row:
        return None

    return {
        "id": row["reader_id"],
        "age": row["age"],
        "concepts": json.loads(row["concepts_json"]),
    }


def to_jsonable(x: Any) -> Any:
    if hasattr(x, "model_dump"):
        return x.model_dump()
    if hasattr(x, "dict"):
        return x.dict()
    if hasattr(x, "__dict__"):
        return x.__dict__
    return x


def create_user(email: str, name: str, role: str, password_hash: str) -> dict[str, Any]:
    email = email.lower().strip()
    with get_conn() as conn:
        cur = conn.execute(
            """
            INSERT INTO users (email, name, role, password_hash, created_at)
            VALUES (?, ?, ?, ?, ?);
            """,
            (email, name, role, password_hash, now_iso()),
        )
        user_id = int(cur.lastrowid)

        row = conn.execute(
            "SELECT id, email, name, role, created_at FROM users WHERE id = ?;",
            (user_id,),
        ).fetchone()

    return dict(row)


def get_user_by_email(email: str) -> Optional[dict[str, Any]]:
    email = email.lower().strip()
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, email, name, role, password_hash, created_at FROM users WHERE email = ?;",
            (email,),
        ).fetchone()
        return dict(row) if row else None


def get_user_by_id(user_id: int) -> Optional[dict[str, Any]]:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, email, name, role, created_at FROM users WHERE id = ?;",
            (int(user_id),),
        ).fetchone()
        return dict(row) if row else None


def list_users() -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT id, email, name, role, created_at
            FROM users
            ORDER BY created_at DESC, id DESC
        """).fetchall()

    return [dict(r) for r in rows]


def get_user_full(user_id: int) -> Optional[dict[str, Any]]:
    with get_conn() as conn:
        user = conn.execute("""
            SELECT id, email, name, role, created_at
            FROM users
            WHERE id = ?
        """, (user_id,)).fetchone()

        if not user:
            return None

        email = user["email"]

        profile = conn.execute("""
            SELECT reader_id, age, concepts_json, updated_at
            FROM profiles
            WHERE reader_id = ?
        """, (email,)).fetchone()

        meta = conn.execute("""
            SELECT reader_id, test_count, text_count, last_update_at, last_source, last_test_at, last_text_at
            FROM profile_meta
            WHERE reader_id = ?
        """, (email,)).fetchone()

    out = dict(user)
    out["profile"] = dict(profile) if profile else None
    out["meta"] = dict(meta) if meta else None
    return out


def delete_user_by_id(user_id: int) -> None:
    with get_conn() as conn:
        row = conn.execute("SELECT email FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            raise KeyError("user not found")

        email = row["email"]

        conn.execute("DELETE FROM recommendation_snapshots WHERE reader_id = ?", (email,))
        conn.execute("DELETE FROM events WHERE reader_id = ?", (email,))
        conn.execute("DELETE FROM profile_meta WHERE reader_id = ?", (email,))
        conn.execute("DELETE FROM profiles WHERE reader_id = ?", (email,))
        conn.execute("DELETE FROM user_profile_info WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM teacher_students WHERE student_id = ?", (email,))
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))


def reset_user_profile_by_email(email: str) -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM recommendation_snapshots WHERE reader_id = ?", (email,))
        conn.execute("DELETE FROM events WHERE reader_id = ?", (email,))
        conn.execute("DELETE FROM profile_meta WHERE reader_id = ?", (email,))
        conn.execute("DELETE FROM profiles WHERE reader_id = ?", (email,))


def update_user_role(user_id: int, role: str) -> None:
    with get_conn() as conn:
        cur = conn.execute("UPDATE users SET role = ? WHERE id = ?", (role, user_id))
        if cur.rowcount == 0:
            raise KeyError("user not found")


def get_account_info(user_id: int) -> dict[str, Any]:
    with get_conn() as conn:
        user = conn.execute("""
            SELECT id, email, name, role, created_at
            FROM users
            WHERE id = ?
        """, (user_id,)).fetchone()

        if not user:
            raise KeyError("user not found")

        info = conn.execute("""
            SELECT user_id, full_name, city, school, class_name, avatar_url, updated_at
            FROM user_profile_info
            WHERE user_id = ?
        """, (user_id,)).fetchone()

        class_row = conn.execute("""
            SELECT tc.class_name
            FROM class_students cs
            JOIN teacher_classes tc ON tc.id = cs.class_id
            WHERE cs.student_id = ?
            ORDER BY cs.id DESC
            LIMIT 1
        """, (str(user_id),)).fetchone()

    out = {
        "user_id": user["id"],
        "email": user["email"],
        "role": user["role"],
        "full_name": user["name"],
        "city": None,
        "school": None,
        "class_name": class_row["class_name"] if class_row else None,
        "avatar_url": None,
        "created_at": user["created_at"],
        "updated_at": None,
    }

    if info:
        out.update({
            "full_name": info["full_name"] or user["name"],
            "city": info["city"],
            "school": info["school"],
            "class_name": info["class_name"] or out["class_name"],
            "avatar_url": info["avatar_url"],
            "updated_at": info["updated_at"],
        })

    return out


def upsert_account_info(
    user_id: int,
    full_name: str | None = None,
    city: str | None = None,
    school: str | None = None,
    class_name: str | None = None,
    avatar_url: str | None = None,
) -> dict[str, Any]:
    with get_conn() as conn:
        user = conn.execute("""
            SELECT id, email, name, role, created_at
            FROM users
            WHERE id = ?
        """, (user_id,)).fetchone()

        if not user:
            raise KeyError("user not found")

        current = conn.execute("""
            SELECT user_id, full_name, city, school, class_name, avatar_url, updated_at
            FROM user_profile_info
            WHERE user_id = ?
        """, (user_id,)).fetchone()

        current_full_name = current["full_name"] if current else user["name"]
        current_city = current["city"] if current else None
        current_school = current["school"] if current else None
        current_class_name = current["class_name"] if current else None
        current_avatar_url = current["avatar_url"] if current else None

        new_full_name = full_name if full_name is not None else current_full_name
        new_city = city if city is not None else current_city
        new_school = school if school is not None else current_school
        new_class_name = class_name if class_name is not None else current_class_name
        new_avatar_url = avatar_url if avatar_url is not None else current_avatar_url

        conn.execute("""
            INSERT INTO user_profile_info (
                user_id, full_name, city, school, class_name, avatar_url, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                full_name = excluded.full_name,
                city = excluded.city,
                school = excluded.school,
                class_name = excluded.class_name,
                avatar_url = excluded.avatar_url,
                updated_at = excluded.updated_at
        """, (
            user_id,
            new_full_name,
            new_city,
            new_school,
            new_class_name,
            new_avatar_url,
            now_iso(),
        ))

        if new_full_name and new_full_name.strip():
            conn.execute("""
                UPDATE users
                SET name = ?
                WHERE id = ?
            """, (new_full_name.strip(), user_id))

    return get_account_info(user_id)


def get_profile_growth(reader_id: str) -> dict[str, Any]:
    history = get_history(reader_id, limit=200)

    if not history:
        return {
            "before": None,
            "after": None,
            "delta": {},
            "top_growth": [],
            "top_decline": [],
            "events_count": 0,
        }

    ordered = sorted(history, key=lambda x: str(x["created_at"]))

    first_profile = ordered[0].get("profile_after") or {}
    last_profile = ordered[-1].get("profile_after") or {}

    first_concepts = first_profile.get("concepts", {}) if isinstance(first_profile, dict) else {}
    last_concepts = last_profile.get("concepts", {}) if isinstance(last_profile, dict) else {}

    if not isinstance(first_concepts, dict):
        first_concepts = {}
    if not isinstance(last_concepts, dict):
        last_concepts = {}

    all_keys = sorted(set(first_concepts.keys()) | set(last_concepts.keys()))
    delta: dict[str, float] = {}

    for k in all_keys:
        try:
            before_v = float(first_concepts.get(k, 0.0))
        except Exception:
            before_v = 0.0
        try:
            after_v = float(last_concepts.get(k, 0.0))
        except Exception:
            after_v = 0.0
        delta[k] = round(after_v - before_v, 4)

    growth_items = [{"concept": k, "delta": v} for k, v in delta.items()]
    top_growth = sorted(growth_items, key=lambda x: (-x["delta"], x["concept"]))[:10]
    top_decline = sorted(growth_items, key=lambda x: (x["delta"], x["concept"]))[:10]

    return {
        "before": {
            "created_at": ordered[0]["created_at"],
            "concepts": first_concepts,
        },
        "after": {
            "created_at": ordered[-1]["created_at"],
            "concepts": last_concepts,
        },
        "delta": delta,
        "top_growth": [x for x in top_growth if x["delta"] > 0],
        "top_decline": [x for x in top_decline if x["delta"] < 0],
        "events_count": len(ordered),
    }


def get_admin_analytics() -> dict[str, Any]:
    with get_conn() as conn:
        total_users = conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"]
        total_students = conn.execute("SELECT COUNT(*) AS c FROM users WHERE role = 'student'").fetchone()["c"]
        total_parents = conn.execute("SELECT COUNT(*) AS c FROM users WHERE role = 'parent'").fetchone()["c"]
        total_teachers = conn.execute("SELECT COUNT(*) AS c FROM users WHERE role = 'teacher'").fetchone()["c"]
        total_admins = conn.execute("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").fetchone()["c"]

        profiles_count = conn.execute("SELECT COUNT(*) AS c FROM profiles").fetchone()["c"]
        meta_count = conn.execute("SELECT COUNT(*) AS c FROM profile_meta").fetchone()["c"]
        events_count = conn.execute("SELECT COUNT(*) AS c FROM events").fetchone()["c"]
        snapshots_count = conn.execute("SELECT COUNT(*) AS c FROM recommendation_snapshots").fetchone()["c"]

        test_events = conn.execute("SELECT COUNT(*) AS c FROM events WHERE type = 'test'").fetchone()["c"]
        text_events = conn.execute("SELECT COUNT(*) AS c FROM events WHERE type = 'text'").fetchone()["c"]

        active_users = conn.execute("""
            SELECT COUNT(*) AS c
            FROM profile_meta
            WHERE last_update_at IS NOT NULL
        """).fetchone()["c"]

        users_with_tests = conn.execute("""
            SELECT COUNT(*) AS c
            FROM profile_meta
            WHERE test_count > 0
        """).fetchone()["c"]

        users_with_texts = conn.execute("""
            SELECT COUNT(*) AS c
            FROM profile_meta
            WHERE text_count > 0
        """).fetchone()["c"]

        users_with_both = conn.execute("""
            SELECT COUNT(*) AS c
            FROM profile_meta
            WHERE test_count > 0 AND text_count > 0
        """).fetchone()["c"]

        users_without_activity = total_users - active_users
        users_without_profile = max(total_users - profiles_count, 0)

        top_sources_rows = conn.execute("""
            SELECT COALESCE(last_source, 'none') AS source, COUNT(*) AS c
            FROM profile_meta
            GROUP BY COALESCE(last_source, 'none')
            ORDER BY c DESC
        """).fetchall()

        avg_events_per_user = round(events_count / total_users, 2) if total_users else 0
        avg_tests_per_student = round(test_events / total_students, 2) if total_students else 0
        avg_texts_per_student = round(text_events / total_students, 2) if total_students else 0
        active_share = round((active_users / total_users) * 100, 1) if total_users else 0

        snap_rows = conn.execute("""
            SELECT recs_json
            FROM recommendation_snapshots
            WHERE recs_json IS NOT NULL
        """).fetchall()

        student_rows = conn.execute("""
            SELECT email
            FROM users
            WHERE role = 'student'
        """).fetchall()

        student_emails = {r["email"] for r in student_rows}

        event_rows = conn.execute("""
            SELECT reader_id, created_at, profile_after_json
            FROM events
            ORDER BY reader_id ASC, created_at ASC, id ASC
        """).fetchall()

    top_books_counter: dict[str, dict[str, Any]] = {}
    concept_counter: dict[str, int] = {}

    for r in snap_rows:
        try:
            recs = json.loads(r["recs_json"]) if r["recs_json"] else []
        except Exception:
            recs = []

        for item in recs:
            work = item.get("work") if isinstance(item, dict) else None
            if not work:
                continue

            wid = str(work.get("id") or "").strip()
            if not wid:
                continue

            title = str(work.get("title") or wid).strip()
            author = str(work.get("author") or "").strip()

            if wid not in top_books_counter:
                top_books_counter[wid] = {
                    "id": wid,
                    "title": title,
                    "author": author,
                    "count": 0,
                }

            top_books_counter[wid]["count"] += 1

            why = item.get("why") if isinstance(item, dict) else None
            gaps = why.get("gaps", []) if isinstance(why, dict) else []
            if isinstance(gaps, list):
                for g in gaps:
                    if not isinstance(g, dict):
                        continue
                    concept = str(g.get("concept") or "").strip()
                    if concept:
                        concept_counter[concept] = concept_counter.get(concept, 0) + 1

    top_books = sorted(
        top_books_counter.values(),
        key=lambda x: (-int(x["count"]), x["title"]),
    )[:10]

    top_concepts = [
        {"concept": k, "count": v}
        for k, v in sorted(concept_counter.items(), key=lambda x: (-x[1], x[0]))[:10]
    ]

    try:
        books_path = DB_PATH.parent / "input_books.csv"
        books_total = 0
        books_without_cover = 0
        books_without_annotation = 0

        if books_path.exists():
            with books_path.open("r", encoding="utf-8", newline="") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    books_total += 1
                    cover = (row.get("cover_image") or "").strip()
                    annotation = (row.get("annotation") or "").strip()

                    if not cover:
                        books_without_cover += 1
                    if not annotation:
                        books_without_annotation += 1
        else:
            books_total = 0
            books_without_cover = 0
            books_without_annotation = 0
    except Exception:
        books_total = 0
        books_without_cover = 0
        books_without_annotation = 0

    student_events: dict[str, list[dict[str, Any]]] = {}
    for row in event_rows:
        rid = row["reader_id"]
        if rid not in student_emails:
            continue

        try:
            profile_after = json.loads(row["profile_after_json"]) if row["profile_after_json"] else {}
        except Exception:
            profile_after = {}

        student_events.setdefault(rid, []).append({
            "created_at": row["created_at"],
            "profile_after": profile_after,
        })

    students_with_progress = 0
    students_without_progress = 0
    students_with_regress = 0
    students_with_enough_history = 0

    total_avg_delta_sum = 0.0
    concept_growth_acc: dict[str, list[float]] = {}

    for reader_id, events in student_events.items():
        if len(events) < 2:
            continue

        first_profile = events[0].get("profile_after", {}) or {}
        last_profile = events[-1].get("profile_after", {}) or {}

        first_concepts = first_profile.get("concepts", {}) if isinstance(first_profile, dict) else {}
        last_concepts = last_profile.get("concepts", {}) if isinstance(last_profile, dict) else {}

        if not isinstance(first_concepts, dict):
            first_concepts = {}
        if not isinstance(last_concepts, dict):
            last_concepts = {}

        all_keys = sorted(set(first_concepts.keys()) | set(last_concepts.keys()))
        if not all_keys:
            continue

        deltas: list[float] = []
        for k in all_keys:
            try:
                first_v = float(first_concepts.get(k, 0.0))
            except Exception:
                first_v = 0.0
            try:
                last_v = float(last_concepts.get(k, 0.0))
            except Exception:
                last_v = 0.0

            delta = last_v - first_v
            deltas.append(delta)
            concept_growth_acc.setdefault(k, []).append(delta)

        if not deltas:
            continue

        avg_delta = sum(deltas) / len(deltas)
        students_with_enough_history += 1
        total_avg_delta_sum += avg_delta

        eps = 1e-9
        if avg_delta > eps:
            students_with_progress += 1
        elif avg_delta < -eps:
            students_with_regress += 1
        else:
            students_without_progress += 1

    avg_profile_growth = (
        round(total_avg_delta_sum / students_with_enough_history, 4)
        if students_with_enough_history
        else 0.0
    )

    concept_growth_stats = []
    for concept, values in concept_growth_acc.items():
        if not values:
            continue
        mean_growth = sum(values) / len(values)
        concept_growth_stats.append({
            "concept": concept,
            "avg_growth": round(mean_growth, 4),
            "count": len(values),
        })

    top_growth_concepts = sorted(
        concept_growth_stats,
        key=lambda x: (-x["avg_growth"], x["concept"])
    )[:10]

    weak_growth_concepts = sorted(
        concept_growth_stats,
        key=lambda x: (x["avg_growth"], x["concept"])
    )[:10]

    return {
        "totals": {
            "users": total_users,
            "students": total_students,
            "parents": total_parents,
            "teachers": total_teachers,
            "admins": total_admins,
            "profiles": profiles_count,
            "profile_meta": meta_count,
            "events": events_count,
            "snapshots": snapshots_count,
            "active_users": active_users,
            "test_events": test_events,
            "text_events": text_events,
        },
        "engagement": {
            "active_share": active_share,
            "avg_events_per_user": avg_events_per_user,
            "avg_tests_per_student": avg_tests_per_student,
            "avg_texts_per_student": avg_texts_per_student,
            "users_with_tests": users_with_tests,
            "users_with_texts": users_with_texts,
            "users_with_both": users_with_both,
            "users_without_activity": users_without_activity,
            "users_without_profile": users_without_profile,
        },
        "top_sources": [dict(r) for r in top_sources_rows],
        "top_books": top_books,
        "top_concepts": top_concepts,
        "library_quality": {
            "books_total": books_total,
            "books_without_cover": books_without_cover,
            "books_without_annotation": books_without_annotation,
        },
        "effectiveness": {
            "students_with_enough_history": students_with_enough_history,
            "students_with_progress": students_with_progress,
            "students_without_progress": students_without_progress,
            "students_with_regress": students_with_regress,
            "avg_profile_growth": avg_profile_growth,
            "top_growth_concepts": top_growth_concepts,
            "weak_growth_concepts": weak_growth_concepts,
        },
    }


def create_teacher_class(teacher_email: str, class_name: str) -> dict[str, Any]:
    with get_conn() as conn:
        cur = conn.execute("""
            INSERT INTO teacher_classes (teacher_email, class_name)
            VALUES (?, ?)
        """, (teacher_email, class_name))
        class_id = int(cur.lastrowid)

        row = conn.execute("""
            SELECT id, teacher_email, class_name, created_at
            FROM teacher_classes
            WHERE id = ?
        """, (class_id,)).fetchone()

    return dict(row)


def list_teacher_classes(teacher_email: str) -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT
                tc.id,
                tc.teacher_email,
                tc.class_name,
                tc.created_at,
                COUNT(cs.id) AS students_count
            FROM teacher_classes tc
            LEFT JOIN class_students cs ON cs.class_id = tc.id
            WHERE tc.teacher_email = ?
            GROUP BY tc.id, tc.teacher_email, tc.class_name, tc.created_at
            ORDER BY tc.created_at DESC, tc.id DESC
        """, (teacher_email,)).fetchall()

    return [dict(r) for r in rows]


def delete_teacher_class(class_id: int, teacher_email: str) -> bool:
    with get_conn() as conn:
        cur = conn.execute("""
            DELETE FROM teacher_classes
            WHERE id = ? AND teacher_email = ?
        """, (class_id, teacher_email))
        return cur.rowcount > 0


def add_student_to_class(class_id: int, student_id: str, student_name: str | None = None) -> dict[str, Any]:
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO class_students (class_id, student_id, student_name)
            VALUES (?, ?, ?)
        """, (class_id, student_id, student_name))

        row = conn.execute("""
            SELECT id, class_id, student_id, student_name, created_at
            FROM class_students
            WHERE class_id = ? AND student_id = ?
        """, (class_id, student_id)).fetchone()

    return dict(row)


def list_class_students(class_id: int) -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT id, class_id, student_id, student_name, created_at
            FROM class_students
            WHERE class_id = ?
            ORDER BY created_at DESC, id DESC
        """, (class_id,)).fetchall()

    return [dict(r) for r in rows]


def remove_student_from_class(class_id: int, student_id: str) -> bool:
    with get_conn() as conn:
        cur = conn.execute("""
            DELETE FROM class_students
            WHERE class_id = ? AND student_id = ?
        """, (class_id, student_id))
        return cur.rowcount > 0


def get_teacher_class(class_id: int, teacher_email: str) -> Optional[dict[str, Any]]:
    with get_conn() as conn:
        row = conn.execute("""
            SELECT id, teacher_email, class_name, created_at
            FROM teacher_classes
            WHERE id = ? AND teacher_email = ?
        """, (class_id, teacher_email)).fetchone()

    return dict(row) if row else None


def get_class_analytics(class_id: int, teacher_email: str) -> dict[str, Any]:
    teacher_class = get_teacher_class(class_id, teacher_email)
    if not teacher_class:
        raise KeyError("class not found")

    students = list_class_students(class_id)
    student_ids = [s["student_id"] for s in students]

    if not student_ids:
        return {
            "class_id": class_id,
            "class_name": teacher_class["class_name"],
            "students_count": 0,
            "active_students": 0,
            "with_tests": 0,
            "with_texts": 0,
            "with_both": 0,
            "with_progress": 0,
            "avg_profile_growth": 0.0,
            "top_deficits": [],
            "top_growth_concepts": [],
            "students": [],
        }

    placeholders = ",".join("?" for _ in student_ids)

    with get_conn() as conn:
        meta_rows = conn.execute(f"""
            SELECT reader_id, test_count, text_count, last_update_at, last_source, last_test_at, last_text_at
            FROM profile_meta
            WHERE reader_id IN ({placeholders})
        """, tuple(student_ids)).fetchall()

        event_rows = conn.execute(f"""
            SELECT reader_id, created_at, profile_after_json
            FROM events
            WHERE reader_id IN ({placeholders})
            ORDER BY reader_id ASC, created_at ASC, id ASC
        """, tuple(student_ids)).fetchall()

        profile_rows = conn.execute(f"""
            SELECT reader_id, age, concepts_json, updated_at
            FROM profiles
            WHERE reader_id IN ({placeholders})
        """, tuple(student_ids)).fetchall()

    meta_map = {r["reader_id"]: dict(r) for r in meta_rows}
    profile_map = {
        r["reader_id"]: {
            "reader_id": r["reader_id"],
            "age": r["age"],
            "concepts": json.loads(r["concepts_json"]) if r["concepts_json"] else {},
            "updated_at": r["updated_at"],
        }
        for r in profile_rows
    }

    events_map: dict[str, list[dict[str, Any]]] = {}
    for r in event_rows:
        try:
            profile_after = json.loads(r["profile_after_json"]) if r["profile_after_json"] else {}
        except Exception:
            profile_after = {}

        events_map.setdefault(r["reader_id"], []).append({
            "created_at": r["created_at"],
            "profile_after": profile_after,
        })

    active_students = 0
    with_tests = 0
    with_texts = 0
    with_both = 0
    with_progress = 0

    total_growth = 0.0
    growth_students_count = 0

    concept_growth_acc: dict[str, list[float]] = {}
    deficit_acc: dict[str, list[float]] = {}

    student_cards: list[dict[str, Any]] = []

    for s in students:
        sid = s["student_id"]
        meta = meta_map.get(sid)
        profile = profile_map.get(sid)

        test_count = int(meta["test_count"]) if meta and meta.get("test_count") is not None else 0
        text_count = int(meta["text_count"]) if meta and meta.get("text_count") is not None else 0

        if meta and meta.get("last_update_at"):
            active_students += 1
        if test_count > 0:
            with_tests += 1
        if text_count > 0:
            with_texts += 1
        if test_count > 0 and text_count > 0:
            with_both += 1

        avg_delta = 0.0
        has_progress = False

        evs = events_map.get(sid, [])
        if len(evs) >= 2:
            first_profile = evs[0].get("profile_after", {}) or {}
            last_profile = evs[-1].get("profile_after", {}) or {}

            first_concepts = first_profile.get("concepts", {}) if isinstance(first_profile, dict) else {}
            last_concepts = last_profile.get("concepts", {}) if isinstance(last_profile, dict) else {}

            if not isinstance(first_concepts, dict):
                first_concepts = {}
            if not isinstance(last_concepts, dict):
                last_concepts = {}

            all_keys = sorted(set(first_concepts.keys()) | set(last_concepts.keys()))
            deltas = []

            for k in all_keys:
                try:
                    first_v = float(first_concepts.get(k, 0.0))
                except Exception:
                    first_v = 0.0
                try:
                    last_v = float(last_concepts.get(k, 0.0))
                except Exception:
                    last_v = 0.0

                delta = last_v - first_v
                deltas.append(delta)
                concept_growth_acc.setdefault(k, []).append(delta)

            if deltas:
                avg_delta = sum(deltas) / len(deltas)
                total_growth += avg_delta
                growth_students_count += 1
                if avg_delta > 1e-9:
                    has_progress = True
                    with_progress += 1

        if profile and isinstance(profile.get("concepts"), dict):
            for concept, value in profile["concepts"].items():
                try:
                    v = float(value)
                except Exception:
                    v = 0.0
                deficit_acc.setdefault(concept, []).append(max(0.0, 1.0 - v))

        student_cards.append({
            "student_id": sid,
            "student_name": s.get("student_name") or sid,
            "test_count": test_count,
            "text_count": text_count,
            "last_update_at": meta.get("last_update_at") if meta else None,
            "last_source": meta.get("last_source") if meta else None,
            "has_progress": has_progress,
            "avg_profile_growth": round(avg_delta, 4),
        })

    avg_profile_growth = round(total_growth / growth_students_count, 4) if growth_students_count else 0.0

    top_growth_concepts = []
    for concept, values in concept_growth_acc.items():
        if not values:
            continue
        top_growth_concepts.append({
            "concept": concept,
            "avg_growth": round(sum(values) / len(values), 4),
            "count": len(values),
        })
    top_growth_concepts.sort(key=lambda x: (-x["avg_growth"], x["concept"]))
    top_growth_concepts = top_growth_concepts[:10]

    top_deficits = []
    for concept, values in deficit_acc.items():
        if not values:
            continue
        top_deficits.append({
            "concept": concept,
            "avg_gap": round(sum(values) / len(values), 4),
            "count": len(values),
        })
    top_deficits.sort(key=lambda x: (-x["avg_gap"], x["concept"]))
    top_deficits = top_deficits[:10]

    return {
        "class_id": class_id,
        "class_name": teacher_class["class_name"],
        "students_count": len(students),
        "active_students": active_students,
        "with_tests": with_tests,
        "with_texts": with_texts,
        "with_both": with_both,
        "with_progress": with_progress,
        "avg_profile_growth": avg_profile_growth,
        "top_deficits": top_deficits,
        "top_growth_concepts": top_growth_concepts,
        "students": student_cards,
    }


def add_parent_child(parent_email: str, child_id: str, child_name: str | None = None, class_name: str | None = None):
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO parent_children (parent_email, child_id, child_name, class_name)
            VALUES (?, ?, ?, ?)
        """, (parent_email, child_id, child_name, class_name))

        row = conn.execute("""
            SELECT id, parent_email, child_id, child_name, class_name, created_at
            FROM parent_children
            WHERE parent_email = ? AND child_id = ?
        """, (parent_email, child_id)).fetchone()

    return dict(row)


def list_parent_children(parent_email: str):
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT id, parent_email, child_id, child_name, class_name, created_at
            FROM parent_children
            WHERE parent_email = ?
            ORDER BY created_at DESC, id DESC
        """, (parent_email,)).fetchall()

    return [dict(r) for r in rows]


def remove_parent_child(parent_email: str, child_id: str) -> bool:
    with get_conn() as conn:
        cur = conn.execute("""
            DELETE FROM parent_children
            WHERE parent_email = ? AND child_id = ?
        """, (parent_email, child_id))

    return cur.rowcount > 0


def add_read_book(
    reader_id: str,
    work_id: str,
    title: str,
    author: str | None = None,
    age: str | None = None,
    rating: int | None = None,
    impression_text: str | None = None,
    concepts: dict[str, Any] | None = None,
) -> dict[str, Any]:
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO read_books
            (reader_id, work_id, title, author, age, rating, impression_text, concepts_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            reader_id,
            work_id,
            title,
            author,
            age,
            rating,
            impression_text,
            json.dumps(concepts, ensure_ascii=False) if concepts is not None else None,
        ))

        row = conn.execute("""
            SELECT id, reader_id, work_id, title, author, age, rating, impression_text, concepts_json, created_at
            FROM read_books
            WHERE reader_id = ? AND work_id = ?
        """, (reader_id, work_id)).fetchone()

    out = dict(row)
    out["concepts"] = json.loads(out["concepts_json"]) if out.get("concepts_json") else {}
    out.pop("concepts_json", None)
    return out


def list_read_books(reader_id: str) -> list[dict[str, Any]]:
    try:
        with get_conn() as conn:
            rows = conn.execute("""
                SELECT id, reader_id, work_id, title, author, age, rating, impression_text, concepts_json, created_at
                FROM read_books
                WHERE reader_id = ?
                ORDER BY created_at DESC, id DESC
            """, (reader_id,)).fetchall()
    except sqlite3.OperationalError:
        # Older deployed SQLite files may not have the read_books table yet.
        init_db()
        with get_conn() as conn:
            rows = conn.execute("""
                SELECT id, reader_id, work_id, title, author, age, rating, impression_text, concepts_json, created_at
                FROM read_books
                WHERE reader_id = ?
                ORDER BY created_at DESC, id DESC
            """, (reader_id,)).fetchall()

    out = []
    for r in rows:
        item = dict(r)
        item["concepts"] = json.loads(item["concepts_json"]) if item.get("concepts_json") else {}
        item.pop("concepts_json", None)
        out.append(item)
    return out


def get_read_book(reader_id: str, read_book_id: int) -> Optional[dict[str, Any]]:
    with get_conn() as conn:
        row = conn.execute("""
            SELECT id, reader_id, work_id, title, author, age, rating, impression_text, concepts_json, created_at
            FROM read_books
            WHERE reader_id = ? AND id = ?
        """, (reader_id, read_book_id)).fetchone()

    if not row:
        return None

    out = dict(row)
    out["concepts"] = json.loads(out["concepts_json"]) if out.get("concepts_json") else {}
    out.pop("concepts_json", None)
    return out


def delete_read_book(reader_id: str, read_book_id: int) -> bool:
    with get_conn() as conn:
        cur = conn.execute("""
            DELETE FROM read_books
            WHERE reader_id = ? AND id = ?
        """, (reader_id, read_book_id))
    return cur.rowcount > 0


def list_read_book_ids(reader_id: str) -> list[str]:
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT work_id
            FROM read_books
            WHERE reader_id = ?
        """, (reader_id,)).fetchall()

    return [str(r["work_id"]) for r in rows]
