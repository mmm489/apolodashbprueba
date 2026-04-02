import { NextResponse } from "next/server";

import { createEmployee, deleteEmployee, listEmployees, updateEmployee } from "@/lib/repositories";

export async function GET() {
  const employees = await listEmployees();
  return NextResponse.json(employees);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { name, shiftStart, shiftEnd, workingDaysPerMonth } = body;

  if (!name || !shiftStart || !shiftEnd || !workingDaysPerMonth) {
    return NextResponse.json({ error: "Faltan campos obligatorios" }, { status: 400 });
  }

  const employee = await createEmployee({
    name: String(name),
    shiftStart: String(shiftStart),
    shiftEnd: String(shiftEnd),
    workingDaysPerMonth: Number(workingDaysPerMonth),
    hourlyCost: Number(body.hourlyCost ?? 0),
  });

  return NextResponse.json(employee, { status: 201 });
}

export async function PUT(request: Request) {
  const body = await request.json();
  const { id, name, shiftStart, shiftEnd, workingDaysPerMonth } = body;

  if (!id || !name || !shiftStart || !shiftEnd || !workingDaysPerMonth) {
    return NextResponse.json({ error: "Faltan campos obligatorios" }, { status: 400 });
  }

  await updateEmployee(String(id), {
    name: String(name),
    shiftStart: String(shiftStart),
    shiftEnd: String(shiftEnd),
    workingDaysPerMonth: Number(workingDaysPerMonth),
    hourlyCost: Number(body.hourlyCost ?? 0),
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const body = await request.json();
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: "Falta el id" }, { status: 400 });
  }

  await deleteEmployee(String(id));
  return NextResponse.json({ ok: true });
}
