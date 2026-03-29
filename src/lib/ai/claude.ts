import Anthropic from "@anthropic-ai/sdk";
import type { Message, MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages";

import { env } from "@/lib/env";

export function getAnthropicClient() {
  if (!env.ANTHROPIC_API_KEY) {
    return null;
  }

  return new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
  });
}

export async function askClaudeForStructuredData(prompt: string) {
  const client = getAnthropicClient();
  if (!client) {
    return null;
  }

  try {
    const response = await createMessageWithFallback(client, {
      max_tokens: 4096,
      system:
        "Eres un analista financiero de una heladeria en Cataluña. Los documentos pueden estar en castellano, catalan, ingles u otros idiomas. Devuelve solo JSON valido siguiendo el esquema pedido y no inventes datos ausentes.",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const textBlock = response.content.find((item) => item.type === "text");
    return textBlock && "text" in textBlock ? textBlock.text : null;
  } catch (error) {
    console.error("Claude structured-data request failed:", error);
    return null;
  }
}

export type VisionMediaType = "application/pdf" | "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export async function askClaudeFromImage(fileName: string, imageBase64: string, mediaType: VisionMediaType, prompt: string) {
  const client = getAnthropicClient();
  if (!client) {
    return null;
  }

  try {
    const source = mediaType === "application/pdf"
      ? { type: "base64" as const, media_type: mediaType, data: imageBase64 }
      : { type: "base64" as const, media_type: mediaType, data: imageBase64 };

    const contentBlock = mediaType === "application/pdf"
      ? { type: "document" as const, source }
      : { type: "image" as const, source };

    const response = await createMessageWithFallback(client, {
      max_tokens: 4096,
      system:
        "Eres un analista financiero de una heladeria en Cataluña. Los documentos pueden estar en castellano, catalan, ingles u otros idiomas. Devuelve solo JSON valido siguiendo el esquema pedido y no inventes datos ausentes.",
      messages: [
        {
          role: "user",
          content: [
            contentBlock,
            {
              type: "text",
              text: `Nombre del archivo: ${fileName}\n\n${prompt}`,
            },
          ],
        } as never,
      ],
    });

    const textBlock = response.content.find((item) => item.type === "text");
    return textBlock && "text" in textBlock ? textBlock.text : null;
  } catch (error) {
    console.error("Claude vision request failed:", error);
    return null;
  }
}

export async function askClaudeFromPdf(fileName: string, pdfBase64: string, prompt: string) {
  const client = getAnthropicClient();
  if (!client) {
    return null;
  }

  try {
    const response = await createMessageWithFallback(client, {
      max_tokens: 4096,
      system:
        "Eres un analista financiero de una heladeria en Cataluña. Los documentos pueden estar en castellano, catalan, ingles u otros idiomas. Devuelve solo JSON valido siguiendo el esquema pedido y no inventes datos ausentes.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdfBase64,
              },
            },
            {
              type: "text",
              text: `Nombre del archivo: ${fileName}\n\n${prompt}`,
            },
          ],
        } as never,
      ],
    });

    const textBlock = response.content.find((item) => item.type === "text");
    return textBlock && "text" in textBlock ? textBlock.text : null;
  } catch (error) {
    console.error("Claude PDF request failed:", error);
    return null;
  }
}

const invoiceTool = {
  name: "save_invoice" as const,
  description: "Guarda los datos estructurados de una factura de proveedor",
  input_schema: {
    type: "object" as const,
    required: ["supplierName", "issueDate", "totalAmount"],
    properties: {
      supplierName: { type: "string", description: "Nombre del proveedor/emisor" },
      issueDate: { type: "string", description: "Fecha de emision en formato YYYY-MM-DD" },
      dueDate: { type: ["string", "null"], description: "Fecha de vencimiento YYYY-MM-DD o null" },
      totalAmount: { type: "number", description: "Importe total de la factura con IVA incluido" },
      taxAmount: { type: "number", description: "Importe total del IVA" },
      category: { type: "string", enum: ["materia_prima", "envases", "limpieza", "suministros", "otros"], description: "Categoria del gasto" },
      lineItems: {
        type: "array",
        description: "Lineas de detalle de la factura",
        items: {
          type: "object",
          required: ["description", "amount"],
          properties: {
            description: { type: "string" },
            quantity: { type: "number" },
            unitPrice: { type: "number" },
            amount: { type: "number" },
            vatRate: { type: "number" },
            vatAmount: { type: "number" },
          },
        },
      },
    },
  },
};

export async function extractInvoiceFromPdf(fileName: string, pdfBase64: string) {
  const client = getAnthropicClient();
  if (!client) return null;

  try {
    const response = await createMessageWithFallback(client, {
      max_tokens: 4096,
      system: "Eres un analista financiero. Extrae los datos de la factura usando la herramienta save_invoice. Si no puedes extraer algun campo obligatorio, usa tu mejor estimacion basada en el documento. No inventes importes.",
      tools: [invoiceTool],
      tool_choice: { type: "tool" as const, name: "save_invoice" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf" as const, data: pdfBase64 },
            },
            { type: "text", text: `Extrae todos los datos de esta factura: ${fileName}` },
          ],
        } as never,
      ],
    });

    const toolBlock = response.content.find((b) => b.type === "tool_use");
    if (toolBlock && "input" in toolBlock) {
      console.log("[Claude] Tool use invoice extraction succeeded");
      return toolBlock.input as Record<string, unknown>;
    }
    return null;
  } catch (error) {
    console.error("Claude tool-use invoice extraction failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

export async function extractInvoiceFromText(text: string) {
  const client = getAnthropicClient();
  if (!client) return null;

  try {
    const response = await createMessageWithFallback(client, {
      max_tokens: 4096,
      system: "Eres un analista financiero. Extrae los datos de la factura usando la herramienta save_invoice. Si no puedes extraer algun campo obligatorio, usa tu mejor estimacion basada en el documento. No inventes importes.",
      tools: [invoiceTool],
      tool_choice: { type: "tool" as const, name: "save_invoice" },
      messages: [
        { role: "user", content: `Extrae todos los datos de esta factura:\n\n${text.slice(0, 12000)}` },
      ],
    });

    const toolBlock = response.content.find((b) => b.type === "tool_use");
    if (toolBlock && "input" in toolBlock) {
      console.log("[Claude] Tool use text invoice extraction succeeded");
      return toolBlock.input as Record<string, unknown>;
    }
    return null;
  } catch (error) {
    console.error("Claude tool-use text invoice extraction failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

function getCandidateModels() {
  return [
    env.ANTHROPIC_MODEL,
    ...env.ANTHROPIC_FALLBACK_MODELS.split(",").map((item) => item.trim()),
  ].filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index);
}

async function createMessageWithFallback(
  client: Anthropic,
  params: Omit<MessageCreateParamsNonStreaming, "model">,
): Promise<Message> {
  const models = getCandidateModels();
  let lastError: unknown = null;

  console.log(`[Claude] Trying models: ${models.join(", ")}`);

  for (const model of models) {
    try {
      console.log(`[Claude] Attempting model: ${model}`);
      const result = await client.messages.create({
        model,
        ...params,
      });
      console.log(`[Claude] Success with model: ${model}`);
      return result;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const status = (error as { status?: number }).status;
      console.warn(`[Claude] Model ${model} failed (status=${status}): ${errMsg.slice(0, 200)}`);
      lastError = error;
      if (isModelNotFound(error)) {
        continue;
      }

      throw error;
    }
  }

  throw lastError ?? new Error("Todos los modelos de Claude fallaron. Verifica ANTHROPIC_API_KEY.");
}

function isModelNotFound(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as {
    status?: number;
    error?: {
      error?: {
        type?: string;
      };
    };
  };

  return maybeError.status === 404 || maybeError.error?.error?.type === "not_found_error";
}
