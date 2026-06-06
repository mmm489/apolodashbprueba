import { NextResponse } from "next/server";

import { createEmployee, deleteEmployee, listEmployees, updateEmployee } from "@/lib/repositories";

export async function GET() {
  const employees = await listEmployees();
  return NextResponse.json(employees);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { name, shiftStart, shiftEnd, workingDaysPerMonth } = body;

  if (!name) {
    return NextResponse.json({ error: "Falta el nombre" }, { status: 400 });
  }

  try {
    const employee = await createEmployee({
      name: String(name),
      shiftStart: String(shiftStart ?? "00:00"),
      shiftEnd: String(shiftEnd ?? "00:00"),
      workingDaysPerMonth: Number(workingDaysPerMonth ?? 0),
      hourlyCost: Number(body.hourlyCost ?? 0),
      pin: body.pin == null ? undefined : String(body.pin),
      role: body.role === "admin" ? "admin" : "employee",
      canAccessCashlogy: body.canAccessCashlogy == null ? undefined : Boolean(body.canAccessCashlogy),
      canAccessSupplierPayments: body.canAccessSupplierPayments == null ? undefined : Boolean(body.canAccessSupplierPayments),
      canAccessProducts: body.canAccessProducts == null ? undefined : Boolean(body.canAccessProducts),
    });

    return NextResponse.json(employee, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error creando empleado" },
      { status: 400 },
    );
  }
}

export async function PUT(request: Request) {
  const body = await request.json();
  const { id, name, shiftStart, shiftEnd, workingDaysPerMonth } = body;

  if (!id || !name) {
    return NextResponse.json({ error: "Faltan campos obligatorios" }, { status: 400 });
  }

  try {
    await updateEmployee(String(id), {
      name: String(name),
      shiftStart: String(shiftStart ?? "00:00"),
      shiftEnd: String(shiftEnd ?? "00:00"),
      workingDaysPerMonth: Number(workingDaysPerMonth ?? 0),
      hourlyCost: Number(body.hourlyCost ?? 0),
      pin: body.pin == null ? undefined : String(body.pin),
      role: body.role === "admin" ? "admin" : "employee",
      canAccessCashlogy: body.canAccessCashlogy == null ? undefined : Boolean(body.canAccessCashlogy),
      canAccessSupplierPayments: body.canAccessSupplierPayments == null ? undefined : Boolean(body.canAccessSupplierPayments),
      canAccessProducts: body.canAccessProducts == null ? undefined : Boolean(body.canAccessProducts),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error actualizando empleado" },
      { status: 400 },
    );
  }
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
