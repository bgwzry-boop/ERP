import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import { resolveTodoWorkspaceLink } from '../docs/prototypes/raw-material-roll-inventory-review/src/todo-workspace-link.js';
import { resolvePermissionAssignment } from '../shared/auth/roleCatalog.js';
const office = resolvePermissionAssignment({roles:['office']});
const valid = {id:'TEST-TODO',type:'生产异常',refType:'order_line',resolvedRefType:'production_task',resolvedRefId:'PT-TEST',referenceStatus:'valid',ref:'OLD-ALIAS',summary:'核对合成生产任务',latest:'9月6日18:00',wait:'30分钟',impact:'请核对当前生产安排',reminderLevelLabel:'异常',customerName:'合成客户',handled:false,urgency:'异常'};
assert.equal(resolveTodoWorkspaceLink(valid,office).navId,'production-tasks');
for(const status of ['', 'missing','unverifiable']) assert.equal(resolveTodoWorkspaceLink({...valid,referenceStatus:status},office).disabled,true);
for(const type of ['inventory_correction','future_type','']) assert.equal(resolveTodoWorkspaceLink({...valid,resolvedRefType:type},office).disabled,true);
assert.equal(resolveTodoWorkspaceLink({...valid,resolvedRefId:''},office).disabled,true);
assert.match(resolveTodoWorkspaceLink({...valid,referenceStatus:'unverifiable',referenceReason:'待办与引用目标的客户归属不一致，请核对业务编号'},office).reason,/客户归属不一致/);
assert.equal(resolveTodoWorkspaceLink(valid,resolvePermissionAssignment({roles:['office'],denyPermissions:['production.read']})).disabled,true);
for(const [type,target] of Object.entries({order_draft:'order-entry',order_line:'order-pool',statement:'customer-statements',fulfillment:'outbound-delivery'})) assert.equal(resolveTodoWorkspaceLink({...valid,resolvedRefType:type},office).navId,target);
assert.deepEqual(resolveTodoWorkspaceLink({...valid,resolvedRefType:'maintenance_task',resolvedRefId:'MT-EXACT'},office),{navId:'maintenance-tasks',label:'打开设备任务',reason:'',disabled:false,maintenanceTaskId:'MT-EXACT'});
const fixture=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {TodoWorkspace} from './docs/prototypes/raw-material-roll-inventory-review/src/BusinessWorkspaces.jsx';
function Harness(){const[state,setState]=useState({todo:${JSON.stringify(valid)},permissions:${JSON.stringify(office)}});window.setFixture=setState;window.calls=window.calls||[];window.targets=[];return <TodoWorkspace formal={{data:{todos:state.todo?[state.todo]:[]},permissionContext:state.permissions,collections:{todos:{page:1,pageSize:50,total:state.todo?1:0,viewCounts:{'未处理':state.todo?1:0,'异常/提醒':state.todo?1:0,'全部':state.todo?1:0}}},actions:{readCollection:async()=>({source:'api'}),refreshAll:async()=>{}}}} onNavigate={(id,target)=>{window.calls.push(id);window.targets.push(target);return !window.rejectNavigation;}}/>}createRoot(document.getElementById('app')).render(<Harness/>);`;
const bundle=await build({stdin:{contents:fixture,resolveDir:process.cwd(),loader:'jsx'},bundle:true,format:'iife',write:false,jsx:'automatic',loader:{'.css':'empty','.svg':'dataurl','.png':'dataurl'},logLevel:'silent'});
const browser=await chromium.launch({headless:true});
const folder='docs/development/optimization-2026-09-05/screenshots/todo-link';await mkdir(folder,{recursive:true});
try {
 for(const width of [1440,800]) {
  const page=await browser.newPage({viewport:{width,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<!doctype html><meta charset="utf-8"><p>合成待办组件检查 · 非业务数据</p><div id="app"></div>');
  for(const file of ['styles.css','business-workspaces.css']) await page.addStyleTag({content:await readFile('docs/prototypes/raw-material-roll-inventory-review/src/'+file,'utf8')});
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  const link=page.getByRole('button',{name:'打开生产任务列表',exact:true});await link.waitFor();await link.focus();await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(()=>window.calls),['production-tasks']);
  assert.equal(await page.getByRole('tablist',{name:'公共待办详情'}).count(),0);
  assert.equal(await page.getByText('正式公共待办 API',{exact:true}).count(),0);
  assert.match(await page.locator('.todo-source-detail').innerText(),/PT-TEST/);
  await page.screenshot({path:`${folder}/valid-${width}.png`,fullPage:true});
  await page.evaluate(({todo,permissions})=>window.setFixture({todo,permissions}),{todo:valid,permissions:resolvePermissionAssignment({roles:['office'],denyPermissions:['production.read']})});
  const blocked=page.getByRole('button',{name:'打开关联工作台',exact:true});await page.waitForFunction(()=>document.querySelector('.todo-source-detail footer .primary')?.disabled);
  assert.equal(await blocked.isDisabled(),true);assert.equal(await blocked.evaluate(el=>getComputedStyle(el).cursor),'not-allowed');assert.match(await page.locator('#todo-link-status').innerText(),/无权/);
  assert.deepEqual(await page.evaluate(()=>window.calls),['production-tasks']);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await page.screenshot({path:`${folder}/denied-${width}.png`,fullPage:true});
  for(const [todo,expected] of [[{...valid,referenceStatus:'missing'},'尚未核实'],[{...valid,resolvedRefType:'future_type'},'尚未配置'],[{...valid,referenceStatus:'unverifiable',referenceReason:'待办与引用目标的客户归属不一致，请核对业务编号'},'客户归属不一致'],[null,'请先选择']]) {
   await page.evaluate(({todo,permissions})=>window.setFixture({todo,permissions}),{todo,permissions:office});
   await page.waitForFunction(expected=>document.querySelector('.todo-source-detail footer .primary')?.disabled && document.querySelector('#todo-link-status')?.textContent.includes(expected),expected);
   assert.equal(await blocked.isDisabled(),true);
  }
  await page.evaluate(({todo,permissions})=>{window.rejectNavigation=true;window.setFixture({todo,permissions});},{todo:valid,permissions:office});
  await link.click();assert.match(await page.locator('#todo-link-status').innerText(),/页面权限已变化/);
  await page.evaluate(({todo,permissions})=>{window.rejectNavigation=false;window.setFixture({todo,permissions});},{todo:{...valid,type:'设备报修',resolvedRefType:'maintenance_task',resolvedRefId:'MT-EXACT'},permissions:office});
  await page.getByRole('button',{name:'打开设备任务',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>window.targets.at(-1)),{maintenanceTaskId:'MT-EXACT'});
  for (const todoType of ['待打印标签','照片待重拍']) {
  await page.evaluate(({todo,permissions})=>{window.rejectNavigation=false;window.setFixture({todo,permissions});},{todo:{...valid,type:todoType,resolvedRefType:'fulfillment',resolvedRefId:'F-EXACT-OUTSIDE-PAGE'},permissions:office});
  await page.getByRole('button',{name:'打开出库交付记录',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>window.targets.at(-1)),{fulfillmentId:'F-EXACT-OUTSIDE-PAGE'});
  }
  await page.evaluate(({todo,permissions})=>window.setFixture({todo,permissions}),{todo:{...valid,type:'成品图需重拍',resolvedRefType:'order_line',resolvedRefId:'OL-TWO-STAGES',productionTaskId:'PT-BAG-EXACT',productionTaskReferenceStatus:'valid'},permissions:office});
  await page.getByRole('button',{name:'打开重拍生产任务',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>window.targets.at(-1)),{productionTaskId:'PT-BAG-EXACT'});
  for (const status of ['missing','ambiguous']) {
    await page.evaluate(({todo,permissions})=>window.setFixture({todo,permissions}),{todo:{...valid,type:'成品图需重拍',productionTaskId:'PT-BAG-EXACT',productionTaskReferenceStatus:status},permissions:office});
    await page.waitForFunction(()=>document.querySelector('.todo-source-detail footer .primary')?.disabled);
    assert.match(await page.locator('#todo-link-status').innerText(),/归属缺失或冲突/);
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS actual TodoWorkspace 1440/800: resolved type, permission denial, invalid/unsupported/empty reference, keyboard action, navigation rejection feedback, redundant tabs removed. Synthetic fixtures.');
} finally {await browser.close();}
