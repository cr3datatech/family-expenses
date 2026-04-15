"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { api, Expense, ExpenseCreate, ReceiptScanResult, User } from "@/lib/api";
import PhotoCapture from "@/components/PhotoCapture";
import Modal from "@/components/Modal";
import ScanProgress from "@/components/scanning/ScanProgress";
import HeaderMenu from "@/components/layout/HeaderMenu";
import ManualEntryForm from "@/components/expenses/ManualEntryForm";
import ReceiptReviewForm from "@/components/expenses/ReceiptReviewForm";
import EditExpenseForm from "@/components/expenses/EditExpenseForm";
import PersonalPanel from "@/components/expenses/PersonalPanel";
import AllExpensesPanel from "@/components/expenses/AllExpensesPanel";
import SearchModal from "@/components/expenses/SearchModal";
import ExpensePickerModal from "@/components/expenses/ExpensePickerModal";
import AnalyticsPanel, { ANALYTICS_PRESETS, getAnalyticsRange } from "@/components/analytics/AnalyticsPanel";
import AiCostsPanel from "@/components/analytics/AiCostsPanel";
import ScannedPanel from "@/components/scanning/ScannedPanel";
import UserAdminPanel from "@/components/admin/UserAdminPanel";

export default function ExpensesPage({
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
