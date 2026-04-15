"use client";

import { ToastProvider } from "@/components/Toast";
import AuthGate from "@/components/auth/AuthGate";

export default function HomePage() {
  return (
    <ToastProvider>
      <AuthGate />
    </ToastProvider>
  );
}
