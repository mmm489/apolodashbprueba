/**
 * Lightweight cookie-based auth for the Apolo dashboard.
 *
 * No DB user table: there's a single shared password in AUTH_PASSWORD (or a
 * comma-separated list for several operators). The login route verifies the
 * password and sets a signed cookie; the middleware checks the cookie on
 * every protected route.
 *
 * Cookie format: "<expISO>.<sigHex>" where sigHex = HMAC-SHA256(expISO,
 * AUTH_SECRET). We don't store any user identity — successful sign means
 * "this token was issued by us and hasn't expired".
 *
 * Uses Web Crypto API so this module works in both Node and Edge runtimes
 * (the Next.js middleware runs on Edge).
 */
import { env } from "@/lib/env";

const COOKIE_NAME = "apolo_auth";
const DEFAULT_TTL_DAYS = 30;

export function getAuthCookieName() {
  return COOKIE_NAME;
}

export function isAuthConfigured(): boolean {
  return Boolean(env.AUTH_PASSWORD && env.AUTH_SECRET);
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return [...new Uint8Array(sigBuf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string comparison. Equal length is a precondition; callers
 * must short-circuit when lengths differ to avoid leaking length information
 * via the loop count. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/** Returns true when the supplied plaintext password matches one of the
 * accepted passwords listed in AUTH_PASSWORD. */
export function verifyPassword(input: string): boolean {
  if (!env.AUTH_PASSWORD) return false;
  const candidates = env.AUTH_PASSWORD.split(",").map((p) => p.trim()).filter(Boolean);
  for (const candidate of candidates) {
    if (constantTimeEqual(candidate, input)) return true;
  }
  return false;
}

export async function signToken(ttlDays: number = DEFAULT_TTL_DAYS): Promise<string> {
  if (!env.AUTH_SECRET) throw new Error("AUTH_SECRET is not configured.");
  const expIso = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
  const sig = await hmacHex(env.AUTH_SECRET, expIso);
  return `${expIso}.${sig}`;
}

export async function verifyToken(token: string | undefined): Promise<boolean> {
  if (!token || !env.AUTH_SECRET) return false;
  const dot = token.indexOf(".");
  if (dot < 0) return false;
  const expIso = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmacHex(env.AUTH_SECRET, expIso);
  if (!constantTimeEqual(sig, expected)) return false;
  const expDate = new Date(expIso).getTime();
  if (Number.isNaN(expDate)) return false;
  return expDate > Date.now();
}
