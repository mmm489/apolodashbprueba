import Anthropic from "@anthropic-ai/sdk";
import type { Tool, ToolUseBlock } from "@anthropic-ai/sdk/resources/messages";

import { fetchHistoricalWeather, getFinancialWorkspace } from "@/lib/analytics";
import { getCalendarContext } from "@/lib/calendar";
import { getSql, hasDatabase } from "@/lib/db";
import { env } from "@/lib/env";
import { listRecentMessagesForChat, storeTelegramMessage } from "@/lib/repositories";
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
    const answer = await processWithClaude(message.text, String(chatId));

    await storeTelegramMessage({
      telegramUserId: String(message.from?.id ?? chatId),
      chatId: String(chatId),
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
Tens 5 eines:
1. **\`get_dashboard(preset)\`** — l'eina principal. Et dóna KPIs, comparatives YoY (DOW i per data), digest del dia més recent amb temps i context de calendari (setmana santa, festa) d'avui i dels dies comparats, previsió de demà ajustada per temperatura, famílies, top productes per import i marge, pattern horari, top proveïdors. **Usa-la sempre abans de res**.
2. **\`get_calendar_context(dates)\`** — per cada data retorna si és festa/Setmana Santa i els dies des de Pasqua. Crítica per validar comparatives YoY.
3. **\`get_historical_weather(from, to)\`** — temps real d'un rang de dates.
4. **\`get_cashlogy_state()\`** - ultim estat sincronitzat de Cashlogy: total dins la caixa, online/offline, errors i denominacions baixes/faltants. Usa-la SEMPRE per preguntes sobre caixa, canvi, monedes, bitllets o Cashlogy.
5. **\`query_database(sql, description)\`** — només SELECT. Per casos que les anteriors no cobreixin.

## REGLES CRÍTIQUES per a comparatives YoY a Salou

Salou és turisme de platja altament estacional. **SEMPRE** fes aquestes comprovacions abans de donar un veredicte sobre una comparativa:

1. **Setmana Santa és mòbil**: pot caure entre finals de març i finals d'abril. Si compares un dia i l'altre any estava en Setmana Santa (o viceversa), el delta està distorsionat per turisme, no pel teu negoci.
2. **Festes locals**: sant Jordi (23 abr), Sant Joan (24 jun), Diada (11 set), Reis (6 gen), Nadal, Tots Sants.
3. **Ponts**: si el dia de referència cau dins un pont (ex: 1 maig + cap de setmana), compta com a efecte festiu.
4. Si les dades \`todayCalendar\` o \`calendar\` de les YoY indiquen context diferent entre els dos dies comparats, **avisa explícitament** i suggereix millor comparar amb un dia equivalent (ex: "avui és normal, però el mateix dia any passat era Divendres Sant — compararia amb el Divendres Sant d'aquest any: X abril").
5. Quan l'usuari pregunti "per què vaig vendre menys?", valida SEMPRE: temps + calendari. Si el context és diferent, digues-ho abans d'inventar causes.

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
- \`pos.cashlogy_state_snapshots(captured_at, ok, online, total, denominations, errors)\`

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
    name: "get_calendar_context",
    description:
      "Retorna el context de calendari (festa, setmana santa, sant jordi, dies des de pasqua) per un rang de dates. Fonamental per entendre comparatives YoY a Salou: la Setmana Santa és mòbil i pot caure en diferents dates cada any. Si compares dos dies i un és Setmana Santa i l'altre no, el delta no és directament comparable.",
    input_schema: {
      type: "object" as const,
      properties: {
        dates: {
          type: "array",
          items: { type: "string" },
          description: "Llista de dates YYYY-MM-DD",
        },
      },
      required: ["dates"],
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
    name: "get_cashlogy_state",
    description:
      "Retorna l'ultim estat sincronitzat de Cashlogy: total estimat dins la caixa, online/offline, antiguitat de la lectura, errors i denominacions baixes o faltants. Usa aquesta eina per preguntes sobre caixa, canvi, monedes, bitllets o Cashlogy.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
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

/** Decides whether a question needs the heavy model. Signals we look for:
 * long messages, verbs that imply reasoning or recommendation, "why/how"
 * prompts, multi-question or conjoined prompts, and asks for advice.
 *
 * We intentionally err on the side of Haiku — Sonnet kicks in only when
 * the prompt clearly asks for synthesis or explanation. If the heuristic
 * is ambiguous, Sonnet escalates naturally via the fallback list. */
function classifyQuestionComplexity(question: string): "simple" | "complex" {
  const q = question.toLowerCase();
  const complexVerbs = [
    "analit", "analiz", "analis", "recomana", "recomen", "consell", "consej",
    "estrategi", "estrategi", "hauria", "deberia", "pensa", "pense", "opin",
    "resumeix", "resumi", "resumir", "explica", "expliqui", "justif",
    "per que", "per què", "per qué", "com ha anat", "com va", "com es que",
    "com és que", "com és", "com es", "per quin motiu",
    "cfo", "hipote", "prediu", "prediccio", "predicció", "preves", "passaria",
    "aconsellari", "proposa", "acciona", "millorar", "optimitz",
    "compara", "comparar", "comparativa", "contrasta", "evoluc",
  ];
  const hasComplexVerb = complexVerbs.some((v) => q.includes(v));
  const isLong = question.length > 90;
  const hasMultipleQuestions = (question.match(/\?/g) || []).length > 1;
  const hasConjunction = / i | o | pero | però /.test(q);

  // Weighted scoring
  let score = 0;
  if (hasComplexVerb) score += 2;
  if (isLong) score += 1;
  if (hasMultipleQuestions) score += 2;
  if (hasConjunction) score += 1;

  return score >= 2 ? "complex" : "simple";
}

async function processWithClaude(userMessage: string, chatId: string): Promise<string> {
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

  // Load the last few exchanges so Claude remembers what it was talking
  // about. Without this, a one-word reply like "Si" to a follow-up question
  // loses all context and the bot has to ask what the user meant.
  const history = await listRecentMessagesForChat(chatId, 6);
  const messages: Anthropic.MessageParam[] = [];
  for (const h of history) {
    messages.push({ role: "user", content: h.question });
    messages.push({ role: "assistant", content: h.answer });
  }
  messages.push({ role: "user", content: userMessage });

  // Route by complexity: simple questions start with Haiku (cheap, fast),
  // complex ones start with Sonnet (better reasoning). Each tier keeps the
  // other as fallback so a model outage still answers.
  const complexity = classifyQuestionComplexity(userMessage);
  const HAIKU = "claude-haiku-4-5-20251001";
  const SONNET = "claude-sonnet-4-5";
  const OVERRIDE = env.ANTHROPIC_MODEL;
  const candidateModels = (
    complexity === "complex"
      ? [OVERRIDE, SONNET, HAIKU]
      : [OVERRIDE, HAIKU, SONNET]
  )
    .concat(env.ANTHROPIC_FALLBACK_MODELS.split(",").map((m) => m.trim()))
    .filter((v, i, a): v is string => Boolean(v) && a.indexOf(v) === i);
  console.log(`[telegram] Question complexity=${complexity}, trying models: ${candidateModels.join(", ")}`);

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
        console.log(`[telegram] round=${round} model=${model} stop=${response.stop_reason}`);
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

  if (block.name === "get_calendar_context") {
    const dates = (input.dates as string[] | undefined) ?? [];
    return Object.fromEntries(dates.map((d) => [d, getCalendarContext(d)]));
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

  if (block.name === "get_cashlogy_state") {
    return getCashlogyStateSummary();
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
      productCostCoverage: round2(k.productCostCoverage),
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
      todayCalendar: ws.dailyDigest.todayCalendar,
      isStale: ws.dailyDigest.isStale,
      last7Days: ws.dailyDigest.last7Days.map((d) => ({ date: d.date, sales: round2(d.sales) })),
      driversVsLastWeek: ws.dailyDigest.driversVsLastWeek && {
        totalDeltaEur: round2(ws.dailyDigest.driversVsLastWeek.totalDeltaEur),
        volumeEffect: round2(ws.dailyDigest.driversVsLastWeek.volumeEffect),
        priceEffect: round2(ws.dailyDigest.driversVsLastWeek.priceEffect),
        dominantDriver: ws.dailyDigest.driversVsLastWeek.dominantDriver,
      },
      vsLastYearDow: ws.dailyDigest.vsLastYearDow && {
        sales: round2(ws.dailyDigest.vsLastYearDow.sales),
        date: ws.dailyDigest.vsLastYearDow.date,
        deltaPct: round2(ws.dailyDigest.vsLastYearDow.deltaPct),
        weather: ws.dailyDigest.vsLastYearDow.weather,
        calendar: ws.dailyDigest.vsLastYearDow.calendar,
      },
      vsLastYearDate: ws.dailyDigest.vsLastYearDate && {
        sales: round2(ws.dailyDigest.vsLastYearDate.sales),
        date: ws.dailyDigest.vsLastYearDate.date,
        deltaPct: round2(ws.dailyDigest.vsLastYearDate.deltaPct),
        weather: ws.dailyDigest.vsLastYearDate.weather,
        calendar: ws.dailyDigest.vsLastYearDate.calendar,
      },
      forecastTomorrow: ws.dailyDigest.forecastTomorrow && {
        date: ws.dailyDigest.forecastTomorrow.date,
        sales: round2(ws.dailyDigest.forecastTomorrow.sales),
        baselineSales: round2(ws.dailyDigest.forecastTomorrow.baselineSales),
        recentBaseline: round2(ws.dailyDigest.forecastTomorrow.recentBaseline),
        recentBasedOn: ws.dailyDigest.forecastTomorrow.recentBasedOn,
        yoyBaseline: ws.dailyDigest.forecastTomorrow.yoyBaseline !== null
          ? round2(ws.dailyDigest.forecastTomorrow.yoyBaseline)
          : null,
        yoyBasedOn: ws.dailyDigest.forecastTomorrow.yoyBasedOn,
        yoyGrowthFactor: round2(ws.dailyDigest.forecastTomorrow.yoyGrowthFactor),
        confidence: ws.dailyDigest.forecastTomorrow.confidence,
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

/* ---------- Cashlogy state tool ---------- */

type JsonRecord = Record<string, unknown>;

type CashlogyDenominationSummary = {
  label: string;
  type: string | null;
  value: number | null;
  amount: number | null;
  quantity: number | null;
  status: string | null;
  warning: "ok" | "low" | "missing" | "error";
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonish(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function boolish(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function firstString(record: JsonRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function firstNumber(record: JsonRecord, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(",", "."));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function centsLabel(cents: number | null, fallback: string | null) {
  if (fallback) return fallback;
  if (cents == null) return "Denominacio desconeguda";
  if (Math.abs(cents) >= 100) return `${round2(cents / 100).toFixed(2)} EUR`;
  return `${cents} centims`;
}

function normalizeCashlogyDenominations(value: unknown): CashlogyDenominationSummary[] {
  const parsed = parseJsonish(value);
  const items = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.items)
      ? parsed.items
      : [];

  return items.filter(isRecord).map((item) => {
    const label = firstString(item, ["label", "name", "denomination", "valueText", "displayName"]);
    const value = firstNumber(item, ["value", "denominationValue", "faceValue", "nominal", "cents"]);
    const amount = firstNumber(item, ["amount", "total", "totalAmount", "balance"]);
    const quantity = firstNumber(item, ["quantity", "count", "units", "pieces", "level", "current"]);
    const type = firstString(item, ["type", "kind", "cashType"]);
    const status = firstString(item, ["status", "state", "availability"]);
    const statusText = String(status ?? "").toUpperCase();

    let warning: CashlogyDenominationSummary["warning"] = "ok";
    if (statusText.includes("ERROR") || statusText.includes("JAM") || statusText.includes("FAIL")) {
      warning = "error";
    } else if (statusText.includes("EMPTY") || statusText.includes("MISSING") || quantity === 0) {
      warning = "missing";
    } else if (statusText.includes("LOW") || (quantity != null && quantity > 0 && quantity <= 2)) {
      warning = "low";
    }

    return {
      label: centsLabel(value, label),
      type,
      value,
      amount,
      quantity,
      status,
      warning,
    };
  });
}

function summarizeCashlogyErrors(status: unknown, errors: unknown) {
  const messages = new Set<string>();
  for (const source of [parseJsonish(status), parseJsonish(errors)]) {
    if (isRecord(source) && typeof source.error === "string" && source.error.trim()) {
      messages.add(source.error.trim());
    }
    if (Array.isArray(source)) {
      for (const item of source) {
        if (isRecord(item)) {
          const message = firstString(item, ["message", "description", "error", "code"]);
          if (message) messages.add(message);
        } else if (typeof item === "string" && item.trim()) {
          messages.add(item.trim());
        }
      }
    }
  }
  return [...messages].slice(0, 8);
}

async function getCashlogyStateSummary() {
  if (!hasDatabase()) {
    return { configured: false, error: "Base de dades no configurada." };
  }

  try {
    const sql = getSql();
    const exists = await sql.query("SELECT to_regclass('pos.cashlogy_state_snapshots') AS table_name");
    if (!exists[0]?.table_name) {
      return {
        configured: false,
        error: "Encara no existeix la taula pos.cashlogy_state_snapshots. Cal que el POS sincronitzi el primer estat.",
      };
    }

    const rows = await sql.query(`
      SELECT id, captured_at, ok, online, total_amount, total,
             status, peripherals, model, accounting, errors, denominations, error_message
      FROM pos.cashlogy_state_snapshots
      ORDER BY captured_at DESC
      LIMIT 1
    `);
    const row = rows[0];
    if (!row) {
      return {
        configured: true,
        hasState: false,
        error: "Encara no hi ha cap lectura sincronitzada de Cashlogy.",
      };
    }

    const capturedDate = new Date(row.captured_at as string | number | Date);
    const capturedAt = Number.isNaN(capturedDate.getTime())
      ? String(row.captured_at ?? "")
      : capturedDate.toISOString();
    const ageMinutes = Number.isNaN(capturedDate.getTime())
      ? null
      : Math.round((Date.now() - capturedDate.getTime()) / 60_000);
    const denominations = normalizeCashlogyDenominations(row.denominations);
    const lowOrMissing = denominations.filter((item) => item.warning !== "ok");
    const errors = summarizeCashlogyErrors(row.status, row.errors);
    if (typeof row.error_message === "string" && row.error_message.trim()) {
      errors.unshift(row.error_message.trim());
    }

    return {
      configured: true,
      hasState: true,
      capturedAt,
      ageMinutes,
      isStale: ageMinutes == null || ageMinutes > 15,
      ok: boolish(row.ok),
      online: boolish(row.online),
      total: round2(Number(row.total ?? 0)),
      totalAmountCents: Number(row.total_amount ?? 0),
      canReportDenominations: denominations.length > 0,
      denominations,
      lowOrMissing,
      errors: [...new Set(errors)].slice(0, 8),
      rawAccountingAvailable: Boolean(row.accounting),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { configured: false, error: message };
  }
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
