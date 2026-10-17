const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');

const cents = value => {
  assert.ok(value !== null && value !== undefined && Number.isFinite(Number(value)), 'Missing or invalid amount');
  return Math.round(Number(value) * 100);
};
const stable = value => JSON.stringify(canonical(value));
function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}

// Only the verified missing-invoice case is supported, not arbitrary manual balancing.
function prepareAdjustment({ original, corrected, evidence, expected, batchKey, recordedBy, reason }) {
  assert.ok(batchKey?.trim() && recordedBy?.trim() && reason?.trim(), 'Audit metadata required');
  assert.equal(String(original.id), String(expected.id), 'Wrong closing');
  assert.equal(original.z_label, expected.label, 'Wrong Z');
  assert.equal(cents(original.total_sales), cents(expected.original), 'Original Z changed');
  assert.equal(cents(corrected.total_sales), cents(expected.corrected), 'Sales changed since approval');
  assert.equal(Number(corrected.ticket_count) - Number(original.ticket_count), expected.tickets, 'Ticket delta changed');
  assert.equal(evidence.length, expected.tickets, 'Missing evidence');
  assert.equal(new Set(evidence.map(e => String(e.id))).size, evidence.length, 'Duplicate evidence');
  const from = new Date(original.opened_at).getTime(), until = new Date(original.closed_at).getTime();
  assert.ok(Number.isFinite(from) && Number.isFinite(until) && from < until, 'Invalid closing interval');
  for (const e of evidence) {
    assert.ok(e.invoice_number && e.status !== 'cancelled' && (e.business_unit ?? 'hicream') === 'hicream', 'Not an eligible invoice');
    assert.ok(['cash', 'card', 'manual'].includes(e.payment_method), 'Unknown payment method');
    assert.ok(cents(e.total) > 0, 'Evidence must be a positive sale');
    assert.ok(new Date(e.created_at).getTime() >= from && new Date(e.created_at).getTime() < until, 'Invoice outside closing');
    assert.ok(new Date(e.first_kds_progress_at).getTime() >= until, 'KDS evidence does not explain omission');
  }
  for (const field of ['total_sales', 'total_cash', 'total_card']) {
    const eligible = evidence.filter(e => field === 'total_sales' || (field === 'total_cash' ? e.payment_method === 'cash' : ['card', 'manual'].includes(e.payment_method)));
    assert.equal(cents(corrected[field]) - cents(original[field]), eligible.reduce((n, e) => n + cents(e.total), 0), `${field} does not match evidence`);
  }
  for (const [field, methods] of [['cash_count', ['cash']], ['card_count', ['card', 'manual']]]) {
    assert.equal(Number(corrected[field]) - Number(original[field]), evidence.filter(e => methods.includes(e.payment_method)).length, `${field} does not match evidence`);
  }
  assert.equal(cents(corrected.total_sales), cents(corrected.total_cash) + cents(corrected.total_card), 'Payment totals do not balance');
  assert.equal(Number(corrected.ticket_count), Number(corrected.cash_count) + Number(corrected.card_count), 'Ticket counts do not balance');
  assert.equal(cents(corrected.total_refunded), cents(original.total_refunded), 'Refunds changed');
  const data = { original_snapshot: canonical(original), corrected_snapshot: canonical(corrected), evidence: canonical(evidence) };
  return { id: randomUUID(), closing_id: Number(original.id), batch_key: batchKey, recorded_by: recordedBy, reason, ...data,
    source_sha256: createHash('sha256').update(stable(data)).digest('hex') };
}

// Caller owns the transaction. All batch records must commit together.
async function insertAdjustment(client, record) {
  await client.query('SELECT id FROM pos.cash_closings WHERE id=$1 FOR UPDATE', [record.closing_id]);
  const existing = (await client.query('SELECT * FROM pos.cash_closing_adjustments WHERE closing_id=$1 ORDER BY recorded_at DESC,id DESC LIMIT 1', [record.closing_id])).rows[0];
  if (existing) {
    assert.equal(existing.batch_key, record.batch_key, 'A different adjustment already exists; review before changing it');
    assert.equal(existing.source_sha256, record.source_sha256, 'Existing adjustment has different evidence');
    assert.equal(existing.reason, record.reason, 'Existing adjustment has a different reason');
    assert.equal(existing.recorded_by, record.recorded_by, 'Existing adjustment has different attribution');
    for (const key of ['original_snapshot', 'corrected_snapshot', 'evidence']) assert.equal(stable(existing[key]), stable(record[key]), `Existing ${key} changed`);
    return { created: false, id: existing.id };
  }
  await client.query(`INSERT INTO pos.cash_closing_adjustments
    (id,closing_id,batch_key,recorded_by,reason,original_snapshot,corrected_snapshot,evidence,source_sha256)
    VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9)`,
    [record.id,record.closing_id,record.batch_key,record.recorded_by,record.reason,stable(record.original_snapshot),stable(record.corrected_snapshot),stable(record.evidence),record.source_sha256]);
  return { created: true, id: record.id };
}

module.exports = { prepareAdjustment, insertAdjustment, stable };
