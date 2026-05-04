"use client";

import { useState } from "react";
import { api, User } from "@/lib/api";

function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await api.forgotPassword(email.trim());
      setDone(true);
    } catch {
      setErr("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 max-w-5xl mx-auto pt-16">
      <h1 className="text-xl font-bold text-snap-800 mb-6 text-center">Receipts</h1>
      <div className="space-y-3 bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(34,197,94,0.08)]">
        {done ? (
          <>
            <p className="text-sm text-snap-700">If an account with that email exists, a reset link has been sent.</p>
            <button
              onClick={onBack}
              className="w-full py-2.5 rounded-xl bg-snap-500 text-white text-sm font-semibold"
            >
              Back to sign in
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <p className="text-sm text-skin-secondary">Enter your email address and we&apos;ll send you a reset link.</p>
            {err && <p className="text-sm text-red-600">{err}</p>}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              required
              className="form-input w-full"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-xl bg-snap-500 text-white text-sm font-semibold disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send reset link"}
            </button>
            <button
              type="button"
              onClick={onBack}
              className="w-full py-2 text-sm text-skin-secondary hover:text-snap-700"
            >
              Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function LoginForm({ onLoggedIn }: { onLoggedIn: (u: User) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  if (showForgot) {
    return <ForgotPasswordForm onBack={() => setShowForgot(false)} />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const r = await api.login(username.trim(), password);
      onLoggedIn(r.user);
    } catch {
      setErr("Invalid username or password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 max-w-5xl mx-auto pt-16">
      <h1 className="text-xl font-bold text-snap-800 mb-6 text-center">Receipts</h1>
      <form onSubmit={handleSubmit} className="space-y-3 bg-white rounded-[14px] p-4 shadow-[0_1px_4px_rgba(34,197,94,0.08)]">
        {err && <p className="text-sm text-red-600">{err}</p>}
        <input
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          required
          className="form-input w-full"
        />
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
          className="form-input w-full"
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full py-2.5 rounded-xl bg-snap-500 text-white text-sm font-semibold disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <button
          type="button"
          onClick={() => setShowForgot(true)}
          className="w-full py-1 text-xs text-skin-secondary hover:text-snap-700"
        >
          Forgot password?
        </button>
      </form>
    </div>
  );
}
