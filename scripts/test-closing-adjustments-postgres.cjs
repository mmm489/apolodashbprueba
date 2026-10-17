const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { insertAdjustment } = require('./lib/closing-adjustments.cjs');

// Temporary tables only, always rolled back. Pass a connected PostgreSQL client.
async function testAdjustmentStorage(client, migration) {
  await client.query('BEGIN');
  try {
    await client.query('CREATE TEMP TABLE cash_closings(id INTEGER PRIMARY KEY, total_sales NUMERIC(10,2))');
    await client.query('INSERT INTO pg_temp.cash_closings VALUES(1,100)');
    await client.query(migration.replaceAll('pos.', 'pg_temp.'));
    const record = { id: randomUUID(), closing_id: 1, batch_key: 'test', recorded_by: 'Test', reason: 'Test only',
      original_snapshot: { id: 1, total_sales: 100 }, corrected_snapshot: { total_sales: 110 },
      evidence: [{ id: 1, invoice_number: 'TEST-1', total: 10 }], source_sha256: 'a'.repeat(64) };
    const tempClient = { query: (sql, args) => client.query(sql.replaceAll('pos.', 'pg_temp.'), args) };
    assert.equal((await insertAdjustment(tempClient, record)).created, true);
    assert.equal((await insertAdjustment(tempClient, { ...record, id: randomUUID() })).created, false);
    assert.equal((await client.query('SELECT COUNT(*)::int AS n FROM pg_temp.cash_closing_adjustments')).rows[0].n, 1);
    for (const sql of ['UPDATE pg_temp.cash_closing_adjustments SET reason=\'changed\'',
      'DELETE FROM pg_temp.cash_closing_adjustments', 'TRUNCATE pg_temp.cash_closing_adjustments']) {
      await client.query('SAVEPOINT mutation');
      await assert.rejects(() => client.query(sql), /append-only/);
      await client.query('ROLLBACK TO SAVEPOINT mutation');
    }
    assert.equal(Number((await client.query('SELECT total_sales FROM pg_temp.cash_closings')).rows[0].total_sales), 100);
    return { duplicateBlocked: true, updateBlocked: true, deleteBlocked: true, truncateBlocked: true, originalUnchanged: true };
  } finally { await client.query('ROLLBACK'); }
}
module.exports = { testAdjustmentStorage };
