import { NextResponse } from "next/server";

import { isPosDataSource } from "@/lib/db";
import { env } from "@/lib/env";
import { syncOneDrivePdfs } from "@/lib/ingestion/microsoft-graph-sync";

function isAuthorized(request: Request) {
  if (!env.INGESTION_WEBHOOK_SECRET) {
    return true;
  }

  const headerSecret = request.headers.get("x-ingestion-secret");
  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret");

  return headerSecret === env.INGESTION_WEBHOOK_SECRET || querySecret === env.INGESTION_WEBHOOK_SECRET;
}

export async function POST(request: Request) {
  if (isPosDataSource()) {
    return NextResponse.json({ error: "Dashboard en modo solo lectura POS" }, { status: 405 });
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const result = await syncOneDrivePdfs();
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(request: Request) {
  return POST(request);
}
