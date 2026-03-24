import { NextResponse } from "next/server";
import { z } from "zod";

import { ingestPdf } from "@/lib/ingestion/service";

const schema = z.object({
  filePath: z.string().min(3),
});

export async function POST(request: Request) {
  const body = await request.json();
  const { filePath } = schema.parse(body);
  const result = await ingestPdf(filePath);

  return NextResponse.json(result);
}
