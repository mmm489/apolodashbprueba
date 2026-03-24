import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { handleTelegramUpdate } from "@/lib/telegram";

export async function POST(request: Request) {
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (env.TELEGRAM_WEBHOOK_SECRET && secret !== env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const payload = (await request.json()) as Record<string, unknown>;
  const result = await handleTelegramUpdate(payload);

  return NextResponse.json(result);
}
