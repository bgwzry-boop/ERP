import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
const built=await build({stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`import React from 'react';import{createRoot}from'react-dom/client';import{ActionModal}from'./src/app/ActionModals.jsx';window.calls=[];const root=createRoot(document.getElementById('app'));window.render=(revision=2)=>root.render(<ActionModal modal={{type:'dispatch',fulfillmentId:'F',loadDrivers:async()=>({source:'api',drivers:[{userId:'D1',name:'Test driver'}]})}} fulfillments={[{id:'F',method:'送货',driverId:'D1',dispatchId:'D',dispatchRevision:revision}]} statements={[]} orderLines={[]} findCustomer={()=>({})} getStatementBlockingAmount={()=>0} onClose={()=>{}} onConfirm={payload=>{window.calls.push(payload);return new Promise(resolve=>window.finish=resolve)}}/>);window.render();`},bundle:true,write:false,jsx:'automatic'});
const browser=await chromium.launch();try{
 const page=await browser.newPage();await page.setContent('<div id="app"></div>');await page.addScriptTag({content:built.outputFiles[0].text});
 await page.getByLabel('路线趟号',{exact:true}).fill('Edited route');
 await page.evaluate(()=>window.render(9));
 await page.getByRole('button',{name:'保存派单',exact:true}).evaluate(button=>{button.click();button.click()});
 assert.equal(await page.evaluate(()=>window.calls.length),1);
 assert.equal(await page.evaluate(()=>window.calls[0].expectedRevision),2);
 assert.equal(await page.getByRole('button',{name:'保存中…',exact:true}).isDisabled(),true);
 await page.evaluate(()=>window.finish({blocked:true,feedback:'Version conflict'}));
 await page.getByRole('alert').filter({hasText:'Version conflict'}).waitFor();
 assert.equal(await page.getByLabel('路线趟号',{exact:true}).inputValue(),'Edited route');
 assert.equal(await page.getByRole('button',{name:'保存派单',exact:true}).isEnabled(),true);
 const originalKey=await page.evaluate(()=>window.calls[0].idempotencyKey);
 assert.equal(typeof originalKey,'string');assert.ok(originalKey.length>0);
 await page.getByRole('button',{name:'保存派单',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.calls[1].idempotencyKey),originalKey);
 await page.evaluate(()=>window.finish({blocked:true,error:{code:'FULFILLMENT_DISPATCH_API_UNAVAILABLE'},feedback:'Uncertain result'}));
 await page.getByRole('button',{name:'用原内容重试',exact:true}).waitFor();
 assert.equal(await page.getByLabel('路线趟号',{exact:true}).isDisabled(),true);
 await page.getByRole('button',{name:'用原内容重试',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>window.calls[2]),await page.evaluate(()=>window.calls[1]));
 await page.evaluate(()=>window.finish({blocked:true,feedback:'Known rejection'}));


 console.log('PASS real dispatch modal: duplicate submit, editor revision after rerender, inline conflict and input retention. Callback mocked.');
}finally{await browser.close()}
