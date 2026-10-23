import assert from 'node:assert/strict';import {build} from 'esbuild';import {createRequire} from 'node:module';import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
const dir=await mkdtemp(join(tmpdir(),'erp-schedule-decision-'));let tree;globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.__scheduleRuntime={};
try{
const out=await build({stdin:{contents:`import React from 'react';import {create,act} from 'react-test-renderer';import {ProductionPackingPage} from './src/features/production/ProductionPackingPage.jsx';export {create,act};export const element=p=><ProductionPackingPage {...p}/>;`,resolveDir:process.cwd(),loader:'jsx'},bundle:true,platform:'node',format:'cjs',jsx:'automatic',write:false,logLevel:'silent',plugins:[{name:'pane-boundaries',setup(b){
b.onResolve({filter:/^(react(?:\/.*)?|react-test-renderer)$/},a=>({path:createRequire(import.meta.url).resolve(a.path),external:true}));
b.onLoad({filter:/ProductionPackingTaskPane\.jsx$/},()=>({contents:'export const ProductionPackingTaskPane=({runtime})=>{globalThis.__scheduleRuntime.task=runtime;return null;};'}));
b.onLoad({filter:/ProductionPackingDetailPane\.jsx$/},()=>({contents:'export const ProductionPackingDetailPane=({runtime})=>{globalThis.__scheduleRuntime.detail=runtime;return null;};'}));
b.onLoad({filter:/ProductionScheduleActionConfirmationDialog\.jsx$/},()=>({contents:'export const ProductionScheduleActionConfirmationDialog=props=>{globalThis.__scheduleRuntime.dialog=props;return null;};'}));
b.onLoad({filter:/DelegatedBusinessDecisionFields\.jsx$/},()=>({contents:'export const isDelegatedBusinessDecisionComplete=v=>v?.decisionMakerEmployeeId===\"E1\";'}));
b.onLoad({filter:/ProductionExceptionPanel\.jsx$/},()=>({contents:'export const buildProductionExceptionResolutionEffects=()=>[];export const isTerminalProductionException=()=>false;export const productionExceptionResolutionOptions=[];'}));
}}]});const file=join(dir,'test.cjs');await writeFile(file,out.outputFiles[0].text);const {create,act,element}=createRequire(import.meta.url)(file);
const calls=[];const rows=['L1','L2'].map(id=>({id,productionTaskId:'PT-'+id,customerId:'C1',status:'制袋待排产',qty:100,revision:2,product:'袋',size:'30x40',machineId:'M1'}));
const helpers={buildProductionTaskId:l=>l?.productionTaskId||'',findCustomer:()=>({name:'客户'}),findProductionInventoryItem:()=>null,getLineColorSpecLabel:()=>'',getLinePrintSide:()=>'',getLineRemark:()=>'',getUiActionState:()=>({disabled:false}),statusTone:()=>''};
let props={authState:{session:{accessToken:'A'},permissions:{actionPermissions:[]}},currentUser:{userId:'U1'},orderLines:rows,inventoryRecords:[],productionPacking:{taskListSource:'api',productionTasks:rows,packingTasks:[],scheduleQueueItems:[]},helpers,onAction:(...args)=>new Promise((resolve,reject)=>calls.push({args,resolve,reject}))};
const view=()=>globalThis.__scheduleRuntime;
await act(async()=>{tree=create(element(props));});
const ready=async(summary)=>act(async()=>{view().detail.setScheduleDecision({decisionMakerEmployeeId:'E1',decisionContent:{summary}});view().detail.onScheduleEvidenceReady(true);});
const review=()=>{const d=view().detail;d.requestScheduleAction('发布排产',{productionTaskId:d.selectedProductionLine.productionTaskId,machineId:'M1',expectedRevision:2,...d.scheduleDecisionPayload('本次排产')},'本次排产','只发布任务');};
await ready('任务一决定');
await act(async()=>{const staleReview=view().detail.requestScheduleAction;view().detail.onScheduleEvidenceReady(false);staleReview('发布排产',{productionTaskId:'PT-L1'},'摘要','影响');});assert.equal(view().dialog.confirmation,null);
await ready('任务一决定');await act(async()=>review());assert.ok(view().dialog.confirmation);const frozen=structuredClone(view().dialog.confirmation);
await act(async()=>{const submit=view().dialog.onSubmit;void submit();void submit();});assert.equal(calls.length,1);
await act(async()=>calls[0].reject(Error('connection lost')));assert.ok(view().dialog.confirmation);assert.equal(view().dialog.submitting,false);assert.match(view().dialog.error,/connection lost/);
await act(async()=>{void view().dialog.onSubmit();});assert.deepEqual(calls[1].args,calls[0].args);assert.deepEqual(view().dialog.confirmation,frozen);
await act(async()=>calls[1].resolve({source:'api'}));assert.ok(view().dialog.confirmation,'Missing operation log cannot be accepted as persisted success');
await act(async()=>{void view().dialog.onSubmit();});
await act(async()=>view().task.onSelectProductionLine('PT-L2'));assert.equal(view().detail.selectedProductionLine.productionTaskId,'PT-L2');assert.equal(view().dialog.confirmation,null);assert.equal(view().detail.scheduleDecision.decisionContent.summary,'');
await ready('任务二决定');await act(async()=>review());const second=structuredClone(view().dialog.confirmation);
await act(async()=>calls[2].resolve({source:'api',operationLogId:'LOG-OLD'}));assert.deepEqual(view().dialog.confirmation,second);assert.equal(view().detail.scheduleDecision.decisionContent.summary,'任务二决定');
await act(async()=>{void view().dialog.onSubmit();});await act(async()=>calls[3].resolve({blocked:true,error:{status:409,message:'版本冲突'}}));assert.equal(view().dialog.confirmation,null);assert.equal(view().task.scheduleWriteConflict.status,409);
await ready('重核后决定');await act(async()=>review());await act(async()=>{void view().dialog.onSubmit();});await act(async()=>calls[4].resolve({source:'api',operationLogId:'LOG-NEW'}));assert.equal(view().dialog.confirmation,null);assert.equal(view().detail.scheduleDecision.decisionContent.summary,'');
await act(async()=>{props={...props,authState:{...props.authState,permissions:{actionPermissions:['production.schedule.direct']}}};tree.update(element(props));});await act(async()=>review());assert.ok(view().dialog.confirmation);
await act(async()=>{props={...props,authState:{...props.authState,permissions:{actionPermissions:[]}}};tree.update(element(props));});const count=calls.length;await act(async()=>{void view().dialog.onSubmit();});assert.equal(calls.length,count);assert.match(view().dialog.error,/权限已变化/);
await act(async()=>tree.unmount());tree=null;
const queue=await readFile('src/features/production/ProductionScheduleQueueSection.jsx','utf8');const detail=await readFile('src/features/production/ProductionPackingDetailSections.jsx','utf8');assert.doesNotMatch(queue,/DelegatedBusinessDecisionFields/);assert.equal((detail.match(/<DelegatedBusinessDecisionFields/g)||[]).length,1);
console.log('Schedule decision parent: one editor location, synchronous evidence gate, frozen request, double-click exclusion, throw/incomplete retry, target reset, stale response isolation, 409 and successful reset.');
}finally{tree?.unmount();delete globalThis.__scheduleRuntime;delete globalThis.IS_REACT_ACT_ENVIRONMENT;await rm(dir,{recursive:true,force:true});}
