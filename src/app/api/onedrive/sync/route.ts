import { NextResponse } from "next/server";

import { syncPersonalOneDriveInvoices } from "@/lib/onedrive-personal";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  try {
    const result = await syncPersonalOneDriveInvoices();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: describeError(error) }, { status: 500 });
  }
}

function describeError(error: unknown) {
  return error instanceof Error ? error.message : "Error inesperado al procesar OneDrive.";
}
