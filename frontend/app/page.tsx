"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast, ToastProvider } from "@/components/Toast";
import { todayISO } from "@/lib/dates";
import { api, Expense, ExpenseCreate, ReceiptScanResult, User } from "@/lib/api";
import PhotoCapture from "@/components/PhotoCapture";
import Modal from "@/components/Modal";

const SCAN_STEPS = ["Prepare", "Upload", "Analyze", "Finish"];

function ScanProgress({
  phase,
  stepIndex,
}: {
  phase: string | null;
  stepIndex: number;
}) {
  if (!phase) return null;
  const isAnalyzing = stepIndex === 2;
  const isError =
    phase.includes("Couldn't") || phase.includes("failed") || phase.includes("Failed");

  return (
    <div className="w-full rounded-[14px] border-2 border-dashed border-snap-400 bg-white p-3 shadow-[0_1px_4px_rgba(34,197,94,0.06)] space-y-3">
      <div className="flex items-center justify-between gap-1 px-0.5">
        {SCAN_STEPS.map((label, i) => {
          const done = i < stepIndex;
          const active = i === stepIndex;
          return (
            <div key={label} className="flex flex-1 flex-col items-center gap-1 min-w-0">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 transition-colors ${
                  done
                    ? "bg-snap-500 text-white"
                    : active
                      ? "bg-snap-400 text-white ring-2 ring-snap-300 ring-offset-1"
                      : "bg-snap-100 text-skin-secondary"
                }`}
              >
                {done ? "✓" : i + 1}
              </div>
              <span
                className={`text-[9px] font-semibold uppercase tracking-tight text-center leading-tight ${
                  active ? "text-snap-700" : "text-skin-secondary"
                }`}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>

      {isAnalyzing && (
        <div className="scan-indeterminate-track" aria-hidden>
          <div className="scan-indeterminate-bar" />
        </div>
      )}

      <p
        aria-live="polite"
        className={`text-[13px] font-semibold text-center leading-snug px-1 ${
          isError ? "text-red-700" : "text-snap-800"
        }`}
      >
        {phase}
      </p>
    </div>
  );
}

export default function HomePage() {
  return (
    <ToastProvider>
      <AuthGate />
    </ToastProvider>
  );
}

function AuthGate() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    api.me().then(setUser).catch(() => setUser(null));
  }, []);

  if (user === undefined) {
    return (
      <div className="p-8 text-center text-skin-secondary text-sm">Loading…</div>
    );
  }

  if (user === null) {
    return <LoginForm onLoggedIn={setUser} />;
  }

  return (
    <ExpensesPage
      user={user}
      onLogout={async () => {
        await api.logout();
        setUser(null);
      }}
    />
  );
}

function LoginForm({ onLoggedIn }: { onLoggedIn: (u: User) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const r = await api.login(username.trim(), password);
      onLoggedIn(r.user);
    } catch {
      setErr("Invalid username or password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 max-w-sm mx-auto pt-16">
      <h1 className="text-xl font-bold text-snap-800 mb-6 text-center">Snap Expenses</h1>
      <form onSubmit={handleSubmit} className="space-y-3 bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(34,197,94,0.08)]">
        {err && <p className="text-sm text-red-600">{err}</p>}
        <input
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          required
          className="form-input w-full"
        />
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
          className="form-input w-full"
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full py-2.5 rounded-xl bg-snap-500 text-white text-sm font-semibold disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

function ExpensesPage({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [cards, setCards] = useState<string[]>(["Credit Card"]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<{ total: number; count: number; by_category: Record<string, number> } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  /** `null` = idle; otherwise current step message for receipt scan */
  const [scanPhase, setScanPhase] = useState<string | null>(null);
  const [scanStepIndex, setScanStepIndex] = useState(0);
  const scanning = scanPhase !== null;
  const [scanResult, setScanResult] = useState<ReceiptScanResult | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);

  const refreshUsers = useCallback(() => {
    if (!user.is_superuser) return;
    api.usersList().then(setAllUsers).catch(() => {});
  }, [user.is_superuser]);

  useEffect(() => {
    refreshUsers();
  }, [refreshUsers]);

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
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const setStep = (index: number, label: string) => {
      setScanStepIndex(index);
      setScanPhase(label);
    };

    setStep(0, "Preparing photo…");
    await delay(50);

    const formData = new FormData();
    formData.append("photo", file);

    setStep(1, "Uploading to server…");
    await delay(40);

    try {
      setStep(2, "Reading receipt with AI…");
      const result = await api.scan(formData);

      const hasData = (result.merchant && result.merchant !== "null") || result.total > 0;
      if (!hasData) {
        const m = result.merchant ?? "(none)";
        const t =
          result.total !== undefined && result.total !== null
            ? String(result.total)
            : "(none)";
        setStep(3, "Couldn't extract merchant or total");
        await delay(1200);
        toast(
          `Could not read receipt (merchant: ${m}, total: ${t}). Try a clearer photo or enter manually.`
        );
        return;
      }

      setStep(3, "Opening review…");
      await delay(200);
      setScanResult(result);
      setShowReview(true);
    } catch (e) {
      const msg =
        e instanceof Error && e.message
          ? e.message
          : "Failed to scan receipt. Try again or enter manually.";
      setStep(3, "Scan failed");
      await delay(400);
      toast(msg);
    } finally {
      setScanPhase(null);
      setScanStepIndex(0);
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
      <div className="sticky top-0 z-40 bg-snap-50/90 backdrop-blur-sm py-3 -mx-4 px-4 -mt-4 mb-2 flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-snap-800">Snap Expenses</h1>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-skin-secondary truncate max-w-[100px]" title={user.username}>
            {user.username}
          </span>
          {user.is_superuser && (
            <button
              type="button"
              onClick={() => { refreshUsers(); setShowAdmin(true); }}
              className="text-[11px] font-semibold text-snap-600 px-2 py-1 rounded-lg bg-white border border-snap-200"
            >
              Users
            </button>
          )}
          <button
            type="button"
            onClick={() => void onLogout()}
            className="text-[11px] font-semibold text-skin-secondary px-2 py-1"
          >
            Log out
          </button>
        </div>
      </div>

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
          <ScanProgress phase={scanPhase} stepIndex={scanStepIndex} />
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
              <div
                key={exp.id}
                role="button"
                tabIndex={0}
                aria-label={`Edit expense: ${exp.merchant || exp.category}`}
                onClick={() => setEditingExpense(exp)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setEditingExpense(exp);
                  }
                }}
                className="bg-white rounded-[14px] p-3 shadow-[0_1px_4px_rgba(34,197,94,0.08)] cursor-pointer text-left w-full active:bg-snap-50/90 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-snap-800 truncate">
                      {exp.merchant || exp.category}
                    </p>
                    <div className="flex gap-2 mt-0.5 flex-wrap">
                      <span className="text-[10px] text-skin-secondary capitalize">{exp.category}</span>
                      <span className="text-[10px] text-skin-secondary">{exp.card}</span>
                      <span className="text-[10px] text-snap-500">{exp.attributed_username}</span>
                    </div>
                    {exp.note && <p className="text-[11px] text-skin-secondary mt-0.5 truncate">{exp.note}</p>}
                    <p className="text-[10px] text-skin-secondary mt-0.5">{exp.date}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <span className="text-sm font-bold text-snap-600 whitespace-nowrap">
                      {exp.total.toFixed(2)} {exp.currency}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(exp.id);
                      }}
                      className="text-skin-secondary text-lg leading-none px-1 -mr-1 rounded-lg hover:bg-snap-100"
                      aria-label="Delete expense"
                    >
                      &times;
                    </button>
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
          <ReceiptReviewForm
            cards={cards}
            scanResult={scanResult}
            onSubmit={handleSaveFromReview}
            onCancel={() => { setShowReview(false); setScanResult(null); }}
            currentUser={user}
            allUsers={allUsers}
          />
        )}
      </Modal>

      {/* Manual Entry Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Expense">
        <ManualEntryForm cards={cards} onSubmit={handleSaveManual} currentUser={user} allUsers={allUsers} />
      </Modal>

      {/* History Modal */}
      <Modal open={showHistory && !editingExpense} onClose={() => setShowHistory(false)} title="Expense History">
        <HistoryList expenses={allExpenses} onEdit={(exp) => setEditingExpense(exp)} />
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editingExpense} onClose={() => setEditingExpense(null)} title="Edit Expense">
        {editingExpense && (
          <EditExpenseForm
            cards={cards}
            expense={editingExpense}
            onSubmit={handleEditSave}
            onCancel={() => setEditingExpense(null)}
            currentUser={user}
            allUsers={allUsers}
          />
        )}
      </Modal>

      {user.is_superuser && (
        <Modal open={showAdmin} onClose={() => setShowAdmin(false)} title="User management">
          <UserAdminPanel
            users={allUsers}
            currentId={user.id}
            onRefresh={() => { refreshUsers(); toast("Updated"); }}
            onClose={() => setShowAdmin(false)}
          />
        </Modal>
      )}
    </div>
  );
}


function ReceiptReviewForm({
  cards, scanResult, onSubmit, onCancel, currentUser, allUsers,
}: {
  cards: string[];
  scanResult: ReceiptScanResult;
  onSubmit: (data: ExpenseCreate) => void;
  onCancel: () => void;
  currentUser: User;
  allUsers: User[];
}) {
  const today = todayISO();
  const [merchant, setMerchant] = useState(scanResult.merchant || "");
  const [total, setTotal] = useState(scanResult.total?.toString() || "");
  const [category, setCategory] = useState(scanResult.category || "Other");
  const [card, setCard] = useState(cards[0]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [attributedUserId, setAttributedUserId] = useState(currentUser.id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!total || parseFloat(total) <= 0) return;
    setSaving(true);
    try {
      const payload: ExpenseCreate = {
        date: scanResult.date || today,
        merchant: merchant || undefined,
        items: scanResult.items || undefined,
        total: parseFloat(total),
        currency: "EUR",
        category,
        card,
        note: note || undefined,
      };
      if (currentUser.is_superuser) {
        payload.user_id = attributedUserId;
      }
      onSubmit(payload);
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
      {currentUser.is_superuser && allUsers.length > 0 && (
        <FormField label="Attributed to">
          <select
            value={attributedUserId}
            onChange={(e) => setAttributedUserId(Number(e.target.value))}
            className="form-input"
          >
            {allUsers.map((u) => (
              <option key={u.id} value={u.id}>{u.username}{u.is_superuser ? " (admin)" : ""}</option>
            ))}
          </select>
        </FormField>
      )}
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
  cards, onSubmit, currentUser, allUsers,
}: {
  cards: string[];
  onSubmit: (data: ExpenseCreate) => void;
  currentUser: User;
  allUsers: User[];
}) {
  const today = todayISO();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [card, setCard] = useState(cards[0]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [attributedUserId, setAttributedUserId] = useState(currentUser.id);

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
      const payload: ExpenseCreate = {
        date: today,
        merchant: description || undefined,
        total: parseFloat(amount),
        currency: "EUR",
        category,
        card,
        note: note || undefined,
      };
      if (currentUser.is_superuser) {
        payload.user_id = attributedUserId;
      }
      onSubmit(payload);
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
      {currentUser.is_superuser && allUsers.length > 0 && (
        <select
          value={attributedUserId}
          onChange={(e) => setAttributedUserId(Number(e.target.value))}
          className="form-input"
        >
          {allUsers.map((u) => (
            <option key={u.id} value={u.id}>{u.username}</option>
          ))}
        </select>
      )}
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
                  <div className="flex gap-2 mt-0.5 flex-wrap">
                    <span className="text-[10px] text-skin-secondary capitalize">{exp.category}</span>
                    <span className="text-[10px] text-skin-secondary">{exp.date}</span>
                    <span className="text-[10px] text-snap-500">{exp.attributed_username}</span>
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
  cards, expense, onSubmit, onCancel, currentUser, allUsers,
}: {
  cards: string[];
  expense: Expense;
  onSubmit: (data: ExpenseCreate & { user_id?: number }) => void;
  onCancel: () => void;
  currentUser: User;
  allUsers: User[];
}) {
  const [merchant, setMerchant] = useState(expense.merchant || "");
  const [total, setTotal] = useState(expense.total.toString());
  const [category, setCategory] = useState(expense.category || "Other");
  const [card, setCard] = useState(expense.card || cards[0]);
  const [note, setNote] = useState(expense.note || "");
  const [saving, setSaving] = useState(false);
  const [attributedUserId, setAttributedUserId] = useState(expense.user_id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!total || parseFloat(total) <= 0) return;
    setSaving(true);
    try {
      const payload: ExpenseCreate & { user_id?: number } = {
        date: expense.date,
        merchant: merchant || undefined,
        total: parseFloat(total),
        currency: expense.currency || "EUR",
        category,
        card,
        note: note || undefined,
      };
      if (currentUser.is_superuser) {
        payload.user_id = attributedUserId;
      }
      onSubmit(payload);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <FormField label="Shop / Merchant">
        <input type="text" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Shop name" className="form-input" />
      </FormField>
      {expense.items && expense.items.length > 0 && (
        <div className="bg-snap-100 rounded-xl p-3 text-xs text-skin-primary">
          <p className="font-semibold mb-1">Line items</p>
          <div className="mt-1 space-y-0.5 max-h-[40vh] overflow-y-auto">
            {expense.items.map((item, i) => (
              <div key={i} className="flex justify-between gap-2">
                <span className="min-w-0 break-words">
                  {item.qty && item.qty > 1 ? `${item.qty}× ${item.name}` : item.name}
                </span>
                <span className="shrink-0">
                  {item.qty && item.qty > 1 && item.unit_price != null
                    ? `${item.unit_price.toFixed(2)} → ${item.amount.toFixed(2)}`
                    : item.amount.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
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
      {currentUser.is_superuser && allUsers.length > 0 && (
        <FormField label="Attributed to">
          <select
            value={attributedUserId}
            onChange={(e) => setAttributedUserId(Number(e.target.value))}
            className="form-input"
          >
            {allUsers.map((u) => (
              <option key={u.id} value={u.id}>{u.username}</option>
            ))}
          </select>
        </FormField>
      )}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-snap-200 text-skin-secondary text-sm font-semibold">Cancel</button>
        <button type="submit" disabled={saving || !total} className="flex-1 py-2.5 rounded-xl bg-snap-500 text-white text-sm font-semibold active:bg-snap-600 transition-colors disabled:opacity-50">
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  );
}


function UserAdminPanel({
  users,
  currentId,
  onRefresh,
  onClose,
}: {
  users: User[];
  currentId: number;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newSuper, setNewSuper] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pwEdit, setPwEdit] = useState<Record<number, string>>({});

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword) return;
    setBusy(true);
    try {
      await api.createUser({
        username: newUsername.trim(),
        password: newPassword,
        is_superuser: newSuper,
      });
      setNewUsername("");
      setNewPassword("");
      setNewSuper(false);
      onRefresh();
    } catch {
      alert("Could not create user (duplicate name?)");
    } finally {
      setBusy(false);
    }
  };

  const setPassword = async (id: number) => {
    const pw = pwEdit[id]?.trim();
    if (!pw) return;
    setBusy(true);
    try {
      await api.updateUser(id, { password: pw });
      setPwEdit((p) => ({ ...p, [id]: "" }));
      onRefresh();
    } catch {
      alert("Could not update password");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this user? They must have no attributed expenses.")) return;
    setBusy(true);
    try {
      await api.deleteUser(id);
      onRefresh();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Could not delete user");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto">
      <form onSubmit={createUser} className="space-y-2 p-3 rounded-xl bg-snap-50/80 border border-snap-100">
        <p className="text-[11px] font-bold text-skin-secondary uppercase">Add user</p>
        <input
          className="form-input w-full"
          placeholder="Username"
          value={newUsername}
          onChange={(e) => setNewUsername(e.target.value)}
        />
        <input
          className="form-input w-full"
          type="password"
          placeholder="Password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-snap-700">
          <input type="checkbox" checked={newSuper} onChange={(e) => setNewSuper(e.target.checked)} />
          Superuser
        </label>
        <button
          type="submit"
          disabled={busy}
          className="w-full py-2 rounded-xl bg-snap-500 text-white text-sm font-semibold disabled:opacity-50"
        >
          Create user
        </button>
      </form>

      <div className="space-y-2">
        {users.map((u) => (
          <div key={u.id} className="p-3 rounded-xl border border-snap-100 space-y-2">
            <div className="flex justify-between items-center gap-2">
              <span className="font-semibold text-snap-800">{u.username}</span>
              {u.is_superuser && (
                <span className="text-[10px] uppercase font-bold text-snap-600">admin</span>
              )}
            </div>
            <div className="flex gap-1">
              <input
                className="form-input flex-1 text-sm"
                type="password"
                placeholder="New password"
                value={pwEdit[u.id] ?? ""}
                onChange={(e) => setPwEdit((p) => ({ ...p, [u.id]: e.target.value }))}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void setPassword(u.id)}
                className="px-2 py-1 text-xs font-semibold rounded-lg bg-snap-100 text-snap-700"
              >
                Set
              </button>
            </div>
            {u.id !== currentId && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void remove(u.id)}
                className="text-xs text-red-600 font-semibold"
              >
                Delete user
              </button>
            )}
          </div>
        ))}
      </div>
      <button type="button" onClick={onClose} className="w-full py-2 text-sm text-skin-secondary">
        Close
      </button>
    </div>
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
