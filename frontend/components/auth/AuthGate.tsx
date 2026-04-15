"use client";

import { useState, useEffect } from "react";
import { api, User } from "@/lib/api";
import LoginForm from "@/components/auth/LoginForm";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";
import ExpensesPage from "@/components/expenses/ExpensesPage";

export default function AuthGate() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [resetToken, setResetToken] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("reset_token");
    if (token) {
      setResetToken(token);
      // Remove token from URL without reload
      const url = new URL(window.location.href);
      url.searchParams.delete("reset_token");
      window.history.replaceState({}, "", url.toString());
      setUser(null);
      return;
    }
    api.me().then(setUser).catch(() => setUser(null));
  }, []);

  if (resetToken) {
    return (
      <ResetPasswordForm
        token={resetToken}
        onLoggedIn={(u) => {
          setResetToken(null);
          setUser(u);
        }}
      />
    );
  }

  if (user === undefined) {
    return (
      <div className="p-8 text-center text-skin-secondary text-sm">Loading…</div>
    );
  }

  if (user === null) {
    return <LoginForm onLoggedIn={setUser} />;
  }

  return (
    <ExpensesPage
      user={user}
      onLogout={async () => {
        await api.logout();
        setUser(null);
      }}
    />
  );
}
