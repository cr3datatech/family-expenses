"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast, ToastProvider } from "@/components/Toast";
import { todayISO } from "@/lib/dates";
import { api, AnalyticsData, Expense, ExpenseCreate, ReceiptScanResult, User } from "@/lib/api";
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
  const [resetToken, setResetToken] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("reset_token");
    if (token) {
      setResetToken(token);
      // Remove token from URL without reload
      const url = new URL(window.location.href);
      url.searchParams.delete("reset_token");
      window.history.replaceState({}, "", url.toString());
      setUser(null);
      return;
    }
    api.me().then(setUser).catch(() => setUser(null));
  }, []);

  if (resetToken) {
    return (
      <ResetPasswordForm
        token={resetToken}
        onLoggedIn={(u) => {
          setResetToken(null);
          setUser(u);
        }}
      />
    );
  }

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

function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await api.forgotPassword(email.trim());
      setDone(true);
    } catch {
      setErr("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 max-w-sm mx-auto pt-16">
      <h1 className="text-xl font-bold text-snap-800 mb-6 text-center">Receipts</h1>
      <div className="space-y-3 bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(34,197,94,0.08)]">
        {done ? (
          <>
            <p className="text-sm text-snap-700">If an account with that email exists, a reset link has been sent.</p>
            <button
              onClick={onBack}
              className="w-full py-2.5 rounded-xl bg-snap-500 text-white text-sm font-semibold"
            >
              Back to sign in
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <p className="text-sm text-skin-secondary">Enter your email address and we&apos;ll send you a reset link.</p>
            {err && <p className="text-sm text-red-600">{err}</p>}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              required
              className="form-input w-full"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-xl bg-snap-500 text-white text-sm font-semibold disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send reset link"}
            </button>
            <button
              type="button"
              onClick={onBack}
              className="w-full py-2 text-sm text-skin-secondary hover:text-snap-700"
            >
              Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function ResetPasswordForm({ token, onLoggedIn }: { token: string; onLoggedIn: (u: User) => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (password !== confirm) {
      setErr("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const result = await api.resetPassword(token, password);
      // Auto-login with new password
      const loginResult = await api.login(result.username, password);
      onLoggedIn(loginResult.user);
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message.replace(/^\d+:\s*/, "") : "Failed to reset password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 max-w-sm mx-auto pt-16">
      <h1 className="text-xl font-bold text-snap-800 mb-6 text-center">Receipts</h1>
      <div className="space-y-3 bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(34,197,94,0.08)]">
        <form onSubmit={handleSubmit} className="space-y-3">
          <p className="text-sm font-medium text-snap-800">Set new password</p>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            required
            minLength={6}
            className="form-input w-full"
          />
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm new password"
            required
            minLength={6}
            className="form-input w-full"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 rounded-xl bg-snap-500 text-white text-sm font-semibold disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Set new password"}
          </button>
        </form>
      </div>
    </div>
  );
}

function LoginForm({ onLoggedIn }: { onLoggedIn: (u: User) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  if (showForgot) {
    return <ForgotPasswordForm onBack={() => setShowForgot(false)} />;
  }

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
      <h1 className="text-xl font-bold text-snap-800 mb-6 text-center">Receipts</h1>
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
        <button
          type="button"
          onClick={() => setShowForgot(true)}
          className="w-full py-1 text-xs text-skin-secondary hover:text-snap-700"
        >
          Forgot password?
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
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Expense[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);

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

  const handleDelete = async (id: number, deleteArchive = false) => {
    try {
      await api.delete(id, deleteArchive);
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
    <>
      {showAnalytics && <AnalyticsPanel onClose={() => setShowAnalytics(false)} cards={cards} currentUser={user} allUsers={allUsers} />}
      <div className="p-4 space-y-3">
      <div className="sticky top-0 z-40 bg-snap-50/90 backdrop-blur-sm py-3 -mx-4 px-4 -mt-4 mb-2 flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-snap-800">Receipts</h1>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-skin-secondary truncate max-w-[100px]" title={user.username}>
            {user.username}
          </span>
          <button
            type="button"
            onClick={() => { setSearchQuery(""); setSearchResults([]); setShowSearch(true); }}
            className="text-[11px] font-semibold text-snap-600 px-2 py-1 rounded-lg bg-white border border-snap-200"
          >
            Search
          </button>
          <button
            type="button"
            onClick={() => setShowAnalytics(true)}
            className="text-[11px] font-semibold text-snap-600 px-2 py-1 rounded-lg bg-white border border-snap-200"
          >
            Charts
          </button>
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
          <PhotoCapture onCapture={handlePhoto} />
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
              <div key={exp.id}>
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={`Edit expense: ${exp.merchant || exp.category}`}
                  onClick={() => { if (confirmDeleteId !== exp.id) setEditingExpense(exp); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (confirmDeleteId !== exp.id) setEditingExpense(exp);
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
                      {user.is_superuser && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteId(confirmDeleteId === exp.id ? null : exp.id);
                          }}
                          className="text-skin-secondary text-lg leading-none px-1 -mr-1 rounded-lg hover:bg-snap-100"
                          aria-label="Delete expense"
                        >
                          &times;
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                {user.is_superuser && confirmDeleteId === exp.id && (
                  <div className="mt-1 px-3 py-2.5 rounded-xl border border-red-200 bg-red-50 space-y-2 text-xs">
                    <p className="font-semibold text-red-700">Sure you want to delete this expense?</p>
                    {exp.receipt_photo_path && <p className="text-red-600">Also delete the archived receipt image?</p>}
                    <div className="flex gap-2 pt-0.5">
                      {exp.receipt_photo_path && (
                        <button type="button" onClick={() => { handleDelete(exp.id, true); setConfirmDeleteId(null); }}
                          className="flex-1 py-1.5 rounded-lg bg-red-600 text-white font-semibold">
                          Yes, delete both
                        </button>
                      )}
                      <button type="button" onClick={() => { handleDelete(exp.id, false); setConfirmDeleteId(null); }}
                        className="flex-1 py-1.5 rounded-lg bg-red-100 text-red-700 font-semibold">
                        {exp.receipt_photo_path ? "Expense only" : "Yes, delete"}
                      </button>
                      <button type="button" onClick={() => setConfirmDeleteId(null)}
                        className="flex-1 py-1.5 rounded-lg border border-snap-200 text-skin-secondary font-semibold">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
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
            onDelete={(deleteArchive) => { handleDelete(editingExpense.id, deleteArchive); setEditingExpense(null); }}
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

      {/* Search Modal */}
      <Modal open={showSearch} onClose={() => setShowSearch(false)} title="Search">
        <SearchModal
          query={searchQuery}
          results={searchResults}
          loading={searchLoading}
          onQueryChange={async (q) => {
            setSearchQuery(q);
            if (!q.trim()) { setSearchResults([]); return; }
            setSearchLoading(true);
            try {
              setSearchResults(await api.search(q));
            } catch { setSearchResults([]); }
            finally { setSearchLoading(false); }
          }}
          onSelect={(exp) => { setShowSearch(false); setEditingExpense(exp); }}
        />
      </Modal>
    </div>
    </>
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
  const [date, setDate] = useState(scanResult.date || today);
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
        date: date || today,
        merchant: merchant || undefined,
        items: scanResult.items || undefined,
        total: parseFloat(total),
        currency: "EUR",
        category,
        card,
        note: note || undefined,
        receipt_photo_path: scanResult.receipt_path || undefined,
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
      <FormField label="Date">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="form-input" />
      </FormField>
      <FormField label="Shop / Merchant">
        <input type="text" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Shop name" className="form-input" />
      </FormField>
      <FormField label="Total">
        <input type="number" step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="Amount" required className="form-input" />
      </FormField>
      <FormField label="Category">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="form-input">
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
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


const CATEGORIES = [
  "Groceries", "Eating Out", "Transport", "Entertainment", "Health",
  "Utilities", "Shopping", "Subscriptions", "Travel", "Coffee",
  "Household", "Rent", "Car", "Investments", "Insurance", "Gifts", "Education", "Other",
];

interface ManualItem {
  name: string;
  qty: string;
  unit_price: string;
  amount: string;
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
  const [date, setDate] = useState(today);
  const [merchant, setMerchant] = useState("");
  const [category, setCategory] = useState("Other");
  const [items, setItems] = useState<ManualItem[]>([]);
  const [total, setTotal] = useState("");
  const [card, setCard] = useState(cards[0]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [attributedUserId, setAttributedUserId] = useState(currentUser.id);

  const handleMerchantBlur = async () => {
    if (!merchant) return;
    try {
      const result = await api.categorize(merchant);
      setCategory(result.category);
    } catch { /* keep current */ }
  };

  const recalcTotal = (updated: ManualItem[]) => {
    const sum = updated.reduce((acc, it) => acc + (parseFloat(it.amount) || 0), 0);
    if (sum > 0) setTotal(sum.toFixed(2));
  };

  const updateItem = (idx: number, field: keyof ManualItem, value: string) => {
    const updated = items.map((item, i) => {
      if (i !== idx) return item;
      const next = { ...item, [field]: value };
      if (field === "qty" || field === "unit_price") {
        const qty = parseFloat(field === "qty" ? value : next.qty) || 1;
        const up = parseFloat(field === "unit_price" ? value : next.unit_price);
        if (!isNaN(up)) next.amount = (qty * up).toFixed(2);
      }
      return next;
    });
    setItems(updated);
    recalcTotal(updated);
  };

  const addItem = () => setItems([...items, { name: "", qty: "1", unit_price: "", amount: "" }]);

  const removeItem = (idx: number) => {
    const updated = items.filter((_, i) => i !== idx);
    setItems(updated);
    recalcTotal(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!total || parseFloat(total) <= 0) return;
    setSaving(true);
    try {
      const validItems = items
        .filter((it) => it.name && it.amount)
        .map((it) => ({
          name: it.name,
          qty: parseInt(it.qty) || 1,
          unit_price: parseFloat(it.unit_price) || undefined,
          amount: parseFloat(it.amount),
        }));
      const payload: ExpenseCreate = {
        date,
        merchant: merchant || undefined,
        items: validItems.length > 0 ? validItems : undefined,
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
      <FormField label="Date">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="form-input" />
      </FormField>
      <FormField label="Shop / Merchant">
        <input type="text" value={merchant} onChange={(e) => setMerchant(e.target.value)} onBlur={handleMerchantBlur} placeholder="Shop name" className="form-input" />
      </FormField>
      <FormField label="Category">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="form-input">
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </FormField>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] font-bold text-skin-secondary uppercase tracking-wide">Items (optional)</label>
          <button type="button" onClick={addItem} className="text-[11px] font-semibold text-snap-600 active:text-snap-800">+ Add item</button>
        </div>
        {items.length > 0 && (
          <div className="space-y-1.5">
            {items.map((item, i) => (
              <div key={i} className="flex gap-1.5 items-center">
                <input type="text" value={item.name} onChange={(e) => updateItem(i, "name", e.target.value)} placeholder="Item name" className="form-input flex-1 min-w-0" />
                <input type="number" value={item.qty} onChange={(e) => updateItem(i, "qty", e.target.value)} placeholder="1" min="1" className="form-input !w-16 text-center shrink-0" />
                <input type="number" step="0.01" value={item.unit_price} onChange={(e) => updateItem(i, "unit_price", e.target.value)} placeholder="€" className="form-input !w-20 text-right shrink-0" />
                <button type="button" onClick={() => removeItem(i)} className="text-skin-secondary active:text-red-500 text-lg leading-none px-1">×</button>
              </div>
            ))}
          </div>
        )}
      </div>
      <FormField label="Total">
        <input type="number" step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="Amount (EUR)" required className="form-input" />
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
          <select value={attributedUserId} onChange={(e) => setAttributedUserId(Number(e.target.value))} className="form-input">
            {allUsers.map((u) => (
              <option key={u.id} value={u.id}>{u.username}{u.is_superuser ? " (admin)" : ""}</option>
            ))}
          </select>
        </FormField>
      )}
      <button type="submit" disabled={saving || !total} className="w-full py-2.5 rounded-xl bg-snap-500 text-white text-sm font-semibold active:bg-snap-600 transition-colors disabled:opacity-50">
        {saving ? "Saving..." : "Save Expense"}
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
              <div
                key={exp.id}
                role="button"
                tabIndex={0}
                aria-label={`Edit expense: ${exp.merchant || exp.category}`}
                onClick={() => onEdit(exp)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onEdit(exp);
                  }
                }}
                className="bg-snap-50/50 rounded-xl p-3 flex items-center gap-2 cursor-pointer text-left w-full active:bg-snap-100/80 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-snap-800 truncate">{exp.merchant || exp.category}</p>
                  <div className="flex gap-2 mt-0.5 flex-wrap">
                    <span className="text-[10px] text-skin-secondary capitalize">{exp.category}</span>
                    <span className="text-[10px] text-skin-secondary">{exp.date}</span>
                    <span className="text-[10px] text-snap-500">{exp.attributed_username}</span>
                  </div>
                </div>
                <span className="text-sm font-bold text-snap-600 whitespace-nowrap">{exp.total.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}


function EditExpenseForm({
  cards, expense, onSubmit, onCancel, onDelete, currentUser, allUsers,
}: {
  cards: string[];
  expense: Expense;
  onSubmit: (data: ExpenseCreate & { user_id?: number }) => void;
  onCancel: () => void;
  onDelete: (deleteArchive: boolean) => void;
  currentUser: User;
  allUsers: User[];
}) {
  const [date, setDate] = useState(expense.date);
  const [merchant, setMerchant] = useState(expense.merchant || "");
  const [total, setTotal] = useState(expense.total.toString());
  const [category, setCategory] = useState(expense.category || "Other");
  const [card, setCard] = useState(expense.card || cards[0]);
  const [note, setNote] = useState(expense.note || "");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [attributedUserId, setAttributedUserId] = useState(expense.user_id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!total || parseFloat(total) <= 0) return;
    setSaving(true);
    try {
      const payload: ExpenseCreate & { user_id?: number } = {
        date,
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
      {expense.receipt_photo_path && (
        <a
          href={`/${expense.receipt_photo_path}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-snap-50 border border-snap-200 text-xs text-snap-700 font-medium hover:bg-snap-100 transition-colors"
        >
          <span className="text-base leading-none">🧾</span>
          <span className="truncate">{expense.receipt_photo_path.split("/").pop()}</span>
        </a>
      )}
      <FormField label="Date">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="form-input" />
      </FormField>
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
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="form-input">
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
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

      {currentUser.is_superuser && !confirmDelete ? (
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="w-full py-2 rounded-xl text-xs font-semibold text-red-500 hover:bg-red-50 transition-colors"
        >
          Delete expense
        </button>
      ) : currentUser.is_superuser ? (
        <div className="px-3 py-2.5 rounded-xl border border-red-200 bg-red-50 space-y-2 text-xs">
          <p className="font-semibold text-red-700">Sure you want to delete this expense?</p>
          {expense.receipt_photo_path && (
            <p className="text-red-600">Also delete the archived receipt image?</p>
          )}
          <div className="flex gap-2 pt-0.5">
            {expense.receipt_photo_path && (
              <button
                type="button"
                onClick={() => onDelete(true)}
                className="flex-1 py-1.5 rounded-lg bg-red-600 text-white font-semibold"
              >
                Yes, delete both
              </button>
            )}
            <button
              type="button"
              onClick={() => onDelete(false)}
              className="flex-1 py-1.5 rounded-lg bg-red-100 text-red-700 font-semibold"
            >
              {expense.receipt_photo_path ? "Expense only" : "Yes, delete"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="flex-1 py-1.5 rounded-lg border border-snap-200 text-skin-secondary font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
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
  const [newEmail, setNewEmail] = useState("");
  const [newSuper, setNewSuper] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pwEdit, setPwEdit] = useState<Record<number, string>>({});
  const [emailEdit, setEmailEdit] = useState<Record<number, string>>({});
  const [showNewPw, setShowNewPw] = useState(false);
  const [showPwEdit, setShowPwEdit] = useState<Record<number, boolean>>({});

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword || !newEmail.trim()) return;
    setBusy(true);
    try {
      await api.createUser({
        username: newUsername.trim(),
        password: newPassword,
        is_superuser: newSuper,
        email: newEmail.trim(),
      });
      setNewUsername("");
      setNewPassword("");
      setNewEmail("");
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

  const setEmail = async (id: number) => {
    const email = emailEdit[id] ?? "";
    setBusy(true);
    try {
      await api.updateUser(id, { email: email.trim() });
      setEmailEdit((p) => ({ ...p, [id]: "" }));
      onRefresh();
    } catch {
      alert("Could not update email");
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
          autoComplete="off"
          value={newUsername}
          onChange={(e) => setNewUsername(e.target.value)}
        />
        <div className="relative">
          <input
            className="form-input w-full pr-8"
            type={showNewPw ? "text" : "password"}
            placeholder="Password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowNewPw((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-snap-400 hover:text-snap-600"
            tabIndex={-1}
          >
            {showNewPw ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            )}
          </button>
        </div>
        <input
          className="form-input w-full"
          type="email"
          placeholder="Email"
          required
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
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
              <div>
                <span className="font-semibold text-snap-800">{u.username}</span>
                {u.email && <p className="text-[11px] text-skin-secondary">{u.email}</p>}
              </div>
              {u.is_superuser && (
                <span className="text-[10px] uppercase font-bold text-snap-600">admin</span>
              )}
            </div>
            <div className="flex gap-1">
              <input
                className="form-input flex-1 text-sm"
                type="email"
                placeholder={u.email ?? "Email"}
                value={emailEdit[u.id] ?? ""}
                onChange={(e) => setEmailEdit((p) => ({ ...p, [u.id]: e.target.value }))}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void setEmail(u.id)}
                className="px-2 py-1 text-xs font-semibold rounded-lg bg-snap-100 text-snap-700"
              >
                Set
              </button>
            </div>
            <div className="flex gap-1">
              <div className="relative flex-1">
                <input
                  className="form-input w-full text-sm pr-7"
                  type={showPwEdit[u.id] ? "text" : "password"}
                  placeholder="New password"
                  autoComplete="new-password"
                  value={pwEdit[u.id] ?? ""}
                  onChange={(e) => setPwEdit((p) => ({ ...p, [u.id]: e.target.value }))}
                />
                <button
                  type="button"
                  onClick={() => setShowPwEdit((p) => ({ ...p, [u.id]: !p[u.id] }))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-snap-400 hover:text-snap-600"
                  tabIndex={-1}
                >
                  {showPwEdit[u.id] ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>
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


function SearchModal({ query, results, loading, onQueryChange, onSelect }: {
  query: string;
  results: Expense[];
  loading: boolean;
  onQueryChange: (q: string) => void;
  onSelect: (exp: Expense) => void;
}) {
  return (
    <div className="space-y-3">
      <input
        type="search"
        autoFocus
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Search by merchant, category, date, note…"
        className="form-input w-full"
      />
      {loading && <p className="text-xs text-skin-secondary text-center py-2">Searching…</p>}
      {!loading && query.trim() && results.length === 0 && (
        <p className="text-xs text-skin-secondary text-center py-2">No results.</p>
      )}
      {results.length > 0 && (
        <div className="max-h-[60vh] overflow-y-auto -mx-1 px-1 space-y-1">
          {results.map((exp) => (
            <button
              key={exp.id}
              type="button"
              onClick={() => onSelect(exp)}
              className="w-full text-left px-3 py-2.5 rounded-xl bg-snap-50 active:bg-snap-100 transition-colors"
            >
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-snap-800 truncate">{exp.merchant || exp.category}</p>
                  <p className="text-[10px] text-skin-secondary">{exp.date} · {exp.category}</p>
                  {exp.note && <p className="text-[11px] text-skin-secondary truncate">{exp.note}</p>}
                </div>
                <span className="text-sm font-bold text-snap-600 whitespace-nowrap shrink-0">
                  {exp.total.toFixed(2)} {exp.currency}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
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


const ANALYTICS_PRESETS = [
  { key: "month", label: "Month" },
  { key: "3m", label: "3 months" },
  { key: "year", label: "Year" },
  { key: "all", label: "All time" },
];

function getAnalyticsRange(preset: string): { from?: string; to?: string } {
  const today = todayISO();
  const d = new Date();
  if (preset === "month") {
    return { from: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`, to: today };
  }
  if (preset === "3m") {
    const from = new Date(d);
    from.setMonth(from.getMonth() - 2);
    from.setDate(1);
    return { from: from.toISOString().split("T")[0], to: today };
  }
  if (preset === "year") {
    return { from: `${d.getFullYear()}-01-01`, to: today };
  }
  return {};
}

function AnalyticsPanel({ onClose, cards, currentUser, allUsers }: {
  onClose: () => void;
  cards: string[];
  currentUser: User;
  allUsers: User[];
}) {
  const [preset, setPreset] = useState("month");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [itemFilter, setItemFilter] = useState("");
  const [drillCategory, setDrillCategory] = useState<string | null>(null);
  const [drillExpenses, setDrillExpenses] = useState<Expense[] | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  useEffect(() => {
    const { from, to } = getAnalyticsRange(preset);
    setLoading(true);
    setData(null);
    api.analytics(from, to)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [preset]);

  const openDrill = (category: string) => {
    const { from, to } = getAnalyticsRange(preset);
    setDrillCategory(category);
    setDrillExpenses(null);
    setDrillLoading(true);
    api.listByCategory(category, from, to)
      .then(setDrillExpenses)
      .catch(() => {})
      .finally(() => setDrillLoading(false));
  };

  const refreshDrill = () => {
    if (!drillCategory) return;
    const { from, to } = getAnalyticsRange(preset);
    setDrillLoading(true);
    api.listByCategory(drillCategory, from, to)
      .then(setDrillExpenses)
      .catch(() => {})
      .finally(() => setDrillLoading(false));
  };

  const handleEditSave = async (data: ExpenseCreate) => {
    if (!editingExpense) return;
    await api.update(editingExpense.id, data);
    setEditingExpense(null);
    refreshDrill();
  };

  const handleDelete = async (id: number, deleteArchive = false) => {
    await api.delete(id, deleteArchive);
    setEditingExpense(null);
    refreshDrill();
  };

  const filteredItems = (data?.top_items ?? []).filter(
    (item) => !itemFilter.trim() || item.name.toLowerCase().includes(itemFilter.toLowerCase())
  );

  const maxCategory = data?.by_category[0]?.total ?? 1;
  const maxMerchant = data?.by_merchant[0]?.total ?? 1;

  return (
    <div className="fixed inset-0 z-50 bg-snap-50 overflow-y-auto">
      <div className="sticky top-0 z-10 bg-snap-50/90 backdrop-blur-sm border-b border-snap-100">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-semibold text-snap-600"
          >
            ← Back
          </button>
          <h1 className="text-base font-bold text-snap-800 flex-1">Analytics</h1>
        </div>
        <div className="max-w-md mx-auto px-4 pb-2 flex gap-2">
          {ANALYTICS_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPreset(p.key)}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                preset === p.key
                  ? "bg-snap-500 text-white border-snap-500"
                  : "bg-white text-snap-600 border-snap-200"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-4">
        {loading && (
          <p className="text-center text-sm text-skin-secondary py-8">Loading…</p>
        )}

        {!loading && data && (
          <>
            {/* Overview */}
            <div className="bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(34,197,94,0.08)]">
              <p className="text-[11px] font-bold text-skin-secondary uppercase tracking-wide mb-1">Total spend</p>
              <p className="text-2xl font-bold text-snap-800">{data.total.toFixed(2)} EUR</p>
              <p className="text-xs text-skin-secondary mt-0.5">
                {data.count} {data.count === 1 ? "expense" : "expenses"}
                {data.count > 0 && ` · avg ${(data.total / data.count).toFixed(2)} EUR`}
              </p>
            </div>

            {/* By Category */}
            {data.by_category.length > 0 && (
              <div className="bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(34,197,94,0.08)]">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[11px] font-bold text-skin-secondary uppercase tracking-wide">By category</p>
                  <span className="text-xs font-mono text-snap-800 font-semibold">{data.total.toFixed(2)}</span>
                </div>
                <div className="space-y-2">
                  {data.by_category.map((row) => (
                    <button
                      key={row.category}
                      type="button"
                      onClick={() => openDrill(row.category)}
                      className="w-full flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-snap-50 transition-colors"
                    >
                      <span className="w-28 text-xs text-skin-primary truncate shrink-0 text-left">{row.category} ({row.count})</span>
                      <div className="flex-1 bg-snap-100 rounded-full h-1.5">
                        <div
                          className="bg-snap-500 h-1.5 rounded-full"
                          style={{ width: `${(row.total / maxCategory) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-snap-800 w-16 text-right shrink-0">
                        {row.total.toFixed(2)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* By Merchant */}
            {data.by_merchant.length > 0 && (
              <div className="bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(34,197,94,0.08)]">
                <p className="text-[11px] font-bold text-skin-secondary uppercase tracking-wide mb-3">Top merchants</p>
                <div className="space-y-2">
                  {data.by_merchant.map((row) => (
                    <div key={row.merchant} className="flex items-center gap-2">
                      <span className="flex-1 text-xs text-skin-primary truncate">{row.merchant}</span>
                      <div className="w-20 bg-snap-100 rounded-full h-1.5 shrink-0">
                        <div
                          className="bg-snap-300 h-1.5 rounded-full"
                          style={{ width: `${(row.total / maxMerchant) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-snap-800 w-16 text-right shrink-0">
                        {row.total.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* By Month */}
            {data.by_month.length > 1 && (
              <div className="bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(34,197,94,0.08)]">
                <p className="text-[11px] font-bold text-skin-secondary uppercase tracking-wide mb-3">By month</p>
                <div className="space-y-1.5">
                  {data.by_month.map((row) => (
                    <div key={row.month} className="flex justify-between text-xs">
                      <span className="text-skin-secondary">{row.month}</span>
                      <span className="font-mono text-snap-800">{row.total.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}


            {/* Top Items */}
            {data.top_items.length > 0 && (
              <div className="bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(34,197,94,0.08)]">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-bold text-skin-secondary uppercase tracking-wide">Items</p>
                  <span className="text-sm font-bold text-snap-800">
                    {filteredItems.reduce((s, i) => s + i.total_amount, 0).toFixed(2)}
                  </span>
                </div>
                <input
                  type="search"
                  value={itemFilter}
                  onChange={(e) => setItemFilter(e.target.value)}
                  placeholder="Filter items…"
                  className="form-input text-sm mb-3"
                />
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {filteredItems.map((item) => (
                    <div key={item.name} className="flex items-center gap-2 text-xs">
                      <span className="flex-1 text-skin-primary truncate">{item.name}</span>
                      <span className="text-skin-secondary shrink-0">×{item.total_qty}</span>
                      {item.avg_unit_price != null && (
                        <span className="text-skin-secondary shrink-0">{item.avg_unit_price.toFixed(2)}</span>
                      )}
                      <span className="font-mono text-snap-800 w-14 text-right shrink-0">
                        {item.total_amount.toFixed(2)}
                      </span>
                    </div>
                  ))}
                  {filteredItems.length === 0 && itemFilter.trim() && (
                    <p className="text-xs text-skin-secondary text-center py-2">No items match.</p>
                  )}
                </div>
              </div>
            )}

            {data.count === 0 && (
              <p className="text-center text-sm text-skin-secondary py-4">No expenses in this period.</p>
            )}
          </>
        )}
      </div>

      {/* Category drill-down overlay */}
      {drillCategory && (
        <div className="fixed inset-0 z-60 bg-snap-50 overflow-y-auto">
          {/* Edit expense modal (from drill-down) */}
          <Modal open={!!editingExpense} onClose={() => setEditingExpense(null)} title="Edit Expense">
            {editingExpense && (
              <EditExpenseForm
                cards={cards}
                expense={editingExpense}
                onSubmit={handleEditSave}
                onCancel={() => setEditingExpense(null)}
                onDelete={(deleteArchive) => handleDelete(editingExpense.id, deleteArchive)}
                currentUser={currentUser}
                allUsers={allUsers}
              />
            )}
          </Modal>

          <div className="sticky top-0 z-10 bg-snap-50/90 backdrop-blur-sm border-b border-snap-100">
            <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => { setDrillCategory(null); setDrillExpenses(null); }}
                className="text-sm font-semibold text-snap-600"
              >
                ← Back
              </button>
              <h2 className="text-base font-bold text-snap-800 flex-1">{drillCategory}</h2>
              {drillExpenses && (
                <span className="text-xs text-skin-secondary">
                  {drillExpenses.length} {drillExpenses.length === 1 ? "expense" : "expenses"}
                </span>
              )}
            </div>
          </div>
          <div className="max-w-md mx-auto p-4 space-y-2">
            {drillLoading && (
              <p className="text-center text-sm text-skin-secondary py-8">Loading…</p>
            )}
            {!drillLoading && drillExpenses && drillExpenses.length === 0 && (
              <p className="text-center text-sm text-skin-secondary py-8">No expenses found.</p>
            )}
            {!drillLoading && drillExpenses && drillExpenses.map((exp) => (
              <button
                key={exp.id}
                type="button"
                onClick={() => setEditingExpense(exp)}
                className="w-full text-left bg-white rounded-[14px] px-4 py-3 shadow-[0_1px_4px_rgba(34,197,94,0.08)] hover:bg-snap-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-snap-800 truncate">{exp.merchant || exp.category}</p>
                    <p className="text-xs text-skin-secondary mt-0.5">{exp.date}{exp.card ? ` · ${exp.card}` : ""}</p>
                    {exp.note && <p className="text-xs text-skin-secondary mt-0.5 italic">{exp.note}</p>}
                  </div>
                  <span className="text-sm font-mono font-bold text-snap-800 shrink-0">{exp.total.toFixed(2)}</span>
                </div>
                {exp.items.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {exp.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-xs text-skin-secondary">
                        <span className="truncate">{item.qty && item.qty !== 1 ? `${item.qty}× ` : ""}{item.name}</span>
                        <span className="font-mono shrink-0 ml-2">{item.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
