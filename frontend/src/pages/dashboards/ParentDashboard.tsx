import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearUser, getUser } from "../../auth";
import {
  apiGetGaps,
  apiGetProfile,
  apiGetProfileHistory,
  apiGetProfileMeta,
  apiGetRecommendationsExplain,
  apiParentAddChild,
  apiParentListChildren,
  apiParentRemoveChild,
  type ExplainedRecommendation,
  type GapSummaryItem,
  type ProfileEvent,
  type ProfileMeta,
  type ReaderProfile,
} from "../../api";

type TabKey = "children" | "overview" | "texts" | "support";

type ParentChild = {
  id: number;
  parent_email: string;
  child_id: string;
  child_name?: string | null;
  class_name?: string | null;
  created_at?: string | null;
};

function safeEntries(obj: any): [string, number][] {
  if (!obj || typeof obj !== "object") return [];
  return Object.entries(obj)
    .map(([k, v]) => [String(k), Number(v)] as [string, number])
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

function modeLabel(mode?: string) {
  if (mode === "correction") return "коррекция дефицитов";
  if (mode === "deepening") return "углубление";
  return "—";
}

function friendlySourceName(source?: string | null) {
  if (!source) return "—";
  if (source === "test") return "Анкета";
  if (source === "text") return "Текст";
  if (source === "manual") return "Вручную";
  return source;
}

function buildSupportTips(deficitConcepts: string[]) {
  const uniq = Array.from(
    new Set(deficitConcepts.map((x) => x.trim()).filter(Boolean))
  ).slice(0, 6);

  return uniq.map((c) => ({
    title: `Как поддержать тему: ${c}`,
    items: [
      "После чтения обсудите, почему герой поступил именно так.",
      "Попросите привести похожий пример из школы, семьи или жизни.",
      "Спросите, какой поступок кажется более честным, смелым или ответственным.",
      "Обсудите последствия действий героя для него и для окружающих.",
      "Предложите маленькое действие на неделю, чтобы закрепить тему на практике.",
    ],
  }));
}

function extractTextPreview(ev: ProfileEvent) {
  const raw =
    (ev as any)?.payload?.text ??
    (ev as any)?.payload?.content ??
    (ev as any)?.payload?.essay ??
    (ev as any)?.payload?.body ??
    "";

  const s = String(raw || "").trim();
  if (!s) return "";
  if (s.length <= 220) return s;
  return `${s.slice(0, 220)}…`;
}

export default function ParentDashboard() {
  const nav = useNavigate();
  const user = getUser();

  useEffect(() => {
    if (!user) nav("/login");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parentEmail = user?.email ?? "—";

  const [tab, setTab] = useState<TabKey>("children");

  const [children, setChildren] = useState<ParentChild[]>([]);
  const [childrenLoading, setChildrenLoading] = useState(false);
  const [childrenError, setChildrenError] = useState<string | null>(null);
  const [selectedChildId, setSelectedChildId] = useState("");

  const [newChildId, setNewChildId] = useState("");
  const [newChildName, setNewChildName] = useState("");
  const [newChildClass, setNewChildClass] = useState("");

  const selectedChild = useMemo(
    () => children.find((x) => x.child_id === selectedChildId) ?? null,
    [children, selectedChildId]
  );

  const cid = selectedChildId.trim().toLowerCase();

  const [profile, setProfile] = useState<ReaderProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileErr, setProfileErr] = useState<string | null>(null);

  const [gaps, setGaps] = useState<GapSummaryItem[]>([]);
  const [gapsLoading, setGapsLoading] = useState(false);
  const [gapsErr, setGapsErr] = useState<string | null>(null);

  const [recs, setRecs] = useState<ExplainedRecommendation[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const [recsErr, setRecsErr] = useState<string | null>(null);

  const [meta, setMeta] = useState<ProfileMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaErr, setMetaErr] = useState<string | null>(null);

  const [history, setHistory] = useState<ProfileEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyErr, setHistoryErr] = useState<string | null>(null);

  const age = profile?.age ?? "—";

  const anyLoading =
    profileLoading ||
    gapsLoading ||
    recsLoading ||
    metaLoading ||
    historyLoading;

  async function loadChildren() {
    try {
      setChildrenLoading(true);
      setChildrenError(null);

      const arr = (await apiParentListChildren()) as ParentChild[];
      setChildren(Array.isArray(arr) ? arr : []);

      setSelectedChildId((prev) => {
        if (prev && arr.some((x) => x.child_id === prev)) return prev;
        return arr[0]?.child_id ?? "";
      });
    } catch (e) {
      setChildrenError(e instanceof Error ? e.message : String(e));
      setChildren([]);
      setSelectedChildId("");
    } finally {
      setChildrenLoading(false);
    }
  }

  function selectChild(id: string) {
    setSelectedChildId(id.trim().toLowerCase());
  }

  async function addChild() {
    const child_id = newChildId.trim().toLowerCase();
    const child_name = newChildName.trim();
    const class_name = newChildClass.trim();

    if (!child_id) return;

    try {
      await apiParentAddChild({
        child_id,
        child_name: child_name || undefined,
        class_name: class_name || undefined,
      });

      setNewChildId("");
      setNewChildName("");
      setNewChildClass("");

      await loadChildren();
      setSelectedChildId(child_id);
      setTab("children");
    } catch (e) {
      setChildrenError(e instanceof Error ? e.message : String(e));
    }
  }

  async function removeChild(id: string) {
    const ok = window.confirm(`Удалить ребёнка "${id}" из кабинета?`);
    if (!ok) return;

    try {
      await apiParentRemoveChild(id);
      await loadChildren();
    } catch (e) {
      setChildrenError(e instanceof Error ? e.message : String(e));
    }
  }

  async function loadAll(forChildId: string) {
    const id = forChildId.trim().toLowerCase();

    setProfileErr(null);
    setGapsErr(null);
    setRecsErr(null);
    setMetaErr(null);
    setHistoryErr(null);

    if (!id) {
      setProfile(null);
      setGaps([]);
      setRecs([]);
      setMeta(null);
      setHistory([]);
      return;
    }

    setProfileLoading(true);
    setGapsLoading(true);
    setRecsLoading(true);
    setMetaLoading(true);
    setHistoryLoading(true);

    try {
      const [p, g, r, m, h] = await Promise.all([
        apiGetProfile(id).catch((e: any) => {
          throw new Error(e?.message ?? "Не удалось получить профиль");
        }),
        apiGetGaps(id).catch((e: any) => {
          throw new Error(e?.message ?? "Не удалось получить дефициты");
        }),
        apiGetRecommendationsExplain(id, 7, 1).catch((e: any) => {
          throw new Error(e?.message ?? "Не удалось получить рекомендации");
        }),
        apiGetProfileMeta(id).catch((e: any) => {
          throw new Error(e?.message ?? "Не удалось получить метаданные");
        }),
        apiGetProfileHistory(id, 20).catch((e: any) => {
          throw new Error(e?.message ?? "Не удалось получить историю");
        }),
      ]);

      setProfile(p);
      setGaps(Array.isArray(g) ? g : []);
      setRecs(Array.isArray(r) ? r : []);
      setMeta(m ?? null);

      const hist = Array.isArray(h) ? h : [];
      hist.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      setHistory(hist);
    } catch (e: any) {
      const msg = e?.message ?? "Ошибка загрузки";
      setProfileErr(msg);
    } finally {
      setProfileLoading(false);
      setGapsLoading(false);
      setRecsLoading(false);
      setMetaLoading(false);
      setHistoryLoading(false);
    }
  }

  async function refresh() {
    if (!cid) return;
    await loadAll(cid);
  }

  useEffect(() => {
    void loadChildren();
  }, []);

  useEffect(() => {
    if (selectedChildId) {
      void loadAll(selectedChildId);
    } else {
      setProfile(null);
      setGaps([]);
      setRecs([]);
      setMeta(null);
      setHistory([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChildId]);

  async function onLogout() {
    clearUser();
    nav("/");
  }

  const top = useMemo(() => topConcepts(profile?.concepts, 10), [profile]);

  const deficitTop = useMemo(
    () => (gaps ?? []).filter((g) => g.direction === "below" && g.gap > 0).slice(0, 8),
    [gaps]
  );

  const strengthsTop = useMemo(
    () => (gaps ?? []).filter((g) => g.direction === "above" && g.gap < 0).slice(0, 6),
    [gaps]
  );

  const maxScore = useMemo(() => {
    const xs = (recs ?? [])
      .map((r) => Number((r as any)?.why?.score ?? 0))
      .filter((x) => Number.isFinite(x) && x > 0);
    return xs.length ? Math.max(...xs) : 0;
  }, [recs]);

  const supportTips = useMemo(
    () => buildSupportTips(deficitTop.map((d) => d.concept)),
    [deficitTop]
  );

  const parentInsights = useMemo(() => {
    const tips: string[] = [];

    if (!selectedChild) {
      tips.push("Добавьте ребёнка в кабинет, чтобы видеть аналитику и рекомендации.");
      return tips;
    }

    if ((meta?.text_count ?? 0) === 0) {
      tips.push("Ребёнок пока не загружал тексты - для более точной аналитики полезно добавить хотя бы один текст.");
    }

    if ((meta?.test_count ?? 0) === 0) {
      tips.push("Анкета пока не пройдена - её результаты помогут точнее подобрать рекомендации.");
    }

    if (deficitTop.length > 0) {
      tips.push(
        `Сейчас особенно полезно развивать темы: ${deficitTop
          .slice(0, 3)
          .map((x) => x.concept)
          .join(", ")}.`
      );
    }

    if (strengthsTop.length > 0) {
      tips.push(
        `Сильные стороны ребёнка: ${strengthsTop
          .slice(0, 3)
          .map((x) => x.concept)
          .join(", ")}.`
      );
    }

    if ((history?.length ?? 0) === 0) {
      tips.push("История активности пока пустая - данные появятся после анкеты или загрузки текста.");
    }

    return tips;
  }, [selectedChild, meta, deficitTop, strengthsTop, history]);

  const textEvents = useMemo(() => {
    return (history ?? []).filter((ev) => ev.type === "text");
  }, [history]);

  return (
    <div className="page">
      <div className="shellWide">
        <div className="card">
          <div className="headerRow">
            <div className="brandBlock">
              <div className="h1">Кабинет родителя</div>
              <div className="muted">Родитель • {parentEmail}</div>
            </div>

            <button className="btn" onClick={onLogout} type="button">
              Выйти
            </button>
          </div>

          <div className="topBar">
            <div className="topBarLeft">
              <div className="labelSmall">Добавить ребёнка</div>

              <div className="formGrid" style={{ marginTop: 10 }}>
                <label className="field">
                  <span>Email / reader_id</span>
                  <input
                    value={newChildId}
                    onChange={(e) => setNewChildId(e.target.value)}
                    placeholder="student@test.ru"
                  />
                </label>

                <label className="field">
                  <span>Имя ребёнка</span>
                  <input
                    value={newChildName}
                    onChange={(e) => setNewChildName(e.target.value)}
                    placeholder="Иван"
                  />
                </label>

                <label className="field">
                  <span>Класс</span>
                  <input
                    value={newChildClass}
                    onChange={(e) => setNewChildClass(e.target.value)}
                    placeholder="7Б"
                  />
                </label>
              </div>

              <div className="row" style={{ marginTop: 12 }}>
                <button className="primaryBtn" type="button" onClick={() => void addChild()}>
                  Добавить
                </button>

                <button
                  className="btn"
                  type="button"
                  onClick={() => void loadChildren()}
                  disabled={childrenLoading}
                >
                  Обновить детей
                </button>

                <button
                  className="btn"
                  type="button"
                  onClick={() => void refresh()}
                  disabled={!cid || anyLoading}
                >
                  Обновить данные
                </button>
              </div>

              {childrenError && <div className="error">{childrenError}</div>}
            </div>

            <div className="topBarRight">
              <MiniInfo title="Детей" value={String(children.length)} />
              <MiniInfo title="Выбран" value={selectedChild?.child_name || selectedChild?.child_id || "—"} />
            </div>
          </div>

          <div className="tabsRow">
            <button
              className={`tabBtn ${tab === "children" ? "tabBtnActive" : ""}`}
              onClick={() => setTab("children")}
              type="button"
            >
              Дети
            </button>
            <button
              className={`tabBtn ${tab === "overview" ? "tabBtnActive" : ""}`}
              onClick={() => setTab("overview")}
              type="button"
            >
              Аналитика
            </button>
            <button
              className={`tabBtn ${tab === "texts" ? "tabBtnActive" : ""}`}
              onClick={() => setTab("texts")}
              type="button"
            >
              Тексты
            </button>
            <button
              className={`tabBtn ${tab === "support" ? "tabBtnActive" : ""}`}
              onClick={() => setTab("support")}
              type="button"
            >
              Советы
            </button>
          </div>

          {tab === "children" && (
            <div style={{ marginTop: 14 }}>
              {childrenLoading ? (
                <div className="panel">
                  <div className="muted">Загрузка детей…</div>
                </div>
              ) : children.length === 0 ? (
                <div className="panel">
                  <div className="muted">
                    Пока нет добавленных детей. Добавьте ребёнка по email или reader_id.
                  </div>
                </div>
              ) : (
                <div className="childrenGrid">
                  {children.map((child) => {
                    const active = child.child_id === selectedChildId;

                    return (
                      <div
                        key={`${child.parent_email}-${child.child_id}`}
                        className={`childCard ${active ? "childCardActive" : ""}`}
                      >
                        <div className="childCardTop">
                          <div>
                            <div className="childCardName">{child.child_name || "Без имени"}</div>
                            <div className="muted">{child.child_id}</div>
                          </div>

                          <div className="childAvatar">
                            {(child.child_name?.[0] || child.child_id?.[0] || "U").toUpperCase()}
                          </div>
                        </div>

                        <div className="childMetaList">
                          <div className="childMetaRow">
                            <span>Класс</span>
                            <b>{child.class_name || "—"}</b>
                          </div>
                          <div className="childMetaRow">
                            <span>Возраст</span>
                            <b>{active ? age : "—"}</b>
                          </div>
                          <div className="childMetaRow">
                            <span>Анкет</span>
                            <b>{active ? meta?.test_count ?? 0 : "—"}</b>
                          </div>
                          <div className="childMetaRow">
                            <span>Текстов</span>
                            <b>{active ? meta?.text_count ?? 0 : "—"}</b>
                          </div>
                        </div>

                        <div className="tableActions" style={{ marginTop: 14 }}>
                          <button
                            className="btn"
                            type="button"
                            onClick={() => selectChild(child.child_id)}
                          >
                            {active ? "Выбран" : "Открыть"}
                          </button>
                          <button
                            className="dangerBtn"
                            type="button"
                            onClick={() => void removeChild(child.child_id)}
                          >
                            Удалить
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {selectedChild && (
                <>
                  <div className="summaryBar">
                    <SummaryCard title="Ребёнок" value={selectedChild.child_name || "—"} />
                    <SummaryCard title="Класс" value={selectedChild.class_name || "—"} />
                    <SummaryCard title="Возраст" value={String(age)} />
                    <SummaryCard title="Анкет" value={String(meta?.test_count ?? 0)} />
                    <SummaryCard title="Текстов" value={String(meta?.text_count ?? 0)} />
                    <SummaryCard title="Событий" value={String(history?.length ?? 0)} />
                  </div>

                  <div className="panel" style={{ marginTop: 14 }}>
                    <div className="panelTitle">Короткие выводы</div>
                    <ul className="softList">
                      {parentInsights.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </div>
          )}

          {tab === "overview" && (
            <div className="overviewGrid">
              <div className="panel">
                <div className="panelTitle">Профиль ребёнка</div>

                {anyLoading && <div className="muted" style={{ marginTop: 10 }}>Загрузка…</div>}
                {profileErr && <div className="error">{profileErr}</div>}
                {gapsErr && <div className="error">{gapsErr}</div>}

                <div className="subTitle">Основная информация</div>
                <div className="chips">
                  <span className="chip">{selectedChild?.child_name || "—"}</span>
                  <span className="chip">{selectedChild?.child_id || "—"}</span>
                  <span className="chip">{selectedChild?.class_name || "Класс не указан"}</span>
                </div>

                <div className="subTitle" style={{ marginTop: 14 }}>
                  Ведущие темы
                </div>
                <div className="chips">
                  {top.length === 0 ? (
                    <span className="muted">Нет данных</span>
                  ) : (
                    top.map(([k, v]) => (
                      <span key={k} className="chip">
                        {k} • {fmt01(v)}
                      </span>
                    ))
                  )}
                </div>

                <div className="subTitle" style={{ marginTop: 14 }}>
                  Что стоит развивать
                </div>
                <div className="chips">
                  {deficitTop.length === 0 ? (
                    <span className="muted">Выраженных дефицитов пока нет</span>
                  ) : (
                    deficitTop.map((g) => (
                      <span key={g.concept} className="chip chipWarn">
                        {g.concept} • {fmt01(g.gap)}
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
                      <span key={g.concept} className="chip chipOk">
                        {g.concept} • +{fmt01(Math.abs(g.gap))}
                      </span>
                    ))
                  )}
                </div>

                <div className="subTitle" style={{ marginTop: 14 }}>
                  Метаданные
                </div>

                {metaLoading && <div className="muted">Загрузка метаданных…</div>}
                {metaErr && <div className="note">{metaErr}</div>}

                {meta && (
                  <div className="note">
                    <div className="metaLine">
                      Тестов: <b>{meta.test_count}</b>
                    </div>
                    <div className="metaLine">
                      Текстов: <b>{meta.text_count}</b>
                    </div>
                    <div className="metaLine">
                      Последнее обновление: <b>{fmtDT(meta.last_update_at)}</b>
                    </div>
                    <div className="metaLine">
                      Источник: <b>{friendlySourceName(meta.last_source)}</b>
                    </div>
                    <div className="metaLine">
                      Последняя анкета: <b>{fmtDT(meta.last_test_at)}</b>
                    </div>
                    <div className="metaLine">
                      Последний текст: <b>{fmtDT(meta.last_text_at)}</b>
                    </div>
                  </div>
                )}
              </div>

              <div className="panel">
                <div className="panelTitle">Рекомендации книг</div>

                <div className="row" style={{ marginTop: 10 }}>
                  <button
                    className="btn"
                    onClick={() => void refresh()}
                    disabled={anyLoading || !cid}
                    type="button"
                  >
                    Обновить
                  </button>
                  {recsLoading && <span className="muted">Загрузка…</span>}
                </div>

                {recsErr && <div className="error">{recsErr}</div>}

                {!recsLoading && (!recs || recs.length === 0) && !recsErr && (
                  <div className="muted" style={{ marginTop: 10 }}>
                    Пока нет рекомендаций. Пусть ребёнок пройдёт анкету или добавит текст.
                  </div>
                )}

                <div className="recsList">
                  {(recs ?? []).map((item) => (
                    <RecommendationCard key={item.work.id} item={item} maxScore={maxScore} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "texts" && (
            <div className="textsGrid">
              <div className="panel">
                <div className="panelTitle">Тексты ребёнка</div>
                <div className="muted" style={{ marginTop: 8 }}>
                  Здесь показываются загруженные тексты и краткие результаты анализа.
                </div>

                {!selectedChild ? (
                  <div className="note">Сначала выберите ребёнка во вкладке «Дети».</div>
                ) : historyLoading ? (
                  <div className="muted" style={{ marginTop: 10 }}>Загрузка текстов…</div>
                ) : textEvents.length === 0 ? (
                  <div className="note">У этого ребёнка пока нет загруженных текстов.</div>
                ) : (
                  <div className="textsList">
                    {textEvents.map((ev) => (
                      <TextEventCard key={ev.id} ev={ev} />
                    ))}
                  </div>
                )}
              </div>

              <div className="panel">
                <div className="panelTitle">История активности</div>

                {historyLoading && <div className="muted">Загрузка истории…</div>}
                {historyErr && <div className="note">{historyErr}</div>}

                {!historyLoading && (!history || history.length === 0) && (
                  <div className="muted" style={{ marginTop: 10 }}>
                    История пока пустая.
                  </div>
                )}

                <div className="histList">
                  {(history ?? []).slice(0, 10).map((ev) => (
                    <HistoryCard key={ev.id} ev={ev} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "support" && (
            <div className="supportGrid">
              <div className="panel">
                <div className="panelTitle">Подсказки родителю</div>
                <div className="muted" style={{ marginTop: 8 }}>
                  Простые идеи, как поддержать развитие важных тем через чтение и обсуждение.
                </div>

                <div style={{ marginTop: 12 }}>
                  {supportTips.length === 0 ? (
                    <div className="muted">
                      Дефицитов не найдено - можно поддерживать привычку чтения и обсуждать сильные стороны ребёнка.
                    </div>
                  ) : (
                    <div className="tipsList">
                      {supportTips.map((t) => (
                        <div key={t.title} className="tipCard">
                          <div className="tipTitle">{t.title}</div>
                          <ul className="ul" style={{ marginTop: 8 }}>
                            {t.items.map((x, i) => (
                              <li key={i}>{x}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="panel">
                <div className="panelTitle">Как читать отчёт</div>
                <ul className="ul" style={{ marginTop: 10 }}>
                  <li><b>Что стоит развивать</b> - темы, на которые полезно обратить внимание сейчас.</li>
                  <li><b>Сильные стороны</b> - то, что уже проявляется у ребёнка хорошо.</li>
                  <li><b>Рекомендации</b> - книги, которые помогают развивать нужные темы.</li>
                  <li><b>История</b> - анкеты и тексты, которые постепенно уточняют профиль.</li>
                </ul>

               
              </div>
            </div>
          )}
        </div>
      </div>

      <StyleBlock />
    </div>
  );
}

function MiniInfo({ title, value }: { title: string; value: string }) {
  return (
    <div className="miniCard">
      <div className="miniTitle">{title}</div>
      <div className="miniValue">{value}</div>
    </div>
  );
}

function SummaryCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="summaryCard">
      <div className="summaryTitle">{title}</div>
      <div className="summaryValue">{value}</div>
    </div>
  );
}

function RecommendationCard({
  item,
  maxScore,
}: {
  item: ExplainedRecommendation;
  maxScore: number;
}) {
  const gaps = Array.isArray((item as any)?.why?.gaps) ? (item as any).why.gaps : [];

  const percent = useMemo(() => {
    const s = Number((item as any)?.why?.score ?? 0);
    if (!Number.isFinite(s) || s <= 0 || !Number.isFinite(maxScore) || maxScore <= 0) {
      return 0;
    }
    return Math.round((s / maxScore) * 100);
  }, [item, maxScore]);

  const tags = useMemo(() => {
    const c = (item as any)?.work?.concepts ?? {};
    const arr = safeEntries(c);
    arr.sort((a, b) => b[1] - a[1]);
    return arr.slice(0, 3).map(([k]) => k);
  }, [item]);

  const deficitHits = useMemo(() => {
    return gaps
      .filter((g: any) => Number(g.gap) > 0)
      .slice(0, 3)
      .map((g: any) => (g.via ? `${g.concept} (через ${g.via})` : g.concept));
  }, [gaps]);

  return (
    <div className="recCard">
      <div className="recTop">
        <div className="recTitle">{item.work.title}</div>
        <div className="muted">
          {item.work.author} • {item.work.age} • <b>{percent}%</b> •{" "}
          {modeLabel((item as any)?.why?.mode)}
        </div>
      </div>

      <div className="chips" style={{ marginTop: 10 }}>
        {tags.map((t) => (
          <span key={t} className="chip">
            {t}
          </span>
        ))}
      </div>

      <div className="muted" style={{ marginTop: 10 }}>
        {deficitHits.length > 0 ? (
          <>
            Поддерживает темы: <b>{deficitHits.join(", ")}</b>
          </>
        ) : (
          <>Подходит для углубления сильных тем.</>
        )}
      </div>
    </div>
  );
}

function HistoryCard({ ev }: { ev: ProfileEvent }) {
  const kind = ev.type === "test" ? "Анкета" : "Текст";
  const when = fmtDT(ev.created_at);

  const payloadConcepts: Record<string, number> | undefined =
    (ev as any)?.payload?.test_concepts ??
    (ev as any)?.payload?.concepts ??
    (ev as any)?.payload?.concepts01;

  const afterConcepts: Record<string, number> | undefined =
    (ev as any)?.profile_after?.concepts ?? (ev as any)?.profile_after?.concepts01;

  const topPayload = useMemo(() => topConcepts(payloadConcepts, 4), [payloadConcepts]);
  const topAfter = useMemo(() => topConcepts(afterConcepts, 4), [afterConcepts]);

  return (
    <div className="histCard">
      <div className="histTop">
        <div className="histTitle"><b>{kind}</b></div>
        <div className="muted">{when}</div>
      </div>

      <div className="muted" style={{ marginTop: 8 }}>
        {topPayload.length > 0 && (
          <>
            Вход (топ): <b>{topPayload.map(([k, v]) => `${k} ${fmt01(v)}`).join(", ")}</b>
            <br />
          </>
        )}
        {topAfter.length > 0 && (
          <>
            Профиль после: <b>{topAfter.map(([k, v]) => `${k} ${fmt01(v)}`).join(", ")}</b>
          </>
        )}
        {topPayload.length === 0 && topAfter.length === 0 && <>Событие сохранено.</>}
      </div>
    </div>
  );
}

function TextEventCard({ ev }: { ev: ProfileEvent }) {
  const when = fmtDT(ev.created_at);

  const payloadConcepts: Record<string, number> | undefined =
    (ev as any)?.payload?.concepts ??
    (ev as any)?.payload?.concepts01 ??
    (ev as any)?.payload?.text_concepts;

  const afterConcepts: Record<string, number> | undefined =
    (ev as any)?.profile_after?.concepts ?? (ev as any)?.profile_after?.concepts01;

  const topPayload = topConcepts(payloadConcepts, 6);
  const topAfter = topConcepts(afterConcepts, 6);
  const preview = extractTextPreview(ev);

  return (
    <div className="textCard">
      <div className="textCardTop">
        <div>
          <div className="textCardTitle">Текст ребёнка</div>
          <div className="muted">{when}</div>
        </div>
        <span className="chip chipSoftBlue">Анализ текста</span>
      </div>

      <div className="subTitle" style={{ marginTop: 12 }}>
        Фрагмент текста
      </div>

      <div className="textPreview">
        {preview || "Полный текст пока недоступен в истории. Позже сюда можно подключить отдельный API текстов."}
      </div>

      <div className="subTitle" style={{ marginTop: 12 }}>
        Темы, найденные в тексте
      </div>

      <div className="chips">
        {topPayload.length === 0 ? (
          <span className="muted">Нет данных</span>
        ) : (
          topPayload.map(([k, v]) => (
            <span key={k} className="chip">
              {k} • {fmt01(v)}
            </span>
          ))
        )}
      </div>

      <div className="subTitle" style={{ marginTop: 12 }}>
        Профиль после анализа
      </div>

      <div className="chips">
        {topAfter.length === 0 ? (
          <span className="muted">Нет данных</span>
        ) : (
          topAfter.map(([k, v]) => (
            <span key={k} className="chip chipOk">
              {k} • {fmt01(v)}
            </span>
          ))
        )}
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
        width: min(96vw, 1600px);
        margin: 0 auto;
      }

      .card {
        background: #fff;
        border-radius: 18px;
        box-shadow: 0 10px 28px rgba(0,0,0,.07);
        padding: 18px;
      }

      .headerRow {
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:14px;
        flex-wrap: wrap;
      }

      .brandBlock {
        display:grid;
        gap:4px;
      }

      .h1 {
        font-size: 28px;
        font-weight: 900;
        letter-spacing: .2px;
      }

      .muted {
        color: rgba(20,25,35,.65);
      }

      .labelSmall {
        font-size: 13px;
        font-weight: 750;
        color: rgba(20,25,35,.8);
      }

      .topBar {
        margin-top: 14px;
        border: 1px solid rgba(0,0,0,.08);
        border-radius: 16px;
        padding: 12px;
        display:flex;
        justify-content: space-between;
        gap: 14px;
        background: rgba(255,255,255,.95);
      }

      .topBarLeft {
        flex: 1;
        min-width: 320px;
      }

      .topBarRight {
        display:flex;
        gap:10px;
        align-items: stretch;
        flex-wrap: wrap;
      }

      .miniCard,
      .summaryCard {
        border: 1px solid rgba(0,0,0,.08);
        border-radius: 14px;
        padding: 10px 12px;
        background: #fff;
      }

      .miniCard {
        min-width: 150px;
      }

      .miniTitle,
      .summaryTitle {
        font-size: 12px;
        color: rgba(20,25,35,.62);
        font-weight: 700;
      }

      .miniValue {
        margin-top: 6px;
        font-size: 18px;
        font-weight: 850;
      }

      .summaryValue {
        margin-top: 6px;
        font-size: 20px;
        font-weight: 900;
        color: rgba(20,25,35,.92);
        word-break: break-word;
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

      .panelTitle {
        font-weight: 900;
        letter-spacing: .2px;
      }

      .subTitle {
        margin-top: 10px;
        font-weight: 700;
        font-size: 13px;
        color: rgba(20,25,35,.7);
      }

      .row,
      .tableActions {
        display:flex;
        gap:10px;
        align-items:center;
        flex-wrap: wrap;
      }

      .formGrid {
        display:grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
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

      .field input {
        border: 1px solid rgba(0,0,0,.12);
        border-radius: 12px;
        padding: 10px 12px;
        font-size: 14px;
        outline: none;
        width: 100%;
        background: #fff;
      }

      .btn, .primaryBtn, .dangerBtn {
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

      .chipWarn {
        border-color: rgba(240,140,40,.35);
        background: rgba(240,140,40,.12);
      }

      .chipOk {
        border-color: rgba(40,170,120,.30);
        background: rgba(40,170,120,.10);
      }

      .chipSoftBlue {
        border-color: rgba(60,110,255,.22);
        background: rgba(60,110,255,.08);
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

      .childrenGrid {
        display:grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap:14px;
      }

      .childCard {
        border: 1px solid rgba(0,0,0,.08);
        border-radius: 18px;
        padding: 14px;
        background: #fff;
        box-shadow: 0 8px 24px rgba(0,0,0,.04);
      }

      .childCardActive {
        border-color: rgba(60,110,255,.45);
        box-shadow: 0 0 0 4px rgba(60,110,255,.10);
      }

      .childCardTop {
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:12px;
      }

      .childCardName {
        font-size: 18px;
        font-weight: 850;
        color: rgba(20,25,35,.92);
      }

      .childAvatar {
        width: 42px;
        height: 42px;
        border-radius: 50%;
        display:flex;
        align-items:center;
        justify-content:center;
        background: rgba(60,110,255,.10);
        color: rgba(40,70,160,.95);
        font-weight: 900;
        border: 1px solid rgba(60,110,255,.18);
      }

      .childMetaList {
        display:grid;
        gap:8px;
        margin-top: 14px;
      }

      .childMetaRow {
        display:flex;
        justify-content:space-between;
        gap:12px;
        font-size: 14px;
        color: rgba(20,25,35,.82);
      }

      .summaryBar {
        margin-top: 14px;
        display:grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap:12px;
      }

      .overviewGrid {
        margin-top: 14px;
        display:grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
      }

      .textsGrid,
      .supportGrid {
        margin-top: 14px;
        display:grid;
        grid-template-columns: 1.2fr .8fr;
        gap: 14px;
      }

      .metaLine {
        margin-top: 4px;
        color: rgba(20,25,35,.8);
      }

      .softList,
      .ul {
        margin: 10px 0 0 18px;
        color: rgba(20,25,35,.80);
        line-height: 1.5;
      }

      .recsList,
      .histList,
      .textsList,
      .tipsList {
        display:flex;
        flex-direction: column;
        gap:12px;
        margin-top: 10px;
      }

      .recCard,
      .histCard,
      .textCard,
      .tipCard {
        border: 1px solid rgba(0,0,0,.08);
        border-radius: 16px;
        padding: 14px;
        background: #fff;
      }

      .recTop {
        display:flex;
        flex-direction: column;
        gap:4px;
      }

      .recTitle {
        font-weight: 850;
        font-size: 18px;
      }

      .histTop,
      .textCardTop {
        display:flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        flex-wrap: wrap;
      }

      .histTitle,
      .tipTitle {
        font-weight: 800;
      }

      .textCardTitle {
        font-size: 17px;
        font-weight: 850;
        color: rgba(20,25,35,.92);
      }

      .textPreview {
        margin-top: 8px;
        padding: 12px 14px;
        border-radius: 14px;
        background: rgba(20,25,35,.035);
        border: 1px solid rgba(0,0,0,.06);
        color: rgba(20,25,35,.84);
        line-height: 1.55;
        white-space: pre-wrap;
      }

      @media (max-width: 1280px) {
        .childrenGrid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .summaryBar {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .overviewGrid,
        .textsGrid,
        .supportGrid {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 980px) {
        .topBar {
          flex-direction: column;
        }

        .topBarRight {
          justify-content: flex-start;
        }

        .formGrid {
          grid-template-columns: 1fr;
        }

        .summaryBar {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 700px) {
        .childrenGrid,
        .summaryBar {
          grid-template-columns: 1fr;
        }
      }
    `}</style>
  );
}