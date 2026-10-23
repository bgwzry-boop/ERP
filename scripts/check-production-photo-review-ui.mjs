import { refreshAfterProductionPhotoReview } from '../docs/prototypes/raw-material-roll-inventory-review/src/production-review-refresh.js';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
const bundle=await build({alias:{react:process.cwd()+"/node_modules/react","react-dom":process.cwd()+"/node_modules/react-dom"},stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{ProductionPhotoReview}from'./docs/prototypes/raw-material-roll-inventory-review/src/ProductionPhotoReview.jsx';window.calls=[];window.pending=[];window.saved=0;const review=input=>{window.calls.push(input);return new Promise(resolve=>window.pending.push(resolve));};const loadContent=async()=>{const c=document.createElement('canvas');c.width=4;c.height=4;return{source:'api',contentBlob:await new Promise(resolve=>c.toBlob(resolve))};};createRoot(document.getElementById('app')).render(<ProductionPhotoReview detail={{productionTaskId:'PT-1',orderLineId:'OL-1',productionTask:{revision:3},finishedGoodsPhoto:{attachmentId:'ATT-1'}}} authState={{permissions:{actionPermissions:['attachment.view','production.schedule.publish']}}} review={review} loadContent={loadContent} onSaved={()=>{window.saved++;if(window.saved===1)throw Error("refresh failure");return new Promise(resolve=>window.resolveRefresh=resolve);}}/>);`,resolveDir:process.cwd(),loader:'jsx'},bundle:true,format:'iife',write:false,jsx:'automatic',logLevel:'silent'});
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage();await page.route('http://localhost/**', route=>route.fulfill({contentType:'text/html',body:'<div id="app"></div>'}));await page.goto('http://localhost/');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const accept=page.getByRole('button',{name:'确认成品图',exact:true});assert.equal(await accept.isDisabled(),true);
 await page.getByRole('button',{name:'查看成品原图'}).click();await page.waitForFunction(()=>document.querySelector('img')?.naturalWidth===4);
 await page.getByRole('button',{name:'退回重拍',exact:true}).click();await page.getByText('请填写具体退回原因。').waitFor();assert.equal(await page.evaluate(()=>window.calls.length),0);
 await page.getByRole('textbox').fill('提手未拍清楚');await page.getByRole('button',{name:'退回重拍',exact:true}).click();
 assert.equal(await page.getByRole('textbox').isDisabled(),true);
 await page.evaluate(()=>window.pending[0]({source:'api_error',blocked:true,error:{code:'PRODUCTION_PHOTO_REVIEW_UNCONFIRMED',message:'结果未确认'}}));
 await page.getByRole('button',{name:'按原内容重试审核'}).click();
 const calls=await page.evaluate(()=>window.calls);assert.deepEqual(calls[0],calls[1]);assert.equal(calls[0].expectedRevision,3);assert.equal(calls[0].expectedAttachmentId,'ATT-1');assert.equal(calls[0].reviewStatus,'需重拍');
 await page.evaluate(()=>window.pending[1]({source:'api'}));await page.waitForFunction(()=>window.saved===1);
 await page.getByText('审核已保存，但刷新失败，请重新读取结果；无需再次提交审核。').waitFor();
 assert.equal(await page.getByRole('button',{name:'按原内容重试审核'}).count(),0);
 await page.getByRole('button',{name:'重新读取审核结果'}).evaluate(button=>{button.click();button.click();});await page.waitForFunction(()=>window.saved===2);
 assert.equal(await page.getByRole('button',{name:'正在读取审核结果…'}).isDisabled(),true);
 await page.evaluate(()=>window.resolveRefresh({source:'api'}));
 await page.getByText('审核已保存，已请求重新读取；任务详情以读取结果为准。').waitFor();
 assert.equal(await page.evaluate(()=>window.calls.length),2);
 console.log('PASS photo review UI: image prerequisite, required rejection reason, frozen payload, identical retry, successful refresh callback. Mocked API.');
} finally {await browser.close();}

for (const result of [null, {source:'api_error'}, {source:'permission_blocked'}, {source:'api',blocked:true}]) {
  let refreshes = 0;
  await assert.rejects(refreshAfterProductionPhotoReview({readTodos:async()=>result,refreshDetail:()=>refreshes++}), /待办刷新失败/);
  assert.equal(refreshes,0,'failed todo read must keep committed review mounted');
}
{
  const sequence=[];
  await refreshAfterProductionPhotoReview({readTodos:async()=>{sequence.push('todos');return {source:'api'};},refreshDetail:()=>sequence.push('detail')});
  assert.deepEqual(sequence,['todos','detail']);
}
