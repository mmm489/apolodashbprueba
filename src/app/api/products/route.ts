import { NextResponse } from "next/server";

import { listProductCosts, upsertProductCost } from "@/lib/repositories";

export async function GET() {
  const products = await listProductCosts();
  return NextResponse.json(products);
}

export async function PUT(request: Request) {
  const body = await request.json();
  const { productCode, productName, category, unitCost } = body;

  if (!productCode || !productName) {
    return NextResponse.json({ error: "Falten camps obligatoris" }, { status: 400 });
  }

  await upsertProductCost({
    productCode: String(productCode),
    productName: String(productName),
    category: String(category ?? "Altres"),
    unitCost: Number(unitCost ?? 0),
  });

  return NextResponse.json({ ok: true });
}
