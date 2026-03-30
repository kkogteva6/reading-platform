// src/api/backend.ts
// Универсальный API-клиент для фронтенда ReadingPlatform

import { getToken, getUser } from "../auth";

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function normalizeUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/api/")) return url;
  if (url.startsWith("/")) return `/api${url}`;
  return `/api/${url}`;
}

function enc(x: unknown) {
  return encodeURIComponent(String(x ?? "").trim());
}

function isFormData(body: unknown): body is FormData {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

function withAuthHeaders(initHeaders?: HeadersInit, init?: RequestInit): Headers {
  const h = new Headers(initHeaders || {});

  const token = getToken();
  if (token && !h.has("Authorization")) {
    h.set("Authorization", `Bearer ${token}`);
  }

  const u = getUser();
  if (u?.email && !h.has("X-User-Email")) {
    h.set("X-User-Email", u.email);
  }

  const hasBody = init?.body !== undefined && init?.body !== null;
  if (hasBody && !isFormData(init?.body) && !h.has("Content-Type")) {
    h.set("Content-Type", "application/json");
  }

  return h;
}

async function extractErrorText(r: Response): Promise<string> {
  const ct = r.headers.get("content-type") || "";

  try {
    if (ct.includes("application/json")) {
      const j = await r.json();
      const d = (j as any)?.detail;

      if (typeof d === "string") return d;
      if (Array.isArray(d)) return JSON.stringify(d);
      if (d && typeof d === "object") return JSON.stringify(d);

      return JSON.stringify(j);
    }

    const t = await r.text();
    return t || `${r.status} ${r.statusText}`;
  } catch {
    return `${r.status} ${r.statusText}`;
  }
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const fullUrl = normalizeUrl(url);
  const headers = withAuthHeaders(init?.headers, init);

  const r = await fetch(fullUrl, { ...init, headers });

  if (!r.ok) {
    const msg = await extractErrorText(r);
    throw new Error(msg || `${init?.method ?? "GET"} ${fullUrl} → ${r.status}`);
  }

  if (r.status === 204) return undefined as T;

  const ct = r.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const txt = await r.text().catch(() => "");
    return txt as T;
  }

  return (await r.json()) as T;
}

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export type Role = "student" | "parent" | "teacher" | "admin" | string;

export type Work = {
  id: string;
  title: string;
  author: string;
  age: string;
  concepts: Record<string, number>;
  cover_image?: string | null;
  annotation?: string | null;
};

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

export type GapItem = {
  concept: string;
  target: number;
  current: number;
  gap: number;
  direction: "below" | "above" | string;
  weight: number;
  via?: string | null;
};

export type WhyBlock = {
  mode: "correction" | "deepening";
  score: number;
  gaps: GapItem[];
};

export type ExplainedRecommendation = {
  work: Work;
  why: WhyBlock;
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
  type: "test" | "text" | "book_review" | string;
  payload?: any;
  profile_after?: any;
};

export type AccountInfo = {
  user_id: number;
  email: string;
  role: Role;
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
  top_growth: Array<{
    concept: string;
    delta: number;
  }>;
  top_decline: Array<{
    concept: string;
    delta: number;
  }>;
  events_count: number;
};

export type RecommendationSnapshot = {
  id: number;
  reader_id: string;
  created_at: string;
  source: "test" | "text" | "manual" | string;
  top_n: number;
  gaps?: any;
  profile?: any;
  recs: any;
};

export type ParentChild = {
  id: number;
  parent_email: string;
  child_id: string;
  child_name?: string | null;
  class_name?: string | null;
  created_at?: string | null;
};

export type TeacherStudent = {
  id: string;
  name: string;
  created_at?: string;
};

export type TeacherClass = {
  id: number;
  teacher_email: string;
  class_name: string;
  created_at: string;
  students_count?: number;
};

export type TeacherClassStudent = {
  id: number;
  class_id: number;
  student_id: string;
  student_name?: string | null;
  created_at: string;

  test_count?: number;
  text_count?: number;
  last_update_at?: string | null;
  last_source?: string | null;
  has_progress?: boolean;
  avg_profile_growth?: number;
};

export type TeacherClassAnalytics = {
  class_id: number;
  class_name: string;
  students_count: number;
  active_students: number;
  with_tests: number;
  with_texts: number;
  with_both: number;
  with_progress: number;
  avg_profile_growth: number;
  top_deficits: Array<{
    concept: string;
    avg_gap: number;
    count: number;
  }>;
  top_growth_concepts: Array<{
    concept: string;
    avg_growth: number;
    count: number;
  }>;
  students: Array<{
    student_id: string;
    student_name: string;
    test_count: number;
    text_count: number;
    last_update_at: string | null;
    last_source: string | null;
    has_progress: boolean;
    avg_profile_growth: number;
  }>;
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

export type AdminBookIn = {
  id: string;
  title: string;
  author: string;
  age?: string;
  annotation?: string;
  cover_image?: string;
};

export type AdminAnalytics = {
  totals: {
    users: number;
    students: number;
    parents: number;
    teachers: number;
    admins: number;
    profiles: number;
    profile_meta: number;
    events: number;
    snapshots: number;
    active_users: number;
    test_events: number;
    text_events: number;
  };
  engagement: {
    active_share: number;
    avg_events_per_user: number;
    avg_tests_per_student: number;
    avg_texts_per_student: number;
    users_with_tests: number;
    users_with_texts: number;
    users_with_both: number;
    users_without_activity: number;
    users_without_profile: number;
  };
  top_sources: Array<{ source: string; c: number }>;
  top_books: Array<{
    id: string;
    title: string;
    author: string;
    count: number;
  }>;
  top_concepts: Array<{
    concept: string;
    count: number;
  }>;
  library_quality: {
    books_total: number;
    books_without_cover: number;
    books_without_annotation: number;
  };
  effectiveness: {
    students_with_enough_history: number;
    students_with_progress: number;
    students_without_progress: number;
    students_with_regress: number;
    avg_profile_growth: number;
    top_growth_concepts: Array<{
      concept: string;
      avg_growth: number;
      count: number;
    }>;
    weak_growth_concepts: Array<{
      concept: string;
      avg_growth: number;
      count: number;
    }>;
  };
};

export type AdminUserRow = {
  id: number;
  email: string;
  name: string;
  role: Role;
  created_at?: string;
};

export type AdminUserFull = {
  id: number;
  email: string;
  name: string;
  role: Role;
  created_at?: string;
  profile?: any;
  meta?: any;
};

/* ------------------------------------------------------------------ */
/* Account                                                            */
/* ------------------------------------------------------------------ */

export async function apiGetMyAccount(): Promise<AccountInfo> {
  return jsonFetch<AccountInfo>(`/me/account`);
}

export async function apiUpdateMyAccount(
  data: Partial<Pick<AccountInfo, "full_name" | "city" | "school" | "class_name" | "avatar_url">>
): Promise<AccountInfo> {
  return jsonFetch<AccountInfo>(`/me/account`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/* ------------------------------------------------------------------ */
/* Parent                                                             */
/* ------------------------------------------------------------------ */

export async function apiParentListChildren(): Promise<ParentChild[]> {
  return jsonFetch<ParentChild[]>(`/parent/children`);
}

export async function apiParentAddChild(data: {
  child_id: string;
  child_name?: string;
  class_name?: string;
}): Promise<ParentChild> {
  return jsonFetch<ParentChild>(`/parent/children`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function apiParentRemoveChild(child_id: string): Promise<{ ok: true }> {
  return jsonFetch<{ ok: true }>(`/parent/children/${enc(child_id)}`, {
    method: "DELETE",
  });
}

/* ------------------------------------------------------------------ */
/* Profile                                                            */
/* ------------------------------------------------------------------ */

export async function apiGetProfile(profileId: string): Promise<ReaderProfile> {
  return jsonFetch<ReaderProfile>(`/profile/${enc(profileId)}`);
}

export async function apiGetMyProfile(): Promise<ReaderProfile> {
  return jsonFetch<ReaderProfile>(`/me/profile`);
}

export async function apiUpsertMyProfile(profile: ReaderProfile): Promise<ReaderProfile> {
  return jsonFetch<ReaderProfile>(`/me/profile`, {
    method: "POST",
    body: JSON.stringify(profile),
  });
}

/* ------------------------------------------------------------------ */
/* Analyze text                                                       */
/* ------------------------------------------------------------------ */

export async function apiAnalyzeTextMe(text: string): Promise<{
  ok: boolean;
  profile?: ReaderProfile;
}> {
  return jsonFetch<{
    ok: boolean;
    profile?: ReaderProfile;
  }>(`/me/analyze_text`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

/* ------------------------------------------------------------------ */
/* Apply test                                                         */
/* ------------------------------------------------------------------ */

export type ApplyTestRequest = {
  age?: string;
  test_concepts: Record<string, number>;
};

export async function apiApplyTestMe(req: ApplyTestRequest): Promise<ReaderProfile> {
  return jsonFetch<ReaderProfile>(`/me/apply_test`, {
    method: "POST",
    body: JSON.stringify(req),
  });
}

/* ------------------------------------------------------------------ */
/* Gaps / analytics                                                   */
/* ------------------------------------------------------------------ */

export async function apiGetGaps(readerId: string): Promise<GapSummaryItem[]> {
  return jsonFetch<GapSummaryItem[]>(`/gaps/${enc(readerId)}`);
}

export async function apiGetProfileMeta(readerId: string): Promise<ProfileMeta> {
  return jsonFetch<ProfileMeta>(`/profile_meta/${enc(readerId)}`);
}

export async function apiGetProfileHistory(readerId: string, limit = 20): Promise<ProfileEvent[]> {
  return jsonFetch<ProfileEvent[]>(`/profile_history/${enc(readerId)}?limit=${limit}`);
}

export async function apiGetProfileGrowth(readerId: string): Promise<ProfileGrowth> {
  return jsonFetch<ProfileGrowth>(`/profile_growth/${enc(readerId)}`);
}

/* ------------------------------------------------------------------ */
/* Recommendations                                                    */
/* ------------------------------------------------------------------ */

export async function apiGetRecommendations(readerId: string, topN = 5): Promise<Work[]> {
  return jsonFetch<Work[]>(`/recommendations/${enc(readerId)}?top_n=${topN}`);
}

export async function apiGetRecommendationsExplain(
  readerId: string,
  topN = 5,
  useSaved = 1
): Promise<ExplainedRecommendation[]> {
  return jsonFetch<ExplainedRecommendation[]>(
    `/recommendations_explain/${enc(readerId)}?top_n=${topN}&use_saved=${useSaved}`
  );
}

export async function apiGetRecommendationSaved(
  readerId: string,
  limit = 20
): Promise<RecommendationSnapshot[]> {
  return jsonFetch<RecommendationSnapshot[]>(
    `/recommendations_saved/${enc(readerId)}?limit=${limit}`
  );
}

/* ------------------------------------------------------------------ */
/* Reading / read books                                               */
/* ------------------------------------------------------------------ */

export async function apiStudentListReadBooks(): Promise<ReadBookItem[]> {
  return jsonFetch<ReadBookItem[]>(`/reading/read-books`);
}

export async function apiStudentGetReadBook(id: number): Promise<ReadBookItem> {
  return jsonFetch<ReadBookItem>(`/reading/read-books/${id}`);
}

export async function apiStudentDeleteReadBook(id: number): Promise<{ ok: true }> {
  return jsonFetch<{ ok: true }>(`/reading/read-books/${id}`, {
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
  return jsonFetch<{
    ok: boolean;
    item: ReadBookItem;
    profile?: ReaderProfile | null;
  }>(`/reading/read-books`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/* ------------------------------------------------------------------ */
/* Teacher                                                            */
/* ------------------------------------------------------------------ */

export async function apiTeacherListStudents(): Promise<TeacherStudent[]> {
  return jsonFetch<TeacherStudent[]>(`/teacher/students`);
}

export async function apiTeacherAddStudent(student_id: string, student_name?: string) {
  return jsonFetch<any>(`/teacher/students`, {
    method: "POST",
    body: JSON.stringify({ student_id, student_name }),
  });
}

export async function apiTeacherRemoveStudent(studentId: string) {
  return jsonFetch<any>(`/teacher/students/${enc(studentId)}`, {
    method: "DELETE",
  });
}

export async function apiTeacherListClasses(): Promise<TeacherClass[]> {
  return jsonFetch<TeacherClass[]>(`/teacher/classes`);
}

export async function apiTeacherCreateClass(class_name: string): Promise<TeacherClass> {
  return jsonFetch<TeacherClass>(`/teacher/classes`, {
    method: "POST",
    body: JSON.stringify({ class_name }),
  });
}

export async function apiTeacherDeleteClass(classId: number) {
  return jsonFetch<{ ok: true }>(`/teacher/classes/${classId}`, {
    method: "DELETE",
  });
}

export async function apiTeacherListClassStudents(classId: number): Promise<TeacherClassStudent[]> {
  return jsonFetch<TeacherClassStudent[]>(`/teacher/classes/${classId}/students`);
}

export async function apiTeacherAddStudentToClass(
  classId: number,
  student_id: string,
  student_name?: string
): Promise<TeacherClassStudent> {
  return jsonFetch<TeacherClassStudent>(`/teacher/classes/${classId}/students`, {
    method: "POST",
    body: JSON.stringify({ student_id, student_name }),
  });
}

export async function apiTeacherRemoveStudentFromClass(classId: number, studentId: string) {
  return jsonFetch<{ ok: true }>(
    `/teacher/classes/${classId}/students/${enc(studentId)}`,
    {
      method: "DELETE",
    }
  );
}

export async function apiTeacherGetClassAnalytics(classId: number): Promise<TeacherClassAnalytics> {
  return jsonFetch<TeacherClassAnalytics>(`/teacher/classes/${classId}/analytics`);
}

/* ------------------------------------------------------------------ */
/* Admin                                                              */
/* ------------------------------------------------------------------ */

export async function apiAdminListBooks(): Promise<any[]> {
  return jsonFetch<any[]>(`/admin/books`);
}

export async function apiAdminAddBook(book: AdminBookIn): Promise<any> {
  return jsonFetch<any>(`/admin/books`, {
    method: "POST",
    body: JSON.stringify(book),
  });
}

export async function apiAdminUpdateBook(bookId: string, book: AdminBookIn): Promise<any> {
  return jsonFetch<any>(`/admin/books/${enc(bookId)}`, {
    method: "PUT",
    body: JSON.stringify(book),
  });
}

export async function apiAdminDeleteBook(bookId: string): Promise<any> {
  return jsonFetch<any>(`/admin/books/${enc(bookId)}`, {
    method: "DELETE",
  });
}

export async function apiAdminUploadCover(
  file: File
): Promise<{ ok: true; cover_image: string; filename: string }> {
  const form = new FormData();
  form.append("file", file);

  return jsonFetch<{ ok: true; cover_image: string; filename: string }>(`/admin/upload_cover`, {
    method: "POST",
    body: form,
  });
}

export async function apiAdminRebuildWorks(): Promise<any> {
  return jsonFetch<any>(`/admin/rebuild_works`, { method: "POST" });
}

export async function apiAdminImportWorksNeo4j(): Promise<any> {
  return jsonFetch<any>(`/admin/import_works_neo4j`, { method: "POST" });
}

export async function apiAdminPublish(): Promise<any> {
  return jsonFetch<any>(`/admin/publish`, { method: "POST" });
}

export async function apiAdminGetAnalytics(): Promise<AdminAnalytics> {
  return jsonFetch<AdminAnalytics>(`/admin/analytics`);
}

export async function apiAdminListUsers(): Promise<AdminUserRow[]> {
  return jsonFetch<AdminUserRow[]>(`/admin/users`);
}

export async function apiAdminGetUser(userId: number): Promise<AdminUserFull> {
  return jsonFetch<AdminUserFull>(`/admin/users/${userId}`);
}

export async function apiAdminUpdateUserRole(userId: number, role: Role): Promise<any> {
  return jsonFetch<any>(`/admin/users/${userId}/role`, {
    method: "PUT",
    body: JSON.stringify({ role }),
  });
}

export async function apiAdminResetUserProfile(userId: number): Promise<any> {
  return jsonFetch<any>(`/admin/users/${userId}/reset_profile`, {
    method: "POST",
  });
}

export async function apiAdminDeleteUser(userId: number): Promise<any> {
  return jsonFetch<any>(`/admin/users/${userId}`, {
    method: "DELETE",
  });
}