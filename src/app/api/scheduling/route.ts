import { NextResponse } from "next/server";

import {
  deleteEmployeeScheduleShift,
  listEmployeeScheduleShifts,
  upsertEmployeeScheduleShift,
} from "@/lib/repositories";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;

  const shifts = await listEmployeeScheduleShifts(from, to);
  return NextResponse.json(shifts);
}

export async function POST(request: Request) {
  const body = await request.json();
  const rawItems = Array.isArray(body.items) ? body.items : [body];

  try {
    for (const item of rawItems) {
      await upsertEmployeeScheduleShift({
        employeeId: String(item.employeeId ?? ""),
        businessDate: String(item.businessDate ?? ""),
        shiftStart: String(item.shiftStart ?? ""),
        shiftEnd: String(item.shiftEnd ?? ""),
      });
    }

    return NextResponse.json({ ok: true, count: rawItems.length }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se ha podido guardar el turno." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const body = await request.json();
  const employeeId = String(body.employeeId ?? "");
  const businessDate = String(body.businessDate ?? "");

  if (!employeeId || !businessDate) {
    return NextResponse.json({ error: "Faltan campos obligatorios." }, { status: 400 });
  }

  await deleteEmployeeScheduleShift(employeeId, businessDate);
  return NextResponse.json({ ok: true });
}
