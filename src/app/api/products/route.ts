import { NextResponse } from "next/server";

import { isPosDataSource } from "@/lib/db";
import { listProductCosts, listProductCostHistory, upsertProductCost } from "@/lib/repositories";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const historyFor = searchParams.get("historyFor");
  if (historyFor) {
    const history = await listProductCostHistory(historyFor);
    return NextResponse.json(history);
  }
  const products = await listProductCosts();
  return NextResponse.json(products);
}

export async function PUT(request: Request) {
  if (isPosDataSource()) {
    return NextResponse.json({ error: "Dashboard en modo solo lectura POS" }, { status: 405 });
  }

  const body = await request.json();
  const { productCode, productName, category, unitCost, effectiveFrom } = body;

  if (!productCode || !productName) {
    return NextResponse.json({ error: "Falten camps obligatoris" }, { status: 400 });
  }

  await upsertProductCost({
    productCode: String(productCode),
    productName: String(productName),
    category: String(category ?? "Altres"),
    unitCost: Number(unitCost ?? 0),
    effectiveFrom: effectiveFrom ? String(effectiveFrom) : undefined,
  });

  return NextResponse.json({ ok: true });
}
