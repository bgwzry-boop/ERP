import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import pg from "pg";
import {loadMigrationFiles,validateMigrationSet} from "./dbMigrationUtils.mjs";
import {postgresLiveBusinessSeedSql} from "./helpers/postgresLiveBusinessSeed.mjs";
import {officePricingWorkspace,makeQuote,confirmQuote} from "./check-office-order-pricing.mjs";
import {groupCorrectionService,groupCorrectionPermissions} from "./check-order-print-group-correction.mjs";
import {createPostgresOrderDraftRepository} from "../server/orderDraftRepository.mjs";
import {createPostgresOrderConfirmationTransactionRepository} from "../server/orderConfirmationTransactionRepository.mjs";
import {createPostgresCoreWorkspaceReadRepository} from "../server/coreWorkspaceReadRepository.mjs";
import {createPostgresOrderLineQuantityAdjustmentTransactionRepository} from "../server/orderLineQuantityAdjustmentTransactionRepository.mjs";
import {createPostgresPoolClient,closeSharedPostgresPools} from "../server/postgresPoolClient.mjs";
import {createPostgresOrderPoolReadRepository} from "../server/orderPoolReadRepository.mjs";
import {mapApiOrderLineToLocal} from "../src/services/officeOrderPoolApiClient.js";
import {createPostgresRawMaterialInboundRepository} from "../server/rawMaterialInboundRepository.mjs";
import {applyRawMaterialInboundAction} from "../server/services/rawMaterialInboundCommandService.mjs";
const name=`erp-print-group-${process.pid}-${Date.now()}`;
const docker=args=>{const r=spawnSync("docker",args,{encoding:"utf8"});if(r.status)throw Error(r.stderr||r.stdout);return r.stdout.trim();};
let pool;
try{
 docker(["run","--rm","-d","--name",name,"-p","127.0.0.1::5432","-e","POSTGRES_DB=erp","-e","POSTGRES_USER=erp","-e","POSTGRES_PASSWORD=erp","postgres:16-alpine"]);
 for(let i=0;i<60;i++){if(spawnSync("docker",["exec",name,"pg_isready","-h","127.0.0.1","-U","erp"]).status===0)break;await new Promise(r=>setTimeout(r,250));}
 const url=`postgres://erp:erp@127.0.0.1:${docker(["port",name,"5432/tcp"]).split(":").at(-1)}/erp`;pool=new pg.Pool({connectionString:url});const migrations=loadMigrationFiles();validateMigrationSet(migrations);for(const m of migrations)await pool.query(m.sql);await pool.query(postgresLiveBusinessSeedSql);
 await pool.query("INSERT INTO users(id,login_name,display_name) VALUES ('U-PRICE','group-correction.test','合成整组更正');INSERT INTO customers(id,biz_no,name) VALUES ('C-PRICE','C-PRICE','合成整组客户');UPDATE price_table_items SET bag_price=.90 WHERE price_table_id='PT-TEST-PUBLISHED'");
 const w=officePricingWorkspace({print:true});Object.assign(w,{orderDraftRepository:createPostgresOrderDraftRepository({databaseUrl:url}),orderConfirmationTransactionRepository:createPostgresOrderConfirmationTransactionRepository({databaseUrl:url}),coreWorkspaceReadRepository:createPostgresCoreWorkspaceReadRepository({databaseUrl:url}),orderLineQuantityAdjustmentTransactionRepository:createPostgresOrderLineQuantityAdjustmentTransactionRepository({databaseUrl:url})});
 const rawLine=structuredClone(w.orderDrafts[0].lines[0]);let seq=0;
 async function createGroup(memberCount=2){
  const id=`D-GROUP-CORRECTION-${++seq}`;w.currentPricingDraftId=id;
  await w.orderDraftRepository.saveOrderDraft({workspace:w,draft:{...w.orderDrafts[0],id,draftId:id,bizNo:id,status:"待审核",revision:0,clientRevision:0,recognitionContext:null,lines:Array.from({length:memberCount},(_,index)=>({...rawLine,id:`${id}-0${index+1}`,draftLineId:`${id}-0${index+1}`,color:index?"白色":rawLine.color})),createdBy:"U-PRICE"},expectedRevision:0,idempotencyKey:`save-${id}`,operationLog:{id:`LOG-${id}`,targetType:"order_draft",targetId:id,action:"save_order_draft",operatorId:"U-PRICE"}});
  const q=await makeQuote(w,{},`pg-group-${seq}`);assert.ok(q.response,JSON.stringify(q));const c=await confirmQuote(w,q.response.quote,{},`pg-group-${seq}`);assert.ok(c.response,JSON.stringify(c));return c.response.orderLines.map(row=>row.id);
 }
 async function input(ids,{mode="amend",voidIds=[],quantities={}}={}){
  const v=await groupCorrectionService.getPrintGroup({workspace:w,orderLineId:ids[0]});assert.ok(v.response,JSON.stringify(v));const view=v.response;
  return {workspace:w,orderLineId:ids[0],operatorId:"U-PRICE",actionPermissions:groupCorrectionPermissions,body:{expectedGroupRevision:view.groupRevision,mode,reason:"合成整组正式更正，沿冻结原单价",members:view.members.map(row=>({orderLineId:row.orderLineId,expectedRevision:row.revision,newQty:quantities[row.orderLineId]??row.qty,void:voidIds.includes(row.orderLineId)}))}};
 }
 async function reviewed(i,key){const p=await groupCorrectionService.previewCorrection(i);assert.ok(p.response,JSON.stringify(p));i.body={...i.body,previewHash:p.response.previewHash,idempotencyKey:key};return i;}
 const ids=await createGroup(),original=(await pool.query("SELECT to_jsonb(price) p FROM price_snapshots price WHERE order_line_id=ANY($1::text[]) ORDER BY id",[ids])).rows;
 const poolRows=await createPostgresOrderPoolReadRepository({databaseUrl:url}).listOrderLines({query:{customerId:"C-PRICE",pageSize:200}});
 for(const id of ids){const row=poolRows.items.find(row=>row.id===id);assert.equal(row.printingPriceGroup.memberCount,2);assert.deepEqual(Object.keys(row.printingPriceGroup).sort(),["groupId","memberCount"]);assert.deepEqual(mapApiOrderLineToLocal(row).printingPriceGroup,row.printingPriceGroup);assert.equal(row.sourceEvidence,undefined);}
 const i=await reviewed(await input(ids,{quantities:{[ids[0]]:2000}}),"pg-group-reduce");const saved=await groupCorrectionService.correctPrintGroup(i);assert.ok(saved.response,JSON.stringify(saved));assert.equal(saved.response.totals.finalAmount,6720);
 assert.deepEqual((await groupCorrectionService.correctPrintGroup(i)).response,saved.response);const priorIds=original.map(row=>row.p.id);assert.deepEqual((await pool.query("SELECT to_jsonb(price) p FROM price_snapshots price WHERE id=ANY($1::text[]) ORDER BY id",[priorIds])).rows,original);
 const fresh=await w.coreWorkspaceReadRepository.loadState();for(const id of ids){const snapshots=fresh.priceSnapshots.filter(row=>row.orderLineId===id);assert.equal(snapshots.length,2);assert.equal(snapshots.at(-1).printPrice,.06);assert.equal(snapshots.at(-1).sourceEvidence.officePricingGroup.memberCount,2);assert.equal(fresh.orderLines.find(row=>row.id===id).revision,2);}
 const one=await reviewed(await input(ids,{voidIds:[ids[0]]}),"pg-group-void-member"),oneSaved=await groupCorrectionService.correctPrintGroup(one);assert.ok(oneSaved.response,JSON.stringify(oneSaved));assert.equal((await pool.query("SELECT original_qty,line_status FROM order_lines WHERE id=$1",[ids[0]])).rows[0].original_qty,2000);const singleton=await groupCorrectionService.getPrintGroup({workspace:w,orderLineId:ids[1]});assert.equal(singleton.response.members.length,1);
 const all=await reviewed(await input([ids[1]],{mode:"void_all",voidIds:[ids[1]]}),"pg-group-void-all"),allSaved=await groupCorrectionService.correctPrintGroup(all);assert.ok(allSaved.response,JSON.stringify(allSaved));assert.equal(allSaved.response.totals.finalAmount,0);assert.deepEqual((await groupCorrectionService.correctPrintGroup(all)).response,allSaved.response);
 // Late conflict on the second member rolls back first member, snapshots and audit.
 const raceIds=await createGroup(),r=await reviewed(await input(raceIds,{quantities:{[raceIds[0]]:2000}}),"pg-race-member");
 const actual=w.orderLineQuantityAdjustmentTransactionRepository;let captured;
 w.orderLineQuantityAdjustmentTransactionRepository={...actual,correctPrintGroup:async plan=>{captured=plan;return actual.correctPrintGroup(plan);}};
 const before=(await pool.query("SELECT count(*)::int n FROM price_snapshots WHERE order_line_id=ANY($1::text[])",[raceIds])).rows[0].n;
 // Inject the conflict after planning, immediately before the real database write.
 w.orderLineQuantityAdjustmentTransactionRepository.correctPrintGroup=async plan=>{captured=plan;await pool.query("UPDATE order_lines SET revision=revision+1 WHERE id=$1",[raceIds[1]]);return actual.correctPrintGroup(plan);};
 const conflict=await groupCorrectionService.correctPrintGroup(r);assert.equal(conflict.code,"BUSINESS_WRITE_CONFLICT",JSON.stringify(conflict));assert.equal((await pool.query("SELECT original_qty FROM order_lines WHERE id=$1",[raceIds[0]])).rows[0].original_qty,5000);assert.equal((await pool.query("SELECT count(*)::int n FROM price_snapshots WHERE order_line_id=ANY($1::text[])",[raceIds])).rows[0].n,before);assert.equal((await pool.query("SELECT count(*)::int n FROM operation_logs WHERE id=$1",[captured.operationLog.id])).rows[0].n,0);w.orderLineQuantityAdjustmentTransactionRepository=actual;
 // A held foreign-key insert changes facts without changing order-line revision.
 const docIds=await createGroup(),d=await reviewed(await input(docIds,{quantities:{[docIds[0]]:2000}}),"pg-positive-consumption"),rawId=`RM-GROUP-CONSUMED-${seq}`;
 w.orderLineQuantityAdjustmentTransactionRepository={...actual,correctPrintGroup:async plan=>{await pool.query("INSERT INTO raw_material_inbounds(id,payload_json) VALUES($1,$2::jsonb)",[rawId,JSON.stringify({id:rawId,rawMaterialConsumptionRecords:[{consumedWeightKg:5,productionTaskOrderLineId:docIds[1]}]})]);return actual.correctPrintGroup(plan);}};
 assert.equal((await groupCorrectionService.correctPrintGroup(d)).code,"BUSINESS_WRITE_CONFLICT");assert.ok((await pool.query("SELECT original_qty FROM order_lines WHERE id=ANY($1::text[])",[docIds])).rows.every(row=>row.original_qty===5000));w.orderLineQuantityAdjustmentTransactionRepository=actual;
 // Concurrent identical requests converge on one atomic receipt and one snapshot/member.
 const concurrentIds=await createGroup(),ci=await reviewed(await input(concurrentIds,{quantities:{[concurrentIds[0]]:2000}}),"pg-concurrent-same-key");const [a,b]=await Promise.all([groupCorrectionService.correctPrintGroup(ci),groupCorrectionService.correctPrintGroup(ci)]);assert.ok(a.response,JSON.stringify(a));assert.deepEqual(a.response,b.response);assert.equal((await pool.query("SELECT count(*)::int n FROM price_snapshots WHERE order_line_id=ANY($1::text[])",[concurrentIds])).rows[0].n,4);
 // Shared inventory changes are aggregated once across both members.
 const stockIds=await createGroup(),item=(await pool.query("SELECT id FROM inventory_items ORDER BY id LIMIT 1")).rows[0].id;await pool.query("UPDATE inventory_items SET reserved_qty=10000,revision=10 WHERE id=$1",[item]);for(const [index,id]of stockIds.entries())await pool.query("INSERT INTO inventory_reservations(id,order_line_id,inventory_item_id,reserved_qty,status,revision)VALUES($1,$2,$3,5000,'生效',1)",[`RES-GROUP-${seq}-${index}`,id,item]);
 const si=await reviewed(await input(stockIds,{quantities:Object.fromEntries(stockIds.map(id=>[id,2000]))}),"pg-shared-inventory");const ss=await groupCorrectionService.correctPrintGroup(si);assert.ok(ss.response,JSON.stringify(ss));assert.deepEqual((await pool.query("SELECT reserved_qty,revision FROM inventory_items WHERE id=$1",[item])).rows[0],{reserved_qty:4000,revision:11});assert.deepEqual((await pool.query("SELECT qty_before,qty_after FROM inventory_ledger_entries WHERE source_id=ANY($1::text[]) ORDER BY qty_before DESC",[stockIds])).rows.map(row=>[row.qty_before,row.qty_after]),[[10000,7000],[7000,4000]]);
 // Keep a different member's already split production/packing/delivery plans.
 const keepIds=await createGroup();
 const keepTask=(await pool.query("SELECT * FROM production_tasks WHERE order_line_id=$1",[keepIds[1]])).rows[0];
 await pool.query("UPDATE production_tasks SET planned_qty=3000 WHERE id=$1;",[keepTask.id]);
 await pool.query("INSERT INTO production_tasks(id,biz_no,order_line_id,task_type,planned_qty,task_status,revision) VALUES($1,$1,$2,$3,2000,'待排产',1)",[`${keepTask.id}-B`,keepIds[1],keepTask.task_type]);
 const keepDelivery=(await pool.query("SELECT * FROM fulfillment_records WHERE order_line_id=$1",[keepIds[1]])).rows[0];await pool.query("UPDATE fulfillment_records SET expected_qty=3000 WHERE id=$1",[keepDelivery.id]);await pool.query("INSERT INTO fulfillment_records(id,biz_no,order_line_id,customer_id,method,expected_qty,status)VALUES($1,$1,$2,'C-PRICE','自提',2000,'待生产')",[`${keepDelivery.id}-B`,keepIds[1]]);
 for(const [index,qty]of [3000,2000].entries())await pool.query("INSERT INTO packing_tasks(id,biz_no,order_line_id,planned_qty,status,revision) VALUES($1,$1,$2,$3,'待打包',1)",[`PACK-KEEP-${seq}-${index}`,keepIds[1],qty]);
 await pool.query("UPDATE fulfillment_records SET actual_qty=5000,status='已备货' WHERE order_line_id=$1",[keepIds[0]]);
 const ki=await reviewed(await input(keepIds,{quantities:{[keepIds[0]]:2000}}),"pg-keep-split-plans"),ks=await groupCorrectionService.correctPrintGroup(ki);assert.ok(ks.response,JSON.stringify(ks));
 for(const [table,column]of [["production_tasks","planned_qty"],["packing_tasks","planned_qty"],["fulfillment_records","expected_qty"]])assert.deepEqual((await pool.query(`SELECT ${column} qty FROM ${table} WHERE order_line_id=$1 ORDER BY ${column} DESC`,[keepIds[1]])).rows.map(row=>row.qty),[3000,2000],`${table}: keep split allocation unchanged`);
 assert.deepEqual((await pool.query("SELECT actual_qty,status,expected_qty FROM fulfillment_records WHERE order_line_id=$1",[keepIds[0]])).rows[0],{actual_qty:null,status:"待出库",expected_qty:2000});
 // A new second fulfillment after review cannot be multiplied to full quantity.
 const splitIds=await createGroup(),spi=await reviewed(await input(splitIds,{quantities:{[splitIds[0]]:2000}}),"pg-late-split-plan");
 w.orderLineQuantityAdjustmentTransactionRepository={...actual,correctPrintGroup:async plan=>{await pool.query("INSERT INTO fulfillment_records(id,biz_no,order_line_id,customer_id,method,expected_qty,status)VALUES($1,$1,$2,'C-PRICE','自提',1000,'待生产')",[`F-LATE-SPLIT-${seq}`,splitIds[0]]);return actual.correctPrintGroup(plan);}};
 assert.equal((await groupCorrectionService.correctPrintGroup(spi)).code,"BUSINESS_WRITE_CONFLICT");assert.equal((await pool.query("SELECT original_qty FROM order_lines WHERE id=$1",[splitIds[0]])).rows[0].original_qty,5000);w.orderLineQuantityAdjustmentTransactionRepository=actual;
 // The actual consumption repository holds the same member lock until commit.
 // The group request waits, then takes a fresh statement snapshot and rejects.
 const consumeIds=await createGroup(),consumeTask=(await pool.query("SELECT id FROM production_tasks WHERE order_line_id=$1",[consumeIds[1]])).rows[0].id;
 const consumeReview=await reviewed(await input(consumeIds,{quantities:{[consumeIds[0]]:2000}}),"pg-real-consumption-race");
 const rawBefore={id:`RAW-GROUP-RACE-${seq}`,revision:1,status:"已入库",unit:"kg",rolls:[{id:"ROLL-GROUP-RACE",weightKg:10,inventoryStatus:"机边领用",issueRecordId:"ISSUE-GROUP-RACE",productionTaskId:consumeTask,machineId:"BAG-03"}],rawMaterialIssueRecords:[{issueRecordId:"ISSUE-GROUP-RACE",rollId:"ROLL-GROUP-RACE",machineId:"BAG-03",productionTaskId:consumeTask,productionTaskOrderLineId:consumeIds[1],productionTaskMatchStatus:"已匹配"}]};
 await pool.query("INSERT INTO raw_material_inbounds(id,status,payload_json,revision)VALUES($1,'已入库',$2::jsonb,1)",[rawBefore.id,JSON.stringify(rawBefore)]);
 let enteredConsume,releaseConsume;const consumingEntered=new Promise(r=>enteredConsume=r),consumeGate=new Promise(r=>releaseConsume=r);
 const pausedPool={query:(...args)=>pool.query(...args),async connect(){const client=await pool.connect();return {query:async(...args)=>{const q=args[0];if((typeof q==="string"?q:q.text)==="COMMIT"){enteredConsume();await consumeGate;}return client.query(...args);},release:()=>client.release()};}};
 const raw=createPostgresRawMaterialInboundRepository({postgresClient:createPostgresPoolClient({pool:pausedPool})});
 const rawWorkspace={...w,...await w.coreWorkspaceReadRepository.loadState(),...await raw.loadState(),rawMaterialInboundRepository:raw};
 const consumptionBody={expectedRevision:1,rollId:"ROLL-GROUP-RACE",consumedWeightKg:5};
 const consuming=raw.applyInboundAction({workspace:rawWorkspace,inboundId:rawBefore.id,action:"confirm_consumption",body:consumptionBody,idempotencyKey:"group-real-consumption",operatorId:"U-WAREHOUSE-A",decide:({workspace:current,inbounds})=>applyRawMaterialInboundAction({workspace:current,inbounds,inboundId:rawBefore.id,action:"confirm_consumption",body:consumptionBody,operatorId:"U-WAREHOUSE-A",serverNow:"2026-10-24T03:00:00Z"})});
 const consumeOutcome=consuming.then(value=>({value}),error=>({error}));
 await Promise.race([consumingEntered,consumeOutcome.then(result=>{throw result.error??Error("Consumption finished before pause");})]);
 const pendingGroup=groupCorrectionService.correctPrintGroup(consumeReview);let waited=false;
 try{for(let attempt=0;attempt<150;attempt++){waited=(await pool.query("SELECT count(*)::int n FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'SELECT pg_advisory_xact_lock%'")).rows[0].n>0;if(waited)break;await new Promise(r=>setTimeout(r,10));}assert.equal(waited,true,"Whole-group writer waits behind the actual consumption repository");}
 finally{releaseConsume();}
 const consumed=await consuming;assert.equal(consumed.inbound.rawMaterialConsumptionRecords[0].consumedWeightKg,5);
 const rejectedGroup=await pendingGroup;assert.equal(rejectedGroup.code,"BUSINESS_WRITE_CONFLICT",JSON.stringify(rejectedGroup));assert.ok((await pool.query("SELECT original_qty,revision FROM order_lines WHERE id=ANY($1::text[])",[consumeIds])).rows.every(row=>row.original_qty===5000&&row.revision===1));
 assert.equal((await pool.query("SELECT count(*)::int n FROM price_snapshots WHERE order_line_id=ANY($1::text[])",[consumeIds])).rows[0].n,2);
 // Three original members → one voided → the two surviving members may form
 // a supplemental batch, while the closed member and all old prices stay intact.
 const afterVoidIds=await createGroup(3),av=await reviewed(await input(afterVoidIds,{voidIds:[afterVoidIds[0]]}),"pg-void-before-supplement");assert.ok((await groupCorrectionService.correctPrintGroup(av)).response);
 const historicalLine=(await pool.query("SELECT to_jsonb(line) value FROM order_lines line WHERE id=$1",[afterVoidIds[0]])).rows[0].value;
 const historicalPrices=(await pool.query("SELECT to_jsonb(price) value FROM price_snapshots price WHERE order_line_id=ANY($1::text[]) ORDER BY id",[afterVoidIds])).rows;
 const suppId=`D-GROUP-AFTER-VOID-${++seq}`;w.currentPricingDraftId=suppId;
 await w.orderDraftRepository.saveOrderDraft({workspace:w,draft:{...w.orderDrafts[0],id:suppId,draftId:suppId,bizNo:suppId,status:"待审核",revision:0,clientRevision:0,recognitionContext:null,lines:[{...rawLine,id:`${suppId}-01`,draftLineId:`${suppId}-01`}],createdBy:"U-PRICE"},expectedRevision:0,idempotencyKey:`save-${suppId}`,operationLog:{id:`LOG-${suppId}`,targetType:"order_draft",targetId:suppId,action:"save_order_draft",operatorId:"U-PRICE"}});
 const supplementBody={orderLineIds:afterVoidIds.slice(1),targetDraftLineId:`${suppId}-01`,confirmedSameBatch:true,batchReference:"PG-ACTIVE-AFTER-VOID",reason:"历史作废保留，当前完整两行未开印同批追加"};
 assert.equal((await makeQuote(w,{supplementation:{...supplementBody,orderLineIds:[afterVoidIds[1]]}},"pg-after-void-incomplete")).code,"ORDER_PRINT_EXISTING_GROUP_REQUIRED");
 assert.equal((await makeQuote(w,{supplementation:{...supplementBody,orderLineIds:afterVoidIds}},"pg-after-void-closed-selected")).code,"ORDER_PRINT_SUPPLEMENT_NOT_ELIGIBLE");
 const nextQuote=await makeQuote(w,{supplementation:supplementBody},"pg-after-void-quote");assert.ok(nextQuote.response,JSON.stringify(nextQuote));assert.equal(nextQuote.response.quote.affectedOrders.length,2);
 const nextConfirm=await confirmQuote(w,nextQuote.response.quote,{confirmedAffectedOrderLineIds:afterVoidIds.slice(1)},"pg-after-void-confirm");assert.ok(nextConfirm.response,JSON.stringify(nextConfirm));
 assert.deepEqual((await pool.query("SELECT to_jsonb(line) value FROM order_lines line WHERE id=$1",[afterVoidIds[0]])).rows[0].value,historicalLine);
 assert.deepEqual((await pool.query("SELECT to_jsonb(price) value FROM price_snapshots price WHERE id=ANY($1::text[]) ORDER BY id",[historicalPrices.map(row=>row.value.id)])).rows,historicalPrices);
 assert.ok((await pool.query("SELECT revision FROM order_lines WHERE id=ANY($1::text[])",[afterVoidIds.slice(1)])).rows.every(row=>row.revision===3));
 console.log("PASS printing group isolated Postgres: safe list projection, immutable frozen prices, reduction/member/all void, exact/concurrent receipt, full rollback on late member/split changes, shared inventory single update, keep 3000+2000 plans, clear old preparation, real 5kg consumption lock race, and 3→void 1→complete surviving 2 supplemental quote/confirmation without changing closed history");
}finally{if(pool)await pool.end();await closeSharedPostgresPools();spawnSync("docker",["rm","-f",name],{stdio:"ignore"});}
