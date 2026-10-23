import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
const built=await build({stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
import React from 'react';import{createRoot}from'react-dom/client';import{useOfficePrintReads}from'./src/app/useOfficePrintReads.js';
const selectedRef={current:'PD-1'};const jobsRef={current:[]};window.writes=0;
const api={listOfficePrintDevices:()=>new Promise(resolve=>window.release=resolve)};
function Harness({user}) {window.actions=useOfficePrintReads({api,currentUserId:user,authState:{session:{accessToken:user},permissions:{actionPermissions:[]}},printerDeviceQaSelectedIdRef:selectedRef,printJobQueueItemsRef:jobsRef,setPrinterDeviceQa:()=>window.writes++});return <div>{user}</div>;}
const root=createRoot(document.getElementById('app'));window.render=user=>root.render(<Harness user={user}/>);window.unmount=()=>root.unmount();window.render('A');
`},bundle:true,write:false,jsx:'automatic',logLevel:'silent'});
const browser=await chromium.launch();try {
 const page=await browser.newPage();await page.setContent('<div id="app"></div>');await page.addScriptTag({content:built.outputFiles[0].text});
 await page.waitForFunction(()=>window.actions);
 await page.evaluate(()=>{window.pending=window.actions.refreshPrinterDeviceQa();});
 await page.evaluate(()=>window.render('B'));await page.getByText('B',{exact:true}).waitFor();
 const result=await page.evaluate(async()=>{window.release({source:'api',items:[]});return await window.pending});
 assert.equal(result.stale,true);assert.equal(await page.evaluate(()=>window.writes),1);
 await page.evaluate(()=>{window.pending=window.actions.refreshPrinterDeviceQa();window.unmount()});
 const unmounted=await page.evaluate(async()=>{window.release({source:'api',items:[]});return await window.pending});
 assert.equal(unmounted.stale,true);assert.equal(await page.evaluate(()=>window.writes),2);
 console.log('PASS actual printer QA hook ignores old reads after account change and unmount; network mocked.');
} finally {await browser.close()}
