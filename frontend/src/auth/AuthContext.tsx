import React, { createContext, useContext, useMemo, useState } from "react";
import type { Role } from "../mock/users";

const API_BASE = "https://reading-platform-backend.onrender.com";

type AuthUser = {
  id: string;
  email: string;
  role: Role;
  displayName: string;
  reader_id?: string;
};

type AuthResult = {
  ok: boolean;
  error?: string;
};

type AuthState = {
  user: AuthUser | null;
  token: string | null;
  login: (email: string, password: string, role: Role) => Promise<AuthResult>;
  register: (
    email: string,
    password: string,
    role: Role,
    displayName: string
  ) => Promise<AuthResult>;
  logout: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

const USER_STORAGE_KEY = "reading_platform_auth_user_v1";
const TOKEN_STORAGE_KEY = "reading_platform_auth_token_v1";

function loadUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function loadToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveAuth(user: AuthUser | null, token: string | null) {
  if (user) localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_STORAGE_KEY);

  if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
  else localStorage.removeItem(TOKEN_STORAGE_KEY);
}

async function extractErrorText(r: Response): Promise<string> {
  const ct = r.headers.get("content-type") || "";

  try {
    if (ct.includes("application/json")) {
      const j = await r.json();
      const detail = (j as any)?.detail;
      if (typeof detail === "string") return detail;
      return JSON.stringify(j);
    }

    const txt = await r.text();
    return txt || `${r.status} ${r.statusText}`;
  } catch {
    return `${r.status} ${r.statusText}`;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => loadUser());
  const [token, setToken] = useState<string | null>(() => loadToken());

  const api = useMemo<AuthState>(() => {
    return {
      user,
      token,

      login: async (email, password, role) => {
        try {
          const r = await fetch(`${API_BASE}/auth/login`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email: email.trim(),
              password,
              role,
            }),
          });

          if (!r.ok) {
            return { ok: false, error: await extractErrorText(r) };
          }

          const data = await r.json();

          const authUser: AuthUser = {
            id: String(data.user.id),
            reader_id: data.user.reader_id ? String(data.user.reader_id) : undefined,
            email: data.user.email,
            role: data.user.role,
            displayName: data.user.name || data.user.email,
          };

          setUser(authUser);
          setToken(data.token);
          saveAuth(authUser, data.token);

          return { ok: true };
        } catch (e) {
          return {
            ok: false,
            error: e instanceof Error ? e.message : "Ошибка сети при входе.",
          };
        }
      },

      register: async (email, password, role, displayName) => {
        try {
          const r = await fetch(`${API_BASE}/auth/register`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name: displayName.trim() || "Пользователь",
              email: email.trim(),
              password,
              role,
            }),
          });

          if (!r.ok) {
            return { ok: false, error: await extractErrorText(r) };
          }

          const data = await r.json();

          const authUser: AuthUser = {
            id: String(data.user.id),
            reader_id: data.user.reader_id ? String(data.user.reader_id) : undefined,
            email: data.user.email,
            role: data.user.role,
            displayName: data.user.name || data.user.email,
          };

          setUser(authUser);
          setToken(data.token);
          saveAuth(authUser, data.token);

          return { ok: true };
        } catch (e) {
          return {
            ok: false,
            error: e instanceof Error ? e.message : "Ошибка сети при регистрации.",
          };
        }
      },

      logout: () => {
        setUser(null);
        setToken(null);
        saveAuth(null, null);
      },
    };
  }, [user, token]);

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}