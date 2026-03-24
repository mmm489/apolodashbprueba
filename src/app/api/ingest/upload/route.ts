import { NextResponse } from "next/server";

import { ingestPdfBuffer } from "@/lib/ingestion/service";

export async function POST(request: Request) {
  const formData = await request.formData();
  const entries = formData.getAll("files");
  const files = entries.filter((entry): entry is File => entry instanceof File);

  if (!files.length) {
    return NextResponse.json({ error: "No se han recibido PDFs." }, { status: 400 });
  }

  const processed = await Promise.all(
    files.map(async (file) => {
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await ingestPdfBuffer({
        fileName: file.name,
        sourcePath: `/uploads/${file.name}`,
        pdfBuffer: buffer,
      });

      return {
        fileName: file.name,
        duplicated: result.duplicated,
        status: result.document.status,
        documentType: result.document.documentType,
      };
    }),
  );

  return NextResponse.json({
    ok: true,
    uploaded: processed.length,
    processed,
  });
}
