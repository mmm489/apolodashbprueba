import { readFile } from "node:fs/promises";
import path from "node:path";

import { createDocument, findDocumentByHash, persistExtraction } from "@/lib/repositories";
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

  return {
    duplicated: false,
    document: {
      ...document,
      documentType: extraction.documentType,
      status: extraction.confidence >= 0.6 ? "validated" : "error",
      confidence: extraction.confidence,
    },
    extraction,
  };
}
