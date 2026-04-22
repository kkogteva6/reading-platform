// src/pages/dashboards/TeacherDashboard.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getUser, logout, roleHome } from "../../auth";
import {
  apiTeacherAddStudentToClass,
  apiTeacherCreateClass,
  apiTeacherDeleteClass,
  apiTeacherGetClassAnalytics,
  apiTeacherListClasses,
  apiTeacherListClassStudents,
  apiTeacherRemoveStudentFromClass,
  type TeacherClass,
  type TeacherClassAnalytics,
  type TeacherClassStudent,
} from "../../api/backend";

type TeacherTab = "classes" | "analytics" | "students";

type Status =
  | { kind: "idle" }
  | { kind: "loading"; text: string }
  | { kind: "ok"; text: string }
  | { kind: "error"; text: string };

type StudentTableRow = {
  student_id: string;
  student_name?: string | null;
  test_count: number;
  text_count: number;
  last_update_at?: string | null;
  last_source?: string | null;
  has_progress: boolean;
  avg_profile_growth: number;
};

function fmtDT(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

function friendlySourceName(source?: string | null) {
  if (!source) return "—";
  if (source === "test") return "Анкета";
  if (source === "text") return "Текст";
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

function normalizeStudentRow(s: Partial<StudentTableRow> & { student_id: string }): StudentTableRow {
  return {
    student_id: s.student_id,
    student_name: s.student_name ?? null,
    test_count: typeof s.test_count === "number" ? s.test_count : 0,
    text_count: typeof s.text_count === "number" ? s.text_count : 0,
    last_update_at: s.last_update_at ?? null,
    last_source: s.last_source ?? null,
    has_progress: Boolean(s.has_progress),
    avg_profile_growth:
      typeof s.avg_profile_growth === "number" ? s.avg_profile_growth : 0,
  };
}

export default function TeacherDashboard() {
  const nav = useNavigate();
  const user = getUser();

  const [tab, setTab] = useState<TeacherTab>("classes");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [classesLoading, setClassesLoading] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);

  const [newClassName, setNewClassName] = useState("");

  const [students, setStudents] = useState<TeacherClassStudent[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);

  const [newStudentId, setNewStudentId] = useState("");
  const [newStudentName, setNewStudentName] = useState("");

  const [analytics, setAnalytics] = useState<TeacherClassAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      nav("/login", { replace: true });
      return;
    }
    if (user.role !== "teacher") {
      nav(roleHome(user.role), { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isBusy =
    status.kind === "loading" || classesLoading || studentsLoading || analyticsLoading;

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId) ?? null,
    [classes, selectedClassId]
  );

  const deficitMax = useMemo(() => {
    const xs = analytics?.top_deficits?.map((x) => x.avg_gap) ?? [];
    return xs.length ? Math.max(...xs) : 0;
  }, [analytics]);

  const growthMax = useMemo(() => {
    const xs = analytics?.top_growth_concepts?.map((x) => Math.abs(x.avg_growth)) ?? [];
    return xs.length ? Math.max(...xs) : 0;
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

  async function loadClasses() {
    try {
      setClassesLoading(true);
      const data = await apiTeacherListClasses();
      const arr = Array.isArray(data) ? data : [];
      setClasses(arr);

      if (!selectedClassId && arr.length > 0) {
        setSelectedClassId(arr[0].id);
      } else if (selectedClassId && !arr.some((c) => c.id === selectedClassId)) {
        setSelectedClassId(arr.length ? arr[0].id : null);
      }
    } catch (e) {
      setErr(e);
    } finally {
      setClassesLoading(false);
    }
  }

  async function loadStudents(classId: number) {
    try {
      setStudentsLoading(true);
      const data = await apiTeacherListClassStudents(classId);
      setStudents(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e);
      setStudents([]);
    } finally {
      setStudentsLoading(false);
    }
  }

  async function loadAnalytics(classId: number) {
    try {
      setAnalyticsLoading(true);
      const data = await apiTeacherGetClassAnalytics(classId);
      setAnalytics(data);
    } catch (e) {
      setErr(e);
      setAnalytics(null);
    } finally {
      setAnalyticsLoading(false);
    }
  }

  async function refreshSelectedClass() {
    if (!selectedClassId) {
      setStudents([]);
      setAnalytics(null);
      return;
    }
    await Promise.all([loadStudents(selectedClassId), loadAnalytics(selectedClassId)]);
  }

  useEffect(() => {
    void loadClasses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void refreshSelectedClass();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClassId]);

  async function onCreateClass() {
    const name = newClassName.trim();
    if (!name) {
      setErr("Введите название класса");
      return;
    }

    try {
      setLoading("Создаю класс…");
      const created = await apiTeacherCreateClass(name);
      setNewClassName("");
      await loadClasses();
      setSelectedClassId(created.id);
      setOk("Класс создан");
      setTab("classes");
    } catch (e) {
      setErr(e);
    }
  }

  async function onDeleteClass(classId: number) {
    const cls = classes.find((c) => c.id === classId);
    const ok = window.confirm(`Удалить класс "${cls?.class_name ?? classId}"?`);
    if (!ok) return;

    try {
      setLoading("Удаляю класс…");
      await apiTeacherDeleteClass(classId);
      await loadClasses();
      setOk("Класс удалён");
    } catch (e) {
      setErr(e);
    }
  }

  async function onAddStudent() {
    if (!selectedClassId) {
      setErr("Сначала выбери класс");
      return;
    }

    const studentId = newStudentId.trim();
    const studentName = newStudentName.trim();

    if (!studentId) {
      setErr("Введите email или id ученика");
      return;
    }

    try {
      setLoading("Добавляю ученика в класс…");
      await apiTeacherAddStudentToClass(
        selectedClassId,
        studentId,
        studentName || undefined
      );
      setNewStudentId("");
      setNewStudentName("");
      await loadClasses();
      await refreshSelectedClass();
      setOk("Ученик добавлен в класс");
      setTab("students");
    } catch (e) {
      setErr(e);
    }
  }

  async function onRemoveStudent(studentId: string) {
    if (!selectedClassId) return;

    const ok = window.confirm(`Удалить ученика "${studentId}" из класса?`);
    if (!ok) return;

    try {
      setLoading("Удаляю ученика из класса…");
      await apiTeacherRemoveStudentFromClass(selectedClassId, studentId);
      await loadClasses();
      await refreshSelectedClass();
      setOk("Ученик удалён из класса");
    } catch (e) {
      setErr(e);
    }
  }

  const classInsights = useMemo(() => {
    const tips: string[] = [];
    if (!analytics) return tips;

    if (analytics.students_count === 0) {
      tips.push("В выбранном классе пока нет учеников.");
      return tips;
    }

    if (analytics.active_students < analytics.students_count) {
      tips.push(
        "Не все ученики проявляют активность - части класса может потребоваться дополнительное сопровождение."
      );
    }

    if (analytics.with_both > 0) {
      tips.push(
        "Есть ученики, которые и проходят анкету, и загружают тексты - это наиболее полный формат работы с платформой."
      );
    }

    if (analytics.with_progress > 0) {
      tips.push("У части учащихся уже наблюдается положительная динамика профиля.");
    }

    if ((analytics.avg_profile_growth ?? 0) <= 0) {
      tips.push(
        "Средняя динамика профиля пока слабая - возможно, классу нужно больше текстовой практики и повторных взаимодействий."
      );
    }

    if ((analytics.top_deficits?.length ?? 0) > 0) {
      tips.push(
        "Есть общие дефицитные темы у класса - их можно использовать как ориентир для педагогической работы."
      );
    }

    return tips;
  }, [analytics]);

  const studentsForTable = useMemo<StudentTableRow[]>(() => {
    const analyticsStudentsRaw = (analytics?.students ?? []) as Array<
      Partial<StudentTableRow> & { student_id: string }
    >;

    if (analyticsStudentsRaw.length > 0) {
      return analyticsStudentsRaw.map(normalizeStudentRow);
    }

    const basicStudentsRaw = (students ?? []) as Array<
      Partial<StudentTableRow> & { student_id: string }
    >;

    return basicStudentsRaw.map(normalizeStudentRow);
  }, [analytics?.students, students]);

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
                  <line
                    x1="32"
                    y1="18"
                    x2="32"
                    y2="52"
                    stroke="rgba(20,25,35,.55)"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>

              <div>
                <div className="h1">Кабинет учителя</div>
                <div className="muted">
                  Классы, динамика развития учащихся и аналитика по группе.
                </div>
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
            <button
              className={`tabBtn ${tab === "classes" ? "tabBtnActive" : ""}`}
              onClick={() => setTab("classes")}
              type="button"
            >
              Классы
            </button>
            <button
              className={`tabBtn ${tab === "analytics" ? "tabBtnActive" : ""}`}
              onClick={() => setTab("analytics")}
              type="button"
            >
              Аналитика класса
            </button>
            <button
              className={`tabBtn ${tab === "students" ? "tabBtnActive" : ""}`}
              onClick={() => setTab("students")}
              type="button"
            >
              Ученики
            </button>
          </div>

          {status.kind !== "idle" && <div style={statusBoxStyle(status)}>{status.text}</div>}

          <div className="classBar">
            <div className="classBarLeft">
              <div className="labelSmall">Текущий класс</div>
              <div className="classChips">
                {classesLoading ? (
                  <span className="muted">Загрузка классов…</span>
                ) : classes.length === 0 ? (
                  <span className="muted">Классов пока нет</span>
                ) : (
                  classes.map((c) => (
                    <button
                      key={c.id}
                      className={`classChip ${selectedClassId === c.id ? "classChipActive" : ""}`}
                      onClick={() => setSelectedClassId(c.id)}
                      type="button"
                    >
                      {c.class_name}
                      <span className="classChipCount">{c.students_count ?? 0}</span>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="classBarRight">
              <div className="miniCard">
                <div className="miniTitle">Выбранный класс</div>
                <div className="miniValue">{selectedClass?.class_name ?? "—"}</div>
              </div>
              <div className="miniCard">
                <div className="miniTitle">Учеников</div>
                <div className="miniValue">
                  {analytics?.students_count ?? selectedClass?.students_count ?? 0}
                </div>
              </div>
            </div>
          </div>

          {tab === "classes" && (
            <>
              <div className="panel" style={{ marginTop: 14 }}>
                <div className="panelTitle">Создать класс</div>

                <div className="row" style={{ marginTop: 12 }}>
                  <input
                    className="input"
                    value={newClassName}
                    onChange={(e) => setNewClassName(e.target.value)}
                    placeholder="Например: 8А"
                  />
                  <button
                    className="primaryBtn"
                    onClick={() => void onCreateClass()}
                    disabled={isBusy}
                    type="button"
                  >
                    Создать
                  </button>
                  <button
                    className="btn"
                    onClick={() => void loadClasses()}
                    disabled={isBusy}
                    type="button"
                  >
                    Обновить список
                  </button>
                </div>
              </div>

              <div className="panel" style={{ marginTop: 14 }}>
                <div className="panelTop">
                  <div>
                    <div className="panelTitle">Список классов</div>
                    <div className="muted" style={{ marginTop: 6 }}>
                      Всего классов: <b>{classes.length}</b>
                    </div>
                  </div>
                </div>

                <div style={{ overflowX: "auto", marginTop: 12 }}>
                  <table
                    style={{
                      width: "100%",
                      minWidth: 760,
                      borderCollapse: "separate",
                      borderSpacing: 0,
                    }}
                  >
                    <thead>
                      <tr>
                        <th style={thStyle}>ID</th>
                        <th style={thStyle}>Название</th>
                        <th style={thStyle}>Учеников</th>
                        <th style={thStyle}>Создан</th>
                        <th style={{ ...thStyle, minWidth: 220 }}>Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {classes.map((c) => (
                        <tr key={c.id}>
                          <td style={tdStyle}>{c.id}</td>
                          <td style={tdStyle}>{c.class_name}</td>
                          <td style={tdStyle}>{c.students_count ?? 0}</td>
                          <td style={tdStyle}>{fmtDT(c.created_at)}</td>
                          <td style={tdStyle}>
                            <div className="tableActions">
                              <button
                                className="btn"
                                onClick={() => {
                                  setSelectedClassId(c.id);
                                  setTab("analytics");
                                }}
                                type="button"
                              >
                                Открыть
                              </button>
                              <button
                                className="dangerBtn"
                                onClick={() => void onDeleteClass(c.id)}
                                disabled={isBusy}
                                type="button"
                              >
                                Удалить
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}

                      {classes.length === 0 && (
                        <tr>
                          <td style={tdStyle} colSpan={5}>
                            Классов пока нет
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {tab === "analytics" && (
            <>
              <div className="panel" style={{ marginTop: 14 }}>
                <div className="panelTitle">Дашборд класса</div>
                <div className="muted" style={{ marginTop: 8 }}>
                  Сводная аналитика по активности и динамике развития учащихся выбранного
                  класса.
                </div>

                <div className="row" style={{ marginTop: 12 }}>
                  <button
                    className="btn"
                    onClick={() => void refreshSelectedClass()}
                    disabled={!selectedClassId || isBusy}
                    type="button"
                  >
                    Обновить аналитику
                  </button>
                  {analyticsLoading && <span className="muted">Загрузка…</span>}
                </div>
              </div>

              {!selectedClassId ? (
                <div className="panel" style={{ marginTop: 14 }}>
                  <div className="muted">Сначала создай или выбери класс.</div>
                </div>
              ) : (
                <>
                  <div className="statsGrid">
                    <StatCard title="Учеников в классе" value={analytics?.students_count} />
                    <StatCard title="Активные ученики" value={analytics?.active_students} />
                    <StatCard title="С анкетами" value={analytics?.with_tests} />
                    <StatCard title="С текстами" value={analytics?.with_texts} />
                    <StatCard title="Полный цикл" value={analytics?.with_both} />
                    <StatCard title="С прогрессом" value={analytics?.with_progress} />
                    <StatCard
                      title="Средний прирост профиля"
                      value={analytics?.avg_profile_growth}
                    />
                  </div>

                  <div className="analyticsGrid">
                    <div className="panel">
                      <div className="panelTitle">Топ дефицитных тем класса</div>

                      {!analytics?.top_deficits?.length ? (
                        <div className="muted" style={{ marginTop: 10 }}>
                          Пока нет данных.
                        </div>
                      ) : (
                        <div className="sourceList">
                          {analytics.top_deficits.map((d) => (
                            <AnalyticsBar
                              key={d.concept}
                              label={d.concept}
                              value={d.avg_gap}
                              max={deficitMax || 1}
                              valueFormatter={(v) => v.toFixed(3)}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="panel">
                      <div className="panelTitle">Темы с наибольшим ростом</div>

                      {!analytics?.top_growth_concepts?.length ? (
                        <div className="muted" style={{ marginTop: 10 }}>
                          Пока нет данных.
                        </div>
                      ) : (
                        <div className="sourceList">
                          {analytics.top_growth_concepts.map((g) => (
                            <AnalyticsBar
                              key={g.concept}
                              label={g.concept}
                              value={g.avg_growth}
                              max={growthMax || 1}
                              valueFormatter={(v) => v.toFixed(3)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="panel" style={{ marginTop: 14 }}>
                    <div className="panelTitle">Педагогические выводы</div>

                    {classInsights.length === 0 ? (
                      <div className="muted" style={{ marginTop: 10 }}>
                        Пока недостаточно данных для выводов.
                      </div>
                    ) : (
                      <ul className="softList">
                        {classInsights.map((tip, idx) => (
                          <li key={idx}>{tip}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {tab === "students" && (
            <>
              <div className="panel" style={{ marginTop: 14 }}>
                <div className="panelTitle">Добавить ученика в класс</div>

                <div className="formGrid">
                  <label className="field">
                    <span>Email / ID ученика</span>
                    <input
                      value={newStudentId}
                      onChange={(e) => setNewStudentId(e.target.value)}
                      placeholder="student@test.ru"
                    />
                  </label>

                  <label className="field">
                    <span>Имя ученика (необязательно)</span>
                    <input
                      value={newStudentName}
                      onChange={(e) => setNewStudentName(e.target.value)}
                      placeholder="Иванов Иван"
                    />
                  </label>
                </div>

                <div className="row" style={{ marginTop: 12 }}>
                  <button
                    className="primaryBtn"
                    onClick={() => void onAddStudent()}
                    disabled={!selectedClassId || isBusy}
                    type="button"
                  >
                    Добавить ученика
                  </button>
                  <button
                    className="btn"
                    onClick={() => void refreshSelectedClass()}
                    disabled={!selectedClassId || isBusy}
                    type="button"
                  >
                    Обновить
                  </button>
                </div>
              </div>

              <div className="panel" style={{ marginTop: 14 }}>
                <div className="panelTop">
                  <div>
                    <div className="panelTitle">Ученики выбранного класса</div>
                    <div className="muted" style={{ marginTop: 6 }}>
                      Класс: <b>{selectedClass?.class_name ?? "—"}</b>
                    </div>
                  </div>
                </div>

                {!selectedClassId ? (
                  <div className="muted" style={{ marginTop: 10 }}>
                    Сначала выбери класс.
                  </div>
                ) : (
                  <div style={{ overflowX: "auto", marginTop: 12 }}>
                    <table
                      style={{
                        width: "100%",
                        minWidth: 1180,
                        borderCollapse: "separate",
                        borderSpacing: 0,
                      }}
                    >
                      <thead>
                        <tr>
                          <th style={thStyle}>Ученик</th>
                          <th style={thStyle}>ID / Email</th>
                          <th style={thStyle}>Анкеты</th>
                          <th style={thStyle}>Тексты</th>
                          <th style={thStyle}>Последняя активность</th>
                          <th style={thStyle}>Источник</th>
                          <th style={thStyle}>Прогресс</th>
                          <th style={thStyle}>Средний прирост</th>
                          <th style={{ ...thStyle, minWidth: 220 }}>Действия</th>
                        </tr>
                      </thead>
                      <tbody>
                        {studentsForTable.map((s) => (
                          <tr key={s.student_id}>
                            <td style={tdStyle}>{s.student_name || "—"}</td>
                            <td style={tdStyle}>{s.student_id}</td>
                            <td style={tdStyle}>{s.test_count}</td>
                            <td style={tdStyle}>{s.text_count}</td>
                            <td style={tdStyle}>{fmtDT(s.last_update_at)}</td>
                            <td style={tdStyle}>{friendlySourceName(s.last_source)}</td>
                            <td style={tdStyle}>
                              <span
                                className={`progressPill ${
                                  s.has_progress ? "progressPillOk" : "progressPillMuted"
                                }`}
                              >
                                {s.has_progress ? "Есть рост" : "Нет роста"}
                              </span>
                            </td>
                            <td style={tdStyle}>{s.avg_profile_growth.toFixed(4)}</td>
                            <td style={tdStyle}>
                              <div className="tableActions">
                                <button
                                  className="btn"
                                  onClick={() =>
                                    nav(`/teacher/student/${encodeURIComponent(s.student_id)}`)
                                  }
                                  type="button"
                                >
                                  Открыть
                                </button>

                                <button
                                  className="dangerBtn"
                                  onClick={() => void onRemoveStudent(s.student_id)}
                                  disabled={isBusy}
                                  type="button"
                                >
                                  Удалить
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}

                        {selectedClassId && studentsForTable.length === 0 && (
                          <tr>
                            <td style={tdStyle} colSpan={9}>
                              В этом классе пока нет учеников.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
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

function AnalyticsBar(props: {
  label: string;
  value: number;
  max: number;
  valueFormatter?: (v: number) => string;
}) {
  const pct = props.max > 0 ? Math.round((Math.abs(props.value) / props.max) * 100) : 0;

  return (
    <div className="analyticsBarWrap">
      <div className="analyticsBarTop">
        <span>{props.label}</span>
        <span>
          <b>{props.valueFormatter ? props.valueFormatter(props.value) : props.value}</b>
        </span>
      </div>
      <div className="analyticsBarTrack">
        <div className="analyticsBarFill" style={{ width: `${pct}%` }} />
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
        width: min(96vw, 1700px);
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

      .btn, .primaryBtn, .dangerBtn, .classChip {
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

      .btn:disabled, .primaryBtn:disabled, .dangerBtn:disabled {
        opacity: .6;
        cursor: default;
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

      .input, .field input {
        border: 1px solid rgba(0,0,0,.12);
        border-radius: 12px;
        padding: 10px 12px;
        font-size: 14px;
        outline: none;
        width: 100%;
        background: #fff;
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

      .field span:first-child, .labelSmall {
        font-size: 13px;
        font-weight: 750;
        color: rgba(20,25,35,.8);
      }

      .note {
        margin-top: 12px;
        padding: 10px 12px;
        border: 1px dashed rgba(60,110,255,.35);
        border-radius: 12px;
        background: rgba(60,110,255,.06);
      }

      .classBar {
        margin-top: 14px;
        border: 1px solid rgba(0,0,0,.08);
        border-radius: 16px;
        padding: 12px;
        display:flex;
        justify-content: space-between;
        gap: 14px;
        background: rgba(255,255,255,.95);
      }

      .classBarLeft {
        flex: 1;
        min-width: 320px;
      }

      .classChips {
        display:flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 8px;
      }

      .classChip {
        border-radius: 999px;
        display:flex;
        align-items:center;
        gap: 8px;
      }

      .classChipActive {
        border-color: rgba(60,110,255,.55);
        background: rgba(60,110,255,.08);
        box-shadow: 0 0 0 3px rgba(60,110,255,.10);
      }

      .classChipCount {
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-width: 24px;
        height: 24px;
        border-radius: 999px;
        background: rgba(0,0,0,.06);
        font-size: 12px;
      }

      .classBarRight {
        display:flex;
        gap:10px;
        align-items: stretch;
      }

      .miniCard {
        border: 1px solid rgba(0,0,0,.08);
        border-radius: 14px;
        padding: 10px 12px;
        background: #fff;
        min-width: 160px;
      }

      .miniTitle {
        font-size: 12px;
        color: rgba(20,25,35,.65);
        font-weight: 700;
      }

      .miniValue {
        margin-top: 6px;
        font-size: 18px;
        font-weight: 850;
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
        grid-template-columns: 1fr 1fr;
        gap: 14px;
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

      .softList {
        margin: 10px 0 0 18px;
        color: rgba(20,25,35,.80);
        line-height: 1.5;
      }

      .tableActions {
        display:flex;
        gap:8px;
        align-items:center;
        flex-wrap: wrap;
      }

      .progressPill {
        display:inline-flex;
        align-items:center;
        padding: 6px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 800;
      }

      .progressPillOk {
        border: 1px solid rgba(0,180,120,.22);
        background: rgba(0,180,120,.08);
        color: rgba(10,80,40,.95);
      }

      .progressPillMuted {
        border: 1px solid rgba(0,0,0,.10);
        background: rgba(0,0,0,.04);
        color: rgba(20,25,35,.72);
      }

      @media (max-width: 1180px) {
        .statsGrid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .analyticsGrid {
          grid-template-columns: 1fr;
        }

        .classBar {
          flex-direction: column;
        }

        .classBarRight {
          justify-content: flex-start;
          flex-wrap: wrap;
        }
      }

      @media (max-width: 980px) {
        .formGrid {
          grid-template-columns: 1fr;
        }
      }
    `}</style>
  );
}