"use client";

import { useState, useEffect } from "react";
import { api, Expense, ExpenseCreate, User } from "@/lib/api";
import Modal from "@/components/Modal";
import EditExpenseForm from "@/components/expenses/EditExpenseForm";
import ManualEntryForm from "@/components/expenses/ManualEntryForm";
import { ANALYTICS_PRESETS, getAnalyticsRange } from "@/components/analytics/AnalyticsPanel";

export default function PersonalPanel({
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
  const [copyExpensePrefill, setCopyExpensePrefill] = useState<Expense | null>(null);

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

  const handleSaveCopy = async (data: ExpenseCreate) => {
    await api.create(data);
    setCopyExpensePrefill(null);
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
      <Modal open={!!copyExpensePrefill} onClose={() => setCopyExpensePrefill(null)} title="Copy Expense">
        {copyExpensePrefill && (
          <ManualEntryForm key={copyExpensePrefill.id} cards={cards} onSubmit={handleSaveCopy} currentUser={currentUser} allUsers={allUsers} prefill={copyExpensePrefill} />
        )}
      </Modal>

      <div className="sticky top-0 z-10 bg-snap-50/90 backdrop-blur-sm border-b border-snap-100">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <button type="button" onClick={onClose} className="text-sm font-semibold text-snap-600">← Back</button>
          <h1 className="text-base font-bold text-snap-800 flex-1">Personal</h1>
          {expenses && <span className="text-xs text-skin-secondary">{expenses.length} expense{expenses.length !== 1 ? "s" : ""}</span>}
        </div>

        {/* Date presets */}
        <div className="max-w-5xl mx-auto px-4 pb-2 flex gap-2">
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
        <div className="max-w-5xl mx-auto px-4 pb-3 space-y-2">
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

      <div className="max-w-5xl mx-auto p-4 space-y-2">
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
                €{expenses.reduce((sum, e) => sum + effectiveAmount(e), 0).toFixed(2)}
              </p>
              <p className="text-xs text-skin-secondary mt-0.5">
                {expenses.length} expense{expenses.length !== 1 ? "s" : ""}
                {expenses.some(e => e.is_shared) && (
                  <> · full total €{expenses.reduce((sum, e) => sum + e.total, 0).toFixed(2)}</>
                )}
              </p>
            </div>

            {expenses.map(exp => {
              const share = effectiveAmount(exp);
              const parts = exp.is_shared ? (exp.shared_with.length || allUsers.length || 1) : 1;
              return (
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
                    <div className="flex flex-col items-end justify-between self-stretch shrink-0 gap-1">
                      <div className="text-right">
                        <p className="text-sm font-mono font-bold text-snap-800">{share.toFixed(2)}</p>
                        {exp.is_shared && (
                          <p className="text-[10px] text-skin-secondary">÷{parts} of {exp.total.toFixed(2)}</p>
                        )}
                      </div>
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
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
