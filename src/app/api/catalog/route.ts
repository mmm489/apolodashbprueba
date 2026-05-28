import { NextResponse } from "next/server";

import { listPosCatalog } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export async function GET() {
  const catalog = await listPosCatalog();
  return NextResponse.json(catalog);
}
