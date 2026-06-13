import { NextResponse } from "next/server";

import { listAccountingAccounts, upsertAccountingAccount } from "@/lib/accounting";
import type { AccountingAccountType } from "@/lib/types";

export const dynamic = "force-dynamic";

const ACCOUNT_TYPES = new Set(["asset", "liability", "equity", "income", "expense"]);

export async function GET() {
  return NextResponse.json({ accounts: await listAccountingAccounts() });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const type = String(body.type ?? "");
    if (!ACCOUNT_TYPES.has(type)) {
      return NextResponse.json({ error: "Tipo de cuenta inválido." }, { status: 400 });
    }
    await upsertAccountingAccount({
      code: String(body.code ?? ""),
      name: String(body.name ?? ""),
      type: type as AccountingAccountType,
      isActive: body.isActive == null ? true : Boolean(body.isActive),
    });
    return NextResponse.json({ ok: true, accounts: await listAccountingAccounts() });
  } catch (error) {
    console.error("Accounting account upsert failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error guardando cuenta." }, { status: 500 });
  }
}
