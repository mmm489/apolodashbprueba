import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { closingDateRange, ODOO_CLOSINGS_PATH, verifyOdooReader } from "../src/lib/odoo-reader-auth";
import { hasApoloIdentity, STORED_CLOSINGS_SQL } from "../src/lib/odoo-closings";

const pair = generateKeyPairSync("ed25519");
const other = generateKeyPairSync("ed25519");
const keys = { test: pair.publicKey.export({ type: "spki", format: "pem" }).toString() };
const now = 1792224000000;
const path = `${ODOO_CLOSINGS_PATH}?from=2026-10-01&to=2026-10-16`;
function req(options: { timestamp?: number; method?: string; path?: string; wrongKey?: boolean } = {}) {
  const ts = String(options.timestamp ?? now / 1000);
  const signature = sign(null, Buffer.from(`GET\n${path}\n${ts}`), options.wrongKey ? other.privateKey : pair.privateKey).toString("base64");
  return new Request(`https://example.test${options.path ?? path}`, {
    method: options.method ?? "GET",
    headers: { "x-apolo-key-id": "test", "x-apolo-timestamp": ts, "x-apolo-signature": signature },
  });
}
assert(verifyOdooReader(req(), now, keys));
assert(!verifyOdooReader(new Request(`https://example.test${path}`), now, keys));
assert(!verifyOdooReader(req({ wrongKey: true }), now, keys));
assert(!verifyOdooReader(req({ method: "POST" }), now, keys));
assert(!verifyOdooReader(req({ path: path.replace("10-16", "10-17") }), now, keys));
assert(!verifyOdooReader(req({ path: "/api/employees" }), now, keys));
assert(!verifyOdooReader(req({ timestamp: now / 1000 - 301 }), now, keys));
assert(!verifyOdooReader(req({ timestamp: now / 1000 + 301 }), now, keys));
assert.deepEqual(closingDateRange(new URL(`https://example.test${path}`)), { from: "2026-10-01", to: "2026-10-16" });
for (const query of ["from=2026-09-30&to=2026-10-16", "from=2026-10-01&to=2026-11-01", "from=2026-10-17&to=2026-10-16", "from=2027-02-30&to=2027-03-01", "from=2026-10-01&from=2026-10-01", "from=2026-10-01&to=2026-10-16&extra=1"]) {
  assert.throws(() => closingDateRange(new URL(`https://example.test/?${query}`)));
}
assert(hasApoloIdentity({ business: { nif: "ES B55775068" } }));
assert(!hasApoloIdentity({ business: null }));
assert(!hasApoloIdentity({ business: { nif: "B12345678" } }));
assert(!/\b(JOIN|UPDATE|ALTER|INSERT|DELETE)\b/i.test(STORED_CLOSINGS_SQL));
console.log("Odoo reader authentication, scope, cutoff and stored-source checks passed");
