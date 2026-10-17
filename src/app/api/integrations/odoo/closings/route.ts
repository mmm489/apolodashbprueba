import { NextResponse } from "next/server";
import { getSql, hasDatabase, isPosDataSource } from "@/lib/db";
import { closingDateRange, verifyOdooReader } from "@/lib/odoo-reader-auth";
import { hasApoloIdentity, STORED_CLOSINGS_SQL } from "@/lib/odoo-closings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request) {
  if (!verifyOdooReader(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  let range;
  try {
    range = closingDateRange(new URL(request.url));
  } catch {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400, headers });
  }
  if (!hasDatabase() || !isPosDataSource()) {
    return NextResponse.json({ error: "POS source unavailable" }, { status: 503, headers });
  }
  try {
    const rows = await getSql().query(STORED_CLOSINGS_SQL, [range.from, range.to]);
    if (rows.length > 1000) return NextResponse.json({ error: "Narrow the date range" }, { status: 422, headers });
    if (rows.some((row) => !hasApoloIdentity(row))) {
      return NextResponse.json({ error: "Closing company identity missing or different" }, { status: 422, headers });
    }
    return NextResponse.json({
      schema_version: 1, source: "apolo-pos-stored-z", company_vat: "ESB55775068",
      currency: "EUR", timezone: "Europe/Madrid", ...range, closings: rows,
    }, { headers });
  } catch {
    // Do not leak connection strings, SQL details or financial records in errors/logs.
    return NextResponse.json({ error: "Stored closings unavailable" }, { status: 503, headers });
  }
}
