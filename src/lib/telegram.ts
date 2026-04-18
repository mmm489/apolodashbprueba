import Anthropic from "@anthropic-ai/sdk";
import type { Tool, ToolUseBlock } from "@anthropic-ai/sdk/resources/messages";

import { fetchHistoricalWeather, getFinancialWorkspace } from "@/lib/analytics";
import { getSql, hasDatabase } from "@/lib/db";
import { env } from "@/lib/env";
import { storeTelegramMessage } from "@/lib/repositories";
import type { FinancialWorkspace } from "@/lib/types";

/* ---------- Telegram handler ---------- */

export async function handleTelegramUpdate(update: Record<string, unknown>) {
  const message = update.message as
    | { text?: string; from?: { id?: number }; chat?: { id?: number } }
    | undefined;

  if (!message?.text || !message.chat?.id) {
    return { ok: true, ignored: true };
  }

  const chatId = message.chat.id;
  if (env.TELEGRAM_CHAT_ID) {
    // Allow a comma-separated list so personal + groups can coexist.
    const allowed = env.TELEGRAM_CHAT_ID.split(",").map((s) => s.trim()).filter(Boolean);
    if (!allowed.includes(String(chatId))) {
      // Friendly self-service: show the actual chat_id so the owner can
      // append it to TELEGRAM_CHAT_ID without having to query getUpdates.
      await sendTelegramMessage(
        chatId,
        `No tens accés autoritzat a aquest bot.\n\nEl chat_id d'aquesta conversa és \`${chatId}\`. Si vols autoritzar-lo, afegeix-lo a la variable d'entorn TELEGRAM_CHAT_ID (separada per comes).`,
      );
      return { ok: false, reason: "unauthorized", chatId };
    }
  }

  if (!env.ANTHROPIC_API_KEY) {
    await sendTelegramMessage(chatId, "Error: ANTHROPIC_API_KEY no configurada.");
    return { ok: false, reason: "no_api_key" };
  }

  try {
    await sendChatAction(chatId, "typing");
    const answer = await processWithClaude(message.text);

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
    await sendTelegramMessage(chatId, `Error processant la consulta: ${errMsg.slice(0, 300)}`);
    return { ok: false, error: errMsg };
  }
}

/* ---------- Claude with native analytics tools ---------- */

const TODAY_ISO = () => new Date().toISOString().slice(0, 10);

const SYSTEM_PROMPT = () => `Ets l'assistent analític de la **gelateria Apolo** a Salou (Tarragona).
Respons SEMPRE en català. Avui és ${TODAY_ISO()}.

## Context del negoci
- Gelateria amb forta estacionalitat: turisme de platja, depenent del temps.
- Vens gelats, cafès, begudes, crepes, batuts, granissats, especialitats, xurros, etc.
- Objectius típics del sector: **food cost < 35%**, **labor cost < 30%**, **prime cost < 65%**.
- KPIs clau: ticket mitjà, marge per producte, productivitat per hora, hores pic.
- Comparatives útils: vs ahir, vs mateix dia setmana passada (DOW), vs mateix dia any passat (52 setmanes enrere = mateix DOW).

## Eines disponibles
Tens 3 eines:
1. **\`get_dashboard(preset)\`** — l'eina principal. Et dóna KPIs, comparatives YoY (DOW i per data), digest del dia més recent amb temps d'avui i temps dels dies comparats, previsió de demà ajustada per temperatura, famílies que creixen/cauen, top productes per import i marge, pattern horari, top proveïdors. **Usa-la sempre que puguis** abans de SQL.
2. **\`get_historical_weather(from, to)\`** — temps real d'un rang de dates (temp max/min, precipitació mm, WMO). Útil per explicar diferències YoY ("va ploure 15mm aquell dia") o per correlacionar temps amb vendes.
3. **\`query_database(sql, description)\`** — només SELECT. Usa-la quan les dues anteriors no donin el que necessites.

## Presets vàlids per get_dashboard
- \`today\`: avui
- \`yesterday\`: ahir
- \`7d\`, \`30d\`, \`90d\`: últims N dies fins avui
- \`month\`: **de l'1 del mes actual fins avui (MTD)**, no el mes sencer
- \`year\`: **de l'1 de gener fins avui (YTD)**, no l'any sencer
- Les comparatives dins cada preset ja tenen el període anterior de la mateixa durada (ex: preset=year compara YTD vs mateixos dies any passat, no vs any sencer).

**IMPORTANT**: quan l'usuari demana "compara aquest any vs any passat" usa \`year\` — les dades que et dóna són YTD equivalent a any passat, ja alineades.

## Esquema de la BD (per query_database)
- \`sales_reports(business_date DATE, total_sales, order_count, average_ticket)\`
- \`product_sales(business_date DATE, product_code, product_name, units, amount)\`
- \`hourly_sales(business_date DATE, hour_label, sales, order_count)\`
- \`hourly_product_sales(business_date DATE, hour_label, product_code, product_name, units, amount)\`
- \`invoices(supplier_name, issue_date DATE, total_amount, tax_amount, category)\`
- \`invoice_lines(invoice_id, description, quantity, unit_price, amount)\`
- \`employees(name, hourly_cost, shift_start, shift_end, working_days_per_month)\`
- \`employee_shifts(employee_id, business_date DATE, shift_start, shift_end)\`
- \`product_costs(product_code, product_name, category, unit_cost)\`
- \`payrolls(employee_name, pay_period TEXT, gross_amount, net_amount)\`

## Com respondre
- Sigues concís però complet. Format markdown senzill per a Telegram (negretes amb \`*text*\`, NO usis \`**\`).
- Sempre comparteix números concrets amb unitats (€, %, hores).
- Si veus un problema (food cost alt, família que cau molt, concentració de proveïdors), DIGUES-HO i recomana acció.
- Si una pregunta no té sentit o falten dades, digues-ho clarament en lloc d'inventar.
- Pensa com a propietari: què hauria de fer aquesta persona amb aquesta informació?`;

const tools: Tool[] = [
  {
    name: "get_dashboard",
    description:
      "Retorna l'snapshot complet del dashboard per al període indicat: KPIs (vendes, costos, marges, food cost %, labor cost %, productivitat), comparatives vs període anterior i vs any passat (DOW-aligned), digest del dia més recent amb previsió de demà ajustada per temperatura, famílies que creixen i que cauen, top productes per import i per marge, pattern horari i top proveïdors. Usa aquesta eina sempre que puguis abans de query_database.",
    input_schema: {
      type: "object" as const,
      properties: {
        preset: {
          type: "string",
          enum: ["today", "yesterday", "7d", "30d", "90d", "month", "year"],
          description: "Període a analitzar. Per defecte 30d si no s'especifica.",
        },
      },
      required: ["preset"],
    },
  },
  {
    name: "get_historical_weather",
    description:
      "Retorna el temps (temperatura max/min, precipitació en mm, codi WMO) per un rang de dates. Útil per explicar per què un dia concret es va vendre menys/més (ex: va ploure) o per comparar el temps d'avui amb el mateix dia any passat.",
    input_schema: {
      type: "object" as const,
      properties: {
        from: { type: "string", description: "Data inici YYYY-MM-DD" },
        to: { type: "string", description: "Data fi YYYY-MM-DD" },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "query_database",
    description:
      "Executa una query SQL SELECT contra la base de dades. Només per casos en què get_dashboard no doni el detall que cal (ex: cerques específiques per nom de producte, evolució dia a dia d'una mètrica, etc.). Limitada a 50 files de retorn.",
    input_schema: {
      type: "object" as const,
      properties: {
        sql: {
          type: "string",
          description:
            "Query SELECT. Pots usar CURRENT_DATE per avui. La BD utilitza columnes business_date / issue_date / booked_at en format DATE.",
        },
        description: {
          type: "string",
          description: "Frase curta sobre què intentes esbrinar.",
        },
      },
      required: ["sql", "description"],
    },
  },
];

async function processWithClaude(userMessage: string): Promise<string> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  // Cache workspaces per preset for the lifetime of this single message so
  // multiple tool calls in the same turn share data.
  const workspaceCache = new Map<string, FinancialWorkspace>();
  const getCachedWorkspace = async (preset: string) => {
    if (!workspaceCache.has(preset)) {
      workspaceCache.set(preset, await getFinancialWorkspace({ preset }));
    }
    return workspaceCache.get(preset)!;
  };

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  const candidateModels = [
    env.ANTHROPIC_MODEL,
    ...env.ANTHROPIC_FALLBACK_MODELS.split(",").map((m) => m.trim()),
    "claude-sonnet-4-5",
    "claude-haiku-4-5-20251001",
  ].filter((v, i, a) => Boolean(v) && a.indexOf(v) === i);

  // Up to 8 rounds of tool use so multi-step questions resolve in one turn.
  for (let round = 0; round < 8; round++) {
    let response: Anthropic.Message | null = null;
    let lastError: unknown = null;
    for (const model of candidateModels) {
      try {
        response = await client.messages.create({
          model,
          max_tokens: 2048,
          system: SYSTEM_PROMPT(),
          tools,
          messages,
        });
        break;
      } catch (err) {
        lastError = err;
        const status = (err as { status?: number }).status;
        // 404 = model not found in account, try fallback
        if (status === 404) continue;
        throw err;
      }
    }
    if (!response) throw lastError ?? new Error("Cap model Claude disponible.");

    // Append the assistant turn to history regardless of stop_reason
    messages.push({ role: "assistant", content: response.content });

    // If Claude is done thinking, return its text reply
    if (response.stop_reason !== "tool_use") {
      const textBlock = response.content.find((b) => b.type === "text");
      return textBlock && textBlock.type === "text" ? textBlock.text : "No he pogut generar resposta.";
    }

    // Process all tool calls in this round
    const toolUseBlocks = response.content.filter((b): b is ToolUseBlock => b.type === "tool_use");
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of toolUseBlocks) {
      const result = await executeTool(block, getCachedWorkspace);
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: typeof result === "string" ? result : JSON.stringify(result),
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  return "He necessitat masses passos per respondre. Prova amb una pregunta més concreta.";
}

/* ---------- Tool executors ---------- */

async function executeTool(
  block: ToolUseBlock,
  getCachedWorkspace: (preset: string) => Promise<FinancialWorkspace>,
): Promise<unknown> {
  const input = block.input as Record<string, unknown>;
  console.log(`[telegram-claude] Tool: ${block.name}`, JSON.stringify(input).slice(0, 200));

  if (block.name === "get_dashboard") {
    const preset = String(input.preset ?? "30d");
    const ws = await getCachedWorkspace(preset);
    return summarizeWorkspace(ws);
  }

  if (block.name === "get_historical_weather") {
    const from = String(input.from ?? "");
    const to = String(input.to ?? "");
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return { error: "Dates invàlides, cal format YYYY-MM-DD" };
    }
    // Expand the range into day-by-day ISO strings
    const days: string[] = [];
    const cursor = new Date(fromDate);
    while (cursor <= toDate && days.length < 120) {
      days.push(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 1);
    }
    const weatherMap = await fetchHistoricalWeather(days);
    return Object.fromEntries(weatherMap.entries());
  }

  if (block.name === "query_database") {
    const sql = String(input.sql ?? "");
    return executeReadOnlyQuery(sql);
  }

  return { error: `Eina desconeguda: ${block.name}` };
}

/** Returns a compact JSON-friendly summary of a FinancialWorkspace so Claude
 * can reason about it without ingesting hundreds of raw rows. */
function summarizeWorkspace(ws: FinancialWorkspace) {
  const k = ws.snapshot.kpis;
  const cmp = ws.comparisons;

  // Compute derived ratios on the fly so Claude doesn't have to do it
  const foodCostPct = k.totalSales > 0 ? (k.totalProductCost / k.totalSales) * 100 : 0;
  const laborCostPct = k.totalSales > 0 ? (k.totalEmployeeCost / k.totalSales) * 100 : 0;
  const primeCostPct = foodCostPct + laborCostPct;
  const grossMargin = k.totalSales - k.totalProductCost;
  const operatingMargin = grossMargin - k.totalEmployeeCost;

  // Top 10 products with margin
  const costMap = new Map(ws.productSales.map((p) => [p.productCode, p]));
  const productMap = new Map<string, { name: string; units: number; amount: number }>();
  for (const ps of ws.productSales) {
    const ex = productMap.get(ps.productCode);
    if (ex) {
      ex.units += ps.units;
      ex.amount += ps.amount;
    } else {
      productMap.set(ps.productCode, { name: ps.productName, units: ps.units, amount: ps.amount });
    }
  }
  // Hourly pattern (top hours)
  const hourMap = new Map<string, number>();
  for (const h of ws.hourlySales) {
    hourMap.set(h.hour, (hourMap.get(h.hour) ?? 0) + h.sales);
  }
  const hourlyPattern = [...hourMap.entries()]
    .map(([hour, sales]) => ({ hour, sales: round2(sales) }))
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 8);

  // Top suppliers
  const supplierMap = new Map<string, { total: number; count: number }>();
  for (const inv of ws.invoices) {
    const ex = supplierMap.get(inv.supplierName);
    if (ex) {
      ex.total += inv.totalAmount;
      ex.count += 1;
    } else {
      supplierMap.set(inv.supplierName, { total: inv.totalAmount, count: 1 });
    }
  }
  const topSuppliers = [...supplierMap.entries()]
    .map(([name, v]) => ({ name, total: round2(v.total), invoices: v.count }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
  const top3Share = ws.snapshot.kpis.totalSales > 0 || k.totalProductCost > 0
    ? (topSuppliers.slice(0, 3).reduce((s, x) => s + x.total, 0) / Math.max(1, ws.invoices.reduce((s, i) => s + i.totalAmount, 0))) * 100
    : 0;

  return {
    period: { from: ws.filter.from, to: ws.filter.to, preset: ws.filter.preset, days: ws.salesReports.length },
    kpis: {
      totalSales: round2(k.totalSales),
      totalExpenses: round2(k.totalExpenses),
      totalPayroll: round2(k.totalPayroll),
      totalProductCost: round2(k.totalProductCost),
      totalEmployeeCost: round2(k.totalEmployeeCost),
      grossMargin: round2(grossMargin),
      operatingMargin: round2(operatingMargin),
      foodCostPct: round2(foodCostPct),
      laborCostPct: round2(laborCostPct),
      primeCostPct: round2(primeCostPct),
      averageTicket: round2(k.averageTicket),
      totalHoursWorked: round2(k.totalHoursWorked),
      productivityPerHour: round2(k.productivityPerHour),
      bestHourLabel: k.bestHourLabel,
      bestHourSales: round2(k.bestHourSales),
      activeSuppliers: k.activeSuppliers,
    },
    targets: { foodCostMaxPct: 35, laborCostMaxPct: 30, primeCostMaxPct: 65 },
    comparisons: {
      currentSales: round2(cmp.current.sales),
      previousSales: round2(cmp.previous.sales),
      lastYearSales: round2(cmp.lastYear.sales),
      deltaPreviousPct: round2(cmp.deltaPreviousPct),
      deltaYoYPct: round2(cmp.deltaYoYPct),
    },
    dailyDigest: ws.dailyDigest && {
      date: ws.dailyDigest.date,
      sales: round2(ws.dailyDigest.sales),
      orders: ws.dailyDigest.orders,
      averageTicket: round2(ws.dailyDigest.averageTicket),
      vsLastWeek: ws.dailyDigest.vsLastWeek && {
        sales: round2(ws.dailyDigest.vsLastWeek.sales),
        deltaPct: round2(ws.dailyDigest.vsLastWeek.deltaPct),
      },
      todayWeather: ws.dailyDigest.todayWeather,
      vsLastYearDow: ws.dailyDigest.vsLastYearDow && {
        sales: round2(ws.dailyDigest.vsLastYearDow.sales),
        date: ws.dailyDigest.vsLastYearDow.date,
        deltaPct: round2(ws.dailyDigest.vsLastYearDow.deltaPct),
        weather: ws.dailyDigest.vsLastYearDow.weather,
      },
      vsLastYearDate: ws.dailyDigest.vsLastYearDate && {
        sales: round2(ws.dailyDigest.vsLastYearDate.sales),
        date: ws.dailyDigest.vsLastYearDate.date,
        deltaPct: round2(ws.dailyDigest.vsLastYearDate.deltaPct),
        weather: ws.dailyDigest.vsLastYearDate.weather,
      },
      forecastTomorrow: ws.dailyDigest.forecastTomorrow && {
        date: ws.dailyDigest.forecastTomorrow.date,
        sales: round2(ws.dailyDigest.forecastTomorrow.sales),
        baselineSales: round2(ws.dailyDigest.forecastTomorrow.baselineSales),
        tempFactor: round2(ws.dailyDigest.forecastTomorrow.tempFactor),
        tomorrowTempMax: ws.dailyDigest.forecastTomorrow.tomorrowTempMax,
        avgHistoricalTempMax: ws.dailyDigest.forecastTomorrow.avgHistoricalTempMax,
      },
    },
    familyMovements: ws.familyMovements.slice(0, 10).map((m) => ({
      family: m.family,
      currentSales: round2(m.currentSales),
      previousSales: round2(m.previousSales),
      deltaEur: round2(m.deltaEur),
      deltaPct: round2(m.deltaPct),
    })),
    topProductsByAmount: ws.topProducts.slice(0, 10).map((p) => ({
      name: p.productName,
      units: round2(p.units),
      amount: round2(p.amount),
    })),
    topProductsByMargin: ws.topProducts
      .map((p) => {
        const ps = costMap.get(p.productName) ?? null;
        // Best-effort cost lookup by name match (workspace doesn't keep
        // product_costs joined per top-product). Skip if we can't compute.
        const unitCost = 0; // simplified — Claude can call query_database for precise cost
        const margin = p.amount - unitCost * p.units;
        void ps;
        return { name: p.productName, amount: round2(p.amount), margin: round2(margin) };
      })
      .sort((a, b) => b.margin - a.margin)
      .slice(0, 10),
    hourlyPattern,
    topSuppliers,
    supplierConcentrationTop3Pct: round2(top3Share),
    invoiceCount: ws.invoices.length,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ---------- SQL escape hatch ---------- */

async function executeReadOnlyQuery(sqlQuery: string): Promise<{ rows: Record<string, unknown>[]; error?: string }> {
  const trimmed = sqlQuery.trim().toUpperCase();
  if (!trimmed.startsWith("SELECT") && !trimmed.startsWith("WITH")) {
    return { rows: [], error: "Només es permeten queries SELECT." };
  }

  const blocked = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE", "CREATE", "GRANT", "REVOKE"];
  for (const kw of blocked) {
    if (trimmed.includes(kw) && !trimmed.includes(`'${kw}`) && !trimmed.includes(`"${kw}`)) {
      return { rows: [], error: `Operació "${kw}" no permesa.` };
    }
  }

  if (!hasDatabase()) {
    return { rows: [], error: "Base de dades no configurada." };
  }

  try {
    const sql = getSql();
    const rows = await sql.query(sqlQuery);
    const limited = (rows as Record<string, unknown>[]).slice(0, 50);
    console.log(`[telegram-claude] SQL Result: ${limited.length} rows`);
    return { rows: limited };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[telegram-claude] SQL error: ${msg}`);
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
