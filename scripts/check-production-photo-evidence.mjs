import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
const bundle=await build({alias:{react:process.cwd()+"/node_modules/react","react-dom":process.cwd()+"/node_modules/react-dom"},stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{ProductionPhotoEvidence}from'./docs/prototypes/raw-material-roll-inventory-review/src/ProductionPhotoEvidence.jsx';
window.requests=[];window.pending=[];window.revoked=[];const revoke=URL.revokeObjectURL.bind(URL);URL.revokeObjectURL=url=>{window.revoked.push(url);revoke(url);};const loadContent=(input,options)=>{window.requests.push({id:input.attachmentId,signal:options.signal});return new Promise(resolve=>window.pending.push(resolve));};const root=createRoot(document.getElementById('app'));window.show=(id,allowed=true)=>root.render(<ProductionPhotoEvidence photo={{attachmentId:id,status:'待确认'}} authState={{session:{accessToken:'test'},permissions:{actionPermissions:allowed?['attachment.view']:[]}}} loadContent={loadContent}/>);window.show('A');`,resolveDir:process.cwd(),loader:'jsx'},bundle:true,format:'iife',write:false,jsx:'automatic',logLevel:'silent'});
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage();await page.setContent('<div id="app"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const open=()=>page.getByRole('button',{name:'查看成品原图'}).click();
 await open();await page.evaluate(()=>window.show('B'));await page.getByText('待确认 · B',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.requests[0].signal.aborted),true);
 await page.evaluate(()=>window.pending[0]({source:'api',contentBlob:new Blob(['old'],{type:'image/png'})}));
 assert.equal(await page.locator('img').count(),0);
 await open();await page.evaluate(async()=>{
   const canvas=document.createElement('canvas');canvas.width=4;canvas.height=4;
   canvas.getContext('2d').fillRect(0,0,4,4);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
   window.pending[1]({source:'api',contentBlob:blob});
 });
 await page.waitForFunction(()=>document.querySelector('img')?.naturalWidth===4);
 await page.getByRole('button',{name:'重新读取原图'}).click();assert.equal(await page.locator('img').count(),0);
 await page.evaluate(()=>window.pending[2]({source:'api_error',blocked:true,error:{message:'读取失败'}}));await page.getByRole('alert').waitFor();
 assert.equal(await page.locator('img').count(),0);assert.equal(await page.evaluate(()=>window.revoked.length),1);
 await page.evaluate(()=>window.show('B',false));await page.getByText('当前账号没有附件查看权限。').waitFor();
 assert.equal(await page.getByRole('button',{name:'查看成品原图'}).isDisabled(),true);
 assert.equal(await page.locator('img').count(),0);
 await page.evaluate(()=>window.show('C'));await open();
 await page.evaluate(()=>window.pending[3]({source:'api',contentBlob:new Blob(['broken'],{type:'image/png'})}));
 await page.waitForFunction(()=>document.querySelector('[role="alert"]')?.textContent.includes('图片无法解码'));
 assert.equal(await page.locator('img').count(),0);
 assert.equal(await page.evaluate(()=>window.revoked.length),2);
 console.log('PASS photo evidence: stale request aborted, reread clears old image, failure stays empty, URL revoked, permission loss disables access. Generated PNG decoded; damaged image rejected. Mocked attachment API.');
} finally {await browser.close();}
