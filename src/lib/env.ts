const env = {
  DATABASE_URL: process.env.DATABASE_URL,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
  INGESTION_WEBHOOK_SECRET: process.env.INGESTION_WEBHOOK_SECRET,
  APP_URL: process.env.APP_URL ?? "http://localhost:3000",
  ONEDRIVE_INPUT_DIR: process.env.ONEDRIVE_INPUT_DIR,
  OCR_LANG: process.env.OCR_LANG ?? "spa",
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
  ANTHROPIC_FALLBACK_MODELS:
    process.env.ANTHROPIC_FALLBACK_MODELS ??
    "claude-sonnet-4-6-20250514,claude-3-5-sonnet-20241022",
  MICROSOFT_TENANT_ID: process.env.MICROSOFT_TENANT_ID,
  MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID,
  MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET,
  MICROSOFT_DRIVE_ID: process.env.MICROSOFT_DRIVE_ID,
  MICROSOFT_ONEDRIVE_FOLDER_PATH: process.env.MICROSOFT_ONEDRIVE_FOLDER_PATH ?? "/Heladeria/entrada",
};

export function requireEnv(name: keyof typeof env) {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export { env };
