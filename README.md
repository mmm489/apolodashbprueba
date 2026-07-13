# Apolo Heladeria Dashboard

Dashboard web y asistente de Telegram para analizar ventas, gastos, nominas y extractos bancarios a partir de PDFs.

## Stack

- `Next.js` App Router
- `Neon` para datos operativos
- `Claude` para extraccion y chat analitico
- `Telegram` para consultas rapidas
- subida directa de PDFs desde la web

## Arranque

1. Instala dependencias: `npm install`
2. Copia `.env.example` a `.env.local` y rellena credenciales.
3. Crea tablas: `npm run db:setup`
4. Arranca la app: `npm run dev`
5. Sube PDFs desde la portada o usa el endpoint de subida

## Scripts

- `npm run dev`: entorno local
- `npm run build`: build de produccion
- `npm run lint`: ESLint
- `npm run typecheck`: validacion TypeScript
- `npm run db:setup`: crea tablas base en Neon
- `npm run ingest:onedrive`: escanea la carpeta configurada en `ONEDRIVE_INPUT_DIR`
- `npm run ingest:graph`: sincroniza PDFs desde OneDrive usando Microsoft Graph

## Produccion recomendada

- Codigo en GitHub
- Web y APIs en Vercel
- Base de datos en Neon
- PDFs subidos desde la propia app
- OneDrive personal opcional para importar facturas automaticamente

## OneDrive personal

La pagina `Despeses` puede conectarse a una cuenta personal de OneDrive mediante OAuth. El dashboard crea una carpeta privada de la aplicacion, procesa tambien sus subcarpetas y evita duplicados por contenido.

La configuracion completa esta en [`docs/onedrive-personal.md`](docs/onedrive-personal.md).

## Variables para Graph

- `MICROSOFT_TENANT_ID`
- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `MICROSOFT_DRIVE_ID`
- `MICROSOFT_ONEDRIVE_FOLDER_PATH`
- `INGESTION_WEBHOOK_SECRET`

## Flujo recomendado ahora

1. Entrar en la web
2. Subir uno o varios PDFs
3. El backend los clasifica y extrae datos
4. Los resultados se guardan en Neon
5. El dashboard y Telegram usan esos datos
