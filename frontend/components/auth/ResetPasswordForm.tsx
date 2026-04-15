"use client";

import { useState } from "react";
import { api, User } from "@/lib/api";

export default function ResetPasswordForm({ token, onLoggedIn }: { token: string; onLoggedIn: (u: User) => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (password !== confirm) {
      setErr("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const result = await api.resetPassword(token, password);
      // Auto-login with new password
      const loginResult = await api.login(result.username, password);
      onLoggedIn(loginResult.user);
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message.replace(/^\d+:\s*/, "") : "Failed to reset password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 max-w-lg mx-auto pt-16">
      <h1 className="text-xl font-bold text-snap-800 mb-6 text-center">Receipts</h1>
      <div className="space-y-3 bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(34,197,94,0.08)]">
        <form onSubmit={handleSubmit} className="space-y-3">
          <p className="text-sm font-medium text-snap-800">Set new password</p>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            required
            minLength={6}
            className="form-input w-full"
          />
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm new password"
            required
            minLength={6}
            className="form-input w-full"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 rounded-xl bg-snap-500 text-white text-sm font-semibold disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Set new password"}
          </button>
        </form>
      </div>
    </div>
  );
}
