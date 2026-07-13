import { randomUUID } from "node:crypto";

import { getSql, hasDatabase } from "@/lib/db";

const CONNECTION_ID = "personal-onedrive";

export type OneDriveConnection = {
  id: string;
  refreshTokenEncrypted: string;
  driveId: string;
  rootFolderId: string;
  folderName: string;
  folderWebUrl: string | null;
  deltaLink: string | null;
  lastSyncAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OneDriveSyncResult = {
  processed: number;
  duplicated: number;
  skipped: number;
};

type Sql = ReturnType<typeof getSql>;

let tablesEnsured = false;

async function ensureOneDriveTables(sql: Sql) {
  if (tablesEnsured) return;

  await sql.query(`
    CREATE TABLE IF NOT EXISTS public.onedrive_connections (
      id TEXT PRIMARY KEY,
      refresh_token_encrypted TEXT NOT NULL,
      drive_id TEXT NOT NULL,
      root_folder_id TEXT NOT NULL,
      folder_name TEXT NOT NULL,
      folder_web_url TEXT,
      delta_link TEXT,
      sync_started_at TIMESTAMPTZ,
      last_sync_at TIMESTAMPTZ,
      last_success_at TIMESTAMPTZ,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await sql.query(`
    CREATE TABLE IF NOT EXISTS public.onedrive_sync_runs (
      id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL REFERENCES public.onedrive_connections(id) ON DELETE CASCADE,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ,
      status TEXT NOT NULL,
      processed_count INTEGER NOT NULL DEFAULT 0,
      duplicate_count INTEGER NOT NULL DEFAULT 0,
      skipped_count INTEGER NOT NULL DEFAULT 0,
      error_message TEXT
    )
  `);
  await sql.query("CREATE INDEX IF NOT EXISTS idx_onedrive_sync_runs_started_at ON public.onedrive_sync_runs(started_at DESC)");
  await sql.query("ALTER TABLE public.onedrive_connections ADD COLUMN IF NOT EXISTS sync_started_at TIMESTAMPTZ");
  tablesEnsured = true;
}

export async function getOneDriveConnection(): Promise<OneDriveConnection | null> {
  if (!hasDatabase()) return null;

  const sql = getSql();
  await ensureOneDriveTables(sql);
  const rows = await sql.query("SELECT * FROM public.onedrive_connections WHERE id = $1 LIMIT 1", [CONNECTION_ID]);
  return rows[0] ? mapConnection(rows[0]) : null;
}

export async function saveOneDriveConnection(input: {
  refreshTokenEncrypted: string;
  driveId: string;
  rootFolderId: string;
  folderName: string;
  folderWebUrl?: string | null;
}) {
  if (!hasDatabase()) throw new Error("No hay base de datos configurada para guardar la conexión de OneDrive.");

  const sql = getSql();
  await ensureOneDriveTables(sql);
  await sql.query(
    `INSERT INTO public.onedrive_connections
      (id, refresh_token_encrypted, drive_id, root_folder_id, folder_name, folder_web_url)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
       drive_id = EXCLUDED.drive_id,
       root_folder_id = EXCLUDED.root_folder_id,
       folder_name = EXCLUDED.folder_name,
       folder_web_url = EXCLUDED.folder_web_url,
       delta_link = NULL,
       sync_started_at = NULL,
       last_error = NULL,
       updated_at = NOW()`,
    [CONNECTION_ID, input.refreshTokenEncrypted, input.driveId, input.rootFolderId, input.folderName, input.folderWebUrl ?? null],
  );
}

export async function updateOneDriveRefreshToken(refreshTokenEncrypted: string) {
  if (!hasDatabase()) return;
  const sql = getSql();
  await ensureOneDriveTables(sql);
  await sql.query(
    "UPDATE public.onedrive_connections SET refresh_token_encrypted = $1, updated_at = NOW() WHERE id = $2",
    [refreshTokenEncrypted, CONNECTION_ID],
  );
}

export async function updateOneDriveSyncState(input: {
  deltaLink?: string | null;
  result?: OneDriveSyncResult;
  error?: string | null;
}) {
  if (!hasDatabase()) return;
  const sql = getSql();
  await ensureOneDriveTables(sql);
  const isSuccess = Boolean(input.result) && !input.error;
  await sql.query(
    `UPDATE public.onedrive_connections
     SET delta_link = COALESCE($1, delta_link),
         sync_started_at = NULL,
         last_sync_at = NOW(),
         last_success_at = CASE WHEN $2 THEN NOW() ELSE last_success_at END,
         last_error = $3,
         updated_at = NOW()
     WHERE id = $4`,
    [input.deltaLink ?? null, isSuccess, input.error ?? null, CONNECTION_ID],
  );
}

export async function tryStartOneDriveSync() {
  if (!hasDatabase()) return false;
  const sql = getSql();
  await ensureOneDriveTables(sql);
  const rows = await sql.query(
    `UPDATE public.onedrive_connections
     SET sync_started_at = NOW(), updated_at = NOW()
     WHERE id = $1
       AND (sync_started_at IS NULL OR sync_started_at < NOW() - INTERVAL '20 minutes')
     RETURNING id`,
    [CONNECTION_ID],
  );
  return rows.length > 0;
}

export async function stopOneDriveSyncWithError(error: string) {
  if (!hasDatabase()) return;
  const sql = getSql();
  await ensureOneDriveTables(sql);
  await sql.query(
    `UPDATE public.onedrive_connections
     SET sync_started_at = NULL, last_sync_at = NOW(), last_error = $1, updated_at = NOW()
     WHERE id = $2`,
    [error, CONNECTION_ID],
  );
}

export async function recordOneDriveSyncRun(input: {
  status: "running" | "success" | "error";
  result?: OneDriveSyncResult;
  error?: string | null;
}) {
  if (!hasDatabase()) return;
  const sql = getSql();
  await ensureOneDriveTables(sql);
  await sql.query(
    `INSERT INTO public.onedrive_sync_runs
      (id, connection_id, finished_at, status, processed_count, duplicate_count, skipped_count, error_message)
     VALUES ($1, $2, CASE WHEN $3 = 'running' THEN NULL ELSE NOW() END, $3, $4, $5, $6, $7)`,
    [
      randomUUID(),
      CONNECTION_ID,
      input.status,
      input.result?.processed ?? 0,
      input.result?.duplicated ?? 0,
      input.result?.skipped ?? 0,
      input.error ?? null,
    ],
  );
}

export async function deleteOneDriveConnection() {
  if (!hasDatabase()) return;
  const sql = getSql();
  await ensureOneDriveTables(sql);
  await sql.query("DELETE FROM public.onedrive_connections WHERE id = $1", [CONNECTION_ID]);
}

function mapConnection(row: Record<string, unknown>): OneDriveConnection {
  return {
    id: String(row.id),
    refreshTokenEncrypted: String(row.refresh_token_encrypted),
    driveId: String(row.drive_id),
    rootFolderId: String(row.root_folder_id),
    folderName: String(row.folder_name),
    folderWebUrl: row.folder_web_url == null ? null : String(row.folder_web_url),
    deltaLink: row.delta_link == null ? null : String(row.delta_link),
    lastSyncAt: toIso(row.last_sync_at),
    lastSuccessAt: toIso(row.last_success_at),
    lastError: row.last_error == null ? null : String(row.last_error),
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date().toISOString(),
  };
}

function toIso(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}
