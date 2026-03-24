import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  createDocument,
  findDocumentByHash,
  persistExtraction,
  updateDocumentProcessingState,
} from "@/lib/repositories";
import { buildDocumentHash } from "@/lib/utils";

import { classifyDocument } from "./classifier";
import { extractStructuredData } from "./extractor";
import { isSpreadsheetFile, parseSpreadsheetSalesReport } from "./spreadsheet-parser";

export async function ingestPdf(filePath: string) {
  const fileName = path.basename(filePath);
  const rawContent = await readFile(filePath);
  return ingestPdfBuffer({
    fileName,
    sourcePath: filePath,
    pdfBuffer: rawContent,
    filePath,
  });
}

export async function ingestPdfBuffer(input: {
  fileName: string;
  sourcePath: string;
  pdfBuffer: Buffer;
  filePath?: string;
}) {
  const contentHash = buildDocumentHash(input.fileName, input.pdfBuffer.toString("base64").slice(0, 2048));
  const existing = await findDocumentByHash(contentHash);
  if (existing) {
    return {
      duplicated: true,
      document: existing,
    };
  }

  const document = await createDocument({
    fileName: input.fileName,
    sourcePath: input.sourcePath,
    contentHash,
    documentType: isSpreadsheetFile(input.fileName) ? "sales_report" : classifyDocument(input.fileName, input.sourcePath),
    status: "processing",
    confidence: 0,
    extractorVersion: "v1",
  });

  const extraction = isSpreadsheetFile(input.fileName)
    ? parseSpreadsheetSalesReport(input.fileName, input.pdfBuffer)
    : await extractStructuredData({
        filePath: input.filePath,
        fileName: input.fileName,
        pdfBuffer: input.pdfBuffer,
        sourceHint: input.sourcePath,
      });
  await persistExtraction(document.id, extraction);

  const finalStatus = extraction.confidence >= 0.6 ? "validated" : "error";
  const errorMessage =
    finalStatus === "error"
      ? extraction.documentType === "unknown"
        ? "No se pudo clasificar el documento con suficiente confianza."
        : "No se pudo extraer el documento con suficiente confianza."
      : null;

  await updateDocumentProcessingState({
    documentId: document.id,
    documentType: extraction.documentType,
    status: finalStatus,
    confidence: extraction.confidence,
    errorMessage,
  });

  return {
    duplicated: false,
    document: {
      ...document,
      documentType: extraction.documentType,
      status: finalStatus,
      confidence: extraction.confidence,
      errorMessage,
    },
    extraction,
  };
}
