import assert from 'node:assert/strict';
import { getStatementCustomers } from '../server/seedData.mjs';
import { getOfficeStatementDetail } from '../src/services/officeStatementApiClient.js';
import { mapStatementCustomerSummaryToLocal } from '../src/services/officeStatementSelectors.js';
const summaries=getStatementCustomers({customers:[{id:'C-REAL',name:'不能借用的客户',debt:999,cycle:'monthly'}],statements:[{id:'ST-ORPHAN',customerId:'C-MISSING',receivable:100,received:20,variance:80,status:'差额待确认'}]});
assert.equal(summaries[0].customerId,'C-MISSING');assert.equal(summaries[0].customerName,'客户资料缺失');assert.equal(summaries[0].debtAmount,null);assert.equal(summaries[0].historicalDebt,null);assert.equal(summaries[0].varianceAmount,80);
const mapped=mapStatementCustomerSummaryToLocal({statementId:'ST-A',customerId:'C-A',currentReceivable:100,debtAmount:500,varianceAmount:20});
assert.equal(mapped.variance,20);assert.equal(mapped.debtAmount,500);
const input={authState:{session:{accessToken:'synthetic-read-token'}},statementId:'ST-A',localStatement:{id:'ST-A',customerId:'C-OLD',received:900,receivable:1000}};
for(const body of [{id:'ST-B',received:20},{statement:{id:'ST-A'},statementId:'ST-B'},{}]) {
 const result=await getOfficeStatementDetail(input,{serverRequired:true,fetchImpl:async()=>new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}})});
 assert.equal(result.blocked,true);assert.equal(result.detail,null);assert.equal(result.error.code,'STATEMENT_DETAIL_ID_MISMATCH');
}
const unavailable=await getOfficeStatementDetail(input,{serverRequired:true,fetchImpl:async()=>{throw Error('offline');}});assert.equal(unavailable.blocked,true);assert.equal(unavailable.detail,null);
const cold=await getOfficeStatementDetail(input,{serverRequired:true,fetchImpl:async()=>new Response(JSON.stringify({id:'ST-A',customerId:'C-A',received:20,receivable:100,variance:80}),{headers:{'content-type':'application/json'}})});assert.equal(cold.source,'api');assert.equal(cold.detail.customerId,'C-A');assert.equal(cold.detail.received,20);
console.log('Statement read ownership passed: orphan customer never borrows another client, historical debt stays separate, wrong/missing/mixed bill identity blocks, formal failure never restores stale local money.');
