import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import type { Role } from "../mock/users";

const roleLabels: Record<Role, string> = {
  student: "Ученик",
  parent: "Родитель",
  teacher: "Учитель",
  admin: "Администратор",
};

function roleHome(role: Role) {
  if (role === "student") return "/student";
  if (role === "parent") return "/parent";
  if (role === "teacher") return "/teacher";
  return "/admin";
}

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();

  const [role, setRole] = useState<Role>("student");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const res = register(email.trim(), password, role, displayName.trim());
    if (!res.ok) {
      setError(res.error || "Ошибка регистрации.");
      return;
    }

    nav(roleHome(role), { replace: true });
  }

  return (
    <div style={{ padding: 24, maxWidth: 520, margin: "0 auto", fontFamily: "system-ui" }}>
      <h2>Регистрация</h2>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <label>
          Роль
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} style={{ width: "100%", padding: 8 }}>
            {Object.keys(roleLabels).map((r) => (
              <option key={r} value={r}>
                {roleLabels[r as Role]}
              </option>
            ))}
          </select>
        </label>

        <label>
          Имя (отображаемое)
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            style={{ width: "100%", padding: 8 }}
          />
        </label>

        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: "100%", padding: 8 }} />
        </label>

        <label>
          Пароль
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: "100%", padding: 8 }}
          />
        </label>

        {error && <div style={{ color: "crimson" }}>{error}</div>}

        <button type="submit" style={{ padding: 10 }}>
          Создать аккаунт
        </button>
      </form>

      <p style={{ marginTop: 12 }}>
        Уже есть аккаунт? <Link to="/login">Вход</Link>
      </p>
    </div>
  );
}
