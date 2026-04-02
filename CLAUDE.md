# Apolo Heladeria / Gelateria Dashboard

## Que es
Dashboard financer per a la gelateria Apolo (Apolo Holdings). Permet controlar vendes, despeses, nomines, tresoreria, documents i empleats des d'una interficie web.

## Stack tecnic
- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript
- **Estil**: Tailwind CSS v4, tema fosc al sidebar, cards blanques
- **Base de dades**: PostgreSQL a Neon (serverless) via `@neondatabase/serverless`
- **IA**: Anthropic SDK (Claude) per extreure dades de PDFs/imatges i xat analitic
- **Telegram**: Bot amb Telegraf per consultes de negoci
- **Dates**: date-fns, locale `ca-ES`
- **Icones**: lucide-react

## Idioma
Tota la interficie esta en **catala**. Els textos d'UI, respostes del xat, dates i formatejat de moneda usen locale catala/espanyol (`ca-ES` / `es-ES`).

## Arquitectura
```
src/
├── app/                    # Pagines (server components async)
│   ├── page.tsx           # Dashboard principal amb KPIs
│   ├── ventas/            # Vendes diaries + productes
│   ├── finanzas/          # Vista comptable completa
│   ├── gastos/            # Factures + linies + productes
│   ├── tesoreria/         # Moviments bancaris + conciliacio
│   ├── empleados/         # CRUD empleats (horari, dies)
│   ├── documentos/        # Pujada i historial de documents
│   └── api/               # API routes (employees, kpis, ingest, chat, telegram)
├── components/            # Components React (client i server)
│   ├── app-frame.tsx      # Layout amb sidebar + nav
│   ├── *-tabs.tsx         # Tabs per cada seccio
│   ├── empleados-panel.tsx # CRUD empleats (client)
│   └── ...                # Filtres, charts, upload, chat
└── lib/                   # Capa de dades i logica
    ├── schema.ts          # DDL de totes les taules
    ├── types.ts           # Interficies TypeScript
    ├── repositories.ts    # Queries SQL (CRUD) + fallback mock
    ├── analytics.ts       # Workspaces, agregacions, KPIs
    ├── db.ts              # Connexio Neon
    ├── mock-data.ts       # Dades mock per dev sense BD
    ├── ai/claude.ts       # Integracio Claude API
    └── ingestion/         # Extractor + classificador de docs
```

## Patro de dades
1. **Pagina** (server component async) → crida `getXxxWorkspace()` d'`analytics.ts`
2. **Analytics** → crida funcions de `repositories.ts` en parallel amb `Promise.all`
3. **Repositories** → queries SQL directes a Neon, amb fallback a mock si no hi ha `DATABASE_URL`
4. **Tipus** → tot tipat a `types.ts`, satisfies per seguretat

## Taules principals
- `documents` - Fitxers pujats (PDF, Excel, imatge)
- `sales_reports` - Resum diari de vendes
- `hourly_sales` - Vendes per hora
- `product_sales` - Vendes per producte (Articles Venda)
- `invoices` + `invoice_lines` - Factures de proveidors
- `payrolls` - Nomines
- `bank_transactions` - Moviments bancaris
- `employees` - Empleats amb horari (shift_start/end) i dies/mes
- `alerts`, `telegram_users`, `telegram_messages`, `sync_state`

## Funcionalitats clau
- **Empleats**: CRUD complet amb formulari (nom, hora entrada, hora sortida, dies/mes). Les hores/dia es calculen automaticament per diferencia d'horari.
- **Productivitat/hora**: Al dashboard es mostra `vendes totals / hores totals equip`. Es calcula a `getFinancialWorkspace()`.
- **Ingestio de documents**: Puja PDFs/Excel/imatges → Claude els classifica i extreu dades estructurades → es guarden a la BD.
- **Xat analitic**: Preguntes de negoci respondues amb dades reals de la BD.
- **Families de producte** (del TPV): Gelats, Cafes, Begudes, Crepes, Hi Pop, Xurros, Batuts, Especialitats, Frappes, Smoothies, Frozen Iogurt, Granissats, Receptes, Ice Drinks, Berlines, Dought, Infusions, Orxata, Xips, Toppings i extres, Varios.

## Convencions
- Formatejat moneda: `Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" })`
- Dates: `date-fns` + locale `ca-ES` per mostrar
- Filtres per URL search params (preset, from, to, supplier, product, category)
- Navegacio al sidebar definida a `app-frame.tsx` (array `navItems`)
- Colors: indigo per actiu, emerald per vendes, rose per despeses, amber per IVA/warnings
- No hi ha autenticacio implementada

## Scripts utils
- `scripts/setup-db.ts` - Crea totes les taules (CREATE IF NOT EXISTS)
- Per executar: `export $(grep -v '^#' .env.local | xargs) && npx tsx scripts/setup-db.ts`

## Variables d'entorn (.env.local)
- `DATABASE_URL` - Connexio Neon PostgreSQL
- `ANTHROPIC_API_KEY` - API Claude
- `TELEGRAM_BOT_TOKEN` - Bot Telegram
- `MICROSOFT_*` - Credencials Graph API per OneDrive sync
