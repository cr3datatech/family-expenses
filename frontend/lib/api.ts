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
  ai_extracted: boolean;
  created_at: string;
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

export interface ReceiptScanResult {
  merchant: string | null;
  date: string | null;
  items: ExpenseItem[];
  total: number;
  category: string;
  receipt_path: string | null;
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

  list: (year?: number, month?: number) => {
    const params = new URLSearchParams();
    if (year !== undefined && month !== undefined) {
      params.set("year", year.toString());
      params.set("month", month.toString());
    }
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

  analytics: (dateFrom?: string, dateTo?: string) => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    return request<AnalyticsData>(`/expenses/analytics?${params}`);
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
