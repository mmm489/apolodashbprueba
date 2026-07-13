import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";
import { ingestPdfBuffer } from "@/lib/ingestion/service";
import {
  getOneDriveConnection,
  recordOneDriveSyncRun,
  saveOneDriveConnection,
  stopOneDriveSyncWithError,
  tryStartOneDriveSync,
  updateOneDriveRefreshToken,
  updateOneDriveSyncState,
  type OneDriveSyncResult,
} from "@/lib/onedrive-repository";

const MICROSOFT_OAUTH_BASE = "https://login.microsoftonline.com/consumers/oauth2/v2.0";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const INBOX_NAME = "Facturas pendientes";
const OAUTH_SCOPES = ["offline_access", "Files.ReadWrite.AppFolder"];
const SUPPORTED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];
const IGNORED_FOLDERS = new Set(["procesadas", "processades", "no facturas", "no-facturas", "archivadas", "arxivades"]);

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type GraphDrive = { id: string };
type GraphItem = {
  id: string;
  name: string;
  webUrl?: string;
  file?: { mimeType?: string };
  folder?: Record<string, unknown>;
  deleted?: Record<string, unknown>;
  parentReference?: { path?: string };
};
type DeltaPage = {
  value: GraphItem[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
};

export type OneDriveConnectionStatus = {
  available: boolean;
  configured: boolean;
  connected: boolean;
  folderName?: string;
  folderWebUrl?: string | null;
  lastSyncAt?: string | null;
  lastSuccessAt?: string | null;
  lastError?: string | null;
  reason?: string;
};

export function isPersonalOneDriveOAuthConfigured() {
  return Boolean(
    env.MICROSOFT_OAUTH_CLIENT_ID &&
      env.MICROSOFT_OAUTH_CLIENT_SECRET &&
      env.ONEDRIVE_TOKEN_ENCRYPTION_KEY,
  );
}

export function getPersonalOneDriveRedirectUri() {
  if (env.MICROSOFT_OAUTH_REDIRECT_URI) return env.MICROSOFT_OAUTH_REDIRECT_URI;
  return new URL("/api/onedrive/oauth/callback", env.APP_URL).toString();
}

export function createOneDriveOAuthState() {
  return randomBytes(32).toString("base64url");
}

export function statesMatch(expected: string | undefined, actual: string | null) {
  if (!expected || !actual) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function buildOneDriveAuthorizeUrl(state: string) {
  assertPersonalOAuthConfigured();
  const url = new URL(`${MICROSOFT_OAUTH_BASE}/authorize`);
  url.searchParams.set("client_id", env.MICROSOFT_OAUTH_CLIENT_ID!);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", getPersonalOneDriveRedirectUri());
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", OAUTH_SCOPES.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

export async function connectPersonalOneDrive(authorizationCode: string) {
  assertPersonalOAuthConfigured();
  const token = await requestToken({
    grant_type: "authorization_code",
    code: authorizationCode,
    redirect_uri: getPersonalOneDriveRedirectUri(),
  });
  if (!token.refresh_token) {
    throw new Error("Microsoft no ha entregado un permiso renovable. Vuelve a conectar OneDrive.");
  }

  const drive = await graphJson<GraphDrive>("/me/drive", token.access_token);
  const inbox = await ensureInvoiceInbox(token.access_token);
  await saveOneDriveConnection({
    refreshTokenEncrypted: encryptSecret(token.refresh_token),
    driveId: drive.id,
    rootFolderId: inbox.id,
    folderName: inbox.name,
    folderWebUrl: inbox.webUrl ?? null,
  });
}

export async function getPersonalOneDriveStatus(): Promise<OneDriveConnectionStatus> {
  const configured = isPersonalOneDriveOAuthConfigured();
  if (!configured) {
    return {
      available: false,
      configured: false,
      connected: false,
      reason: "Falta configurar la conexión Microsoft de OneDrive en el servidor.",
    };
  }

  const connection = await getOneDriveConnection();
  if (!connection) {
    return {
      available: true,
      configured: true,
      connected: false,
      reason: "Conecta tu cuenta Microsoft para crear la carpeta de facturas.",
    };
  }

  return {
    available: true,
    configured: true,
    connected: true,
    folderName: connection.folderName,
    folderWebUrl: connection.folderWebUrl,
    lastSyncAt: connection.lastSyncAt,
    lastSuccessAt: connection.lastSuccessAt,
    lastError: connection.lastError,
  };
}

export async function syncPersonalOneDriveInvoices() {
  assertPersonalOAuthConfigured();
  const connection = await getOneDriveConnection();
  if (!connection) throw new Error("Primero conecta tu cuenta de OneDrive.");

  const didStart = await tryStartOneDriveSync();
  if (!didStart) {
    return { alreadyRunning: true, processed: 0, duplicated: 0, skipped: 0 };
  }

  try {
    const token = await refreshAccessToken(connection.refreshTokenEncrypted);
    let cursor = connection.deltaLink ?? `${GRAPH_BASE}/drives/${encodeURIComponent(connection.driveId)}/items/${encodeURIComponent(connection.rootFolderId)}/delta`;
    let latestDeltaLink: string | null = connection.deltaLink;
    const result: OneDriveSyncResult = { processed: 0, duplicated: 0, skipped: 0 };

    for (;;) {
      const page = await graphJson<DeltaPage>(cursor, token.accessToken, true);
      latestDeltaLink = page["@odata.deltaLink"] ?? latestDeltaLink;

      for (const item of page.value) {
        if (!isSupportedInvoiceFile(item) || isIgnoredItem(item)) {
          result.skipped += 1;
          continue;
        }

        const buffer = await downloadDriveItem(item.id, token.accessToken);
        const ingestion = await ingestPdfBuffer({
          fileName: item.name,
          sourcePath: getItemPath(item),
          pdfBuffer: buffer,
        });
        if (ingestion.duplicated) {
          result.duplicated += 1;
        } else {
          result.processed += 1;
        }
      }

      if (page["@odata.nextLink"]) {
        cursor = page["@odata.nextLink"]!;
        continue;
      }
      break;
    }

    await updateOneDriveRefreshToken(token.refreshTokenEncrypted);
    await updateOneDriveSyncState({ deltaLink: latestDeltaLink, result });
    await recordOneDriveSyncRun({ status: "success", result });
    return { alreadyRunning: false, ...result };
  } catch (error) {
    const message = describeError(error);
    await stopOneDriveSyncWithError(message);
    await recordOneDriveSyncRun({ status: "error", error: message });
    throw error;
  }
}

async function refreshAccessToken(encryptedRefreshToken: string) {
  const refreshToken = decryptSecret(encryptedRefreshToken);
  const response = await requestToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  return {
    accessToken: response.access_token,
    refreshTokenEncrypted: encryptSecret(response.refresh_token ?? refreshToken),
  };
}

async function requestToken(values: Record<string, string>) {
  const body = new URLSearchParams({
    client_id: env.MICROSOFT_OAUTH_CLIENT_ID!,
    client_secret: env.MICROSOFT_OAUTH_CLIENT_SECRET!,
    scope: OAUTH_SCOPES.join(" "),
    ...values,
  });
  const response = await fetch(`${MICROSOFT_OAUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || `Microsoft no ha autorizado la conexión (${response.status}).`);
  }
  return payload;
}

async function ensureInvoiceInbox(accessToken: string) {
  const appRoot = await graphJson<GraphItem>("/me/drive/special/approot", accessToken);
  const children = await graphJson<{ value: GraphItem[] }>(
    `/me/drive/items/${encodeURIComponent(appRoot.id)}/children?$select=id,name,folder,webUrl`,
    accessToken,
  );
  const existing = children.value.find((item) => item.folder && item.name.toLocaleLowerCase("es-ES") === INBOX_NAME.toLocaleLowerCase("es-ES"));
  if (existing) return existing;

  const created = await graphJson<GraphItem>(
    `/me/drive/items/${encodeURIComponent(appRoot.id)}/children`,
    accessToken,
    false,
    {
      method: "POST",
      body: JSON.stringify({
        name: INBOX_NAME,
        folder: {},
        "@microsoft.graph.conflictBehavior": "fail",
      }),
    },
  );
  return created;
}

async function downloadDriveItem(itemId: string, accessToken: string) {
  const response = await fetch(`${GRAPH_BASE}/me/drive/items/${encodeURIComponent(itemId)}/content`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`No se ha podido descargar una factura de OneDrive (${response.status}).`);
  return Buffer.from(await response.arrayBuffer());
}

async function graphJson<T>(pathOrUrl: string, accessToken: string, absolute = false, init?: RequestInit): Promise<T> {
  const url = absolute ? pathOrUrl : `${GRAPH_BASE}${pathOrUrl}`;
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(url, {
    ...init,
    headers,
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(payload?.error?.message || `Microsoft Graph ha devuelto un error (${response.status}).`);
  }
  return (await response.json()) as T;
}

function isSupportedInvoiceFile(item: GraphItem) {
  if (!item.file || item.deleted) return false;
  const lowerName = item.name.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}

function isIgnoredItem(item: GraphItem) {
  const parentPath = item.parentReference?.path ?? "";
  const pathParts = parentPath
    .replace("/drive/root:", "")
    .split("/")
    .map((part) => part.trim().toLocaleLowerCase("es-ES"));
  return pathParts.some((part) => IGNORED_FOLDERS.has(part));
}

function getItemPath(item: GraphItem) {
  const parentPath = item.parentReference?.path?.replace("/drive/root:", "") ?? "/Apps/Apolo Dashboard/Facturas pendientes";
  return `OneDrive${parentPath}/${item.name}`.replaceAll("//", "/");
}

function assertPersonalOAuthConfigured() {
  if (!isPersonalOneDriveOAuthConfigured()) {
    throw new Error("Falta configurar Microsoft OAuth y la clave de cifrado de OneDrive en Vercel.");
  }
}

function encryptionKey() {
  const value = env.ONEDRIVE_TOKEN_ENCRYPTION_KEY;
  if (!value) throw new Error("Falta ONEDRIVE_TOKEN_ENCRYPTION_KEY.");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("ONEDRIVE_TOKEN_ENCRYPTION_KEY debe contener 32 bytes en base64.");
  return key;
}

function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptSecret(value: string) {
  const [ivEncoded, tagEncoded, encryptedEncoded] = value.split(".");
  if (!ivEncoded || !tagEncoded || !encryptedEncoded) throw new Error("El permiso guardado de OneDrive no es válido. Vuelve a conectar la cuenta.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivEncoded, "base64url"));
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedEncoded, "base64url")), decipher.final()]).toString("utf8");
}

function describeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Error desconocido al sincronizar OneDrive.";
  return message.slice(0, 1000);
}
