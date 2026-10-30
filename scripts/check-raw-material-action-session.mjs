import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const require = createRequire(import.meta.url);
const dir = await mkdtemp(join(tmpdir(), 'erp-raw-session-'));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let tree;
try {
  const built = await build({stdin:{contents:`import React from 'react';import {create,act} from 'react-test-renderer';import {useOfficeRawMaterialActions} from './src/app/useOfficeRawMaterialActions.js';export {create,act};function Harness(p){p.expose(useOfficeRawMaterialActions(p));return null}export const element=p=><React.StrictMode><Harness {...p}/></React.StrictMode>;`,resolveDir:process.cwd(),loader:'jsx'},bundle:true,platform:'node',format:'cjs',jsx:'automatic',write:false,logLevel:'silent',plugins:[{name:'react',setup(b){b.onResolve({filter:/^(react(?:\/.*)?|react-test-renderer)$/},a=>({path:require.resolve(a.path),external:true}));}}]});
  const file=join(dir,'test.cjs');await writeFile(file,built.outputFiles[0].text);
  const {create,act,element}=require(file);
  let actions, queued=[], effects=[], network=[], progress;
  const api={};
  for(const name of ['updateOfficeRawMaterialInboundAction','recognizeOfficeRawMaterialDeliveryNote','createOfficeRawMaterialSupplierStatementReviewDraft','confirmOfficeRawMaterialSupplierPayment']) {
    api[name]=input=>{network.push({name,input});progress=input.onProgress;return new Promise(resolve=>queued.push(resolve));};
  }
  const inbound={id:'I1',revision:1,rolls:[]};
  const base={api,allowLocalFallback:true,authState:{authenticated:true,source:'runtime',session:{accessToken:'A'},permissions:{roles:['office'],actionPermissions:['raw.write','raw.read'],buttonPermissions:[],user:{enabled:true}}},currentUserId:'A',currentUser:{displayName:'A'},activePage:'rawMaterials',renderedPage:'rawMaterials',selectedRawMaterialInboundId:'I1',guardUiAction:()=>true,customers:[],orderLines:[],rawMaterialInboundsRef:{current:[inbound]},rawMaterialSupplierStatementReviewsRef:{current:[]},expose:value=>{actions=value;}};
  for(const name of ['setRawMaterialInboundMeta','setRawMaterialInbounds','setRawMaterialSupplierStatementReviewMeta','setRawMaterialSupplierStatementReviews','setSelectedRawMaterialInboundId','setToast']) base[name]=value=>effects.push({name,value});
  const render=async p=>act(async()=>{if(tree)tree.update(element(p));else tree=create(element(p));});
  const start=async operation=>{let pending;await act(async()=>{pending=operation();});return {pending};};
  const finish=async result=>act(async()=>{queued.shift()(result);});
  await render(base);
  // Equivalent objects and permission order must not discard real success.
  let run=await start(()=>actions.updateRawMaterialInbound('确认消耗','I1'));
  await render({...base,authState:{...base.authState,permissions:{...base.authState.permissions,actionPermissions:['raw.read','raw.write']}}});
  await finish({source:'api',inbound:{...inbound,revision:2}});assert.equal((await run.pending).revision,2);assert.ok(effects.length);
  assert.equal(typeof effects.find(item=>item.name==='setToast').value,'string','toast is an imperative message callback, not a state updater');
  const deferred=effects.find(item=>item.name==='setRawMaterialInbounds').value;
  await render({...base,currentUserId:'B'});const newer=[{id:'B-private'}];assert.equal(deferred(newer),newer,'Queued updater cannot cross identities');
  for(const change of [{currentUserId:'B'},{selectedRawMaterialInboundId:'I2'},{activePage:'todos'},{renderedPage:'attendanceMobile'},{authState:{...base.authState,session:{accessToken:'B'}}},{authState:{...base.authState,permissions:{...base.authState.permissions,actionPermissions:[]}}}]) {
    await render(base);effects=[];
    run=await start(()=>actions.updateRawMaterialInbound('确认消耗','I1'));
    const stale=actions;
    await render({...base,...change});await render(base); // Returning to A must not revive old callbacks.
    await finish({source:'api',inbound:{...inbound,revision:9}});
    assert.equal(await run.pending,null);assert.deepEqual(effects,[]);
    const count=network.length;assert.equal(await stale.updateRawMaterialInbound('确认消耗','I1'),null);assert.equal(network.length,count);
  }
  await render(base);effects=[];
  run=await start(()=>actions.updateRawMaterialInbound('确认消耗','I1'));
  await render({...base,currentUserId:'B'});await finish({blocked:true,error:{message:'offline'}});
  assert.equal(await run.pending,null);assert.deepEqual(effects,[],'Stale failure cannot invoke local fallback or overwrite notices');
  let progressCount=0, prompts=0;const previousConfirm=globalThis.confirm;globalThis.confirm=()=>{prompts++;return true;};
  try {
    await render(base);effects=[];
    run=await start(()=>actions.recognizeRawMaterialDeliveryNote({onProgress:()=>progressCount++}));
    progress({});assert.equal(progressCount,1);
    await render({...base,currentUserId:'B'});progress({});assert.equal(progressCount,1);
    await finish({blocked:true,error:{code:'RAW_MATERIAL_DELIVERY_NOTE_DUPLICATE_CONFIRMATION_REQUIRED',details:{confirmationToken:'old'}}});
    assert.equal(await run.pending,null);assert.equal(prompts,0);assert.deepEqual(effects,[]);
  } finally {globalThis.confirm=previousConfirm;}
  for(const operation of [()=>actions.saveRawMaterialSupplierStatementReviewDraft({}),()=>actions.confirmRawMaterialSupplierPayment('REVIEW-1')]) {
    await render(base);effects=[];run=await start(operation);
    await render({...base,currentUserId:'B'});await finish({source:'api',review:{reviewId:'REVIEW-1'}});
    assert.equal(await run.pending,null);assert.deepEqual(effects,[]);
  }
  await render(base);effects=[];run=await start(()=>actions.updateRawMaterialInbound('确认消耗','I1'));
  await act(async()=>tree.unmount());tree=null;await finish({source:'api',inbound});assert.equal(await run.pending,null);assert.deepEqual(effects,[]);
  console.log('PASS raw action session: equivalent refresh, account/token/permission/page/selection changes, A-B-A, deferred setters, obsolete handlers, OCR progress/prompts, supplier writes, fallback and unmount. Actual React; API callbacks synthetic.');
} finally {
  if(tree)tree.unmount();
  await rm(dir,{recursive:true,force:true});
}
