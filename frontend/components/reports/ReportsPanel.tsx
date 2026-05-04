"use client";

import { useState, useEffect } from "react";
import { api, AnalyticsData, Expense, ExpenseCreate, User } from "@/lib/api";
import Modal from "@/components/Modal";
import EditExpenseForm from "@/components/expenses/EditExpenseForm";
import ManualEntryForm from "@/components/expenses/ManualEntryForm";

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function effectiveAmount(e: Expense): number {
  return e.is_shared && e.shared_with.length > 0
    ? e.total / e.shared_with.length
    : e.total;
}

function computeRange(year: number, months: number[]): { from: string; to: string } | null {
  if (months.length === 0) return null;
  const sorted = [...months].sort((a, b) => a - b);
  const firstMonth = sorted[0];
  const lastMonth = sorted[sorted.length - 1];
  const from = `${year}-${String(firstMonth).padStart(2, "0")}-01`;
  const lastDay = new Date(year, lastMonth, 0).getDate();
  const to = `${year}-${String(lastMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

function labelForSelection(year: number, months: number[]): string {
  if (months.length === 0) return "No period selected";
  const sorted = [...months].sort((a, b) => a - b);
  if (months.length === 1) return `${MONTH_NAMES[sorted[0] - 1]} ${year}`;
  if (months.length === 12) return `Full year ${year}`;
  return sorted.map(m => MONTH_NAMES[m - 1]).join(", ") + ` ${year}`;
}

function computeAnalytics(expenses: Expense[], amountFn: (e: Expense) => number = effectiveAmount): AnalyticsData {
  const total = expenses.reduce((s, e) => s + amountFn(e), 0);
  const count = expenses.length;

  const catMap: Record<string, { total: number; count: number }> = {};
  const cardMap: Record<string, { total: number; count: number }> = {};
  const merchantMap: Record<string, { total: number; count: number }> = {};
  const monthMap: Record<string, { total: number; count: number }> = {};
  const itemMap: Record<string, { total_amount: number; total_qty: number; unit_prices: number[] }> = {};

  for (const e of expenses) {
    const eff = amountFn(e);
    const itemShare = eff / (e.total || 1);

    const cat = e.category || "Uncategorized";
    if (!catMap[cat]) catMap[cat] = { total: 0, count: 0 };
    catMap[cat].total += eff;
    catMap[cat].count++;

    if (e.card) {
      if (!cardMap[e.card]) cardMap[e.card] = { total: 0, count: 0 };
      cardMap[e.card].total += eff;
      cardMap[e.card].count++;
    }

    if (e.merchant) {
      if (!merchantMap[e.merchant]) merchantMap[e.merchant] = { total: 0, count: 0 };
      merchantMap[e.merchant].total += eff;
      merchantMap[e.merchant].count++;
    }

    const month = e.date.substring(0, 7);
    if (!monthMap[month]) monthMap[month] = { total: 0, count: 0 };
    monthMap[month].total += eff;
    monthMap[month].count++;

    for (const item of e.items) {
      if (!itemMap[item.name]) itemMap[item.name] = { total_amount: 0, total_qty: 0, unit_prices: [] };
      itemMap[item.name].total_amount += item.amount * itemShare;
      itemMap[item.name].total_qty += item.qty ?? 1;
      if (item.unit_price != null) itemMap[item.name].unit_prices.push(item.unit_price);
    }
  }

  return {
    total,
    count,
    by_category: Object.entries(catMap)
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.total - a.total),
    by_card: Object.entries(cardMap)
      .map(([card, v]) => ({ card, ...v }))
      .sort((a, b) => b.total - a.total),
    by_merchant: Object.entries(merchantMap)
      .map(([merchant, v]) => ({ merchant, ...v }))
      .sort((a, b) => b.total - a.total),
    by_month: Object.entries(monthMap)
      .map(([month, v]) => ({ month, ...v }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    top_items: Object.entries(itemMap)
      .map(([name, v]) => ({
        name,
        total_amount: v.total_amount,
        total_qty: v.total_qty,
        avg_unit_price: v.unit_prices.length > 0
          ? v.unit_prices.reduce((s, p) => s + p, 0) / v.unit_prices.length
          : null,
      }))
      .sort((a, b) => b.total_amount - a.total_amount),
  };
}

export default function ReportsPanel({
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
  const now = new Date();
  const [activeMonthsList, setActiveMonthsList] = useState<string[]>([]);

  useEffect(() => {
    api.activeMonths().then(setActiveMonthsList).catch(() => {});
  }, []);

  const activeYears = activeMonthsList.length > 0
    ? [...new Set(activeMonthsList.map(ym => parseInt(ym.slice(0, 4), 10)))].sort((a, b) => b - a)
    : [now.getFullYear()];

  const [year, setYear] = useState(now.getFullYear());
  const [selectedMonths, setSelectedMonths] = useState<number[]>([now.getMonth() + 1]);

  // When the active years list loads, snap year to the most recent one with data
  useEffect(() => {
    if (activeYears.length > 0 && !activeYears.includes(year)) {
      setYear(activeYears[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMonthsList.join(",")]);

  const activeMonthsForYear = new Set(
    activeMonthsList
      .filter(ym => parseInt(ym.slice(0, 4), 10) === year)
      .map(ym => parseInt(ym.slice(5, 7), 10))
  );

  // Person filter — same pattern as PersonalPanel
  const visibleUsers = currentUser.is_superuser ? allUsers : [currentUser];
  const [showAll, setShowAll] = useState(true);
  const [activePersonal, setActivePersonal] = useState<Set<number>>(new Set());
  const [showShared, setShowShared] = useState(false);
  const defaultSharedFilter = (): Set<number> => {
    const named = allUsers.filter(u => ["christa", "craig"].includes(u.username.toLowerCase()));
    const ids = named.length > 0 ? named : allUsers;
    return new Set(ids.map(u => u.id));
  };
  const [sharedFilter, setSharedFilter] = useState<Set<number>>(defaultSharedFilter);

  // Raw expenses — all derived data comes from this
  const [rawExpenses, setRawExpenses] = useState<Expense[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Content filters (applied client-side to rawExpenses)
  const [excludeLoans, setExcludeLoans] = useState(true);
  const [excludedCategories, setExcludedCategories] = useState<Set<string>>(new Set());
  const [excludedMerchants, setExcludedMerchants] = useState<Set<string>>(new Set());

  const [drillMode, setDrillMode] = useState<"category" | "merchant" | null>(null);
  const [drillKey, setDrillKey] = useState<string | null>(null);
  const [drillExpenses, setDrillExpenses] = useState<Expense[] | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);

  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [copyExpensePrefill, setCopyExpensePrefill] = useState<Expense | null>(null);

  const [showTxns, setShowTxns] = useState(false);
  const [txnSearch, setTxnSearch] = useState("");

  const [calendarDrillDay, setCalendarDrillDay] = useState<number | null>(null);

  const range = computeRange(year, selectedMonths);

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

  const toggleCategory = (cat: string) => setExcludedCategories(prev => {
    const next = new Set(prev);
    next.has(cat) ? next.delete(cat) : next.add(cat);
    return next;
  });

  const toggleMerchant = (m: string) => setExcludedMerchants(prev => {
    const next = new Set(prev);
    next.has(m) ? next.delete(m) : next.add(m);
    return next;
  });

  useEffect(() => {
    setCalendarDrillDay(null);
    if (!range) { setRawExpenses(null); return; }

    const calls: Promise<Expense[]>[] = [];
    if (showAll) {
      visibleUsers.forEach(u => calls.push(api.list(undefined, undefined, false, u.id, range.from, range.to)));
      calls.push(api.listAllShared(range.from, range.to));
    } else {
      activePersonal.forEach(uid => calls.push(api.list(undefined, undefined, false, uid, range.from, range.to)));
      if (showShared) calls.push(api.listAllShared(range.from, range.to));
    }

    if (calls.length === 0) { setRawExpenses([]); return; }

    setLoading(true);
    setRawExpenses(null);

    Promise.all(calls)
      .then(results => {
        const seen = new Set<number>();
        const merged: Expense[] = [];
        for (const list of results)
          for (const e of list)
            if (!seen.has(e.id)) { seen.add(e.id); merged.push(e); }

        const filtered = showAll ? merged : merged.filter(e => {
          if (!e.is_shared) return true;
          if (sharedFilter.size === 0) return true;
          const sw = e.shared_with;
          if (!sw || sw.length === 0) return true;
          return [...sharedFilter].every(uid => sw.includes(uid));
        });

        filtered.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
        setRawExpenses(filtered);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    showAll,
    year,
    selectedMonths.join(","),
    [...activePersonal].sort().join(","),
    showShared,
    [...sharedFilter].sort().join(","),
  ]);

  // Apply content filters to rawExpenses
  const filteredExpenses: Expense[] | null = rawExpenses ? rawExpenses.filter(e => {
    if (excludeLoans && e.category.toLowerCase() === "loan") return false;
    if (excludedCategories.has(e.category)) return false;
    if (e.merchant && excludedMerchants.has(e.merchant)) return false;
    return true;
  }) : null;

  // In All mode show full household amounts; otherwise show each person's share of shared expenses
  const amountFn = showAll ? (e: Expense) => e.total : effectiveAmount;

  // Analytics and calendar derived from filtered expenses
  const data: AnalyticsData | null = filteredExpenses ? computeAnalytics(filteredExpenses, amountFn) : null;
  const calendarExpenses = selectedMonths.length === 1 ? filteredExpenses : null;

  // Unfiltered analytics — used only for building the filter chip lists
  const rawAnalytics = rawExpenses ? computeAnalytics(rawExpenses, amountFn) : null;

  const toggleMonth = (m: number) => {
    setSelectedMonths(prev =>
      prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]
    );
  };

  const fetchDrill = (mode: "category" | "merchant", key: string) => {
    if (!range) return;
    setDrillLoading(true);
    setDrillExpenses(null);
    const promise = mode === "category"
      ? api.listByCategory(key, range.from, range.to)
      : api.listByMerchant(key, range.from, range.to);
    promise.then(setDrillExpenses).catch(() => {}).finally(() => setDrillLoading(false));
  };

  const openDrill = (mode: "category" | "merchant", key: string) => {
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
    if (drillMode && drillKey) fetchDrill(drillMode, drillKey);
  };

  const handleEditSave = async (expData: ExpenseCreate) => {
    if (!editingExpense) return;
    await api.update(editingExpense.id, expData);
    setEditingExpense(null);
    refreshDrill();
  };

  const handleDelete = async (id: number, deleteArchive = false) => {
    await api.delete(id, deleteArchive);
    setEditingExpense(null);
    refreshDrill();
  };

  const handleSaveCopy = async (expData: ExpenseCreate) => {
    await api.create(expData);
    setCopyExpensePrefill(null);
    refreshDrill();
  };

  const maxCard = data?.by_card[0]?.total ?? 1;

  // Transactions use filteredExpenses directly
  const filteredTxns = (filteredExpenses ?? []).filter(e => {
    if (!txnSearch.trim()) return true;
    const q = txnSearch.toLowerCase();
    return (
      (e.merchant ?? "").toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q) ||
      (e.note ?? "").toLowerCase().includes(q) ||
      e.card.toLowerCase().includes(q)
    );
  });

  const groupedTxns = filteredTxns.reduce<Record<string, Expense[]>>((acc, exp) => {
    const key = exp.date.substring(0, 7);
    if (!acc[key]) acc[key] = [];
    acc[key].push(exp);
    return acc;
  }, {});
  const txnMonths = Object.keys(groupedTxns).sort((a, b) => b.localeCompare(a));

  const renderExpenseCard = (exp: Expense, context: "drill" | "txn") => (
    <div
      key={exp.id}
      role="button"
      tabIndex={0}
      onClick={() => setEditingExpense(exp)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditingExpense(exp); } }}
      className="w-full text-left bg-white rounded-[14px] px-4 py-3 shadow-[0_1px_4px_rgba(34,197,94,0.08)] hover:bg-snap-50 transition-colors cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {context === "drill" && drillMode !== "merchant" && exp.merchant ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); openDrill("merchant", exp.merchant!); }}
              className="text-sm font-semibold text-snap-600 underline underline-offset-2 truncate max-w-full text-left hover:text-snap-800"
            >
              {exp.merchant}
            </button>
          ) : (
            <p className="text-sm font-semibold text-snap-800 truncate">{exp.merchant || exp.category}</p>
          )}
          <p className="text-xs text-skin-secondary mt-0.5">{exp.date} · {exp.category}{exp.card ? ` · ${exp.card}` : ""}</p>
          {exp.note && <p className="text-xs text-skin-secondary mt-0.5 italic">{exp.note}</p>}
        </div>
        <div className="flex flex-col items-end shrink-0 gap-1">
          <span className="text-sm font-mono font-bold text-snap-800">{exp.total.toFixed(2)}</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setCopyExpensePrefill(exp); }}
            className="w-6 h-6 rounded-full bg-snap-100 text-snap-500 flex items-center justify-center hover:bg-snap-200 transition-colors"
            aria-label="Copy expense"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
              <path d="M4 2a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1h1a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-1H2a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h2zm0 1H2a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h2V4a2 2 0 0 1 2-2V3zm2-1a1 1 0 0 0-1 1v10h7V3a1 1 0 0 0-1-1H6z"/>
            </svg>
          </button>
        </div>
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
    </div>
  );

  const editModals = (
    <>
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
      <Modal open={!!copyExpensePrefill} onClose={() => setCopyExpensePrefill(null)} title="Copy Expense">
        {copyExpensePrefill && (
          <ManualEntryForm
            key={copyExpensePrefill.id}
            cards={cards}
            onSubmit={handleSaveCopy}
            currentUser={currentUser}
            allUsers={allUsers}
            prefill={copyExpensePrefill}
          />
        )}
      </Modal>
    </>
  );


  return (
    <div className="fixed inset-0 z-50 bg-snap-50 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-snap-50/90 backdrop-blur-sm border-b border-snap-100">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <button type="button" onClick={onClose} className="text-sm font-semibold text-snap-600">
            ← Back
          </button>
          <h1 className="text-base font-bold text-snap-800 flex-1">Reports</h1>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4 space-y-4">
        {/* Pickers row */}
        <div className="flex flex-col md:flex-row gap-4">
          {/* Year picker */}
          <div className="bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(34,197,94,0.08)] shrink-0">
            <p className="text-[11px] font-bold text-skin-secondary uppercase tracking-wide mb-3">Year</p>
            <div className="flex md:flex-col gap-2 flex-wrap">
              {activeYears.map(y => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setYear(y)}
                  className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                    year === y
                      ? "bg-snap-500 text-white border-snap-500"
                      : "bg-white text-snap-600 border-snap-200 hover:border-snap-400"
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>

          {/* Month picker */}
          <div className="bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(34,197,94,0.08)] flex-1">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-bold text-skin-secondary uppercase tracking-wide">Months</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedMonths(
                    activeMonthsForYear.size > 0
                      ? [...activeMonthsForYear].sort((a, b) => a - b)
                      : [1,2,3,4,5,6,7,8,9,10,11,12]
                  )}
                  className="text-[11px] font-semibold text-snap-500 hover:text-snap-700"
                >
                  All
                </button>
                <span className="text-skin-secondary text-[11px]">·</span>
                <button
                  type="button"
                  onClick={() => setSelectedMonths([])}
                  className="text-[11px] font-semibold text-snap-500 hover:text-snap-700"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {MONTH_NAMES
                .map((name, i) => ({ name, m: i + 1 }))
                .filter(({ m }) => activeMonthsForYear.size === 0 || activeMonthsForYear.has(m))
                .map(({ name, m }) => {
                  const active = selectedMonths.includes(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => toggleMonth(m)}
                      className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                        active
                          ? "bg-snap-500 text-white border-snap-500"
                          : "bg-white text-snap-600 border-snap-200 hover:border-snap-400"
                      }`}
                    >
                      {name}
                    </button>
                  );
                })}
            </div>
            {selectedMonths.length > 0 && (
              <p className="text-[11px] text-skin-secondary mt-3">
                {labelForSelection(year, selectedMonths)}
              </p>
            )}
          </div>
        </div>

        {/* Options */}
        <div className="bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(34,197,94,0.08)] space-y-3">
          {/* Person filter */}
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-bold text-skin-secondary uppercase tracking-wide">Person</p>
            <div className="flex flex-wrap gap-1.5">
              {visibleUsers.map(u => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => { setShowAll(false); togglePersonal(u.id); }}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                    !showAll && activePersonal.has(u.id)
                      ? "bg-snap-500 text-white border-snap-500"
                      : "bg-white text-snap-600 border-snap-200 hover:border-snap-400"
                  }`}
                >
                  {u.id === currentUser.id ? "Mine" : u.username}
                </button>
              ))}
              <button
                type="button"
                onClick={() => { setShowAll(false); setShowShared(v => !v); }}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                  !showAll && showShared
                    ? "bg-snap-500 text-white border-snap-500"
                    : "bg-white text-snap-600 border-snap-200 hover:border-snap-400"
                }`}
              >
                Shared
              </button>
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                  showAll
                    ? "bg-snap-500 text-white border-snap-500"
                    : "bg-white text-snap-600 border-snap-200 hover:border-snap-400"
                }`}
              >
                All
              </button>
            </div>

            {!showAll && showShared && allUsers.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-skin-secondary uppercase tracking-wide mb-1">Shared among</p>
                <div className="flex flex-wrap gap-1.5">
                  {allUsers.map(u => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleSharedFilter(u.id)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                        sharedFilter.has(u.id)
                          ? "bg-snap-300 text-snap-900 border-snap-300"
                          : "bg-white text-snap-400 border-snap-200"
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

          <div className="border-t border-snap-100" />

          {/* Exclude loans */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={excludeLoans}
              onChange={e => setExcludeLoans(e.target.checked)}
              className="w-4 h-4 rounded accent-snap-500"
            />
            <span className="text-sm text-snap-700 font-medium">Exclude loans</span>
          </label>
        </div>


        {/* No selection */}
        {selectedMonths.length === 0 && (
          <p className="text-center text-sm text-skin-secondary py-4">Select at least one month to see the report.</p>
        )}

        {loading && (
          <p className="text-center text-sm text-skin-secondary py-8">Loading…</p>
        )}

        {!loading && data && (() => {
          const todayYear = now.getFullYear();
          const todayMonth = now.getMonth() + 1;
          const todayDay = now.getDate();
          const elapsedDays = [...selectedMonths].sort((a,b)=>a-b).reduce((s, m) => {
            if (year < todayYear || (year === todayYear && m < todayMonth))
              return s + new Date(year, m, 0).getDate();
            if (year === todayYear && m === todayMonth)
              return s + todayDay;
            return s;
          }, 0);
          const perDay = elapsedDays > 0 ? data.total / elapsedDays : 0;
          const perTxn = data.count > 0 ? data.total / data.count : 0;
          const toggleableCats = (rawAnalytics?.by_category ?? []).filter(
            row => !(excludeLoans && row.category.toLowerCase() === "loan")
          );
          const allCatsChecked = toggleableCats.every(row => !excludedCategories.has(row.category));
          const someCatsChecked = toggleableCats.some(row => !excludedCategories.has(row.category));
          const allMerchantsChecked = (rawAnalytics?.by_merchant ?? []).every(row => !excludedMerchants.has(row.merchant));
          const someMerchantsChecked = (rawAnalytics?.by_merchant ?? []).some(row => !excludedMerchants.has(row.merchant));
          return (
          <>
            {/* Stats — 4 cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(34,197,94,0.08)]">
                <p className="text-[11px] font-bold text-skin-secondary uppercase tracking-wide mb-1">Total</p>
                <p className="text-2xl font-bold text-snap-800">€{data.total.toFixed(2)}</p>
                <p className="text-xs text-skin-secondary mt-0.5">total spend</p>
              </div>
              <div className="bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(34,197,94,0.08)]">
                <p className="text-[11px] font-bold text-skin-secondary uppercase tracking-wide mb-1">Per day</p>
                <p className="text-2xl font-bold text-snap-800">€{perDay.toFixed(2)}</p>
                <p className="text-xs text-skin-secondary mt-0.5">across {elapsedDays} days</p>
              </div>
              <div className="bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(34,197,94,0.08)]">
                <p className="text-[11px] font-bold text-skin-secondary uppercase tracking-wide mb-1">Avg transaction</p>
                <p className="text-2xl font-bold text-snap-800">€{perTxn.toFixed(2)}</p>
                <p className="text-xs text-skin-secondary mt-0.5">per expense</p>
              </div>
              <div className="bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(34,197,94,0.08)]">
                <p className="text-[11px] font-bold text-skin-secondary uppercase tracking-wide mb-1">Count</p>
                <p className="text-2xl font-bold text-snap-800">{data.count}</p>
                <p className="text-xs text-skin-secondary mt-0.5">{data.count === 1 ? "expense" : "expenses"}</p>
              </div>
            </div>

            {/* Calendar — single month only */}
            {selectedMonths.length === 1 && calendarExpenses && (() => {
              const month = selectedMonths[0];
              const daysInMonth = new Date(year, month, 0).getDate();
              const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7; // Mon=0
              const byDay: Record<number, number> = {};
              calendarExpenses.forEach(e => {
                const d = parseInt(e.date.slice(8, 10), 10);
                byDay[d] = (byDay[d] || 0) + amountFn(e);
              });
              const maxAmt = Math.max(...Object.values(byDay), 1);
              const cells: Array<{ empty: true } | { day: number; amt: number }> = [];
              for (let i = 0; i < firstWeekday; i++) cells.push({ empty: true });
              for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, amt: byDay[d] || 0 });
              while (cells.length % 7 !== 0) cells.push({ empty: true });
              return (
                <div className="bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(34,197,94,0.08)]">
                  <p className="text-[11px] font-bold text-skin-secondary uppercase tracking-wide mb-3">
                    Daily spend — {MONTH_NAMES[month - 1]} {year}
                    <span className="ml-2 font-normal normal-case text-skin-secondary">click a day for details</span>
                  </p>
                  <div className="grid grid-cols-7 gap-1 mb-1">
                    {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(h => (
                      <div key={h} className="text-center text-[10px] font-semibold text-skin-secondary uppercase tracking-wide py-1">{h}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {cells.map((cell, i) => {
                      if ("empty" in cell) return <div key={i} />;
                      const intensity = cell.amt / maxAmt;
                      const heavy = intensity > 0.55;
                      const bg = cell.amt > 0
                        ? `rgba(249,115,22,${(0.08 + intensity * 0.78).toFixed(2)})`
                        : undefined;
                      return (
                        <button
                          key={cell.day}
                          type="button"
                          onClick={() => cell.amt > 0 && setCalendarDrillDay(cell.day)}
                          className={`aspect-square rounded-lg p-1.5 flex flex-col items-center justify-center gap-1 border transition-all ${
                            cell.amt > 0
                              ? calendarDrillDay === cell.day
                                ? "border-snap-500 shadow-[0_0_0_1px_theme(colors.snap.500)] hover:-translate-y-px"
                                : "border-transparent hover:border-snap-300 hover:-translate-y-px cursor-pointer"
                              : "border-transparent cursor-default bg-snap-50"
                          }`}
                          style={bg ? { background: bg } : undefined}
                        >
                          <span className={`text-[11px] font-semibold leading-none ${heavy ? "text-white" : "text-snap-600"}`}>
                            {cell.day}
                          </span>
                          {cell.amt > 0 && (
                            <span className={`text-sm font-bold leading-none text-center ${heavy ? "text-white" : "text-snap-800"}`}>
                              €{Math.round(cell.amt)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Category + Card row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* By Category */}
              {rawAnalytics && rawAnalytics.by_category.length > 0 && (
                <div className="bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(34,197,94,0.08)]">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        ref={el => { if (el) el.indeterminate = someCatsChecked && !allCatsChecked; }}
                        checked={allCatsChecked}
                        onChange={() => {
                          if (allCatsChecked) {
                            setExcludedCategories(new Set(toggleableCats.map(r => r.category)));
                          } else {
                            setExcludedCategories(new Set());
                          }
                        }}
                        className="w-3.5 h-3.5 rounded accent-snap-500 cursor-pointer"
                      />
                      <p className="text-[11px] font-bold text-skin-secondary uppercase tracking-wide">By category</p>
                    </div>
                    <span className="text-xs font-mono text-snap-800 font-semibold">€{data.total.toFixed(2)}</span>
                  </div>
                  <div className="space-y-2">
                    {rawAnalytics.by_category.map((row) => {
                      const isLoanRow = excludeLoans && row.category.toLowerCase() === "loan";
                      const excluded = isLoanRow || excludedCategories.has(row.category);
                      const maxCat = rawAnalytics.by_category[0]?.total ?? 1;
                      return (
                        <div key={row.category} className={`flex items-center gap-2 ${excluded ? "opacity-40" : ""}`}>
                          <input
                            type="checkbox"
                            checked={!excluded}
                            disabled={isLoanRow}
                            onChange={() => { if (!isLoanRow) toggleCategory(row.category); }}
                            className="w-3.5 h-3.5 rounded accent-snap-500 shrink-0 cursor-pointer"
                          />
                          <button
                            type="button"
                            onClick={() => openDrill("category", row.category)}
                            className="flex-1 flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-snap-50 transition-colors min-w-0"
                          >
                            <span className="w-36 text-xs text-skin-primary truncate shrink-0 text-left capitalize">
                              {row.category} <span className="text-skin-secondary">({row.count})</span>
                            </span>
                            <div className="flex-1 bg-snap-100 rounded-full h-1.5">
                              <div
                                className="bg-snap-500 h-1.5 rounded-full"
                                style={{ width: `${(row.total / maxCat) * 100}%` }}
                              />
                            </div>
                            <span className="text-xs font-mono text-snap-800 w-16 text-right shrink-0">
                              {row.total.toFixed(2)}
                            </span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* By Card */}
              {data.by_card.length > 0 && (
                <div className="bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(34,197,94,0.08)]">
                  <p className="text-[11px] font-bold text-skin-secondary uppercase tracking-wide mb-3">By card</p>
                  <div className="space-y-2">
                    {data.by_card.map((row) => (
                      <div key={row.card} className="flex items-center gap-2 px-2 py-1">
                        <span className="w-36 text-xs text-skin-primary truncate shrink-0">{row.card}</span>
                        <div className="flex-1 bg-snap-100 rounded-full h-1.5">
                          <div
                            className="bg-snap-300 h-1.5 rounded-full"
                            style={{ width: `${(row.total / maxCard) * 100}%` }}
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
            </div>

            {/* Merchant + Items row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* By Merchant */}
              {rawAnalytics && rawAnalytics.by_merchant.length > 0 && (
                <div className="bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(34,197,94,0.08)]">
                  <div className="flex items-center gap-2 mb-3">
                    <input
                      type="checkbox"
                      ref={el => { if (el) el.indeterminate = someMerchantsChecked && !allMerchantsChecked; }}
                      checked={allMerchantsChecked}
                      onChange={() => {
                        if (allMerchantsChecked) {
                          setExcludedMerchants(new Set((rawAnalytics?.by_merchant ?? []).map(r => r.merchant)));
                        } else {
                          setExcludedMerchants(new Set());
                        }
                      }}
                      className="w-3.5 h-3.5 rounded accent-snap-500 cursor-pointer"
                    />
                    <p className="text-[11px] font-bold text-skin-secondary uppercase tracking-wide">Top merchants</p>
                  </div>
                  <div className="space-y-2">
                    {rawAnalytics.by_merchant.map((row) => {
                      const excluded = excludedMerchants.has(row.merchant);
                      const maxMer = rawAnalytics.by_merchant[0]?.total ?? 1;
                      return (
                        <div key={row.merchant} className={`flex items-center gap-2 ${excluded ? "opacity-40" : ""}`}>
                          <input
                            type="checkbox"
                            checked={!excluded}
                            onChange={() => toggleMerchant(row.merchant)}
                            className="w-3.5 h-3.5 rounded accent-snap-500 shrink-0 cursor-pointer"
                          />
                          <button
                            type="button"
                            onClick={() => openDrill("merchant", row.merchant)}
                            className="flex-1 flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-snap-50 transition-colors min-w-0"
                          >
                            <span className="flex-1 text-xs text-skin-primary truncate text-left">
                              {row.merchant} <span className="text-skin-secondary">({row.count})</span>
                            </span>
                            <div className="w-24 bg-snap-100 rounded-full h-1.5 shrink-0">
                              <div
                                className="bg-snap-300 h-1.5 rounded-full"
                                style={{ width: `${(row.total / maxMer) * 100}%` }}
                              />
                            </div>
                            <span className="text-xs font-mono text-snap-800 w-16 text-right shrink-0">
                              {row.total.toFixed(2)}
                            </span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Top Items */}
              {data.top_items.length > 0 && (
                <div className="bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(34,197,94,0.08)]">
                  <p className="text-[11px] font-bold text-skin-secondary uppercase tracking-wide mb-3">Top items</p>
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {data.top_items.map((item) => (
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
                  </div>
                </div>
              )}
            </div>

            {/* Transactions toggle */}
            <button
              type="button"
              onClick={() => setShowTxns(true)}
              className="w-full py-3 rounded-[14px] border-2 border-dashed border-snap-200 bg-white text-snap-600 text-[13px] font-semibold text-center hover:bg-snap-50 transition-colors"
            >
              View all {data.count} transactions
            </button>

            {data.count === 0 && (
              <p className="text-center text-sm text-skin-secondary py-4">No expenses in this period.</p>
            )}
          </>
          );
        })()}
      </div>

      {/* Drill-down overlay */}
      {drillMode && drillKey && (
        <div className="fixed inset-0 z-60 bg-snap-50 overflow-y-auto">
          {editModals}
          <div className="sticky top-0 z-10 bg-snap-50/90 backdrop-blur-sm border-b border-snap-100">
            <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
              <button type="button" onClick={closeDrill} className="text-sm font-semibold text-snap-600">
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
          <div className="max-w-5xl mx-auto p-4 space-y-2">
            {drillLoading && <p className="text-center text-sm text-skin-secondary py-8">Loading…</p>}
            {!drillLoading && drillExpenses?.length === 0 && (
              <p className="text-center text-sm text-skin-secondary py-8">No expenses found.</p>
            )}
            {!drillLoading && drillExpenses && drillExpenses.length > 0 && (() => {
              const total = drillExpenses.reduce((s, e) => s + amountFn(e), 0);
              const grouped = drillExpenses.reduce<Record<string, Expense[]>>((acc, exp) => {
                const key = exp.date.substring(0, 7);
                if (!acc[key]) acc[key] = [];
                acc[key].push(exp);
                return acc;
              }, {});
              const months = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
              const multi = months.length > 1;
              return (
                <>
                  <div className="bg-white rounded-[14px] px-4 py-3 shadow-[0_1px_4px_rgba(34,197,94,0.08)] flex justify-between items-center">
                    <span className="text-sm font-semibold text-skin-secondary">Total</span>
                    <span className="text-base font-bold text-snap-700">{total.toFixed(2)}</span>
                  </div>
                  {multi ? months.map(ym => (
                    <div key={ym}>
                      <div className="py-2">
                        <p className="text-[11px] font-bold text-snap-600 uppercase tracking-wide">
                          {new Date(parseInt(ym.split("-")[0]), parseInt(ym.split("-")[1]) - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                        </p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {grouped[ym].map(exp => renderExpenseCard(exp, "drill"))}
                      </div>
                    </div>
                  )) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {drillExpenses.map(exp => renderExpenseCard(exp, "drill"))}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Transactions overlay */}
      {showTxns && (
        <div className="fixed inset-0 z-60 bg-snap-50 overflow-y-auto">
          {editModals}
          <div className="sticky top-0 z-10 bg-snap-50/90 backdrop-blur-sm border-b border-snap-100">
            <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
              <button type="button" onClick={() => setShowTxns(false)} className="text-sm font-semibold text-snap-600">
                ← Back
              </button>
              <h2 className="text-base font-bold text-snap-800 flex-1">Transactions</h2>
              {filteredExpenses && <span className="text-xs text-skin-secondary">{filteredExpenses.length}</span>}
            </div>
            <div className="max-w-5xl mx-auto px-4 pb-3">
              <input
                type="search"
                value={txnSearch}
                onChange={(e) => setTxnSearch(e.target.value)}
                placeholder="Search merchant, category, note…"
                className="form-input text-sm w-full"
              />
            </div>
          </div>
          <div className="max-w-5xl mx-auto p-4 space-y-2">
            {filteredExpenses === null && <p className="text-center text-sm text-skin-secondary py-8">Loading…</p>}
            {filteredExpenses?.length === 0 && (
              <p className="text-center text-sm text-skin-secondary py-8">No transactions found.</p>
            )}
            {filteredExpenses && filteredExpenses.length > 0 && (
              <>
                <div className="bg-white rounded-[14px] px-4 py-3 shadow-[0_1px_4px_rgba(34,197,94,0.08)] flex justify-between items-center">
                  <span className="text-sm font-semibold text-skin-secondary">Total</span>
                  <span className="text-base font-bold text-snap-700">
                    {filteredTxns.reduce((s, e) => s + amountFn(e), 0).toFixed(2)}
                  </span>
                </div>
                {txnMonths.map(ym => (
                  <div key={ym}>
                    <div className="py-2">
                      <p className="text-[11px] font-bold text-snap-600 uppercase tracking-wide">
                        {new Date(parseInt(ym.split("-")[0]), parseInt(ym.split("-")[1]) - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                      </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {groupedTxns[ym].map(exp => renderExpenseCard(exp, "txn"))}
                    </div>
                  </div>
                ))}
                {filteredTxns.length === 0 && txnSearch.trim() && (
                  <p className="text-center text-sm text-skin-secondary py-4">No results match your search.</p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {editModals}

      {/* Calendar day drill modal */}
      {calendarDrillDay !== null && calendarExpenses && (() => {
        const dayExpenses = calendarExpenses.filter(e =>
          parseInt(e.date.slice(8, 10), 10) === calendarDrillDay
        );
        const dayTotal = dayExpenses.reduce((s, e) => s + amountFn(e), 0);
        const month = selectedMonths[0];
        const label = `${MONTH_NAMES[month - 1]} ${calendarDrillDay}, ${year}`;
        return (
          <div
            className="fixed inset-0 z-70 flex items-end md:items-center justify-center p-0 md:p-4"
            style={{ background: "rgba(0,0,0,0.5)" }}
            onClick={() => setCalendarDrillDay(null)}
          >
            <div
              className="bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-snap-100">
                <div>
                  <p className="text-base font-bold text-snap-800">{label}</p>
                  <p className="text-xs text-skin-secondary mt-0.5">
                    {dayExpenses.length} {dayExpenses.length === 1 ? "expense" : "expenses"} · €{dayTotal.toFixed(2)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCalendarDrillDay(null)}
                  className="text-skin-secondary text-xl px-2 py-1 rounded-lg hover:bg-snap-100"
                >
                  &times;
                </button>
              </div>
              <div className="overflow-y-auto p-4 space-y-2">
                {dayExpenses.length === 0 ? (
                  <p className="text-sm text-skin-secondary text-center py-4">No expenses on this day.</p>
                ) : (
                  dayExpenses.map(exp => (
                    <div key={exp.id} className="bg-snap-50 rounded-xl px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-snap-800 truncate">{exp.merchant || exp.category}</p>
                          <p className="text-xs text-skin-secondary mt-0.5 capitalize">{exp.category}{exp.card ? ` · ${exp.card}` : ""}</p>
                          {exp.note && <p className="text-xs text-skin-secondary mt-0.5 italic truncate">{exp.note}</p>}
                        </div>
                        <span className="text-sm font-bold text-snap-800 shrink-0">{exp.total.toFixed(2)}</span>
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
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
