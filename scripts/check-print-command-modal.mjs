import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const require=createRequire(import.meta.url),dir=await mkdtemp(join(tmpdir(),'erp-print-modal-'));
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const previousStorage=globalThis.sessionStorage;
const data=new Map();
globalThis.sessionStorage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
let tree;
try{
 const result=await build({stdin:{contents:`import React from 'react';import {create,act} from 'react-test-renderer';import {ActionModal} from './src/app/ActionModals.jsx';import {useOfficePrintWrites} from './src/app/useOfficePrintWrites.js';function Hook({options,onActions}){onActions(useOfficePrintWrites(options));return null;}export const hookElement=p=><Hook {...p}/>;export {create,act};export const element=p=><ActionModal key={p.modal.sessionOwner+':'+p.modal.fulfillmentId} {...p}/>;`,resolveDir:process.cwd(),loader:'jsx'},bundle:true,platform:'node',format:'cjs',jsx:'automatic',write:false,logLevel:'silent',plugins:[{name:'react-runtime',setup(b){b.onResolve({filter:/^(react(?:\/.*)?|react-test-renderer)$/},a=>({path:require.resolve(a.path),external:true}));}}]});
 const path=join(dir,'test.cjs');await writeFile(path,result.outputFiles[0].text);
 const {create,act,element,hookElement}=require(path);
 let calls=[],pending=[],closed=0;
 const props={modal:{type:'printVoid',action:'作废旧标签',fulfillmentId:'F-1',printRecordId:'PR-OLD',sessionOwner:'U-A'},fulfillments:[{id:'F-1',method:'快递快运',activePrintRecordId:'PR-OLD'}],statements:[],orderLines:[],findCustomer:()=>({}),getStatementBlockingAmount:()=>0,onClose:()=>closed++,onConfirm:payload=>new Promise((resolve,reject)=>{calls.push(payload);pending.push({resolve,reject});})};
 const primary=()=>tree.root.findByProps({className:'primary-action'});
 const alerts=()=>tree.root.findAllByProps({role:'alert'}).map(n=>n.children.join('')).join(' ');
 await act(async()=>{tree=create(element(props));});
 await act(async()=>{const click=primary().props.onClick;void click();void click();});
 assert.equal(calls.length,1);assert.equal(primary().props.disabled,true);
 assert.equal(tree.root.findByProps({'aria-label':'关闭业务操作'}).props.disabled,true);
 assert.equal(tree.root.findByType('select').props.disabled,true);
 const original=structuredClone(calls[0]);assert(data.size===1);
 assert(![...data.values()][0].includes('accessToken'));
 await act(async()=>pending.shift().reject(new Error('network')));
 assert.match(alerts(),/保留原请求/);assert.equal(primary().props.disabled,false);
 await act(async()=>tree.update(element({...props,fulfillments:[{id:'F-1',method:'送货',activePrintRecordId:'PR-NEW'}]})));
 await act(async()=>{void primary().props.onClick();});assert.deepEqual(calls[1],original);
 await act(async()=>pending.shift().resolve({blocked:true,feedback:'结果不完整'}));
 // Closing/remounting simulates same-tab reload: draft is read from storage.
 await act(async()=>tree.unmount());
 await act(async()=>{tree=create(element({...props,fulfillments:[{id:'F-1',method:'送货',activePrintRecordId:'PR-NEW'}]}));});
 assert.equal(tree.root.findByType('input').props.value,'PR-OLD');
 await act(async()=>{void primary().props.onClick();});assert.deepEqual(calls[2],original);
 await act(async()=>pending.shift().resolve({blocked:true,error:{code:'BUSINESS_WRITE_CONFLICT'},feedback:'请重新核对'}));
 assert.equal(primary().props.disabled,true);
 const reset=tree.root.findAllByType('button').find(n=>n.children.join('')==='结束本次重试并关闭');
 await act(async()=>reset.props.onClick());assert.equal(data.size,0);assert.equal(closed,1);
 await act(async()=>tree.unmount());
 // Storage failure must stop before sending; another user cannot load U-A's pending request.
 globalThis.sessionStorage.setItem=()=>{throw new Error('quota');};
 await act(async()=>{tree=create(element(props));});
 await act(async()=>{void primary().props.onClick();});assert.equal(calls.length,3);assert.match(alerts(),/尚未发送/);
 globalThis.sessionStorage.setItem=(key,value)=>data.set(key,value);
 await act(async()=>{void primary().props.onClick();});
 await act(async()=>pending.shift().resolve({blocked:true,feedback:'retry'}));
 const oldKey=calls[3].printRequest.idempotencyKey;
 const {readPrintCommandDraft}=await import('../src/features/printing/print-command-draft.js');
 assert.equal(readPrintCommandDraft({...props.modal,printRecordId:'PR-ANOTHER'}).request,null,'A different label has a distinct retry scope');
 await act(async()=>tree.update(element({...props,modal:{...props.modal,sessionOwner:'U-B'}})));
 assert.equal(tree.root.findByType('select').props.disabled,false);
 await act(async()=>{void primary().props.onClick();});assert.notEqual(calls[4].printRequest.idempotencyKey,oldKey);
 await act(async()=>pending.shift().resolve({confirmed:true}));assert.equal(data.size,1,'Success clears only the current owner request');
 await act(async()=>tree.unmount());tree=null;
 for(const change of ['account','permission','unmount']){
   let actions,finish,refreshes=0;
   const auth={session:{accessToken:'TOKEN-A'},permissions:{actionPermissions:['fulfillment.print']}};
   const options={authState:auth,currentUserId:'U-A',fulfillmentsRef:{current:[{id:'F-1',method:'快递快运'}]},api:{printOfficeFulfillment:()=>new Promise(resolve=>finish=resolve)},refreshFulfillments:async()=>{refreshes++;return{source:'api'};},refreshOfficePrintJobQueue:async()=>{refreshes++;return{source:'api'};},serverRequired:()=>true};
   const onActions=value=>actions=value;
   await act(async()=>{tree=create(hookElement({options,onActions}));});
   const request=actions.printFulfillmentDocument({modal:{fulfillmentId:'F-1',action:'打印标签'}});
   if(change==='unmount'){await act(async()=>tree.unmount());tree=null;}
   else await act(async()=>tree.update(hookElement({onActions,options:{...options,currentUserId:change==='account'?'U-B':'U-A',authState:{session:{accessToken:change==='account'?'TOKEN-B':'TOKEN-A'},permissions:{actionPermissions:[]}}}})));
   finish({source:'api'});assert.equal((await request).stale,true);assert.equal(refreshes,0);
   if(tree){await act(async()=>tree.unmount());tree=null;}
 }
 console.log('PASS actual print hook ignores old responses after account change, permission revocation and unmount.');
 console.log('PASS actual print modal: double click, locked fields, network failure, immutable target across refresh/remount, conflict recovery, storage failure, owner isolation and success cleanup. Component test, not complete 4174 acceptance.');
}finally{if(tree){const {act}=require('react-test-renderer');await act(async()=>tree.unmount());}globalThis.sessionStorage=previousStorage;await rm(dir,{recursive:true,force:true});}
