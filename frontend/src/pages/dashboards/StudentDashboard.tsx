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
import { toCoverUrl } from "../../config/backend";

type TabKey = "account" | "texts" | "test" | "results" | "read";

type UserTextItem = {
  id: string;
  title: string;
  text: string;
  created_at: string;
};

const LS_USER_TEXTS_KEY = "rp_user_texts_v1";
const LS_TEST_DRAFT_KEY = "rp_test_draft_v1";

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

function prettyConceptName(name: string) {
  return String(name || "")
    .replaceAll("_", " ")
    .trim();
}

function conceptLevelLabel(value: number) {
  if (value >= 0.8) return "СЏСЂРєРѕ РІС‹СЂР°Р¶РµРЅРѕ";
  if (value >= 0.6) return "С…РѕСЂРѕС€Рѕ СЂР°Р·РІРёС‚Рѕ";
  if (value >= 0.4) return "СЂР°Р·РІРёРІР°РµС‚СЃСЏ";
  if (value >= 0.2) return "РїРѕРєР° РІС‹СЂР°Р¶РµРЅРѕ СЃР»Р°Р±Рѕ";
  return "РїРѕРєР° РїРѕС‡С‚Рё РЅРµ РїСЂРѕСЏРІР»РµРЅРѕ";
}

function growthNeedLabel(gap: number) {
  if (gap >= 0.45) return "СЃС‚РѕРёС‚ СѓРґРµР»РёС‚СЊ РѕСЃРѕР±РѕРµ РІРЅРёРјР°РЅРёРµ";
  if (gap >= 0.3) return "Р¶РµР»Р°С‚РµР»СЊРЅРѕ СѓСЃРёР»РёС‚СЊ";
  if (gap >= 0.15) return "РјРѕР¶РЅРѕ СЂР°Р·РІРёРІР°С‚СЊ РґР°Р»СЊС€Рµ";
  return "СЃР»РµРіРєР° РїСЂРѕСЃРµРґР°РµС‚";
}

function strengthLevelLabel(gap: number) {
  const v = Math.abs(gap);
  if (v >= 0.45) return "СЌС‚Рѕ СѓР¶Рµ СЃРёР»СЊРЅР°СЏ СЃС‚РѕСЂРѕРЅР°";
  if (v >= 0.25) return "РґРµСЂР¶РёС‚СЃСЏ СѓРІРµСЂРµРЅРЅРѕ";
  return "РІС‹СЂР°Р¶РµРЅРѕ РґРѕСЃС‚Р°С‚РѕС‡РЅРѕ СЃС‚Р°Р±РёР»СЊРЅРѕ";
}

function recommendationFitLabel(percent: number) {
  if (percent >= 85) return "РѕС‡РµРЅСЊ РїРѕРґС…РѕРґРёС‚";
  if (percent >= 70) return "С…РѕСЂРѕС€Рѕ РїРѕРґС…РѕРґРёС‚";
  if (percent >= 50) return "РјРѕР¶РµС‚ РїРѕРґРѕР№С‚Рё";
  return "Р·Р°РїР°СЃРЅРѕР№ РІР°СЂРёР°РЅС‚";
}

function fmtDT(iso: string | null | undefined) {
  if (!iso) return "вЂ”";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

function friendlySource(s: string | null | undefined) {
  if (!s) return "вЂ”";
  if (s === "test") return "РђРЅРєРµС‚Р°";
  if (s === "text") return "РўРµРєСЃС‚";
  if (s === "manual") return "Р’СЂСѓС‡РЅСѓСЋ";
  if (s === "book_review") return "РћС‚Р·С‹РІ РЅР° РєРЅРёРіСѓ";
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
  if (v <= 0) return "вЂ”";
  return "в…".repeat(v) + "в†".repeat(5 - v);
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
      setAccountMsg(e?.message ?? "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ Р»РёС‡РЅС‹Р№ РєР°Р±РёРЅРµС‚");
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

      setAccountMsg("РџСЂРѕС„РёР»СЊ СЃРѕС…СЂР°РЅС‘РЅ.");
      await refreshAll({ withHistory: historyOpen });
    } catch (e: any) {
      setAccountMsg(e?.message ?? "РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ РїСЂРѕС„РёР»СЊ");
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
      setProfileErr(e?.message ?? "РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕР»СѓС‡РёС‚СЊ РїСЂРѕС„РёР»СЊ");
    } finally {
      setProfileLoading(false);
    }
  }

  async function loadGrowth() {
    setGrowthLoading(true);
    setGrowthErr(null);
    try {
      if (!readerId) throw new Error("РќРµС‚ reader_id");
      const g = await apiGetProfileGrowth(readerId);
      setGrowth(g);
    } catch (e: any) {
      setGrowth(null);
      setGrowthErr(e?.message ?? "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ Р°РЅР°Р»РёС‚РёРєСѓ СЂРѕСЃС‚Р°");
    } finally {
      setGrowthLoading(false);
    }
  }

  async function loadGaps() {
    setGapsErr(null);
    setGapsLoading(true);
    try {
      if (!readerId) throw new Error("РќРµС‚ reader_id вЂ” РїРµСЂРµР·Р°Р№РґРё С‡РµСЂРµР· Р»РѕРіРёРЅ.");
      const list = await apiGetGaps(readerId);
      setGaps(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setGaps([]);
      setGapsErr(e?.message ?? "РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕР»СѓС‡РёС‚СЊ С‚РµРјС‹ РґР»СЏ СЂР°Р·РІРёС‚РёСЏ");
    } finally {
      setGapsLoading(false);
    }
  }

  async function loadRecommendations() {
    setRecsErr(null);
    setRecsLoading(true);
    try {
      if (!readerId) throw new Error("РќРµС‚ reader_id вЂ” РїРµСЂРµР·Р°Р№РґРё С‡РµСЂРµР· Р»РѕРіРёРЅ.");
      const list = await apiGetRecommendationsExplain(readerId, 5, 0);
      setRecs(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setRecs([]);
      setRecsErr(e?.message ?? "РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕР»СѓС‡РёС‚СЊ СЂРµРєРѕРјРµРЅРґР°С†РёРё");
    } finally {
      setRecsLoading(false);
    }
  }

  async function loadMeta() {
    setMetaErr(null);
    setMetaLoading(true);
    try {
      if (!readerId) throw new Error("РќРµС‚ reader_id вЂ” РїРµСЂРµР·Р°Р№РґРё С‡РµСЂРµР· Р»РѕРіРёРЅ.");
      const m = await apiGetProfileMeta(readerId);
      setMeta(m);
    } catch (e: any) {
      setMeta(null);
      setMetaErr(e?.message ?? "РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕР»СѓС‡РёС‚СЊ РјРµС‚Р°РґР°РЅРЅС‹Рµ");
    } finally {
      setMetaLoading(false);
    }
  }

  async function loadHistory(limit = 20) {
    setHistoryErr(null);
    setHistoryLoading(true);
    try {
      if (!readerId) throw new Error("РќРµС‚ reader_id вЂ” РїРµСЂРµР·Р°Р№РґРё С‡РµСЂРµР· Р»РѕРіРёРЅ.");
      const h = await apiGetProfileHistory(readerId, limit);
      const arr = Array.isArray(h) ? h : [];
      arr.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      setHistory(arr);
    } catch (e: any) {
      setHistory([]);
      setHistoryErr(e?.message ?? "РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕР»СѓС‡РёС‚СЊ РёСЃС‚РѕСЂРёСЋ");
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
      setReadBooksMsg(e?.message ?? "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РїСЂРѕС‡РёС‚Р°РЅРЅС‹Рµ РєРЅРёРіРё");
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
      setAnalyzeMsg("РўРµРєСЃС‚ СЃР»РёС€РєРѕРј РєРѕСЂРѕС‚РєРёР№ (РјРёРЅРёРјСѓРј ~30 СЃРёРјРІРѕР»РѕРІ).");
      return;
    }

    setAnalyzeLoading(true);
    try {
      await apiAnalyzeTextMe(body);

      const newItem: UserTextItem = {
        id: makeTextId(),
        title: textTitle.trim() || `РўРµРєСЃС‚ РѕС‚ ${new Date().toLocaleDateString()}`,
        text: body,
        created_at: new Date().toISOString(),
      };

      const nextTexts = [newItem, ...userTexts];
      setUserTexts(nextTexts);
      if (readerId) saveUserTexts(readerId, nextTexts);

      setAnalyzeMsg("РўРµРєСЃС‚ РїСЂРѕР°РЅР°Р»РёР·РёСЂРѕРІР°РЅ. РџСЂРѕС„РёР»СЊ РѕР±РЅРѕРІР»С‘РЅ.");
      setTextTitle("");
      setTextBody("");
      await refreshAll({ withHistory: true });
      setTab("results");
    } catch (e: any) {
      setAnalyzeMsg(e?.message ?? "РћС€РёР±РєР° Р°РЅР°Р»РёР·Р° С‚РµРєСЃС‚Р°");
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
      setSubmitTestMsg("РђРЅРєРµС‚Р° СЃРѕС…СЂР°РЅРµРЅР°. РџСЂРѕС„РёР»СЊ РѕР±РЅРѕРІР»С‘РЅ.");
      await refreshAll({ withHistory: true });
      setTab("results");
    } catch (e: any) {
      setSubmitTestMsg(e?.message ?? "РћС€РёР±РєР° СЃРѕС…СЂР°РЅРµРЅРёСЏ Р°РЅРєРµС‚С‹");
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
      setReadBooksMsg("РљРЅРёРіР° РґРѕР±Р°РІР»РµРЅР° РІ РїСЂРѕС‡РёС‚Р°РЅРЅС‹Рµ.");
      await refreshAll({ withHistory: true });
      setTab("read");
    } catch (e: any) {
      setReadBooksMsg(e?.message ?? "РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ РєРЅРёРіСѓ");
    } finally {
      setSaveReadLoading(false);
    }
  }

  async function onDeleteReadBook(id: number) {
    const ok = window.confirm("РЈРґР°Р»РёС‚СЊ РєРЅРёРіСѓ РёР· РїСЂРѕС‡РёС‚Р°РЅРЅС‹С…?");
    if (!ok) return;

    try {
      await apiStudentDeleteReadBook(id);
      await refreshAll({ withHistory: true });
    } catch (e: any) {
      setReadBooksMsg(e?.message ?? "РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ РєРЅРёРіСѓ");
    }
  }

  const top = useMemo(() => topConcepts(profile?.concepts, 10), [profile]);
  const hasMeaningfulProfile = useMemo(() => {
    const concepts = profile?.concepts ?? {};
    const values = Object.values(concepts).map(Number).filter(Number.isFinite);
    return values.length > 0 && values.some((v) => v > 1e-6);
  }, [profile]);

  const growthTopicsTop = useMemo(() => {
    return (gaps ?? []).filter((g) => g.direction === "below" && g.gap > 0).slice(0, 5);
  }, [gaps]);

  const strengthsTop = useMemo(() => {
    return (gaps ?? []).filter((g) => g.direction === "above" && g.gap < 0).slice(0, 3);
  }, [gaps]);

  const profileHighlights = useMemo(() => {
    return top.slice(0, 3).map(([concept, value]) => ({
      concept: prettyConceptName(concept),
      note: conceptLevelLabel(value),
    }));
  }, [top]);

  const growthHighlights = useMemo(() => {
    return growthTopicsTop.slice(0, 3).map((g) => ({
      concept: prettyConceptName(g.concept),
      note: growthNeedLabel(g.gap),
    }));
  }, [growthTopicsTop]);

  const strengthHighlights = useMemo(() => {
    return strengthsTop.slice(0, 3).map((g) => ({
      concept: prettyConceptName(g.concept),
      note: strengthLevelLabel(g.gap),
    }));
  }, [strengthsTop]);

  const growthTopicsHint = useMemo(() => {
    return "РўРµРјС‹ РґР»СЏ СЂР°Р·РІРёС‚РёСЏ - СЌС‚Рѕ С†РµРЅРЅРѕСЃС‚Рё, РєРѕС‚РѕСЂС‹Рµ РїРѕРєР° РІС‹СЂР°Р¶РµРЅС‹ СЃР»Р°Р±РµРµ С†РµР»РµРІРѕРіРѕ СѓСЂРѕРІРЅСЏ РґР»СЏ РІРѕР·СЂР°СЃС‚Р°. Р РµРєРѕРјРµРЅРґР°С†РёРё РїРѕРґР±РёСЂР°СЋС‚СЃСЏ С‚Р°Рє, С‡С‚РѕР±С‹ РїРѕРјРѕС‡СЊ РїРѕСЃС‚РµРїРµРЅРЅРѕ СЂР°Р·РІРёРІР°С‚СЊ СЌС‚Рё С‚РµРјС‹. Р•СЃР»Рё С‚Р°РєРёС… С‚РµРј РїРѕС‡С‚Рё РЅРµС‚, СЃРёСЃС‚РµРјР° РїСЂРµРґР»Р°РіР°РµС‚ РєРЅРёРіРё РґР»СЏ СѓРіР»СѓР±Р»РµРЅРёСЏ СѓР¶Рµ СЃРёР»СЊРЅС‹С… СЃС‚РѕСЂРѕРЅ.";
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

  const ageOptions = ["РґРѕС€РєРѕР»СЊРЅР°СЏ", "РјР»Р°РґС€Р°СЏ С€РєРѕР»Р°", "СЃСЂРµРґРЅСЏСЏ С€РєРѕР»Р°", "16+", "18+"];

  return (
    <div className="page">
      <div className="shellWide">
        <div className="card">
          <div className="headerRow">
            <div>
              <div className="h1">РљР°Р±РёРЅРµС‚ СѓС‡РµРЅРёРєР°</div>
              <div className="muted">
                {readerId || "вЂ”"} вЂў РІРѕР·СЂР°СЃС‚РЅР°СЏ РіСЂСѓРїРїР°: <b>{age}</b>
              </div>
            </div>
            <button className="btn" onClick={onLogout}>
              Р’С‹Р№С‚Рё
            </button>
          </div>

          <div className="tabsRow">
            <button className={`tabBtn ${tab === "account" ? "tabBtnActive" : ""}`} onClick={() => setTab("account")}>
              РњРѕР№ РїСЂРѕС„РёР»СЊ
            </button>
            <button className={`tabBtn ${tab === "texts" ? "tabBtnActive" : ""}`} onClick={() => setTab("texts")}>
              РўРµРєСЃС‚С‹ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
            </button>
            <button className={`tabBtn ${tab === "test" ? "tabBtnActive" : ""}`} onClick={() => setTab("test")}>
              РўРµСЃС‚РёСЂРѕРІР°РЅРёРµ
            </button>
            <button className={`tabBtn ${tab === "results" ? "tabBtnActive" : ""}`} onClick={() => setTab("results")}>
              РС‚РѕРіРё Рё СЂРµРєРѕРјРµРЅРґР°С†РёРё
            </button>
            <button className={`tabBtn ${tab === "read" ? "tabBtnActive" : ""}`} onClick={() => setTab("read")}>
              РџСЂРѕС‡РёС‚Р°РЅРЅС‹Рµ РєРЅРёРіРё
            </button>
          </div>

          {tab === "account" && (
            <div className="grid2">
              <div className="panel">
                <div className="panelTitle">Р›РёС‡РЅС‹Р№ РєР°Р±РёРЅРµС‚</div>

                {accountLoading && <div className="muted" style={{ marginTop: 10 }}>Р—Р°РіСЂСѓР·РєР°вЂ¦</div>}
                {accountMsg && <div className="note">{accountMsg}</div>}

                <div style={{ marginTop: 12 }}>
                  <label className="label">РЎСЃС‹Р»РєР° РЅР° С„РѕС‚Рѕ РїСЂРѕС„РёР»СЏ</label>
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
                  <label className="label">Р¤РРћ</label>
                  <input
                    className="input"
                    value={accountForm.full_name}
                    onChange={(e) =>
                      setAccountForm((p) => ({ ...p, full_name: e.target.value }))
                    }
                    placeholder="РРІР°РЅ РРІР°РЅРѕРІ"
                  />
                </div>

                <div style={{ marginTop: 12 }}>
                  <label className="label">Р“РѕСЂРѕРґ</label>
                  <input
                    className="input"
                    value={accountForm.city}
                    onChange={(e) =>
                      setAccountForm((p) => ({ ...p, city: e.target.value }))
                    }
                    placeholder="РњРѕСЃРєРІР°"
                  />
                </div>

                <div style={{ marginTop: 12 }}>
                  <label className="label">Р’РѕР·СЂР°СЃС‚РЅР°СЏ РіСЂСѓРїРїР° С‡С‚РµРЅРёСЏ</label>
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
                  <label className="label">РЁРєРѕР»Р° / РіСЂСѓРїРїР°</label>
                  <input
                    className="input"
                    value={accountForm.school}
                    onChange={(e) =>
                      setAccountForm((p) => ({ ...p, school: e.target.value }))
                    }
                    placeholder="РЁРєРѕР»Р° в„–12 / РіСЂСѓРїРїР° РР’Рў-21"
                  />
                </div>

                <div style={{ marginTop: 12 }}>
                  <label className="label">РљР»Р°СЃСЃ / РєСѓСЂСЃ</label>
                  <input
                    className="input"
                    value={accountForm.class_name}
                    onChange={(e) =>
                      setAccountForm((p) => ({ ...p, class_name: e.target.value }))
                    }
                    placeholder="9Р‘ / 2 РєСѓСЂСЃ"
                  />
                </div>

                <div className="row" style={{ marginTop: 14 }}>
                  <button className="primaryBtn" onClick={() => void saveAccount()} disabled={accountLoading}>
                    РЎРѕС…СЂР°РЅРёС‚СЊ
                  </button>
                </div>
              </div>

              <div className="panel">
                <div className="panelTitle">РњРѕСЏ РєР°СЂС‚РѕС‡РєР°</div>

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
                      {accountForm.full_name || "Р‘РµР· РёРјРµРЅРё"}
                    </div>
                    <div className="muted">{account?.email || "вЂ”"}</div>
                    <div className="muted">Р РѕР»СЊ: <b>{account?.role || "student"}</b></div>
                  </div>
                </div>

                <div className="note" style={{ marginTop: 16 }}>
                  <div>Р“РѕСЂРѕРґ: <b>{accountForm.city || "вЂ”"}</b></div>
                  <div>РЁРєРѕР»Р° / РіСЂСѓРїРїР°: <b>{accountForm.school || "вЂ”"}</b></div>
                  <div>РљР»Р°СЃСЃ / РєСѓСЂСЃ: <b>{accountForm.class_name || "вЂ”"}</b></div>
                  <div>Р’РѕР·СЂР°СЃС‚РЅР°СЏ РіСЂСѓРїРїР° С‡С‚РµРЅРёСЏ: <b>{accountForm.reading_age || profile?.age || "16+"}</b></div>
                </div>

                <div className="subTitle" style={{ marginTop: 14 }}>РљСЂР°С‚РєР°СЏ СЃС‚Р°С‚РёСЃС‚РёРєР°</div>
                <div className="chips">
                  <span className="chip">РўРµСЃС‚РѕРІ: {meta?.test_count ?? 0}</span>
                  <span className="chip">РўРµРєСЃС‚РѕРІ: {meta?.text_count ?? 0}</span>
                  <span className="chip">РџСЂРѕС‡РёС‚Р°РЅРѕ РєРЅРёРі: {readBooks.length}</span>
                </div>
              </div>
            </div>
          )}

          {tab === "texts" && (
            <div className="grid2">
              <div className="panel">
                <div className="panelTitle">Р”РѕР±Р°РІРёС‚СЊ С‚РµРєСЃС‚ (СЃРѕС‡РёРЅРµРЅРёРµ/СЌСЃСЃРµ)</div>
                <div className="muted" style={{ marginTop: 6 }}>
                  РњРѕР¶РЅРѕ РІСЃС‚Р°РІРёС‚СЊ С„СЂР°РіРјРµРЅС‚ С‚РµРєСЃС‚Р°. РђРЅР°Р»РёР· РѕР±РЅРѕРІРёС‚ РїСЂРѕС„РёР»СЊ С†РµРЅРЅРѕСЃС‚РЅС‹С… С‚РµРј.
                </div>

                <div style={{ marginTop: 12 }}>
                  <label className="label">РќР°Р·РІР°РЅРёРµ (РЅРµРѕР±СЏР·Р°С‚РµР»СЊРЅРѕ)</label>
                  <input
                    className="input"
                    value={textTitle}
                    onChange={(e) => setTextTitle(e.target.value)}
                    placeholder="РќР°РїСЂРёРјРµСЂ: В«РџРѕС‡РµРјСѓ РІР°Р¶РЅРѕ Р±С‹С‚СЊ С‡РµСЃС‚РЅС‹РјВ»"
                  />
                </div>

                <div style={{ marginTop: 12 }}>
                  <label className="label">РўРµРєСЃС‚</label>
                  <textarea
                    className="textarea"
                    value={textBody}
                    onChange={(e) => setTextBody(e.target.value)}
                    placeholder="Р’СЃС‚Р°РІСЊС‚Рµ С‚РµРєСЃС‚ Р·РґРµСЃСЊвЂ¦"
                    rows={10}
                  />
                </div>

                <div className="row" style={{ marginTop: 12 }}>
                  <button className="primaryBtn" onClick={() => void onAnalyzeText()} disabled={analyzeLoading}>
                    {analyzeLoading ? "РђРЅР°Р»РёР·вЂ¦" : "РџСЂРѕР°РЅР°Р»РёР·РёСЂРѕРІР°С‚СЊ"}
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
                    РћС‡РёСЃС‚РёС‚СЊ
                  </button>
                </div>

                {analyzeMsg && <div className="note">{analyzeMsg}</div>}
              </div>

              <div className="panel">
                <div className="panelTitle">РњРѕРё С‚РµРєСЃС‚С‹</div>

                {userTexts.length === 0 ? (
                  <div className="muted" style={{ marginTop: 8 }}>
                    РџРѕРєР° РЅРµС‚ Р·Р°РіСЂСѓР¶РµРЅРЅС‹С… С‚РµРєСЃС‚РѕРІ.
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
                          РћС‚РєСЂС‹С‚СЊ
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
                <div className="panelTitle">РџСЂРѕС„РёР»СЊ, С‚РµРјС‹ СЂРѕСЃС‚Р° Рё РёСЃС‚РѕСЂРёСЏ</div>

                {profileLoading && <div className="muted">Р—Р°РіСЂСѓР·РєР° РїСЂРѕС„РёР»СЏвЂ¦</div>}
                {profileErr && <div className="error">{profileErr}</div>}

                <div className="resultsLead">
                  Р­С‚Рѕ РЅРµ РѕС†РµРЅРєР° Р»РёС‡РЅРѕСЃС‚Рё. РќРёР¶Рµ РїРѕРєР°Р·Р°РЅРѕ, РєР°РєРёРµ С‚РµРјС‹ СЃРµР№С‡Р°СЃ С‡Р°С‰Рµ РїСЂРѕСЏРІР»СЏСЋС‚СЃСЏ РІ РїСЂРѕС„РёР»Рµ Рё РЅР° С‡С‚Рѕ РјРѕР¶РЅРѕ
                  РѕР±СЂР°С‚РёС‚СЊ РІРЅРёРјР°РЅРёРµ РІ С‡С‚РµРЅРёРё.
                </div>

                <div className="insightGrid">
                  <div className="insightCard">
                    <div className="insightLabel">Краткий вывод</div>
                    <div className="insightText">
                      {hasMeaningfulProfile
                        ? "Профиль уже сформирован: можно смотреть сильные стороны, темы роста и рекомендации по книгам."
                        : "Профиль ещё собирается. После анкеты, текста или отзыва рекомендации станут точнее."}
                    </div>
                  </div>

                  <div className="insightCard">
                    <div className="insightLabel">Сейчас заметнее всего</div>
                    <div className="chips">
                      {profileHighlights.length === 0 ? (
                        <span className="muted">Пока нет данных.</span>
                      ) : (
                        profileHighlights.map((item) => (
                          <span key={item.concept} className="chip">
                            {item.concept} • {item.note}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="insightCard">
                    <div className="insightLabel">Что можно развивать</div>
                    <div className="chips">
                      {growthHighlights.length === 0 ? (
                        <span className="muted">
                          {hasMeaningfulProfile
                            ? "Сейчас нет явных зон роста."
                            : "Появится после анкеты, текста или отзыва."}
                        </span>
                      ) : (
                        growthHighlights.map((item) => (
                          <span key={item.concept} className="chip chipGrowth">
                            {item.concept} • {item.note}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="insightCard">
                    <div className="insightLabel">На что уже можно опираться</div>
                    <div className="chips">
                      {strengthHighlights.length === 0 ? (
                        <span className="muted">Пока недостаточно данных.</span>
                      ) : (
                        strengthHighlights.map((item) => (
                          <span key={item.concept} className="chip chipCool">
                            {item.concept} • {item.note}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <details className="deepDetails">
                  <summary className="deepSummary">Подробная аналитика</summary>
                  <div className="deepHint">
                    Здесь можно посмотреть подробные данные профиля, динамику после чтения и историю изменений.
                  </div>

                <div className="subTitle">РўРµРєСѓС‰РёРµ РєРѕРЅС†РµРїС‚С‹ (С‚РѕРї)</div>
                <div className="chips">
                  {top.length === 0 ? (
                    <span className="muted">РџСЂРѕС„РёР»СЊ РµС‰С‘ РЅРµ СЃС„РѕСЂРјРёСЂРѕРІР°РЅ</span>
                  ) : (
                    top.slice(0, 6).map(([k, v]) => (
                      <span key={k} className="chip">
                        {prettyConceptName(k)} вЂў {conceptLevelLabel(v)}
                      </span>
                    ))
                  )}
                </div>

                <div className="subTitle" style={{ marginTop: 14 }}>
                  РўРµРјС‹ РґР»СЏ СЂР°Р·РІРёС‚РёСЏ
                </div>

                {gapsLoading && <div className="muted">РЎС‡РёС‚Р°СЋ С‚РµРјС‹ СЂРѕСЃС‚Р°вЂ¦</div>}
                {gapsErr && <div className="error">{gapsErr}</div>}

                <div className="chips">
                  {growthTopicsTop.length === 0 && !gapsLoading ? (
                    <span className="muted">
                      {hasMeaningfulProfile
                        ? "Р’С‹СЂР°Р¶РµРЅРЅС‹С… С‚РµРј СЂРѕСЃС‚Р° РЅРµ РЅР°Р№РґРµРЅРѕ вЂ” РјРѕР¶РЅРѕ СѓРіР»СѓР±Р»СЏС‚СЊ СЃРёР»СЊРЅС‹Рµ СЃС‚РѕСЂРѕРЅС‹."
                        : "РџСЂРѕР№РґРёС‚Рµ Р°РЅРєРµС‚Сѓ, РґРѕР±Р°РІСЊС‚Рµ С‚РµРєСЃС‚ РёР»Рё РѕС‚Р·С‹РІ РЅР° РєРЅРёРіСѓ, РїРѕСЃР»Рµ СЌС‚РѕРіРѕ РїРѕСЏРІСЏС‚СЃСЏ РїРµСЂСЃРѕРЅР°Р»СЊРЅС‹Рµ СЂРµРєРѕРјРµРЅРґР°С†РёРё."}
                    </span>
                  ) : (
                    growthTopicsTop.map((g) => (
                      <span key={g.concept} className="chip chipGrowth">
                        {g.concept} вЂў РЅСѓР¶РЅРѕ СѓСЃРёР»РёС‚СЊ РЅР° {fmt01(g.gap)}
                      </span>
                    ))
                  )}
                </div>

                <div className="subTitle" style={{ marginTop: 14 }}>
                  РЎРёР»СЊРЅС‹Рµ СЃС‚РѕСЂРѕРЅС‹
                </div>
                <div className="chips">
                  {strengthsTop.length === 0 ? (
                    <span className="muted">вЂ”</span>
                  ) : (
                    strengthsTop.map((g) => (
                      <span key={g.concept} className="chip chipCool">
                        {g.concept} вЂў +{fmt01(Math.abs(g.gap))}
                      </span>
                    ))
                  )}
                </div>

                <div className="subTitle" style={{ marginTop: 14 }}>
                  Р”РёРЅР°РјРёРєР° РїРѕСЃР»Рµ РїСЂРѕС‡РёС‚Р°РЅРЅС‹С… РєРЅРёРі
                </div>
                <div className="chips">
                  {readBookGrowth.length === 0 ? (
                    <span className="muted">РџРѕРєР° РЅРµС‚ РґР°РЅРЅС‹С… РїРѕ РѕС‚Р·С‹РІР°Рј РЅР° РєРЅРёРіРё.</span>
                  ) : (
                    readBookGrowth.map((x) => (
                      <span key={x.concept} className="chip chipGrowthSoft">
                        {x.concept} вЂў +{fmt01(x.avg_growth)}
                      </span>
                    ))
                  )}
                </div>
                <div className="muted" style={{ marginTop: 8 }}>
                  Р—РґРµСЃСЊ РїРѕРєР°Р·Р°РЅС‹ С‚РµРјС‹, РєРѕС‚РѕСЂС‹Рµ С‡Р°С‰Рµ РІСЃРµРіРѕ СѓСЃРёР»РёРІР°Р»РёСЃСЊ РїРѕСЃР»Рµ РґРѕР±Р°РІР»РµРЅРёСЏ РїСЂРѕС‡РёС‚Р°РЅРЅС‹С… РєРЅРёРі Рё РѕС‚Р·С‹РІРѕРІ Рє РЅРёРј.
                </div>

                <div className="subTitle" style={{ marginTop: 14 }}>
                  РљР°СЂС‚Р° РјРѕРёС… С†РµРЅРЅРѕСЃС‚РµР№
                </div>

                <ConceptMap items={conceptMapItems} />
                <div className="muted" style={{ marginTop: 8 }}>
                  РљР°СЂС‚Р° РїРѕРјРѕРіР°РµС‚ СѓРІРёРґРµС‚СЊ РѕР±С‰СѓСЋ РєР°СЂС‚РёРЅСѓ. Р¦РІРµС‚ РїРѕРєР°Р·С‹РІР°РµС‚ СЂРѕР»СЊ С‚РµРјС‹, Р° РїРѕРґРїРёСЃСЊ РІРЅСѓС‚СЂРё РєСЂСѓРіР° РіРѕРІРѕСЂРёС‚ Рѕ С‚РѕРј,
                  РЅР°СЃРєРѕР»СЊРєРѕ РѕРЅР° СЃРµР№С‡Р°СЃ РІС‹СЂР°Р¶РµРЅР°.
                </div>

                <div className="subTitle" style={{ marginTop: 14 }}>
                  РР·РјРµРЅРµРЅРёРµ РїСЂРѕС„РёР»СЏ: РґРѕ / РїРѕСЃР»Рµ
                </div>

                {growthLoading && <div className="muted">РЎС‡РёС‚Р°СЋ РґРёРЅР°РјРёРєСѓвЂ¦</div>}
                {growthErr && <div className="error">{growthErr}</div>}

                {!growthLoading && growth && (
                  <div className="note" style={{ marginTop: 10 }}>
                    <div className="muted">
                      РЎРѕР±С‹С‚РёР№ РІ РёСЃС‚РѕСЂРёРё: <b>{growth.events_count}</b>
                    </div>
                    <div className="muted">
                      РќР°С‡Р°Р»СЊРЅРѕРµ СЃРѕСЃС‚РѕСЏРЅРёРµ: <b>{fmtDT(growth.before?.created_at)}</b>
                    </div>
                    <div className="muted">
                      РўРµРєСѓС‰РµРµ СЃРѕСЃС‚РѕСЏРЅРёРµ: <b>{fmtDT(growth.after?.created_at)}</b>
                    </div>
                  </div>
                )}

                <div className="grid2" style={{ marginTop: 10 }}>
                  <div className="panel">
                    <div className="panelTitle">Р‘С‹Р»Рѕ</div>
                    <div className="chips" style={{ marginTop: 10 }}>
                      {growth?.before?.concepts
                        ? topConcepts(growth.before.concepts, 8).map(([k, v]) => (
                            <span key={k} className="chip">
                              {k} вЂў {fmt01(v)}
                            </span>
                          ))
                        : <span className="muted">РќРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РґР°РЅРЅС‹С…</span>}
                    </div>
                  </div>

                  <div className="panel">
                    <div className="panelTitle">РЎС‚Р°Р»Рѕ</div>
                    <div className="chips" style={{ marginTop: 10 }}>
                      {growth?.after?.concepts
                        ? topConcepts(growth.after.concepts, 8).map(([k, v]) => (
                            <span key={k} className="chip chipCool">
                              {k} вЂў {fmt01(v)}
                            </span>
                          ))
                        : <span className="muted">РќРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РґР°РЅРЅС‹С…</span>}
                    </div>
                  </div>
                </div>

                <div className="subTitle" style={{ marginTop: 14 }}>
                  Р§С‚Рѕ СѓСЃРёР»РёР»РѕСЃСЊ
                </div>
                <div className="chips">
                  {growth?.top_growth?.length ? (
                    growth.top_growth.slice(0, 8).map((x) => (
                      <span key={x.concept} className="chip chipGrowthSoft">
                        {x.concept} вЂў +{fmt01(x.delta)}
                      </span>
                    ))
                  ) : (
                    <span className="muted">РџРѕРєР° РЅРµС‚ РІС‹СЂР°Р¶РµРЅРЅРѕРіРѕ СЂРѕСЃС‚Р°</span>
                  )}
                </div>

                <div className="subTitle" style={{ marginTop: 14 }}>
                  Р§С‚Рѕ РѕСЃР»Р°Р±Р»Рѕ
                </div>
                <div className="chips">
                  {growth?.top_decline?.length ? (
                    growth.top_decline.slice(0, 8).map((x) => (
                      <span key={x.concept} className="chip chipWarm">
                        {x.concept} вЂў {fmt01(x.delta)}
                      </span>
                    ))
                  ) : (
                    <span className="muted">РЎРЅРёР¶РµРЅРёСЏ РЅРµ РѕР±РЅР°СЂСѓР¶РµРЅРѕ</span>
                  )}
                </div>

                <div className="subTitle" style={{ marginTop: 14 }}>
                  РСЃС‚РѕСЂРёСЏ РїСЂРѕС„РёР»СЏ
                </div>

                {(metaLoading || historyLoading) && <div className="muted">Р—Р°РіСЂСѓР·РєР° РёСЃС‚РѕСЂРёРёвЂ¦</div>}
                {metaErr && <div className="error">{metaErr}</div>}

                {meta && (
                  <div className="note" style={{ marginTop: 10 }}>
                    <div className="muted">
                      РўРµСЃС‚РѕРІ: <b>{meta.test_count}</b> вЂў РўРµРєСЃС‚РѕРІ: <b>{meta.text_count}</b>
                    </div>
                    <div className="muted">
                      РџРѕСЃР»РµРґРЅРµРµ РѕР±РЅРѕРІР»РµРЅРёРµ: <b>{fmtDT(meta.last_update_at)}</b>
                    </div>
                    <div className="muted">
                      РСЃС‚РѕС‡РЅРёРє: <b>{friendlySource(meta.last_source)}</b>
                    </div>
                    <div className="muted" style={{ marginTop: 6 }}>
                      РџРѕСЃР»РµРґРЅСЏСЏ Р°РЅРєРµС‚Р°: <b>{fmtDT(meta.last_test_at)}</b> вЂў РџРѕСЃР»РµРґРЅРёР№ С‚РµРєСЃС‚: <b>{fmtDT(meta.last_text_at)}</b>
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
                    {historyOpen ? "РЎРєСЂС‹С‚СЊ СЃРѕР±С‹С‚РёСЏ" : "РџРѕРєР°Р·Р°С‚СЊ СЃРѕР±С‹С‚РёСЏ"}
                  </button>

                  <button
                    className="btn"
                    onClick={() => void refreshAll({ withHistory: historyOpen })}
                    disabled={recsLoading || profileLoading || gapsLoading || metaLoading || historyLoading || growthLoading}
                  >
                    РћР±РЅРѕРІРёС‚СЊ РґР°РЅРЅС‹Рµ
                  </button>
                </div>

                {historyOpen && (
                  <div style={{ marginTop: 10 }}>
                    {historyErr && <div className="error">{historyErr}</div>}
                    {history.length === 0 && !historyLoading ? (
                      <div className="muted">РџРѕРєР° РЅРµС‚ СЃРѕР±С‹С‚РёР№. РџСЂРѕР№РґРё Р°РЅРєРµС‚Сѓ, РґРѕР±Р°РІСЊ С‚РµРєСЃС‚ РёР»Рё РѕС‚Р·С‹РІ Рѕ РєРЅРёРіРµ.</div>
                    ) : (
                      <div className="historyList">
                        {history.map((ev) => (
                          <HistoryItem key={ev.id} ev={ev} />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                </details>

                <div className="subTitle" style={{ marginTop: 14 }}>
                  РџРѕСЏСЃРЅРµРЅРёРµ
                </div>
                <div className="muted">{growthTopicsHint}</div>

                <div className="row" style={{ marginTop: 14 }}>
                  <button className="btn" onClick={() => setTab("texts")}>
                    Р”РѕР±Р°РІРёС‚СЊ С‚РµРєСЃС‚ в†’
                  </button>
                  <button className="btn" onClick={() => setTab("test")}>
                    РџСЂРѕР№С‚Рё Р°РЅРєРµС‚Сѓ в†’
                  </button>
                  <button className="btn" onClick={() => setTab("read")}>
                    РњРѕРё РєРЅРёРіРё в†’
                  </button>
                </div>
              </div>

              <div className="panel grow">
                <div className="panelTitle">Р РµРєРѕРјРµРЅРґР°С†РёРё</div>

                <div className="recsLead">
                  Здесь собраны книги, которые либо поддерживают уже сильные стороны, либо помогают мягко развивать
                  новые темы через чтение.
                </div>

                <div className="row" style={{ marginBottom: 10 }}>
                  <button
                    className="btn"
                    onClick={() => void refreshAll({ withHistory: historyOpen })}
                    disabled={recsLoading || profileLoading || gapsLoading || metaLoading || historyLoading || growthLoading}
                  >
                    РћР±РЅРѕРІРёС‚СЊ РґР°РЅРЅС‹Рµ
                  </button>
                  {(recsLoading || profileLoading || gapsLoading || metaLoading || historyLoading || growthLoading) && (
                    <span className="muted">Р—Р°РіСЂСѓР·РєР°вЂ¦</span>
                  )}
                </div>

                {recsErr && <div className="error">{recsErr}</div>}

                {(!recs || recs.length === 0) && !recsLoading && !recsErr && (
                  <div className="muted">РџРѕРєР° РЅРµС‚ СЂРµРєРѕРјРµРЅРґР°С†РёР№. Р”РѕР±Р°РІСЊ С‚РµРєСЃС‚, РїСЂРѕР№РґРё Р°РЅРєРµС‚Сѓ РёР»Рё РѕСЃС‚Р°РІСЊ РѕС‚Р·С‹РІ РЅР° РєРЅРёРіСѓ.</div>
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
                <div className="panelTitle">РњРѕРё РїСЂРѕС‡РёС‚Р°РЅРЅС‹Рµ РєРЅРёРіРё</div>

                {readBooksMsg && <div className="note">{readBooksMsg}</div>}
                {readBooksLoading && <div className="muted" style={{ marginTop: 10 }}>Р—Р°РіСЂСѓР·РєР°вЂ¦</div>}

                {!readBooksLoading && readBooks.length === 0 ? (
                  <div className="muted" style={{ marginTop: 10 }}>
                    РџРѕРєР° РЅРµС‚ РѕС‚РјРµС‡РµРЅРЅС‹С… РїСЂРѕС‡РёС‚Р°РЅРЅС‹С… РєРЅРёРі.
                  </div>
                ) : (
                  <div className="readBooksList" style={{ marginTop: 10 }}>
                    {readBooks.map((book) => (
                      <div key={book.id} className="readBookCard">
                        <div>
                          <div className="readBookTitle">{book.title}</div>
                          <div className="muted">
                            {book.author || "РђРІС‚РѕСЂ РЅРµ СѓРєР°Р·Р°РЅ"} вЂў {book.age || "Р’РѕР·СЂР°СЃС‚ РЅРµ СѓРєР°Р·Р°РЅ"}
                          </div>
                          <div className="muted" style={{ marginTop: 6 }}>
                            РћС†РµРЅРєР°: <b>{starsLabel(book.rating)}</b>
                          </div>
                          <div className="muted">
                            Р”Р°С‚Р°: <b>{fmtDT(book.created_at)}</b>
                          </div>
                        </div>

                        <div className="tableActions">
                          <button className="btn" onClick={() => setOpenedReadBook(book)}>
                            РћС‚РєСЂС‹С‚СЊ
                          </button>
                          <button className="dangerBtn" onClick={() => void onDeleteReadBook(book.id)}>
                            РЈРґР°Р»РёС‚СЊ
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* <div className="panel">
                <div className="panelTitle">Р§С‚Рѕ РґР°С‘С‚ СЌС‚Р° РІРєР»Р°РґРєР°</div>
                <ul className="ul" style={{ marginTop: 10 }}>
                  <li>РїСЂРѕС‡РёС‚Р°РЅРЅС‹Рµ РєРЅРёРіРё Р±РѕР»СЊС€Рµ РЅРµ РїРѕРїР°РґР°СЋС‚ РІ СЂРµРєРѕРјРµРЅРґР°С†РёРё;</li>
                  <li>РјРѕР¶РЅРѕ РѕСЃС‚Р°РІРёС‚СЊ РѕС†РµРЅРєСѓ Рё РІРїРµС‡Р°С‚Р»РµРЅРёСЏ;</li>
                  <li>РІРїРµС‡Р°С‚Р»РµРЅРёСЏ Р°РЅР°Р»РёР·РёСЂСѓСЋС‚СЃСЏ РєР°Рє С‚РµРєСЃС‚;</li>
                  <li>РїСЂРѕС„РёР»СЊ СѓС‡РµРЅРёРєР° РїРµСЂРµСЃС‡РёС‚С‹РІР°РµС‚СЃСЏ СЃ СѓС‡С‘С‚РѕРј РѕС‚Р·С‹РІР°.</li>
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
                Р—Р°РєСЂС‹С‚СЊ
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
                  {openedReadBook.author || "РђРІС‚РѕСЂ РЅРµ СѓРєР°Р·Р°РЅ"} вЂў {openedReadBook.age || "Р’РѕР·СЂР°СЃС‚ РЅРµ СѓРєР°Р·Р°РЅ"}
                </div>
              </div>

              <button className="btn" onClick={() => setOpenedReadBook(null)}>
                Р—Р°РєСЂС‹С‚СЊ
              </button>
            </div>

            <div className="subTitle">РћС†РµРЅРєР°</div>
            <div className="modalText">{starsLabel(openedReadBook.rating)}</div>

            <div className="subTitle" style={{ marginTop: 12 }}>РњРѕРё РІРїРµС‡Р°С‚Р»РµРЅРёСЏ</div>
            <div className="modalText">
              {openedReadBook.impression_text || "Р’РїРµС‡Р°С‚Р»РµРЅРёСЏ РЅРµ РґРѕР±Р°РІР»РµРЅС‹."}
            </div>

            <div className="subTitle" style={{ marginTop: 12 }}>РљРѕРЅС†РµРїС‚С‹ РєРЅРёРіРё / РѕС‚Р·С‹РІР°</div>
            <div className="chips">
              {topConcepts(openedReadBook.concepts, 8).length === 0 ? (
                <span className="muted">РќРµС‚ РґР°РЅРЅС‹С…</span>
              ) : (
                topConcepts(openedReadBook.concepts, 8).map(([k, v]) => (
                  <span key={k} className="chip">
                    {k} вЂў {fmt01(v)}
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
                  {openedBook.work.author} вЂў {openedBook.work.age}
                </div>
              </div>

              <button className="btn" onClick={() => setOpenedBook(null)}>
                Р—Р°РєСЂС‹С‚СЊ
              </button>
            </div>

            <div className="bookHero">
              <div className="bookCoverMock">
                {openedBook.work.cover_image ? (
                  <img
                    src={toCoverUrl(openedBook.work.cover_image)}
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
                    <span>Р’РѕР·СЂР°СЃС‚</span>
                    <b>{openedBook.work.age}</b>
                  </div>
                  <div className="bookMetaItem">
                    <span>РЎРѕРѕС‚РІРµС‚СЃС‚РІРёРµ</span>
                    <b>
                      {maxScore > 0
                        ? `${Math.round((Number(openedBook.why?.score ?? 0) / maxScore) * 100)}%`
                        : "вЂ”"}
                    </b>
                  </div>
                  <div className="bookMetaItem">
                    <span>Р РµР¶РёРј</span>
                    <b>
                      {openedBook.why?.mode === "correction"
                        ? "Р Р°Р·РІРёС‚РёРµ С‚РµРј СЂРѕСЃС‚Р°"
                        : "РЈРіР»СѓР±Р»РµРЅРёРµ"}
                    </b>
                  </div>
                </div>

                <div className="bookExplainBox">
                  <div className="subTitle" style={{ marginTop: 0 }}>РџРѕС‡РµРјСѓ СЂРµРєРѕРјРµРЅРґРѕРІР°РЅР°</div>
                  <div className="muted" style={{ marginTop: 6 }}>
                    {openedBook.why?.gaps?.some((g) => Number(g.gap) > 0)
                      ? `РљРЅРёРіР° РїРѕРјРѕРіР°РµС‚ СЂР°Р·РІРёРІР°С‚СЊ С‚РµРјС‹: ${openedBook.why.gaps
                          .filter((g) => Number(g.gap) > 0)
                          .slice(0, 4)
                          .map((g) => g.via ? `${g.concept} (С‡РµСЂРµР· ${g.via})` : g.concept)
                          .join(", ")}.`
                      : "РљРЅРёРіР° РїРѕРґС…РѕРґРёС‚ РґР»СЏ СѓРіР»СѓР±Р»РµРЅРёСЏ СѓР¶Рµ РІС‹СЂР°Р¶РµРЅРЅС‹С… СЃРёР»СЊРЅС‹С… СЃС‚РѕСЂРѕРЅ."}
                  </div>
                </div>
              </div>
            </div>

            <div className="subTitle" style={{ marginTop: 14 }}>РљРѕРЅС†РµРїС‚С‹ РєРЅРёРіРё</div>
            <div className="chips">
              {topConcepts(openedBook.work.concepts, 8).length === 0 ? (
                <span className="muted">РќРµС‚ РґР°РЅРЅС‹С…</span>
              ) : (
                topConcepts(openedBook.work.concepts, 8).map(([k, v]) => (
                  <span key={k} className="chip">
                    {k} вЂў {fmt01(v)}
                  </span>
                ))
              )}
            </div>

            <div className="subTitle" style={{ marginTop: 14 }}>РўРµРјС‹, РєРѕС‚РѕСЂС‹Рµ РєРЅРёРіР° РјРѕР¶РµС‚ РїРѕРґРґРµСЂР¶Р°С‚СЊ</div>
            <div className="chips">
              {(openedBook.why?.gaps ?? []).slice(0, 6).map((g, idx) => (
                <span
                  key={`${g.concept}-${idx}`}
                  className={`chip ${g.direction === "below" ? "chipWarm" : "chipCool"}`}
                >
                  {g.via ? `${g.concept} С‡РµСЂРµР· ${g.via}` : g.concept}
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
                РћС‚РјРµС‚РёС‚СЊ РєР°Рє РїСЂРѕС‡РёС‚Р°РЅРЅСѓСЋ
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
                <div className="modalTitle">РћС‚РјРµС‚РёС‚СЊ РєР°Рє РїСЂРѕС‡РёС‚Р°РЅРЅСѓСЋ</div>
                <div className="muted">
                  {markReadOpen.work.title} вЂў {markReadOpen.work.author}
                </div>
              </div>

              <button className="btn" onClick={() => setMarkReadOpen(null)}>
                Р—Р°РєСЂС‹С‚СЊ
              </button>
            </div>

            <div className="subTitle">РћС†РµРЅРєР°</div>
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
              РњРѕРё РІРїРµС‡Р°С‚Р»РµРЅРёСЏ
            </div>
            <textarea
              className="textarea"
              rows={8}
              value={readImpression}
              onChange={(e) => setReadImpression(e.target.value)}
              placeholder="РќР°РїРёС€Рё, С‡С‚Рѕ С‚РµР±Рµ РїРѕРЅСЂР°РІРёР»РѕСЃСЊ РІ РєРЅРёРіРµ, РєР°РєРёРµ РјС‹СЃР»Рё РѕРЅР° РІС‹Р·РІР°Р»Р°, С‡РµРјСѓ РЅР°СѓС‡РёР»Р°..."
            />

            <div className="row" style={{ marginTop: 12 }}>
              <button className="primaryBtn" onClick={() => void onSaveReadBook()} disabled={saveReadLoading}>
                {saveReadLoading ? "РЎРѕС…СЂР°РЅРµРЅРёРµвЂ¦" : "РЎРѕС…СЂР°РЅРёС‚СЊ"}
              </button>
            </div>

            <div className="note">
              Р•СЃР»Рё РІРїРµС‡Р°С‚Р»РµРЅРёРµ РґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РґР»РёРЅРЅРѕРµ, РѕРЅРѕ Р±СѓРґРµС‚ РїСЂРѕР°РЅР°Р»РёР·РёСЂРѕРІР°РЅРѕ РєР°Рє С‚РµРєСЃС‚ Рё РїРѕРІР»РёСЏРµС‚ РЅР° С‚РІРѕР№ РїСЂРѕС„РёР»СЊ.
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
      ? "РђРЅРєРµС‚Р°"
      : ev.type === "book_review"
      ? "РћС‚Р·С‹РІ Рѕ РєРЅРёРіРµ"
      : "РўРµРєСЃС‚";

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
          <b>{kind}</b> вЂў {when}
        </div>
      </div>

      <div className="muted" style={{ marginTop: 6 }}>
        {ev.type === "book_review" && ev?.payload?.title ? (
          <>
            РљРЅРёРіР°: <b>{ev.payload.title}</b>
            <br />
          </>
        ) : null}

        {topPayload.length > 0 && (
          <>
            Р’С…РѕРґРЅС‹Рµ РґР°РЅРЅС‹Рµ (С‚РѕРї): <b>{topPayload.map(([k, v]) => `${k} ${fmt01(v)}`).join(", ")}</b>
            <br />
          </>
        )}
        {topAfter.length > 0 && (
          <>
            РџСЂРѕС„РёР»СЊ РїРѕСЃР»Рµ (С‚РѕРї): <b>{topAfter.map(([k, v]) => `${k} ${fmt01(v)}`).join(", ")}</b>
          </>
        )}
        {topPayload.length === 0 && topAfter.length === 0 && <>РЎРѕР±С‹С‚РёРµ СЃРѕС…СЂР°РЅРµРЅРѕ.</>}
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

  const fitLabel = useMemo(() => recommendationFitLabel(percent), [percent]);

  const tags = useMemo(() => {
    const c = item?.work?.concepts ?? {};
    const arr = safeEntries(c);
    arr.sort((a, b) => b[1] - a[1]);
    return arr.slice(0, 4).map(([k]) => prettyConceptName(k));
  }, [item]);

  const deficitHits = useMemo(() => {
    return gaps
      .filter((g: any) => Number(g.gap) > 0)
      .slice(0, 3)
      .map((g: any) => (g.via ? `${g.concept} С‡РµСЂРµР· ${g.via}` : g.concept));
  }, [gaps]);

  const modeLabel = item?.why?.mode === "correction" ? "Р Р°Р·РІРёС‚РёРµ С‚РµРј СЂРѕСЃС‚Р°" : "РЈРіР»СѓР±Р»РµРЅРёРµ";

  return (
    <div className="bookCard">
      <div className="bookCardCover">
        {item.work.cover_image ? (
          <img
            src={toCoverUrl(item.work.cover_image)}
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
          <div className="bookMatchBadge">{fitLabel}</div>
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

        <div className="recReasonTitle">Почему эта книга может подойти</div>

        <div className="bookExplainText">
          {deficitHits.length > 0
            ? `Может помочь темам: ${deficitHits.join(", ")}`
            : "Подходит, чтобы опереться на уже сильные стороны."}
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
    return <div className="muted" style={{ marginTop: 10 }}>РџРѕРєР° РЅРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РґР°РЅРЅС‹С… РґР»СЏ РєР°СЂС‚С‹.</div>;
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
      <svg viewBox="0 0 420 420" className="conceptMapSvg" role="img" aria-label="РљР°СЂС‚Р° С†РµРЅРЅРѕСЃС‚РµР№">
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
          РњРѕР№
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="conceptCenterText">
          РїСЂРѕС„РёР»СЊ
        </text>

        {nodes.map((n) => (
          <g key={n.concept}>
            <circle cx={n.x} cy={n.y} r={n.size} className={n.cls} />
            <text x={n.x} y={n.y - 2} textAnchor="middle" className="conceptNodeLabel">
              {n.concept.length > 14 ? `${n.concept.slice(0, 14)}вЂ¦` : n.concept}
            </text>
            <text x={n.x} y={n.y + 14} textAnchor="middle" className="conceptNodeValue">
              {conceptLevelLabel(n.value)}
            </text>
            <title>
              {`${n.concept}
РўРµРєСѓС‰РµРµ Р·РЅР°С‡РµРЅРёРµ: ${conceptLevelLabel(n.value)}
${typeof n.gap === "number" ? `Р Р°Р·СЂС‹РІ: ${fmt01(n.gap)}` : ""}`}
            </title>
          </g>
        ))}
      </svg>

      <div className="conceptLegend">
        <div className="conceptLegendItem">
          <span className="legendDot legendStrong" />
          <span>РЎРёР»СЊРЅС‹Рµ СЃС‚РѕСЂРѕРЅС‹</span>
        </div>
        <div className="conceptLegendItem">
          <span className="legendDot legendDeficit" />
          <span>Р—РѕРЅС‹ СЂРѕСЃС‚Р°</span>
        </div>
        <div className="conceptLegendItem">
          <span className="legendDot legendNeutral" />
          <span>РќРµР№С‚СЂР°Р»СЊРЅС‹Рµ С‚РµРјС‹</span>
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
  const user = getUser();
  const readerId = resolveReaderId(user);
  const draftKey = getTestDraftKey(readerId, props.profileAge);
  const CORE_SCALES = new Set([
    "РЅСЂР°РІСЃС‚РІРµРЅРЅС‹Р№_РІС‹Р±РѕСЂ",
    "РѕС‚РІРµС‚СЃС‚РІРµРЅРЅРѕСЃС‚СЊ",
    "С‡РµСЃС‚СЊ_Рё_РґРѕСЃС‚РѕРёРЅСЃС‚РІРѕ",
    "СЃРјС‹СЃР»_Р¶РёР·РЅРё",
    "Р»СЋР±РѕРІСЊ",
    "РєРѕР»Р»РµРєС‚РёРІРёР·Рј",
    "РїР°С‚СЂРёРѕС‚РёР·Рј",
    "СЃРІРѕР±РѕРґР°",
    "СЃР°РјРѕСЂР°Р·РІРёС‚РёРµ",
  ]);

  const base: QuestionItem[] = [
    { id: "nv1", scale: "РЅСЂР°РІСЃС‚РІРµРЅРЅС‹Р№_РІС‹Р±РѕСЂ", title: "РќСЂР°РІСЃС‚РІРµРЅРЅС‹Р№ РІС‹Р±РѕСЂ", text: "РЇ СЃС‚Р°СЂР°СЋСЃСЊ РѕС‚Р»РёС‡Р°С‚СЊ вЂњРјРѕР¶РЅРѕвЂќ РѕС‚ вЂњРїСЂР°РІРёР»СЊРЅРѕвЂќ, РґР°Р¶Рµ РµСЃР»Рё С‚Р°Рє СЃР»РѕР¶РЅРµРµ." },
    { id: "nv2", scale: "РЅСЂР°РІСЃС‚РІРµРЅРЅС‹Р№_РІС‹Р±РѕСЂ", title: "РќСЂР°РІСЃС‚РІРµРЅРЅС‹Р№ РІС‹Р±РѕСЂ", text: "РџРµСЂРµРґ СЃР»РѕР¶РЅС‹Рј СЂРµС€РµРЅРёРµРј СЏ РґСѓРјР°СЋ Рѕ РїРѕСЃР»РµРґСЃС‚РІРёСЏС… РґР»СЏ РґСЂСѓРіРёС… Р»СЋРґРµР№." },
    { id: "nv3", scale: "РЅСЂР°РІСЃС‚РІРµРЅРЅС‹Р№_РІС‹Р±РѕСЂ", title: "РќСЂР°РІСЃС‚РІРµРЅРЅС‹Р№ РІС‹Р±РѕСЂ", text: "РњРЅРµ РІР°Р¶РЅРѕ, С‡С‚РѕР±С‹ РјРѕРё РїРѕСЃС‚СѓРїРєРё СЃРѕРѕС‚РІРµС‚СЃС‚РІРѕРІР°Р»Рё РјРѕРёРј РїСЂРёРЅС†РёРїР°Рј." },
    { id: "nv4", scale: "РЅСЂР°РІСЃС‚РІРµРЅРЅС‹Р№_РІС‹Р±РѕСЂ", title: "РќСЂР°РІСЃС‚РІРµРЅРЅС‹Р№ РІС‹Р±РѕСЂ", text: "РЇ РјРѕРіСѓ РёР·РјРµРЅРёС‚СЊ СЃРІРѕС‘ СЂРµС€РµРЅРёРµ, РµСЃР»Рё РїРѕРЅРёРјР°СЋ, С‡С‚Рѕ РѕРЅРѕ РЅРµСЃРїСЂР°РІРµРґР»РёРІРѕ." },
    { id: "nv5", scale: "РЅСЂР°РІСЃС‚РІРµРЅРЅС‹Р№_РІС‹Р±РѕСЂ", title: "РќСЂР°РІСЃС‚РІРµРЅРЅС‹Р№ РІС‹Р±РѕСЂ", text: "РЇ СЃС‚Р°СЂР°СЋСЃСЊ Р±С‹С‚СЊ С‡РµСЃС‚РЅС‹Рј(РѕР№), РґР°Р¶Рµ РєРѕРіРґР° СЌС‚Рѕ РЅРµРІС‹РіРѕРґРЅРѕ." },
    { id: "nv6", scale: "РЅСЂР°РІСЃС‚РІРµРЅРЅС‹Р№_РІС‹Р±РѕСЂ", title: "РќСЂР°РІСЃС‚РІРµРЅРЅС‹Р№ РІС‹Р±РѕСЂ", text: "РЇ РґСѓРјР°СЋ Рѕ С‚РѕРј, РєР°Рє Р±С‹ СЏ С…РѕС‚РµР»(Р°), С‡С‚РѕР±С‹ РїРѕСЃС‚СѓРїРёР»Рё СЃРѕ РјРЅРѕР№." },
    { id: "nv7", scale: "РЅСЂР°РІСЃС‚РІРµРЅРЅС‹Р№_РІС‹Р±РѕСЂ", title: "РќСЂР°РІСЃС‚РІРµРЅРЅС‹Р№ РІС‹Р±РѕСЂ", text: "РРЅРѕРіРґР° СЏ СЃС‡РёС‚Р°СЋ, С‡С‚Рѕ РјРѕР¶РЅРѕ РЅР°СЂСѓС€РёС‚СЊ РїСЂР°РІРёР»Р°, РµСЃР»Рё РЅРёРєС‚Рѕ РЅРµ СѓР·РЅР°РµС‚.", reversed: true },

    { id: "ot1", scale: "РѕС‚РІРµС‚СЃС‚РІРµРЅРЅРѕСЃС‚СЊ", title: "РћС‚РІРµС‚СЃС‚РІРµРЅРЅРѕСЃС‚СЊ", text: "Р•СЃР»Рё СЏ РґР°Р»(Р°) РѕР±РµС‰Р°РЅРёРµ, СЏ СЃС‚Р°СЂР°СЋСЃСЊ РІС‹РїРѕР»РЅРёС‚СЊ РµРіРѕ." },
    { id: "ot2", scale: "РѕС‚РІРµС‚СЃС‚РІРµРЅРЅРѕСЃС‚СЊ", title: "РћС‚РІРµС‚СЃС‚РІРµРЅРЅРѕСЃС‚СЊ", text: "РЇ Р±РµСЂСѓ РЅР° СЃРµР±СЏ Р·Р°РґР°С‡Рё Рё РґРѕРІРѕР¶Сѓ РёС… РґРѕ РєРѕРЅС†Р°." },
    { id: "ot3", scale: "РѕС‚РІРµС‚СЃС‚РІРµРЅРЅРѕСЃС‚СЊ", title: "РћС‚РІРµС‚СЃС‚РІРµРЅРЅРѕСЃС‚СЊ", text: "Р•СЃР»Рё СЏ РѕС€РёР±СЃСЏ(Р»Р°СЃСЊ), СЏ РіРѕС‚РѕРІ(Р°) РїСЂРёР·РЅР°С‚СЊ СЌС‚Рѕ." },
    { id: "ot4", scale: "РѕС‚РІРµС‚СЃС‚РІРµРЅРЅРѕСЃС‚СЊ", title: "РћС‚РІРµС‚СЃС‚РІРµРЅРЅРѕСЃС‚СЊ", text: "РњРЅРµ РІР°Р¶РЅРѕ РІС‹РїРѕР»РЅСЏС‚СЊ РѕР±СЏР·Р°С‚РµР»СЊСЃС‚РІР° РїРµСЂРµРґ Р»СЋРґСЊРјРё." },
    { id: "ot5", scale: "РѕС‚РІРµС‚СЃС‚РІРµРЅРЅРѕСЃС‚СЊ", title: "РћС‚РІРµС‚СЃС‚РІРµРЅРЅРѕСЃС‚СЊ", text: "РЇ СЃС‚Р°СЂР°СЋСЃСЊ РїР»Р°РЅРёСЂРѕРІР°С‚СЊ РґРµР»Р°, С‡С‚РѕР±С‹ СѓСЃРїРµРІР°С‚СЊ РІРѕРІСЂРµРјСЏ." },
    { id: "ot6", scale: "РѕС‚РІРµС‚СЃС‚РІРµРЅРЅРѕСЃС‚СЊ", title: "РћС‚РІРµС‚СЃС‚РІРµРЅРЅРѕСЃС‚СЊ", text: "РЇ РїРѕРЅРёРјР°СЋ, С‡С‚Рѕ РјРѕРё СЂРµС€РµРЅРёСЏ РІР»РёСЏСЋС‚ РЅР° Р±СѓРґСѓС‰РµРµ." },
    { id: "ot7", scale: "РѕС‚РІРµС‚СЃС‚РІРµРЅРЅРѕСЃС‚СЊ", title: "РћС‚РІРµС‚СЃС‚РІРµРЅРЅРѕСЃС‚СЊ", text: "Р•СЃР»Рё С‡С‚Рѕ-С‚Рѕ РЅРµ РїРѕР»СѓС‡РёР»РѕСЃСЊ, РѕР±С‹С‡РЅРѕ РІРёРЅРѕРІР°С‚С‹ РѕР±СЃС‚РѕСЏС‚РµР»СЊСЃС‚РІР°, Р° РЅРµ СЏ.", reversed: true },

    { id: "cd1", scale: "С‡РµСЃС‚СЊ_Рё_РґРѕСЃС‚РѕРёРЅСЃС‚РІРѕ", title: "Р§РµСЃС‚СЊ Рё РґРѕСЃС‚РѕРёРЅСЃС‚РІРѕ", text: "РњРЅРµ РІР°Р¶РЅРѕ СѓРІР°Р¶Р°С‚СЊ СЃРµР±СЏ Рё РЅРµ РїРѕСЃС‚СѓРїР°С‚СЊ СѓРЅРёР·РёС‚РµР»СЊРЅРѕ." },
    { id: "cd2", scale: "С‡РµСЃС‚СЊ_Рё_РґРѕСЃС‚РѕРёРЅСЃС‚РІРѕ", title: "Р§РµСЃС‚СЊ Рё РґРѕСЃС‚РѕРёРЅСЃС‚РІРѕ", text: "РЇ СЃС‚Р°СЂР°СЋСЃСЊ Р·Р°С‰РёС‰Р°С‚СЊ РґРѕСЃС‚РѕРёРЅСЃС‚РІРѕ РґСЂСѓРіРѕРіРѕ С‡РµР»РѕРІРµРєР°, РµСЃР»Рё РІРёР¶Сѓ РЅРµСЃРїСЂР°РІРµРґР»РёРІРѕСЃС‚СЊ." },
    { id: "cd3", scale: "С‡РµСЃС‚СЊ_Рё_РґРѕСЃС‚РѕРёРЅСЃС‚РІРѕ", title: "Р§РµСЃС‚СЊ Рё РґРѕСЃС‚РѕРёРЅСЃС‚РІРѕ", text: "РЇ СЃС‚Р°СЂР°СЋСЃСЊ РґРµСЂР¶Р°С‚СЊ СЃР»РѕРІРѕ." },
    { id: "cd4", scale: "С‡РµСЃС‚СЊ_Рё_РґРѕСЃС‚РѕРёРЅСЃС‚РІРѕ", title: "Р§РµСЃС‚СЊ Рё РґРѕСЃС‚РѕРёРЅСЃС‚РІРѕ", text: "РЇ РЅРµ РѕРґРѕР±СЂСЏСЋ РґРµР№СЃС‚РІРёСЏ, РєРѕС‚РѕСЂС‹Рµ СѓРЅРёР¶Р°СЋС‚ Р»СЋРґРµР№." },
    { id: "cd5", scale: "С‡РµСЃС‚СЊ_Рё_РґРѕСЃС‚РѕРёРЅСЃС‚РІРѕ", title: "Р§РµСЃС‚СЊ Рё РґРѕСЃС‚РѕРёРЅСЃС‚РІРѕ", text: "Р”Р»СЏ РјРµРЅСЏ РІР°Р¶РЅР° СЂРµРїСѓС‚Р°С†РёСЏ, РЅРѕ РЅРµ С†РµРЅРѕР№ Р»Р¶Рё." },
    { id: "cd6", scale: "С‡РµСЃС‚СЊ_Рё_РґРѕСЃС‚РѕРёРЅСЃС‚РІРѕ", title: "Р§РµСЃС‚СЊ Рё РґРѕСЃС‚РѕРёРЅСЃС‚РІРѕ", text: "РЇ СЃС‚Р°СЂР°СЋСЃСЊ РЅРµ РїРѕР»СЊР·РѕРІР°С‚СЊСЃСЏ СЃР»Р°Р±РѕСЃС‚СЊСЋ РґСЂСѓРіРѕРіРѕ С‡РµР»РѕРІРµРєР°." },
    { id: "cd7", scale: "С‡РµСЃС‚СЊ_Рё_РґРѕСЃС‚РѕРёРЅСЃС‚РІРѕ", title: "Р§РµСЃС‚СЊ Рё РґРѕСЃС‚РѕРёРЅСЃС‚РІРѕ", text: "РРЅРѕРіРґР° РґРѕРїСѓСЃС‚РёРјРѕ СѓРЅРёР·РёС‚СЊ РґСЂСѓРіРѕРіРѕ, РµСЃР»Рё РѕРЅ СЌС‚РѕРіРѕ вЂњР·Р°СЃР»СѓР¶РёР»вЂќ.", reversed: true },

    { id: "sl1", scale: "СЃРјС‹СЃР»_Р¶РёР·РЅРё", title: "РЎРјС‹СЃР» Р¶РёР·РЅРё", text: "РњРЅРµ РІР°Р¶РЅРѕ РїРѕРЅРёРјР°С‚СЊ, Р·Р°С‡РµРј СЏ СѓС‡СѓСЃСЊ/СЂР°Р±РѕС‚Р°СЋ Рё Рє С‡РµРјСѓ РёРґСѓ." },
    { id: "sl2", scale: "СЃРјС‹СЃР»_Р¶РёР·РЅРё", title: "РЎРјС‹СЃР» Р¶РёР·РЅРё", text: "РЇ РґСѓРјР°СЋ Рѕ СЃРІРѕРёС… С†РµР»СЏС… РЅР° Р±СѓРґСѓС‰РµРµ." },
    { id: "sl3", scale: "СЃРјС‹СЃР»_Р¶РёР·РЅРё", title: "РЎРјС‹СЃР» Р¶РёР·РЅРё", text: "РЇ Р·Р°РґР°СЋ СЃРµР±Рµ РІРѕРїСЂРѕСЃС‹ Рѕ С‚РѕРј, С‡С‚Рѕ РІР°Р¶РЅРѕ РІ Р¶РёР·РЅРё." },
    { id: "sl4", scale: "СЃРјС‹СЃР»_Р¶РёР·РЅРё", title: "РЎРјС‹СЃР» Р¶РёР·РЅРё", text: "РРЅРѕРіРґР° РєРЅРёРіРё РїРѕРјРѕРіР°СЋС‚ РјРЅРµ СѓРІРёРґРµС‚СЊ РЅРѕРІС‹Рµ СЃРјС‹СЃР»С‹." },
    { id: "sl5", scale: "СЃРјС‹СЃР»_Р¶РёР·РЅРё", title: "РЎРјС‹СЃР» Р¶РёР·РЅРё", text: "РЇ С‡СѓРІСЃС‚РІСѓСЋ, С‡С‚Рѕ РјРѕРё РґРµР№СЃС‚РІРёСЏ РёРјРµСЋС‚ Р·РЅР°С‡РµРЅРёРµ." },
    { id: "sl6", scale: "СЃРјС‹СЃР»_Р¶РёР·РЅРё", title: "РЎРјС‹СЃР» Р¶РёР·РЅРё", text: "РЇ СЃС‚Р°СЂР°СЋСЃСЊ РґРµР»Р°С‚СЊ РІС‹Р±РѕСЂ РѕСЃРѕР·РЅР°РЅРЅРѕ, Р° РЅРµ вЂњРєР°Рє РїРѕР»СѓС‡РёС‚СЃСЏвЂќ." },
    { id: "sl7", scale: "СЃРјС‹СЃР»_Р¶РёР·РЅРё", title: "РЎРјС‹СЃР» Р¶РёР·РЅРё", text: "РЇ РїРѕС‡С‚Рё РЅРёРєРѕРіРґР° РЅРµ РґСѓРјР°СЋ Рѕ СЃРјС‹СЃР»Рµ Р¶РёР·РЅРё вЂ” СЌС‚Рѕ РїСѓСЃС‚Р°СЏ С‚РµРјР°.", reversed: true },

    { id: "lv1", scale: "Р»СЋР±РѕРІСЊ", title: "Р›СЋР±РѕРІСЊ Рё СЌРјРїР°С‚РёСЏ", text: "РЇ СѓРјРµСЋ СЃРѕРїРµСЂРµР¶РёРІР°С‚СЊ РґСЂСѓРіРёРј Р»СЋРґСЏРј." },
    { id: "lv2", scale: "Р»СЋР±РѕРІСЊ", title: "Р›СЋР±РѕРІСЊ Рё СЌРјРїР°С‚РёСЏ", text: "РЇ СЃС‚Р°СЂР°СЋСЃСЊ РїРѕРґРґРµСЂР¶РёРІР°С‚СЊ Р±Р»РёР·РєРёС… РІ С‚СЂСѓРґРЅС‹Рµ РјРѕРјРµРЅС‚С‹." },
    { id: "lv3", scale: "Р»СЋР±РѕРІСЊ", title: "Р›СЋР±РѕРІСЊ Рё СЌРјРїР°С‚РёСЏ", text: "РЇ РјРѕРіСѓ РїРѕСЃС‚Р°РІРёС‚СЊ СЃРµР±СЏ РЅР° РјРµСЃС‚Рѕ РґСЂСѓРіРѕРіРѕ С‡РµР»РѕРІРµРєР°." },
    { id: "lv4", scale: "Р»СЋР±РѕРІСЊ", title: "Р›СЋР±РѕРІСЊ Рё СЌРјРїР°С‚РёСЏ", text: "РЇ Р·Р°РјРµС‡Р°СЋ, РєРѕРіРґР° РєРѕРјСѓ-С‚Рѕ РїР»РѕС…Рѕ, РґР°Р¶Рµ РµСЃР»Рё РѕРЅ РЅРµ РіРѕРІРѕСЂРёС‚." },
    { id: "lv5", scale: "Р»СЋР±РѕРІСЊ", title: "Р›СЋР±РѕРІСЊ Рё СЌРјРїР°С‚РёСЏ", text: "РЇ СЃС‚Р°СЂР°СЋСЃСЊ РїСЂРѕСЏРІР»СЏС‚СЊ Р·Р°Р±РѕС‚Сѓ РІ РґРµР№СЃС‚РІРёСЏС…, Р° РЅРµ С‚РѕР»СЊРєРѕ СЃР»РѕРІР°РјРё." },
    { id: "lv6", scale: "Р»СЋР±РѕРІСЊ", title: "Р›СЋР±РѕРІСЊ Рё СЌРјРїР°С‚РёСЏ", text: "РњРЅРµ РёРЅС‚РµСЂРµСЃРЅС‹ С‡СѓРІСЃС‚РІР° Рё РјРѕС‚РёРІС‹ Р»СЋРґРµР№ (РІ Р¶РёР·РЅРё РёР»Рё РІ РєРЅРёРіР°С…)." },
    { id: "lv7", scale: "Р»СЋР±РѕРІСЊ", title: "Р›СЋР±РѕРІСЊ Рё СЌРјРїР°С‚РёСЏ", text: "Р•СЃР»Рё С‡РµР»РѕРІРµРєСѓ РїР»РѕС…Рѕ, СЌС‚Рѕ РѕР±С‹С‡РЅРѕ РµРіРѕ РїСЂРѕР±Р»РµРјС‹, РјРµРЅСЏ РЅРµ РєР°СЃР°РµС‚СЃСЏ.", reversed: true },

    { id: "cl1", scale: "РєРѕР»Р»РµРєС‚РёРІРёР·Рј", title: "РљРѕР»Р»РµРєС‚РёРІРёР·Рј", text: "РњРЅРµ РІР°Р¶РЅРѕ Р±С‹С‚СЊ С‡Р°СЃС‚СЊСЋ РєРѕРјР°РЅРґС‹/РєР»Р°СЃСЃР°/РіСЂСѓРїРїС‹." },
    { id: "cl2", scale: "РєРѕР»Р»РµРєС‚РёРІРёР·Рј", title: "РљРѕР»Р»РµРєС‚РёРІРёР·Рј", text: "РЎРѕРІРјРµСЃС‚РЅР°СЏ СЂР°Р±РѕС‚Р° С‡Р°СЃС‚Рѕ РґР°С‘С‚ Р»СѓС‡С€РёР№ СЂРµР·СѓР»СЊС‚Р°С‚, С‡РµРј СЂР°Р±РѕС‚Р° РІ РѕРґРёРЅРѕС‡РєСѓ." },
    { id: "cl3", scale: "РєРѕР»Р»РµРєС‚РёРІРёР·Рј", title: "РљРѕР»Р»РµРєС‚РёРІРёР·Рј", text: "РЇ РіРѕС‚РѕРІ(Р°) РїРѕРјРѕРіР°С‚СЊ РґСЂСѓРіРёРј, РґР°Р¶Рµ РµСЃР»Рё СЌС‚Рѕ РЅРµ РїСЂРёРЅРѕСЃРёС‚ РІС‹РіРѕРґС‹." },
    { id: "cl4", scale: "РєРѕР»Р»РµРєС‚РёРІРёР·Рј", title: "РљРѕР»Р»РµРєС‚РёРІРёР·Рј", text: "РЇ СЃС‡РёС‚Р°СЋ РІР°Р¶РЅС‹Рј СѓС‡РёС‚С‹РІР°С‚СЊ РёРЅС‚РµСЂРµСЃС‹ РіСЂСѓРїРїС‹." },
    { id: "cl5", scale: "РєРѕР»Р»РµРєС‚РёРІРёР·Рј", title: "РљРѕР»Р»РµРєС‚РёРІРёР·Рј", text: "РњРЅРµ Р»РµРіС‡Рµ СѓС‡РёС‚СЊСЃСЏ/СЂР°Р±РѕС‚Р°С‚СЊ, РєРѕРіРґР° СЂСЏРґРѕРј РµСЃС‚СЊ РїРѕРґРґРµСЂР¶РєР°." },
    { id: "cl6", scale: "РєРѕР»Р»РµРєС‚РёРІРёР·Рј", title: "РљРѕР»Р»РµРєС‚РёРІРёР·Рј", text: "РЇ РјРѕРіСѓ СѓСЃС‚СѓРїРёС‚СЊ, РµСЃР»Рё СЌС‚Рѕ РїРѕРјРѕРіР°РµС‚ РѕР±С‰РµРјСѓ РґРµР»Сѓ." },
    { id: "cl7", scale: "РєРѕР»Р»РµРєС‚РёРІРёР·Рј", title: "РљРѕР»Р»РµРєС‚РёРІРёР·Рј", text: "РљР°Р¶РґС‹Р№ РґРѕР»Р¶РµРЅ РґСѓРјР°С‚СЊ С‚РѕР»СЊРєРѕ Рѕ СЃРµР±Рµ вЂ” СЌС‚Рѕ РЅРѕСЂРјР°Р»СЊРЅРѕ.", reversed: true },

    { id: "pt1", scale: "РїР°С‚СЂРёРѕС‚РёР·Рј", title: "РџР°С‚СЂРёРѕС‚РёР·Рј", text: "РњРЅРµ РІР°Р¶РЅРѕ Р·РЅР°С‚СЊ РєСѓР»СЊС‚СѓСЂСѓ Рё РёСЃС‚РѕСЂРёСЋ СЃРІРѕРµР№ СЃС‚СЂР°РЅС‹." },
    { id: "pt2", scale: "РїР°С‚СЂРёРѕС‚РёР·Рј", title: "РџР°С‚СЂРёРѕС‚РёР·Рј", text: "РЇ СѓРІР°Р¶Р°СЋ С‚СЂР°РґРёС†РёРё Рё СЏР·С‹Рє СЃРІРѕРµРіРѕ РЅР°СЂРѕРґР°." },
    { id: "pt3", scale: "РїР°С‚СЂРёРѕС‚РёР·Рј", title: "РџР°С‚СЂРёРѕС‚РёР·Рј", text: "РЇ СЃС‡РёС‚Р°СЋ РІР°Р¶РЅС‹Рј РїСЂРёРЅРѕСЃРёС‚СЊ РїРѕР»СЊР·Сѓ РѕР±С‰РµСЃС‚РІСѓ." },
    { id: "pt4", scale: "РїР°С‚СЂРёРѕС‚РёР·Рј", title: "РџР°С‚СЂРёРѕС‚РёР·Рј", text: "РњРµРЅСЏ РІРѕР»РЅСѓРµС‚, С‡С‚Рѕ РїСЂРѕРёСЃС…РѕРґРёС‚ РІ РјРѕРµР№ СЃС‚СЂР°РЅРµ." },
    { id: "pt5", scale: "РїР°С‚СЂРёРѕС‚РёР·Рј", title: "РџР°С‚СЂРёРѕС‚РёР·Рј", text: "РЇ С†РµРЅСЋ РєСѓР»СЊС‚СѓСЂРЅРѕРµ РЅР°СЃР»РµРґРёРµ Рё СЃС‡РёС‚Р°СЋ РІР°Р¶РЅС‹Рј РµРіРѕ СЃРѕС…СЂР°РЅСЏС‚СЊ." },
    { id: "pt6", scale: "РїР°С‚СЂРёРѕС‚РёР·Рј", title: "РџР°С‚СЂРёРѕС‚РёР·Рј", text: "РЇ РѕС‰СѓС‰Р°СЋ СЃРІСЏР·СЊ СЃ РјРµСЃС‚РѕРј, РіРґРµ Р¶РёРІСѓ, Рё Р»СЋРґСЊРјРё РІРѕРєСЂСѓРі." },
    { id: "pt7", scale: "РїР°С‚СЂРёРѕС‚РёР·Рј", title: "РџР°С‚СЂРёРѕС‚РёР·Рј", text: "РњРЅРµ РІСЃС‘ СЂР°РІРЅРѕ, С‡С‚Рѕ Р±СѓРґРµС‚ СЃРѕ СЃС‚СЂР°РЅРѕР№ вЂ” СЌС‚Рѕ РЅРµ РјРѕС‘ РґРµР»Рѕ.", reversed: true },

    { id: "fr1", scale: "СЃРІРѕР±РѕРґР°", title: "РЎРІРѕР±РѕРґР° РІС‹Р±РѕСЂР°", text: "РњРЅРµ РІР°Р¶РЅРѕ СЃР°РјРѕСЃС‚РѕСЏС‚РµР»СЊРЅРѕ РїСЂРёРЅРёРјР°С‚СЊ СЂРµС€РµРЅРёСЏ." },
    { id: "fr2", scale: "СЃРІРѕР±РѕРґР°", title: "РЎРІРѕР±РѕРґР° РІС‹Р±РѕСЂР°", text: "РЇ С†РµРЅСЋ РїСЂР°РІРѕ РІС‹Р±РёСЂР°С‚СЊ СЃРІРѕР№ РїСѓС‚СЊ." },
    { id: "fr3", scale: "СЃРІРѕР±РѕРґР°", title: "РЎРІРѕР±РѕРґР° РІС‹Р±РѕСЂР°", text: "РЇ РјРѕРіСѓ РѕС‚СЃС‚Р°РёРІР°С‚СЊ СЃРІРѕС‘ РјРЅРµРЅРёРµ СЃРїРѕРєРѕР№РЅРѕ Рё Р°СЂРіСѓРјРµРЅС‚РёСЂРѕРІР°РЅРЅРѕ." },
    { id: "fr4", scale: "СЃРІРѕР±РѕРґР°", title: "РЎРІРѕР±РѕРґР° РІС‹Р±РѕСЂР°", text: "РЇ СЃС‚Р°СЂР°СЋСЃСЊ РЅРµ РїРѕРґРґР°РІР°С‚СЊСЃСЏ РґР°РІР»РµРЅРёСЋ, РєРѕРіРґР° РґРµР»Р°СЋ РІС‹Р±РѕСЂ." },
    { id: "fr5", scale: "СЃРІРѕР±РѕРґР°", title: "РЎРІРѕР±РѕРґР° РІС‹Р±РѕСЂР°", text: "РЇ СѓРІР°Р¶Р°СЋ СЃРІРѕР±РѕРґСѓ РґСЂСѓРіРѕРіРѕ С‡РµР»РѕРІРµРєР°." },
    { id: "fr6", scale: "СЃРІРѕР±РѕРґР°", title: "РЎРІРѕР±РѕРґР° РІС‹Р±РѕСЂР°", text: "РњРЅРµ РІР°Р¶РЅРѕ РёРјРµС‚СЊ РІРѕР·РјРѕР¶РЅРѕСЃС‚СЊ РіРѕРІРѕСЂРёС‚СЊ вЂњРЅРµС‚вЂќ." },
    { id: "fr7", scale: "СЃРІРѕР±РѕРґР°", title: "РЎРІРѕР±РѕРґР° РІС‹Р±РѕСЂР°", text: "Р›СѓС‡С€Рµ, РєРѕРіРґР° Р·Р° РјРµРЅСЏ СЂРµС€Р°СЋС‚ РґСЂСѓРіРёРµ вЂ” С‚Р°Рє СЃРїРѕРєРѕР№РЅРµРµ.", reversed: true },

    { id: "sdv1", scale: "СЃР°РјРѕСЂР°Р·РІРёС‚РёРµ", title: "РЎР°РјРѕСЂР°Р·РІРёС‚РёРµ", text: "РЇ СЃС‚Р°СЂР°СЋСЃСЊ СѓР·РЅР°РІР°С‚СЊ РЅРѕРІРѕРµ." },
    { id: "sdv2", scale: "СЃР°РјРѕСЂР°Р·РІРёС‚РёРµ", title: "РЎР°РјРѕСЂР°Р·РІРёС‚РёРµ", text: "РЇ РјРѕРіСѓ Р°РЅР°Р»РёР·РёСЂРѕРІР°С‚СЊ СЃРІРѕРё РѕС€РёР±РєРё Рё СѓС‡РёС‚СЊСЃСЏ РЅР° РЅРёС…." },
    { id: "sdv3", scale: "СЃР°РјРѕСЂР°Р·РІРёС‚РёРµ", title: "РЎР°РјРѕСЂР°Р·РІРёС‚РёРµ", text: "РљРЅРёРіРё РїРѕРјРѕРіР°СЋС‚ РјРЅРµ РїРѕРЅСЏС‚СЊ СЃРµР±СЏ Рё РјРёСЂ." },
    { id: "sdv4", scale: "СЃР°РјРѕСЂР°Р·РІРёС‚РёРµ", title: "РЎР°РјРѕСЂР°Р·РІРёС‚РёРµ", text: "РЇ СЃС‚Р°РІР»СЋ С†РµР»Рё Рё РґРІРёРіР°СЋСЃСЊ Рє РЅРёРј." },
    { id: "sdv5", scale: "СЃР°РјРѕСЂР°Р·РІРёС‚РёРµ", title: "РЎР°РјРѕСЂР°Р·РІРёС‚РёРµ", text: "РњРЅРµ РёРЅС‚РµСЂРµСЃРЅРѕ СЂР°Р·РІРёРІР°С‚СЊ РЅР°РІС‹РєРё (СѓС‡С‘Р±Р°/С‚РІРѕСЂС‡РµСЃС‚РІРѕ/СЃРїРѕСЂС‚ Рё С‚.Рї.)." },
    { id: "sdv6", scale: "СЃР°РјРѕСЂР°Р·РІРёС‚РёРµ", title: "РЎР°РјРѕСЂР°Р·РІРёС‚РёРµ", text: "РЇ СЃС‚Р°СЂР°СЋСЃСЊ СЂР°СЃС€РёСЂСЏС‚СЊ РєСЂСѓРіРѕР·РѕСЂ." },
    { id: "sdv7", scale: "СЃР°РјРѕСЂР°Р·РІРёС‚РёРµ", title: "РЎР°РјРѕСЂР°Р·РІРёС‚РёРµ", text: "Р Р°Р·РІРёРІР°С‚СЊСЃСЏ РЅРµ РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ вЂ” С‡РµР»РѕРІРµРє РЅРµ РјРµРЅСЏРµС‚СЃСЏ.", reversed: true },

    { id: "sdl1", scale: "__sd__", title: "РЁРєР°Р»Р° РёСЃРєСЂРµРЅРЅРѕСЃС‚Рё", text: "РЇ РЅРёРєРѕРіРґР° РІ Р¶РёР·РЅРё РЅРµ РіРѕРІРѕСЂРёР»(Р°) РЅРµРїСЂР°РІРґСѓ." },
    { id: "sdl2", scale: "__sd__", title: "РЁРєР°Р»Р° РёСЃРєСЂРµРЅРЅРѕСЃС‚Рё", text: "РЇ РІСЃРµРіРґР° Рё РІРѕ РІСЃС‘Рј РїРѕСЃС‚СѓРїР°СЋ РёРґРµР°Р»СЊРЅРѕ." },
    { id: "sdl3", scale: "__sd__", title: "РЁРєР°Р»Р° РёСЃРєСЂРµРЅРЅРѕСЃС‚Рё", text: "РњРЅРµ РЅРёРєРѕРіРґР° РЅРµ Р±С‹РІР°РµС‚ РѕР±РёРґРЅРѕ РёР»Рё РЅРµРїСЂРёСЏС‚РЅРѕ." },
    { id: "sdl4", scale: "__sd__", title: "РЁРєР°Р»Р° РёСЃРєСЂРµРЅРЅРѕСЃС‚Рё", text: "РЇ РІСЃРµРіРґР° РѕРґРёРЅР°РєРѕРІРѕ РґРѕР±СЂРѕР¶РµР»Р°С‚РµР»РµРЅ(СЊРЅР°) СЃРѕ РІСЃРµРјРё." },
    { id: "sdl5", scale: "__sd__", title: "РЁРєР°Р»Р° РёСЃРєСЂРµРЅРЅРѕСЃС‚Рё", text: "РЇ РЅРёРєРѕРіРґР° РЅРµ СЂР°Р·РґСЂР°Р¶Р°СЋСЃСЊ." },
    { id: "sdl6", scale: "__sd__", title: "РЁРєР°Р»Р° РёСЃРєСЂРµРЅРЅРѕСЃС‚Рё", text: "РЇ РЅРёРєРѕРіРґР° РЅРµ СЃРѕРјРЅРµРІР°СЋСЃСЊ РІ СЃРІРѕРёС… СЂРµС€РµРЅРёСЏС…." },

    { id: "att1", scale: "__attention__", title: "РџСЂРѕРІРµСЂРєР° РІРЅРёРјР°С‚РµР»СЊРЅРѕСЃС‚Рё", text: "РџРѕР¶Р°Р»СѓР№СЃС‚Р°, РІС‹Р±РµСЂРёС‚Рµ РІР°СЂРёР°РЅС‚ В«РЎРєРѕСЂРµРµ СЃРѕРіР»Р°СЃРµРЅ(Р°)В» (4).", attention: true },
  ];

  const [ordered] = useState<QuestionItem[]>(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        const savedIds = Array.isArray(parsed?.orderedIds) ? parsed.orderedIds.map(String) : [];
        if (savedIds.length) {
          const byId = new Map(base.map((q) => [q.id, q]));
          const restored = savedIds.map((id: string) => byId.get(id)).filter(Boolean) as QuestionItem[];
          if (restored.length === base.length) return restored;
        }
      }
    } catch {}

    const shuffled = shuffle(base.filter((q) => !q.attention));
    const att = base.find((q) => q.attention)!;
    const insertAt = Math.min(Math.max(10, Math.floor(shuffled.length * 0.55)), shuffled.length);
    shuffled.splice(insertAt, 0, att);
    return shuffled;
  });

  const total = ordered.length;
  const [answersById, setAnswersById] = useState<Record<string, Likert | undefined>>(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed?.answersById && typeof parsed.answersById === "object" ? parsed.answersById : {};
    } catch {
      return {};
    }
  });
  const [step, setStep] = useState(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      const parsed = raw ? JSON.parse(raw) : null;
      const saved = Number(parsed?.step ?? 0);
      return Number.isFinite(saved) ? Math.max(0, saved) : 0;
    } catch {
      return 0;
    }
  });
  const [consent, setConsent] = useState(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      const parsed = raw ? JSON.parse(raw) : null;
      return typeof parsed?.consent === "boolean" ? parsed.consent : true;
    } catch {
      return true;
    }
  });
  const [error, setError] = useState<string | null>(null);

  const current = ordered[step];
  const progress = Math.round((step / (total - 1)) * 100);

  useEffect(() => {
    try {
      localStorage.setItem(
        draftKey,
        JSON.stringify({
          orderedIds: ordered.map((q) => q.id),
          answersById,
          step,
          consent,
          updatedAt: new Date().toISOString(),
        })
      );
    } catch {}
  }, [answersById, consent, draftKey, ordered, step]);

  function setLikert(v: Likert) {
    setAnswersById((prev) => ({ ...prev, [current.id]: v }));
    setError(null);
  }

  function next() {
    if (!answersById[current.id]) {
      setError("Р’С‹Р±РµСЂРёС‚Рµ РІР°СЂРёР°РЅС‚ РѕС‚РІРµС‚Р°, С‡С‚РѕР±С‹ РїСЂРѕРґРѕР»Р¶РёС‚СЊ.");
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
      setError("РџРѕРґС‚РІРµСЂРґРёС‚Рµ СЃРѕРіР»Р°СЃРёРµ: Р°РЅРєРµС‚Р° РЅРѕСЃРёС‚ РѕР±СЂР°Р·РѕРІР°С‚РµР»СЊРЅС‹Р№ С…Р°СЂР°РєС‚РµСЂ Рё РЅРµ СЏРІР»СЏРµС‚СЃСЏ РґРёР°РіРЅРѕР·РѕРј.");
      return;
    }
    if (!validateAllAnswered()) {
      setError("РћС‚РІРµС‚СЊС‚Рµ РЅР° РІСЃРµ РІРѕРїСЂРѕСЃС‹, С‡С‚РѕР±С‹ Р·Р°РІРµСЂС€РёС‚СЊ.");
      return;
    }
    if (!validateAttention()) {
      setError("РљРѕРЅС‚СЂРѕР»СЊРЅС‹Р№ РІРѕРїСЂРѕСЃ РІС‹Р±СЂР°РЅ РЅРµРІРµСЂРЅРѕ. РџСЂРѕР№РґРёС‚Рµ РІРЅРёРјР°С‚РµР»СЊРЅРµРµ.");
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
    try {
      localStorage.removeItem(draftKey);
    } catch {}
  }

  return (
    <div className="panel" style={{ marginTop: 14 }}>
      <div className="panelTitle">РђРЅРєРµС‚Р° С†РµРЅРЅРѕСЃС‚РЅС‹С… РѕСЂРёРµРЅС‚Р°С†РёР№</div>

      <div className="testIntro">
        <div className="testNote">
          РђРЅРєРµС‚Р° РїРѕРјРѕРіР°РµС‚ СѓС‚РѕС‡РЅРёС‚СЊ РїСЂРѕС„РёР»СЊ С‡С‚РµРЅРёСЏ Рё СЃРґРµР»Р°С‚СЊ СЂРµРєРѕРјРµРЅРґР°С†РёРё РѕР±СЉСЏСЃРЅРёРјС‹РјРё. <b>Р­С‚Рѕ РЅРµ РјРµРґРёС†РёРЅСЃРєР°СЏ РґРёР°РіРЅРѕСЃС‚РёРєР°</b>.
        </div>
        <div className="testMeta">
          Р’РѕР·СЂР°СЃС‚РЅР°СЏ РіСЂСѓРїРїР°: <b>{props.profileAge}</b> вЂў Р’РѕРїСЂРѕСЃ: <b>{step + 1}</b> / <b>{total}</b>
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
          <span>РЎРѕРІСЃРµРј РЅРµ РїСЂРѕ РјРµРЅСЏ</span>
          <span>РџРѕР»РЅРѕСЃС‚СЊСЋ СЃРѕРіР»Р°СЃРµРЅ(Р°)</span>
        </div>

        {error && <div className="testError">{error}</div>}

        <div className="navRow">
          <button className="btn" type="button" onClick={prev} disabled={step === 0}>
            РќР°Р·Р°Рґ
          </button>

          {step < total - 1 ? (
            <button className="primaryBtn nextBtn" type="button" onClick={next}>
              Р”Р°Р»РµРµ
            </button>
          ) : (
            <button className="primaryBtn" type="button" onClick={() => void finish()} disabled={props.submitLoading}>
              {props.submitLoading ? "РЎРѕС…СЂР°РЅРµРЅРёРµвЂ¦" : "Р—Р°РІРµСЂС€РёС‚СЊ Рё СЃРѕС…СЂР°РЅРёС‚СЊ"}
            </button>
          )}
        </div>

        <label className="consentRow">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>РЇ РїРѕРЅРёРјР°СЋ, С‡С‚Рѕ Р°РЅРєРµС‚Р° РЅРѕСЃРёС‚ РѕР±СЂР°Р·РѕРІР°С‚РµР»СЊРЅС‹Р№ С…Р°СЂР°РєС‚РµСЂ Рё РёСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ РґР»СЏ СЂРµРєРѕРјРµРЅРґР°С†РёР№ РїРѕ С‡С‚РµРЅРёСЋ.</span>
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
        line-height: 1.35;
      }

      .resultsLead {
        margin-top: 12px;
        padding: 14px 16px;
        border-radius: 16px;
        border: 1px solid rgba(60,110,255,.16);
        background: linear-gradient(135deg, rgba(60,110,255,.08), rgba(80,200,170,.08));
        color: rgba(20,25,35,.86);
        line-height: 1.55;
      }

      .insightGrid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin-top: 14px;
        margin-bottom: 16px;
      }

      .insightCard {
        border: 1px solid rgba(20,25,35,.08);
        border-radius: 16px;
        padding: 14px;
        background: linear-gradient(180deg, rgba(255,255,255,.98), rgba(247,249,255,.96));
      }

      .insightLabel {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: .08em;
        color: rgba(80,90,120,.78);
        margin-bottom: 8px;
      }

      .insightText {
        color: rgba(20,25,35,.86);
        line-height: 1.55;
      }

      .recsLead {
        margin-top: 12px;
        margin-bottom: 12px;
        color: rgba(20,25,35,.78);
        line-height: 1.55;
        max-width: 62ch;
      }

      .deepDetails {
        margin-top: 14px;
        border: 1px solid rgba(20,25,35,.08);
        border-radius: 16px;
        padding: 10px 12px 14px;
        background: rgba(248,250,255,.78);
      }

      .deepSummary {
        cursor: pointer;
        font-weight: 700;
        color: rgba(40,70,160,.92);
        list-style: none;
      }

      .deepHint {
        color: rgba(20,25,35,.72);
        line-height: 1.5;
      }

      .deepSummary::-webkit-details-marker {
        display: none;
      }

      .deepSummary::before {
        content: "▸";
        display: inline-block;
        margin-right: 8px;
        transition: transform .15s ease;
      }

      .deepDetails[open] .deepSummary::before {
        transform: rotate(90deg);
      }

      .deepDetails[open] > *:not(.deepSummary) {
        margin-top: 12px;
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
        white-space: nowrap;
      }

      .bookExplainText {
        margin-top: 12px;
        color: rgba(20,25,35,.8);
        line-height: 1.5;
      }

      .recReasonTitle {
        margin-top: 14px;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: .08em;
        color: rgba(80,90,120,.78);
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

        .insightGrid {
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

      @media (max-width: 640px) {
        .page {
          padding: 12px 10px;
        }

        .card {
          padding: 16px 14px 14px;
          border-radius: 14px;
        }

        .h1 {
          font-size: 22px;
          line-height: 1.15;
        }

        .tabsRow {
          gap: 8px;
        }

        .tabBtn {
          width: 100%;
          text-align: center;
        }

        .panel {
          padding: 12px;
          border-radius: 14px;
        }

        .qTop {
          flex-direction: column;
          align-items: flex-start;
        }

        .qText {
          font-size: 14px;
        }

        .likertRow {
          gap: 8px;
          justify-content: space-between;
        }

        .likertBtn {
          flex: 1 1 calc(20% - 8px);
          min-width: 44px;
          height: 44px;
        }

        .likertLabels {
          flex-direction: column;
          gap: 4px;
        }

        .navRow {
          flex-wrap: wrap;
        }

        .nextBtn {
          margin-left: 0;
        }

        .navRow .btn,
        .navRow .primaryBtn {
          width: 100%;
        }
      }
    `}</style>
  );
}

function getTestDraftKey(readerId: string, age: string) {
  return `${LS_TEST_DRAFT_KEY}_${readerId || "anon"}_${age || "16+"}`;
}
