import { env, requireEnv } from "@/lib/env";

interface GraphItem {
  id: string;
  name: string;
  file?: {
    mimeType?: string;
  };
  deleted?: Record<string, unknown>;
  parentReference?: {
    path?: string;
  };
}

interface DeltaResponse {
  value: GraphItem[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
}

export async function getGraphAccessToken() {
  const tenantId = requireEnv("MICROSOFT_TENANT_ID");
  const clientId = requireEnv("MICROSOFT_CLIENT_ID");
  const clientSecret = requireEnv("MICROSOFT_CLIENT_SECRET");

  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default",
    }),
  });

  if (!response.ok) {
    throw new Error(`Unable to get Microsoft Graph token: ${response.status}`);
  }

  const payload = (await response.json()) as { access_token: string };
  return payload.access_token;
}

export async function fetchFolderItemId(accessToken: string) {
  const driveId = requireEnv("MICROSOFT_DRIVE_ID");
  const normalizedPath = normalizeFolderPath(env.MICROSOFT_ONEDRIVE_FOLDER_PATH);
  const endpoint = normalizedPath
    ? `https://graph.microsoft.com/v1.0/drives/${driveId}/root:${normalizedPath}`
    : `https://graph.microsoft.com/v1.0/drives/${driveId}/root`;

  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Unable to resolve OneDrive folder: ${response.status}`);
  }

  const payload = (await response.json()) as { id: string };
  return payload.id;
}

export async function getDriveDeltaPage(accessToken: string, cursor?: string) {
  const driveId = requireEnv("MICROSOFT_DRIVE_ID");
  const endpoint =
    cursor ??
    `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${await fetchFolderItemId(accessToken)}/delta`;

  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch delta page: ${response.status}`);
  }

  return (await response.json()) as DeltaResponse;
}

export async function downloadDriveItem(accessToken: string, itemId: string) {
  const driveId = requireEnv("MICROSOFT_DRIVE_ID");
  const response = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Unable to download drive item ${itemId}: ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

export function isPdfGraphItem(item: GraphItem) {
  return Boolean(item.file) && !item.deleted && item.name.toLowerCase().endsWith(".pdf");
}

export function getGraphItemPath(item: GraphItem) {
  const parentPath = item.parentReference?.path?.replace("/drive/root:", "") ?? "";
  return `${parentPath}/${item.name}`.replaceAll("//", "/");
}

function normalizeFolderPath(folderPath: string | undefined) {
  if (!folderPath || folderPath === "/") {
    return "";
  }

  return folderPath.startsWith("/") ? folderPath : `/${folderPath}`;
}
