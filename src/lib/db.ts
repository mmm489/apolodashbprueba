import { neon } from "@neondatabase/serverless";
import { Pool } from "pg";

import { env } from "@/lib/env";

export type DashboardDataSource = "legacy" | "pos";
type SqlTag = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;
type SqlClient = SqlTag & {
  query: (text: string, values?: unknown[]) => Promise<Record<string, unknown>[]>;
};

let pgPool: Pool | null = null;
let pgPoolUrl: string | null = null;

export function getDashboardDataSource(): DashboardDataSource {
  return env.DASHBOARD_DATA_SOURCE === "pos" ? "pos" : "legacy";
}

export function isPosDataSource() {
  return getDashboardDataSource() === "pos";
}

function getDatabaseUrl() {
  return env.DASHBOARD_DATABASE_URL ?? env.DATABASE_URL;
}

function shouldUsePg(databaseUrl: string) {
  return isPosDataSource() || databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1");
}

function getPgSql(databaseUrl: string): SqlClient {
  if (!pgPool || pgPoolUrl !== databaseUrl) {
    pgPool = new Pool({ connectionString: databaseUrl });
    pgPoolUrl = databaseUrl;
  }

  const tag: SqlTag = async (strings, ...values) => {
    let text = "";
    strings.forEach((part, index) => {
      text += part;
      if (index < values.length) {
        text += `$${index + 1}`;
      }
    });
    const result = await pgPool!.query(text, values);
    return result.rows as Record<string, unknown>[];
  };

  return Object.assign(tag, {
    query: async (text: string, values: unknown[] = []) => {
      const result = await pgPool!.query(text, values);
      return result.rows as Record<string, unknown>[];
    },
  });
}

export function hasDatabase() {
  return Boolean(getDatabaseUrl());
}

export function getSql(): SqlClient {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("DASHBOARD_DATABASE_URL or DATABASE_URL is not configured.");
  }

  if (shouldUsePg(databaseUrl)) {
    return getPgSql(databaseUrl);
  }

  return neon(databaseUrl) as unknown as SqlClient;
}
