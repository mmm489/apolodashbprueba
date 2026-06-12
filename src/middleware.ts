import { NextResponse, type NextRequest } from "next/server";

import { getAuthCookieName, isAuthConfigured, verifyToken } from "@/lib/auth";

/**
 * Gates the dashboard behind a single shared password (AUTH_PASSWORD env).
 *
 * Public exceptions (always allowed without auth):
 *  - /login              the login form
 *  - /api/auth/*         the login/logout API itself
 *  - /api/telegram/*     Telegram servers POST here, no cookie possible
 *  - /api/public-schedule/* employee schedule JSON, protected by private token
 *  - /api/ingest/microsoft-graph  external webhook with its own secret
 *  - /mi-horario/*       employee schedule view, protected by private token
 *  - /horario/*          legacy redirect to /mi-horario/*
 *  - /icon.svg, /favicon.ico, /_next/* assets
 *
 * If AUTH_PASSWORD or AUTH_SECRET is unset the middleware does nothing —
 * this keeps local dev easy and makes accidental misconfiguration in
 * production fail loud (the env vars must be set on Vercel).
 */
const PUBLIC_PATH_PREFIXES = [
  "/login",
  "/api/auth",
  "/api/telegram",
  "/api/public-schedule",
  "/api/ingest/microsoft-graph",
  "/mi-horario",
  "/horario",
];

const PUBLIC_FILES = new Set(["/icon.svg", "/favicon.ico"]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_FILES.has(pathname)) return true;
  if (pathname.startsWith("/_next/")) return true;
  for (const prefix of PUBLIC_PATH_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return true;
  }
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isAuthConfigured()) return NextResponse.next();
  if (isPublic(pathname)) return NextResponse.next();

  const token = request.cookies.get(getAuthCookieName())?.value;
  const ok = await verifyToken(token);
  if (ok) return NextResponse.next();

  // API requests get a JSON 401 so the client can react. Page navigations
  // get redirected to /login with a `next` param so the user lands back on
  // the page they wanted after logging in.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Run on every path except statics that never need auth (saves edge cycles).
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
