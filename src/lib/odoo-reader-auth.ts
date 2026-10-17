import { createPublicKey, verify } from "node:crypto";

export const ODOO_CLOSINGS_PATH = "/api/integrations/odoo/closings";
// Public verification key only. The private key stays on the Odoo server.
// Remove this entry to revoke the reader. It grants GET access to this route only.
const READER_KEYS: Record<string, string> = {
  "apolo-odoo-20261017": "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAmbTWARWchrDAP0C9WPtcppeuQDbvTFZmt5z0IGxvx/0=\n-----END PUBLIC KEY-----",
};

export function verifyOdooReader(
  request: Request,
  now = Date.now(),
  keys: Record<string, string> = READER_KEYS,
): boolean {
  const url = new URL(request.url);
  if (request.method !== "GET" || url.pathname !== ODOO_CLOSINGS_PATH) return false;
  const key = keys[request.headers.get("x-apolo-key-id") ?? ""];
  const timestamp = request.headers.get("x-apolo-timestamp") ?? "";
  const signature = request.headers.get("x-apolo-signature") ?? "";
  if (!key || !/^\d{10}$/.test(timestamp) || !/^[A-Za-z0-9+/]{86}==$/.test(signature)) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  try {
    const message = `GET\n${url.pathname}${url.search}\n${timestamp}`;
    return verify(null, Buffer.from(message), createPublicKey(key), Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}

export function closingDateRange(url: URL): { from: string; to: string } {
  const entries = [...url.searchParams.entries()];
  if (entries.length !== 2 || entries.some(([key]) => !["from", "to"].includes(key))) {
    throw new Error("Use from and to exactly once");
  }
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  for (const value of [from, to]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
      throw new Error("Invalid date");
    }
  }
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
  if (from < "2026-10-01" || days < 0 || days > 30) throw new Error("Maximum range: 31 days, from 2026-10-01");
  return { from, to };
}
