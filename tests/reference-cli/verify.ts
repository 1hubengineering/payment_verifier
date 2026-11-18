import {readFile} from 'node:fs/promises';
import {validateOrder, normalizeInput, parseCbeHtml, parseTelebirrHtml, compare, loadHtml, makeStore, claim} from './src/core.ts';

function usage():string {return `Unified ETB receipt CLI POC (same-provider transfers only)
  node --experimental-strip-types verify.ts --order order.json --receipt "<official URL, Telebirr ID, or SMS>" [--db claims.sqlite] [--json]
  node --experimental-strip-types verify.ts --order order.json --html "saved receipt.html" [--db claims.sqlite] [--json]
  node --experimental-strip-types verify.ts --order order.json --html "saved receipt.html" --dry-run
Options: --order, --receipt, --html, --db, --json, --dry-run, --help.
Live CBE receipt retrieval uses Playwright; saved CBE/Telebirr HTML does not.
MATCH = receipt fields matched and were claimed LOCALLY; NOT a bank settlement authorization.`;}
function argsParse(argv:string[]):Record<string,string|boolean> {
  const out:Record<string,string|boolean> = {};
  for(let i=0;i<argv.length;i++) {
    const a=argv[i]; if(!a.startsWith('--')) throw new Error(`Unexpected argument: ${a}`);
    if(['--json','--dry-run','--help'].includes(a)){out[a.slice(2)]=true;continue;}
    if(!['--order','--receipt','--html','--db'].includes(a) || !argv[i+1] || argv[i+1].startsWith('--')) throw new Error(`Expected value for ${a}`);
    out[a.slice(2)]=argv[++i];
  }
  return out;
}
async function main() {
  const args=argsParse(process.argv.slice(2));
  if(args.help){console.log(usage());return;}
  if(!args.order || (!!args.html === !!args.receipt)) throw new Error('Provide --order and exactly one of --receipt or --html');
  const order=validateOrder(JSON.parse(await readFile(String(args.order),'utf8')));
  const receiptText=String(args.receipt??'');
  const loaded=await loadHtml(order.provider,receiptText,args.html?String(args.html):undefined);
  const receipt=order.provider==='cbe'?parseCbeHtml(loaded.html):parseTelebirrHtml(loaded.html,loaded.expectedTransactionId??undefined);
  receipt.sourceUrl=loaded.sourceUrl??undefined;
  const comparison=compare(order,receipt);
  if (loaded.expectedTransactionId) comparison.checks.invoice = !receipt.transactionId ? 'MISSING' : receipt.transactionId.trim().toUpperCase()===loaded.expectedTransactionId ? 'PASS' : 'FAIL';
  let outcome = Object.values(comparison.checks).includes('FAIL')?'MISMATCH':Object.values(comparison.checks).includes('MISSING')?'UNABLE_TO_VERIFY':'MATCH';
  let claimedBy: string|undefined;
  if(outcome==='MATCH' && !args['dry-run']) {
    const db=makeStore(String(args.db??'claims.sqlite'));
    try { const result=claim(db,order,receipt); outcome=result.outcome; claimedBy=result.claimedBy; }
    finally {db.close();}
  }
  const result={outcome, orderId:order.orderId, provider:order.provider, receipt, checks:comparison.checks,
    ...(claimedBy?{claimedBy}:{}), claimed:outcome==='MATCH'&&!args['dry-run'],
    dryRun:!!args['dry-run'], warning:'RECEIPT FIELD COMPARISON ONLY. Not merchant settlement confirmation or payment authorization.'};
  if(args.json) console.log(JSON.stringify(result,null,2));
  else {
    console.log(`Provider: ${order.provider} | Order: ${order.orderId}`);
    if(loaded.sourceUrl) console.log(`Official receipt: ${loaded.sourceUrl}`);
    console.log(`Reference: ${receipt.transactionId??'MISSING'} | Amount: ${receipt.amount??'MISSING'} ETB | Note: ${receipt.note??'MISSING'}`);
    for(const [name,value] of Object.entries(comparison.checks)) console.log(`${name}: ${value}`);
    console.log(`${outcome}${claimedBy?` — already claimed by ${claimedBy}`:''}${args['dry-run']?' (DRY RUN: no claim recorded)':''}`);
    console.log(result.warning);
  }
  process.exitCode=outcome==='MATCH'?0:outcome==='MISMATCH'?2:outcome==='ALREADY_USED'||outcome==='ORDER_ALREADY_CLAIMED'?3:4;
}
main().catch(e=>{console.error(`UNABLE_TO_VERIFY: ${e instanceof Error?e.message:String(e)}`);console.error('No claim created.');process.exitCode=4;});
