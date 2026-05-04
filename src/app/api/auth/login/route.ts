import { NextResponse } from "next/server";

import { getAuthCookieName, isAuthConfigured, signToken, verifyPassword } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isAuthConfigured()) {
    return NextResponse.json(
      { error: "Auth no configurat al servidor (AUTH_PASSWORD / AUTH_SECRET)." },
      { status: 503 },
    );
  }

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invàlid." }, { status: 400 });
  }

  const password = String(body.password ?? "");
  if (!verifyPassword(password)) {
    // Constant-ish 250ms wait so wrong/right responses are harder to time-distinguish.
    await new Promise((r) => setTimeout(r, 250));
    return NextResponse.json({ error: "Contrasenya incorrecta." }, { status: 401 });
  }

  const token = await signToken();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(getAuthCookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return response;
}
