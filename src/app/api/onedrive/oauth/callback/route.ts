import { type NextRequest, NextResponse } from "next/server";

import { connectPersonalOneDrive, statesMatch } from "@/lib/onedrive-personal";

export const runtime = "nodejs";

const STATE_COOKIE = "apolo_onedrive_oauth_state";

export async function GET(request: NextRequest) {
  const target = new URL("/gastos", request.url);
  const expectedState = request.cookies.get(STATE_COOKIE)?.value;
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  const oauthError = request.nextUrl.searchParams.get("error_description") ?? request.nextUrl.searchParams.get("error");

  try {
    if (oauthError) throw new Error(oauthError);
    if (!statesMatch(expectedState, state)) throw new Error("La autorizacion de OneDrive ha caducado. Intentalo de nuevo.");
    if (!code) throw new Error("Microsoft no ha devuelto el codigo de autorizacion.");

    await connectPersonalOneDrive(code);
    target.searchParams.set("onedrive", "connected");
  } catch (error) {
    target.searchParams.set("onedrive", "error");
    target.searchParams.set("message", describeError(error));
  }

  const response = NextResponse.redirect(target);
  response.cookies.delete(STATE_COOKIE);
  return response;
}

function describeError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 300) : "No se ha podido conectar OneDrive.";
}
