import { NextResponse } from "next/server";

import { getPersonalOneDriveStatus } from "@/lib/onedrive-personal";
import { deleteOneDriveConnection } from "@/lib/onedrive-repository";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await getPersonalOneDriveStatus());
  } catch (error) {
    return NextResponse.json({ connected: false, error: describeError(error) }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await deleteOneDriveConnection();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: describeError(error) }, { status: 500 });
  }
}

function describeError(error: unknown) {
  return error instanceof Error ? error.message : "Error inesperado con OneDrive.";
}
