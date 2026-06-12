import { NextResponse } from "next/server";

import {
  listEmployeeHourlyCostHistory,
  upsertEmployeeHourlyCost,
} from "@/lib/repositories";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get("employeeId") ?? undefined;
  const history = await listEmployeeHourlyCostHistory(employeeId);
  return NextResponse.json(history);
}

export async function POST(request: Request) {
  const body = await request.json();
  const employeeId = String(body.employeeId ?? "");
  const hourlyCost = Number(body.hourlyCost ?? 0);
  const validFrom = String(body.validFrom ?? "");
  const employeeName = body.employeeName == null ? undefined : String(body.employeeName);

  try {
    await upsertEmployeeHourlyCost({
      employeeId,
      hourlyCost,
      validFrom,
      employeeName,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se ha podido guardar el coste." },
      { status: 400 },
    );
  }
}
