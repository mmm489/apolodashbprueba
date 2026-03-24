import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { PDFParse } from "pdf-parse";
import { createWorker } from "tesseract.js";
import { z } from "zod";

import { askClaudeForStructuredData, askClaudeFromPdf } from "@/lib/ai/claude";
import { env } from "@/lib/env";
import { classifyDocument } from "@/lib/ingestion/classifier";
import type { BankTransaction, ExtractionResult, HourlySalesEntry, InvoiceRecord, PayrollRecord, SalesReport } from "@/lib/types";

const salesSchema = z.object({
  businessDate: z.string(),
  totalSales: z.number(),
  orderCount: z.number(),
  averageTicket: z.number(),
  paymentMix: z.record(z.string(), z.number()),
});

const invoiceSchema = z.object({
  supplierName: z.string(),
  issueDate: z.string(),
  dueDate: z.string().nullable().optional(),
  totalAmount: z.number(),
  taxAmount: z.number(),
  category: z.string(),
});

const payrollSchema = z.object({
  employeeName: z.string(),
  payPeriod: z.string(),
  grossAmount: z.number(),
  netAmount: z.number(),
});

const hourlySchema = z.array(
  z.object({
    businessDate: z.string(),
    hour: z.string(),
    sales: z.number(),
    orderCount: z.number(),
  }),
);

const bankSchema = z.array(
  z.object({
    bookedAt: z.string(),
    concept: z.string(),
    amount: z.number(),
    direction: z.enum(["in", "out"]),
    category: z.string(),
  }),
);

export async function extractPdfTextFromBuffer(buffer: Buffer) {
  const parser = new PDFParse({ data: buffer });
  const parsed = await parser.getText();
  await parser.destroy();
  return parsed.text.trim();
}

export async function extractPdfText(filePath: string) {
  const buffer = await readFile(filePath);
  return extractPdfTextFromBuffer(buffer);
}

export async function runOcrFallback(filePath: string) {
  const worker = await createWorker(env.OCR_LANG);
  const result = await worker.recognize(filePath);
  await worker.terminate();
  return result.data.text.trim();
}

export async function extractStructuredData(params: {
  filePath?: string;
  fileName: string;
  pdfBuffer?: Buffer;
  sourceHint?: string;
}): Promise<ExtractionResult> {
  const pdfBuffer = params.pdfBuffer ?? (params.filePath ? await readFile(params.filePath) : null);
  let nativeText = "";
  try {
    nativeText = pdfBuffer ? await extractPdfTextFromBuffer(pdfBuffer) : "";
  } catch {
    nativeText = "";
  }

  const initialType = classifyDocument(params.fileName, `${params.sourceHint ?? ""} ${nativeText}`);

  if (nativeText.length > 120) {
    const structured = await tryClaudeExtraction(params.fileName, nativeText, "native-text", initialType);
    if (structured) {
      return structured;
    }
  }

  const visionStructured =
    pdfBuffer &&
    (await tryClaudePdfExtraction(
      params.fileName,
      pdfBuffer,
      params.sourceHint ?? "",
      "claude-vision",
      initialType,
    ));

  if (visionStructured) {
    return visionStructured;
  }

  if (params.filePath) {
    const ocrText = await runOcrFallback(params.filePath);
    const ocrType = classifyDocument(params.fileName, `${params.sourceHint ?? ""} ${nativeText}\n${ocrText}`);
    const ocrStructured = await tryClaudeExtraction(params.fileName, ocrText, "ocr-fallback", ocrType);

    if (ocrStructured) {
      return ocrStructured;
    }

    return {
      documentType: initialType,
      confidence: 0.4,
      strategy: "ocr-fallback",
      summary: "No se pudo estructurar automaticamente; revisar el documento.",
      normalizedData: {
        fileName: params.fileName,
        extractedTextPreview: (nativeText || ocrText || "Sin contenido legible").slice(0, 500),
      },
    };
  }

  return {
    documentType: initialType,
    confidence: 0.4,
    strategy: "claude-vision",
    summary: "No se pudo estructurar automaticamente; revisar el documento.",
    normalizedData: {
      fileName: params.fileName,
      extractedTextPreview: (nativeText || "Sin contenido legible").slice(0, 500),
    },
  };
}

async function tryClaudeExtraction(
  fileName: string,
  documentText: string,
  strategy: ExtractionResult["strategy"],
  documentType = classifyDocument(fileName, documentText),
) {
  const prompt = [
    "Clasifica y estructura este documento de heladeria.",
    `Tipo previsto: ${documentType}.`,
    "Si falta algun dato, usa null o valores conservadores, nunca inventes importes.",
    'Devuelve JSON con forma { "documentType": "...", "confidence": 0.0-1.0, "summary": "...", "normalizedData": ... }.',
    "Documento:",
    documentText.slice(0, 12000),
  ].join("\n\n");

  const response = await askClaudeForStructuredData(prompt);
  if (!response) {
    return null;
  }

  try {
    const parsed = JSON.parse(response) as {
      documentType?: ExtractionResult["documentType"];
      confidence?: number;
      summary?: string;
      normalizedData?: unknown;
    };

    const type = parsed.documentType ?? documentType;
    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.75;
    const summary = parsed.summary ?? `Documento ${fileName} procesado`;
    const normalizedData = normalizeByType(type, parsed.normalizedData);

    return {
      documentType: type,
      confidence,
      strategy,
      summary,
      normalizedData,
    } satisfies ExtractionResult;
  } catch {
    return null;
  }
}

async function tryClaudePdfExtraction(
  fileName: string,
  pdfBuffer: Buffer,
  sourceHint: string,
  strategy: ExtractionResult["strategy"],
  documentType: ExtractionResult["documentType"],
) {
  const prompt = [
    "Clasifica y estructura este documento PDF de heladeria.",
    `Tipo previsto: ${documentType}.`,
    sourceHint ? `Ruta/carpeta de origen: ${sourceHint}.` : "",
    "Si falta algun dato, usa null o valores conservadores, nunca inventes importes.",
    'Devuelve JSON con forma { "documentType": "...", "confidence": 0.0-1.0, "summary": "...", "normalizedData": ... }.',
  ]
    .filter(Boolean)
    .join("\n\n");

  const response = await askClaudeFromPdf(fileName, pdfBuffer.toString("base64"), prompt);
  if (!response) {
    return null;
  }

  try {
    const parsed = JSON.parse(response) as {
      documentType?: ExtractionResult["documentType"];
      confidence?: number;
      summary?: string;
      normalizedData?: unknown;
    };

    const type = parsed.documentType ?? documentType;
    return {
      documentType: type,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.8,
      strategy,
      summary: parsed.summary ?? `Documento ${fileName} procesado desde PDF`,
      normalizedData: normalizeByType(type, parsed.normalizedData),
    } satisfies ExtractionResult;
  } catch {
    return null;
  }
}

function normalizeByType(documentType: ExtractionResult["documentType"], payload: unknown) {
  if (documentType === "sales_report") {
    return {
      id: randomUUID(),
      ...salesSchema.parse(payload),
    } satisfies SalesReport;
  }

  if (documentType === "invoice") {
    return {
      id: randomUUID(),
      ...invoiceSchema.parse(payload),
    } satisfies InvoiceRecord;
  }

  if (documentType === "payroll") {
    return {
      id: randomUUID(),
      ...payrollSchema.parse(payload),
    } satisfies PayrollRecord;
  }

  if (documentType === "hourly_report") {
    return hourlySchema.parse(payload).map((item) => ({
      id: randomUUID(),
      ...item,
    })) satisfies HourlySalesEntry[];
  }

  if (documentType === "bank_statement") {
    return bankSchema.parse(payload).map((item) => ({
      id: randomUUID(),
      ...item,
    })) satisfies BankTransaction[];
  }

  return (payload as Record<string, unknown>) ?? {};
}
