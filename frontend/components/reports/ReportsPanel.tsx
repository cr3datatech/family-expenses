"use client";

import { useState, useEffect } from "react";
import { api, AnalyticsData, Expense, ExpenseCreate, User } from "@/lib/api";
import Modal from "@/components/Modal";
import EditExpenseForm from "@/components/expenses/EditExpenseForm";
import ManualEntryForm from "@/components/expenses/ManualEntryForm";

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function getAvailableYears(): number[] {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = currentYear; y >= currentYear - 4; y--) years.push(y);
  return years;
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
  const [year, setYear] = useState(now.getFullYear());
  const [selectedMonths, setSelectedMonths] = useState<number[]>([now.getMonth() + 1]);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);

  const [drillMode, setDrillMode] = useState<"category" | "merchant" | null>(null);
  const [drillKey, setDrillKey] = useState<string | null>(null);
  const [drillExpenses, setDrillExpenses] = useState<Expense[] | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);

  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [copyExpensePrefill, setCopyExpensePrefill] = useState<Expense | null>(null);

  const [showTxns, setShowTxns] = useState(false);
  const [txns, setTxns] = useState<Expense[] | null>(null);
  const [txnsLoading, setTxnsLoading] = useState(false);
  const [txnSearch, setTxnSearch] = useState("");

  const [excludeLoans, setExcludeLoans] = useState(true);

  const [calendarExpenses, setCalendarExpenses] = useState<Expense[] | null>(null);
  const [calendarDrillDay, setCalendarDrillDay] = useState<number | null>(null);

  const range = computeRange(year, selectedMonths);

  useEffect(() => {
    if (!range) { setData(null); return; }
    setLoading(true);
    setData(null);
    api.analytics(range.from, range.to)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, selectedMonths.join(",")]);

  useEffect(() => {
    setCalendarDrillDay(null);
    if (!range || selectedMonths.length !== 1) { setCalendarExpenses(null); return; }
    api.list(undefined, undefined, undefined, undefined, range.from, range.to)
      .then(setCalendarExpenses)
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, selectedMonths.join(",")]);

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

  const openTxns = () => {
    if (!range) return;
    setShowTxns(true);
    setTxnsLoading(true);
    setTxns(null);
    api.list(undefined, undefined, undefined, undefined, range.from, range.to)
      .then(setTxns)
      .catch(() => {})
      .finally(() => setTxnsLoading(false));
  };

  const handleEditSave = async (data: ExpenseCreate) => {
    if (!editingExpense) return;
    await api.update(editingExpense.id, data);
    setEditingExpense(null);
    refreshDrill();
    if (showTxns && range) {
      api.list(undefined, undefined, undefined, undefined, range.from, range.to).then(setTxns).catch(() => {});
    }
  };

  const handleDelete = async (id: number, deleteArchive = false) => {
    await api.delete(id, deleteArchive);
    setEditingExpense(null);
    refreshDrill();
  };

  const handleSaveCopy = async (data: ExpenseCreate) => {
    await api.create(data);
    setCopyExpensePrefill(null);
    refreshDrill();
  };

  const displayCategoriesOuter = (excludeLoans && data)
    ? data.by_category.filter(r => r.category.toLowerCase() !== "loan")
    : data?.by_category ?? [];
  const maxCategory = displayCategoriesOuter[0]?.total ?? 1;
  const maxMerchant = data?.by_merchant[0]?.total ?? 1;
  const maxCard = data?.by_card[0]?.total ?? 1;

  const filteredTxns = (txns ?? []).filter(e => {
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
              {getAvailableYears().map(y => (
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
                  onClick={() => setSelectedMonths([1,2,3,4,5,6,7,8,9,10,11,12])}
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
            <div className="grid grid-cols-6 md:grid-cols-12 gap-2">
              {MONTH_NAMES.map((name, i) => {
                const m = i + 1;
                const active = selectedMonths.includes(m);
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleMonth(m)}
                    className={`py-2 rounded-xl text-sm font-semibold border transition-colors ${
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
        <div className="flex items-center gap-3 px-1">
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
          const loanRow = data.by_category.find(r => r.category.toLowerCase() === "loan");
          const loanTotal = loanRow?.total ?? 0;
          const loanCount = loanRow?.count ?? 0;
          const displayTotal = excludeLoans ? data.total - loanTotal : data.total;
          const displayCount = excludeLoans ? data.count - loanCount : data.count;
          const displayCategories = excludeLoans
            ? data.by_category.filter(r => r.category.toLowerCase() !== "loan")
            : data.by_category;
          const totalDays = [...selectedMonths].sort((a,b)=>a-b).reduce((s,m) => s + new Date(year,m,0).getDate(), 0);
          const perDay = totalDays > 0 ? displayTotal / totalDays : 0;
          const perTxn = displayCount > 0 ? displayTotal / displayCount : 0;
          return (
          <>
            {/* Stats — 4 cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(34,197,94,0.08)]">
                <p className="text-[11px] font-bold text-skin-secondary uppercase tracking-wide mb-1">Total</p>
                <p className="text-2xl font-bold text-snap-800">€{displayTotal.toFixed(2)}</p>
                <p className="text-xs text-skin-secondary mt-0.5">total spend</p>
              </div>
              <div className="bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(34,197,94,0.08)]">
                <p className="text-[11px] font-bold text-skin-secondary uppercase tracking-wide mb-1">Per day</p>
                <p className="text-2xl font-bold text-snap-800">€{perDay.toFixed(2)}</p>
                <p className="text-xs text-skin-secondary mt-0.5">across {totalDays} days</p>
              </div>
              <div className="bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(34,197,94,0.08)]">
                <p className="text-[11px] font-bold text-skin-secondary uppercase tracking-wide mb-1">Avg transaction</p>
                <p className="text-2xl font-bold text-snap-800">€{perTxn.toFixed(2)}</p>
                <p className="text-xs text-skin-secondary mt-0.5">per expense</p>
              </div>
              <div className="bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(34,197,94,0.08)]">
                <p className="text-[11px] font-bold text-skin-secondary uppercase tracking-wide mb-1">Count</p>
                <p className="text-2xl font-bold text-snap-800">{displayCount}</p>
                <p className="text-xs text-skin-secondary mt-0.5">{data.count === 1 ? "expense" : "expenses"}</p>
              </div>
            </div>

            {/* Calendar — single month only */}
            {selectedMonths.length === 1 && calendarExpenses && (() => {
              const filteredCalendar = excludeLoans
                ? calendarExpenses.filter(e => e.category.toLowerCase() !== "loan")
                : calendarExpenses;
              const month = selectedMonths[0];
              const daysInMonth = new Date(year, month, 0).getDate();
              const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7; // Mon=0
              const byDay: Record<number, number> = {};
              filteredCalendar.forEach(e => {
                const d = parseInt(e.date.slice(8, 10), 10);
                byDay[d] = (byDay[d] || 0) + e.total;
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
                          onClick={() => setCalendarDrillDay(cell.day)}
                          className={`aspect-square rounded-lg p-1.5 flex flex-col items-center justify-center gap-1 border transition-all hover:-translate-y-px ${
                            calendarDrillDay === cell.day
                              ? "border-snap-500 shadow-[0_0_0_1px_theme(colors.snap.500)]"
                              : "border-transparent hover:border-snap-300"
                          } ${cell.amt === 0 ? "bg-snap-50" : ""}`}
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
              {displayCategories.length > 0 && (
                <div className="bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(34,197,94,0.08)]">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[11px] font-bold text-skin-secondary uppercase tracking-wide">By category</p>
                    <span className="text-xs font-mono text-snap-800 font-semibold">€{displayTotal.toFixed(2)}</span>
                  </div>
                  <div className="space-y-2">
                    {displayCategories.map((row) => (
                      <button
                        key={row.category}
                        type="button"
                        onClick={() => openDrill("category", row.category)}
                        className="w-full flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-snap-50 transition-colors"
                      >
                        <span className="w-36 text-xs text-skin-primary truncate shrink-0 text-left capitalize">
                          {row.category} <span className="text-skin-secondary">({row.count})</span>
                        </span>
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
                        <span className="flex-1 text-xs text-skin-primary truncate text-left">
                          {row.merchant} <span className="text-skin-secondary">({row.count})</span>
                        </span>
                        <div className="w-24 bg-snap-100 rounded-full h-1.5 shrink-0">
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
              onClick={openTxns}
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
              const total = drillExpenses.reduce((s, e) => s + e.total, 0);
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
              {txns && <span className="text-xs text-skin-secondary">{txns.length}</span>}
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
            {txnsLoading && <p className="text-center text-sm text-skin-secondary py-8">Loading…</p>}
            {!txnsLoading && txns?.length === 0 && (
              <p className="text-center text-sm text-skin-secondary py-8">No transactions found.</p>
            )}
            {!txnsLoading && txns && txns.length > 0 && (
              <>
                <div className="bg-white rounded-[14px] px-4 py-3 shadow-[0_1px_4px_rgba(34,197,94,0.08)] flex justify-between items-center">
                  <span className="text-sm font-semibold text-skin-secondary">Total</span>
                  <span className="text-base font-bold text-snap-700">
                    {filteredTxns.reduce((s, e) => s + e.total, 0).toFixed(2)}
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
          parseInt(e.date.slice(8, 10), 10) === calendarDrillDay &&
          !(excludeLoans && e.category.toLowerCase() === "loan")
        );
        const dayTotal = dayExpenses.reduce((s, e) => s + e.total, 0);
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
