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
                  <p className="text-sm font-semibold text-snap-800 truncate flex items-center gap-1">
                    <span className="truncate">{exp.merchant || exp.category}</span>
                    {exp.receipt_paths.length > 0 && (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 shrink-0 text-snap-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                      </svg>
                    )}
                  </p>
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
