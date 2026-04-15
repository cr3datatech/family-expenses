"use client";

import { useState } from "react";
import { api, User } from "@/lib/api";

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
  );
}

export default function EditUserModal({ user, currentId, onSaved, onClose }: { user: User; currentId: number; onSaved: () => void; onClose: () => void }) {
  const [email, setEmail] = useState(user.email ?? "");
  const [password, setPassword] = useState("");
  const [isSuper, setIsSuper] = useState(user.is_superuser);
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const updates: { email?: string; password?: string; is_superuser?: boolean } = {
        email: email.trim() || undefined,
        is_superuser: isSuper,
      };
      if (password) updates.password = password;
      await api.updateUser(user.id, updates);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this user? They must have no attributed expenses.")) return;
    setBusy(true);
    try {
      await api.deleteUser(user.id);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete user");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-3">
      <div className="px-3 py-2 rounded-xl bg-snap-50 border border-snap-100">
        <p className="text-[11px] text-skin-secondary">Username</p>
        <p className="text-sm font-semibold text-snap-800">{user.username}</p>
      </div>
      <input
        className="form-input w-full"
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <div className="relative">
        <input
          className="form-input w-full pr-9"
          type={showPw ? "text" : "password"}
          placeholder="New password (leave blank to keep)"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-snap-400 hover:text-snap-600" tabIndex={-1}>
          <EyeIcon open={showPw} />
        </button>
      </div>
      <label className="flex items-center gap-2 text-sm text-snap-700 cursor-pointer">
        <input type="checkbox" checked={isSuper} onChange={(e) => setIsSuper(e.target.checked)} />
        Superuser
      </label>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onClose} className="flex-1 py-2 rounded-xl border border-snap-200 text-sm text-snap-600 font-semibold">Cancel</button>
        <button type="submit" disabled={busy} className="flex-1 py-2 rounded-xl bg-snap-500 text-white text-sm font-semibold disabled:opacity-50">
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      {user.id !== currentId && (
        <button type="button" disabled={busy} onClick={handleDelete} className="w-full py-1.5 text-xs text-red-600 font-semibold">
          Delete user
        </button>
      )}
    </form>
  );
}
