"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast, ToastProvider } from "@/components/Toast";
import { todayISO } from "@/lib/dates";
import { api, Expense, ExpenseCreate, ReceiptScanResult } from "@/lib/api";
import PhotoCapture from "@/components/PhotoCapture";
import Modal from "@/components/Modal";

export default function HomePage() {
  return (
    <ToastProvider>
      <ExpensesPage />
    </ToastProvider>
  );
}

function ExpensesPage() {
  const { toast } = useToast();
  const [cards, setCards] = useState<string[]>(["Cash"]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<{ total: number; count: number; by_category: Record<string, number> } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ReceiptScanResult | null>(null);

  const loadExpenses = useCallback(async () => {
    const now = new Date();
    const [exp, sum] = await Promise.all([
      api.list(now.getFullYear(), now.getMonth() + 1),
      api.summary(now.getFullYear(), now.getMonth() + 1),
    ]);
    setExpenses(exp);
    setSummary(sum);
  }, []);

  useEffect(() => {
    loadExpenses();
    api.cards().then(setCards).catch(() => {});
  }, [loadExpenses]);

  const handlePhoto = async (file: File) => {
    setScanning(true);
    const formData = new FormData();
    formData.append("photo", file);
    try {
      const result = await api.scan(formData);
      const hasData = (result.merchant && result.merchant !== "null") || result.total > 0;
      if (!hasData) {
        toast("Could not read receipt. Try again or enter manually.");
        return;
      }
      setScanResult(result);
      setShowReview(true);
    } catch {
      toast("Failed to scan receipt. Try again or enter manually.");
    } finally {
      setScanning(false);
    }
  };

  const handleSaveFromReview = async (data: ExpenseCreate) => {
    setShowReview(false);
    setScanResult(null);
    try {
      await api.create({ ...data, ai_extracted: true } as ExpenseCreate & { ai_extracted: boolean });
      toast("Expense logged");
      loadExpenses();
    } catch {
      toast("Failed to save expense");
    }
  };

  const handleSaveManual = async (data: ExpenseCreate) => {
    setShowAdd(false);
    try {
      await api.create(data);
      toast("Expense logged");
      loadExpenses();
    } catch {
      toast("Failed to save expense");
    }
  };

  const handleOpenHistory = async () => {
    try {
      const all = await api.list();
      setAllExpenses(all);
      setShowHistory(true);
    } catch {
      toast("Failed to load history");
    }
  };

  const handleEditSave = async (data: ExpenseCreate) => {
    if (!editingExpense) return;
    try {
      await api.update(editingExpense.id, data);
      toast("Expense updated");
      setEditingExpense(null);
      const all = await api.list();
      setAllExpenses(all);
      loadExpenses();
    } catch {
      toast("Failed to update expense");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(id);
      toast("Expense deleted");
      loadExpenses();
    } catch {
      toast("Failed to delete expense");
    }
  };

  const categoryEntries = summary?.by_category
    ? Object.entries(summary.by_category).sort(([, a], [, b]) => b - a)
    : [];

  return (
    <div className="p-4 space-y-3">
      <h1 className="sticky top-0 z-40 bg-snap-50/90 backdrop-blur-sm py-4 -mx-4 px-4 -mt-4 mb-2 text-xl font-bold text-snap-800">
        Snap Expenses
      </h1>

      {/* Monthly Total */}
      <div className="bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(34,197,94,0.08)]">
        <p className="text-[11px] font-bold text-skin-secondary uppercase tracking-wide mb-1">This Month</p>
        <p className="text-2xl font-bold text-snap-800">
          {summary?.total?.toFixed(2) || "0.00"} EUR
        </p>
        <p className="text-xs text-skin-secondary mt-0.5">
          {summary?.count || 0} expense{(summary?.count || 0) !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Actions */}
      <div className="space-y-2">
        {scanning ? (
          <div className="w-full py-3.5 rounded-[14px] border-2 border-dashed border-snap-300 bg-snap-50 text-snap-500 text-[13px] font-semibold text-center">
            Scanning receipt...
          </div>
        ) : (
          <PhotoCapture onCapture={handlePhoto} label="Scan a receipt" />
        )}
        <button
          onClick={() => { setScanResult(null); setShowAdd(true); }}
          className="w-full py-3.5 rounded-[14px] border-2 border-dashed border-snap-200 bg-white text-snap-600 text-[13px] font-semibold text-center active:bg-snap-50 transition-colors"
        >
          Enter manually
        </button>
        <button
          onClick={handleOpenHistory}
          className="w-full py-3.5 rounded-[14px] border-2 border-dashed border-snap-300 bg-snap-50 text-snap-600 text-[13px] font-semibold text-center active:bg-snap-100 transition-colors"
        >
          History
        </button>
      </div>

      {/* Summary */}
      <div className="bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(34,197,94,0.08)]">
        <p className="text-[11px] font-bold text-skin-secondary uppercase tracking-wide mb-2">Summary</p>
        {categoryEntries.length > 0 ? (
          <div className="space-y-1.5">
            {categoryEntries.map(([cat, amount]) => (
              <div key={cat} className="flex justify-between items-center">
                <span className="text-sm text-snap-800 capitalize">{cat}</span>
                <span className="text-sm font-semibold text-snap-600">{amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-skin-secondary">No data yet this month.</p>
        )}
      </div>

      {/* Recent Expenses */}
      <div>
        <p className="text-[11px] font-bold text-skin-secondary uppercase tracking-wide mb-2">Recent Expenses</p>
        {expenses.length > 0 ? (
          <div className="space-y-2">
            {expenses.map((exp) => (
              <div key={exp.id} className="bg-white rounded-[14px] p-3 shadow-[0_1px_4px_rgba(34,197,94,0.08)]">
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-snap-800 truncate">
                      {exp.merchant || exp.category}
                    </p>
                    <div className="flex gap-2 mt-0.5">
                      <span className="text-[10px] text-skin-secondary capitalize">{exp.category}</span>
                      <span className="text-[10px] text-skin-secondary">{exp.card}</span>
                    </div>
                    {exp.note && <p className="text-[11px] text-skin-secondary mt-0.5 truncate">{exp.note}</p>}
                    <p className="text-[10px] text-skin-secondary mt-0.5">{exp.date}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <span className="text-sm font-bold text-snap-600 whitespace-nowrap">
                      {exp.total.toFixed(2)} {exp.currency}
                    </span>
                    <button onClick={() => handleDelete(exp.id)} className="text-skin-secondary text-lg leading-none">&times;</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-skin-secondary">No expenses yet this month.</p>
        )}
      </div>

      {/* Receipt Review Modal */}
      <Modal open={showReview} onClose={() => { setShowReview(false); setScanResult(null); }} title="Review Receipt">
        {scanResult && (
          <ReceiptReviewForm cards={cards} scanResult={scanResult} onSubmit={handleSaveFromReview} onCancel={() => { setShowReview(false); setScanResult(null); }} />
        )}
      </Modal>

      {/* Manual Entry Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Expense">
        <ManualEntryForm cards={cards} onSubmit={handleSaveManual} />
      </Modal>

      {/* History Modal */}
      <Modal open={showHistory && !editingExpense} onClose={() => setShowHistory(false)} title="Expense History">
        <HistoryList expenses={allExpenses} onEdit={(exp) => setEditingExpense(exp)} />
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editingExpense} onClose={() => setEditingExpense(null)} title="Edit Expense">
        {editingExpense && (
          <EditExpenseForm cards={cards} expense={editingExpense} onSubmit={handleEditSave} onCancel={() => setEditingExpense(null)} />
        )}
      </Modal>
    </div>
  );
}


function ReceiptReviewForm({
  cards, scanResult, onSubmit, onCancel,
}: {
  cards: string[];
  scanResult: ReceiptScanResult;
  onSubmit: (data: ExpenseCreate) => void;
  onCancel: () => void;
}) {
  const today = todayISO();
  const [merchant, setMerchant] = useState(scanResult.merchant || "");
  const [total, setTotal] = useState(scanResult.total?.toString() || "");
  const [category, setCategory] = useState(scanResult.category || "Other");
  const [card, setCard] = useState(cards[0]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!total || parseFloat(total) <= 0) return;
    setSaving(true);
    try {
      onSubmit({
        date: scanResult.date || today,
        merchant: merchant || undefined,
        items: scanResult.items || undefined,
        total: parseFloat(total),
        currency: "EUR",
        category,
        card,
        note: note || undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="bg-snap-100 rounded-xl p-3 text-xs text-skin-primary">
        <p className="font-semibold mb-1">Extracted from receipt:</p>
        {scanResult.items && scanResult.items.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {scanResult.items.slice(0, 8).map((item, i) => (
              <div key={i} className="flex justify-between">
                <span>{item.qty && item.qty > 1 ? `${item.qty}x ${item.name}` : item.name}</span>
                <span>
                  {item.qty && item.qty > 1 && item.unit_price
                    ? `${item.unit_price.toFixed(2)} = ${item.amount.toFixed(2)}`
                    : item.amount.toFixed(2)}
                </span>
              </div>
            ))}
            {scanResult.items.length > 8 && (
              <p className="text-skin-secondary">...and {scanResult.items.length - 8} more items</p>
            )}
          </div>
        )}
      </div>
      <FormField label="Shop / Merchant">
        <input type="text" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Shop name" className="form-input" />
      </FormField>
      <FormField label="Total">
        <input type="number" step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="Amount" required className="form-input" />
      </FormField>
      <FormField label="Category">
        <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" className="form-input" />
      </FormField>
      <FormField label="Card">
        <select value={card} onChange={(e) => setCard(e.target.value)} className="form-input">
          {cards.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </FormField>
      <FormField label="Note (optional)">
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note..." className="form-input" />
      </FormField>
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-snap-200 text-skin-secondary text-sm font-semibold">Cancel</button>
        <button type="submit" disabled={saving || !total} className="flex-1 py-2.5 rounded-xl bg-snap-500 text-white text-sm font-semibold active:bg-snap-600 transition-colors disabled:opacity-50">
          {saving ? "Saving..." : "Confirm & Save"}
        </button>
      </div>
    </form>
  );
}


function ManualEntryForm({
  cards, onSubmit,
}: {
  cards: string[];
  onSubmit: (data: ExpenseCreate) => void;
}) {
  const today = todayISO();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [card, setCard] = useState(cards[0]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) return;
    setSaving(true);
    try {
      let category = "Other";
      if (description) {
        try {
          const result = await api.categorize(description);
          category = result.category;
        } catch {
          // fall back to "Other"
        }
      }
      onSubmit({
        date: today,
        merchant: description || undefined,
        total: parseFloat(amount),
        currency: "EUR",
        category,
        card,
        note: note || undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was it for?" className="form-input" />
      <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount (EUR)" required className="form-input" />
      <select value={card} onChange={(e) => setCard(e.target.value)} className="form-input">
        {cards.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="form-input" />
      <button type="submit" disabled={saving || !amount} className="w-full py-2.5 rounded-xl bg-snap-500 text-white text-sm font-semibold active:bg-snap-600 transition-colors disabled:opacity-50">
        {saving ? "Categorizing & saving..." : "Save Expense"}
      </button>
    </form>
  );
}


function HistoryList({ expenses, onEdit }: { expenses: Expense[]; onEdit: (expense: Expense) => void }) {
  const grouped = expenses.reduce<Record<string, Expense[]>>((acc, exp) => {
    const key = exp.date.substring(0, 7);
    if (!acc[key]) acc[key] = [];
    acc[key].push(exp);
    return acc;
  }, {});

  const sortedMonths = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const formatMonthHeader = (ym: string) => {
    const [year, month] = ym.split("-");
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  };

  if (expenses.length === 0) {
    return <p className="text-sm text-skin-secondary py-4 text-center">No expenses found.</p>;
  }

  return (
    <div className="max-h-[65vh] overflow-y-auto -mx-1 px-1 space-y-1">
      {sortedMonths.map((ym) => (
        <div key={ym}>
          <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm py-2 px-1">
            <p className="text-[11px] font-bold text-snap-600 uppercase tracking-wide">{formatMonthHeader(ym)}</p>
          </div>
          <div className="space-y-1.5">
            {grouped[ym].map((exp) => (
              <div key={exp.id} className="bg-snap-50/50 rounded-xl p-3 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-snap-800 truncate">{exp.merchant || exp.category}</p>
                  <div className="flex gap-2 mt-0.5">
                    <span className="text-[10px] text-skin-secondary capitalize">{exp.category}</span>
                    <span className="text-[10px] text-skin-secondary">{exp.date}</span>
                  </div>
                </div>
                <span className="text-sm font-bold text-snap-600 whitespace-nowrap">{exp.total.toFixed(2)}</span>
                <button onClick={() => onEdit(exp)} className="p-1.5 rounded-lg text-snap-300 active:bg-snap-100 transition-colors" aria-label="Edit expense">
                  &#9998;
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}


function EditExpenseForm({
  cards, expense, onSubmit, onCancel,
}: {
  cards: string[];
  expense: Expense;
  onSubmit: (data: ExpenseCreate) => void;
  onCancel: () => void;
}) {
  const [merchant, setMerchant] = useState(expense.merchant || "");
  const [total, setTotal] = useState(expense.total.toString());
  const [category, setCategory] = useState(expense.category || "Other");
  const [card, setCard] = useState(expense.card || cards[0]);
  const [note, setNote] = useState(expense.note || "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!total || parseFloat(total) <= 0) return;
    setSaving(true);
    try {
      onSubmit({
        date: expense.date,
        merchant: merchant || undefined,
        total: parseFloat(total),
        currency: expense.currency || "EUR",
        category,
        card,
        note: note || undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <FormField label="Shop / Merchant">
        <input type="text" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Shop name" className="form-input" />
      </FormField>
      <FormField label="Total">
        <input type="number" step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="Amount" required className="form-input" />
      </FormField>
      <FormField label="Category">
        <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" className="form-input" />
      </FormField>
      <FormField label="Card">
        <select value={card} onChange={(e) => setCard(e.target.value)} className="form-input">
          {cards.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </FormField>
      <FormField label="Note (optional)">
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note..." className="form-input" />
      </FormField>
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-snap-200 text-skin-secondary text-sm font-semibold">Cancel</button>
        <button type="submit" disabled={saving || !total} className="flex-1 py-2.5 rounded-xl bg-snap-500 text-white text-sm font-semibold active:bg-snap-600 transition-colors disabled:opacity-50">
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  );
}


function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-bold text-skin-secondary uppercase tracking-wide">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
