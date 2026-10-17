# Stored closing reader for Odoo

`GET /api/integrations/odoo/closings?from=YYYY-MM-DD&to=YYYY-MM-DD` reads the
stored `pos.cash_closings` snapshot. It never joins live orders, reconstructs
VAT, writes to the POS, or runs schema setup. The existing dashboard stays unchanged.

Authentication is independent of browser cookies. The Odoo server signs
`GET\n<pathname and query string>\n<Unix timestamp>` using its Ed25519 private key.
Headers: `x-apolo-key-id`, `x-apolo-timestamp`, `x-apolo-signature` (base64).
Timestamp tolerance is 300 seconds. The public verification key is in
`src/lib/odoo-reader-auth.ts`; removing it revokes access. No private keys go in Git.
This signature grants access only to this GET route. A captured request is bounded
to its exact read and five-minute lifetime, and cannot change the source.

Only ranges from 2026-10-01, no longer than 31 days, are accepted. Company identity
must be present in each stored snapshot and match ESB55775068. A missing identity
fails closed; no fallback to mutable company settings. Results are never cached.
Numeric totals are decimal strings and both stored VAT totals and their saved
breakdown are preserved even when they differ. Odoo flags inconsistencies and
archives the first copy; it does not overwrite originals or post sales.

Verification: `npx tsx scripts/test-odoo-reader.ts`, `npm run typecheck`, `npm run build`.
Rollback: revert the connector commit or remove the public key, and deactivate
the Odoo reader cron. Historical received snapshots remain available.
