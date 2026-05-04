"use client";

import { useState, useEffect } from "react";
import { todayISO } from "@/lib/dates";
import { api, AnalyticsData, Expense, ExpenseCreate, User } from "@/lib/api";
import Modal from "@/components/Modal";
import EditExpenseForm from "@/components/expenses/EditExpenseForm";
import ManualEntryForm from "@/components/expenses/ManualEntryForm";

export const ANALYTICS_PRESETS = [
  { key: "month", label: "Month" },
  { key: "3m", label: "3 months" },
  { key: "year", label: "Year" },
  { key: "all", label: "All time" },
];

export function getAnalyticsRange(preset: string): { from?: string; to?: string } {
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

export default function AnalyticsPanel({ onClose, cards, currentUser, allUsers }: {
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
  const [drillHistory, setDrillHistory] = useState<Array<{ mode: "category" | "merchant" | "month"; key: string }>>([]);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [copyExpensePrefill, setCopyExpensePrefill] = useState<Expense | null>(null);

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
    setDrillHistory([]);
  };

  const navigateDrill = (mode: "category" | "merchant" | "month", key: string) => {
    if (drillMode && drillKey) {
      setDrillHistory(h => [...h, { mode: drillMode, key: drillKey }]);
    }
    setDrillMode(mode);
    setDrillKey(key);
    fetchDrill(mode, key);
  };

  const goBack = () => {
    if (drillHistory.length > 0) {
      const prev = drillHistory[drillHistory.length - 1];
      setDrillHistory(h => h.slice(0, -1));
      setDrillMode(prev.mode);
      setDrillKey(prev.key);
      fetchDrill(prev.mode, prev.key);
    } else {
      closeDrill();
    }
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

  const handleSaveCopy = async (data: ExpenseCreate) => {
    await api.create(data);
    setCopyExpensePrefill(null);
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
              <p className="text-2xl font-bold text-snap-800">€{data.total.toFixed(2)}</p>
              <p className="text-xs text-skin-secondary mt-0.5">
                {data.count} {data.count === 1 ? "expense" : "expenses"}
                {data.count > 0 && ` · avg €${(data.total / data.count).toFixed(2)}`}
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
          <Modal open={!!copyExpensePrefill} onClose={() => setCopyExpensePrefill(null)} title="Copy Expense">
            {copyExpensePrefill && (
              <ManualEntryForm key={copyExpensePrefill.id} cards={cards} onSubmit={handleSaveCopy} currentUser={currentUser} allUsers={allUsers} prefill={copyExpensePrefill} />
            )}
          </Modal>

          <div className="sticky top-0 z-10 bg-snap-50/90 backdrop-blur-sm border-b border-snap-100">
            <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
              <button
                type="button"
                onClick={goBack}
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
                      {drillMode !== "merchant" && exp.merchant ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); navigateDrill("merchant", exp.merchant!); }}
                          className="text-sm font-semibold text-snap-600 underline underline-offset-2 truncate max-w-full text-left hover:text-snap-800"
                        >
                          {exp.merchant}
                        </button>
                      ) : (
                        <p className="text-sm font-semibold text-snap-800 truncate">{exp.merchant || exp.category}</p>
                      )}
                      <p className="text-xs text-skin-secondary mt-0.5">{exp.date}{exp.card ? ` · ${exp.card}` : ""}</p>
                      {exp.note && <p className="text-xs text-skin-secondary mt-0.5 italic">{exp.note}</p>}
                      {exp.ai_cost != null && <p className="text-[10px] text-skin-secondary mt-0.5">AI cost: ${exp.ai_cost.toFixed(4)}</p>}
                    </div>
                    <div className="flex flex-col items-end justify-between self-stretch shrink-0 gap-1">
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
