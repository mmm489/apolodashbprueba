import { neon } from "@neondatabase/serverless";

import { env } from "@/lib/env";

export type DashboardDataSource = "legacy" | "pos";

export function getDashboardDataSource(): DashboardDataSource {
  return env.DASHBOARD_DATA_SOURCE === "pos" ? "pos" : "legacy";
}

export function isPosDataSource() {
  return getDashboardDataSource() === "pos";
}

function getDatabaseUrl() {
  return env.DASHBOARD_DATABASE_URL ?? env.DATABASE_URL;
}

export function hasDatabase() {
  return Boolean(getDatabaseUrl());
}

export function getSql() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("DASHBOARD_DATABASE_URL or DATABASE_URL is not configured.");
  }

  return neon(databaseUrl);
}
