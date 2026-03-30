// src/pages/dashboards/TeacherStudent.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getUser, logout, roleHome } from "../../auth";
import {
  apiGetProfile,
  apiGetGaps,
  apiGetRecommendationsExplain,
  apiGetProfileHistory,
  type ReaderProfile,
  type GapSummaryItem,
  type ExplainedRecommendation,
  type ProfileEvent,
} from "../../api/backend";

type Status =
  | { kind: "idle" }
  | { kind: "loading"; text: string }
  | { kind: "ok"; text: string }
  | { kind: "error"; text: string };

function fmtDT(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

function sourceLabel(type?: string | null) {
  if (type === "test") return "Анкета";
  if (type === "text") return "Анализ текста";
  return type || "Событие";
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

export default function TeacherStudent() {
  const nav = useNavigate();
  const me = getUser();
  const params = useParams();

  const studentId = decodeURIComponent(params.id ?? "");

  const [profile, setProfile] = useState<ReaderProfile | null>(null);
  const [gaps, setGaps] = useState<GapSummaryItem[]>([]);
  const [recs, setRecs] = useState<ExplainedRecommendation[]>([]);
  const [history, setHistory] = useState<ProfileEvent[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!me) {
      nav("/login", { replace: true });
      return;
    }
    if (me.role !== "teacher") {
      nav(roleHome(me.role), { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const topDeficits = useMemo(() => {
    return gaps
      .filter((g) => g.direction === "below")
      .slice()
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 8);
  }, [gaps]);

  const strengths = useMemo(() => {
    return gaps
      .filter((g) => g.direction === "above")
      .slice()
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 8);
  }, [gaps]);

  const profileConceptCount = profile?.concepts ? Object.keys(profile.concepts).length : 0;

  function setLoadingStatus(text: string) {
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

  async function loadAll() {
    if (!studentId) {
      setErr("Не передан id ученика");
      return;
    }

    try {
      setLoading(true);
      setLoadingStatus("Загружаю профиль ученика…");

      const p = await apiGetProfile(studentId).catch(() => null);
      setProfile(p);

      const [g, r, h] = await Promise.all([
        apiGetGaps(studentId),
        apiGetRecommendationsExplain(studentId, 5),
        apiGetProfileHistory(studentId, 20),
      ]);

      setGaps(Array.isArray(g) ? g : []);
      setRecs(Array.isArray(r) ? r : []);
      setHistory(Array.isArray(h) ? h : []);

      setOk("Данные ученика обновлены");
    } catch (e) {
      setErr(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

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
                <div className="h1">Карточка ученика</div>
                <div className="muted">
                  Профиль, дефициты, рекомендации и история активности.
                </div>
              </div>
            </div>

            <div className="row">
              <button className="btn" type="button" onClick={() => nav("/teacher")}>
                ← К кабинету учителя
              </button>

              <button className="btn" type="button" onClick={() => void loadAll()} disabled={loading}>
                Обновить
              </button>

              <button
                className="btn"
                type="button"
                onClick={() => {
                  logout();
                  nav("/login", { replace: true });
                }}
                title={me?.email ?? ""}
              >
                Выйти
              </button>
            </div>
          </div>

          {status.kind !== "idle" && <div style={statusBoxStyle(status)}>{status.text}</div>}

          <div className="classBar">
            <div className="classBarLeft">
              <div className="labelSmall">Ученик</div>
              <div className="studentIdentity">
                <div className="studentAvatar">{studentId.slice(0, 1).toUpperCase() || "U"}</div>
                <div>
                  <div className="studentName">{studentId}</div>
                  <div className="muted">Индивидуальная аналитика по читательскому профилю</div>
                </div>
              </div>
            </div>

            <div className="classBarRight">
              <div className="miniCard">
                <div className="miniTitle">Возраст</div>
                <div className="miniValue">{profile?.age ?? "—"}</div>
              </div>
              <div className="miniCard">
                <div className="miniTitle">Концептов</div>
                <div className="miniValue">{profileConceptCount}</div>
              </div>
              <div className="miniCard">
                <div className="miniTitle">История событий</div>
                <div className="miniValue">{history.length}</div>
              </div>
            </div>
          </div>

          <div className="statsGrid">
            <StatCard title="Дефицитов" value={gaps.filter((g) => g.direction === "below").length} />
            <StatCard title="Сильных сторон" value={gaps.filter((g) => g.direction === "above").length} />
            <StatCard title="Рекомендаций" value={recs.length} />
            <StatCard title="Событий профиля" value={history.length} />
          </div>

          <div className="analyticsGrid">
            <div className="panel">
              <div className="panelTitle">Топ-дефициты</div>

              {!topDeficits.length ? (
                <div className="muted" style={{ marginTop: 10 }}>
                  Пока нет выраженных дефицитов или профиль ещё не заполнен.
                </div>
              ) : (
                <div className="sourceList">
                  {topDeficits.map((d) => (
                    <MetricRow key={d.concept} label={d.concept} value={d.gap} />
                  ))}
                </div>
              )}
            </div>

            <div className="panel">
              <div className="panelTitle">Сильные стороны</div>

              {!strengths.length ? (
                <div className="muted" style={{ marginTop: 10 }}>
                  Пока нет данных о сильных сторонах.
                </div>
              ) : (
                <div className="sourceList">
                  {strengths.map((d) => (
                    <MetricRow key={d.concept} label={d.concept} value={d.gap} positive />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="panel" style={{ marginTop: 14 }}>
            <div className="panelTitle">Рекомендации по чтению</div>

            {!recs.length ? (
              <div className="note" style={{ marginTop: 12 }}>
                Рекомендации пока не найдены. Обычно это происходит, если профиль ещё пустой
                или система не нашла подходящие произведения по возрасту и концептам.
              </div>
            ) : (
              <div className="recommendationsGrid">
                {recs.map((x) => (
                  <div key={x.work.id} className="recCard">
                    <div className="recTitle">{x.work.title}</div>
                    <div className="recMeta">
                      {x.work.author} • возраст: {x.work.age}
                    </div>

                    <div className="whyBox">
                      <div className="whyLabel">Почему рекомендуется</div>
                      <div className="whyText">
                        {x.why?.deficits?.length
                          ? `Помогает развивать: ${x.why.deficits
                              .slice(0, 4)
                              .map((d) => `${d.concept} (${d.deficit.toFixed(2)})`)
                              .join(", ")}`
                          : "Недостаточно данных для подробного объяснения."}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="panel" style={{ marginTop: 14 }}>
            <div className="panelTitle">История активности</div>

            {history.length === 0 ? (
              <div className="muted" style={{ marginTop: 10 }}>
                История пока пустая.
              </div>
            ) : (
              <div style={{ overflowX: "auto", marginTop: 12 }}>
                <table style={{ width: "100%", minWidth: 760, borderCollapse: "separate", borderSpacing: 0 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Тип</th>
                      <th style={thStyle}>Дата</th>
                      <th style={thStyle}>Концептов после события</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((e) => (
                      <tr key={e.id}>
                        <td style={tdStyle}>{sourceLabel(e.type)}</td>
                        <td style={tdStyle}>{fmtDT(e.created_at)}</td>
                        <td style={tdStyle}>
                          {e.profile_after?.concepts ? Object.keys(e.profile_after.concepts).length : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <StyleBlock />
    </div>
  );
}

function StatCard({ title, value }: { title: string; value?: number | string }) {
  return (
    <div className="statCard">
      <div className="statTitle">{title}</div>
      <div className="statValue">{value ?? "—"}</div>
    </div>
  );
}

function MetricRow({
  label,
  value,
  positive,
}: {
  label: string;
  value: number;
  positive?: boolean;
}) {
  return (
    <div className="metricRow">
      <div className="metricRowTop">
        <span>{label}</span>
        <b>{value.toFixed(3)}</b>
      </div>
      <div className="metricTrack">
        <div className={`metricFill ${positive ? "metricFillPositive" : ""}`} style={{ width: "100%" }} />
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
        flex-wrap: wrap;
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

      .btn, .primaryBtn {
        border-radius: 12px;
        border: 1px solid rgba(0,0,0,.12);
        padding: 9px 12px;
        cursor: pointer;
        background: #fff;
        font-weight: 700;
      }

      .btn:disabled, .primaryBtn:disabled {
        opacity: .6;
        cursor: default;
      }

      .row {
        display:flex;
        gap:10px;
        align-items:center;
        flex-wrap: wrap;
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

      .classBarRight {
        display:flex;
        gap:10px;
        align-items: stretch;
        flex-wrap: wrap;
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

      .labelSmall {
        font-size: 13px;
        font-weight: 750;
        color: rgba(20,25,35,.8);
      }

      .studentIdentity {
        display:flex;
        gap:12px;
        align-items:center;
        margin-top: 8px;
      }

      .studentAvatar {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        display:flex;
        align-items:center;
        justify-content:center;
        font-weight: 900;
        background: rgba(60,110,255,.10);
        border: 1px solid rgba(60,110,255,.18);
        color: rgba(40,70,160,.95);
      }

      .studentName {
        font-size: 18px;
        font-weight: 850;
        color: rgba(20,25,35,.92);
        word-break: break-word;
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

      .sourceList {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-top: 10px;
      }

      .metricRow {
        display: grid;
        gap: 6px;
      }

      .metricRowTop {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        font-size: 14px;
        color: rgba(20,25,35,.82);
      }

      .metricTrack {
        height: 10px;
        border-radius: 999px;
        background: rgba(0,0,0,.06);
        overflow: hidden;
      }

      .metricFill {
        height: 100%;
        border-radius: 999px;
        background: linear-gradient(90deg, rgba(220,90,110,.72), rgba(255,170,120,.72));
      }

      .metricFillPositive {
        background: linear-gradient(90deg, rgba(60,110,255,.75), rgba(80,200,170,.75));
      }

      .recommendationsGrid {
        margin-top: 12px;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .recCard {
        border: 1px solid rgba(0,0,0,.08);
        border-radius: 16px;
        padding: 14px;
        background: #fff;
      }

      .recTitle {
        font-size: 18px;
        font-weight: 850;
        color: rgba(20,25,35,.92);
      }

      .recMeta {
        margin-top: 6px;
        color: rgba(20,25,35,.65);
        font-size: 14px;
      }

      .whyBox {
        margin-top: 12px;
        border: 1px dashed rgba(60,110,255,.32);
        border-radius: 12px;
        padding: 10px 12px;
        background: rgba(60,110,255,.05);
      }

      .whyLabel {
        font-size: 12px;
        font-weight: 800;
        color: rgba(40,70,160,.92);
        text-transform: uppercase;
        letter-spacing: .3px;
      }

      .whyText {
        margin-top: 6px;
        font-size: 14px;
        color: rgba(20,25,35,.82);
        line-height: 1.45;
      }

      .note {
        margin-top: 12px;
        padding: 10px 12px;
        border: 1px dashed rgba(60,110,255,.35);
        border-radius: 12px;
        background: rgba(60,110,255,.06);
      }

      @media (max-width: 1180px) {
        .statsGrid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .analyticsGrid {
          grid-template-columns: 1fr;
        }

        .recommendationsGrid {
          grid-template-columns: 1fr;
        }

        .classBar {
          flex-direction: column;
        }
      }

      @media (max-width: 700px) {
        .statsGrid {
          grid-template-columns: 1fr;
        }
      }
    `}</style>
  );
}