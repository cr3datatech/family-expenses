"use client";

import { useState, useEffect } from "react";
import { api, AiCostsData, Expense, ExpenseCreate, User } from "@/lib/api";
import Modal from "@/components/Modal";
import EditExpenseForm from "@/components/expenses/EditExpenseForm";

export default function AiCostsPanel({ onClose, cards, currentUser, allUsers }: {
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
