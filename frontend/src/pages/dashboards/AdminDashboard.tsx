// src/pages/dashboards/AdminDashboard.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getUser, logout, roleHome } from "../../auth";
import {
  apiAdminAddBook,
  apiAdminDeleteBook,
  apiAdminDeleteUser,
  apiAdminGetAnalytics,
  apiAdminGetUser,
  apiAdminImportWorksNeo4j,
  apiAdminListBooks,
  apiAdminListUsers,
  apiAdminPublish,
  apiAdminRebuildWorks,
  apiAdminResetUserProfile,
  apiAdminUpdateBook,
  apiAdminUpdateUserRole,
  apiAdminUploadCover,
  type AdminAnalytics,
  type AdminBookIn,
  type AdminUserFull,
  type AdminUserRow,
} from "../../api/backend";

type AdminTab = "books" | "analytics" | "profiles";

type BookRow = {
  id: string;
  title: string;
  author: string;
  age?: string;
  annotation?: string;
  cover_image?: string;
};

type Status =
  | { kind: "idle" }
  | { kind: "loading"; text: string }
  | { kind: "ok"; text: string }
  | { kind: "error"; text: string };

const emptyBook: BookRow = {
  id: "",
  title: "",
  author: "",
  age: "12+",
  annotation: "",
  cover_image: "",
};

function toBackendUrl(path?: string) {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `https://reading-platform-backend.onrender.com${path}`;
}

function slugifyId(input: string) {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
    к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
    х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };

  const s = (input || "").trim().toLowerCase();
  const translit = Array.from(s)
    .map((ch) => map[ch] ?? ch)
    .join("");

  return (
    translit
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/_+/g, "_")
      .slice(0, 60) || "work"
  );
}

function fmtDT(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

function friendlySourceName(source: string) {
  if (source === "test") return "Анкета";
  if (source === "text") return "Текст";
  if (source === "none") return "Нет данных";
  if (source === "manual") return "Вручную";
  return source;
}

function statusBoxStyle(status: Status): React.CSSProperties {
  if (status.kind === "idle") return {};
  if (status.kind === "error") {
    return {
      marginTop: 12,
      color: "rgba(120,10,20,.95)",
      background: "rgba(220,50,70,.07)",
      border: "1px solid rgba(220,50,70,.25)",
      padding: "10px 12px",
      borderRadius: 12,
      fontSize: 13,
      whiteSpace: "pre-wrap",
    };
  }
  if (status.kind === "ok") {
    return {
      marginTop: 12,
      color: "rgba(10,80,40,.95)",
      background: "rgba(0,180,120,.08)",
      border: "1px solid rgba(0,180,120,.22)",
      padding: "10px 12px",
      borderRadius: 12,
      fontSize: 13,
      whiteSpace: "pre-wrap",
    };
  }
  return {
    marginTop: 12,
    background: "rgba(60,110,255,.06)",
    border: "1px solid rgba(60,110,255,.18)",
    padding: "10px 12px",
    borderRadius: 12,
    fontSize: 13,
    whiteSpace: "pre-wrap",
  };
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "1px solid rgba(0,0,0,.08)",
  color: "rgba(20,25,35,.65)",
  fontSize: 13,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid rgba(0,0,0,.08)",
  fontSize: 14,
  verticalAlign: "top",
};

export default function AdminDashboard() {
  const nav = useNavigate();
  const user = getUser();

  const [tab, setTab] = useState<AdminTab>("books");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const [books, setBooks] = useState<BookRow[]>([]);
  const [form, setForm] = useState<BookRow>(emptyBook);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [bookQuery, setBookQuery] = useState("");
  const [uploadingCover, setUploadingCover] = useState(false);

  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userQuery, setUserQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<AdminUserFull | null>(null);
  const [selectedUserLoading, setSelectedUserLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      nav("/login", { replace: true });
      return;
    }
    if (user.role !== "admin") {
      nav(roleHome(user.role), { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isBusy = status.kind === "loading" || uploadingCover;

  const filteredBooks = useMemo(() => {
    const q = bookQuery.trim().toLowerCase();
    if (!q) return books;
    return books.filter((b) => {
      const hay = `${b.id} ${b.title} ${b.author} ${b.age ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [books, bookQuery]);

  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const hay = `${u.id} ${u.name} ${u.email} ${u.role}`.toLowerCase();
      return hay.includes(q);
    });
  }, [users, userQuery]);

  const totals = analytics?.totals;
  const engagement = analytics?.engagement;
  const libraryQuality = analytics?.library_quality;
  const topBooks = analytics?.top_books ?? [];
  const topConcepts = analytics?.top_concepts ?? [];
  const effectiveness = analytics?.effectiveness;

  const sourceMax = useMemo(() => {
    const xs = analytics?.top_sources?.map((x) => x.c) ?? [];
    return xs.length ? Math.max(...xs) : 0;
  }, [analytics]);

  const bookMax = useMemo(() => {
    const xs = topBooks.map((x) => x.count);
    return xs.length ? Math.max(...xs) : 0;
  }, [topBooks]);

  const conceptMax = useMemo(() => {
    const xs = topConcepts.map((x) => x.count);
    return xs.length ? Math.max(...xs) : 0;
  }, [topConcepts]);

  const growthMax = useMemo(() => {
    const xs = effectiveness?.top_growth_concepts?.map((x) => Math.abs(x.avg_growth)) ?? [];
    return xs.length ? Math.max(...xs) : 0;
  }, [effectiveness]);

  const weakGrowthMax = useMemo(() => {
    const xs = effectiveness?.weak_growth_concepts?.map((x) => Math.abs(x.avg_growth)) ?? [];
    return xs.length ? Math.max(...xs) : 0;
  }, [effectiveness]);

  const analyticsInsights = useMemo(() => {
    const tips: string[] = [];
    if (!analytics) return tips;

    if ((analytics.engagement?.active_share ?? 0) < 50) {
      tips.push("Доля активных пользователей пока низкая — стоит усилить регулярное взаимодействие с платформой.");
    }

    if ((analytics.totals?.text_events ?? 0) < (analytics.totals?.test_events ?? 0)) {
      tips.push("Анализов текстов меньше, чем анкетирований — пользователи чаще проходят диагностику, чем работают с собственными текстами.");
    }

    if ((analytics.engagement?.users_without_profile ?? 0) > 0) {
      tips.push("Не у всех пользователей сформирован профиль — это снижает качество персонализации рекомендаций.");
    }

    if ((analytics.engagement?.users_with_both ?? 0) > 0) {
      tips.push("Есть пользователи, у которых сочетаются и анкеты, и тексты — это наиболее качественный сценарий накопления профиля.");
    }

    if ((analytics.engagement?.users_without_activity ?? 0) > 0) {
      tips.push("Часть аккаунтов остаётся без активности — им может потребоваться сопровождение или дополнительная мотивация.");
    }

    if ((analytics.library_quality?.books_without_cover ?? 0) > 0) {
      tips.push("Не у всех книг есть обложки — это ухудшает визуальную привлекательность рекомендаций.");
    }

    if ((analytics.library_quality?.books_without_annotation ?? 0) > 0) {
      tips.push("В книжном фонде есть книги без аннотаций — это может снижать качество семантического анализа.");
    }

    if ((analytics.effectiveness?.students_with_progress ?? 0) > 0) {
      tips.push("У части учеников наблюдается положительная динамика профиля — это говорит о потенциальной эффективности платформы.");
    }

    if ((analytics.effectiveness?.students_with_regress ?? 0) > 0) {
      tips.push("Есть ученики с отрицательной динамикой — полезно отдельно анализировать их образовательный маршрут.");
    }

    return tips;
  }, [analytics]);

  function setLoading(text: string) {
    setStatus({ kind: "loading", text });
  }

  function setOk(text: string) {
    setStatus({ kind: "ok", text });
  }

  function setErr(e: unknown) {
    setStatus({
      kind: "error",
      text: e instanceof Error ? e.message : String(e),
    });
  }

  function resetBookForm() {
    setForm(emptyBook);
    setEditingId(null);
  }

  async function loadBooks() {
    try {
      const data = await apiAdminListBooks();
      setBooks(Array.isArray(data) ? (data as BookRow[]) : []);
    } catch (e) {
      setErr(e);
    }
  }

  async function loadAnalytics() {
    try {
      setAnalyticsLoading(true);
      const data = await apiAdminGetAnalytics();
      setAnalytics(data);
    } catch (e) {
      setErr(e);
    } finally {
      setAnalyticsLoading(false);
    }
  }

  async function loadUsers() {
    try {
      setUsersLoading(true);
      const data = await apiAdminListUsers();
      setUsers(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e);
    } finally {
      setUsersLoading(false);
    }
  }

  async function loadUserDetails(userId: number) {
    try {
      setSelectedUserLoading(true);
      const data = await apiAdminGetUser(userId);
      setSelectedUser(data);
    } catch (e) {
      setErr(e);
    } finally {
      setSelectedUserLoading(false);
    }
  }

  useEffect(() => {
    void loadBooks();
    void loadAnalytics();
    void loadUsers();
  }, []);

  function validateBook(b: BookRow): { ok: true } | { ok: false; msg: string } {
    const id = (b.id || "").trim();
    const title = (b.title || "").trim();
    const author = (b.author || "").trim();

    if (!title) return { ok: false, msg: "Введите название книги" };
    if (!author) return { ok: false, msg: "Введите автора" };
    if (!id) return { ok: false, msg: "Введите id или сгенерируйте его" };
    if (!/^[a-z0-9_]+$/i.test(id)) return { ok: false, msg: "id должен содержать только латиницу, цифры и _" };

    return { ok: true };
  }

  async function onUploadCover(file: File) {
    try {
      setUploadingCover(true);
      const out = await apiAdminUploadCover(file);
      setForm((prev) => ({ ...prev, cover_image: out.cover_image || "" }));
      setOk("Обложка загружена");
    } catch (e) {
      setErr(e);
    } finally {
      setUploadingCover(false);
    }
  }

  async function onSubmitBook() {
    const payload: AdminBookIn = {
      id: (form.id || "").trim(),
      title: (form.title || "").trim(),
      author: (form.author || "").trim(),
      age: (form.age || "12+").trim(),
      annotation: (form.annotation || "").trim(),
      cover_image: (form.cover_image || "").trim(),
    };

    const v = validateBook(payload as BookRow);
    if (!v.ok) {
      setErr(v.msg);
      return;
    }

    try {
      if (editingId) {
        setLoading("Сохраняю изменения книги…");
        await apiAdminUpdateBook(editingId, payload);
        await loadBooks();
        await loadAnalytics();
        setOk("Книга обновлена");
      } else {
        setLoading("Добавляю книгу…");
        await apiAdminAddBook(payload);
        await loadBooks();
        await loadAnalytics();
        setOk("Книга добавлена");
      }
      resetBookForm();
    } catch (e) {
      setErr(e);
    }
  }

  async function onDeleteBook(bookId: string) {
    const ok = window.confirm(`Удалить книгу "${bookId}"?`);
    if (!ok) return;

    try {
      setLoading("Удаляю книгу…");
      await apiAdminDeleteBook(bookId);
      await loadBooks();
      await loadAnalytics();
      if (editingId === bookId) resetBookForm();
      setOk("Книга удалена");
    } catch (e) {
      setErr(e);
    }
  }

  function onEditBook(book: BookRow) {
    setTab("books");
    setEditingId(book.id);
    setForm({
      id: book.id || "",
      title: book.title || "",
      author: book.author || "",
      age: book.age || "12+",
      annotation: book.annotation || "",
      cover_image: book.cover_image || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function rebuild() {
    try {
      setLoading("Пересчёт концептов (SBERT)…");
      await apiAdminRebuildWorks();
      await loadAnalytics();
      setOk("works.json пересчитан");
    } catch (e) {
      setErr(e);
    }
  }

  async function importNeo4j() {
    try {
      setLoading("Импорт в Neo4j…");
      await apiAdminImportWorksNeo4j();
      await loadAnalytics();
      setOk("Импорт в Neo4j завершён");
    } catch (e) {
      setErr(e);
    }
  }

  async function publishAll() {
    try {
      setLoading("Публикация: пересчёт + импорт…");
      await apiAdminPublish();
      await loadAnalytics();
      setOk("Опубликовано: works.json пересчитан и импортирован в Neo4j");
    } catch (e) {
      setErr(e);
    }
  }

  async function onChangeUserRole(userId: number, role: "student" | "parent" | "teacher" | "admin") {
    try {
      setLoading("Меняю роль пользователя…");
      await apiAdminUpdateUserRole(userId, role);
      await loadUsers();
      await loadAnalytics();
      if (selectedUser?.id === userId) {
        await loadUserDetails(userId);
      }
      setOk("Роль пользователя обновлена");
    } catch (e) {
      setErr(e);
    }
  }

  async function onResetProfile(userId: number) {
    const ok = window.confirm("Сбросить профиль пользователя? Будут очищены профиль, история, метаданные и снимки рекомендаций.");
    if (!ok) return;

    try {
      setLoading("Сбрасываю профиль пользователя…");
      await apiAdminResetUserProfile(userId);
      await loadUsers();
      await loadAnalytics();
      if (selectedUser?.id === userId) {
        await loadUserDetails(userId);
      }
      setOk("Профиль пользователя сброшен");
    } catch (e) {
      setErr(e);
    }
  }

  async function onDeleteUser(userId: number) {
    const ok = window.confirm("Удалить пользователя полностью? Это действие необратимо.");
    if (!ok) return;

    try {
      setLoading("Удаляю пользователя…");
      await apiAdminDeleteUser(userId);
      await loadUsers();
      await loadAnalytics();
      if (selectedUser?.id === userId) {
        setSelectedUser(null);
      }
      setOk("Пользователь удалён");
    } catch (e) {
      setErr(e);
    }
  }

  return (
    <div className="page">
      <div className="shellWide">
        <div className="card">
          <div className="headerRow">
            <div className="brandRow">
              <div className="bookLogo" aria-hidden>
                <svg className="bookSvg" viewBox="0 0 64 64">
                  <path
                    d="M6 14h20c6 0 10 4 10 10v28c-2-3-6-4-10-4H6c-3 0-6 2-6 6V20c0-3 3-6 6-6z"
                    fill="rgba(60,110,255,0.12)"
                    stroke="rgba(60,110,255,0.60)"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M58 14H38c-6 0-10 4-10 10v28c2-3 6-4 10-4h20c3 0 6 2 6 6V20c0-3-3-6-6-6z"
                    fill="rgba(80,200,170,0.10)"
                    stroke="rgba(80,200,170,0.55)"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                  <line x1="32" y1="18" x2="32" y2="52" stroke="rgba(20,25,35,.55)" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>

              <div>
                <div className="h1">Админ-панель</div>
                <div className="muted">Книги, аналитика эффективности литературного образования и управление профилями.</div>
              </div>
            </div>

            <button
              className="btn"
              type="button"
              onClick={() => {
                logout();
                nav("/login", { replace: true });
              }}
            >
              Выйти
            </button>
          </div>

          <div className="tabsRow">
            <button className={`tabBtn ${tab === "books" ? "tabBtnActive" : ""}`} onClick={() => setTab("books")}>
              Книги
            </button>
            <button className={`tabBtn ${tab === "analytics" ? "tabBtnActive" : ""}`} onClick={() => setTab("analytics")}>
              Аналитика
            </button>
            <button className={`tabBtn ${tab === "profiles" ? "tabBtnActive" : ""}`} onClick={() => setTab("profiles")}>
              Профили
            </button>
          </div>

          {status.kind !== "idle" && <div style={statusBoxStyle(status)}>{status.text}</div>}

          {tab === "books" && (
            <>
              <div className="panel" style={{ marginTop: 14 }}>
                <div className="panelTitle">Публикация</div>

                <div className="actions">
                  <button className="actionBtn" type="button" onClick={() => void rebuild()} disabled={isBusy}>
                    <div className="actionTitle">Пересчитать концепты</div>
                    <div className="actionHint">Сформировать works.json</div>
                  </button>

                  <button className="actionBtn" type="button" onClick={() => void importNeo4j()} disabled={isBusy}>
                    <div className="actionTitle">Импорт в Neo4j</div>
                    <div className="actionHint">Залить works.json в граф</div>
                  </button>

                  <button className="actionBtn actionPrimary" type="button" onClick={() => void publishAll()} disabled={isBusy}>
                    <div className="actionTitle">Опубликовать</div>
                    <div className="actionHint">Пересчитать и импортировать</div>
                  </button>
                </div>
              </div>

              <div className="panel" style={{ marginTop: 14 }}>
                <div className="panelTitle">{editingId ? "Редактировать книгу" : "Добавить книгу"}</div>

                <div className="formGrid">
                  <label className="field">
                    <span>ID (уникальный)</span>
                    <input
                      value={form.id}
                      onChange={(e) => setForm({ ...form, id: e.target.value })}
                      placeholder="например: war_and_peace"
                      disabled={isBusy}
                    />
                    <span className="fieldHint">Можно сгенерировать из названия.</span>
                  </label>

                  <div className="field" style={{ alignContent: "end" as any }}>
                    <span style={{ opacity: 0 }}>.</span>
                    <button
                      type="button"
                      className="primaryBtn"
                      onClick={() => setForm((f) => ({ ...f, id: slugifyId(f.title || f.id) }))}
                      disabled={isBusy}
                    >
                      Сгенерировать ID
                    </button>
                  </div>

                  <label className="field">
                    <span>Название</span>
                    <input
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="Война и мир"
                      disabled={isBusy}
                    />
                  </label>

                  <label className="field">
                    <span>Автор</span>
                    <input
                      value={form.author}
                      onChange={(e) => setForm({ ...form, author: e.target.value })}
                      placeholder="Л.Н. Толстой"
                      disabled={isBusy}
                    />
                  </label>

                  <label className="field">
                    <span>Возраст</span>
                    <input
                      value={form.age ?? "12+"}
                      onChange={(e) => setForm({ ...form, age: e.target.value })}
                      placeholder="12+"
                      disabled={isBusy}
                    />
                  </label>

                  <label className="field">
                    <span>Файл обложки</span>
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void onUploadCover(file);
                        e.currentTarget.value = "";
                      }}
                      disabled={isBusy}
                    />
                    <span className="fieldHint">Поддерживаются jpg, jpeg, png, webp.</span>
                  </label>

                  <label className="field" style={{ gridColumn: "1 / -1" }}>
                    <span>Аннотация</span>
                    <textarea
                      className="bigTextarea"
                      rows={6}
                      value={form.annotation ?? ""}
                      onChange={(e) => setForm({ ...form, annotation: e.target.value })}
                      placeholder="Короткое описание книги. По нему считаются концепты."
                      disabled={isBusy}
                    />
                  </label>

                  <div className="coverPreviewWrap">
                    <div className="coverPreviewBox">
                      {form.cover_image ? (
                        <img className="coverPreviewImg" src={toBackendUrl(form.cover_image)} alt={form.title || "cover"} />
                      ) : (
                        <div className="coverPreviewEmpty">Обложка не выбрана</div>
                      )}
                    </div>

                    {form.cover_image && (
                      <div className="coverMeta">
                        <div className="coverMetaLabel">Путь к обложке</div>
                        <div className="coverMetaPath">{form.cover_image}</div>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => setForm((prev) => ({ ...prev, cover_image: "" }))}
                          disabled={isBusy}
                        >
                          Убрать обложку
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="row" style={{ marginTop: 12 }}>
                  <button className="primaryBtn" type="button" onClick={() => void onSubmitBook()} disabled={isBusy}>
                    {editingId ? "Сохранить изменения" : "Добавить книгу"}
                  </button>

                  <button className="btn" type="button" onClick={resetBookForm} disabled={isBusy}>
                    {editingId ? "Отменить редактирование" : "Очистить"}
                  </button>
                </div>

                <div className="note">
                  После добавления или редактирования книги нажми <b>Опубликовать</b> — тогда концепты пересчитаются и книга обновится в графе и рекомендациях.
                </div>
              </div>

              <div className="panel" style={{ marginTop: 14 }}>
                <div className="panelTop">
                  <div>
                    <div className="panelTitle">Книги</div>
                    <div className="muted" style={{ marginTop: 6 }}>
                      Всего: <b>{books.length}</b>
                      {bookQuery.trim() ? (
                        <>
                          {" "}
                          • Показано: <b>{filteredBooks.length}</b>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <label className="field" style={{ minWidth: 260 }}>
                    <span>Поиск</span>
                    <input value={bookQuery} onChange={(e) => setBookQuery(e.target.value)} placeholder="по названию, автору или id" disabled={isBusy} />
                  </label>
                </div>

                <div style={{ height: 12 }} />

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", minWidth: 1200, borderCollapse: "separate", borderSpacing: 0 }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Обложка</th>
                        <th style={thStyle}>ID</th>
                        <th style={thStyle}>Название</th>
                        <th style={thStyle}>Автор</th>
                        <th style={thStyle}>Возраст</th>
                        <th style={{ ...thStyle, minWidth: 220 }}>Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBooks.map((b) => (
                        <tr key={b.id}>
                          <td style={tdStyle}>
                            {b.cover_image ? (
                              <img
                                src={toBackendUrl(b.cover_image)}
                                alt={b.title}
                                style={{
                                  width: 60,
                                  height: 90,
                                  objectFit: "cover",
                                  borderRadius: 8,
                                  border: "1px solid rgba(0,0,0,.1)",
                                }}
                              />
                            ) : (
                              <span className="muted">Нет</span>
                            )}
                          </td>
                          <td style={tdStyle}>{b.id}</td>
                          <td style={tdStyle}>
                            <div style={{ fontWeight: 700 }}>{b.title}</div>
                            {b.annotation ? (
                              <div className="muted" style={{ marginTop: 6, maxWidth: 360 }}>
                                {b.annotation.length > 140 ? `${b.annotation.slice(0, 140)}…` : b.annotation}
                              </div>
                            ) : null}
                          </td>
                          <td style={tdStyle}>{b.author}</td>
                          <td style={tdStyle}>{b.age ?? ""}</td>
                          <td style={tdStyle}>
                            <div className="tableActions">
                              <button className="btn" type="button" onClick={() => onEditBook(b)} disabled={isBusy}>
                                Редактировать
                              </button>
                              <button className="dangerBtn" type="button" onClick={() => void onDeleteBook(b.id)} disabled={isBusy}>
                                Удалить
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}

                      {filteredBooks.length === 0 && (
                        <tr>
                          <td style={tdStyle} colSpan={6}>
                            Ничего не найдено
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="row" style={{ marginTop: 12 }}>
                  <button className="btn" type="button" onClick={() => void loadBooks()} disabled={isBusy}>
                    Обновить список
                  </button>
                </div>
              </div>
            </>
          )}

          {tab === "analytics" && (
            <>
              <div className="panel" style={{ marginTop: 14 }}>
                <div className="panelTitle">Аналитика по эффективности литературного образования</div>
                <div className="muted" style={{ marginTop: 8 }}>
                  Раздел показывает, насколько активно используется платформа, как формируются профили читателей, какие книги чаще рекомендуются и наблюдается ли положительная динамика у учеников.
                </div>

                <div className="row" style={{ marginTop: 12 }}>
                  <button className="btn" onClick={() => void loadAnalytics()} disabled={analyticsLoading || isBusy}>
                    Обновить аналитику
                  </button>
                  {analyticsLoading && <span className="muted">Загрузка…</span>}
                </div>
              </div>

              <div className="statsGrid">
                <StatCard title="Всего пользователей" value={totals?.users} />
                <StatCard title="Активные пользователи" value={totals?.active_users} />
                <StatCard title="Доля активности, %" value={engagement?.active_share} />
                <StatCard title="Событий на пользователя" value={engagement?.avg_events_per_user} />
                <StatCard title="Анкет на ученика" value={engagement?.avg_tests_per_student} />
                <StatCard title="Текстов на ученика" value={engagement?.avg_texts_per_student} />
                <StatCard title="Пользователи с анкетами" value={engagement?.users_with_tests} />
                <StatCard title="Пользователи с текстами" value={engagement?.users_with_texts} />
                <StatCard title="С анкетой и текстом" value={engagement?.users_with_both} />
                <StatCard title="Без активности" value={engagement?.users_without_activity} />
                <StatCard title="Без профиля" value={engagement?.users_without_profile} />
                <StatCard title="Средний прирост профиля" value={effectiveness?.avg_profile_growth} />
              </div>

              <div className="analyticsGrid">
                <div className="panel">
                  <div className="panelTitle">Структура аудитории</div>

                  <div className="sourceList" style={{ marginTop: 12 }}>
                    <AnalyticsBar label="Ученики" value={totals?.students ?? 0} max={totals?.users ?? 0} />
                    <AnalyticsBar label="Родители" value={totals?.parents ?? 0} max={totals?.users ?? 0} />
                    <AnalyticsBar label="Учителя" value={totals?.teachers ?? 0} max={totals?.users ?? 0} />
                    <AnalyticsBar label="Администраторы" value={totals?.admins ?? 0} max={totals?.users ?? 0} />
                  </div>
                </div>

                <div className="panel">
                  <div className="panelTitle">Источники последних обновлений профиля</div>

                  {!analytics?.top_sources?.length ? (
                    <div className="muted" style={{ marginTop: 10 }}>Нет данных</div>
                  ) : (
                    <div className="sourceList">
                      {analytics.top_sources.map((s) => (
                        <AnalyticsBar
                          key={s.source}
                          label={friendlySourceName(s.source)}
                          value={s.c}
                          max={sourceMax || 1}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="analyticsGrid">
                <div className="panel">
                  <div className="panelTitle">Эффективность платформы</div>

                  <ul className="softList">
                    <li>
                      Учеников с достаточной историей: <b>{effectiveness?.students_with_enough_history ?? 0}</b>
                    </li>
                    <li>
                      С положительной динамикой: <b>{effectiveness?.students_with_progress ?? 0}</b>
                    </li>
                    <li>
                      Без заметной динамики: <b>{effectiveness?.students_without_progress ?? 0}</b>
                    </li>
                    <li>
                      С отрицательной динамикой: <b>{effectiveness?.students_with_regress ?? 0}</b>
                    </li>
                    <li>
                      Средний прирост профиля: <b>{effectiveness?.avg_profile_growth ?? 0}</b>
                    </li>
                  </ul>
                </div>

                <div className="panel">
                  <div className="panelTitle">Топ дефицитных концептов</div>

                  {!topConcepts.length ? (
                    <div className="muted" style={{ marginTop: 10 }}>Пока нет данных по дефицитам.</div>
                  ) : (
                    <div className="sourceList">
                      {topConcepts.map((c) => (
                        <AnalyticsBar
                          key={c.concept}
                          label={c.concept}
                          value={c.count}
                          max={conceptMax || 1}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="analyticsGrid">
                <div className="panel">
                  <div className="panelTitle">Концепты с наибольшим ростом</div>

                  {!effectiveness?.top_growth_concepts?.length ? (
                    <div className="muted" style={{ marginTop: 10 }}>Недостаточно данных для оценки динамики.</div>
                  ) : (
                    <div className="sourceList">
                      {effectiveness.top_growth_concepts.map((c) => (
                        <GrowthBar
                          key={c.concept}
                          label={c.concept}
                          value={c.avg_growth}
                          max={growthMax || 1}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div className="panel">
                  <div className="panelTitle">Концепты со слабой динамикой</div>

                  {!effectiveness?.weak_growth_concepts?.length ? (
                    <div className="muted" style={{ marginTop: 10 }}>Недостаточно данных для оценки динамики.</div>
                  ) : (
                    <div className="sourceList">
                      {effectiveness.weak_growth_concepts.map((c) => (
                        <GrowthBar
                          key={c.concept}
                          label={c.concept}
                          value={c.avg_growth}
                          max={weakGrowthMax || 1}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="analyticsGrid">
                <div className="panel">
                  <div className="panelTitle">Топ рекомендуемых книг</div>

                  {!topBooks.length ? (
                    <div className="muted" style={{ marginTop: 10 }}>Пока нет данных по рекомендациям.</div>
                  ) : (
                    <div className="sourceList">
                      {topBooks.map((b) => (
                        <AnalyticsBar
                          key={b.id}
                          label={`${b.title}${b.author ? ` — ${b.author}` : ""}`}
                          value={b.count}
                          max={bookMax || 1}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div className="panel">
                  <div className="panelTitle">Качество книжного фонда</div>

                  <ul className="softList">
                    <li>
                      Всего книг в CSV: <b>{libraryQuality?.books_total ?? 0}</b>
                    </li>
                    <li>
                      Книг без обложки: <b>{libraryQuality?.books_without_cover ?? 0}</b>
                    </li>
                    <li>
                      Книг без аннотации: <b>{libraryQuality?.books_without_annotation ?? 0}</b>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="analyticsGrid">
                <div className="panel">
                  <div className="panelTitle">Проблемные зоны</div>
                  <ul className="softList">
                    <li>
                      Пользователи без профиля: <b>{engagement?.users_without_profile ?? 0}</b>
                    </li>
                    <li>
                      Пользователи без активности: <b>{engagement?.users_without_activity ?? 0}</b>
                    </li>
                    <li>
                      Пользователи только с анкетами:{" "}
                      <b>{Math.max((engagement?.users_with_tests ?? 0) - (engagement?.users_with_both ?? 0), 0)}</b>
                    </li>
                    <li>
                      Пользователи только с текстами:{" "}
                      <b>{Math.max((engagement?.users_with_texts ?? 0) - (engagement?.users_with_both ?? 0), 0)}</b>
                    </li>
                    <li>
                      Пользователи с полным циклом взаимодействия: <b>{engagement?.users_with_both ?? 0}</b>
                    </li>
                  </ul>
                </div>

                <div className="panel">
                  <div className="panelTitle">Автоматические выводы</div>

                  {analyticsInsights.length === 0 ? (
                    <div className="muted" style={{ marginTop: 10 }}>
                      Пока недостаточно данных для содержательных выводов.
                    </div>
                  ) : (
                    <ul className="softList">
                      {analyticsInsights.map((tip, idx) => (
                        <li key={idx}>{tip}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}

          {tab === "profiles" && (
            <>
              <div className="profilesGrid">
                <div className="panel">
                  <div className="panelTop">
                    <div>
                      <div className="panelTitle">Пользователи и профили</div>
                      <div className="muted" style={{ marginTop: 6 }}>
                        Управление аккаунтами, ролями и образовательными профилями.
                      </div>
                    </div>

                    <label className="field" style={{ minWidth: 260 }}>
                      <span>Поиск</span>
                      <input value={userQuery} onChange={(e) => setUserQuery(e.target.value)} placeholder="по имени, email, роли" />
                    </label>
                  </div>

                  <div className="row" style={{ marginTop: 12 }}>
                    <button className="btn" onClick={() => void loadUsers()} disabled={usersLoading || isBusy}>
                      Обновить пользователей
                    </button>
                    {usersLoading && <span className="muted">Загрузка…</span>}
                  </div>

                  <div style={{ overflowX: "auto", marginTop: 12 }}>
                    <table style={{ width: "100%", minWidth: 920, borderCollapse: "separate", borderSpacing: 0 }}>
                      <thead>
                        <tr>
                          <th style={thStyle}>ID</th>
                          <th style={thStyle}>Имя</th>
                          <th style={thStyle}>Email</th>
                          <th style={thStyle}>Роль</th>
                          <th style={thStyle}>Создан</th>
                          <th style={{ ...thStyle, minWidth: 120 }}>Действия</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUsers.map((u) => (
                          <tr key={u.id}>
                            <td style={tdStyle}>{u.id}</td>
                            <td style={tdStyle}>{u.name}</td>
                            <td style={tdStyle}>{u.email}</td>
                            <td style={tdStyle}>
                              <span className="rolePill">{u.role}</span>
                            </td>
                            <td style={tdStyle}>{fmtDT(u.created_at)}</td>
                            <td style={tdStyle}>
                              <button className="btn" onClick={() => void loadUserDetails(u.id)} disabled={selectedUserLoading || isBusy}>
                                Открыть
                              </button>
                            </td>
                          </tr>
                        ))}

                        {filteredUsers.length === 0 && (
                          <tr>
                            <td style={tdStyle} colSpan={6}>
                              Пользователи не найдены
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="panel">
                  <div className="panelTitle">Карточка профиля</div>

                  {selectedUserLoading && <div className="muted" style={{ marginTop: 10 }}>Загрузка данных пользователя…</div>}

                  {!selectedUser && !selectedUserLoading && (
                    <div className="muted" style={{ marginTop: 10 }}>
                      Выбери пользователя из списка слева, чтобы открыть расширенную карточку.
                    </div>
                  )}

                  {selectedUser && !selectedUserLoading && (
                    <div className="userCard">
                      <div className="userTop">
                        <div className="userName">{selectedUser.name}</div>
                        <div className="rolePill">{selectedUser.role}</div>
                      </div>

                      <div className="userMeta">
                        <div><b>ID:</b> {selectedUser.id}</div>
                        <div><b>Email:</b> {selectedUser.email}</div>
                        <div><b>Создан:</b> {fmtDT(selectedUser.created_at)}</div>
                      </div>

                      <div className="subSectionTitle">Роль</div>
                      <div className="roleActions">
                        {(["student", "parent", "teacher", "admin"] as const).map((r) => (
                          <button
                            key={r}
                            className={`miniRoleBtn ${selectedUser.role === r ? "miniRoleBtnActive" : ""}`}
                            onClick={() => void onChangeUserRole(selectedUser.id, r)}
                            disabled={isBusy}
                          >
                            {r}
                          </button>
                        ))}
                      </div>

                      <div className="subSectionTitle">Профиль чтения</div>
                      <div className="profileBox">
                        {selectedUser.profile ? (
                          <>
                            <div><b>reader_id:</b> {selectedUser.profile.reader_id ?? "—"}</div>
                            <div><b>Возраст:</b> {selectedUser.profile.age ?? "—"}</div>
                            <div><b>updated_at:</b> {fmtDT(selectedUser.profile.updated_at)}</div>
                          </>
                        ) : (
                          <div className="muted">Профиль пока не создан.</div>
                        )}
                      </div>

                      <div className="subSectionTitle">Метаданные профиля</div>
                      <div className="profileBox">
                        {selectedUser.meta ? (
                          <>
                            <div><b>Тестов:</b> {selectedUser.meta.test_count ?? 0}</div>
                            <div><b>Текстов:</b> {selectedUser.meta.text_count ?? 0}</div>
                            <div><b>Последнее обновление:</b> {fmtDT(selectedUser.meta.last_update_at)}</div>
                            <div><b>Источник:</b> {selectedUser.meta.last_source ?? "—"}</div>
                            <div><b>Последняя анкета:</b> {fmtDT(selectedUser.meta.last_test_at)}</div>
                            <div><b>Последний текст:</b> {fmtDT(selectedUser.meta.last_text_at)}</div>
                          </>
                        ) : (
                          <div className="muted">Метаданные профиля отсутствуют.</div>
                        )}
                      </div>

                      <div className="subSectionTitle">Управление профилем</div>
                      <div className="dangerZone">
                        <button className="btn" onClick={() => void onResetProfile(selectedUser.id)} disabled={isBusy}>
                          Сбросить профиль
                        </button>
                        <button className="dangerBtn" onClick={() => void onDeleteUser(selectedUser.id)} disabled={isBusy}>
                          Удалить пользователя
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <StyleBlock />
    </div>
  );
}

function StatCard({ title, value }: { title: string; value?: number }) {
  return (
    <div className="statCard">
      <div className="statTitle">{title}</div>
      <div className="statValue">{typeof value === "number" ? value : "—"}</div>
    </div>
  );
}

function AnalyticsBar(props: { label: string; value: number; max: number }) {
  const pct = props.max > 0 ? Math.round((props.value / props.max) * 100) : 0;

  return (
    <div className="analyticsBarWrap">
      <div className="analyticsBarTop">
        <span>{props.label}</span>
        <span>
          <b>{props.value}</b> · {pct}%
        </span>
      </div>
      <div className="analyticsBarTrack">
        <div className="analyticsBarFill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function GrowthBar(props: { label: string; value: number; max: number }) {
  const safeMax = props.max > 0 ? props.max : 1;
  const pct = Math.min(100, Math.round((Math.abs(props.value) / safeMax) * 100));
  const isPositive = props.value >= 0;

  return (
    <div className="analyticsBarWrap">
      <div className="analyticsBarTop">
        <span>{props.label}</span>
        <span>
          <b>{props.value.toFixed(4)}</b>
        </span>
      </div>
      <div className="analyticsBarTrack">
        <div
          className={`growthBarFill ${isPositive ? "growthBarPositive" : "growthBarNegative"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StyleBlock() {
  return (
    <style>{`
      .page {
        min-height: 100vh;
        background: radial-gradient(1200px 500px at 20% 0%, rgba(100,140,255,.14), transparent),
                    radial-gradient(900px 400px at 80% 10%, rgba(80,200,170,.12), transparent),
                    #f6f7fb;
        padding: 20px 12px;
      }

      .shellWide {
        width: min(96vw, 1800px);
        margin: 0 auto;
      }

      .card {
        background: white;
        border-radius: 18px;
        box-shadow: 0 10px 28px rgba(0,0,0,.07);
        padding: 18px;
      }

      .headerRow {
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:14px;
      }

      .brandRow {
        display:flex;
        gap:12px;
        align-items:center;
      }

      .bookLogo {
        width: 44px;
        height: 44px;
        border-radius: 14px;
        border: 1px solid rgba(0,0,0,.08);
        display:flex;
        align-items:center;
        justify-content:center;
        background: rgba(255,255,255,.9);
      }

      .bookSvg {
        width: 34px;
        height: 34px;
      }

      .h1 {
        font-size: 28px;
        font-weight: 900;
        letter-spacing: .2px;
      }

      .muted {
        color: rgba(20,25,35,.65);
      }

      .tabsRow {
        display:flex;
        gap:10px;
        margin-top: 16px;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(0,0,0,.06);
        flex-wrap: wrap;
      }

      .tabBtn {
        border: 1px solid rgba(0,0,0,.10);
        background: #fff;
        border-radius: 999px;
        padding: 10px 16px;
        font-weight: 700;
        cursor: pointer;
      }

      .tabBtnActive {
        border-color: rgba(60,110,255,.55);
        background: rgba(60,110,255,.08);
        box-shadow: 0 0 0 3px rgba(60,110,255,.10);
      }

      .panel {
        border: 1px solid rgba(0,0,0,.08);
        border-radius: 16px;
        padding: 14px;
        background: rgba(255,255,255,.97);
      }

      .panelTop {
        display:flex;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        align-items:flex-end;
      }

      .panelTitle {
        font-weight: 900;
        letter-spacing: .2px;
      }

      .row {
        display:flex;
        gap:10px;
        align-items:center;
        flex-wrap: wrap;
      }

      .btn, .primaryBtn, .dangerBtn, .miniRoleBtn {
        border-radius: 12px;
        border: 1px solid rgba(0,0,0,.12);
        padding: 9px 12px;
        cursor: pointer;
        background: #fff;
        font-weight: 700;
      }

      .primaryBtn {
        border-color: rgba(60,110,255,.55);
        background: rgba(60,110,255,.10);
      }

      .dangerBtn {
        border-color: rgba(220,50,70,.28);
        background: rgba(220,50,70,.07);
        color: rgba(140,10,20,.95);
      }

      .btn:disabled, .primaryBtn:disabled, .dangerBtn:disabled, .miniRoleBtn:disabled {
        opacity: .6;
        cursor: default;
      }

      .actions {
        display:grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        margin-top: 12px;
      }

      .actionBtn {
        text-align:left;
        border-radius: 16px;
        border: 1px solid rgba(0,0,0,.10);
        background: #fff;
        padding: 12px;
        cursor:pointer;
      }

      .actionBtn:hover {
        box-shadow: 0 10px 22px rgba(0,0,0,.06);
      }

      .actionPrimary {
        border-color: rgba(60,110,255,.35);
        background: rgba(60,110,255,.06);
      }

      .actionTitle {
        font-weight: 900;
      }

      .actionHint {
        margin-top: 4px;
        color: rgba(20,25,35,.65);
        font-size: 13px;
      }

      .formGrid {
        margin-top: 12px;
        display:grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .field {
        display:grid;
        gap:6px;
      }

      .field span:first-child {
        font-size: 13px;
        font-weight: 750;
        color: rgba(20,25,35,.8);
      }

      .fieldHint {
        font-size: 12px;
        color: rgba(20,25,35,.55);
      }

      .field input,
      .field textarea {
        border: 1px solid rgba(0,0,0,.12);
        border-radius: 12px;
        padding: 10px 12px;
        font-size: 14px;
        outline: none;
        width: 100%;
      }

      .bigTextarea {
        resize: vertical;
      }

      .coverPreviewWrap {
        grid-column: 1 / -1;
        display:grid;
        grid-template-columns: 180px 1fr;
        gap: 14px;
        align-items:start;
      }

      .coverPreviewBox {
        width: 180px;
        height: 260px;
        border-radius: 16px;
        border: 1px solid rgba(0,0,0,.08);
        background: rgba(248,250,252,.9);
        display:flex;
        align-items:center;
        justify-content:center;
        overflow:hidden;
      }

      .coverPreviewImg {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .coverPreviewEmpty {
        color: rgba(20,25,35,.55);
        font-size: 13px;
        text-align:center;
        padding: 16px;
      }

      .coverMeta {
        display:grid;
        gap:10px;
      }

      .coverMetaLabel {
        font-size: 13px;
        font-weight: 800;
        color: rgba(20,25,35,.75);
      }

      .coverMetaPath {
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid rgba(0,0,0,.08);
        background: rgba(248,250,252,.8);
        color: rgba(20,25,35,.75);
        word-break: break-all;
        font-size: 13px;
      }

      .note {
        margin-top: 12px;
        padding: 10px 12px;
        border: 1px dashed rgba(60,110,255,.35);
        border-radius: 12px;
        background: rgba(60,110,255,.06);
      }

      .tableActions {
        display: flex;
        flex-direction: row;
        gap: 8px;
        align-items: center;
        white-space: nowrap;
      }

      .statsGrid {
        margin-top: 14px;
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
      }

      .statCard {
        border: 1px solid rgba(0,0,0,.08);
        border-radius: 16px;
        padding: 14px;
        background: #fff;
      }

      .statTitle {
        font-size: 13px;
        color: rgba(20,25,35,.65);
        font-weight: 700;
      }

      .statValue {
        margin-top: 8px;
        font-size: 28px;
        font-weight: 900;
        color: rgba(20,25,35,.92);
      }

      .analyticsGrid {
        margin-top: 14px;
        display: grid;
        grid-template-columns: 1.2fr .8fr;
        gap: 14px;
      }

      .softList {
        margin: 10px 0 0 18px;
        color: rgba(20,25,35,.80);
        line-height: 1.5;
      }

      .sourceList {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-top: 10px;
      }

      .analyticsBarWrap {
        display: grid;
        gap: 6px;
      }

      .analyticsBarTop {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        font-size: 14px;
        color: rgba(20,25,35,.82);
      }

      .analyticsBarTrack {
        height: 10px;
        border-radius: 999px;
        background: rgba(0,0,0,.06);
        overflow: hidden;
      }

      .analyticsBarFill {
        height: 100%;
        border-radius: 999px;
        background: linear-gradient(90deg, rgba(60,110,255,.75), rgba(80,200,170,.75));
      }

      .growthBarFill {
        height: 100%;
        border-radius: 999px;
      }

      .growthBarPositive {
        background: linear-gradient(90deg, rgba(0,180,120,.8), rgba(80,200,170,.8));
      }

      .growthBarNegative {
        background: linear-gradient(90deg, rgba(220,50,70,.75), rgba(255,140,0,.75));
      }

      .profilesGrid {
        margin-top: 14px;
        display: grid;
        grid-template-columns: 1.25fr .75fr;
        gap: 14px;
        align-items: start;
      }

      .rolePill {
        display: inline-flex;
        align-items: center;
        padding: 6px 10px;
        border-radius: 999px;
        border: 1px solid rgba(60,110,255,.20);
        background: rgba(60,110,255,.07);
        font-size: 12px;
        font-weight: 800;
      }

      .userCard {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-top: 10px;
      }

      .userTop {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
      }

      .userName {
        font-size: 22px;
        font-weight: 900;
      }

      .userMeta {
        display: grid;
        gap: 6px;
        padding: 12px;
        border-radius: 14px;
        border: 1px solid rgba(0,0,0,.08);
        background: rgba(248,250,252,.7);
      }

      .subSectionTitle {
        font-size: 13px;
        font-weight: 900;
        letter-spacing: .2px;
        color: rgba(20,25,35,.75);
      }

      .roleActions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .miniRoleBtn {
        border-radius: 999px;
        padding: 8px 12px;
      }

      .miniRoleBtnActive {
        border-color: rgba(60,110,255,.55);
        background: rgba(60,110,255,.10);
      }

      .profileBox {
        display: grid;
        gap: 6px;
        padding: 12px;
        border-radius: 14px;
        border: 1px solid rgba(0,0,0,.08);
        background: rgba(248,250,252,.7);
      }

      .dangerZone {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      @media (max-width: 1180px) {
        .statsGrid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .analyticsGrid,
        .profilesGrid {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 980px) {
        .actions {
          grid-template-columns: 1fr;
        }

        .formGrid {
          grid-template-columns: 1fr;
        }

        .coverPreviewWrap {
          grid-template-columns: 1fr;
        }

        .coverPreviewBox {
          width: 180px;
        }
      }
    `}</style>
  );
}