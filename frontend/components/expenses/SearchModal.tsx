"use client";

import { Expense } from "@/lib/api";

export default function SearchModal({ query, results, loading, onQueryChange, onSelect }: {
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
                  €{exp.total.toFixed(2)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
