import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {readFile,mkdir} from 'node:fs/promises';
const fixture=`import React from 'react';import {createRoot} from 'react-dom/client';import {RawMaterialRecordHistory} from './src/features/raw-materials/RawMaterialRecordHistory.jsx';
const records=Array.from({length:7},(_,i)=>Object.freeze({issueRecordId:'ISSUE-'+(i+1),rollId:'ROLL-'+('LONG'.repeat(25)),issuedWeightKg:20}));
const selected=Object.freeze({id:'A',rawMaterialIssueRecords:Object.freeze(records),rawMaterialCostAllocationDrafts:Object.freeze(records.map((_,i)=>Object.freeze({costAllocationDraftId:'COST-'+(i+1),allocatedWeightKg:20,allocatedCostAmount:98765}))),rawMaterialCostAllocationWarnings:['FINANCIAL-WARNING-98765']});
const root=createRoot(document.getElementById('app'));window.renderHistory=(permission=false,id='A',empty=false)=>root.render(<RawMaterialRecordHistory selected={empty?{id}:{...selected,id}} canViewCost={permission} money={v=>'¥'+v}/>);window.sourceOrder=()=>records.map(r=>r.issueRecordId);window.renderHistory();`;
const result=await build({stdin:{contents:fixture,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'iife',jsx:'automatic',loader:{'.css':'empty'},logLevel:'silent'});
const browser=await chromium.launch({headless:true});await mkdir('screenshots/raw-material-record-history',{recursive:true});
try{for(const width of [1440,800,390]){
 const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://history.test/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif}#app{max-width:700px;margin:auto}</style><p>独立记录组件检查 · 合成数据 · 不代表业务验收</p><div id="app"></div></html>'}));
 await page.goto('http://history.test/');await page.addStyleTag({content:await readFile('src/styles/features/raw-material-record-history.css','utf8')});await page.addScriptTag({content:result.outputFiles[0].text});
 const issues=page.getByRole('region',{name:'领料记录',exact:true});await issues.waitFor();
 assert.equal(await issues.locator(':scope > ol > li').count(),4);assert.match(await issues.locator('li').first().innerText(),/^ISSUE-7/);assert.equal(await issues.locator('details li').first().isVisible(),false);
 await issues.locator('summary').click();assert.equal(await issues.locator('details li').count(),3);assert.match(await issues.locator('li').last().innerText(),/^ISSUE-1/);
 await page.getByRole('region',{name:'成本草稿',exact:true}).locator('summary').click();assert.equal((await page.locator('#app').innerText()).includes('98765'),false);
 await page.evaluate(()=>window.renderHistory(true));await page.getByText('FINANCIAL-WARNING-98765',{exact:true}).waitFor();assert.equal(await page.locator('li').filter({hasText:'¥98765'}).count(),7);
 assert.deepEqual(await page.evaluate(()=>window.sourceOrder()),Array.from({length:7},(_,i)=>'ISSUE-'+(i+1)));
 for(const summary of await page.locator('summary').all())assert.ok((await summary.boundingBox()).height>=44);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'screenshots/raw-material-record-history/'+width+'.png',fullPage:true});
 await page.evaluate(()=>window.renderHistory(false,'B'));await page.waitForFunction(()=>!document.querySelector('details')?.open);assert.equal((await page.locator('#app').innerText()).includes('98765'),false);
 await page.evaluate(()=>window.renderHistory(false,'C',true));await page.getByText('暂无领料、消耗或成本记录。',{exact:true}).waitFor();assert.equal(await page.locator('li').count(),0);assert.deepEqual(errors,[]);await page.close();
}console.log('PASS actual history component: newest first, complete expandable history, immutable input, amount/warning visibility, record switch reset, empty state and 1440/800/390 layout. Synthetic data; no business writes.');}finally{await browser.close();}
