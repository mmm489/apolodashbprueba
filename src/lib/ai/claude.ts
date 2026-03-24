import Anthropic from "@anthropic-ai/sdk";

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

  const response = await client.messages.create({
    model: "claude-3-5-sonnet-latest",
    max_tokens: 1200,
    system:
      "Eres un analista financiero de una heladeria. Devuelve solo JSON valido siguiendo el esquema pedido y no inventes datos ausentes.",
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const textBlock = response.content.find((item) => item.type === "text");
  return textBlock && "text" in textBlock ? textBlock.text : null;
}

export async function askClaudeFromPdf(fileName: string, pdfBase64: string, prompt: string) {
  const client = getAnthropicClient();
  if (!client) {
    return null;
  }

  const response = await client.messages.create({
    model: "claude-3-5-sonnet-latest",
    max_tokens: 1400,
    system:
      "Eres un analista financiero de una heladeria. Devuelve solo JSON valido siguiendo el esquema pedido y no inventes datos ausentes.",
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
            title: fileName,
          },
          {
            type: "text",
            text: prompt,
          },
        ],
      } as never,
    ],
  });

  const textBlock = response.content.find((item) => item.type === "text");
  return textBlock && "text" in textBlock ? textBlock.text : null;
}
