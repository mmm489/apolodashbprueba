const assert = require('node:assert/strict');
const { test } = require('node:test');
const { prepareAdjustment, insertAdjustment } = require('./lib/closing-adjustments.cjs');

function fixture() {
  return { original:{ id:1,z_label:'Z-TEST/1',opened_at:'2026-01-01T02:00:00Z',closed_at:'2026-01-02T02:00:00Z',
    total_sales:100,total_cash:40,total_card:60,ticket_count:10,cash_count:4,card_count:6,total_refunded:0 },
  corrected:{ total_sales:111.75,total_cash:40,total_card:71.75,ticket_count:11,cash_count:4,card_count:7,total_refunded:0 },
  evidence:[{ id:11,invoice_number:'S-TEST/11',total:11.75,payment_method:'card',status:'ready',business_unit:'hicream',
    created_at:'2026-01-01T20:00:00Z',first_kds_progress_at:'2026-01-02T08:00:00Z' }],
  expected:{ id:1,label:'Z-TEST/1',original:100,corrected:111.75,tickets:1 },
  batchKey:'test-batch',recordedBy:'Test actor',reason:'Omitted issued sale' };
}

test('prepares a verified adjustment without mutating its original',()=>{
  const input=fixture(), before=JSON.stringify(input); const result=prepareAdjustment(input);
  assert.equal(JSON.stringify(input),before); assert.equal(result.original_snapshot.total_sales,100);
  assert.equal(result.corrected_snapshot.total_sales,111.75); assert.match(result.source_sha256,/^[a-f0-9]{64}$/);
  assert.equal(prepareAdjustment(fixture()).source_sha256,result.source_sha256);
});
test('rejects changed totals, unexplained payment mix and missing or duplicate evidence',()=>{
  for(const change of [x=>x.original.total_sales=99,x=>x.corrected.total_sales=112,
    x=>x.corrected.total_cash=41,x=>x.corrected.card_count=8,x=>x.evidence=[],
    x=>x.evidence.push({...x.evidence[0]}),x=>x.corrected.total_refunded=1]) {
    const input=fixture();change(input);assert.throws(()=>prepareAdjustment(input));
  }
});
test('rejects drafts, cancelled sales, other business units, out-of-period sales and earlier KDS progress',()=>{
  for(const change of [e=>e.invoice_number=null,e=>e.status='cancelled',e=>e.business_unit='other',
    e=>e.payment_method='parked',e=>e.created_at='2026-01-02T02:00:00Z',
    e=>e.first_kds_progress_at='2026-01-01T22:00:00Z',e=>e.first_kds_progress_at=null]) {
    const input=fixture();change(input.evidence[0]);assert.throws(()=>prepareAdjustment(input));
  }
});
test('requires audit metadata',()=>{
  for(const key of ['batchKey','reason','recordedBy']) {const input=fixture();input[key]=' ';assert.throws(()=>prepareAdjustment(input));}
});
test('insertion is idempotent and rejects a different or modified adjustment',async()=>{
  const record=prepareAdjustment(fixture());let inserted=0,saved;
  const client={query:async(sql,args)=>{
    if(sql.startsWith('SELECT *')) return {rows:saved?[saved]:[]};
    if(sql.startsWith('INSERT')){inserted++;saved={...record};}
    return {rows:[]};
  }};
  assert.equal((await insertAdjustment(client,record)).created,true);
  assert.equal((await insertAdjustment(client,prepareAdjustment(fixture()))).created,false);
  assert.equal(inserted,1);
  await assert.rejects(()=>insertAdjustment(client,{...record,batch_key:'another'}));
  await assert.rejects(()=>insertAdjustment(client,{...record,source_sha256:'0'.repeat(64)}));
});

module.exports={fixture};
