"use client";

import { useState, useEffect } from "react";
import { api, Expense } from "@/lib/api";

export default function ExpensePickerModal({ title, onSelect, onClose }: {
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
              <p className="text-[10px] text-skin-secondary">{exp.date} · €{exp.total.toFixed(2)} · {exp.category}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
