import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useState, type FormEvent } from "react";
import Protected from "../Protected";

import { getUser, roleHome, setToken, setUser, type AuthUser, type Role } from "../auth";
import { apiJson } from "../api";

import Student from "../pages/dashboards/StudentDashboard";
import Parent from "../pages/dashboards/ParentDashboard";
import TeacherClass from "../pages/dashboards/TeacherClass";
import TeacherStudent from "../pages/dashboards/TeacherStudent";
import Admin from "../pages/dashboards/AdminDashboard";

const ROLE_CARDS: Array<{ role: Role; title: string; desc: string }> = [
  { role: "student", title: "Ученик", desc: "" },
  { role: "parent", title: "Родитель", desc: "" },
  { role: "teacher", title: "Учитель", desc: "" },
  { role: "admin", title: "Администратор", desc: "" },
];

function BrandHeader(props: { title: string; subtitle?: string }) {
  return (
    <div className="header">
      <div className="brandRow">
        <div className="bookLogo" aria-hidden>
          <svg className="bookSvg" viewBox="0 0 64 64">
            <path
              d="M6 14h20c6 0 10 4 10 10v28c-2-3-6-4-10-4H6c-3 0-6 2-6 6V20c0-3 3-6 6-6z"
              fill="rgba(255,255,255,0.25)"
              stroke="white"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path
              d="M58 14H38c-6 0-10 4-10 10v28c2-3 6-4 10-4h20c3 0 6 2 6 6V20c0-3-3-6-6-6z"
              fill="rgba(255,255,255,0.25)"
              stroke="white"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <line x1="32" y1="18" x2="32" y2="52" stroke="white" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>

        <div>
          <h1 className="title" style={{ margin: 0 }}>
            {props.title}
          </h1>

          {props.subtitle && (
            <p className="subtitle" style={{ marginBottom: 0 }}>
              {props.subtitle}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Home() {
  return (
    <div className="container">
      <div className="card">
        <BrandHeader title="Платформа развивающего чтения" />

        <div className="content">
          <div className="panel">
            <div className="panelTitle">Старт</div>

            <div className="actions">
              <Link className="btn btnPrimary" to="/login">
                <span className="btnText">
                  <span className="btnLabel">Вход</span>
                  <span className="btnHint">Если аккаунт уже создан</span>
                </span>
                <span className="arrow">→</span>
              </Link>

              <Link className="btn" to="/register">
                <span className="btnText">
                  <span className="btnLabel">Регистрация</span>
                  <span className="btnHint">Создать профиль и выбрать роль</span>
                </span>
                <span className="arrow">→</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Login() {
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };

  const [role, setRole] = useState<Role>("student");
  const [error, setError] = useState<string | null>(null);

  async function doLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    try {
      const form = new FormData(e.currentTarget);
      const email = String(form.get("email") ?? "").trim();
      const password = String(form.get("password") ?? "");

      const out = await apiJson<{ token: string; user: AuthUser }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password, role }),
      });

      setToken(out.token);
      setUser(out.user);

      const from = loc?.state?.from ?? null;
      nav(from ?? roleHome(out.user.role), { replace: true });
    } catch (e: any) {
      setError(e?.message || "Ошибка входа");
    }
  }

  return (
    <div className="container">
      <div className="card">
        <BrandHeader title="Вход" subtitle="Выберите роль и войдите в систему." />

        <div className="content">
          <div className="panel" style={{ maxWidth: 680 }}>
            <div className="panelTitle">Роль</div>

            <div className="roleGrid">
              {ROLE_CARDS.map((r) => (
                <button
                  key={r.role}
                  type="button"
                  className={`roleCard ${role === r.role ? "roleCardActive" : ""}`}
                  onClick={() => setRole(r.role)}
                >
                  <div className="roleTitle">{r.title}</div>
                  <div className="roleDesc">{r.desc}</div>
                </button>
              ))}
            </div>

            <div style={{ height: 14 }} />

            <div className="panelTitle">Данные для входа</div>

            <form onSubmit={doLogin} autoComplete="on">
              <div className="formGrid">
                <label className="field">
                  <span>Email</span>
                  <input
                    name="email"
                    type="email"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    inputMode="email"
                    placeholder="name@example.com"
                  />
                </label>

                <label className="field">
                  <span>Пароль</span>
                  <input
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••"
                  />
                </label>
              </div>

              {error && <div style={{ color: "crimson", marginTop: 12 }}>{error}</div>}

              <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
                <button className="primaryBtn" type="submit">
                  Войти
                </button>

                <Link to="/register" className="linkBtn">
                  Нет аккаунта? Зарегистрироваться
                </Link>
              </div>
            </form>

            <div style={{ marginTop: 10 }}>
              <Link to="/" className="linkBtn">
                ← На главную
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Register() {
  const nav = useNavigate();

  const [role, setRole] = useState<Role>("student");
  const [error, setError] = useState<string | null>(null);

  async function doRegister(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    try {
      const form = new FormData(e.currentTarget);
      const name = String(form.get("name") ?? "").trim();
      const email = String(form.get("email") ?? "").trim();
      const password = String(form.get("password") ?? "");

      const out = await apiJson<{ token: string; user: AuthUser }>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ role, name, email, password }),
      });

      setToken(out.token);
      setUser(out.user);

      nav(roleHome(out.user.role), { replace: true });
    } catch (e: any) {
      setError(e?.message || "Ошибка регистрации");
    }
  }

  return (
    <div className="container">
      <div className="card">
        <BrandHeader title="Регистрация" subtitle="Создайте профиль и выберите роль для доступа к кабинету." />

        <div className="content">
          <div className="panel" style={{ maxWidth: 680 }}>
            <div className="panelTitle">Роль</div>

            <div className="roleGrid">
              {ROLE_CARDS.map((r) => (
                <button
                  key={r.role}
                  type="button"
                  className={`roleCard ${role === r.role ? "roleCardActive" : ""}`}
                  onClick={() => setRole(r.role)}
                >
                  <div className="roleTitle">{r.title}</div>
                  <div className="roleDesc">{r.desc}</div>
                </button>
              ))}
            </div>

            <div style={{ height: 14 }} />

            <div className="panelTitle">Данные</div>

            <form onSubmit={doRegister} autoComplete="on">
              <div className="formGrid">
                <label className="field">
                  <span>ФИО</span>
                  <input
                    name="name"
                    autoComplete="name"
                    placeholder="Например: Иванова Анна Александровна"
                  />
                </label>

                <label className="field">
                  <span>Email</span>
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    inputMode="email"
                    placeholder="name@example.com"
                  />
                </label>

                <label className="field">
                  <span>Пароль</span>
                  <input
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Минимум 4 символа"
                  />
                </label>
              </div>

              {error && <div style={{ color: "crimson", marginTop: 12 }}>{error}</div>}

              <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
                <button className="primaryBtn" type="submit">
                  Создать аккаунт
                </button>

                <Link to="/login" className="linkBtn">
                  Уже есть аккаунт? Войти
                </Link>
              </div>
            </form>

            <div style={{ marginTop: 10 }}>
              <Link to="/" className="linkBtn">
                ← На главную
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const u = getUser();

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={u ? <Navigate to={roleHome(u.role)} replace /> : <Login />} />
      <Route path="/register" element={<Register />} />

      <Route element={<Protected />}>
        <Route path="/student" element={<Student />} />
        <Route path="/parent" element={<Parent />} />
        <Route path="/teacher" element={<TeacherClass />} />
        <Route path="/teacher/student/:id" element={<TeacherStudent />} />
        <Route path="/admin" element={<Admin />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
