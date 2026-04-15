"use client";

import { useState, useEffect } from "react";
import { api, Expense, ExpenseCreate, User } from "@/lib/api";
import Modal from "@/components/Modal";
import EditExpenseForm from "@/components/expenses/EditExpenseForm";

export default function AllExpensesPanel({
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
