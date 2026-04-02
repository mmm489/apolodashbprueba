import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  createDocument,
  findDocumentByHash,
  persistExtraction,
  updateDocumentProcessingState,
} from "@/lib/repositories";
import { buildDocumentHash } from "@/lib/utils";

import type { VisionMediaType } from "@/lib/ai/claude";

import { classifyDocument } from "./classifier";
import { extractStructuredData, extractStructuredDataFromImage } from "./extractor";
import { isHourlySpreadsheet, parseHourlySpreadsheetReport } from "./hourly-spreadsheet-parser";
import { isSpreadsheetFile, parseSpreadsheetSalesReport } from "./spreadsheet-parser";

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

export function isImageFile(fileName: string) {
  const lower = fileName.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function getImageMediaType(fileName: string): VisionMediaType {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

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
  const contentHash = buildDocumentHash(input.pdfBuffer);
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
    documentType: isSpreadsheetFile(input.fileName) ? "sales_report" : isImageFile(input.fileName) ? "invoice" : classifyDocument(input.fileName, input.sourcePath),
    status: "processing",
    confidence: 0,
    extractorVersion: "v1",
  });

  const tempFilePath =
    !isSpreadsheetFile(input.fileName) && !isImageFile(input.fileName) && !input.filePath
      ? await writeTemporaryUpload(input.fileName, input.pdfBuffer)
      : null;

  try {
    const extraction = isSpreadsheetFile(input.fileName)
      ? isHourlySpreadsheet(input.pdfBuffer)
        ? parseHourlySpreadsheetReport(input.fileName, input.pdfBuffer)
        : parseSpreadsheetSalesReport(input.fileName, input.pdfBuffer)
      : isImageFile(input.fileName)
        ? await extractStructuredDataFromImage({
            fileName: input.fileName,
            imageBuffer: input.pdfBuffer,
            mediaType: getImageMediaType(input.fileName),
            sourceHint: input.sourcePath,
          })
        : await extractStructuredData({
            filePath: input.filePath ?? tempFilePath ?? undefined,
            fileName: input.fileName,
            pdfBuffer: input.pdfBuffer,
            sourceHint: input.sourcePath,
          });
    const persistError = await persistExtraction(document.id, extraction);
    if (persistError) {
      console.error(`[ingest] persistExtraction error for ${input.fileName}: ${persistError}`);
    }

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
      persistError,
    };
  } finally {
    if (tempFilePath) {
      await rm(tempFilePath, { force: true }).catch(() => undefined);
    }
  }
}

async function writeTemporaryUpload(fileName: string, buffer: Buffer) {
  const tempDir = path.join(os.tmpdir(), "apolo-dashboard-uploads");
  await mkdir(tempDir, { recursive: true });

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const tempFilePath = path.join(tempDir, `${randomUUID()}-${safeName}`);
  await writeFile(tempFilePath, buffer);

  return tempFilePath;
}
