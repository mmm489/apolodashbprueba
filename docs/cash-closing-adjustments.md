# Recorded closing reconciliation

`pos.cash_closings` remains the original issued Z snapshot, including amounts,
invoice range and counters. POS printing, synchronization and the read-only Odoo
snapshot endpoint continue to use that original. No sales or fiscal invoices are
created, changed or removed by this feature.

Apply `scripts/migrate-cash-closing-adjustments.sql` to the dashboard database
before deploying this version. It adds a separate append-only audit table.
No change to the POS database or its synchronization process is required.

## Dashboard

`/cierres` uses a recorded adjustment as its main amount, payment breakdown,
ticket count and invoice range. The original, reason, operator attribution,
timestamp, adjustment ID and affected invoice numbers remain under `Veure ajust`.
Current orders are compared to the recorded amount, not silently substituted for
it. A later difference remains visible. If the original snapshot changes, the
adjustment is flagged for review and is not applied to the main figures.

The repository/API retains the original top-level fields and exposes the audit
record separately as `adjustment`; use `effectiveCashClosing` for the dashboard
display. This deliberately does not change existing snapshot export contracts.

## Controlled recording

`scripts/lib/closing-adjustments.cjs` supports the verified omitted-invoice case.
It requires an approved original/target amount, ticket delta, positive issued
invoices within the exact closing interval, and KDS progress after closure.
Cash/card totals and ticket counts must agree with that evidence. Prepare all
records first, compare the POS and cloud sources, back up originals and evidence,
then insert the entire batch in a single transaction. The caller must verify the
source snapshot remains unchanged before committing.

The batch key and source SHA-256 make retries idempotent. Conflicting evidence
or an existing different adjustment requires a new review. UPDATE, DELETE and
TRUNCATE on audit records are blocked by a database trigger. A database owner
can still change schema protections; this is not cryptographic tamper-proof storage.

Rollback of the UI can show original amounts again without deleting audit records.
Do not edit an issued Z or disable audit protections to undo an adjustment.

## Tests

- `npm run test:cash-closing`
- `npm run test:closing-adjustments`
- `testAdjustmentStorage(client, migrationSql)` from
  `scripts/test-closing-adjustments-postgres.cjs` tests real PostgreSQL storage,
  duplicate prevention and mutation protection using temporary tables and a rollback.

Keep actual business snapshots and batch manifests outside Git.
