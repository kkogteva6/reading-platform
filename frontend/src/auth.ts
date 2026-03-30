// src/auth.ts
export type Role = "student" | "parent" | "teacher" | "admin";

export type AuthUser = {
  id: number;
  reader_id: string;
  email: string;
  role: Role;
  name?: string;
};

const KEY_USER = "rp_auth_user_v1";
const KEY_TOKEN = "rp_auth_token_v1";

export function getUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(KEY_USER);
    if (!raw) return null;
    const u = JSON.parse(raw) as AuthUser;
    if (!u?.email || !u?.role) return null;
    return u;
  } catch {
    return null;
  }
}

export function setUser(user: AuthUser | null) {
  if (!user) {
    localStorage.removeItem(KEY_USER);
    return;
  }
  localStorage.setItem(KEY_USER, JSON.stringify(user));
}

export function clearUser() {
  localStorage.removeItem(KEY_USER);
}

export function getToken(): string | null {
  const t = localStorage.getItem(KEY_TOKEN);
  return t && t.trim() ? t : null;
}

export function setToken(token: string | null) {
  if (!token || !token.trim()) {
    localStorage.removeItem(KEY_TOKEN);
    return;
  }
  localStorage.setItem(KEY_TOKEN, token);
}

export function clearToken() {
  localStorage.removeItem(KEY_TOKEN);
}

export function roleHome(role: Role) {
  switch (role) {
    case "student":
      return "/student";
    case "parent":
      return "/parent";
    case "teacher":
      return "/teacher";
    case "admin":
    default:
      return "/admin";
  }
}

export function logout() {
  clearUser();
  clearToken();
}


export function getReaderId(): string | null {
  const u = getUser();
  if (!u) return null;

  if (u.reader_id && String(u.reader_id).trim()) {
    return String(u.reader_id);
  }

  if (u.id !== undefined && u.id !== null) {
    return String(u.id);
  }

  return null;
}

export function getUserId(): number | null {
  const u = getUser();
  if (!u) return null;

  if (typeof u.id === "number") return u.id;

  if (u.reader_id && !isNaN(Number(u.reader_id))) {
    return Number(u.reader_id);
  }

  return null;
}