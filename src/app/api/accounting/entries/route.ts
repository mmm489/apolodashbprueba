import { NextResponse } from "next/server";

import { validateBalancedDrafts } from "@/lib/accounting";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const from = cleanDate(body.from);
    const to = cleanDate(body.to);
    const result = await validateBalancedDrafts(from ?? undefined, to ?? undefined);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Accounting validation failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error validando asientos." }, { status: 500 });
  }
}

function cleanDate(value: unknown) {
  const text = typeof value === "string" ? value : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}
