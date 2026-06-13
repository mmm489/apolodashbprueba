import { NextResponse } from "next/server";

import { closeAccountingPeriod } from "@/lib/accounting";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const period = String(body.period ?? "");
    if (!/^\d{4}-\d{2}$/.test(period)) {
      return NextResponse.json({ error: "Periodo inválido." }, { status: 400 });
    }
    await closeAccountingPeriod(period);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Accounting period close failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error cerrando periodo." }, { status: 500 });
  }
}
