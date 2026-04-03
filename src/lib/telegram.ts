import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";

import { env } from "@/lib/env";
import { getSql, hasDatabase } from "@/lib/db";
import { storeTelegramMessage } from "@/lib/repositories";

/* ---------- Telegram handler ---------- */

export async function handleTelegramUpdate(update: Record<string, unknown>) {
  const message = update.message as
    | { text?: string; from?: { id?: number }; chat?: { id?: number } }
    | undefined;

  if (!message?.text || !message.chat?.id) {
    return { ok: true, ignored: true };
  }

  // Only respond to authorized chat ID
  const chatId = message.chat.id;
  if (env.TELEGRAM_CHAT_ID && String(chatId) !== env.TELEGRAM_CHAT_ID) {
    await sendTelegramMessage(chatId, "No tens acces autoritzat a aquest bot.");
    return { ok: false, reason: "unauthorized" };
  }

  if (!env.OPENAI_API_KEY) {
    await sendTelegramMessage(chatId, "Error: OPENAI_API_KEY no configurada.");
    return { ok: false, reason: "no_api_key" };
  }

  try {
    // Send "typing" indicator
    await sendChatAction(chatId, "typing");

    const answer = await processWithGPT(message.text);

    await storeTelegramMessage({
      telegramUserId: String(message.from?.id ?? chatId),
      username: "admin",
      question: message.text,
      answer,
    });

    await sendTelegramMessage(chatId, answer);
    return { ok: true };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[telegram] Error:", errMsg);
    await sendTelegramMessage(chatId, `Error processant la consulta: ${errMsg.slice(0, 200)}`);
    return { ok: false, error: errMsg };
  }
}

/* ---------- GPT-4o-mini with function calling ---------- */

const SYSTEM_PROMPT = `Ets l'assistent analitic de la gelateria Apolo a Salou (Tarragona). Respons SEMPRE en catala.

Tens acces a la base de dades del negoci amb aquestes taules:
- sales_reports: vendes diaries (business_date, total_sales, order_count, average_ticket)
- product_sales: vendes per producte (business_date, product_code, product_name, units, amount)
- hourly_sales: vendes per hora (business_date, hour_label, sales, order_count)
- hourly_product_sales: productes venuts per hora (business_date, hour_label, product_code, product_name, units, amount)
- invoices: factures proveidors (supplier_name, issue_date, total_amount, tax_amount, category)
- invoice_lines: linies de factura (invoice_id, description, quantity, unit_price, amount)
- employees: empleats (name, hourly_cost, shift_start, shift_end)
- employee_shifts: torns reals (employee_id, business_date, shift_start, shift_end)
- product_costs: cost unitari productes (product_code, product_name, category, unit_cost)
- bank_transactions: moviments bancaris (booked_at, concept, amount, direction, category)
- payrolls: nomines (employee_name, pay_period, gross_amount, net_amount)

Quan et facin una pregunta:
1. Pensa quina query SQL necessites
2. Usa la tool "query_database" per executar-la
3. Analitza els resultats i respon amb dades concretes
4. Usa format clar amb numeros, percentatges i comparatives
5. Si no hi ha dades, digues-ho clarament

Dates: la BD usa format DATE (YYYY-MM-DD). Usa CURRENT_DATE per avui.
Moneda: tot en EUR, formata amb 2 decimals.
Important: les queries han de ser SELECT only (no modificar dades).`;

const tools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "query_database",
      description: "Executa una query SQL SELECT contra la base de dades de la gelateria. Nomes queries de lectura (SELECT).",
      parameters: {
        type: "object",
        properties: {
          sql: {
            type: "string",
            description: "La query SQL a executar. Ha de ser SELECT only. Exemples: SELECT total_sales FROM sales_reports WHERE business_date = CURRENT_DATE - 1",
          },
          description: {
            type: "string",
            description: "Breu descripcio del que busca la query",
          },
        },
        required: ["sql"],
      },
    },
  },
];

async function processWithGPT(userMessage: string): Promise<string> {
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];

  // Allow up to 5 rounds of function calling
  for (let round = 0; round < 5; round++) {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      tools,
      tool_choice: round === 0 ? "auto" : "auto",
      temperature: 0.3,
      max_tokens: 2000,
    });

    const choice = response.choices[0];
    if (!choice) throw new Error("GPT no ha retornat resposta.");

    const assistantMessage = choice.message;
    messages.push(assistantMessage);

    // If no tool calls, return the text response
    if (!assistantMessage.tool_calls?.length) {
      return assistantMessage.content ?? "No he pogut generar una resposta.";
    }

    // Process each tool call
    for (const toolCall of assistantMessage.tool_calls) {
      if (toolCall.type !== "function") continue;
      if (toolCall.function.name === "query_database") {
        const args = JSON.parse(toolCall.function.arguments);
        const sqlQuery = String(args.sql ?? "");
        console.log(`[telegram-gpt] Query: ${sqlQuery}`);

        const result = await executeReadOnlyQuery(sqlQuery);

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
    }
  }

  return "He necessitat masses consultes per respondre. Prova amb una pregunta mes concreta.";
}

async function executeReadOnlyQuery(sqlQuery: string): Promise<{ rows: Record<string, unknown>[]; error?: string }> {
  // Security: only allow SELECT queries
  const trimmed = sqlQuery.trim().toUpperCase();
  if (!trimmed.startsWith("SELECT") && !trimmed.startsWith("WITH")) {
    return { rows: [], error: "Nomes es permeten queries SELECT." };
  }

  // Block dangerous keywords
  const blocked = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE", "CREATE", "GRANT", "REVOKE"];
  for (const kw of blocked) {
    if (trimmed.includes(kw) && !trimmed.includes(`'${kw}`) && !trimmed.includes(`"${kw}`)) {
      return { rows: [], error: `Operacio "${kw}" no permesa.` };
    }
  }

  if (!hasDatabase()) {
    return { rows: [], error: "Base de dades no configurada." };
  }

  try {
    const sql = getSql();
    const rows = await sql.query(sqlQuery);
    // Limit to 50 rows to avoid huge responses
    const limited = (rows as Record<string, unknown>[]).slice(0, 50);
    console.log(`[telegram-gpt] Result: ${limited.length} rows`);
    return { rows: limited };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[telegram-gpt] Query error: ${msg}`);
    return { rows: [], error: msg };
  }
}

/* ---------- Telegram API ---------- */

export async function sendTelegramMessage(chatId: number, text: string) {
  if (!env.TELEGRAM_BOT_TOKEN) return;

  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
    }),
  });
}

async function sendChatAction(chatId: number, action: string) {
  if (!env.TELEGRAM_BOT_TOKEN) return;

  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action }),
  });
}
