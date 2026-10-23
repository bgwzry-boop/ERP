import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
const built=await build({stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
import React from 'react';import{createRoot}from'react-dom/client';import{ActionModal}from'./src/app/ActionModals.jsx';
window.calls=[];window.loads=0;
const modal={type:'dispatch',fulfillmentId:'F',loadDrivers:signal=>new Promise(resolve=>{window.loads++;window.finishRoster=resolve;window.rosterSignal=signal;})};
const root=createRoot(document.getElementById('app'));
root.render(<ActionModal modal={modal} fulfillments={[{id:'F',method:'送货',dispatchRevision:0}]} statements={[]} orderLines={[]} findCustomer={()=>({})} getStatementBlockingAmount={()=>0} onClose={()=>root.unmount()} onConfirm={payload=>{window.calls.push(payload);return {blocked:true,feedback:'Synthetic rejection'}}}/>);
`},bundle:true,write:false,jsx:'automatic',logLevel:'silent'});
const browser=await chromium.launch();try {
 const page=await browser.newPage();await page.setContent('<div id="app"></div>');await page.addScriptTag({content:built.outputFiles[0].text});
 await page.getByText('正在读取司机名单…').waitFor();
 assert(await page.getByRole('button',{name:'保存派单',exact:true}).isDisabled());
 await page.getByLabel('路线趟号',{exact:true}).fill('Keep route');
 await page.evaluate(()=>window.finishRoster({blocked:true,source:'api_error',error:{message:'Network unavailable'}}));
 await page.getByRole('button',{name:'重试读取司机'}).click();
 await page.waitForFunction(()=>window.loads===2);
 await page.evaluate(()=>window.finishRoster({source:'api',drivers:[]}));
 await page.getByText('暂无可选司机，请联系管理员核对司机账号。',{exact:false}).waitFor();
 assert(await page.getByRole('button',{name:'保存派单',exact:true}).isDisabled());
 await page.getByRole('button',{name:'刷新司机名单'}).click();
 await page.waitForFunction(()=>window.loads===3);
 await page.evaluate(()=>window.finishRoster({source:'api',drivers:[{userId:'REAL-D',name:'Actual driver'}]}));
 await page.getByRole('option',{name:'Actual driver'}).waitFor({state:'attached'});
 assert.equal(await page.getByLabel('司机',{exact:true}).inputValue(),'');
 assert.equal(await page.getByLabel('路线趟号',{exact:true}).inputValue(),'Keep route');
 await page.getByLabel('司机',{exact:true}).selectOption('REAL-D');
 await page.getByRole('button',{name:'保存派单',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.calls[0].driverId),'REAL-D');
 await page.getByRole('button',{name:'关闭业务操作'}).click();
 assert.equal(await page.evaluate(()=>window.rosterSignal.aborted),true);
 console.log('PASS actual dispatch modal: loading, error retry, empty roster, explicit driver selection, retained route and abort on close; API callbacks mocked.');
} finally {await browser.close()}
