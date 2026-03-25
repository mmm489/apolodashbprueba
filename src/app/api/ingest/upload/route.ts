import { NextResponse } from "next/server";

import { ingestPdfBuffer } from "@/lib/ingestion/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const entries = formData.getAll("files");
    const files = entries.filter((entry): entry is File => entry instanceof File);

    if (!files.length) {
      return NextResponse.json({ error: "No se han recibido archivos para procesar." }, { status: 400 });
    }

    const processed = await Promise.all(files.map(processSingleFile));

    const hasErrors = processed.some((item) => item.status === "error");

    return NextResponse.json({
      ok: !hasErrors,
      uploaded: processed.length,
      processed,
    }, { status: hasErrors ? 207 : 200 });
  } catch (error) {
    console.error("Upload ingestion request failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Error inesperado al analizar los documentos.",
      },
      { status: 500 },
    );
  }
}

async function processSingleFile(file: File) {
  try {
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
  } catch (error) {
    console.error(`Upload ingestion failed for ${file.name}:`, error);
    return {
      fileName: file.name,
      duplicated: false,
      status: "error",
      documentType: "unknown",
      error: error instanceof Error ? error.message : "Error desconocido al procesar el archivo",
    };
  }
}
