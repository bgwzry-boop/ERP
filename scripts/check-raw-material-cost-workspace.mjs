import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getRolePermissionSet } from '../shared/auth/roleCatalog.js';
import { authorizeBusinessRead } from '../server/services/businessReadAccessService.mjs';
import { createRequestAuthorizationService } from '../server/services/requestAuthorizationService.mjs';

// The moved finance entry must retain the existing server read gate. A cost
// view grant alone cannot substitute for raw_material.inbound.read.
const finance = { ...getRolePermissionSet(['finance']), user: { userId: 'SYNTHETIC-U', defaultRole: 'finance' } };
assert(finance.actionPermissions.includes('raw_material.inbound.read'));
const deniedReplies = [];
const { requireAnyActionPermission } = createRequestAuthorizationService({ sendJson: (_response, status) => deniedReplies.push(status) });
assert.equal(authorizeBusinessRead({ url: new URL('http://cost.test/api/raw-material-inbounds'), response: {}, permissionContext: finance, requireAnyActionPermission }), true);
assert.equal(authorizeBusinessRead({ url: new URL('http://cost.test/api/raw-material-inbounds'), response: {}, permissionContext: { ...finance, actionPermissions: ['raw_material.cost.view'] }, requireAnyActionPermission }), false);
assert.deepEqual(deniedReplies, [403]);

const root = fileURLToPath(new URL('../', import.meta.url));
const screenshots = fileURLToPath(new URL('../screenshots/raw-material-cost-workspace/', import.meta.url));
const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const { chromium } = require('playwright');
const fixture = `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {RawMaterialCostWorkspace} from './docs/prototypes/raw-material-roll-inventory-review/src/RawMaterialCostWorkspace.jsx';
import {getRolePermissionSet} from './shared/auth/roleCatalog.js';
import {applyRawMaterialCostMarginAction} from './server/rawMaterialCostMarginActionService.mjs';
const base={id:'COST-I1',revision:1,status:'已消耗确认',supplierName:'合成供应商A',deliveryNoteNo:'SYNTHETIC-A',materialType:'无纺布',productName:'无纺布',factoryColor:'红色',unit:'kg',unitPrice:9,receivedAt:'2026-11-01T08:00:00',rawMaterialIssueRecords:[{issueRecordId:'IS1',inboundId:'COST-I1',rollId:'R1',productionTaskId:'TASK1',productionTaskOrderLineId:'LINE1',productionTaskMachineId:'BAG-01',productionTaskMatchStatus:'已匹配'}],rawMaterialConsumptionRecords:[{consumptionRecordId:'CONS1',inboundId:'COST-I1',issueRecordId:'IS1',rollId:'R1',consumedWeightKg:30}]};
const workspace={productionTasks:[{id:'TASK1',orderLineId:'LINE1',plannedQty:100,machineId:'BAG-01'}],orderLines:[{id:'LINE1',customerId:'C1',orderNo:'ORDER1',productName:'无纺布袋',qty:100,amount:900}],customers:[{id:'C1',name:'合成客户'}]};
const commands={'生成成本草稿':'generate_cost_draft','确认成本草稿':'confirm_cost_draft','校准损耗':'calibrate_loss','生成毛利快照':'generate_margin_snapshot','复核毛利快照':'review_margin_snapshot'};
window.calls=[];
function Harness(){const [rows,setRows]=useState([base,{...base,id:'HIDDEN-DRAFT',supplierName:'隐藏草稿',status:'已识别待复核'},{...base,id:'HIDDEN-VOID',supplierName:'隐藏作废',status:'已作废'},{...base,id:'HIDDEN-RETURN',supplierName:'隐藏退货',documentDirection:'supplier_return',status:'退货单已复核'}]);const [mode,setMode]=useState('all');window.setCostMode=setMode;const p=getRolePermissionSet(['finance']);const permissions={...p,user:{userId:'SYNTHETIC-U',displayName:'合成财务',defaultRole:'finance'},actionPermissions:mode==='all'?p.actionPermissions:mode==='view'?['raw_material.cost.view']:[],buttonPermissions:mode==='none'?[]:p.buttonPermissions.filter(x=>mode==='all'||x==='raw_material.cost.view')};const authState={authenticated:true,session:{accessToken:'SYNTHETIC-ONLY'},permissions};const formal={authState,permissionContext:permissions,data:{rawMaterialInbounds:rows,productionTasks:workspace.productionTasks},meta:{errors:{},loading:false},actions:{refreshAll:async()=>{},updateRawMaterialInbound:async(action,id,options)=>{window.calls.push({action,id,options});const before=rows.find(row=>row.id===id);if(options?.expectedRevision!==undefined&&options.expectedRevision!==before.revision)throw new Error('版本冲突');const inbound={...applyRawMaterialCostMarginAction({action:commands[action],before,body:options,workspace,operatorId:'SYNTHETIC-U',operatorName:'合成财务'}),revision:before.revision+1};setRows(current=>current.map(row=>row.id===id?inbound:row));return{source:'api',inbound};}}};return <main className='page business-page'><RawMaterialCostWorkspace formal={formal}/></main>};createRoot(document.getElementById('app')).render(<Harness/>);`;
const result=await build({stdin:{contents:fixture,resolveDir:root,loader:'jsx'},bundle:true,write:false,format:'iife',jsx:'automatic',loader:{'.css':'empty'},define:{'import.meta.env':'{}'},logLevel:'silent',plugins:[{name:'one-react',setup(b){b.onResolve({filter:/^(react|react-dom)(\/.*)?$/},args=>({path:require.resolve(args.path)}));}}]});
const cssFiles=['src/styles/tokens.css','docs/prototypes/raw-material-roll-inventory-review/src/styles.css','src/styles/shared.css','src/styles/components.css','src/styles/features/raw-material-measurement.css','src/styles/features/raw-material-record-history.css','docs/prototypes/raw-material-roll-inventory-review/src/raw-material-cost.css'];
const css=(await Promise.all(cssFiles.map(file=>readFile(`${root}/${file}`,'utf8')))).join('\n');
await mkdir(screenshots,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}});const errors=[];page.on('pageerror',err=>{errors.push(err.message);console.error('PAGE ERROR:',err.message);});
 await page.route('http://cost.test/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><div id="app"></div></html>'}));
 await page.goto('http://cost.test/');await page.addStyleTag({content:css+'\n.page{height:100vh}'});await page.addScriptTag({content:result.outputFiles[0].text});
 try { await page.getByRole('heading',{name:'原料成本',exact:true}).waitFor({timeout:5000}); } catch(error) { console.error(await page.locator('body').innerText()); throw error; }
 assert.equal(await page.locator('.raw-material-cost-records > button').count(),1,'Draft, void and return documents stay out of cost');
 const action=name=>page.getByRole('button',{name,exact:true});
 assert.equal(await action('生成成本草稿').isEnabled(),true);assert.equal(await action('确认成本草稿').isDisabled(),true);
 await action('生成成本草稿').click();await action('确认成本草稿').waitFor();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='确认成本草稿').disabled);
 await action('确认成本草稿').click();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='校准损耗').disabled);
 await action('校准损耗').click();const dialog=page.getByRole('dialog');await dialog.waitFor();
 assert.equal((await page.evaluate(()=>window.calls)).length,2,'Opening measured loss does not write');
 await dialog.getByLabel('预计产量',{exact:true}).fill('100');await dialog.getByLabel('实际合格产量',{exact:true}).fill('95');await dialog.getByLabel('实测依据 / 报工记录说明',{exact:true}).fill('合成验收：真实测量值输入');
 await dialog.getByRole('button',{name:'确认实测并校准',exact:true}).click();await dialog.waitFor({state:'hidden'});
 await action('生成毛利快照').click();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='复核毛利快照').disabled);await action('复核毛利快照').click();
 await page.getByText('毛利已复核/报表可用',{exact:true}).waitFor();
 const calls=await page.evaluate(()=>window.calls);assert.deepEqual(calls.map(call=>call.action),['生成成本草稿','确认成本草稿','校准损耗','生成毛利快照','复核毛利快照']);
 assert.equal(calls[2].options.expectedRevision,3);assert.equal(calls[2].options.expectedOutputQuantity,100);assert.equal(calls[2].options.actualQualifiedOutputQuantity,95);assert.match(calls[2].options.idempotencyKey,/^erp-raw-/);
 await page.getByRole('heading',{name:'成本记录',exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'领料记录',exact:false}).count(),0,'Financial history excludes warehouse actions');
 await page.screenshot({path:`${screenshots}/1440.png`,fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.setViewportSize({width:1180,height:900});await page.screenshot({path:`${screenshots}/1180.png`,fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.evaluate(()=>window.setCostMode('view'));for(const name of Object.keys({'生成成本草稿':1,'确认成本草稿':1,'校准损耗':1,'生成毛利快照':1,'复核毛利快照':1}))assert.equal(await action(name).isDisabled(),true);
 await page.evaluate(()=>window.setCostMode('none'));await page.getByText('无权查看原料成本',{exact:true}).waitFor();assert.equal(await page.locator('.raw-material-cost-records').count(),0);assert.equal((await page.evaluate(()=>window.calls)).length,5);
 assert.deepEqual(errors,[]);console.log('PASS actual financial workspace: five existing server actions, measured loss/revision/key, cost-only history, pending/void/return exclusion, exact view/write permissions and 1440/1180 layout. Synthetic isolated callback; no ERP API or business writes.');
}finally{await browser.close();}
