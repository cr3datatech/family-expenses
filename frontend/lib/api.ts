const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
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
}

export const api = {
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
  delete: (id: number) =>
    request<void>(`/expenses/${id}`, { method: "DELETE" }),
  scan: (formData: FormData) =>
    fetch(`${BASE}/expenses/scan`, { method: "POST", body: formData }).then(r => r.json()) as Promise<ReceiptScanResult>,
  categorize: (description: string) =>
    request<{ category: string }>("/expenses/categorize", {
      method: "POST",
      body: JSON.stringify({ description }),
    }),
};
