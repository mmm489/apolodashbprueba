import { Suspense } from "react";

import { LoginForm } from "./login-form";

/**
 * Server-component wrapper. The actual form is a client component because it
 * uses useSearchParams() to read ?next=… and we must wrap it in <Suspense>
 * so Next.js can statically prerender this route without bailing out.
 */
export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-rose-50 via-white to-amber-50 p-6">
      <Suspense fallback={<div className="text-[13px] text-slate-400">Carregant…</div>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
