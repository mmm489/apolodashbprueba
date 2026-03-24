import { neon } from "@neondatabase/serverless";

import { env } from "@/lib/env";

export function hasDatabase() {
  return Boolean(env.DATABASE_URL);
}

export function getSql() {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return neon(env.DATABASE_URL);
}
