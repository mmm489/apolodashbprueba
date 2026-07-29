import { NextResponse } from "next/server";

import {
  listTimeClockCorrectionRequests,
  reviewTimeClockCorrectionRequest,
} from "@/lib/repositories";
import type { TimeClockCorrectionStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = cleanDate(searchParams.get("from"));
  const to = cleanDate(searchParams.get("to"));
  const statuses = searchParams.getAll("status")
    .filter(isCorrectionStatus) as TimeClockCorrectionStatus[];
  const requests = await listTimeClockCorrectionRequests({
    from,
    to,
    statuses: statuses.length ? statuses : undefined,
  });
  return NextResponse.json({ requests });
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const status = String(body.status ?? "");
    if (status !== "approved" && status !== "rejected") {
      return NextResponse.json({ error: "Decision no valida." }, { status: 400 });
    }
    const correction = await reviewTimeClockCorrectionRequest({
      id: String(body.id ?? ""),
      status,
      reviewNote: body.reviewNote == null ? null : String(body.reviewNote),
      reviewedBy: "dashboard-admin",
    });
    return NextResponse.json({ correction });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se ha podido revisar la solicitud." },
      { status: 400 },
    );
  }
}

function cleanDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function isCorrectionStatus(value: string): value is TimeClockCorrectionStatus {
  return ["pending", "approved", "rejected", "applied", "failed"].includes(value);
}
