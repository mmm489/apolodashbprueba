import { NextResponse } from "next/server";

import { isPosDataSource } from "@/lib/db";
import { deleteEmployeeShift, listEmployeeShifts, upsertEmployeeShift } from "@/lib/repositories";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const shifts = await listEmployeeShifts(from, to);
  return NextResponse.json(shifts);
}

export async function POST(request: Request) {
  if (isPosDataSource()) {
    return NextResponse.json({ error: "Dashboard en modo solo lectura POS" }, { status: 405 });
  }

  const body = await request.json();
  const { employeeId, businessDate, shiftStart, shiftEnd } = body;

  if (!employeeId || !businessDate || !shiftStart || !shiftEnd) {
    return NextResponse.json({ error: "Falten camps obligatoris" }, { status: 400 });
  }

  await upsertEmployeeShift({
    employeeId: String(employeeId),
    businessDate: String(businessDate),
    shiftStart: String(shiftStart),
    shiftEnd: String(shiftEnd),
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: Request) {
  if (isPosDataSource()) {
    return NextResponse.json({ error: "Dashboard en modo solo lectura POS" }, { status: 405 });
  }

  const body = await request.json();
  const { employeeId, businessDate } = body;

  if (!employeeId || !businessDate) {
    return NextResponse.json({ error: "Falten camps" }, { status: 400 });
  }

  await deleteEmployeeShift(String(employeeId), String(businessDate));
  return NextResponse.json({ ok: true });
}
