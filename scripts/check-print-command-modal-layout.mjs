import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const bundle=await build({stdin:{contents:`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{ActionModal}from'./src/app/ActionModals.jsx';
function App(){const[modal,setModal]=useState(null);window.calls=[];return <><p style={{position:'fixed',top:0,left:0,zIndex:99999,background:'#fff',padding:8,pointerEvents:'none'}}>合成组件检查 · 非完整 ERP 页面 · 不发送业务请求</p><button id="open" onClick={()=>setModal({type:window.printMode,action:window.printMode==='print'?'打印标签':'作废旧标签',fulfillmentId:'F-LAYOUT',printRecordId:'PR-LAYOUT',sessionOwner:'U-FIXTURE'})}>打开作废核对</button>{modal&&<ActionModal modal={modal} fulfillments={[{id:'F-LAYOUT',method:'快递快运',activePrintRecordId:'PR-LAYOUT',qty:1000,packages:'2包',goods:'合成测试袋 35×27 白色',customerId:'C-FIXTURE'}]} statements={[]} orderLines={[]} findCustomer={()=>({name:'合成测试客户'})} getStatementBlockingAmount={()=>0} onClose={()=>setModal(null)} onConfirm={async input=>{window.calls.push(input);return {blocked:true,feedback:'连接中断，未能确认结果；请使用原请求重试。'};}}/>}</>};createRoot(document.getElementById('app')).render(<App/>);`,resolveDir:process.cwd(),loader:'jsx'},bundle:true,format:'iife',jsx:'automatic',write:false,logLevel:'silent'});
const styles=await Promise.all(['tokens','base','shared','semantic-tags','shell','components','interface-polish','features/print-documents'].map(name=>readFile(`src/styles/${name}.css`,'utf8')));
const dir='.erp-local-storage/legacy-production-review/print-command';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true});const metrics=[];
try{for(const width of [1440,800]){for(const mode of ['printVoid','print']){
 const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><body><div id="app"></div></body></html>'}));
 const mount=async()=>{await page.goto('http://erp-print-component.invalid/');await page.addStyleTag({content:styles.join('\n')});await page.evaluate(mode=>window.printMode=mode,mode);await page.addScriptTag({content:bundle.outputFiles[0].text});await page.getByRole('button',{name:'打开作废核对'}).click();};
 await mount();await page.getByRole('button',{name:mode==='print'?'打印标签':'确认作废',exact:true}).click();await page.getByRole('alert').waitFor();
 const original=await page.evaluate(()=>window.calls[0]);
 await page.screenshot({path:`${dir}/${mode}-retry-${width}.png`,fullPage:true});
 const measured=await page.getByRole('button',{name:'用原请求重试',exact:true}).evaluate(button=>{const style=getComputedStyle(button),box=button.getBoundingClientRect();return {fontSize:style.fontSize,fontFamily:style.fontFamily,lineHeight:style.lineHeight,height:box.height,width:box.width};});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.getByRole('button',{name:'用原请求重试',exact:true}).focus();await page.keyboard.press('Tab');assert.equal(await page.getByRole('button',{name:'关闭业务操作'}).evaluate(node=>node===document.activeElement),true);
 await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.locator('#open').evaluate(node=>node===document.activeElement),true);
 await mount();await page.getByRole('button',{name:'用原请求重试',exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.calls[0]),original);
 assert.deepEqual(errors,[]);metrics.push({mode,viewportWidth:width,...measured});await page.close();
}}
 await writeFile(`${dir}/metrics.json`,JSON.stringify({scope:'synthetic actual React component; no business API',metrics},null,2)+'\n');
 console.log('PASS print modal browser: 1440/800, visible retry/locked target/error, persisted reload request, focus loop/Escape return, no page overflow or script errors. Synthetic component only.');
}finally{await browser.close();}
