import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const folder = await mkdtemp(join(tmpdir(), 'erp-receipt-draft-revision-'));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__receiptReloadAccepted = false;
try {
  const output = await build({
    stdin: { contents: `import React from 'react'; import {create, act} from 'react-test-renderer'; import {FormalReceivingWorkspace} from './docs/prototypes/raw-material-roll-inventory-review/src/FormalReceivingWorkspace.jsx'; export {create,act}; export const element=props=><FormalReceivingWorkspace {...props}/>;`, resolveDir: process.cwd(), loader: 'jsx' },
    bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', write: false, logLevel: 'silent', define: {'import.meta.env': '{}'},
    plugins: [{ name: 'review-ui-boundaries', setup(builder) {
      builder.onResolve({filter: /^(react(?:\/.*)?|react-test-renderer)$/}, args => ({path: require.resolve(args.path), external: true}));
      builder.onLoad({filter: /\.css$/}, () => ({contents: '', loader: 'js'}));
      builder.onLoad({filter: /\/seedPermissions\.js$/}, () => ({contents: 'export const getUiActionState=()=>({disabled:false,title:""}); export const defaultSeedUserId="test-only"; export const getSeedPermissionContext=()=>({});', loader:'js'}));
      builder.onLoad({filter: /\/confirmDialog\.js$/}, () => ({contents: 'export const confirmInApp=async()=>globalThis.__receiptReloadAccepted;', loader: 'js'}));
      builder.onLoad({filter: /\/InboundDetail\.jsx$/}, () => ({contents: `import React from 'react'; export function InboundDetail({state}) { globalThis.__receiptTestState=state; return <section><input aria-label="draft-ticket-colour" value={state.ocrLineReviewDraft.L1?.supplierColor || ''} onChange={event=>state.setOcrLineReviewDraft(current=>({...current,L1:{...current.L1,supplierColor:event.target.value}}))}/><button id="review" disabled={state.reviewState.disabled}>review</button></section>; }`, loader: 'jsx'}));
      builder.onLoad({filter: /\/RawMaterialLabelPrintSheet\.jsx$/}, () => ({contents: 'export const RawMaterialLabelPrintSheet=()=>null;', loader:'js'}));
    }}],
  });
  const bundlePath = join(folder, 'test.cjs');
  await writeFile(bundlePath, output.outputFiles[0].text);
  const { create, act, element } = require(bundlePath);
  const receipt = revision => ({id:'receipt-concurrent',revision,status:'已识别待复核',supplierName:'审查供应商',receivedAt:'2026-11-02',totalWeightKg:10,rollCount:1,ocrReviewFields:[],ocrLines:[{lineId:'L1',values:{supplierColor:revision===1?'原票面色':'另一人更正的票面色',factoryColor:'',spec:'78*70*1000',rollCount:1,totalWeightKg:10,rollWeightsKg:[10]}}],rolls:[]});
  let serverRevision = 1;
  const attempts = [];
  const actions = {
    selectReceipt: async()=>{},
    updateRawMaterialInbound: async(action,id,options)=>{ attempts.push(options.expectedRevision); if(options.expectedRevision !== serverRevision) return {source:'api_error',error:{message:'单据版本冲突'}}; serverRevision += 1; return {source:'api',inbound:receipt(serverRevision)}; },
  };
  const formal = revision => ({receiving:{selectedInbound:receipt(revision),selectedId:'receipt-concurrent',items:[],detailState:{hasLoaded:true,loading:false,stale:false,error:''}},permissionContext:{},data:{productionTasks:[],supplierStatementReviews:[]},actions,authState:{},operatorId:'test-only'});
  const props = revision => ({formal:formal(revision),selectedId:'receipt-concurrent',setSelectedId:()=>{}});
  let tree;
  await act(async()=>{tree=create(element(props(1)));});
  const input=()=>tree.root.findByProps({'aria-label':'draft-ticket-colour'});
  await act(async()=>input().props.onChange({target:{value:'本页未提交更正'}}));
  const oldCommand=globalThis.__receiptTestState.onAction;
  serverRevision=2;
  await act(async()=>tree.update(element(props(2))));
  assert.equal(input().props.value,'本页未提交更正','new server revision must preserve unsaved input');
  assert.equal(tree.root.findByProps({id:'review'}).props.disabled,true,'a newer revision must block confirmation');
  assert.ok(JSON.stringify(tree.toJSON()).includes('其他操作更新'),'revision conflict must remain visible');
  await act(async()=>globalThis.__receiptTestState.onAction('复核送货单','receipt-concurrent',{}));
  assert.equal(attempts.length,0,'blocked current UI cannot call a write');
  await act(async()=>oldCommand('复核送货单','receipt-concurrent',{expectedRevision:2}));
  assert.deepEqual(attempts,[1],'even an old retained callback must submit its draft-base revision, never the refreshed revision');
  const reload=()=>tree.root.findAllByType('button').find(button=>button.children.includes('重新载入本单'));
  await act(async()=>reload().props.onClick());
  assert.equal(input().props.value,'本页未提交更正','cancel reload must keep the draft');
  globalThis.__receiptReloadAccepted=true;
  await act(async()=>reload().props.onClick());
  assert.equal(input().props.value,'另一人更正的票面色','explicit reload must load the newest confirmed receipt');
  assert.equal(tree.root.findByProps({id:'review'}).props.disabled,false);
  await act(async()=>globalThis.__receiptTestState.onAction('复核送货单','receipt-concurrent',{}));
  assert.deepEqual(attempts,[1,2],'a reloaded draft may submit its newly acknowledged revision');
  await act(async()=>tree.update(element(props(3))));
  assert.equal(tree.root.findByProps({id:'review'}).props.disabled,false,'this user’s own successful write must not trigger an external-update conflict');
  await act(async()=>tree.unmount());
  console.log('receiving draft revision UI check passed');
} finally {
  delete globalThis.__receiptTestState;
  delete globalThis.__receiptReloadAccepted;
  await rm(folder,{recursive:true,force:true});
}
