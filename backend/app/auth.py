def get_role_by_email(email: str) -> str:
    e = (email or "").strip().lower()
    if e == "admin@test.ru":
        return "admin"
    if e == "teacher@test.ru":
        return "teacher"
    if e == "parent@test.ru":
        return "parent"
    return "student"
