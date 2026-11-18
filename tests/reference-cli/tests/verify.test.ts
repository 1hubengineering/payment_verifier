import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {parseCbeHtml,parseTelebirrHtml,compare,makeStore,claim,normalizeInput,validateOrder} from '../src/core.ts';

const cbeHtml = await readFile(new URL('../fixtures/cbe.mock.html',import.meta.url),'utf8');
const teleHtml = await readFile(new URL('../fixtures/telebirr.mock.html',import.meta.url),'utf8');
const bilingualTeleHtml = await readFile(new URL('../fixtures/telebirr.bilingual.mock.html',import.meta.url),'utf8');
const v5TeleHtml = await readFile(new URL('../fixtures/telebirr.v5-table.mock.html',import.meta.url),'utf8');
const cbeOrder=validateOrder(JSON.parse(await readFile(new URL('../fixtures/order.cbe.json',import.meta.url),'utf8')));
const teleOrder=validateOrder(JSON.parse(await readFile(new URL('../fixtures/order.telebirr.json',import.meta.url),'utf8')));
const cbe=parseCbeHtml(cbeHtml), tele=parseTelebirrHtml(teleHtml);

test('CBE synthetic receipt parsed, exact reference, timestamp and amount',()=>{
  assert.equal(cbe.transactionId,'FT263170TEST');
  assert.equal(cbe.transactionAt,'2026-11-13T11:20:00.000Z');
  assert.equal(cbe.note,'AH-TEST-5932');
  assert.equal(cbe.recipientAccountLast4,'4867');
  assert.equal(compare(cbeOrder,cbe).outcome,'MATCH');
});
test('Telebirr synthetic receipt parsed and compared',()=>{
  assert.equal(tele.transactionId,'TEST1234AB');
  assert.equal(tele.note,'AH-TEST-4821');
  assert.equal(compare(teleOrder,tele).outcome,'MATCH');
});
test('Telebirr bilingual table receipt parses exact bank fields',()=>{
  const parsed=parseTelebirrHtml(bilingualTeleHtml);
  assert.equal(parsed.transactionId,'TEST1234AB');
  assert.equal(parsed.status,'Completed');
  assert.equal(parsed.amount,10);
  assert.equal(parsed.recipientName,'Example Merchant');
  assert.equal(parsed.recipientAccountLast4,'1123');
  assert.equal(parsed.note,'AH-TEST-4821');
  assert.equal(parsed.transactionAt,'2026-11-13T11:20:00.000Z');
  assert.equal(compare(teleOrder,parsed).outcome,'MATCH');
});
test('Original v5 extractor handles authentic three-column invoice layout',()=>{
  const parsed=parseTelebirrHtml(v5TeleHtml,'TEST1234AB');
  assert.equal(parsed.transactionId,'TEST1234AB');
  assert.equal(parsed.amount,10);
  assert.equal(parsed.status,'Completed');
  assert.equal(parsed.recipientName,'Example Merchant');
  assert.equal(parsed.recipientAccountLast4,'1123');
  assert.equal(parsed.note,'AH-TEST-4821');
  assert.equal(parsed.transactionAt,'2026-11-13T11:20:00.000Z');
  assert.equal(compare(teleOrder,parsed).outcome,'MATCH');
});
test('Original v5 extraction fails closed for unknown IDs and missing/contradictory fields',()=>{
  const other=parseTelebirrHtml(v5TeleHtml,'OTHER12345');
  assert.equal(other.transactionId,null);
  assert.equal(compare(teleOrder,other).outcome,'UNABLE_TO_VERIFY');
  const noAmount=parseTelebirrHtml(v5TeleHtml.replace('10.00 Birr','---'),'TEST1234AB');
  assert.equal(noAmount.amount,null);
  assert.equal(compare(teleOrder,noAmount).outcome,'UNABLE_TO_VERIFY');
  const badNote=parseTelebirrHtml(v5TeleHtml.replace('AH-TEST-4821','OTHER-REF-123'),'TEST1234AB');
  assert.equal(compare(teleOrder,badNote).outcome,'MISMATCH');
  const badAmount=parseTelebirrHtml(v5TeleHtml.replace('10.00 Birr','11.00 Birr'),'TEST1234AB');
  assert.equal(compare(teleOrder,badAmount).outcome,'MISMATCH');
});
test('Blank and malformed Telebirr responses do not produce receipt matches',()=>{
  const empty=parseTelebirrHtml('<html><body>Loading receipt</body></html>');
  assert.equal(empty.transactionId,null);
  assert.equal(compare(teleOrder,empty).outcome,'UNABLE_TO_VERIFY');
  const incomplete=parseTelebirrHtml('<table><tr><td>Receipt No.</td><td>TEST1234AB</td></tr></table>');
  assert.equal(compare(teleOrder,incomplete).outcome,'UNABLE_TO_VERIFY');
});
test('Mismatching fields are rejected',()=>{
  for(const [name,receipt] of [
    ['amount',{...cbe,amount:240}],['receiver',{...cbe,recipientName:'Different Person'}],
    ['account',{...cbe,recipientAccountLast4:'1234'}],['note',{...cbe,note:'OTHER-REFERENCE'}],
    ['time',{...cbe,transactionAt:'2026-11-15T11:20:00.000Z'}],
    ['status',{...cbe,status:'PENDING'}],['transferType',{...cbe,paymentType:'OTHER'}],['provider',{...cbe,provider:'telebirr' as const}]
  ] as const) assert.equal(compare(cbeOrder,receipt).outcome,'MISMATCH',name);
});
test('Missing required fields fail closed',()=>{
  assert.equal(compare(cbeOrder,{...cbe,note:null}).outcome,'UNABLE_TO_VERIFY');
  assert.equal(compare(cbeOrder,{...cbe,transactionId:null}).outcome,'UNABLE_TO_VERIFY');
  assert.equal(compare(cbeOrder,{...cbe,transactionAt:null}).outcome,'UNABLE_TO_VERIFY');
  assert.equal(compare(cbeOrder,{...cbe,paymentType:null}).outcome,'UNABLE_TO_VERIFY');
  assert.throws(()=>validateOrder({...cbeOrder,reference:'MB Transfer'}));
});
test('Official link normalization and URL rejection',()=>{
  assert.equal(normalizeInput('TEST1234AB','telebirr').expectedTransactionId,'TEST1234AB');
  const v5Sms='Your transaction number is TEST1234AB. To download your payment information please click this link: https://transactioninfo.ethiotelecom.et/receipt/TEST1234AB';
  assert.equal(normalizeInput(v5Sms,'telebirr').expectedTransactionId,'TEST1234AB');
  assert.equal(normalizeInput('Your transaction number is TEST1234AB','telebirr').expectedTransactionId,'TEST1234AB');
  assert.throws(()=>normalizeInput(v5Sms.replace('number is TEST1234AB','number is OTHER1234B'),'telebirr'));

  assert.equal(normalizeInput('https://mbreciept.cbe.com.et/v2-testTOKEN','cbe').url,'https://mbreciept.cbe.com.et/v2-testTOKEN');
  assert.throws(()=>normalizeInput('https://evil.example/v2-testTOKEN','cbe'));
  assert.throws(()=>normalizeInput('https://mbreciept.cbe.com.et.evil.example/v2-testTOKEN','cbe'));
  assert.throws(()=>normalizeInput('Transaction ID: TEST1234AB Invoice: DIFFERENT12','telebirr'));
  assert.equal(normalizeInput('Transferred ETB 230.00. https://mbreciept.cbe.com.et/v2-mocktoken for feedback: https://forms.gle/kGNGQpG3mQCCk3iD6','cbe').url, 'https://mbreciept.cbe.com.et/v2-mocktoken');
  assert.throws(()=>normalizeInput('https://mbreciept.cbe.com.et/v2-token?redirect=https://evil.example','cbe'));
  assert.throws(()=>normalizeInput('https://mbreciept.cbe.com.et/v2-token','telebirr'));
});
test('Persistent, provider-scoped and order-scoped duplicate protection',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'etb-cli-'));
  const database=path.join(dir,'claims.sqlite');
  try {
    let db=makeStore(database);
    assert.equal(claim(db,cbeOrder,cbe).outcome,'MATCH');
    db.close();
    db=makeStore(database);
    assert.equal(claim(db,cbeOrder,cbe).outcome,'ALREADY_USED');
    assert.equal(claim(db,{...cbeOrder,orderId:'OTHER-ORDER'},cbe).outcome,'ALREADY_USED');
    assert.equal(claim(db,cbeOrder,{...cbe,transactionId:'FTOTHER123456'}).outcome,'ORDER_ALREADY_CLAIMED');
    assert.equal(claim(db,teleOrder,tele).outcome,'MATCH');
    db.close();
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('Two independent CLI processes race to claim one CBE receipt',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'etb-cli-race-'));
  const database=path.join(dir,'claims.sqlite');
  const project=fileURLToPath(new URL('../',import.meta.url));
  try {
    // Initialize schema before both independent processes race for the same claim.
    // Otherwise the test also races SQLite journal-mode initialization.
    makeStore(database).close();
    const launch=()=>new Promise<{code:number|null;out:string;err:string}>((resolve,reject)=>{
      const args=['--experimental-strip-types','verify.ts','--order','fixtures/order.cbe.json','--html','fixtures/cbe.mock.html','--db',database,'--json'];
      const cp=spawn(process.execPath,args,{cwd:project,env:{...process.env}});
      let out='',err=''; cp.stdout.on('data',d=>out+=d);
      cp.stderr.on('data',d=>err+=d);
      cp.on('error',reject);cp.on('close',(code)=>resolve({code,out,err}));
    });
    const res=await Promise.all([launch(),launch()]);
    assert.ok(res.every(r=>r.out.trim()),'CLI emitted no JSON: '+JSON.stringify(res));
    assert.deepEqual(res.map(r=>JSON.parse(r.out).outcome).sort(),['ALREADY_USED','MATCH']);
    assert.deepEqual(res.map(r=>r.code).sort(),[0,3]);
  } finally {await rm(dir,{recursive:true,force:true});}
});
