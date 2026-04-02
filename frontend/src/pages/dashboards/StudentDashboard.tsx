import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearUser, getUser } from "../../auth";
import {
  apiAnalyzeTextMe,
  apiApplyTestMe,
  apiGetGaps,
  apiGetMyProfile,
  apiGetProfileGrowth,
  apiGetProfileHistory,
  apiGetProfileMeta,
  apiGetRecommendationsExplain,
  apiGetMyAccount,
  apiUpdateMyAccount,
  apiStudentAddReadBook,
  apiStudentDeleteReadBook,
  apiStudentListReadBooks,
  apiUpsertMyProfile,
  type ExplainedRecommendation,
  type GapSummaryItem,
  type ProfileEvent,
  type ProfileMeta,
  type ReadBookItem,
  type ReaderProfile,
  type AccountInfo,
  type ProfileGrowth,
} from "../../api/backend";
import { toBackendUrl } from "../../config/backend";

type TabKey = "account" | "texts" | "test" | "results" | "read";

type UserTextItem = {
  id: string;
  title: string;
  text: string;
  created_at: string;
};

const LS_USER_TEXTS_KEY = "rp_user_texts_v1";

/* ---------------- utils ---------------- */

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function safeEntries(obj: any): [string, number][] {
  if (!obj || typeof obj !== "object") return [];
  return Object.entries(obj)
    .map(([k, v]) => [k, Number(v)] as [string, number])
    .filter(([, v]) => Number.isFinite(v));
}

function topConcepts(concepts: Record<string, number> | undefined, n = 10) {
  const arr = safeEntries(concepts);
  arr.sort((a, b) => b[1] - a[1]);
  return arr.slice(0, n);
}

function fmt01(x: number) {
  return Number.isFinite(x) ? x.toFixed(2) : "0.00";
}

function fmtDT(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

function friendlySource(s: string | null | undefined) {
  if (!s) return "—";
  if (s === "test") return "Анкета";
  if (s === "text") return "Текст";
  if (s === "manual") return "Вручную";
  if (s === "book_review") return "Отзыв на книгу";
  return s;
}

function loadUserTexts(readerId: string): UserTextItem[] {
  try {
    const raw = localStorage.getItem(`${LS_USER_TEXTS_KEY}_${readerId}`);
    const arr = JSON.parse(raw ?? "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveUserTexts(readerId: string, items: UserTextItem[]) {
  localStorage.setItem(`${LS_USER_TEXTS_KEY}_${readerId}`, JSON.stringify(items));
}

function makeTextId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

function starsLabel(n?: number | null) {
  const v = Number(n || 0);
  if (v <= 0) return "—";
  return "★".repeat(v) + "☆".repeat(5 - v);
}

function resolveReaderId(user: any): string {
  const possible = [user?.reader_id, user?.id, user?.user_id, user?.profile_id, user?.sub];
  for (const v of possible) {
    if (v !== undefined && v !== null && String(v).trim()) {
      return String(v).trim();
    }
  }
  return "";
}

/* ---------------- main ---------------- */

export default function StudentDashboard() {
  const nav = useNavigate();
  const user = getUser();
  const readerId = resolveReaderId(user);

  useEffect(() => {
    if (!user) nav("/login");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [tab, setTab] = useState<TabKey>("results");

  // account
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountMsg, setAccountMsg] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState({
    full_name: "",
    city: "",
    school: "",
    class_name: "",
    avatar_url: "",
    reading_age: "16+",
  });

  // profile
  const [profile, setProfile] = useState<ReaderProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileErr, setProfileErr] = useState<string | null>(null);

  // growth analytics
  const [growth, setGrowth] = useState<ProfileGrowth | null>(null);
  const [growthLoading, setGrowthLoading] = useState(false);
  const [growthErr, setGrowthErr] = useState<string | null>(null);

  // gaps
  const [gaps, setGaps] = useState<GapSummaryItem[]>([]);
  const [gapsLoading, setGapsLoading] = useState(false);
  const [gapsErr, setGapsErr] = useState<string | null>(null);

  // recs
  const [recs, setRecs] = useState<ExplainedRecommendation[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const [recsErr, setRecsErr] = useState<string | null>(null);

  // meta/history
  const [meta, setMeta] = useState<ProfileMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaErr, setMetaErr] = useState<string | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<ProfileEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyErr, setHistoryErr] = useState<string | null>(null);

  // texts
  const [textTitle, setTextTitle] = useState("");
  const [textBody, setTextBody] = useState("");
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [analyzeMsg, setAnalyzeMsg] = useState<string | null>(null);

  const [userTexts, setUserTexts] = useState<UserTextItem[]>([]);
  const [openedText, setOpenedText] = useState<UserTextItem | null>(null);

  // read books
  const [readBooks, setReadBooks] = useState<ReadBookItem[]>([]);
  const [readBooksLoading, setReadBooksLoading] = useState(false);
  const [readBooksMsg, setReadBooksMsg] = useState<string | null>(null);
  const [openedReadBook, setOpenedReadBook] = useState<ReadBookItem | null>(null);

  const [markReadOpen, setMarkReadOpen] = useState<ExplainedRecommendation | null>(null);
  const [readRating, setReadRating] = useState(5);
  const [readImpression, setReadImpression] = useState("");
  const [saveReadLoading, setSaveReadLoading] = useState(false);

  // book details
  const [openedBook, setOpenedBook] = useState<ExplainedRecommendation | null>(null);

  // test
  const [submitTestLoading, setSubmitTestLoading] = useState(false);
  const [submitTestMsg, setSubmitTestMsg] = useState<string | null>(null);

  const age = profile?.age ?? "16+";

  useEffect(() => {
    if (!readerId) return;
    setUserTexts(loadUserTexts(readerId));
  }, [readerId]);

  useEffect(() => {
    if (!profile?.age) return;
    setAccountForm((prev) => ({
      ...prev,
      reading_age: profile.age || "16+",
    }));
  }, [profile?.age]);

  async function ensureMyProfile(): Promise<ReaderProfile> {
    try {
      const p = await apiGetMyProfile();

      if (!p.age) {
        const fixed = await apiUpsertMyProfile({ ...p, age: "16+" });
        return fixed;
      }
      if (!p.concepts) {
        const fixed = await apiUpsertMyProfile({ ...p, concepts: {} });
        return fixed;
      }
      return p;
    } catch {
      const created = await apiUpsertMyProfile({
        id: readerId || "me",
        age: "16+",
        concepts: {},
      });
      return created;
    }
  }

  async function loadAccount() {
    setAccountLoading(true);
    setAccountMsg(null);
    try {
      const data = await apiGetMyAccount();
      setAccount(data);
      setAccountForm((prev) => ({
        ...prev,
        full_name: data.full_name || "",
        city: data.city || "",
        school: data.school || "",
        class_name: data.class_name || "",
        avatar_url: data.avatar_url || "",
      }));
    } catch (e: any) {
      setAccount(null);
      setAccountMsg(e?.message ?? "Не удалось загрузить личный кабинет");
    } finally {
      setAccountLoading(false);
    }
  }

  async function saveAccount() {
    setAccountLoading(true);
    setAccountMsg(null);

    try {
      const updated = await apiUpdateMyAccount({
        full_name: accountForm.full_name,
        city: accountForm.city,
        school: accountForm.school,
        class_name: accountForm.class_name,
        avatar_url: accountForm.avatar_url,
      });

      setAccount(updated);

      const currentProfile = await ensureMyProfile();
      const newAge = accountForm.reading_age || currentProfile.age || "16+";

      if (currentProfile.age !== newAge) {
        const updatedProfile = await apiUpsertMyProfile({
          ...currentProfile,
          age: newAge,
        });
        setProfile(updatedProfile);
      }

      setAccountMsg("Профиль сохранён.");
      await refreshAll({ withHistory: historyOpen });
    } catch (e: any) {
      setAccountMsg(e?.message ?? "Не удалось сохранить профиль");
    } finally {
      setAccountLoading(false);
    }
  }

  async function loadProfile() {
    setProfileErr(null);
    setProfileLoading(true);
    try {
      const p = await ensureMyProfile();
      setProfile(p);
    } catch (e: any) {
      setProfile(null);
      setProfileErr(e?.message ?? "Не удалось получить профиль");
    } finally {
      setProfileLoading(false);
    }
  }

  async function loadGrowth() {
    setGrowthLoading(true);
    setGrowthErr(null);
    try {
      if (!readerId) throw new Error("Нет reader_id");
      const g = await apiGetProfileGrowth(readerId);
      setGrowth(g);
    } catch (e: any) {
      setGrowth(null);
      setGrowthErr(e?.message ?? "Не удалось загрузить аналитику роста");
    } finally {
      setGrowthLoading(false);
    }
  }

  async function loadGaps() {
    setGapsErr(null);
    setGapsLoading(true);
    try {
      if (!readerId) throw new Error("Нет reader_id — перезайди через логин.");
      const list = await apiGetGaps(readerId);
      setGaps(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setGaps([]);
      setGapsErr(e?.message ?? "Не удалось получить темы для развития");
    } finally {
      setGapsLoading(false);
    }
  }

  async function loadRecommendations() {
    setRecsErr(null);
    setRecsLoading(true);
    try {
      if (!readerId) throw new Error("Нет reader_id — перезайди через логин.");
      const list = await apiGetRecommendationsExplain(readerId, 5, 0);
      setRecs(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setRecs([]);
      setRecsErr(e?.message ?? "Не удалось получить рекомендации");
    } finally {
      setRecsLoading(false);
    }
  }

  async function loadMeta() {
    setMetaErr(null);
    setMetaLoading(true);
    try {
      if (!readerId) throw new Error("Нет reader_id — перезайди через логин.");
      const m = await apiGetProfileMeta(readerId);
      setMeta(m);
    } catch (e: any) {
      setMeta(null);
      setMetaErr(e?.message ?? "Не удалось получить метаданные");
    } finally {
      setMetaLoading(false);
    }
  }

  async function loadHistory(limit = 20) {
    setHistoryErr(null);
    setHistoryLoading(true);
    try {
      if (!readerId) throw new Error("Нет reader_id — перезайди через логин.");
      const h = await apiGetProfileHistory(readerId, limit);
      const arr = Array.isArray(h) ? h : [];
      arr.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      setHistory(arr);
    } catch (e: any) {
      setHistory([]);
      setHistoryErr(e?.message ?? "Не удалось получить историю");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function loadReadBooks() {
    setReadBooksLoading(true);
    setReadBooksMsg(null);
    try {
      const arr = await apiStudentListReadBooks();
      setReadBooks(Array.isArray(arr) ? arr : []);
    } catch (e: any) {
      setReadBooks([]);
      setReadBooksMsg(e?.message ?? "Не удалось загрузить прочитанные книги");
    } finally {
      setReadBooksLoading(false);
    }
  }

  async function refreshAll(opts?: { withHistory?: boolean }) {
    await loadAccount();
    await loadProfile();
    await loadGrowth();
    await loadGaps();
    await loadRecommendations();
    await loadMeta();
    await loadReadBooks();
    if (opts?.withHistory || historyOpen) await loadHistory(20);
  }

  useEffect(() => {
    void refreshAll({ withHistory: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readerId]);

  async function onLogout() {
    clearUser();
    nav("/");
  }

  async function onAnalyzeText() {
    setAnalyzeMsg(null);
    const body = textBody.trim();

    if (body.length < 30) {
      setAnalyzeMsg("Текст слишком короткий (минимум ~30 символов).");
      return;
    }

    setAnalyzeLoading(true);
    try {
      await apiAnalyzeTextMe(body);

      const newItem: UserTextItem = {
        id: makeTextId(),
        title: textTitle.trim() || `Текст от ${new Date().toLocaleDateString()}`,
        text: body,
        created_at: new Date().toISOString(),
      };

      const nextTexts = [newItem, ...userTexts];
      setUserTexts(nextTexts);
      if (readerId) saveUserTexts(readerId, nextTexts);

      setAnalyzeMsg("Текст проанализирован. Профиль обновлён.");
      setTextTitle("");
      setTextBody("");
      await refreshAll({ withHistory: true });
      setTab("results");
    } catch (e: any) {
      setAnalyzeMsg(e?.message ?? "Ошибка анализа текста");
    } finally {
      setAnalyzeLoading(false);
    }
  }

  async function onSubmitTestWithConcepts01(test01: Record<string, number>) {
    setSubmitTestMsg(null);
    setSubmitTestLoading(true);

    try {
      const updated = await apiApplyTestMe({
        age,
        test_concepts: test01,
      });

      setProfile(updated);
      setSubmitTestMsg("Анкета сохранена. Профиль обновлён.");
      await refreshAll({ withHistory: true });
      setTab("results");
    } catch (e: any) {
      setSubmitTestMsg(e?.message ?? "Ошибка сохранения анкеты");
    } finally {
      setSubmitTestLoading(false);
    }
  }

  async function onSaveReadBook() {
    if (!markReadOpen) return;

    setSaveReadLoading(true);
    setReadBooksMsg(null);

    try {
      await apiStudentAddReadBook({
        work_id: String(markReadOpen.work.id),
        title: markReadOpen.work.title,
        author: markReadOpen.work.author,
        age: markReadOpen.work.age,
        rating: readRating,
        impression_text: readImpression.trim() || undefined,
      });

      setMarkReadOpen(null);
      setReadRating(5);
      setReadImpression("");
      setReadBooksMsg("Книга добавлена в прочитанные.");
      await refreshAll({ withHistory: true });
      setTab("read");
    } catch (e: any) {
      setReadBooksMsg(e?.message ?? "Не удалось сохранить книгу");
    } finally {
      setSaveReadLoading(false);
    }
  }

  async function onDeleteReadBook(id: number) {
    const ok = window.confirm("Удалить книгу из прочитанных?");
    if (!ok) return;

    try {
      await apiStudentDeleteReadBook(id);
      await refreshAll({ withHistory: true });
    } catch (e: any) {
      setReadBooksMsg(e?.message ?? "Не удалось удалить книгу");
    }
  }

  const top = useMemo(() => topConcepts(profile?.concepts, 10), [profile]);

  const growthTopicsTop = useMemo(() => {
    return (gaps ?? []).filter((g) => g.direction === "below" && g.gap > 0).slice(0, 5);
  }, [gaps]);

  const strengthsTop = useMemo(() => {
    return (gaps ?? []).filter((g) => g.direction === "above" && g.gap < 0).slice(0, 3);
  }, [gaps]);

  const growthTopicsHint = useMemo(() => {
    return "Темы для развития — это ценности, которые пока выражены слабее целевого уровня для возраста. Рекомендации подбираются так, чтобы помочь постепенно развивать эти темы. Если таких тем почти нет, система предлагает книги для углубления уже сильных сторон.";
  }, []);

  const maxScore = useMemo(() => {
    const xs = (recs ?? [])
      .map((r) => Number(r?.why?.score ?? 0))
      .filter((x) => Number.isFinite(x) && x > 0);
    return xs.length ? Math.max(...xs) : 0;
  }, [recs]);

  const conceptMapItems = useMemo(() => {
    const conceptValues = new Map<string, { value: number; gap?: number; direction?: "below" | "above" }>();

    for (const [name, value] of safeEntries(profile?.concepts ?? {})) {
      conceptValues.set(name, { value });
    }

    for (const g of gaps ?? []) {
      const cur = conceptValues.get(g.concept) ?? { value: 0 };
      conceptValues.set(g.concept, {
        ...cur,
        gap: g.gap,
        direction: g.direction === "below" || g.direction === "above"
          ? g.direction
          : undefined,
      });
    }

    const arr = Array.from(conceptValues.entries()).map(([concept, data]) => ({
      concept,
      value: Number(data.value || 0),
      gap: typeof data.gap === "number" ? data.gap : undefined,
      direction: data.direction,
    }));

    arr.sort((a, b) => b.value - a.value);
    return arr.slice(0, 10);
  }, [profile, gaps]);

  const readBookGrowth = useMemo(() => {
    const reviewEvents = (history ?? [])
      .filter((ev) => ev.type === "book_review")
      .slice()
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

    if (reviewEvents.length === 0) return [];

    const acc: Record<string, number[]> = {};

    for (const ev of reviewEvents) {
      const payloadConcepts =
        ev?.payload?.concepts ??
        ev?.payload?.concepts01 ??
        ev?.payload?.book_concepts ??
        {};

      if (!payloadConcepts || typeof payloadConcepts !== "object") continue;

      for (const [k, v] of Object.entries(payloadConcepts)) {
        const num = Number(v);
        if (!Number.isFinite(num)) continue;
        (acc[k] ??= []).push(num);
      }
    }

    return Object.entries(acc)
      .map(([concept, values]) => ({
        concept,
        avg_growth: values.reduce((s, x) => s + x, 0) / values.length,
        count: values.length,
      }))
      .filter((x) => x.avg_growth > 0)
      .sort((a, b) => b.avg_growth - a.avg_growth)
      .slice(0, 8);
  }, [history]);

  const ageOptions = ["дошкольная", "младшая школа", "средняя школа", "16+", "18+"];

  return (
    <div className="page">
      <div className="shellWide">
        <div className="card">
          <div className="headerRow">
            <div>
              <div className="h1">Кабинет ученика</div>
              <div className="muted">
                {readerId || "—"} • возрастная группа: <b>{age}</b>
              </div>
            </div>
            <button className="btn" onClick={onLogout}>
              Выйти
            </button>
          </div>

          <div className="tabsRow">
            <button className={`tabBtn ${tab === "account" ? "tabBtnActive" : ""}`} onClick={() => setTab("account")}>
              Мой профиль
            </button>
            <button className={`tabBtn ${tab === "texts" ? "tabBtnActive" : ""}`} onClick={() => setTab("texts")}>
              Тексты пользователя
            </button>
            <button className={`tabBtn ${tab === "test" ? "tabBtnActive" : ""}`} onClick={() => setTab("test")}>
              Тестирование
            </button>
            <button className={`tabBtn ${tab === "results" ? "tabBtnActive" : ""}`} onClick={() => setTab("results")}>
              Итоги и рекомендации
            </button>
            <button className={`tabBtn ${tab === "read" ? "tabBtnActive" : ""}`} onClick={() => setTab("read")}>
              Прочитанные книги
            </button>
          </div>

          {tab === "account" && (
            <div className="grid2">
              <div className="panel">
                <div className="panelTitle">Личный кабинет</div>

                {accountLoading && <div className="muted" style={{ marginTop: 10 }}>Загрузка…</div>}
                {accountMsg && <div className="note">{accountMsg}</div>}

                <div style={{ marginTop: 12 }}>
                  <label className="label">Ссылка на фото профиля</label>
                  <input
                    className="input"
                    value={accountForm.avatar_url}
                    onChange={(e) =>
                      setAccountForm((p) => ({ ...p, avatar_url: e.target.value }))
                    }
                    placeholder="https://..."
                  />
                </div>

                <div style={{ marginTop: 12 }}>
                  <label className="label">ФИО</label>
                  <input
                    className="input"
                    value={accountForm.full_name}
                    onChange={(e) =>
                      setAccountForm((p) => ({ ...p, full_name: e.target.value }))
                    }
                    placeholder="Иван Иванов"
                  />
                </div>

                <div style={{ marginTop: 12 }}>
                  <label className="label">Город</label>
                  <input
                    className="input"
                    value={accountForm.city}
                    onChange={(e) =>
                      setAccountForm((p) => ({ ...p, city: e.target.value }))
                    }
                    placeholder="Москва"
                  />
                </div>

                <div style={{ marginTop: 12 }}>
                  <label className="label">Возрастная группа чтения</label>
                  <select
                    className="input"
                    value={accountForm.reading_age}
                    onChange={(e) =>
                      setAccountForm((p) => ({ ...p, reading_age: e.target.value }))
                    }
                  >
                    {ageOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ marginTop: 12 }}>
                  <label className="label">Школа / группа</label>
                  <input
                    className="input"
                    value={accountForm.school}
                    onChange={(e) =>
                      setAccountForm((p) => ({ ...p, school: e.target.value }))
                    }
                    placeholder="Школа №12 / группа ИВТ-21"
                  />
                </div>

                <div style={{ marginTop: 12 }}>
                  <label className="label">Класс / курс</label>
                  <input
                    className="input"
                    value={accountForm.class_name}
                    onChange={(e) =>
                      setAccountForm((p) => ({ ...p, class_name: e.target.value }))
                    }
                    placeholder="9Б / 2 курс"
                  />
                </div>

                <div className="row" style={{ marginTop: 14 }}>
                  <button className="primaryBtn" onClick={() => void saveAccount()} disabled={accountLoading}>
                    Сохранить
                  </button>
                </div>
              </div>

              <div className="panel">
                <div className="panelTitle">Моя карточка</div>

                <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14 }}>
                  {accountForm.avatar_url ? (
                    <img
                      src={accountForm.avatar_url}
                      alt="avatar"
                      style={{
                        width: 88,
                        height: 88,
                        borderRadius: "50%",
                        objectFit: "cover",
                        border: "1px solid rgba(0,0,0,.08)",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 88,
                        height: 88,
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "rgba(60,110,255,.10)",
                        fontWeight: 800,
                        fontSize: 28,
                        color: "rgba(40,70,160,.95)",
                      }}
                    >
                      {(accountForm.full_name || account?.email || "U").slice(0, 1).toUpperCase()}
                    </div>
                  )}

                  <div>
                    <div className="h1" style={{ fontSize: 22 }}>
                      {accountForm.full_name || "Без имени"}
                    </div>
                    <div className="muted">{account?.email || "—"}</div>
                    <div className="muted">Роль: <b>{account?.role || "student"}</b></div>
                  </div>
                </div>

                <div className="note" style={{ marginTop: 16 }}>
                  <div>Город: <b>{accountForm.city || "—"}</b></div>
                  <div>Школа / группа: <b>{accountForm.school || "—"}</b></div>
                  <div>Класс / курс: <b>{accountForm.class_name || "—"}</b></div>
                  <div>Возрастная группа чтения: <b>{accountForm.reading_age || profile?.age || "16+"}</b></div>
                </div>

                <div className="subTitle" style={{ marginTop: 14 }}>Краткая статистика</div>
                <div className="chips">
                  <span className="chip">Тестов: {meta?.test_count ?? 0}</span>
                  <span className="chip">Текстов: {meta?.text_count ?? 0}</span>
                  <span className="chip">Прочитано книг: {readBooks.length}</span>
                </div>
              </div>
            </div>
          )}

          {tab === "texts" && (
            <div className="grid2">
              <div className="panel">
                <div className="panelTitle">Добавить текст (сочинение/эссе)</div>
                <div className="muted" style={{ marginTop: 6 }}>
                  Можно вставить фрагмент текста. Анализ обновит профиль ценностных тем.
                </div>

                <div style={{ marginTop: 12 }}>
                  <label className="label">Название (необязательно)</label>
                  <input
                    className="input"
                    value={textTitle}
                    onChange={(e) => setTextTitle(e.target.value)}
                    placeholder="Например: «Почему важно быть честным»"
                  />
                </div>

                <div style={{ marginTop: 12 }}>
                  <label className="label">Текст</label>
                  <textarea
                    className="textarea"
                    value={textBody}
                    onChange={(e) => setTextBody(e.target.value)}
                    placeholder="Вставьте текст здесь…"
                    rows={10}
                  />
                </div>

                <div className="row" style={{ marginTop: 12 }}>
                  <button className="primaryBtn" onClick={() => void onAnalyzeText()} disabled={analyzeLoading}>
                    {analyzeLoading ? "Анализ…" : "Проанализировать"}
                  </button>
                  <button
                    className="btn"
                    onClick={() => {
                      setTextTitle("");
                      setTextBody("");
                      setAnalyzeMsg(null);
                    }}
                    disabled={analyzeLoading}
                  >
                    Очистить
                  </button>
                </div>

                {analyzeMsg && <div className="note">{analyzeMsg}</div>}
              </div>

              <div className="panel">
                <div className="panelTitle">Мои тексты</div>

                {userTexts.length === 0 ? (
                  <div className="muted" style={{ marginTop: 8 }}>
                    Пока нет загруженных текстов.
                  </div>
                ) : (
                  <div className="textList" style={{ marginTop: 10 }}>
                    {userTexts.map((item) => (
                      <div key={item.id} className="textItem">
                        <div>
                          <div className="textItemTitle">{item.title}</div>
                          <div className="muted" style={{ fontSize: 13 }}>
                            {fmtDT(item.created_at)}
                          </div>
                        </div>

                        <button className="btn" type="button" onClick={() => setOpenedText(item)}>
                          Открыть
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "test" && (
            <TestPanel
              profileAge={age}
              submitLoading={submitTestLoading}
              submitMsg={submitTestMsg}
              onSubmitConcepts01={onSubmitTestWithConcepts01}
            />
          )}

          {tab === "results" && (
            <div className="gridResults">
              <div className="panel">
                <div className="panelTitle">Профиль, темы роста и история</div>

                {profileLoading && <div className="muted">Загрузка профиля…</div>}
                {profileErr && <div className="error">{profileErr}</div>}

                <div className="subTitle">Текущие концепты (топ)</div>
                <div className="chips">
                  {top.length === 0 ? (
                    <span className="muted">Нет данных</span>
                  ) : (
                    top.map(([k]) => (
                      <span key={k} className="chip">
                        {k}
                      </span>
                    ))
                  )}
                </div>

                <div className="subTitle" style={{ marginTop: 14 }}>
                  Темы для развития
                </div>

                {gapsLoading && <div className="muted">Считаю темы роста…</div>}
                {gapsErr && <div className="error">{gapsErr}</div>}

                <div className="chips">
                  {growthTopicsTop.length === 0 && !gapsLoading ? (
                    <span className="muted">Выраженных тем роста не найдено — можно углублять сильные стороны.</span>
                  ) : (
                    growthTopicsTop.map((g) => (
                      <span key={g.concept} className="chip chipGrowth">
                        {g.concept} • нужно усилить на {fmt01(g.gap)}
                      </span>
                    ))
                  )}
                </div>

                <div className="subTitle" style={{ marginTop: 14 }}>
                  Сильные стороны
                </div>
                <div className="chips">
                  {strengthsTop.length === 0 ? (
                    <span className="muted">—</span>
                  ) : (
                    strengthsTop.map((g) => (
                      <span key={g.concept} className="chip chipCool">
                        {g.concept} • +{fmt01(Math.abs(g.gap))}
                      </span>
                    ))
                  )}
                </div>

                <div className="subTitle" style={{ marginTop: 14 }}>
                  Динамика после прочитанных книг
                </div>
                <div className="chips">
                  {readBookGrowth.length === 0 ? (
                    <span className="muted">Пока нет данных по отзывам на книги.</span>
                  ) : (
                    readBookGrowth.map((x) => (
                      <span key={x.concept} className="chip chipGrowthSoft">
                        {x.concept} • +{fmt01(x.avg_growth)}
                      </span>
                    ))
                  )}
                </div>
                <div className="muted" style={{ marginTop: 8 }}>
                  Здесь показаны темы, которые чаще всего усиливались после добавления прочитанных книг и отзывов к ним.
                </div>

                <div className="subTitle" style={{ marginTop: 14 }}>
                  Карта моих ценностей
                </div>

                <ConceptMap items={conceptMapItems} />

                <div className="subTitle" style={{ marginTop: 14 }}>
                  Изменение профиля: до / после
                </div>

                {growthLoading && <div className="muted">Считаю динамику…</div>}
                {growthErr && <div className="error">{growthErr}</div>}

                {!growthLoading && growth && (
                  <div className="note" style={{ marginTop: 10 }}>
                    <div className="muted">
                      Событий в истории: <b>{growth.events_count}</b>
                    </div>
                    <div className="muted">
                      Начальное состояние: <b>{fmtDT(growth.before?.created_at)}</b>
                    </div>
                    <div className="muted">
                      Текущее состояние: <b>{fmtDT(growth.after?.created_at)}</b>
                    </div>
                  </div>
                )}

                <div className="grid2" style={{ marginTop: 10 }}>
                  <div className="panel">
                    <div className="panelTitle">Было</div>
                    <div className="chips" style={{ marginTop: 10 }}>
                      {growth?.before?.concepts
                        ? topConcepts(growth.before.concepts, 8).map(([k, v]) => (
                            <span key={k} className="chip">
                              {k} • {fmt01(v)}
                            </span>
                          ))
                        : <span className="muted">Недостаточно данных</span>}
                    </div>
                  </div>

                  <div className="panel">
                    <div className="panelTitle">Стало</div>
                    <div className="chips" style={{ marginTop: 10 }}>
                      {growth?.after?.concepts
                        ? topConcepts(growth.after.concepts, 8).map(([k, v]) => (
                            <span key={k} className="chip chipCool">
                              {k} • {fmt01(v)}
                            </span>
                          ))
                        : <span className="muted">Недостаточно данных</span>}
                    </div>
                  </div>
                </div>

                <div className="subTitle" style={{ marginTop: 14 }}>
                  Что усилилось
                </div>
                <div className="chips">
                  {growth?.top_growth?.length ? (
                    growth.top_growth.slice(0, 8).map((x) => (
                      <span key={x.concept} className="chip chipGrowthSoft">
                        {x.concept} • +{fmt01(x.delta)}
                      </span>
                    ))
                  ) : (
                    <span className="muted">Пока нет выраженного роста</span>
                  )}
                </div>

                <div className="subTitle" style={{ marginTop: 14 }}>
                  Что ослабло
                </div>
                <div className="chips">
                  {growth?.top_decline?.length ? (
                    growth.top_decline.slice(0, 8).map((x) => (
                      <span key={x.concept} className="chip chipWarm">
                        {x.concept} • {fmt01(x.delta)}
                      </span>
                    ))
                  ) : (
                    <span className="muted">Снижения не обнаружено</span>
                  )}
                </div>

                <div className="subTitle" style={{ marginTop: 14 }}>
                  История профиля
                </div>

                {(metaLoading || historyLoading) && <div className="muted">Загрузка истории…</div>}
                {metaErr && <div className="error">{metaErr}</div>}

                {meta && (
                  <div className="note" style={{ marginTop: 10 }}>
                    <div className="muted">
                      Тестов: <b>{meta.test_count}</b> • Текстов: <b>{meta.text_count}</b>
                    </div>
                    <div className="muted">
                      Последнее обновление: <b>{fmtDT(meta.last_update_at)}</b>
                    </div>
                    <div className="muted">
                      Источник: <b>{friendlySource(meta.last_source)}</b>
                    </div>
                    <div className="muted" style={{ marginTop: 6 }}>
                      Последняя анкета: <b>{fmtDT(meta.last_test_at)}</b> • Последний текст: <b>{fmtDT(meta.last_text_at)}</b>
                    </div>
                  </div>
                )}

                <div className="row" style={{ marginTop: 10 }}>
                  <button
                    className="btn"
                    onClick={() => {
                      const next = !historyOpen;
                      setHistoryOpen(next);
                      if (next) void loadHistory(20);
                    }}
                    disabled={historyLoading}
                  >
                    {historyOpen ? "Скрыть события" : "Показать события"}
                  </button>

                  <button
                    className="btn"
                    onClick={() => void refreshAll({ withHistory: historyOpen })}
                    disabled={recsLoading || profileLoading || gapsLoading || metaLoading || historyLoading || growthLoading}
                  >
                    Обновить данные
                  </button>
                </div>

                {historyOpen && (
                  <div style={{ marginTop: 10 }}>
                    {historyErr && <div className="error">{historyErr}</div>}
                    {history.length === 0 && !historyLoading ? (
                      <div className="muted">Пока нет событий. Пройди анкету, добавь текст или отзыв о книге.</div>
                    ) : (
                      <div className="historyList">
                        {history.map((ev) => (
                          <HistoryItem key={ev.id} ev={ev} />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="subTitle" style={{ marginTop: 14 }}>
                  Пояснение
                </div>
                <div className="muted">{growthTopicsHint}</div>

                <div className="row" style={{ marginTop: 14 }}>
                  <button className="btn" onClick={() => setTab("texts")}>
                    Добавить текст →
                  </button>
                  <button className="btn" onClick={() => setTab("test")}>
                    Пройти анкету →
                  </button>
                  <button className="btn" onClick={() => setTab("read")}>
                    Мои книги →
                  </button>
                </div>
              </div>

              <div className="panel grow">
                <div className="panelTitle">Рекомендации</div>

                <div className="row" style={{ marginBottom: 10 }}>
                  <button
                    className="btn"
                    onClick={() => void refreshAll({ withHistory: historyOpen })}
                    disabled={recsLoading || profileLoading || gapsLoading || metaLoading || historyLoading || growthLoading}
                  >
                    Обновить данные
                  </button>
                  {(recsLoading || profileLoading || gapsLoading || metaLoading || historyLoading || growthLoading) && (
                    <span className="muted">Загрузка…</span>
                  )}
                </div>

                {recsErr && <div className="error">{recsErr}</div>}

                {(!recs || recs.length === 0) && !recsLoading && !recsErr && (
                  <div className="muted">Пока нет рекомендаций. Добавь текст, пройди анкету или оставь отзыв на книгу.</div>
                )}

                <div className="recsGrid">
                  {(recs ?? []).map((item) => (
                    <RecommendationCard
                      key={item.work.id}
                      item={item}
                      maxScore={maxScore}
                      onMarkRead={() => {
                        setOpenedBook(null);
                        setMarkReadOpen(item);
                        setReadRating(5);
                        setReadImpression("");
                      }}
                      onOpenDetails={() => setOpenedBook(item)}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "read" && (
            <div className="grid2">
              <div className="panel">
                <div className="panelTitle">Мои прочитанные книги</div>

                {readBooksMsg && <div className="note">{readBooksMsg}</div>}
                {readBooksLoading && <div className="muted" style={{ marginTop: 10 }}>Загрузка…</div>}

                {!readBooksLoading && readBooks.length === 0 ? (
                  <div className="muted" style={{ marginTop: 10 }}>
                    Пока нет отмеченных прочитанных книг.
                  </div>
                ) : (
                  <div className="readBooksList" style={{ marginTop: 10 }}>
                    {readBooks.map((book) => (
                      <div key={book.id} className="readBookCard">
                        <div>
                          <div className="readBookTitle">{book.title}</div>
                          <div className="muted">
                            {book.author || "Автор не указан"} • {book.age || "Возраст не указан"}
                          </div>
                          <div className="muted" style={{ marginTop: 6 }}>
                            Оценка: <b>{starsLabel(book.rating)}</b>
                          </div>
                          <div className="muted">
                            Дата: <b>{fmtDT(book.created_at)}</b>
                          </div>
                        </div>

                        <div className="tableActions">
                          <button className="btn" onClick={() => setOpenedReadBook(book)}>
                            Открыть
                          </button>
                          <button className="dangerBtn" onClick={() => void onDeleteReadBook(book.id)}>
                            Удалить
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* <div className="panel">
                <div className="panelTitle">Что даёт эта вкладка</div>
                <ul className="ul" style={{ marginTop: 10 }}>
                  <li>прочитанные книги больше не попадают в рекомендации;</li>
                  <li>можно оставить оценку и впечатления;</li>
                  <li>впечатления анализируются как текст;</li>
                  <li>профиль ученика пересчитывается с учётом отзыва.</li>
                </ul>
              </div> */}
            </div>
          )}
        </div>
      </div>

      {openedText && (
        <div className="modalOverlay" onClick={() => setOpenedText(null)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="modalTop">
              <div>
                <div className="modalTitle">{openedText.title}</div>
                <div className="muted">{fmtDT(openedText.created_at)}</div>
              </div>

              <button className="btn" onClick={() => setOpenedText(null)}>
                Закрыть
              </button>
            </div>

            <div className="modalText">{openedText.text}</div>
          </div>
        </div>
      )}

      {openedReadBook && (
        <div className="modalOverlay" onClick={() => setOpenedReadBook(null)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="modalTop">
              <div>
                <div className="modalTitle">{openedReadBook.title}</div>
                <div className="muted">
                  {openedReadBook.author || "Автор не указан"} • {openedReadBook.age || "Возраст не указан"}
                </div>
              </div>

              <button className="btn" onClick={() => setOpenedReadBook(null)}>
                Закрыть
              </button>
            </div>

            <div className="subTitle">Оценка</div>
            <div className="modalText">{starsLabel(openedReadBook.rating)}</div>

            <div className="subTitle" style={{ marginTop: 12 }}>Мои впечатления</div>
            <div className="modalText">
              {openedReadBook.impression_text || "Впечатления не добавлены."}
            </div>

            <div className="subTitle" style={{ marginTop: 12 }}>Концепты книги / отзыва</div>
            <div className="chips">
              {topConcepts(openedReadBook.concepts, 8).length === 0 ? (
                <span className="muted">Нет данных</span>
              ) : (
                topConcepts(openedReadBook.concepts, 8).map(([k, v]) => (
                  <span key={k} className="chip">
                    {k} • {fmt01(v)}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {openedBook && (
        <div className="modalOverlay" onClick={() => setOpenedBook(null)}>
          <div className="bookModalCard" onClick={(e) => e.stopPropagation()}>
            <div className="modalTop">
              <div>
                <div className="modalTitle">{openedBook.work.title}</div>
                <div className="muted">
                  {openedBook.work.author} • {openedBook.work.age}
                </div>
              </div>

              <button className="btn" onClick={() => setOpenedBook(null)}>
                Закрыть
              </button>
            </div>

            <div className="bookHero">
              <div className="bookCoverMock">
                {openedBook.work.cover_image ? (
                  <img
                    src={openedBook.work.cover_image.startsWith("/covers/")
                      ? toBackendUrl(openedBook.work.cover_image)
                      : openedBook.work.cover_image}
                    alt={openedBook.work.title}
                    className="bookModalRealCover"
                  />
                ) : (
                  <>
                    <div className="bookCoverSpine" />
                    <div className="bookCoverContent">
                      <div className="bookCoverTitle">{openedBook.work.title}</div>
                      <div className="bookCoverAuthor">{openedBook.work.author}</div>
                    </div>
                  </>
                )}
              </div>

              <div className="bookHeroInfo">
                <div className="bookMetaGrid">
                  <div className="bookMetaItem">
                    <span>Возраст</span>
                    <b>{openedBook.work.age}</b>
                  </div>
                  <div className="bookMetaItem">
                    <span>Соответствие</span>
                    <b>
                      {maxScore > 0
                        ? `${Math.round((Number(openedBook.why?.score ?? 0) / maxScore) * 100)}%`
                        : "—"}
                    </b>
                  </div>
                  <div className="bookMetaItem">
                    <span>Режим</span>
                    <b>
                      {openedBook.why?.mode === "correction"
                        ? "Развитие тем роста"
                        : "Углубление"}
                    </b>
                  </div>
                </div>

                <div className="bookExplainBox">
                  <div className="subTitle" style={{ marginTop: 0 }}>Почему рекомендована</div>
                  <div className="muted" style={{ marginTop: 6 }}>
                    {openedBook.why?.gaps?.some((g) => Number(g.gap) > 0)
                      ? `Книга помогает развивать темы: ${openedBook.why.gaps
                          .filter((g) => Number(g.gap) > 0)
                          .slice(0, 4)
                          .map((g) => g.via ? `${g.concept} (через ${g.via})` : g.concept)
                          .join(", ")}.`
                      : "Книга подходит для углубления уже выраженных сильных сторон."}
                  </div>
                </div>
              </div>
            </div>

            <div className="subTitle" style={{ marginTop: 14 }}>Концепты книги</div>
            <div className="chips">
              {topConcepts(openedBook.work.concepts, 8).length === 0 ? (
                <span className="muted">Нет данных</span>
              ) : (
                topConcepts(openedBook.work.concepts, 8).map(([k, v]) => (
                  <span key={k} className="chip">
                    {k} • {fmt01(v)}
                  </span>
                ))
              )}
            </div>

            <div className="subTitle" style={{ marginTop: 14 }}>Темы, которые книга может поддержать</div>
            <div className="chips">
              {(openedBook.why?.gaps ?? []).slice(0, 6).map((g, idx) => (
                <span
                  key={`${g.concept}-${idx}`}
                  className={`chip ${g.direction === "below" ? "chipWarm" : "chipCool"}`}
                >
                  {g.via ? `${g.concept} через ${g.via}` : g.concept}
                </span>
              ))}
            </div>

            <div className="row" style={{ marginTop: 16 }}>
              <button
                className="primaryBtn"
                onClick={() => {
                  setOpenedBook(null);
                  setMarkReadOpen(openedBook);
                  setReadRating(5);
                  setReadImpression("");
                }}
              >
                Отметить как прочитанную
              </button>
            </div>
          </div>
        </div>
      )}

      {markReadOpen && (
        <div className="modalOverlay" onClick={() => setMarkReadOpen(null)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="modalTop">
              <div>
                <div className="modalTitle">Отметить как прочитанную</div>
                <div className="muted">
                  {markReadOpen.work.title} • {markReadOpen.work.author}
                </div>
              </div>

              <button className="btn" onClick={() => setMarkReadOpen(null)}>
                Закрыть
              </button>
            </div>

            <div className="subTitle">Оценка</div>
            <div className="starsRow">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  className={`starBtn ${readRating === n ? "starBtnActive" : ""}`}
                  onClick={() => setReadRating(n)}
                  type="button"
                >
                  {n}
                </button>
              ))}
            </div>

            <div className="subTitle" style={{ marginTop: 12 }}>
              Мои впечатления
            </div>
            <textarea
              className="textarea"
              rows={8}
              value={readImpression}
              onChange={(e) => setReadImpression(e.target.value)}
              placeholder="Напиши, что тебе понравилось в книге, какие мысли она вызвала, чему научила..."
            />

            <div className="row" style={{ marginTop: 12 }}>
              <button className="primaryBtn" onClick={() => void onSaveReadBook()} disabled={saveReadLoading}>
                {saveReadLoading ? "Сохранение…" : "Сохранить"}
              </button>
            </div>

            <div className="note">
              Если впечатление достаточно длинное, оно будет проанализировано как текст и повлияет на твой профиль.
            </div>
          </div>
        </div>
      )}

      <StyleBlock />
    </div>
  );
}

/* -------------------------- History UI -------------------------- */

function HistoryItem({ ev }: { ev: ProfileEvent }) {
  const kind =
    ev.type === "test"
      ? "Анкета"
      : ev.type === "book_review"
      ? "Отзыв о книге"
      : "Текст";

  const when = fmtDT(ev.created_at);

  const payloadConcepts: Record<string, number> | undefined =
    ev?.payload?.test_concepts ?? ev?.payload?.concepts ?? ev?.payload?.concepts01;

  const afterConcepts: Record<string, number> | undefined =
    ev?.profile_after?.concepts ?? ev?.profile_after?.concepts01;

  const topPayload = useMemo(() => topConcepts(payloadConcepts, 4), [payloadConcepts]);
  const topAfter = useMemo(() => topConcepts(afterConcepts, 4), [afterConcepts]);

  return (
    <div className="historyItem">
      <div className="historyTop">
        <div className="historyTitle">
          <b>{kind}</b> • {when}
        </div>
      </div>

      <div className="muted" style={{ marginTop: 6 }}>
        {ev.type === "book_review" && ev?.payload?.title ? (
          <>
            Книга: <b>{ev.payload.title}</b>
            <br />
          </>
        ) : null}

        {topPayload.length > 0 && (
          <>
            Входные данные (топ): <b>{topPayload.map(([k, v]) => `${k} ${fmt01(v)}`).join(", ")}</b>
            <br />
          </>
        )}
        {topAfter.length > 0 && (
          <>
            Профиль после (топ): <b>{topAfter.map(([k, v]) => `${k} ${fmt01(v)}`).join(", ")}</b>
          </>
        )}
        {topPayload.length === 0 && topAfter.length === 0 && <>Событие сохранено.</>}
      </div>
    </div>
  );
}

/* -------------------------- Recommendation UI -------------------------- */

function RecommendationCard({
  item,
  maxScore,
  onMarkRead,
  onOpenDetails,
}: {
  item: ExplainedRecommendation;
  maxScore: number;
  onMarkRead: () => void;
  onOpenDetails: () => void;
}) {
  const gaps = Array.isArray(item?.why?.gaps) ? item.why.gaps : [];

  const percent = useMemo(() => {
    const s = Number(item?.why?.score ?? 0);
    if (!Number.isFinite(s) || s <= 0 || !Number.isFinite(maxScore) || maxScore <= 0) return 0;
    return Math.round((s / maxScore) * 100);
  }, [item, maxScore]);

  const tags = useMemo(() => {
    const c = item?.work?.concepts ?? {};
    const arr = safeEntries(c);
    arr.sort((a, b) => b[1] - a[1]);
    return arr.slice(0, 4).map(([k]) => k);
  }, [item]);

  const deficitHits = useMemo(() => {
    return gaps
      .filter((g: any) => Number(g.gap) > 0)
      .slice(0, 3)
      .map((g: any) => (g.via ? `${g.concept} через ${g.via}` : g.concept));
  }, [gaps]);

  const modeLabel = item?.why?.mode === "correction" ? "Развитие тем роста" : "Углубление";

  return (
    <div className="bookCard">
      <div className="bookCardCover">
        {item.work.cover_image ? (
          <img
            src={item.work.cover_image.startsWith("/covers/")
              ? toBackendUrl(item.work.cover_image)
              : item.work.cover_image}
            alt={item.work.title}
            className="bookRealCover"
          />
        ) : (
          <>
            <div className="bookCardSpine" />
            <div className="bookCardCoverInner">
              <div className="bookCardCoverTitle">{item.work.title}</div>
              <div className="bookCardCoverAuthor">{item.work.author}</div>
            </div>
          </>
        )}
      </div>

      <div className="bookCardBody">
        <div className="bookCardTop">
          <div className="bookCardTitle">{item.work.title}</div>
          <div className="bookMatchBadge">{percent}%</div>
        </div>

        <div className="muted">
          {item.work.author} • {item.work.age} • {modeLabel}
        </div>

        <div className="chips" style={{ marginTop: 10 }}>
          {tags.map((t) => (
            <span key={t} className="chip">
              {t}
            </span>
          ))}
        </div>

        <div className="bookExplainText">
          {deficitHits.length > 0
            ? `Поддерживает темы: ${deficitHits.join(", ")}`
            : "Подходит для углубления сильных сторон."}
        </div>

        <div className="bookCardActions">
          <button className="btn" type="button" onClick={onOpenDetails}>
            Подробнее
          </button>
          <button className="primaryBtn" type="button" onClick={onMarkRead}>
            Прочитано
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------- Concept Map -------------------------- */

function ConceptMap({
  items,
}: {
  items: Array<{
    concept: string;
    value: number;
    gap?: number;
    direction?: "below" | "above";
  }>;
}) {
  if (!items.length) {
    return <div className="muted" style={{ marginTop: 10 }}>Пока недостаточно данных для карты.</div>;
  }

  const cx = 210;
  const cy = 210;
  const radius = 140;

  const nodes = items.map((item, idx) => {
    const angle = (Math.PI * 2 * idx) / items.length - Math.PI / 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    const size = 22 + item.value * 34;

    let cls = "conceptNodeNeutral";
    if (item.direction === "below") cls = "conceptNodeDeficit";
    if (item.direction === "above") cls = "conceptNodeStrong";

    return { ...item, x, y, size, cls };
  });

  return (
    <div className="conceptMapWrap">
      <svg viewBox="0 0 420 420" className="conceptMapSvg" role="img" aria-label="Карта ценностей">
        {nodes.map((n) => (
          <line
            key={`line-${n.concept}`}
            x1={cx}
            y1={cy}
            x2={n.x}
            y2={n.y}
            className="conceptEdge"
          />
        ))}

        <circle cx={cx} cy={cy} r={42} className="conceptCenter" />
        <text x={cx} y={cy - 4} textAnchor="middle" className="conceptCenterText">
          Мой
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="conceptCenterText">
          профиль
        </text>

        {nodes.map((n) => (
          <g key={n.concept}>
            <circle cx={n.x} cy={n.y} r={n.size} className={n.cls} />
            <text x={n.x} y={n.y - 2} textAnchor="middle" className="conceptNodeLabel">
              {n.concept.length > 14 ? `${n.concept.slice(0, 14)}…` : n.concept}
            </text>
            <text x={n.x} y={n.y + 14} textAnchor="middle" className="conceptNodeValue">
              {fmt01(n.value)}
            </text>
            <title>
              {`${n.concept}
Текущее значение: ${fmt01(n.value)}
${typeof n.gap === "number" ? `Разрыв: ${fmt01(n.gap)}` : ""}`}
            </title>
          </g>
        ))}
      </svg>

      <div className="conceptLegend">
        <div className="conceptLegendItem">
          <span className="legendDot legendStrong" />
          <span>Сильные стороны</span>
        </div>
        <div className="conceptLegendItem">
          <span className="legendDot legendDeficit" />
          <span>Зоны роста</span>
        </div>
        <div className="conceptLegendItem">
          <span className="legendDot legendNeutral" />
          <span>Нейтральные темы</span>
        </div>
      </div>
    </div>
  );
}

/* -------------------------- Test Panel -------------------------- */

type QuestionItem = {
  id: string;
  scale: string;
  title: string;
  text: string;
  reversed?: boolean;
  attention?: boolean;
};

type Likert = 1 | 2 | 3 | 4 | 5;

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function mean1to5_to_01_strict(mean: number) {
  const centered = (mean - 3) / 2;
  const v = 0.5 + centered * 0.3;
  return clamp01(v);
}

function applySocialDesirabilityPenalty(test01: Record<string, number>, sdMean1to5: number) {
  const t = clamp01((sdMean1to5 - 3) / 2);
  const penalty = t * 0.18;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(test01)) out[k] = clamp01(v - penalty);
  return out;
}

function TestPanel(props: {
  profileAge: string;
  submitLoading: boolean;
  submitMsg: string | null;
  onSubmitConcepts01: (concepts01: Record<string, number>) => Promise<void>;
}) {
  const CORE_SCALES = new Set([
    "нравственный_выбор",
    "ответственность",
    "честь_и_достоинство",
    "смысл_жизни",
    "любовь",
    "коллективизм",
    "патриотизм",
    "свобода",
    "саморазвитие",
  ]);

  const base: QuestionItem[] = [
    { id: "nv1", scale: "нравственный_выбор", title: "Нравственный выбор", text: "Я стараюсь отличать “можно” от “правильно”, даже если так сложнее." },
    { id: "nv2", scale: "нравственный_выбор", title: "Нравственный выбор", text: "Перед сложным решением я думаю о последствиях для других людей." },
    { id: "nv3", scale: "нравственный_выбор", title: "Нравственный выбор", text: "Мне важно, чтобы мои поступки соответствовали моим принципам." },
    { id: "nv4", scale: "нравственный_выбор", title: "Нравственный выбор", text: "Я могу изменить своё решение, если понимаю, что оно несправедливо." },
    { id: "nv5", scale: "нравственный_выбор", title: "Нравственный выбор", text: "Я стараюсь быть честным(ой), даже когда это невыгодно." },
    { id: "nv6", scale: "нравственный_выбор", title: "Нравственный выбор", text: "Я думаю о том, как бы я хотел(а), чтобы поступили со мной." },
    { id: "nv7", scale: "нравственный_выбор", title: "Нравственный выбор", text: "Иногда я считаю, что можно нарушить правила, если никто не узнает.", reversed: true },

    { id: "ot1", scale: "ответственность", title: "Ответственность", text: "Если я дал(а) обещание, я стараюсь выполнить его." },
    { id: "ot2", scale: "ответственность", title: "Ответственность", text: "Я беру на себя задачи и довожу их до конца." },
    { id: "ot3", scale: "ответственность", title: "Ответственность", text: "Если я ошибся(лась), я готов(а) признать это." },
    { id: "ot4", scale: "ответственность", title: "Ответственность", text: "Мне важно выполнять обязательства перед людьми." },
    { id: "ot5", scale: "ответственность", title: "Ответственность", text: "Я стараюсь планировать дела, чтобы успевать вовремя." },
    { id: "ot6", scale: "ответственность", title: "Ответственность", text: "Я понимаю, что мои решения влияют на будущее." },
    { id: "ot7", scale: "ответственность", title: "Ответственность", text: "Если что-то не получилось, обычно виноваты обстоятельства, а не я.", reversed: true },

    { id: "cd1", scale: "честь_и_достоинство", title: "Честь и достоинство", text: "Мне важно уважать себя и не поступать унизительно." },
    { id: "cd2", scale: "честь_и_достоинство", title: "Честь и достоинство", text: "Я стараюсь защищать достоинство другого человека, если вижу несправедливость." },
    { id: "cd3", scale: "честь_и_достоинство", title: "Честь и достоинство", text: "Я стараюсь держать слово." },
    { id: "cd4", scale: "честь_и_достоинство", title: "Честь и достоинство", text: "Я не одобряю действия, которые унижают людей." },
    { id: "cd5", scale: "честь_и_достоинство", title: "Честь и достоинство", text: "Для меня важна репутация, но не ценой лжи." },
    { id: "cd6", scale: "честь_и_достоинство", title: "Честь и достоинство", text: "Я стараюсь не пользоваться слабостью другого человека." },
    { id: "cd7", scale: "честь_и_достоинство", title: "Честь и достоинство", text: "Иногда допустимо унизить другого, если он этого “заслужил”.", reversed: true },

    { id: "sl1", scale: "смысл_жизни", title: "Смысл жизни", text: "Мне важно понимать, зачем я учусь/работаю и к чему иду." },
    { id: "sl2", scale: "смысл_жизни", title: "Смысл жизни", text: "Я думаю о своих целях на будущее." },
    { id: "sl3", scale: "смысл_жизни", title: "Смысл жизни", text: "Я задаю себе вопросы о том, что важно в жизни." },
    { id: "sl4", scale: "смысл_жизни", title: "Смысл жизни", text: "Иногда книги помогают мне увидеть новые смыслы." },
    { id: "sl5", scale: "смысл_жизни", title: "Смысл жизни", text: "Я чувствую, что мои действия имеют значение." },
    { id: "sl6", scale: "смысл_жизни", title: "Смысл жизни", text: "Я стараюсь делать выбор осознанно, а не “как получится”." },
    { id: "sl7", scale: "смысл_жизни", title: "Смысл жизни", text: "Я почти никогда не думаю о смысле жизни — это пустая тема.", reversed: true },

    { id: "lv1", scale: "любовь", title: "Любовь и эмпатия", text: "Я умею сопереживать другим людям." },
    { id: "lv2", scale: "любовь", title: "Любовь и эмпатия", text: "Я стараюсь поддерживать близких в трудные моменты." },
    { id: "lv3", scale: "любовь", title: "Любовь и эмпатия", text: "Я могу поставить себя на место другого человека." },
    { id: "lv4", scale: "любовь", title: "Любовь и эмпатия", text: "Я замечаю, когда кому-то плохо, даже если он не говорит." },
    { id: "lv5", scale: "любовь", title: "Любовь и эмпатия", text: "Я стараюсь проявлять заботу в действиях, а не только словами." },
    { id: "lv6", scale: "любовь", title: "Любовь и эмпатия", text: "Мне интересны чувства и мотивы людей (в жизни или в книгах)." },
    { id: "lv7", scale: "любовь", title: "Любовь и эмпатия", text: "Если человеку плохо, это обычно его проблемы, меня не касается.", reversed: true },

    { id: "cl1", scale: "коллективизм", title: "Коллективизм", text: "Мне важно быть частью команды/класса/группы." },
    { id: "cl2", scale: "коллективизм", title: "Коллективизм", text: "Совместная работа часто даёт лучший результат, чем работа в одиночку." },
    { id: "cl3", scale: "коллективизм", title: "Коллективизм", text: "Я готов(а) помогать другим, даже если это не приносит выгоды." },
    { id: "cl4", scale: "коллективизм", title: "Коллективизм", text: "Я считаю важным учитывать интересы группы." },
    { id: "cl5", scale: "коллективизм", title: "Коллективизм", text: "Мне легче учиться/работать, когда рядом есть поддержка." },
    { id: "cl6", scale: "коллективизм", title: "Коллективизм", text: "Я могу уступить, если это помогает общему делу." },
    { id: "cl7", scale: "коллективизм", title: "Коллективизм", text: "Каждый должен думать только о себе — это нормально.", reversed: true },

    { id: "pt1", scale: "патриотизм", title: "Патриотизм", text: "Мне важно знать культуру и историю своей страны." },
    { id: "pt2", scale: "патриотизм", title: "Патриотизм", text: "Я уважаю традиции и язык своего народа." },
    { id: "pt3", scale: "патриотизм", title: "Патриотизм", text: "Я считаю важным приносить пользу обществу." },
    { id: "pt4", scale: "патриотизм", title: "Патриотизм", text: "Меня волнует, что происходит в моей стране." },
    { id: "pt5", scale: "патриотизм", title: "Патриотизм", text: "Я ценю культурное наследие и считаю важным его сохранять." },
    { id: "pt6", scale: "патриотизм", title: "Патриотизм", text: "Я ощущаю связь с местом, где живу, и людьми вокруг." },
    { id: "pt7", scale: "патриотизм", title: "Патриотизм", text: "Мне всё равно, что будет со страной — это не моё дело.", reversed: true },

    { id: "fr1", scale: "свобода", title: "Свобода выбора", text: "Мне важно самостоятельно принимать решения." },
    { id: "fr2", scale: "свобода", title: "Свобода выбора", text: "Я ценю право выбирать свой путь." },
    { id: "fr3", scale: "свобода", title: "Свобода выбора", text: "Я могу отстаивать своё мнение спокойно и аргументированно." },
    { id: "fr4", scale: "свобода", title: "Свобода выбора", text: "Я стараюсь не поддаваться давлению, когда делаю выбор." },
    { id: "fr5", scale: "свобода", title: "Свобода выбора", text: "Я уважаю свободу другого человека." },
    { id: "fr6", scale: "свобода", title: "Свобода выбора", text: "Мне важно иметь возможность говорить “нет”." },
    { id: "fr7", scale: "свобода", title: "Свобода выбора", text: "Лучше, когда за меня решают другие — так спокойнее.", reversed: true },

    { id: "sdv1", scale: "саморазвитие", title: "Саморазвитие", text: "Я стараюсь узнавать новое." },
    { id: "sdv2", scale: "саморазвитие", title: "Саморазвитие", text: "Я могу анализировать свои ошибки и учиться на них." },
    { id: "sdv3", scale: "саморазвитие", title: "Саморазвитие", text: "Книги помогают мне понять себя и мир." },
    { id: "sdv4", scale: "саморазвитие", title: "Саморазвитие", text: "Я ставлю цели и двигаюсь к ним." },
    { id: "sdv5", scale: "саморазвитие", title: "Саморазвитие", text: "Мне интересно развивать навыки (учёба/творчество/спорт и т.п.)." },
    { id: "sdv6", scale: "саморазвитие", title: "Саморазвитие", text: "Я стараюсь расширять кругозор." },
    { id: "sdv7", scale: "саморазвитие", title: "Саморазвитие", text: "Развиваться не обязательно — человек не меняется.", reversed: true },

    { id: "sdl1", scale: "__sd__", title: "Шкала искренности", text: "Я никогда в жизни не говорил(а) неправду." },
    { id: "sdl2", scale: "__sd__", title: "Шкала искренности", text: "Я всегда и во всём поступаю идеально." },
    { id: "sdl3", scale: "__sd__", title: "Шкала искренности", text: "Мне никогда не бывает обидно или неприятно." },
    { id: "sdl4", scale: "__sd__", title: "Шкала искренности", text: "Я всегда одинаково доброжелателен(ьна) со всеми." },
    { id: "sdl5", scale: "__sd__", title: "Шкала искренности", text: "Я никогда не раздражаюсь." },
    { id: "sdl6", scale: "__sd__", title: "Шкала искренности", text: "Я никогда не сомневаюсь в своих решениях." },

    { id: "att1", scale: "__attention__", title: "Проверка внимательности", text: "Пожалуйста, выберите вариант «Скорее согласен(а)» (4).", attention: true },
  ];

  const [ordered] = useState<QuestionItem[]>(() => {
    const shuffled = shuffle(base.filter((q) => !q.attention));
    const att = base.find((q) => q.attention)!;
    const insertAt = Math.min(Math.max(10, Math.floor(shuffled.length * 0.55)), shuffled.length);
    shuffled.splice(insertAt, 0, att);
    return shuffled;
  });

  const total = ordered.length;
  const [answersById, setAnswersById] = useState<Record<string, Likert | undefined>>({});
  const [step, setStep] = useState(0);
  const [consent, setConsent] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const current = ordered[step];
  const progress = Math.round((step / (total - 1)) * 100);

  function setLikert(v: Likert) {
    setAnswersById((prev) => ({ ...prev, [current.id]: v }));
    setError(null);
  }

  function next() {
    if (!answersById[current.id]) {
      setError("Выберите вариант ответа, чтобы продолжить.");
      return;
    }
    setStep((s) => Math.min(total - 1, s + 1));
  }

  function prev() {
    setError(null);
    setStep((s) => Math.max(0, s - 1));
  }

  function validateAllAnswered() {
    for (const q of ordered) if (!answersById[q.id]) return false;
    return true;
  }

  function validateAttention() {
    return answersById["att1"] === 4;
  }

  function computeMeansByScale() {
    const byScale: Record<string, number[]> = {};

    for (const q of ordered) {
      if (q.attention) continue;
      const a = answersById[q.id];
      if (!a) continue;

      const scored = q.reversed ? 6 - a : a;
      (byScale[q.scale] ??= []).push(scored);
    }

    const means: Record<string, number> = {};
    for (const [scale, arr] of Object.entries(byScale)) {
      means[scale] = arr.reduce((s, x) => s + x, 0) / arr.length;
    }
    return means;
  }

  async function finish() {
    setError(null);

    if (!consent) {
      setError("Подтвердите согласие: анкета носит образовательный характер и не является диагнозом.");
      return;
    }
    if (!validateAllAnswered()) {
      setError("Ответьте на все вопросы, чтобы завершить.");
      return;
    }
    if (!validateAttention()) {
      setError("Контрольный вопрос выбран неверно. Пройдите внимательнее.");
      return;
    }

    const means = computeMeansByScale();
    const sdMean = means["__sd__"] ?? 3;

    const core01: Record<string, number> = {};
    for (const [scale, mean] of Object.entries(means)) {
      if (!CORE_SCALES.has(scale)) continue;
      core01[scale] = mean1to5_to_01_strict(mean);
    }

    const adjusted = applySocialDesirabilityPenalty(core01, sdMean);
    await props.onSubmitConcepts01(adjusted);
  }

  return (
    <div className="panel" style={{ marginTop: 14 }}>
      <div className="panelTitle">Анкета ценностных ориентаций</div>

      <div className="testIntro">
        <div className="testNote">
          Анкета помогает уточнить профиль чтения и сделать рекомендации объяснимыми. <b>Это не медицинская диагностика</b>.
        </div>
        <div className="testMeta">
          Возрастная группа: <b>{props.profileAge}</b> • Вопрос: <b>{step + 1}</b> / <b>{total}</b>
        </div>

        <div className="progressWrap" aria-label="progress">
          <div className="progressBar" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="questionCard">
        <div className="qTop">
          <div className="qScale">{current.title}</div>
          <div className="qStep">
            {step + 1}/{total}
          </div>
        </div>

        <div className="qText">{current.text}</div>

        <div className="likertRow" role="group" aria-label="likert">
          {([1, 2, 3, 4, 5] as Likert[]).map((v) => {
            const active = answersById[current.id] === v;
            return (
              <button
                key={v}
                type="button"
                className={`likertBtn ${active ? "likertBtnActive" : ""}`}
                onClick={() => setLikert(v)}
                aria-pressed={active}
                title={`${v}/5`}
              >
                {v}
              </button>
            );
          })}
        </div>

        <div className="likertLabels">
          <span>Совсем не про меня</span>
          <span>Полностью согласен(а)</span>
        </div>

        {error && <div className="testError">{error}</div>}

        <div className="navRow">
          <button className="btn" type="button" onClick={prev} disabled={step === 0}>
            Назад
          </button>

          {step < total - 1 ? (
            <button className="primaryBtn nextBtn" type="button" onClick={next}>
              Далее
            </button>
          ) : (
            <button className="primaryBtn" type="button" onClick={() => void finish()} disabled={props.submitLoading}>
              {props.submitLoading ? "Сохранение…" : "Завершить и сохранить"}
            </button>
          )}
        </div>

        <label className="consentRow">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>Я понимаю, что анкета носит образовательный характер и используется для рекомендаций по чтению.</span>
        </label>

        {props.submitMsg && (
          <div className="footerNote" style={{ marginTop: 10 }}>
            {props.submitMsg}
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------- Styles -------------------------- */

function StyleBlock() {
  return (
    <style>{`
      .page {
        min-height: 100vh;
        background: radial-gradient(1200px 500px at 20% 0%, rgba(100,140,255,.14), transparent),
                    radial-gradient(900px 400px at 80% 10%, rgba(80,200,170,.12), transparent),
                    #f6f7fb;
        padding: 28px 18px;
      }

      .shellWide {
        max-width: 1320px;
        margin: 0 auto;
      }

      .card {
        background: white;
        border-radius: 18px;
        box-shadow: 0 10px 28px rgba(0,0,0,.07);
        padding: 22px 22px 20px;
      }

      .headerRow {
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:14px;
      }

      .h1 {
        font-size: 28px;
        font-weight: 800;
        letter-spacing: .2px;
      }

      .muted {
        color: rgba(20,25,35,.65);
      }

      .tabsRow {
        display:flex;
        gap:10px;
        margin-top: 14px;
        padding: 10px 0 4px;
        border-bottom: 1px solid rgba(0,0,0,.06);
        flex-wrap: wrap;
      }

      .tabBtn {
        border: 1px solid rgba(0,0,0,.10);
        background: #fff;
        border-radius: 999px;
        padding: 9px 14px;
        font-weight: 650;
        cursor:pointer;
      }

      .tabBtnActive {
        border-color: rgba(60,110,255,.65);
        box-shadow: 0 0 0 3px rgba(60,110,255,.12);
      }

      .grid2 {
        display:grid;
        grid-template-columns: 1.15fr .85fr;
        gap:14px;
        margin-top: 14px;
      }

      .gridResults {
        display:grid;
        grid-template-columns: 390px 1fr;
        gap:14px;
        margin-top: 14px;
        align-items: start;
      }

      .panel {
        border: 1px solid rgba(0,0,0,.08);
        border-radius: 16px;
        padding: 14px 14px 12px;
        background: rgba(255,255,255,.95);
      }

      .panel.grow {
        min-height: 360px;
      }

      .panelTitle {
        font-weight: 800;
        letter-spacing: .2px;
      }

      .subTitle {
        margin-top: 10px;
        font-weight: 700;
        font-size: 13px;
        letter-spacing: .2px;
        color: rgba(20,25,35,.7);
      }

      .row,
      .tableActions {
        display:flex;
        gap:10px;
        align-items:center;
        flex-wrap: wrap;
      }

      .btn, .primaryBtn, .dangerBtn {
        border-radius: 12px;
        border: 1px solid rgba(0,0,0,.12);
        padding: 9px 12px;
        cursor: pointer;
        background: #fff;
        font-weight: 650;
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

      .label {
        display:block;
        font-size: 13px;
        font-weight: 650;
        margin-bottom: 6px;
        color: rgba(20,25,35,.8);
      }

      .input, .textarea, select.input {
        width: 100%;
        border: 1px solid rgba(0,0,0,.12);
        border-radius: 12px;
        padding: 10px 12px;
        font-size: 14px;
        outline: none;
        background: #fff;
      }

      .textarea {
        resize: vertical;
      }

      .chips {
        display:flex;
        flex-wrap: wrap;
        gap:8px;
        margin-top: 8px;
      }

      .chip {
        padding: 7px 10px;
        border-radius: 999px;
        border: 1px solid rgba(60,110,255,.22);
        background: rgba(60,110,255,.07);
        font-size: 13px;
      }

      .chipWarm {
        border-color: rgba(240,140,40,.35);
        background: rgba(240,140,40,.12);
      }

      .chipCool {
        border-color: rgba(80,200,170,.28);
        background: rgba(80,200,170,.10);
      }

      .chipGrowth {
        border-color: rgba(240,170,90,.38);
        background: rgba(240,170,90,.12);
      }

      .chipGrowthSoft {
        border-color: rgba(120,200,170,.32);
        background: rgba(120,200,170,.12);
      }

      .note {
        margin-top: 12px;
        padding: 10px 12px;
        border: 1px dashed rgba(60,110,255,.35);
        border-radius: 12px;
        background: rgba(60,110,255,.06);
      }

      .error {
        margin-top: 10px;
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid rgba(220,50,70,.25);
        background: rgba(220,50,70,.07);
        color: rgba(120,10,20,.9);
        font-weight: 650;
      }

      .recsGrid {
        display:grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap:14px;
        margin-top: 10px;
      }

      .bookCard {
        display:grid;
        grid-template-columns: 120px 1fr;
        gap:14px;
        border: 1px solid rgba(0,0,0,.08);
        border-radius: 18px;
        padding: 14px;
        background: linear-gradient(180deg, rgba(255,255,255,.98), rgba(247,249,255,.98));
        box-shadow: 0 10px 24px rgba(20,25,35,.05);
      }

      .bookCardCover {
        width: 120px;
        min-width: 120px;
        height: 180px;
        border-radius: 18px;
        overflow: hidden;
        background: #dfe7ff;
        border: 1px solid rgba(120, 150, 255, 0.35);
        position: relative;
      }

      .bookCardSpine {
        position: absolute;
        inset: 0 auto 0 0;
        width: 10px;
        background: rgba(60,110,255,.24);
      }

      .bookCardCoverInner {
        height: 100%;
        padding: 16px 14px 14px 18px;
        display:flex;
        flex-direction: column;
        justify-content: space-between;
      }

      .bookCardCoverTitle {
        font-size: 16px;
        font-weight: 900;
        color: rgba(20,25,35,.92);
        line-height: 1.2;
      }

      .bookCardCoverAuthor {
        font-size: 12px;
        color: rgba(20,25,35,.68);
        font-weight: 700;
      }

      .bookRealCover {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      .bookCardBody {
        display:flex;
        flex-direction: column;
      }

      .bookCardTop {
        display:flex;
        justify-content: space-between;
        gap: 10px;
        align-items:flex-start;
      }

      .bookCardTitle {
        font-size: 20px;
        font-weight: 900;
        color: rgba(20,25,35,.94);
        line-height: 1.25;
      }

      .bookMatchBadge {
        flex-shrink: 0;
        padding: 8px 10px;
        border-radius: 999px;
        background: rgba(60,110,255,.10);
        border: 1px solid rgba(60,110,255,.20);
        font-size: 13px;
        font-weight: 900;
        color: rgba(40,70,160,.95);
      }

      .bookExplainText {
        margin-top: 12px;
        color: rgba(20,25,35,.8);
        line-height: 1.5;
      }

      .bookCardActions {
        display:flex;
        gap:10px;
        flex-wrap: wrap;
        margin-top: auto;
        padding-top: 14px;
      }

      .historyList,
      .textList,
      .readBooksList {
        display:flex;
        flex-direction:column;
        gap:10px;
      }

      .historyItem {
        border: 1px solid rgba(0,0,0,.08);
        border-radius: 14px;
        padding: 10px 12px;
        background: rgba(255,255,255,.85);
      }

      .historyTop {
        display:flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
      }

      .historyTitle {
        font-weight: 750;
      }

      .textItem, .readBookCard {
        display:flex;
        justify-content:space-between;
        gap:12px;
        align-items:flex-start;
        padding:10px 12px;
        border:1px solid rgba(0,0,0,.08);
        border-radius:14px;
        background:#fff;
      }

      .textItemTitle, .readBookTitle {
        font-weight:750;
        line-height:1.35;
      }

      .conceptMapWrap {
        margin-top: 10px;
        border: 1px solid rgba(0,0,0,.08);
        border-radius: 18px;
        padding: 12px;
        background: linear-gradient(180deg, rgba(255,255,255,.96), rgba(246,248,255,.96));
      }

      .conceptMapSvg {
        width: 100%;
        height: auto;
        display:block;
      }

      .conceptEdge {
        stroke: rgba(120,140,180,.34);
        stroke-width: 2;
      }

      .conceptCenter {
        fill: rgba(60,110,255,.10);
        stroke: rgba(60,110,255,.32);
        stroke-width: 2;
      }

      .conceptCenterText {
        font-size: 14px;
        font-weight: 900;
        fill: rgba(30,40,70,.88);
      }

      .conceptNodeLabel {
        font-size: 10px;
        font-weight: 800;
        fill: rgba(20,25,35,.88);
        pointer-events: none;
      }

      .conceptNodeValue {
        font-size: 11px;
        font-weight: 900;
        fill: rgba(20,25,35,.72);
        pointer-events: none;
      }

      .conceptNodeStrong {
        fill: rgba(80,200,170,.18);
        stroke: rgba(60,160,130,.40);
        stroke-width: 2;
      }

      .conceptNodeDeficit {
        fill: rgba(255,170,120,.20);
        stroke: rgba(230,130,70,.45);
        stroke-width: 2;
      }

      .conceptNodeNeutral {
        fill: rgba(180,190,210,.20);
        stroke: rgba(120,130,150,.35);
        stroke-width: 2;
      }

      .conceptLegend {
        display:flex;
        gap:14px;
        flex-wrap: wrap;
        margin-top: 10px;
      }

      .conceptLegendItem {
        display:flex;
        align-items:center;
        gap:8px;
        color: rgba(20,25,35,.74);
        font-size: 13px;
      }

      .legendDot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        display:inline-block;
      }

      .legendStrong {
        background: rgba(80,200,170,.65);
      }

      .legendDeficit {
        background: rgba(240,140,40,.72);
      }

      .legendNeutral {
        background: rgba(150,160,180,.62);
      }

      .modalOverlay {
        position:fixed;
        inset:0;
        background:rgba(15,23,42,.35);
        display:flex;
        align-items:center;
        justify-content:center;
        padding:20px;
        z-index:1000;
      }

      .modalCard {
        width:min(820px, 100%);
        max-height:80vh;
        overflow:auto;
        background:#fff;
        border-radius:18px;
        padding:16px;
        box-shadow:0 20px 60px rgba(0,0,0,.18);
      }

      .bookModalCard {
        width:min(980px, 100%);
        max-height:85vh;
        overflow:auto;
        background:#fff;
        border-radius:20px;
        padding:18px;
        box-shadow:0 24px 70px rgba(0,0,0,.18);
      }

      .modalTop {
        display:flex;
        justify-content:space-between;
        gap:12px;
        align-items:flex-start;
        margin-bottom:12px;
      }

      .modalTitle {
        font-size:20px;
        font-weight:850;
      }

      .modalText {
        white-space:pre-wrap;
        line-height:1.6;
        color:rgba(20,25,35,.88);
        border:1px solid rgba(0,0,0,.08);
        border-radius:14px;
        padding:14px;
        background:rgba(248,250,252,.8);
      }

      .bookHero {
        display:grid;
        grid-template-columns: 240px 1fr;
        gap:18px;
        margin-top: 8px;
      }

      .bookCoverMock {
        width: 240px;
        min-width: 240px;
        height: 360px;
        border-radius: 20px;
        overflow: hidden;
        background: #dfe7ff;
        border: 1px solid rgba(120, 150, 255, 0.35);
        position: relative;
      }

      .bookCoverSpine {
        position:absolute;
        inset: 0 auto 0 0;
        width: 14px;
        background: rgba(60,110,255,.24);
      }

      .bookCoverContent {
        height:100%;
        padding: 20px 18px 18px 24px;
        display:flex;
        flex-direction: column;
        justify-content: space-between;
      }

      .bookCoverTitle {
        font-size: 24px;
        font-weight: 900;
        line-height: 1.15;
        color: rgba(20,25,35,.94);
      }

      .bookCoverAuthor {
        font-size: 14px;
        color: rgba(20,25,35,.68);
        font-weight: 700;
      }

      .bookModalRealCover {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      .bookHeroInfo {
        display:grid;
        gap:14px;
      }

      .bookMetaGrid {
        display:grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap:12px;
      }

      .bookMetaItem {
        border: 1px solid rgba(0,0,0,.08);
        border-radius: 14px;
        padding: 12px;
        background: rgba(248,250,255,.92);
        display:grid;
        gap:6px;
      }

      .bookMetaItem span {
        font-size: 12px;
        color: rgba(20,25,35,.62);
        font-weight: 700;
      }

      .bookMetaItem b {
        font-size: 16px;
        color: rgba(20,25,35,.92);
      }

      .bookExplainBox {
        border: 1px dashed rgba(60,110,255,.32);
        border-radius: 14px;
        padding: 12px;
        background: rgba(60,110,255,.05);
      }

      .starsRow {
        display:flex;
        gap:10px;
        margin-top:8px;
      }

      .starBtn {
        width:44px;
        height:40px;
        border-radius:12px;
        border:1px solid rgba(0,0,0,.12);
        background:#fff;
        cursor:pointer;
        font-weight:800;
      }

      .starBtnActive {
        border-color: rgba(60,110,255,.65);
        box-shadow: 0 0 0 3px rgba(60,110,255,.12);
        background: rgba(60,110,255,.08);
      }

      .testIntro {
        margin-top: 10px;
      }

      .testNote {
        color: rgba(20,25,35,.75);
      }

      .testMeta {
        margin-top: 6px;
        color: rgba(20,25,35,.70);
      }

      .progressWrap {
        margin-top: 10px;
        height: 10px;
        border-radius: 999px;
        background: rgba(0,0,0,.06);
        overflow: hidden;
      }

      .progressBar {
        height: 100%;
        background: rgba(60,110,255,.55);
        border-radius: 999px;
      }

      .questionCard {
        margin-top: 12px;
        border-radius: 16px;
        border: 1px solid rgba(0,0,0,.08);
        padding: 14px;
        background: #fff;
      }

      .qTop {
        display:flex;
        align-items:center;
        justify-content: space-between;
        gap: 10px;
      }

      .qScale {
        font-weight: 850;
      }

      .qStep {
        color: rgba(20,25,35,.65);
        font-weight: 650;
      }

      .qText {
        margin-top: 10px;
        font-size: 15px;
        color: rgba(20,25,35,.85);
      }

      .likertRow {
        display:flex;
        gap: 10px;
        margin-top: 12px;
        flex-wrap: wrap;
      }

      .likertBtn {
        width: 44px;
        height: 40px;
        border-radius: 12px;
        border: 1px solid rgba(0,0,0,.12);
        background: #fff;
        cursor: pointer;
        font-weight: 800;
      }

      .likertBtnActive {
        border-color: rgba(60,110,255,.65);
        box-shadow: 0 0 0 3px rgba(60,110,255,.12);
        background: rgba(60,110,255,.08);
      }

      .likertLabels {
        display:flex;
        justify-content: space-between;
        margin-top: 6px;
        color: rgba(20,25,35,.65);
        font-size: 12px;
      }

      .testError {
        margin-top: 10px;
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid rgba(220,50,70,.25);
        background: rgba(220,50,70,.07);
        color: rgba(120,10,20,.9);
        font-weight: 650;
      }

      .navRow {
        display:flex;
        justify-content: flex-start;
        gap: 10px;
        margin-top: 12px;
      }

      .nextBtn {
        margin-left: 10px;
      }

      .consentRow {
        display:flex;
        gap: 10px;
        align-items:flex-start;
        margin-top: 12px;
        color: rgba(20,25,35,.75);
      }

      .footerNote {
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px dashed rgba(60,110,255,.35);
        background: rgba(60,110,255,.06);
      }

      .ul {
        margin: 10px 0 0 18px;
        color: rgba(20,25,35,.80);
        line-height: 1.5;
      }

      @media (max-width: 1100px) {
        .recsGrid {
          grid-template-columns: 1fr;
        }

        .bookHero {
          grid-template-columns: 1fr;
        }

        .bookMetaGrid {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 980px) {
        .gridResults {
          grid-template-columns: 1fr;
        }

        .grid2 {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 760px) {
        .bookCard {
          grid-template-columns: 1fr;
        }

        .bookCardCover {
          width: 100%;
          min-width: 0;
          height: 220px;
        }

        .bookCoverMock {
          width: 100%;
          min-width: 0;
          height: 320px;
        }
      }
    `}</style>
  );
}
