"use client";

import { useState, useEffect, useRef } from "react";

export default function HeaderMenu({
  username,
  isSuperuser,
  onSearch,
  onScanned,
  onAiCosts,
  onReports,
  onUsers,
  onLogout,
}: {
  username: string;
  isSuperuser: boolean;
  onSearch: () => void;
  onScanned: () => void;
  onAiCosts: () => void;
  onReports: () => void;
  onUsers: () => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const item = (label: string, onClick: () => void, danger = false) => (
    <button
      type="button"
      onClick={() => { setOpen(false); onClick(); }}
      className={`w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-snap-50 transition-colors ${danger ? "text-red-500" : "text-snap-800"}`}
    >
      {label}
    </button>
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white border border-snap-200 text-snap-700 hover:bg-snap-50 transition-colors"
        aria-label="Menu"
      >
        <span className="text-[11px] font-semibold truncate max-w-[80px]">{username}</span>
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-snap-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-44 bg-white rounded-2xl shadow-lg border border-snap-100 overflow-hidden z-50">
          {item("Search", onSearch)}
          {item("Reports", onReports)}
          {item("Scanned", onScanned)}
          {item("AI Costs", onAiCosts)}
          {isSuperuser && item("Users", onUsers)}
          <div className="border-t border-snap-100" />
          {item("Log out", onLogout, true)}
        </div>
      )}
    </div>
  );
}
