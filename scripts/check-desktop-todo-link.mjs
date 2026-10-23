import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {resolveTodoWorkspaceLink} from '../docs/prototypes/raw-material-roll-inventory-review/src/todo-workspace-link.js';
import {resolvePermissionAssignment} from '../shared/auth/roleCatalog.js';
const office=resolvePermissionAssignment({roles:['office']});
const task={id:'T-EXACT',type:'成品图需重拍',referenceStatus:'valid',resolvedRefType:'order_line',resolvedRefId:'OL-1',productionTaskId:'PT-BAG',productionTaskReferenceStatus:'valid',ref:'OL-1',handled:false};
assert.equal(resolveTodoWorkspaceLink(task,office).productionTaskId,'PT-BAG');
for(const status of ['missing','unverifiable'])assert.equal(resolveTodoWorkspaceLink({...task,referenceStatus:status},office).disabled,true);
assert.equal(resolveTodoWorkspaceLink({...task,productionTaskReferenceStatus:'ambiguous'},office).disabled,true);
assert.equal(resolveTodoWorkspaceLink(task,resolvePermissionAssignment({roles:['office'],denyPermissions:['production.read']})).disabled,true);
// A desktop maintenance route remains a separately recorded product gap, never a fake link.
assert.equal(resolveTodoWorkspaceLink({...task,type:'设备报修',resolvedRefType:'maintenance_task',resolvedRefId:'MT-1'},office).disabled,true);
const fixture=`import React from 'react';import{createRoot}from'react-dom/client';import{TodoWorkspace}from'./docs/prototypes/raw-material-roll-inventory-review/src/BusinessWorkspaces.jsx';window.targets=[];createRoot(document.getElementById('app')).render(<TodoWorkspace formal={{data:{todos:[${JSON.stringify(task)}]},permissionContext:${JSON.stringify(office)},actions:{refreshAll:async()=>({source:'api'})}}} onNavigate={(id,target)=>window.targets.push({id,target})}/>);`;
const result=await build({alias:{react:process.cwd()+'/node_modules/react','react-dom':process.cwd()+'/node_modules/react-dom'},stdin:{contents:fixture,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'iife',jsx:'automatic',loader:{'.css':'empty','.svg':'dataurl','.png':'dataurl'},logLevel:'silent'});
const browser=await chromium.launch({headless:true});
try{const page=await browser.newPage();await page.setContent('<div id="app"></div>');await page.addScriptTag({content:result.outputFiles[0].text});const link=page.getByRole('button',{name:'打开重拍生产任务',exact:true});await link.focus();await page.keyboard.press('Enter');const [target]=await page.evaluate(()=>window.targets);assert.equal(target.id,'production-tasks');assert.equal(target.target.productionTaskId,'PT-BAG');console.log('PASS current desktop todo link: exact stage handoff, keyboard activation, invalid reference and permission denial; absent maintenance route stays disabled.');}finally{await browser.close();}
