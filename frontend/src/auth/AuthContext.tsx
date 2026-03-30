import React, { createContext, useContext, useMemo, useState } from "react";
import { MOCK_USERS } from "../mock/users";
import type { Role } from "../mock/users";

type AuthUser = {
  id: string;
  email: string;
  role: Role;
  displayName: string;
};

type AuthState = {
  user: AuthUser | null;
  login: (email: string, password: string, role: Role) => { ok: boolean; error?: string };
  register: (email: string, password: string, role: Role, displayName: string) => { ok: boolean; error?: string };
  logout: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

const STORAGE_KEY = "reading_platform_auth_user_v1";

function loadUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function saveUser(user: AuthUser | null) {
  if (!user) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => loadUser());

  const api = useMemo<AuthState>(() => {
    return {
      user,
      login: (email, password, role) => {
        const found = MOCK_USERS.find(
          (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password && u.role === role
        );
        if (!found) return { ok: false, error: "Неверный email/пароль или роль." };

        const authUser: AuthUser = {
          id: found.id,
          email: found.email,
          role: found.role,
          displayName: found.displayName,
        };
        setUser(authUser);
        saveUser(authUser);
        return { ok: true };
      },
      register: (email, password, role, displayName) => {
        // В мок-версии не изменяем MOCK_USERS (он константный). Просто “логиним” как будто создали.
        if (!email.includes("@")) return { ok: false, error: "Email выглядит некорректно." };
        if (password.length < 4) return { ok: false, error: "Пароль слишком короткий (минимум 4 символа)." };

        const authUser: AuthUser = {
          id: "mock-new",
          email,
          role,
          displayName: displayName || "Пользователь",
        };
        setUser(authUser);
        saveUser(authUser);
        return { ok: true };
      },
      logout: () => {
        setUser(null);
        saveUser(null);
      },
    };
  }, [user]);

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
