import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { syncPersonalOneDriveInvoices } from "@/lib/onedrive-personal";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  return runCron(request);
}

export async function POST(request: Request) {
  return runCron(request);
}

async function runCron(request: Request) {
  if (!env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const madridHour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Madrid",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .find((part) => part.type === "hour")?.value,
  );

  if (madridHour >= 1 && madridHour < 7) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "closed-hours",
      message: "OneDrive no se sincroniza entre 01:00 y 07:00 Europe/Madrid.",
    });
  }

  try {
    const result = await syncPersonalOneDriveInvoices();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Error inesperado al procesar OneDrive." },
      { status: 500 },
    );
  }
}
