import { getToken } from "./auth";

// const API = "http://127.0.0.1:8000";
const API = "https://reading-platform-backend.onrender.com";

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(API + path, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.detail || "Ошибка запроса");
  return data as T;
}

/* =========================
   Types
   ========================= */

export type ReaderProfile = {
  id: string;
  age: string;
  concepts: Record<string, number>;
};

export type GapSummaryItem = {
  concept: string;
  target: number;
  current: number;
  gap: number;
  direction: "below" | "above" | string;
};

export type ProfileMeta = {
  reader_id: string;
  test_count: number;
  text_count: number;
  last_update_at?: string | null;
  last_source?: string | null;
  last_test_at?: string | null;
  last_text_at?: string | null;
};

export type ProfileEvent = {
  id: number;
  reader_id: string;
  created_at: string;
  type: string;
  payload?: any;
  profile_after?: any;
};

export type ExplainedRecommendation = {
  work: {
    id: string;
    title: string;
    author: string;
    age: string;
    cover_image?: string;
    concepts?: Record<string, number>;
  };
  why?: {
    mode?: string;
    score?: number;
    gaps?: Array<{
      concept: string;
      gap: number;
      via?: string;
      direction?: "below" | "above" | string;
    }>;
  };
};

export type ParentChild = {
  id: number;
  parent_email: string;
  child_id: string;
  child_name?: string | null;
  class_name?: string | null;
  created_at?: string | null;
};

export type AccountInfo = {
  user_id: number;
  email: string;
  role: string;
  full_name?: string | null;
  city?: string | null;
  school?: string | null;
  class_name?: string | null;
  avatar_url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ProfileGrowth = {
  before?: {
    created_at: string;
    concepts: Record<string, number>;
  } | null;
  after?: {
    created_at: string;
    concepts: Record<string, number>;
  } | null;
  delta: Record<string, number>;
  top_growth: Array<{ concept: string; delta: number }>;
  top_decline: Array<{ concept: string; delta: number }>;
  events_count: number;
};

export type ReadBookItem = {
  id: number;
  reader_id: string;
  work_id: string;
  title: string;
  author?: string | null;
  age?: string | null;
  rating?: number | null;
  impression_text?: string | null;
  concepts?: Record<string, number>;
  created_at?: string | null;
};

/* =========================
   Parent
   ========================= */

export async function apiParentListChildren(): Promise<ParentChild[]> {
  return apiJson<ParentChild[]>("/parent/children");
}

export async function apiParentAddChild(data: {
  child_id: string;
  child_name?: string;
  class_name?: string;
}): Promise<ParentChild> {
  return apiJson<ParentChild>("/parent/children", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function apiParentRemoveChild(child_id: string): Promise<{ ok: true }> {
  return apiJson<{ ok: true }>(`/parent/children/${encodeURIComponent(child_id)}`, {
    method: "DELETE",
  });
}

/* =========================
   Account
   ========================= */

export async function apiGetMyAccount(): Promise<AccountInfo> {
  return apiJson<AccountInfo>("/me/account");
}

export async function apiUpdateMyAccount(
  data: Partial<Pick<AccountInfo, "full_name" | "city" | "school" | "class_name" | "avatar_url">>
): Promise<AccountInfo> {
  return apiJson<AccountInfo>("/me/account", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/* =========================
   Profile / analytics
   ========================= */

export async function apiGetMyProfile(): Promise<ReaderProfile> {
  return apiJson<ReaderProfile>("/me/profile");
}

export async function apiUpsertMyProfile(profile: ReaderProfile): Promise<ReaderProfile> {
  return apiJson<ReaderProfile>("/me/profile", {
    method: "POST",
    body: JSON.stringify(profile),
  });
}

export async function apiGetProfile(readerId: string): Promise<ReaderProfile> {
  return apiJson<ReaderProfile>(`/profile/${encodeURIComponent(readerId)}`);
}

export async function apiGetGaps(readerId: string): Promise<GapSummaryItem[]> {
  return apiJson<GapSummaryItem[]>(`/gaps/${encodeURIComponent(readerId)}`);
}

export async function apiGetProfileMeta(readerId: string): Promise<ProfileMeta> {
  return apiJson<ProfileMeta>(`/profile_meta/${encodeURIComponent(readerId)}`);
}

export async function apiGetProfileHistory(
  readerId: string,
  limit = 20
): Promise<ProfileEvent[]> {
  return apiJson<ProfileEvent[]>(
    `/profile_history/${encodeURIComponent(readerId)}?limit=${limit}`
  );
}

export async function apiGetProfileGrowth(readerId: string): Promise<ProfileGrowth> {
  return apiJson<ProfileGrowth>(`/profile_growth/${encodeURIComponent(readerId)}`);
}

export async function apiGetRecommendationsExplain(
  readerId: string,
  topN = 7,
  useSaved = 1
): Promise<ExplainedRecommendation[]> {
  return apiJson<ExplainedRecommendation[]>(
    `/recommendations_explain/${encodeURIComponent(readerId)}?top_n=${topN}&use_saved=${useSaved}`
  );
}

/* =========================
   Analyze text
   ========================= */

export async function apiAnalyzeTextMe(text: string): Promise<{
  ok: boolean;
  profile?: ReaderProfile;
}> {
  return apiJson<{
    ok: boolean;
    profile?: ReaderProfile;
  }>("/me/analyze_text", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

/* =========================
   Testing
   ========================= */

export async function apiApplyTestMe(data: {
  age: string;
  test_concepts: Record<string, number>;
}): Promise<ReaderProfile> {
  return apiJson<ReaderProfile>("/me/apply_test", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/* =========================
   Reading / read books
   ========================= */

export async function apiStudentListReadBooks(): Promise<ReadBookItem[]> {
  return apiJson<ReadBookItem[]>("/reading/read-books");
}

export async function apiStudentGetReadBook(readBookId: number): Promise<ReadBookItem> {
  return apiJson<ReadBookItem>(`/reading/read-books/${readBookId}`);
}

export async function apiStudentDeleteReadBook(readBookId: number): Promise<{ ok: true }> {
  return apiJson<{ ok: true }>(`/reading/read-books/${readBookId}`, {
    method: "DELETE",
  });
}

export async function apiStudentAddReadBook(data: {
  work_id: string;
  title: string;
  author?: string;
  age?: string;
  rating?: number;
  impression_text?: string;
}): Promise<{
  ok: boolean;
  item: ReadBookItem;
  profile?: ReaderProfile | null;
}> {
  return apiJson<{
    ok: boolean;
    item: ReadBookItem;
    profile?: ReaderProfile | null;
  }>("/reading/read-books", {
    method: "POST",
    body: JSON.stringify(data),
  });
}