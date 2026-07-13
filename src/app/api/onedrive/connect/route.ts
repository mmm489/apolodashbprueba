import { NextResponse } from "next/server";

import { buildOneDriveAuthorizeUrl, createOneDriveOAuthState } from "@/lib/onedrive-personal";

export const runtime = "nodejs";

const STATE_COOKIE = "apolo_onedrive_oauth_state";

export async function GET(request: Request) {
  try {
    const state = createOneDriveOAuthState();
    const response = NextResponse.redirect(buildOneDriveAuthorizeUrl(state));
    response.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60,
    });
    return response;
  } catch (error) {
    const url = new URL("/gastos", request.url);
    url.searchParams.set("onedrive", "configuration-error");
    url.searchParams.set("message", describeError(error));
    return NextResponse.redirect(url);
  }
}

function describeError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 300) : "No se ha podido iniciar la conexion con OneDrive.";
}
