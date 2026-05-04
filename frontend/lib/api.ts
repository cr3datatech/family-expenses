const BASE = "/api";

/** FastAPI uses `{ "detail": string | array }` for errors — surface that text in the UI. */
async function errorBodyMessage(res: Response): Promise<string> {
  const text = await res.text();
  if (!text.trim()) return res.statusText || `HTTP ${res.status}`;
  try {
    const j = JSON.parse(text) as { detail?: unknown };
    if (typeof j.detail === "string") return j.detail;
    if (Array.isArray(j.detail)) {
      return j.detail
        .map((item: unknown) =>
          typeof item === "object" && item !== null && "msg" in item
            ? String((item as { msg: string }).msg)
            : JSON.stringify(item)
        )
        .join(" ");
    }
    if (j.detail != null) return String(j.detail);
  } catch {
    /* plain text body */
  }
  return text;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const detail = await errorBodyMessage(res);
    throw new Error(detail ? `${res.status}: ${detail}` : `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface User {
  id: number;
  username: string;
  is_superuser: boolean;
  email: string | null;
}

export interface ExpenseItem {
  name: string;
  qty?: number;
  unit_price?: number;
  amount: number;
}

export interface Expense {
  id: number;
  date: string;
  merchant: string | null;
  items: ExpenseItem[];
  total: number;
  currency: string;
  category: string;
  card: string;
  note: string | null;
  receipt_photo_path: string | null;
  receipt_paths: string[];
  ai_extracted: boolean;
  ai_cost: number | null;
  created_at: string;
  is_shared: boolean;
  shared_with: number[];
  user_id: number;
  attributed_username: string;
}

export interface ExpenseCreate {
  date: string;
  merchant?: string;
  items?: ExpenseItem[];
  total: number;
  currency?: string;
  category?: string;
  card: string;
  note?: string;
  receipt_photo_path?: string;
  receipt_paths?: string[];
  ai_extracted?: boolean;
  ai_cost?: number | null;
  is_shared?: boolean;
  shared_with?: number[];
  user_id?: number;
}

export interface ExpenseSummary {
  year: number;
  month: number;
  total: number;
  count: number;
  by_category: Record<string, number>;
  by_card: Record<string, number>;
}

export interface AiCostMonth {
  month: string;
  total: number;
  count: number;
  highest: Expense & { effective_ai_cost: number };
  lowest: Expense & { effective_ai_cost: number };
}

export interface AiCostsData {
  total: number;
  months: AiCostMonth[];
}

export interface ReceiptScanResult {
  merchant: string | null;
  date: string | null;
  items: ExpenseItem[];
  total: number;
  category: string;
  receipt_path: string | null;
  model: string | null;
  ai_cost: number | null;
}

export interface ScannedImage {
  filename: string;
  path: string;
  location: "archive" | "tmp";
  expense: Expense | null;
  month: string;
}

export interface AnalyticsData {
  total: number;
  count: number;
  by_category: { category: string; total: number; count: number }[];
  by_card: { card: string; total: number; count: number }[];
  by_merchant: { merchant: string; total: number; count: number }[];
  by_month: { month: string; total: number; count: number }[];
  top_items: { name: string; total_amount: number; total_qty: number; avg_unit_price: number | null }[];
}

export const api = {
  me: async (): Promise<User | null> => {
    const res = await fetch(`${BASE}/auth/me`, { credentials: "include" });
    if (res.status === 401) return null;
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  },

  login: (username: string, password: string) =>
    request<{ user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  logout: async () => {
    const res = await fetch(`${BASE}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json() as Promise<{ ok: boolean }>;
  },

  usersList: () => request<User[]>("/users/"),

  createUser: (body: { username: string; password: string; is_superuser: boolean; email: string }) =>
    request<User>("/users/", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  deleteUser: (id: number) =>
    request<void>(`/users/${id}`, { method: "DELETE" }),

  updateUser: (id: number, body: { password?: string; is_superuser?: boolean; email?: string }) =>
    request<User>(`/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  cards: () => request<string[]>("/expenses/cards"),

  activeMonths: () => request<string[]>("/expenses/active-months"),

  list: (year?: number, month?: number, isShared?: boolean, attributedTo?: number, dateFrom?: string, dateTo?: string) => {
    const params = new URLSearchParams();
    if (year !== undefined && month !== undefined) {
      params.set("year", year.toString());
      params.set("month", month.toString());
    }
    if (isShared !== undefined) params.set("is_shared", isShared ? "true" : "false");
    if (attributedTo !== undefined) params.set("attributed_to", attributedTo.toString());
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    return request<Expense[]>(`/expenses/?${params}`);
  },

  listPersonalFor: (userId: number, dateFrom?: string, dateTo?: string) => {
    const params = new URLSearchParams({ attributed_to: userId.toString() });
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    return request<Expense[]>(`/expenses/?${params}`);
  },

  listAllShared: (dateFrom?: string, dateTo?: string) => {
    const params = new URLSearchParams({ is_shared: "true" });
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    return request<Expense[]>(`/expenses/?${params}`);
  },

  listByCategory: (category: string, dateFrom?: string, dateTo?: string) => {
    const params = new URLSearchParams({ category });
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    return request<Expense[]>(`/expenses/?${params}`);
  },

  listByMerchant: (merchant: string, dateFrom?: string, dateTo?: string) => {
    const params = new URLSearchParams({ merchant });
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    return request<Expense[]>(`/expenses/?${params}`);
  },

  listByMonth: (month: string, dateFrom?: string, dateTo?: string) => {
    // month is "YYYY-MM", use year+month params for exact match
    const [y, m] = month.split("-");
    const params = new URLSearchParams({ year: y, month: m });
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    return request<Expense[]>(`/expenses/?${params}`);
  },

  summary: (year: number, month: number) =>
    request<ExpenseSummary>(`/expenses/summary/${year}/${month}`),

  create: (data: ExpenseCreate) =>
    request<Expense>("/expenses/", { method: "POST", body: JSON.stringify(data) }),

  update: (id: number, data: Partial<ExpenseCreate>) =>
    request<Expense>(`/expenses/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  delete: (id: number, deleteArchive = false) =>
    request<void>(`/expenses/${id}?delete_archive=${deleteArchive}`, { method: "DELETE" }),

  deleteArchiveFile: (filename: string, deleteExpense = false) =>
    request<void>(`/expenses/archive/${encodeURIComponent(filename)}?delete_expense=${deleteExpense}`, { method: "DELETE" }),

  deleteTmpFile: (filename: string) =>
    request<void>(`/expenses/tmp/${encodeURIComponent(filename)}`, { method: "DELETE" }),

  scan: async (formData: FormData) => {
    const res = await fetch(`${BASE}/expenses/scan`, {
      method: "POST",
      body: formData,
      credentials: "include",
    });
    if (!res.ok) {
      const detail = await errorBodyMessage(res);
      throw new Error(detail ? `${res.status}: ${detail}` : `HTTP ${res.status}`);
    }
    return res.json() as Promise<ReceiptScanResult>;
  },

  categorize: (description: string) =>
    request<{ category: string }>("/expenses/categorize", {
      method: "POST",
      body: JSON.stringify({ description }),
    }),

  search: (q: string) => request<Expense[]>(`/expenses/search?q=${encodeURIComponent(q)}`),

  config: () => request<{ scan_model: string }>("/config"),

  analytics: (dateFrom?: string, dateTo?: string, isShared?: boolean, attributedTo?: number) => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    if (isShared !== undefined) params.set("is_shared", isShared ? "true" : "false");
    if (attributedTo !== undefined) params.set("attributed_to", attributedTo.toString());
    return request<AnalyticsData>(`/expenses/analytics?${params}`);
  },

  aiCosts: () => request<AiCostsData>("/expenses/ai-costs"),

  scanned: () => request<ScannedImage[]>("/expenses/scanned"),

  deleteOrphanedImages: () =>
    request<{ deleted: string[]; count: number }>("/expenses/scanned/orphaned", { method: "DELETE" }),

  setExpenseImages: (id: number, paths: string[]) =>
    request<Expense>(`/expenses/${id}/images`, {
      method: "PUT",
      body: JSON.stringify({ paths }),
    }),

  uploadOrphanedImage: async (file: File): Promise<{ path: string; filename: string }> => {
    const formData = new FormData();
    formData.append("photo", file);
    const res = await fetch(`${BASE}/expenses/scanned/upload`, {
      method: "POST",
      body: formData,
      credentials: "include",
    });
    if (!res.ok) {
      const detail = await errorBodyMessage(res);
      throw new Error(detail ? `${res.status}: ${detail}` : `HTTP ${res.status}`);
    }
    return res.json();
  },

  scanAndAttach: async (expenseId: number, file: File): Promise<Expense> => {
    const formData = new FormData();
    formData.append("photo", file);
    const res = await fetch(`${BASE}/expenses/${expenseId}/images/scan`, {
      method: "POST",
      body: formData,
      credentials: "include",
    });
    if (!res.ok) {
      const detail = await errorBodyMessage(res);
      throw new Error(detail ? `${res.status}: ${detail}` : `HTTP ${res.status}`);
    }
    return res.json();
  },

  forgotPassword: (email: string) =>
    request<{ ok: boolean }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, new_password: string) =>
    request<{ ok: boolean; username: string }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, new_password }),
    }),
};
