import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const require = createRequire(import.meta.url);
const dir = await mkdtemp(join(tmpdir(), 'erp-measurement-'));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.document = {activeElement: null};
let tree;
try {
 const built = await build({stdin: {contents: `import React from 'react';import {create,act} from 'react-test-renderer';import {useRawMaterialMeasurement} from './src/features/raw-materials/RawMaterialMeasurementDialog.jsx';export {create,act};function Harness(p){const m=useRawMaterialMeasurement(p);return <><button id="consumeFull" onClick={()=>m.handleMeasuredAction('确认消耗','I1',{rollId:'R1'})}/><button id="consume" onClick={()=>m.handleMeasuredAction('确认消耗','I1',{rollId:'R1',partialConsumption:true})}/><button id="leftover" onClick={()=>m.handleMeasuredAction('复核余料可用','I1',{rollId:'R1'})}/><button id="loss" onClick={()=>m.handleMeasuredAction('校准损耗','I1')}/>{m.measurementDialog}</>};export const element=p=><Harness {...p}/>;`, resolveDir: process.cwd(), loader:'jsx'},bundle:true,platform:'node',format:'cjs',jsx:'automatic',write:false,logLevel:'silent',plugins:[{name:'test-boundaries',setup(b){b.onResolve({filter:/^(react(?:\/.*)?|react-test-renderer)$/},a=>({path:require.resolve(a.path),external:true}));b.onLoad({filter:/\.css$/},()=>({contents:'',loader:'js'}));}}]});
 const file=join(dir,'test.cjs');await writeFile(file,built.outputFiles[0].text);
 const {create,act,element}=require(file);
 const source={id:'I1',revision:5,rolls:[{id:'R1',weightKg:100,inventoryStatus:'机边领用'}],rawMaterialConsumptionRecords:[],rawMaterialCostAllocationConfirmations:[{costConfirmationId:'CC1',productionTaskIds:['PT1'],consumptionRecordIds:['CONS1'],confirmedWeightKg:20},{costConfirmationId:'CC2',productionTaskIds:['PT2'],consumptionRecordIds:['CONS2'],confirmedWeightKg:30},{costConfirmationId:'CC-OLD'}],rawMaterialCostLossCalibrations:[{lossCalibrationId:'LC-OLD',costConfirmationIds:['CC-OLD']}]};
 const calls=[],queue=[];
 const props={inbounds:[source],selectedId:'I1',scope:'ACCOUNT-A',getUiActionState:()=>({disabled:false}),onAction:(...args)=>{calls.push(args);return new Promise((resolve,reject)=>queue.push({resolve,reject}));}};
 await act(async()=>{tree=create(element(props));});
 const open=id=>tree.root.findByProps({id}).props.onClick();
 const form=()=>tree.root.findByType('form');
 const inputs=()=>tree.root.findAllByType('input');
 const note=()=>tree.root.findByType('textarea');
 const submit=()=>form().props.onSubmit({preventDefault(){}});
 const text=()=>JSON.stringify(tree.toJSON());
 await act(async()=>open('consume'));assert.equal(calls.length,0,'Opening measurement must not write');
 assert.equal(inputs()[0].props.value,'','Never suggest half the machine-side weight');
 await act(async()=>{void submit();});assert.equal(calls.length,0);
 await act(async()=>{inputs()[0].props.onChange({target:{value:'20'}});note().props.onChange({target:{value:'实称剩余80kg'}});});
 await act(async()=>{void submit();void submit();});assert.equal(calls.length,1);
 assert.equal(calls[0][2].consumedWeightKg,20);assert.equal(calls[0][2].expectedRevision,5);
 let canceled=false;await act(async()=>tree.root.findByType('dialog').props.onCancel({preventDefault(){canceled=true;}}));assert.equal(canceled,true);assert.equal(tree.root.findAllByType('dialog').length,1,'Escape during saving must not close');
 await act(async()=>tree.update(element({...props,inbounds:[{...source,revision:6}]})));
 await act(async()=>queue.shift().resolve(null));assert.match(text(),/输入已保留/);assert.equal(inputs()[0].props.value,'20');
 await act(async()=>{void submit();});assert.equal(calls[1][2].expectedRevision,5,'Refreshing data must not silently update the reviewed revision');assert.match(calls[0][2].idempotencyKey,/^erp-raw-[0-9A-F]{32}$/);assert.deepEqual(calls[1],calls[0],'Retry remains one measured intent');
 await act(async()=>queue.shift().resolve({...source,revision:6,rawMaterialConsumptionRecords:[{rollId:'R1',consumptionRecordId:'CONS-WRONG',consumedWeightKg:30}]}));
 assert.equal(tree.root.findAllByType('dialog').length,1,'A new consumption row with a different measured weight is not this confirmation');
 await act(async()=>{void submit();});
 await act(async()=>queue.shift().resolve({...source,revision:6,rawMaterialConsumptionRecords:[{rollId:'R1',consumptionRecordId:'CONS-1',consumedWeightKg:20}]}));assert.equal(tree.root.findAllByType('dialog').length,0);
 await act(async()=>open('loss'));assert.deepEqual(inputs().map(i=>i.props.value),['',''],'No 1000-unit basis or 98% yield');
 assert.match(text(),/CC1/);assert.match(text(),/CC2/);assert.match(text(),/CONS1/);assert.doesNotMatch(text(),/CC-OLD/,'Previously calibrated records must not appear in this review scope');
 await act(async()=>{inputs()[0].props.onChange({target:{value:'100'}});inputs()[1].props.onChange({target:{value:'95'}});note().props.onChange({target:{value:'生产记录复核'}});});
 await act(async()=>{void submit();});assert.equal(calls.at(-1)[2].expectedOutputQuantity,100);assert.equal(calls.at(-1)[2].actualQualifiedOutputQuantity,95);assert.notEqual(calls.at(-1)[2].idempotencyKey,calls[0][2].idempotencyKey,'A new measurement session has a new identity');
 await act(async()=>queue.shift().reject(new Error('连接中断')));assert.match(text(),/连接中断/);assert.equal(inputs()[1].props.value,'95');
 // A larger result array is insufficient: the new evidence must cover the frozen scope and measurements.
 await act(async()=>tree.update(element({...props,inbounds:[{...source,revision:7,rawMaterialCostAllocationConfirmations:[...source.rawMaterialCostAllocationConfirmations,{costConfirmationId:'CC3'}]}]})));
 for (const wrong of [{costConfirmationIds:['CC3'],expectedOutputQuantity:100,actualQualifiedOutputQuantity:95},{costConfirmationIds:['CC1','CC2'],expectedOutputQuantity:100,actualQualifiedOutputQuantity:90}]) {
   await act(async()=>{void submit();});
   await act(async()=>queue.shift().resolve({...source,rawMaterialCostLossCalibrations:[...source.rawMaterialCostLossCalibrations,{lossCalibrationId:'LC-WRONG',...wrong}]}));
   assert.equal(tree.root.findAllByType('dialog').length,1);assert.match(text(),/完整结果/);
 }
 const disabled={...props,getUiActionState:()=>({disabled:true,title:'权限已变化'})};await act(async()=>tree.update(element(disabled)));
 const before=calls.length;await act(async()=>{void submit();});assert.equal(calls.length,before,'Permission loss blocks the actual handler');
 await act(async()=>tree.update(element(props)));
 await act(async()=>{void submit();});
 await act(async()=>queue.shift().resolve({...source,rawMaterialCostLossCalibrations:[...source.rawMaterialCostLossCalibrations,{lossCalibrationId:'LC-NEW',costConfirmationIds:['CC1','CC2'],expectedOutputQuantity:100,actualQualifiedOutputQuantity:95}]}));
 assert.equal(tree.root.findAllByType('dialog').length,0,'Only matching calibration scope and measurements close the review');
 await act(async()=>open('loss'));
 await act(async()=>tree.update(element({...props,scope:'ACCOUNT-B'})));assert.equal(tree.root.findAllByType('dialog').length,0,'Account switch removes the old measurement session');
 const callsBeforeLeftover=calls.length; await act(async()=>open('leftover')); assert.equal(calls.length,callsBeforeLeftover); assert.equal(tree.root.findAllByType('dialog').length,0,'Whole-roll policy keeps leftover return disabled');
 for (const [starting,weight,quantity,status,remaining] of [[100,20,0,'机边领用',80],[100,100,0,'已消耗',0],[0,0,1,'已消耗',0]]) {
   const stockSource={...source,unit:quantity ? '件' : 'kg',projectionScope:'stock_only',rolls:[{id:'R1',weightKg:starting,inventoryStatus:'机边领用',consumptionRecordId:'OLD-CONS'}]};
   await act(async()=>tree.update(element({...props,inbounds:[stockSource]})));await act(async()=>open('consumeFull'));
   await act(async()=>{if(weight) inputs()[0].props.onChange({target:{value:String(weight)}});note().props.onChange({target:{value:'本次消耗复核'}});});
   const stockRoll={id:'R1',weightKg:remaining,inventoryStatus:status,consumptionRecordId:'NEW-CONS',lastConsumedWeightKg:weight,lastConsumedQuantity:quantity,remainingMachineSideWeightKg:remaining};
   for(const bad of [{...stockRoll,consumptionRecordId:'OLD-CONS'}, {...stockRoll,lastConsumedWeightKg:999,lastConsumedQuantity:999}, {...stockRoll,inventoryStatus:'可用'}]) {
     await act(async()=>{void submit();});await act(async()=>queue.shift().resolve({id:'I1',projectionScope:'stock_only',rolls:[bad]}));
     assert.equal(tree.root.findAllByType('dialog').length,1,'Wrong or stale stock-only receipt must retain consumption review');
   }
   await act(async()=>{void submit();});await act(async()=>queue.shift().resolve({id:'I1',projectionScope:'stock_only',rolls:[stockRoll]}));
   assert.equal(tree.root.findAllByType('dialog').length,0,'Exact stock-only consumption receipt closes without full history');
 }
 console.log('PASS warehouse consumption receipt: partial/full/piece, stale ID, wrong amount/status blocked, no full history required.');
 await act(async()=>tree.unmount());tree=null;
 console.log('PASS measured actions: open without write, explicit measured values, frozen revision, duplicate/Escape protection, failure retention, exact saved evidence, permission and account isolation. Actual React hook/dialog; write callback mocked.');
} finally {tree?.unmount();await rm(dir,{recursive:true,force:true});}
