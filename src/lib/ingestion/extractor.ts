import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { z } from "zod";

import { askClaudeForStructuredData, askClaudeFromImage, askClaudeFromPdf, type VisionMediaType } from "@/lib/ai/claude";
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
  totalAmount: z.coerce.number(),
  taxAmount: z.coerce.number().default(0),
  category: z.string().default("otros"),
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
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  const parsed = await parser.getText();
  await parser.destroy();
  return parsed.text.trim();
}

export async function extractPdfText(filePath: string) {
  const buffer = await readFile(filePath);
  return extractPdfTextFromBuffer(buffer);
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
  } catch (error) {
    console.error("[Extractor] PDF text extraction failed:", error instanceof Error ? error.message : error);
    nativeText = "";
  }

  const initialType = classifyDocument(params.fileName, `${params.sourceHint ?? ""} ${nativeText}`);
  console.log(`[Extractor] File: ${params.fileName}, nativeText length: ${nativeText.length}, initialType: ${initialType}`);

  if (nativeText.length > 30) {
    const structured = await tryClaudeExtraction(params.fileName, nativeText, "native-text", initialType);
    if (structured) {
      console.log(`[Extractor] Claude text extraction succeeded: type=${structured.documentType}, confidence=${structured.confidence}`);
      return structured;
    }
    console.log("[Extractor] Claude text extraction returned null, trying heuristic...");

    const heuristicInvoice = tryHeuristicInvoiceExtraction(params.fileName, nativeText, initialType);
    if (heuristicInvoice) {
      console.log("[Extractor] Heuristic invoice extraction succeeded");
      return heuristicInvoice;
    }
    console.log("[Extractor] Heuristic extraction also failed, trying PDF vision...");
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

export async function extractStructuredDataFromImage(params: {
  fileName: string;
  imageBuffer: Buffer;
  mediaType: VisionMediaType;
  sourceHint?: string;
}): Promise<ExtractionResult> {
  const initialType = classifyDocument(params.fileName, params.sourceHint ?? "");

  const invoiceHint = initialType === "invoice"
    ? 'Para facturas, normalizedData debe tener: { "supplierName": string, "issueDate": "YYYY-MM-DD", "dueDate": "YYYY-MM-DD" | null, "totalAmount": number, "taxAmount": number, "category": "materia_prima" | "envases" | "limpieza" | "otros" }.'
    : "";
  const prompt = [
    "Analiza esta imagen de un documento financiero de una heladeria.",
    `Tipo previsto: ${initialType}.`,
    params.sourceHint ? `Ruta/carpeta de origen: ${params.sourceHint}.` : "",
    "Extrae todos los datos estructurados que puedas: proveedor, fechas, importes, IVA, categorias, etc.",
    "Si falta algun dato, usa null o valores conservadores, nunca inventes importes.",
    'Devuelve JSON con forma { "documentType": "...", "confidence": 0.0-1.0, "summary": "...", "normalizedData": { ... } }.',
    invoiceHint,
  ]
    .filter(Boolean)
    .join("\n\n");

  const response = await askClaudeFromImage(
    params.fileName,
    params.imageBuffer.toString("base64"),
    params.mediaType,
    prompt,
  );

  if (!response) {
    return {
      documentType: initialType,
      confidence: 0.4,
      strategy: "claude-vision",
      summary: "No se pudo analizar la imagen; revisar el documento.",
      normalizedData: { fileName: params.fileName },
    };
  }

  try {
    const cleaned = cleanJsonResponse(response);
    const parsed = JSON.parse(cleaned) as {
      documentType?: ExtractionResult["documentType"];
      confidence?: number;
      summary?: string;
      normalizedData?: unknown;
    };

    const type = parsed.documentType ?? initialType;
    const dataPayload = parsed.normalizedData ?? extractDataFields(parsed as Record<string, unknown>);
    return {
      documentType: type,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.8,
      strategy: "claude-vision",
      summary: parsed.summary ?? `Documento ${params.fileName} procesado desde imagen`,
      normalizedData: normalizeByType(type, dataPayload),
    } satisfies ExtractionResult;
  } catch {
    return {
      documentType: initialType,
      confidence: 0.4,
      strategy: "claude-vision",
      summary: "No se pudo estructurar la respuesta de vision; revisar el documento.",
      normalizedData: { fileName: params.fileName, rawResponse: response.slice(0, 500) },
    };
  }
}

function tryHeuristicInvoiceExtraction(
  fileName: string,
  documentText: string,
  initialType: ExtractionResult["documentType"],
): ExtractionResult | null {
  const lines = documentText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const supplierName = inferSupplierName(lines, fileName);
  const issueDate = findFirstDate(documentText);
  const totalAmount = findLabeledAmount(documentText, [
    "total factura",
    "importe total",
    "total a pagar",
    "total",
  ]);
  const taxAmount = findLabeledAmount(documentText, ["iva", "vat", "impuestos", "tax"]) ?? 0;

  if (!looksLikeInvoice(fileName, documentText, initialType) || !supplierName || !issueDate || totalAmount == null) {
    return null;
  }

  return {
    documentType: "invoice",
    confidence: 0.72,
    strategy: "native-text",
    summary: `Factura detectada para ${supplierName}`,
    normalizedData: {
      id: randomUUID(),
      supplierName,
      issueDate,
      dueDate: null,
      totalAmount,
      taxAmount,
      category: inferInvoiceCategory(supplierName, documentText),
    } satisfies InvoiceRecord,
  };
}

function looksLikeInvoice(
  fileName: string,
  documentText: string,
  initialType: ExtractionResult["documentType"],
) {
  if (initialType === "invoice") {
    return true;
  }

  const sample = `${fileName}\n${documentText}`.toLowerCase();
  const invoiceSignals = [
    "amazon",
    "factura",
    "invoice",
    "iva",
    "vat",
    "base imponible",
    "importe total",
    "total a pagar",
    "supplier",
    "proveedor",
  ];

  const matches = invoiceSignals.filter((signal) => sample.includes(signal));
  return matches.length >= 2;
}

async function tryClaudeExtraction(
  fileName: string,
  documentText: string,
  strategy: ExtractionResult["strategy"],
  documentType = classifyDocument(fileName, documentText),
) {
  const invoiceHint = documentType === "invoice"
    ? 'Para facturas, normalizedData debe tener: { "supplierName": string, "issueDate": "YYYY-MM-DD", "dueDate": "YYYY-MM-DD" | null, "totalAmount": number, "taxAmount": number, "category": "materia_prima" | "envases" | "limpieza" | "otros" }.'
    : "";
  const prompt = [
    "Clasifica y estructura este documento de heladeria.",
    `Tipo previsto: ${documentType}.`,
    "Si falta algun dato, usa null o valores conservadores, nunca inventes importes.",
    'Devuelve JSON con forma { "documentType": "...", "confidence": 0.0-1.0, "summary": "...", "normalizedData": { ... } }.',
    invoiceHint,
    "Documento:",
    documentText.slice(0, 12000),
  ].filter(Boolean).join("\n\n");

  const response = await askClaudeForStructuredData(prompt);
  if (!response) {
    console.warn("[Extractor] Claude returned no response for text extraction");
    return null;
  }

  try {
    const cleaned = cleanJsonResponse(response);
    console.log("[Extractor] Claude text response (first 300 chars):", cleaned.slice(0, 300));
    const parsed = JSON.parse(cleaned) as {
      documentType?: ExtractionResult["documentType"];
      confidence?: number;
      summary?: string;
      normalizedData?: unknown;
    };

    const type = parsed.documentType ?? documentType;
    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.75;
    const summary = parsed.summary ?? `Documento ${fileName} procesado`;
    // Claude may nest data in normalizedData or put fields at root level
    const dataPayload = parsed.normalizedData ?? extractDataFields(parsed);
    console.log("[Extractor] dataPayload for normalizeByType:", JSON.stringify(dataPayload).slice(0, 300));
    const normalizedData = normalizeByType(type, dataPayload);

    return {
      documentType: type,
      confidence,
      strategy,
      summary,
      normalizedData,
    } satisfies ExtractionResult;
  } catch (error) {
    console.error("[Extractor] Failed to parse Claude text response:", response.slice(0, 500), error);
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
  const invoiceHint = documentType === "invoice"
    ? 'Para facturas, normalizedData debe tener: { "supplierName": string, "issueDate": "YYYY-MM-DD", "dueDate": "YYYY-MM-DD" | null, "totalAmount": number, "taxAmount": number, "category": "materia_prima" | "envases" | "limpieza" | "otros" }.'
    : "";
  const prompt = [
    "Clasifica y estructura este documento PDF de heladeria.",
    `Tipo previsto: ${documentType}.`,
    sourceHint ? `Ruta/carpeta de origen: ${sourceHint}.` : "",
    "Si falta algun dato, usa null o valores conservadores, nunca inventes importes.",
    'Devuelve JSON con forma { "documentType": "...", "confidence": 0.0-1.0, "summary": "...", "normalizedData": { ... } }.',
    invoiceHint,
  ]
    .filter(Boolean)
    .join("\n\n");

  const response = await askClaudeFromPdf(fileName, pdfBuffer.toString("base64"), prompt);
  if (!response) {
    console.warn("[Extractor] Claude returned no response for PDF vision extraction");
    return null;
  }

  try {
    const cleaned = cleanJsonResponse(response);
    console.log("[Extractor] Claude PDF response (first 300 chars):", cleaned.slice(0, 300));
    const parsed = JSON.parse(cleaned) as {
      documentType?: ExtractionResult["documentType"];
      confidence?: number;
      summary?: string;
      normalizedData?: unknown;
    };

    const type = parsed.documentType ?? documentType;
    const dataPayload = parsed.normalizedData ?? extractDataFields(parsed);
    return {
      documentType: type,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.8,
      strategy,
      summary: parsed.summary ?? `Documento ${fileName} procesado desde PDF`,
      normalizedData: normalizeByType(type, dataPayload),
    } satisfies ExtractionResult;
  } catch (error) {
    console.error("[Extractor] Failed to parse Claude PDF response:", response.slice(0, 500), error);
    return null;
  }
}

function coercePayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return {};
  const raw = payload as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    // Convert snake_case keys from Claude to camelCase expected by Zod schemas
    const camel = key.replace(/_([a-z])/g, (_, c) => (c as string).toUpperCase());
    out[camel] = value;
  }
  return out;
}

function normalizeByType(documentType: ExtractionResult["documentType"], payload: unknown) {
  const coerced = Array.isArray(payload) ? payload.map(coercePayload) : coercePayload(payload);

  if (documentType === "sales_report") {
    const result = salesSchema.safeParse(coerced);
    if (result.success) {
      return { id: randomUUID(), ...result.data } satisfies SalesReport;
    }
  }

  if (documentType === "invoice") {
    const result = invoiceSchema.safeParse(coerced);
    if (result.success) {
      return { id: randomUUID(), ...result.data } satisfies InvoiceRecord;
    }
    console.warn("[normalizeByType] Invoice Zod validation failed:", JSON.stringify(result.error.issues), "Payload:", JSON.stringify(coerced).slice(0, 300));
    // Try to salvage partial data
    const raw = coerced as Record<string, unknown>;
    if (raw.supplierName && raw.totalAmount != null) {
      return {
        id: randomUUID(),
        supplierName: String(raw.supplierName),
        issueDate: String(raw.issueDate ?? "unknown"),
        dueDate: raw.dueDate ? String(raw.dueDate) : null,
        totalAmount: Number(raw.totalAmount),
        taxAmount: Number(raw.taxAmount ?? 0),
        category: String(raw.category ?? "otros"),
      } satisfies InvoiceRecord;
    }
  }

  if (documentType === "payroll") {
    const result = payrollSchema.safeParse(coerced);
    if (result.success) {
      return { id: randomUUID(), ...result.data } satisfies PayrollRecord;
    }
  }

  if (documentType === "hourly_report") {
    const result = hourlySchema.safeParse(coerced);
    if (result.success) {
      return result.data.map((item) => ({ id: randomUUID(), ...item })) satisfies HourlySalesEntry[];
    }
  }

  if (documentType === "bank_statement") {
    const result = bankSchema.safeParse(coerced);
    if (result.success) {
      return result.data.map((item) => ({ id: randomUUID(), ...item })) satisfies BankTransaction[];
    }
  }

  return (payload as Record<string, unknown>) ?? {};
}

function inferSupplierName(lines: string[], fileName: string) {
  const joined = lines.join(" ").toLowerCase();
  if (joined.includes("amazon")) {
    return "Amazon";
  }

  const blackList = ["factura", "invoice", "fecha", "date", "pedido", "order", "cliente", "vat", "iva"];
  const candidate = lines.find((line) => {
    const lower = line.toLowerCase();
    return (
      lower.length > 3 &&
      lower.length < 80 &&
      /[a-záéíóúàèìòù]/i.test(lower) &&
      !blackList.some((word) => lower.includes(word))
    );
  });

  if (candidate) {
    return candidate.replace(/\s{2,}/g, " ").trim();
  }

  return fileName.replace(/\.[^.]+$/, "");
}

function findFirstDate(text: string) {
  const match = text.match(/\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/);
  if (!match) {
    return null;
  }

  const [day, month, year] = match[1].split(/[/-]/);
  const normalizedYear = year.length === 2 ? `20${year}` : year;
  return `${normalizedYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function findLabeledAmount(text: string, labels: string[]) {
  for (const label of labels) {
    const regex = new RegExp(`${escapeRegExp(label)}[^\\d]{0,20}(\\d{1,3}(?:[.\\s]\\d{3})*(?:,\\d{2})|\\d+(?:,\\d{2}))`, "i");
    const match = text.match(regex);
    if (match) {
      const amount = parseEuroNumber(match[1]);
      if (amount != null) {
        return amount;
      }
    }
  }

  const amounts = [...text.matchAll(/\b(\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})|\d+(?:,\d{2}))\b/g)]
    .map((match) => parseEuroNumber(match[1]))
    .filter((value): value is number => value != null);

  if (!amounts.length) {
    return null;
  }

  return Math.max(...amounts);
}

function parseEuroNumber(value: string) {
  const normalized = value.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function inferInvoiceCategory(supplierName: string, text: string) {
  const sample = `${supplierName} ${text}`.toLowerCase();
  if (sample.includes("amazon") || sample.includes("envase") || sample.includes("pack")) {
    return "envases";
  }
  if (sample.includes("leche") || sample.includes("nata") || sample.includes("chocolate") || sample.includes("ingred")) {
    return "materia_prima";
  }
  if (sample.includes("limpieza")) {
    return "limpieza";
  }
  return "otros";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Extract data fields from Claude response when they're at root level instead of nested in normalizedData */
function extractDataFields(parsed: Record<string, unknown>): Record<string, unknown> {
  const metaKeys = new Set(["documentType", "document_type", "confidence", "summary", "normalizedData", "normalized_data"]);
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!metaKeys.has(key)) {
      data[key] = value;
    }
  }
  return data;
}

function cleanJsonResponse(raw: string): string {
  // Strip markdown code fences that Claude sometimes wraps around JSON
  const fenced = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenced) return fenced[1].trim();
  // Try to extract raw JSON object/array
  const jsonStart = raw.search(/[{[]/);
  if (jsonStart >= 0) return raw.slice(jsonStart);
  return raw;
}
