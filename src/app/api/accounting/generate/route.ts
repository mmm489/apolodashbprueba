import { NextResponse } from "next/server";

import { generateAccountingDrafts } from "@/lib/accounting";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const from = cleanDate(body.from);
    const to = cleanDate(body.to);
    if (!from || !to) {
      return NextResponse.json({ error: "Rango de fechas obligatorio." }, { status: 400 });
    }
    const result = await generateAccountingDrafts(from, to);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Accounting draft generation failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error generando borradores." }, { status: 500 });
  }
}

function cleanDate(value: unknown) {
  const text = typeof value === "string" ? value : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}
