"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast, ToastProvider } from "@/components/Toast";
import { todayISO } from "@/lib/dates";
import { api, AiCostsData, AnalyticsData, Expense, ExpenseCreate, ReceiptScanResult, ScannedImage, User } from "@/lib/api";
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
    <div className="p-4 max-w-lg mx-auto pt-16">
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
    <div className="p-4 max-w-lg mx-auto pt-16">
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
    <div className="p-4 max-w-lg mx-auto pt-16">
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

function HeaderMenu({
  username,
  isSuperuser,
  onSearch,
  onCharts,
  onPersonal,
  onAllExpenses,
  onScanned,
  onAiCosts,
  onUsers,
  onLogout,
}: {
  username: string;
  isSuperuser: boolean;
  onSearch: () => void;
  onCharts: () => void;
  onPersonal: () => void;
  onAllExpenses: () => void;
  onScanned: () => void;
  onAiCosts: () => void;
  onUsers: () => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const item = (label: string, onClick: () => void, danger = false) => (
    <button
      type="button"
      onClick={() => { setOpen(false); onClick(); }}
      className={`w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-snap-50 transition-colors ${danger ? "text-red-500" : "text-snap-800"}`}
    >
      {label}
    </button>
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white border border-snap-200 text-snap-700 hover:bg-snap-50 transition-colors"
        aria-label="Menu"
      >
        <span className="text-[11px] font-semibold truncate max-w-[80px]">{username}</span>
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-snap-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-44 bg-white rounded-2xl shadow-lg border border-snap-100 overflow-hidden z-50">
          {item("Search", onSearch)}
          {item("Charts", onCharts)}
          {item("Personal", onPersonal)}
          {item("All Expenses", onAllExpenses)}
          {item("Scanned", onScanned)}
          {item("AI Costs", onAiCosts)}
          {isSuperuser && item("Users", onUsers)}
          <div className="border-t border-snap-100" />
          {item("Log out", onLogout, true)}
        </div>
      )}
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
  const [summary, setSummary] = useState<{ total: number; count: number; by_category: Record<string, number> } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [showAllExpenses, setShowAllExpenses] = useState(false);
  const [showScanned, setShowScanned] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  /** `null` = idle; otherwise current step message for receipt scan */
  const [scanPhase, setScanPhase] = useState<string | null>(null);
  const [scanStepIndex, setScanStepIndex] = useState(0);
  const scanning = scanPhase !== null;
  const [scanResult, setScanResult] = useState<ReceiptScanResult | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showPersonal, setShowPersonal] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [expenseView, setExpenseView] = useState<"all" | "shared" | "personal">("all");
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Expense[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [copyExpensePrefill, setCopyExpensePrefill] = useState<Expense | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showAiCosts, setShowAiCosts] = useState(false);
  const [preset, setPreset] = useState("month");
  const [scanModel, setScanModel] = useState("AI");

  const refreshUsers = useCallback(() => {
    if (!user.is_superuser) return;
    api.usersList().then(setAllUsers).catch(() => {});
  }, [user.is_superuser]);

  useEffect(() => {
    refreshUsers();
  }, [refreshUsers]);

  const loadExpenses = useCallback(async () => {
    const now = new Date();
    const isShared = expenseView === "shared" ? true : expenseView === "personal" ? false : undefined;
    const attributedTo = expenseView === "personal" ? user.id : undefined;
    const { from, to } = getAnalyticsRange(preset);
    const exp = await api.list(undefined, undefined, isShared, attributedTo, from, to);
    setExpenses(exp);
    // compute summary from fetched expenses
    const by_category: Record<string, number> = {};
    let total = 0;
    for (const e of exp) {
      total += e.total;
      by_category[e.category] = (by_category[e.category] ?? 0) + e.total;
    }
    setSummary({ total, count: exp.length, by_category });
  }, [expenseView, user.id, preset]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  useEffect(() => {
    api.cards().then(setCards).catch(() => {});
    api.config().then(c => setScanModel(c.scan_model)).catch(() => {});
  }, []);

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
      setStep(2, `Reading receipt with AI (${scanModel})…`);
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
          `Could not read receipt (merchant: ${m}, total: ${t}). Try a clearer photo or enter manually.`,
          "error"
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
      toast(msg, "error");
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
    setCopyExpensePrefill(null);
    try {
      await api.create(data);
      toast("Expense logged");
      loadExpenses();
    } catch {
      toast("Failed to save expense");
    }
  };


  const handleEditSave = async (data: ExpenseCreate) => {
    if (!editingExpense) return;
    try {
      await api.update(editingExpense.id, data);
      toast("Expense updated");
      setEditingExpense(null);
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
      {showPersonal && <PersonalPanel onClose={() => setShowPersonal(false)} cards={cards} currentUser={user} allUsers={allUsers} />}
      {showAllExpenses && <AllExpensesPanel onClose={() => setShowAllExpenses(false)} cards={cards} currentUser={user} allUsers={allUsers} />}
      {showScanned && <ScannedPanel onClose={() => setShowScanned(false)} cards={cards} currentUser={user} allUsers={allUsers} />}
      {showAiCosts && <AiCostsPanel onClose={() => setShowAiCosts(false)} cards={cards} currentUser={user} allUsers={allUsers} />}
      <div className="p-4 space-y-3 max-w-lg mx-auto">
      <div className="sticky top-0 z-40 bg-snap-50/90 backdrop-blur-sm -mx-4 px-4 -mt-4 mb-2">
        <div className="py-3 flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-snap-800">Receipts</h1>
        <HeaderMenu
          username={user.username}
          isSuperuser={user.is_superuser}
          onSearch={() => { setSearchQuery(""); setSearchResults([]); setShowSearch(true); }}
          onCharts={() => setShowAnalytics(true)}
          onPersonal={() => setShowPersonal(true)}
          onAllExpenses={() => setShowAllExpenses(true)}
          onScanned={() => setShowScanned(true)}
          onAiCosts={() => setShowAiCosts(true)}
          onUsers={() => { refreshUsers(); setShowAdmin(true); }}
          onLogout={() => void onLogout()}
        />
        </div>
        <div className="flex gap-2 pb-2 overflow-x-auto">
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

      {/* Total */}
      <div className="bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(34,197,94,0.08)]">
        <p className="text-[11px] font-bold text-skin-secondary uppercase tracking-wide mb-1">
          {ANALYTICS_PRESETS.find(p => p.key === preset)?.label ?? "Total"}
        </p>
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
          <p className="text-sm text-skin-secondary">No expenses in this period.</p>
        )}
      </div>

      {/* Recent Expenses */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-bold text-skin-secondary uppercase tracking-wide">Recent Expenses</p>
          <div className="flex gap-1">
            {(["all", "shared", "personal"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setExpenseView(v)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors ${
                  expenseView === v
                    ? "bg-snap-500 text-white border-snap-500"
                    : "bg-white text-snap-600 border-snap-200"
                }`}
              >
                {v === "all" ? "All" : v === "shared" ? "Shared" : "Mine"}
              </button>
            ))}
          </div>
        </div>
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
                      <p className="text-sm font-semibold text-snap-800 truncate flex items-center gap-1">
                        <span className="truncate">{exp.merchant || exp.category}</span>
                        {exp.receipt_paths.length > 0 && (
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 shrink-0 text-snap-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                          </svg>
                        )}
                      </p>
                      <div className="flex gap-2 mt-0.5 flex-wrap">
                        <span className="text-[10px] text-skin-secondary capitalize">{exp.category}</span>
                        <span className="text-[10px] text-skin-secondary">{exp.card}</span>
                        {exp.is_shared
                          ? <span className="text-[10px] text-snap-400">Shared</span>
                          : <span className="text-[10px] font-semibold text-snap-600">{exp.attributed_username}</span>
                        }
                      </div>
                      {exp.note && <p className="text-[11px] text-skin-secondary mt-0.5 truncate">{exp.note}</p>}
                      <p className="text-[10px] text-skin-secondary mt-0.5">{exp.date}</p>
                      {exp.ai_cost != null && <p className="text-[10px] text-skin-secondary">AI cost: ${exp.ai_cost.toFixed(4)}</p>}
                    </div>
                    <div className="flex flex-col items-end justify-between self-stretch ml-2">
                      <div className="flex items-center gap-2">
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
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCopyExpensePrefill(exp);
                          setShowAdd(true);
                        }}
                        className="w-6 h-6 rounded-full bg-snap-100 text-snap-500 flex items-center justify-center hover:bg-snap-200 transition-colors"
                        aria-label="Copy expense"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                          <path d="M4 2a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1h1a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-1H2a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h2zm0 1H2a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h2V4a2 2 0 0 1 2-2V3zm2-1a1 1 0 0 0-1 1v10h7V3a1 1 0 0 0-1-1H6z"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
                {user.is_superuser && confirmDeleteId === exp.id && (
                  <div className="mt-1 px-3 py-2.5 rounded-xl border border-red-200 bg-red-50 space-y-2 text-xs">
                    <p className="font-semibold text-red-700">Sure you want to delete this expense?</p>
                    <div className="flex gap-2 pt-0.5">
                      <button type="button" onClick={() => { handleDelete(exp.id, false); setConfirmDeleteId(null); }}
                        className="flex-1 py-1.5 rounded-lg bg-red-600 text-white font-semibold">
                        Yes, delete
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
      <Modal open={showReview} onClose={() => {
        if (scanResult?.receipt_path?.startsWith("receipts/tmp/")) {
          api.deleteTmpFile(scanResult.receipt_path.split("/").pop()!).catch(() => {});
        }
        setShowReview(false); setScanResult(null);
      }} title="Review Receipt">
        {scanResult && (
          <ReceiptReviewForm
            cards={cards}
            scanResult={scanResult}
            onSubmit={handleSaveFromReview}
            onCancel={() => {
              if (scanResult?.receipt_path?.startsWith("receipts/tmp/")) {
                api.deleteTmpFile(scanResult.receipt_path.split("/").pop()!).catch(() => {});
              }
              setShowReview(false); setScanResult(null);
            }}
            currentUser={user}
            allUsers={allUsers}
          />
        )}
      </Modal>

      {/* Manual Entry Modal */}
      <Modal open={showAdd} onClose={() => { setShowAdd(false); setCopyExpensePrefill(null); }} title="Add Expense">
        <ManualEntryForm key={copyExpensePrefill?.id ?? "new"} cards={cards} onSubmit={handleSaveManual} currentUser={user} allUsers={allUsers} prefill={copyExpensePrefill ?? undefined} />
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editingExpense} onClose={() => setEditingExpense(null)} title="Edit Expense">
        {editingExpense && (
          <EditExpenseForm
            cards={cards}
            expense={editingExpense}
            onSubmit={handleEditSave}
            onCancel={() => setEditingExpense(null)}
            onDelete={() => { handleDelete(editingExpense.id, false); setEditingExpense(null); }}
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
  const [total, setTotal] = useState(scanResult.total != null ? Math.abs(scanResult.total).toString() : "");
  const [category, setCategory] = useState(scanResult.category || "Other");
  const [card, setCard] = useState(cards[0]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [isShared, setIsShared] = useState(true);
  const [attributedUserId, setAttributedUserId] = useState(currentUser.id);
  const [sharedWith, setSharedWith] = useState<number[]>(() => {
    const ids = allUsers.filter(u => ["christa", "craig"].includes(u.username.toLowerCase())).map(u => u.id);
    return ids.length > 0 ? ids : allUsers.map(u => u.id);
  });

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
        ai_extracted: true,
        ai_cost: scanResult.ai_cost ?? undefined,
        is_shared: isShared,
        shared_with: isShared ? sharedWith : undefined,
      };
      if (!isShared && currentUser.is_superuser) {
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
        <input type="number" step="0.01" value={total} onChange={(e) => { const v = parseFloat(e.target.value); setTotal(isNaN(v) ? e.target.value : Math.abs(v).toString()); }} placeholder="Amount" required className="form-input" />
      </FormField>
      <FormField label="Category">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="form-input">
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </FormField>
      <FormField label="Payment Type">
        <select value={card} onChange={(e) => setCard(e.target.value)} className="form-input">
          {cards.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </FormField>
      <FormField label="Note (optional)">
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note..." className="form-input" />
      </FormField>
      <AttributionPicker
        currentUser={currentUser}
        allUsers={allUsers}
        isShared={isShared}
        attributedUserId={attributedUserId}
        sharedWith={sharedWith}
        onChange={(shared, uid, sw) => { setIsShared(shared); setAttributedUserId(uid); setSharedWith(sw); }}
      />
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
  "Household", "Rent", "Car", "Investments", "Insurance", "Gifts", "Education", "Loan", "Other",
];

interface ManualItem {
  name: string;
  qty: string;
  unit_price: string;
  amount: string;
}

function ManualEntryForm({
  cards, onSubmit, currentUser, allUsers, prefill,
}: {
  cards: string[];
  onSubmit: (data: ExpenseCreate) => void;
  currentUser: User;
  allUsers: User[];
  prefill?: Expense;
}) {
  const today = todayISO();
  const [date, setDate] = useState(prefill?.date ?? today);
  const [merchant, setMerchant] = useState(prefill?.merchant ?? "");
  const [category, setCategory] = useState(prefill?.category ?? "Other");
  const [items, setItems] = useState<ManualItem[]>(
    prefill?.items.map(i => ({
      name: i.name,
      qty: (i.qty ?? 1).toString(),
      unit_price: i.unit_price?.toString() ?? "",
      amount: i.amount.toString(),
    })) ?? []
  );
  const [total, setTotal] = useState(prefill ? prefill.total.toFixed(2) : "");
  const defaultCard = cards.includes("Payment") ? "Payment" : cards[0];
  const defaultSharedWith = (() => {
    const ids = allUsers
      .filter(u => ["christa", "craig"].includes(u.username.toLowerCase()))
      .map(u => u.id);
    return ids.length > 0 ? ids : allUsers.map(u => u.id);
  })();
  const [card, setCard] = useState(prefill?.card ?? defaultCard);
  const [note, setNote] = useState(prefill?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [isShared, setIsShared] = useState(prefill?.is_shared ?? true);
  const [attributedUserId, setAttributedUserId] = useState(prefill && !prefill.is_shared ? prefill.user_id : currentUser.id);
  const [sharedWith, setSharedWith] = useState<number[]>(prefill?.shared_with ?? defaultSharedWith);

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
        is_shared: isShared,
        shared_with: isShared ? sharedWith : undefined,
      };
      if (!isShared && currentUser.is_superuser) {
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
        <input type="number" step="0.01" value={total} onChange={(e) => { const v = parseFloat(e.target.value); setTotal(isNaN(v) ? e.target.value : Math.abs(v).toString()); }} placeholder="Amount (EUR)" required className="form-input" />
      </FormField>
      <FormField label="Payment Type">
        <select value={card} onChange={(e) => setCard(e.target.value)} className="form-input">
          {cards.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </FormField>
      <FormField label="Note (optional)">
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note..." className="form-input" />
      </FormField>
      <AttributionPicker
        currentUser={currentUser}
        allUsers={allUsers}
        isShared={isShared}
        attributedUserId={attributedUserId}
        sharedWith={sharedWith}
        onChange={(shared, uid, sw) => { setIsShared(shared); setAttributedUserId(uid); setSharedWith(sw); }}
      />
      <button type="submit" disabled={saving || !total} className="w-full py-2.5 rounded-xl bg-snap-500 text-white text-sm font-semibold active:bg-snap-600 transition-colors disabled:opacity-50">
        {saving ? "Saving..." : "Save Expense"}
      </button>
    </form>
  );
}




function EditExpenseForm({
  cards, expense, onSubmit, onCancel, onDelete, currentUser, allUsers,
}: {
  cards: string[];
  expense: Expense;
  onSubmit: (data: ExpenseCreate & { user_id?: number }) => void;
  onCancel: () => void;
  onDelete: () => void;
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
  const [isShared, setIsShared] = useState(expense.is_shared);
  const [attributedUserId, setAttributedUserId] = useState(expense.user_id);
  const [sharedWith, setSharedWith] = useState<number[]>(
    expense.shared_with?.length ? expense.shared_with : allUsers.map(u => u.id)
  );
  const [receiptPaths, setReceiptPaths] = useState<string[]>(expense.receipt_paths ?? []);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [scanning, setScanning] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);

  const handleScanCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setScanning(true);
    try {
      const updated = await api.scanAndAttach(expense.id, file);
      setReceiptPaths(updated.receipt_paths);
    } catch {
      // silently ignore — user can retry
    } finally {
      setScanning(false);
    }
  };

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
        receipt_paths: receiptPaths,
        is_shared: isShared,
        shared_with: isShared ? sharedWith : undefined,
      };
      if (!isShared && currentUser.is_superuser) {
        payload.user_id = attributedUserId;
      }
      onSubmit(payload);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {showImagePicker && (
        <ScannedImagePickerModal
          currentPaths={receiptPaths}
          onAdd={(path) => {
            const newPaths = [...receiptPaths, path];
            setReceiptPaths(newPaths);
            api.setExpenseImages(expense.id, newPaths).catch(() => {});
            setShowImagePicker(false);
          }}
          onClose={() => setShowImagePicker(false)}
        />
      )}
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] font-bold text-skin-secondary uppercase tracking-wide">Images</label>
          <div className="flex items-center gap-2">
            {/* Scan button: mobile only */}
            <button
              type="button"
              onClick={() => scanInputRef.current?.click()}
              disabled={scanning}
              className="sm:hidden text-[11px] font-semibold text-snap-600 active:text-snap-800 disabled:opacity-50"
            >
              {scanning ? "Saving…" : "📷 Scan"}
            </button>
            <button type="button" onClick={() => setShowImagePicker(true)} className="text-[11px] font-semibold text-snap-600 active:text-snap-800">+ Add</button>
          </div>
        </div>
        <input
          ref={scanInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleScanCapture}
          className="hidden"
        />
        {receiptPaths.length > 0 ? (
          <div className="grid grid-cols-3 gap-1.5">
            {receiptPaths.map(path => (
              <div key={path} className="relative rounded-lg overflow-hidden border border-snap-200">
                <a href={`/${path}`} target="_blank" rel="noopener noreferrer">
                  <img src={`/${path}`} alt={path.split("/").pop()} className="w-full h-20 object-cover" />
                </a>
                <button
                  type="button"
                  onClick={() => {
                    const newPaths = receiptPaths.filter(p => p !== path);
                    setReceiptPaths(newPaths);
                    api.setExpenseImages(expense.id, newPaths).catch(() => {});
                  }}
                  className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/50 text-white text-xs flex items-center justify-center leading-none hover:bg-black/70"
                  aria-label="Remove image"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-skin-secondary">No images attached.</p>
        )}
      </div>
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
        <input type="number" step="0.01" value={total} onChange={(e) => { const v = parseFloat(e.target.value); setTotal(isNaN(v) ? e.target.value : Math.abs(v).toString()); }} placeholder="Amount" required className="form-input" />
      </FormField>
      <FormField label="Category">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="form-input">
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </FormField>
      <FormField label="Payment Type">
        <select value={card} onChange={(e) => setCard(e.target.value)} className="form-input">
          {cards.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </FormField>
      <FormField label="Note (optional)">
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note..." className="form-input" />
      </FormField>
      <AttributionPicker
        currentUser={currentUser}
        allUsers={allUsers}
        isShared={isShared}
        attributedUserId={attributedUserId}
        sharedWith={sharedWith}
        onChange={(shared, uid, sw) => { setIsShared(shared); setAttributedUserId(uid); setSharedWith(sw); }}
      />
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
          {receiptPaths.length > 0 && (
            <p className="text-red-600">Images will be kept and can be found in Scanned.</p>
          )}
          <div className="flex gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => onDelete()}
              className="flex-1 py-1.5 rounded-lg bg-red-600 text-white font-semibold"
            >
              Yes, delete
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
    </>
  );
}


function AttributionPicker({
  currentUser,
  allUsers,
  isShared,
  attributedUserId,
  sharedWith,
  onChange,
}: {
  currentUser: User;
  allUsers: User[];
  isShared: boolean;
  attributedUserId: number;
  sharedWith: number[];
  onChange: (isShared: boolean, userId: number, sharedWith: number[]) => void;
}) {
  const personalOptions: { label: string; userId: number }[] = currentUser.is_superuser
    ? allUsers.map((u) => ({ label: u.username, userId: u.id }))
    : [{ label: "Mine", userId: currentUser.id }];

  const toggleSharedWith = (uid: number) => {
    const next = sharedWith.includes(uid) ? sharedWith.filter((id) => id !== uid) : [...sharedWith, uid];
    onChange(true, attributedUserId, next);
  };

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold text-skin-secondary uppercase tracking-wide">For</p>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onChange(true, attributedUserId, sharedWith.length ? sharedWith : allUsers.map(u => u.id))}
          className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
            isShared ? "bg-snap-500 text-white border-snap-500" : "bg-white text-snap-600 border-snap-200 hover:border-snap-400"
          }`}
        >
          Shared
        </button>
        {personalOptions.map((opt) => {
          const active = !isShared && attributedUserId === opt.userId;
          return (
            <button
              key={opt.userId}
              type="button"
              onClick={() => onChange(false, opt.userId, sharedWith)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                active ? "bg-snap-500 text-white border-snap-500" : "bg-white text-snap-600 border-snap-200 hover:border-snap-400"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {isShared && allUsers.length > 0 && (
        <div>
          <p className="text-[11px] font-bold text-skin-secondary uppercase tracking-wide mb-1.5">Shared among</p>
          <div className="flex flex-wrap gap-1.5">
            {allUsers.map((u) => {
              const active = sharedWith.includes(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggleSharedWith(u.id)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                    active ? "bg-snap-300 text-snap-900 border-snap-300" : "bg-white text-snap-400 border-snap-200 hover:border-snap-400"
                  }`}
                >
                  {u.username}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
  );
}

function CreateUserModal({ onCreated, onClose }: { onCreated: () => void; onClose: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [isSuper, setIsSuper] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password || !email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.createUser({ username: username.trim(), password, is_superuser: isSuper, email: email.trim() });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create user");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        className="form-input w-full"
        placeholder="Username"
        autoComplete="off"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        required
      />
      <input
        className="form-input w-full"
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <div className="relative">
        <input
          className="form-input w-full pr-9"
          type={showPw ? "text" : "password"}
          placeholder="Password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-snap-400 hover:text-snap-600" tabIndex={-1}>
          <EyeIcon open={showPw} />
        </button>
      </div>
      <label className="flex items-center gap-2 text-sm text-snap-700 cursor-pointer">
        <input type="checkbox" checked={isSuper} onChange={(e) => setIsSuper(e.target.checked)} />
        Superuser
      </label>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onClose} className="flex-1 py-2 rounded-xl border border-snap-200 text-sm text-snap-600 font-semibold">Cancel</button>
        <button type="submit" disabled={busy} className="flex-1 py-2 rounded-xl bg-snap-500 text-white text-sm font-semibold disabled:opacity-50">
          {busy ? "Creating…" : "Create user"}
        </button>
      </div>
    </form>
  );
}

function EditUserModal({ user, currentId, onSaved, onClose }: { user: User; currentId: number; onSaved: () => void; onClose: () => void }) {
  const [email, setEmail] = useState(user.email ?? "");
  const [password, setPassword] = useState("");
  const [isSuper, setIsSuper] = useState(user.is_superuser);
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const updates: { email?: string; password?: string; is_superuser?: boolean } = {
        email: email.trim() || undefined,
        is_superuser: isSuper,
      };
      if (password) updates.password = password;
      await api.updateUser(user.id, updates);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this user? They must have no attributed expenses.")) return;
    setBusy(true);
    try {
      await api.deleteUser(user.id);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete user");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-3">
      <div className="px-3 py-2 rounded-xl bg-snap-50 border border-snap-100">
        <p className="text-[11px] text-skin-secondary">Username</p>
        <p className="text-sm font-semibold text-snap-800">{user.username}</p>
      </div>
      <input
        className="form-input w-full"
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <div className="relative">
        <input
          className="form-input w-full pr-9"
          type={showPw ? "text" : "password"}
          placeholder="New password (leave blank to keep)"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-snap-400 hover:text-snap-600" tabIndex={-1}>
          <EyeIcon open={showPw} />
        </button>
      </div>
      <label className="flex items-center gap-2 text-sm text-snap-700 cursor-pointer">
        <input type="checkbox" checked={isSuper} onChange={(e) => setIsSuper(e.target.checked)} />
        Superuser
      </label>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onClose} className="flex-1 py-2 rounded-xl border border-snap-200 text-sm text-snap-600 font-semibold">Cancel</button>
        <button type="submit" disabled={busy} className="flex-1 py-2 rounded-xl bg-snap-500 text-white text-sm font-semibold disabled:opacity-50">
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      {user.id !== currentId && (
        <button type="button" disabled={busy} onClick={handleDelete} className="w-full py-1.5 text-xs text-red-600 font-semibold">
          Delete user
        </button>
      )}
    </form>
  );
}

function UserAdminPanel({
  users,
  currentId,
  onRefresh,
}: {
  users: User[];
  currentId: number;
  onRefresh: () => void;
}) {
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const handleSaved = () => {
    setEditingUser(null);
    setShowCreate(false);
    onRefresh();
  };

  return (
    <div className="space-y-3 max-h-[70vh] overflow-y-auto">
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New user">
        <CreateUserModal onCreated={handleSaved} onClose={() => setShowCreate(false)} />
      </Modal>
      <Modal open={!!editingUser} onClose={() => setEditingUser(null)} title="Edit user">
        {editingUser && (
          <EditUserModal user={editingUser} currentId={currentId} onSaved={handleSaved} onClose={() => setEditingUser(null)} />
        )}
      </Modal>

      <div className="space-y-1.5">
        {users.map((u) => (
          <button
            key={u.id}
            type="button"
            onClick={() => setEditingUser(u)}
            className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl border border-snap-100 hover:bg-snap-50 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-snap-800 truncate">{u.username}</p>
              {u.email && <p className="text-xs text-skin-secondary truncate">{u.email}</p>}
            </div>
            {u.is_superuser && (
              <span className="text-[10px] uppercase font-bold text-snap-500 shrink-0">admin</span>
            )}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setShowCreate(true)}
        className="w-full py-2 rounded-xl bg-snap-500 text-white text-sm font-semibold"
      >
        + New user
      </button>
    </div>
  );
}


function PersonalPanel({
  onClose,
  cards,
  currentUser,
  allUsers,
}: {
  onClose: () => void;
  cards: string[];
  currentUser: User;
  allUsers: User[];
}) {
  const [preset, setPreset] = useState("month");
  const [activePersonal, setActivePersonal] = useState<Set<number>>(new Set([currentUser.id]));
  const [showShared, setShowShared] = useState(false);

  // Default shared filter to Christa + Craig (or all users if not found)
  const defaultSharedFilter = (): Set<number> => {
    const named = allUsers.filter(u => ["christa", "craig"].includes(u.username.toLowerCase()));
    const ids = named.length > 0 ? named : allUsers;
    return new Set(ids.map(u => u.id));
  };
  const [sharedFilter, setSharedFilter] = useState<Set<number>>(defaultSharedFilter);

  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  const userById = Object.fromEntries(allUsers.map(u => [u.id, u]));
  const visibleUsers = currentUser.is_superuser ? allUsers : [currentUser];

  const effectiveAmount = (exp: Expense): number => {
    if (!exp.is_shared) return exp.total;
    const parts = exp.shared_with.length || allUsers.length || 1;
    return exp.total / parts;
  };

  const togglePersonal = (uid: number) => setActivePersonal(prev => {
    const next = new Set(prev);
    next.has(uid) ? next.delete(uid) : next.add(uid);
    return next;
  });

  const toggleSharedFilter = (uid: number) => setSharedFilter(prev => {
    const next = new Set(prev);
    next.has(uid) ? next.delete(uid) : next.add(uid);
    return next;
  });

  useEffect(() => {
    const { from, to } = getAnalyticsRange(preset);
    const calls: Promise<Expense[]>[] = [];
    activePersonal.forEach(uid => calls.push(api.listPersonalFor(uid, from, to)));
    if (showShared) calls.push(api.listAllShared(from, to));
    if (calls.length === 0) { setExpenses([]); return; }

    setLoading(true);
    Promise.all(calls)
      .then(results => {
        const seen = new Set<number>();
        const merged: Expense[] = [];
        for (const list of results)
          for (const e of list)
            if (!seen.has(e.id)) { seen.add(e.id); merged.push(e); }

        const filtered = merged.filter(e => {
          if (!e.is_shared) return true;
          if (sharedFilter.size === 0) return true;
          const sw = e.shared_with;
          if (!sw || sw.length === 0) return true;
          return [...sharedFilter].every(uid => sw.includes(uid));
        });
        filtered.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
        setExpenses(filtered);
      })
      .catch(() => setExpenses([]))
      .finally(() => setLoading(false));
  }, [preset, activePersonal, showShared, sharedFilter]);

  const refresh = () => setActivePersonal(prev => new Set(prev));

  const handleEditSave = async (data: ExpenseCreate) => {
    if (!editingExpense) return;
    await api.update(editingExpense.id, data);
    setEditingExpense(null);
    refresh();
  };

  const handleDelete = async (id: number, deleteArchive = false) => {
    await api.delete(id, deleteArchive);
    setEditingExpense(null);
    refresh();
  };

  return (
    <div className="fixed inset-0 z-50 bg-snap-50 overflow-y-auto">
      <Modal open={!!editingExpense} onClose={() => setEditingExpense(null)} title="Edit Expense">
        {editingExpense && (
          <EditExpenseForm
            cards={cards}
            expense={editingExpense}
            onSubmit={handleEditSave}
            onCancel={() => setEditingExpense(null)}
            onDelete={() => handleDelete(editingExpense.id, false)}
            currentUser={currentUser}
            allUsers={allUsers}
          />
        )}
      </Modal>

      <div className="sticky top-0 z-10 bg-snap-50/90 backdrop-blur-sm border-b border-snap-100">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button type="button" onClick={onClose} className="text-sm font-semibold text-snap-600">← Back</button>
          <h1 className="text-base font-bold text-snap-800 flex-1">Personal</h1>
          {expenses && <span className="text-xs text-skin-secondary">{expenses.length} expense{expenses.length !== 1 ? "s" : ""}</span>}
        </div>

        {/* Date presets */}
        <div className="max-w-lg mx-auto px-4 pb-2 flex gap-2">
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

        {/* User / type filters */}
        <div className="max-w-lg mx-auto px-4 pb-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {visibleUsers.map(u => (
              <button
                key={u.id}
                type="button"
                onClick={() => togglePersonal(u.id)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                  activePersonal.has(u.id) ? "bg-snap-500 text-white border-snap-500" : "bg-white text-snap-600 border-snap-200"
                }`}
              >
                {u.id === currentUser.id ? "Mine" : u.username}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowShared(v => !v)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                showShared ? "bg-snap-500 text-white border-snap-500" : "bg-white text-snap-600 border-snap-200"
              }`}
            >
              Shared
            </button>
          </div>

          {showShared && allUsers.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-skin-secondary uppercase tracking-wide mb-1">Shared among</p>
              <div className="flex flex-wrap gap-1.5">
                {allUsers.map(u => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleSharedFilter(u.id)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                      sharedFilter.has(u.id) ? "bg-snap-300 text-snap-900 border-snap-300" : "bg-white text-snap-400 border-snap-200"
                    }`}
                  >
                    {u.username}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-skin-secondary mt-1">
                {sharedFilter.size === 0 ? "All shared expenses" : "Filtered by selected users"}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-2">
        {loading && <p className="text-center text-sm text-skin-secondary py-8">Loading…</p>}
        {!loading && expenses && expenses.length === 0 && (
          <p className="text-center text-sm text-skin-secondary py-8">No expenses found.</p>
        )}
        {!loading && expenses && expenses.length > 0 && (
          <>
            {/* Total summary */}
            <div className="bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(34,197,94,0.08)] mb-2">
              <p className="text-[11px] font-bold text-skin-secondary uppercase tracking-wide mb-1">Your share</p>
              <p className="text-2xl font-bold text-snap-800">
                {expenses.reduce((sum, e) => sum + effectiveAmount(e), 0).toFixed(2)} EUR
              </p>
              <p className="text-xs text-skin-secondary mt-0.5">
                {expenses.length} expense{expenses.length !== 1 ? "s" : ""}
                {expenses.some(e => e.is_shared) && (
                  <> · full total {expenses.reduce((sum, e) => sum + e.total, 0).toFixed(2)} EUR</>
                )}
              </p>
            </div>

            {expenses.map(exp => {
              const share = effectiveAmount(exp);
              const parts = exp.is_shared ? (exp.shared_with.length || allUsers.length || 1) : 1;
              return (
                <button
                  key={exp.id}
                  type="button"
                  onClick={() => setEditingExpense(exp)}
                  className="w-full text-left bg-white rounded-[14px] px-4 py-3 shadow-[0_1px_4px_rgba(34,197,94,0.08)] hover:bg-snap-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-snap-800 truncate">{exp.merchant || exp.category}</p>
                      <div className="flex gap-2 mt-0.5 flex-wrap">
                        <span className="text-[10px] text-skin-secondary">{exp.date}</span>
                        <span className="text-[10px] text-skin-secondary capitalize">{exp.category}</span>
                        {exp.is_shared ? (
                          <span className="text-[10px] text-snap-400">
                            Shared · {exp.shared_with.length ? exp.shared_with.map(id => userById[id]?.username ?? id).join(", ") : "everyone"}
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-snap-600">{exp.attributed_username}</span>
                        )}
                      </div>
                      {exp.note && <p className="text-xs text-skin-secondary mt-0.5 italic truncate">{exp.note}</p>}
                      {exp.ai_cost != null && <p className="text-[10px] text-skin-secondary mt-0.5">AI cost: ${exp.ai_cost.toFixed(4)}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-mono font-bold text-snap-800">{share.toFixed(2)}</p>
                      {exp.is_shared && (
                        <p className="text-[10px] text-skin-secondary">÷{parts} of {exp.total.toFixed(2)}</p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}


function AllExpensesPanel({
  onClose,
  cards,
  currentUser,
  allUsers,
}: {
  onClose: () => void;
  cards: string[];
  currentUser: User;
  allUsers: User[];
}) {
  const [activePersonal, setActivePersonal] = useState<Set<number>>(new Set());
  const [showShared, setShowShared] = useState(true);
  const [sharedFilter, setSharedFilter] = useState<Set<number>>(new Set());
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  const userById = Object.fromEntries(allUsers.map(u => [u.id, u]));
  const visibleUsers = currentUser.is_superuser ? allUsers : [currentUser];

  const effectiveAmount = (exp: Expense): number => {
    if (!exp.is_shared) return exp.total;
    const parts = exp.shared_with.length || allUsers.length || 1;
    return exp.total / parts;
  };

  const togglePersonal = (uid: number) => setActivePersonal(prev => {
    const next = new Set(prev);
    next.has(uid) ? next.delete(uid) : next.add(uid);
    return next;
  });

  const toggleSharedFilter = (uid: number) => setSharedFilter(prev => {
    const next = new Set(prev);
    next.has(uid) ? next.delete(uid) : next.add(uid);
    return next;
  });

  useEffect(() => {
    const calls: Promise<Expense[]>[] = [];
    activePersonal.forEach(uid => calls.push(api.listPersonalFor(uid)));
    if (showShared) calls.push(api.listAllShared());
    if (calls.length === 0) { setExpenses([]); return; }

    setLoading(true);
    Promise.all(calls)
      .then(results => {
        const seen = new Set<number>();
        const merged: Expense[] = [];
        for (const list of results)
          for (const e of list)
            if (!seen.has(e.id)) { seen.add(e.id); merged.push(e); }

        const filtered = merged.filter(e => {
          if (!e.is_shared) return true;
          if (sharedFilter.size === 0) return true;
          const sw = e.shared_with;
          if (!sw || sw.length === 0) return true;
          return [...sharedFilter].some(uid => sw.includes(uid));
        });
        filtered.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
        setExpenses(filtered);
      })
      .catch(() => setExpenses([]))
      .finally(() => setLoading(false));
  }, [activePersonal, showShared, sharedFilter]);

  const refresh = () => setActivePersonal(prev => new Set(prev));

  const handleEditSave = async (data: ExpenseCreate) => {
    if (!editingExpense) return;
    await api.update(editingExpense.id, data);
    setEditingExpense(null);
    refresh();
  };

  const handleDelete = async (id: number, deleteArchive = false) => {
    await api.delete(id, deleteArchive);
    setEditingExpense(null);
    refresh();
  };

  // Group expenses by month for display
  const grouped = (expenses ?? []).reduce<Record<string, Expense[]>>((acc, exp) => {
    const key = exp.date.substring(0, 7);
    if (!acc[key]) acc[key] = [];
    acc[key].push(exp);
    return acc;
  }, {});
  const sortedMonths = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
  const formatMonthHeader = (ym: string) => {
    const [year, month] = ym.split("-");
    return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  };

  return (
    <div className="fixed inset-0 z-50 bg-snap-50 overflow-y-auto">
      <Modal open={!!editingExpense} onClose={() => setEditingExpense(null)} title="Edit Expense">
        {editingExpense && (
          <EditExpenseForm
            cards={cards}
            expense={editingExpense}
            onSubmit={handleEditSave}
            onCancel={() => setEditingExpense(null)}
            onDelete={() => handleDelete(editingExpense.id, false)}
            currentUser={currentUser}
            allUsers={allUsers}
          />
        )}
      </Modal>

      <div className="sticky top-0 z-10 bg-snap-50/90 backdrop-blur-sm border-b border-snap-100">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button type="button" onClick={onClose} className="text-sm font-semibold text-snap-600">← Back</button>
          <h1 className="text-base font-bold text-snap-800 flex-1">All Expenses</h1>
          {expenses && <span className="text-xs text-skin-secondary">{expenses.length} expense{expenses.length !== 1 ? "s" : ""}</span>}
        </div>


        {/* User / type filters */}
        <div className="max-w-lg mx-auto px-4 pb-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {visibleUsers.map(u => (
              <button
                key={u.id}
                type="button"
                onClick={() => togglePersonal(u.id)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                  activePersonal.has(u.id) ? "bg-snap-500 text-white border-snap-500" : "bg-white text-snap-600 border-snap-200"
                }`}
              >
                {u.id === currentUser.id ? "Mine" : u.username}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowShared(v => !v)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                showShared ? "bg-snap-500 text-white border-snap-500" : "bg-white text-snap-600 border-snap-200"
              }`}
            >
              Shared
            </button>
          </div>

          {showShared && allUsers.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-skin-secondary uppercase tracking-wide mb-1">Shared among</p>
              <div className="flex flex-wrap gap-1.5">
                {allUsers.map(u => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleSharedFilter(u.id)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                      sharedFilter.has(u.id) ? "bg-snap-300 text-snap-900 border-snap-300" : "bg-white text-snap-400 border-snap-200"
                    }`}
                  >
                    {u.username}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-skin-secondary mt-1">
                {sharedFilter.size === 0 ? "All shared expenses" : "Filtered by selected users"}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-1">
        {loading && <p className="text-center text-sm text-skin-secondary py-8">Loading…</p>}
        {!loading && expenses && expenses.length === 0 && (
          <p className="text-center text-sm text-skin-secondary py-8">No expenses found.</p>
        )}
        {!loading && expenses && expenses.length > 0 && (
          <div className="bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(34,197,94,0.08)] mb-2">
            <p className="text-[11px] font-bold text-skin-secondary uppercase tracking-wide mb-1">Your share</p>
            <p className="text-2xl font-bold text-snap-800">
              {expenses.reduce((sum, e) => sum + effectiveAmount(e), 0).toFixed(2)} EUR
            </p>
            <p className="text-xs text-skin-secondary mt-0.5">
              {expenses.length} expense{expenses.length !== 1 ? "s" : ""}
              {expenses.some(e => e.is_shared) && (
                <> · full total {expenses.reduce((sum, e) => sum + e.total, 0).toFixed(2)} EUR</>
              )}
            </p>
          </div>
        )}
        {!loading && expenses && expenses.length > 0 && sortedMonths.map(ym => (
          <div key={ym}>
            <div className="sticky top-[calc(var(--header-h,120px))] bg-snap-50/95 backdrop-blur-sm py-2">
              <p className="text-[11px] font-bold text-snap-600 uppercase tracking-wide">{formatMonthHeader(ym)}</p>
            </div>
            <div className="space-y-1.5">
              {grouped[ym].map(exp => (
                <button
                  key={exp.id}
                  type="button"
                  onClick={() => setEditingExpense(exp)}
                  className="w-full text-left bg-white rounded-[14px] px-4 py-3 shadow-[0_1px_4px_rgba(34,197,94,0.08)] hover:bg-snap-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-snap-800 truncate">{exp.merchant || exp.category}</p>
                      <div className="flex gap-2 mt-0.5 flex-wrap">
                        <span className="text-[10px] text-skin-secondary">{exp.date}</span>
                        <span className="text-[10px] text-skin-secondary capitalize">{exp.category}</span>
                        {exp.is_shared ? (
                          <span className="text-[10px] text-snap-400">
                            Shared · {exp.shared_with.length ? exp.shared_with.map(id => userById[id]?.username ?? id).join(", ") : "everyone"}
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-snap-600">{exp.attributed_username}</span>
                        )}
                      </div>
                      {exp.note && <p className="text-xs text-skin-secondary mt-0.5 italic truncate">{exp.note}</p>}
                      {exp.ai_cost != null && <p className="text-[10px] text-skin-secondary mt-0.5">AI cost: ${exp.ai_cost.toFixed(4)}</p>}
                    </div>
                    <span className="text-sm font-mono font-bold text-snap-800 shrink-0">{exp.total.toFixed(2)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
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
  const [drillMode, setDrillMode] = useState<"category" | "merchant" | "month" | null>(null);
  const [drillKey, setDrillKey] = useState<string | null>(null);
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

  const fetchDrill = (mode: "category" | "merchant" | "month", key: string) => {
    const { from, to } = getAnalyticsRange(preset);
    setDrillLoading(true);
    setDrillExpenses(null);
    const promise =
      mode === "category" ? api.listByCategory(key, from, to) :
      mode === "merchant" ? api.listByMerchant(key, from, to) :
      api.listByMonth(key, from, to);
    promise
      .then(setDrillExpenses)
      .catch(() => {})
      .finally(() => setDrillLoading(false));
  };

  const openDrill = (mode: "category" | "merchant" | "month", key: string) => {
    setDrillMode(mode);
    setDrillKey(key);
    fetchDrill(mode, key);
  };

  const closeDrill = () => {
    setDrillMode(null);
    setDrillKey(null);
    setDrillExpenses(null);
  };

  const refreshDrill = () => {
    if (!drillMode || !drillKey) return;
    fetchDrill(drillMode, drillKey);
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
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-semibold text-snap-600"
          >
            ← Back
          </button>
          <h1 className="text-base font-bold text-snap-800 flex-1">Analytics</h1>
        </div>
        <div className="max-w-lg mx-auto px-4 pb-2 flex gap-2">
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

      <div className="max-w-lg mx-auto p-4 space-y-4">
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
                      onClick={() => openDrill("category", row.category)}
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
                    <button
                      key={row.merchant}
                      type="button"
                      onClick={() => openDrill("merchant", row.merchant)}
                      className="w-full flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-snap-50 transition-colors"
                    >
                      <span className="flex-1 text-xs text-skin-primary truncate text-left">{row.merchant} ({row.count})</span>
                      <div className="w-20 bg-snap-100 rounded-full h-1.5 shrink-0">
                        <div
                          className="bg-snap-300 h-1.5 rounded-full"
                          style={{ width: `${(row.total / maxMerchant) * 100}%` }}
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

            {/* By Month */}
            {data.by_month.length > 1 && (
              <div className="bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(34,197,94,0.08)]">
                <p className="text-[11px] font-bold text-skin-secondary uppercase tracking-wide mb-3">By month</p>
                <div className="space-y-1.5">
                  {data.by_month.map((row) => (
                    <button
                      key={row.month}
                      type="button"
                      onClick={() => openDrill("month", row.month)}
                      className="w-full flex justify-between text-xs px-2 py-1 rounded-lg hover:bg-snap-50 transition-colors"
                    >
                      <span className="text-skin-secondary">{row.month} ({row.count})</span>
                      <span className="font-mono text-snap-800">{row.total.toFixed(2)}</span>
                    </button>
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

      {/* Drill-down overlay (category / merchant / month) */}
      {drillMode && drillKey && (
        <div className="fixed inset-0 z-60 bg-snap-50 overflow-y-auto">
          {/* Edit expense modal (from drill-down) */}
          <Modal open={!!editingExpense} onClose={() => setEditingExpense(null)} title="Edit Expense">
            {editingExpense && (
              <EditExpenseForm
                cards={cards}
                expense={editingExpense}
                onSubmit={handleEditSave}
                onCancel={() => setEditingExpense(null)}
                onDelete={() => handleDelete(editingExpense.id, false)}
                currentUser={currentUser}
                allUsers={allUsers}
              />
            )}
          </Modal>

          <div className="sticky top-0 z-10 bg-snap-50/90 backdrop-blur-sm border-b border-snap-100">
            <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
              <button
                type="button"
                onClick={closeDrill}
                className="text-sm font-semibold text-snap-600"
              >
                ← Back
              </button>
              <h2 className="text-base font-bold text-snap-800 flex-1">{drillKey}</h2>
              {drillExpenses && (
                <span className="text-xs text-skin-secondary">
                  {drillExpenses.length} {drillExpenses.length === 1 ? "expense" : "expenses"}
                </span>
              )}
            </div>
          </div>
          <div className="max-w-lg mx-auto p-4 space-y-2">
            {drillLoading && (
              <p className="text-center text-sm text-skin-secondary py-8">Loading…</p>
            )}
            {!drillLoading && drillExpenses && drillExpenses.length === 0 && (
              <p className="text-center text-sm text-skin-secondary py-8">No expenses found.</p>
            )}
            {!drillLoading && drillExpenses && drillExpenses.length > 0 && (() => {
              const drillGrouped = drillExpenses.reduce<Record<string, Expense[]>>((acc, exp) => {
                const key = exp.date.substring(0, 7);
                if (!acc[key]) acc[key] = [];
                acc[key].push(exp);
                return acc;
              }, {});
              const drillMonths = Object.keys(drillGrouped).sort((a, b) => b.localeCompare(a));
              const multiMonth = drillMonths.length > 1;
              const formatMonthHeader = (ym: string) => {
                const [year, month] = ym.split("-");
                return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
              };
              const renderExpense = (exp: Expense) => (
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
                      {exp.ai_cost != null && <p className="text-[10px] text-skin-secondary mt-0.5">AI cost: ${exp.ai_cost.toFixed(4)}</p>}
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
              );
              return (
                <>
                  <div className="bg-white rounded-[14px] px-4 py-3 shadow-[0_1px_4px_rgba(34,197,94,0.08)] flex justify-between items-center">
                    <span className="text-sm font-semibold text-skin-secondary">Total</span>
                    <span className="text-base font-bold text-snap-700">
                      {drillExpenses.reduce((sum, e) => sum + e.total, 0).toFixed(2)}
                    </span>
                  </div>
                  {multiMonth ? drillMonths.map(ym => (
                    <div key={ym}>
                      <div className="py-2">
                        <p className="text-[11px] font-bold text-snap-600 uppercase tracking-wide">{formatMonthHeader(ym)}</p>
                      </div>
                      <div className="space-y-2">
                        {drillGrouped[ym].map(renderExpense)}
                      </div>
                    </div>
                  )) : drillExpenses.map(renderExpense)}
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

function AiCostsPanel({ onClose, cards, currentUser, allUsers }: {
  onClose: () => void;
  cards: string[];
  currentUser: User;
  allUsers: User[];
}) {
  const [data, setData] = useState<AiCostsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  const load = () => {
    setLoading(true);
    api.aiCosts()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleEditSave = async (data: ExpenseCreate) => {
    if (!editingExpense) return;
    await api.update(editingExpense.id, data);
    setEditingExpense(null);
    load();
  };

  const handleDelete = async (id: number) => {
    await api.delete(id, false);
    setEditingExpense(null);
    load();
  };

  const formatMonth = (ym: string) => {
    if (ym === "unknown") return "Unknown";
    const [y, m] = ym.split("-");
    return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  };

  const MiniExpenseCard = ({ exp, label }: { exp: Expense & { effective_ai_cost: number }; label: string }) => (
    <button
      type="button"
      onClick={() => setEditingExpense(exp)}
      className="flex-1 rounded-xl border border-snap-200 bg-white p-2.5 space-y-0.5 min-w-0 text-left hover:border-snap-400 transition-colors"
    >
      <p className="text-[10px] font-bold text-snap-500 uppercase tracking-wide">{label}</p>
      <p className="text-xs font-semibold text-snap-800 truncate">{exp.merchant || exp.category}</p>
      <p className="text-[10px] text-skin-secondary">{exp.date}</p>
      <p className="text-[10px] font-mono text-snap-700">${exp.effective_ai_cost.toFixed(4)}</p>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 bg-snap-50 overflow-y-auto">
      <div className="sticky top-0 z-10 bg-snap-50/90 backdrop-blur-sm border-b border-snap-100">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button type="button" onClick={onClose} className="text-sm font-semibold text-snap-600">← Back</button>
          <h1 className="text-base font-bold text-snap-800 flex-1">AI Costs</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-5">
        {loading && <p className="text-center text-sm text-skin-secondary py-8">Loading…</p>}

        {data && (
          <>
            <div className="rounded-2xl bg-white border border-snap-200 px-4 py-3">
              <p className="text-xs text-skin-secondary">Total estimated AI cost</p>
              <p className="text-2xl font-bold text-snap-800 mt-0.5">${data.total.toFixed(4)}</p>
            </div>

            {data.months.map(m => (
              <div key={m.month} className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <h2 className="text-sm font-bold text-snap-800">{formatMonth(m.month)}</h2>
                  <span className="text-xs text-skin-secondary">{m.count} expenses · ${m.total.toFixed(4)}</span>
                </div>
                <div className="flex gap-2">
                  <MiniExpenseCard exp={m.highest} label="Highest" />
                  {m.lowest.id !== m.highest.id && <MiniExpenseCard exp={m.lowest} label="Lowest" />}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      <Modal open={!!editingExpense} onClose={() => setEditingExpense(null)} title="Edit Expense">
        {editingExpense && (
          <EditExpenseForm
            cards={cards}
            expense={editingExpense}
            onSubmit={handleEditSave}
            onCancel={() => setEditingExpense(null)}
            onDelete={() => handleDelete(editingExpense.id)}
            currentUser={currentUser}
            allUsers={allUsers}
          />
        )}
      </Modal>
    </div>
  );
}

function ScannedPanel({ onClose, cards, currentUser, allUsers }: {
  onClose: () => void;
  cards: string[];
  currentUser: User;
  allUsers: User[];
}) {
  const [images, setImages] = useState<ScannedImage[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const [attachingImage, setAttachingImage] = useState<ScannedImage | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [uploading, setUploading] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  const handleUploadCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      await api.uploadOrphanedImage(file);
      load();
    } finally {
      setUploading(false);
    }
  };

  const load = () => {
    setLoading(true);
    api.scanned()
      .then(setImages)
      .catch(() => setImages([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Lock body scroll while panel is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const handleDeleteOrphan = async (img: ScannedImage) => {
    setDeletingPath(img.path);
    // Optimistic: remove from list immediately
    setImages(prev => prev ? prev.filter(i => i.path !== img.path) : prev);
    try {
      if (img.location === "tmp") {
        await api.deleteTmpFile(img.filename);
      } else {
        await api.deleteArchiveFile(img.filename);
      }
      load();
    } catch {
      load(); // revert on error
    } finally {
      setDeletingPath(null);
    }
  };

  const handleAttach = async (img: ScannedImage, targetExpense: Expense) => {
    const newPaths = [...(targetExpense.receipt_paths ?? [])];
    if (!newPaths.includes(img.path)) newPaths.push(img.path);
    // Optimistic: update image to show new expense, and remove it from any prior expense
    setImages(prev => prev ? prev.map(i => {
      if (i.path === img.path) return { ...i, expense: { ...targetExpense, receipt_paths: newPaths } };
      // remove from old expense if it had this path
      if (i.expense && i.expense.id === targetExpense.id) return { ...i, expense: { ...i.expense, receipt_paths: newPaths } };
      // remove path from old owner if it was reassigned
      if (img.expense && i.expense && i.expense.id === img.expense.id && i.path !== img.path) {
        const updatedPaths = (i.expense.receipt_paths ?? []).filter(p => p !== img.path);
        return { ...i, expense: { ...i.expense, receipt_paths: updatedPaths } };
      }
      return i;
    }) : prev);
    setAttachingImage(null);
    try {
      await api.setExpenseImages(targetExpense.id, newPaths);
      load();
    } catch {
      load();
    }
  };

  const handleDetach = async (img: ScannedImage) => {
    if (!img.expense) return;
    const newPaths = (img.expense.receipt_paths ?? []).filter(p => p !== img.path);
    // Optimistic: mark image as orphaned immediately
    setImages(prev => prev ? prev.map(i =>
      i.path === img.path ? { ...i, expense: null } : i
    ) : prev);
    try {
      await api.setExpenseImages(img.expense.id, newPaths);
      load();
    } catch {
      load();
    }
  };

  const handleEditSave = async (data: ExpenseCreate) => {
    if (!editingExpense) return;
    await api.update(editingExpense.id, data);
    setEditingExpense(null);
    load();
  };

  const handleDelete = async (id: number) => {
    await api.delete(id, false);
    setEditingExpense(null);
    load();
  };

  const formatMonthHeader = (ym: string) => {
    if (ym === "unknown") return "Unknown date";
    const [year, month] = ym.split("-");
    return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  };

  const attached = (images ?? []).filter(i => i.expense !== null)
    .sort((a, b) => (b.expense!.date ?? "").localeCompare(a.expense!.date ?? ""));
  const orphaned = (images ?? []).filter(i => i.expense === null)
    .sort((a, b) => b.filename.localeCompare(a.filename));

  const groupByMonth = (imgs: ScannedImage[]) =>
    imgs.reduce<Record<string, ScannedImage[]>>((acc, img) => {
      if (!acc[img.month]) acc[img.month] = [];
      acc[img.month].push(img);
      return acc;
    }, {});

  const sortedMonthKeys = (grouped: Record<string, ScannedImage[]>) =>
    Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const attachedGrouped = groupByMonth(attached);
  const orphanedGrouped = groupByMonth(orphaned);

  const renderCard = (img: ScannedImage) => (
    <div key={img.path} className="rounded-xl overflow-hidden bg-white border border-snap-200">
      <a href={`/${img.path}`} target="_blank" rel="noopener noreferrer" className="block">
        <img src={`/${img.path}`} alt={img.filename} className="w-full h-32 object-cover" />
      </a>
      <div className="px-2 py-1.5 space-y-1">
        {img.expense ? (
          <button
            type="button"
            onClick={() => setEditingExpense(img.expense)}
            className="w-full text-left px-2 py-1 rounded-lg bg-gray-500 hover:bg-gray-600 active:bg-gray-700 transition-colors"
          >
            <p className="text-[11px] font-semibold text-white truncate">{img.expense.merchant || img.expense.category}</p>
            <p className="text-[10px] text-gray-200">{img.expense.date} · {img.expense.total.toFixed(2)} {img.expense.currency}</p>
          </button>
        ) : (
          <p className="text-[10px] text-skin-secondary italic">Orphaned</p>
        )}
        <div className="flex gap-1 flex-wrap">
          <button
            type="button"
            onClick={() => setAttachingImage(img)}
            className="flex-1 py-1 rounded-lg bg-snap-100 text-snap-700 text-[10px] font-semibold hover:bg-snap-200 transition-colors"
          >
            {img.expense ? "Reassign" : "Attach"}
          </button>
          {img.expense ? (
            <button
              type="button"
              onClick={() => handleDetach(img)}
              className="px-2 py-1 rounded-lg bg-red-50 text-red-500 text-[10px] font-semibold hover:bg-red-100 transition-colors"
            >
              Detach
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleDeleteOrphan(img)}
              disabled={deletingPath === img.path}
              className="px-2 py-1 rounded-lg bg-red-50 text-red-500 text-[10px] font-semibold hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              {deletingPath === img.path ? "…" : "Delete"}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  const renderSection = (
    label: string,
    grouped: Record<string, ScannedImage[]>,
    count: number,
  ) => (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-bold text-snap-800">{label}</h2>
        <span className="text-xs text-skin-secondary">{count}</span>
      </div>
      {sortedMonthKeys(grouped).map(ym => (
        <div key={ym} className="space-y-2">
          <p className="text-[11px] font-bold text-snap-600 uppercase tracking-wide">{formatMonthHeader(ym)}</p>
          <div className="grid grid-cols-2 gap-2">
            {grouped[ym].map(renderCard)}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <>
      {attachingImage && (
        <ExpensePickerModal
          title={attachingImage.expense ? `Reassign from ${attachingImage.expense.merchant || attachingImage.expense.category}` : "Attach to expense"}
          onSelect={(exp) => handleAttach(attachingImage, exp)}
          onClose={() => setAttachingImage(null)}
        />
      )}
      <Modal open={!!editingExpense} onClose={() => setEditingExpense(null)} title="Edit Expense">
        {editingExpense && (
          <EditExpenseForm
            cards={cards}
            expense={editingExpense}
            onSubmit={handleEditSave}
            onCancel={() => setEditingExpense(null)}
            onDelete={() => handleDelete(editingExpense.id)}
            currentUser={currentUser}
            allUsers={allUsers}
          />
        )}
      </Modal>
      <div className="fixed inset-0 z-50 bg-snap-50 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-snap-50/90 backdrop-blur-sm border-b border-snap-100">
          <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
            <button type="button" onClick={onClose} className="text-sm font-semibold text-snap-600">← Back</button>
            <h1 className="text-base font-bold text-snap-800 flex-1">Scanned</h1>
            {images && (
              <span className="text-xs text-skin-secondary">{images.length} image{images.length !== 1 ? "s" : ""}</span>
            )}
          </div>
          <div className="max-w-lg mx-auto px-4 pb-3 flex gap-2">
            <button
              type="button"
              onClick={() => uploadRef.current?.click()}
              disabled={uploading}
              className="flex-1 py-2 rounded-xl bg-white border border-snap-200 text-snap-700 text-sm font-semibold hover:bg-snap-50 transition-colors disabled:opacity-50"
            >
              {uploading ? "Saving…" : "Upload"}
            </button>
            <button
              type="button"
              onClick={() => scanRef.current?.click()}
              disabled={uploading}
              className="sm:hidden flex-1 py-2 rounded-xl bg-white border border-snap-200 text-snap-700 text-sm font-semibold hover:bg-snap-50 transition-colors disabled:opacity-50"
            >
              Scan
            </button>
          </div>
          {/* Upload: file picker */}
          <input ref={uploadRef} type="file" accept="image/*" onChange={handleUploadCapture} className="hidden" />
          {/* Scan: camera (mobile) */}
          <input ref={scanRef} type="file" accept="image/*" capture="environment" onChange={handleUploadCapture} className="hidden" />
        </div>

        <div className="max-w-lg mx-auto px-4 py-4 space-y-6">
          {loading && (
            <p className="text-sm text-skin-secondary text-center py-8">Loading…</p>
          )}

          {!loading && images !== null && (
            <>
              {attached.length > 0
                ? renderSection("Attached", attachedGrouped, attached.length)
                : <p className="text-sm text-skin-secondary text-center py-4">No attached images.</p>
              }

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-snap-800">Orphaned</h2>
                  <span className="text-xs text-skin-secondary">{orphaned.length}</span>
                </div>
                {orphaned.length === 0 ? (
                  <p className="text-sm text-skin-secondary">No orphaned images.</p>
                ) : (
                  sortedMonthKeys(orphanedGrouped).map(ym => (
                    <div key={ym} className="space-y-2">
                      <p className="text-[11px] font-bold text-snap-600 uppercase tracking-wide">{formatMonthHeader(ym)}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {orphanedGrouped[ym].map(renderCard)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function ExpensePickerModal({ title, onSelect, onClose }: {
  title: string;
  onSelect: (expense: Expense) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.list()
      .then(exps => {
        const sorted = [...exps].sort((a, b) => b.date.localeCompare(a.date));
        setAllExpenses(sorted);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = query.trim()
    ? allExpenses.filter(e =>
        (e.merchant ?? "").toLowerCase().includes(query.toLowerCase()) ||
        e.category.toLowerCase().includes(query.toLowerCase()) ||
        e.date.includes(query)
      )
    : allExpenses;

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-end justify-center">
      <div className="w-full max-w-lg bg-white rounded-t-2xl max-h-[80vh] flex flex-col">
        <div className="px-4 pt-4 pb-2 flex items-center gap-3 border-b border-snap-100">
          <button type="button" onClick={onClose} className="text-sm font-semibold text-snap-600 shrink-0">Cancel</button>
          <h2 className="text-sm font-bold text-snap-800 flex-1 truncate">{title}</h2>
        </div>
        <div className="px-4 py-2 border-b border-snap-100">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by merchant, category or date…"
            className="form-input w-full"
            autoFocus
          />
        </div>
        <div className="overflow-y-auto flex-1 px-4 py-2 space-y-1">
          {loading && <p className="text-sm text-skin-secondary text-center py-4">Loading…</p>}
          {!loading && filtered.length === 0 && <p className="text-sm text-skin-secondary text-center py-4">No expenses found.</p>}
          {filtered.slice(0, 50).map(exp => (
            <button
              key={exp.id}
              type="button"
              onClick={() => onSelect(exp)}
              className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-snap-50 transition-colors"
            >
              <p className="text-sm font-semibold text-snap-800 truncate">{exp.merchant || exp.category}</p>
              <p className="text-[10px] text-skin-secondary">{exp.date} · {exp.total.toFixed(2)} {exp.currency} · {exp.category}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ScannedImagePickerModal({ currentPaths, onAdd, onClose }: {
  currentPaths: string[];
  onAdd: (path: string) => void;
  onClose: () => void;
}) {
  const [images, setImages] = useState<ScannedImage[] | null>(null);

  useEffect(() => {
    api.scanned().then(setImages).catch(() => setImages([]));
  }, []);

  const available = (images ?? []).filter(img => !currentPaths.includes(img.path));

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-end justify-center">
      <div className="w-full max-w-lg bg-white rounded-t-2xl max-h-[80vh] flex flex-col">
        <div className="px-4 pt-4 pb-3 flex items-center gap-3 border-b border-snap-100">
          <button type="button" onClick={onClose} className="text-sm font-semibold text-snap-600 shrink-0">Cancel</button>
          <h2 className="text-sm font-bold text-snap-800 flex-1">Add image</h2>
          {images && <span className="text-xs text-skin-secondary">{available.length} available</span>}
        </div>
        <div className="overflow-y-auto flex-1 px-4 py-3">
          {images === null && <p className="text-sm text-skin-secondary text-center py-4">Loading…</p>}
          {images !== null && available.length === 0 && (
            <p className="text-sm text-skin-secondary text-center py-4">No available images.</p>
          )}
          {available.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {available.map(img => (
                <button key={img.path} type="button" onClick={() => onAdd(img.path)} className="block rounded-xl overflow-hidden border-2 border-transparent hover:border-snap-400 transition-colors">
                  <img src={`/${img.path}`} alt={img.filename} className="w-full h-24 object-cover" />
                  <div className="px-1 py-1 bg-snap-50">
                    <p className="text-[9px] text-skin-secondary truncate">{img.expense ? (img.expense.merchant || img.expense.category) : "Orphaned"}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
