"use client";

import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
          credentials: "same-origin",
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data?.error ?? "Contrasenya incorrecta.");
          return;
        }
        // Full page reload so the cookie set by the response is guaranteed
        // to ride along on the next request — router.replace sometimes
        // races with the cookie commit and bounces back to /login.
        window.location.href = next;
      } catch {
        setError("Error de connexió.");
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-sm space-y-5 rounded-3xl border border-[var(--line)] bg-white p-8 shadow-xl"
    >
      <div className="text-center">
        <div className="mx-auto mb-3 inline-flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-400 to-rose-600 text-2xl shadow-lg">
          🍦
        </div>
        <h1 className="text-[22px] font-bold tracking-tight text-slate-900">
          Apolo Dashboard
        </h1>
        <p className="mt-1 text-[13px] text-slate-500">
          Identifica&apos;t per accedir al panell
        </p>
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-slate-500">
          Contrasenya
        </label>
        <input
          id="password"
          type="password"
          autoFocus
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-2.5 text-[15px] outline-none transition focus:border-rose-300 focus:ring-2 focus:ring-rose-500/10"
          placeholder="••••••••"
          disabled={isPending}
        />
      </div>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending || !password}
        className="w-full rounded-xl bg-rose-600 px-4 py-2.5 text-[14px] font-semibold text-white shadow-md transition hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? "Entrant…" : "Entrar"}
      </button>

      <p className="text-center text-[11px] text-slate-400">
        Sessió persistent durant 30 dies en aquest navegador
      </p>
    </form>
  );
}
