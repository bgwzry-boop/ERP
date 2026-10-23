import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
const mocks={
'useFulfillmentDetail.js':`export function useFulfillmentDetail({fulfillmentId}){return {fulfillment:{id:fulfillmentId,watermarkedPhotoAttachmentId:window.replacementId||'ATT-'+fulfillmentId,deliveryEvidenceReviewStatus:'待复核'},refresh(){window.refreshes.push(fulfillmentId)}}}`,
'officeFulfillmentApiClient.js':`export function reviewOfficeDeliveryEvidence(input){window.calls.push(input);return new Promise((resolve,reject)=>window.pending.push({resolve,reject}))}`,
'officeAttachmentApiClient.js':`export function downloadOfficeAttachmentContent(){if(window.deferPhoto)return new Promise(resolve=>window.resolvePhoto=resolve);return window.photoResult?Promise.resolve(window.photoResult):Promise.resolve({source:'api_error',blocked:true,error:{message:'照片读取失败'}})}`
};
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{DeliveryEvidenceReviewPanel}from'./src/features/fulfillment/DeliveryEvidenceReviewPanel.jsx';window.calls=[];window.pending=[];window.refreshes=[];window.notices=[];function App(){const[id,setId]=useState('A');const[allowed,setAllowed]=useState(true);window.select=setId;window.allow=setAllowed;return <DeliveryEvidenceReviewPanel fulfillmentId={id} authState={{session:{accessToken:'test'},permissions:{actionPermissions:allowed?['delivery.evidence.review']:[]}}} onReviewed={message=>window.notices.push(message)}/>;}createRoot(document.getElementById('app')).render(<App/>);`},bundle:true,write:false,outfile:'panel.js',jsx:'automatic',plugins:[{name:'mock-api',setup(b){b.onResolve({filter:/useFulfillmentDetail\.js|officeFulfillmentApiClient\.js|officeAttachmentApiClient\.js/},args=>({path:args.path.split('/').at(-1),namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'js'}));}}],define:{'process.env.NODE_ENV':'"test"'}});
const browser=await chromium.launch();
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<html lang="zh-CN"><div id="app"></div></html>');await page.addScriptTag({content:bundle.outputFiles.find(f=>f.path.endsWith('.js')).text});
 const reason=page.getByRole('textbox',{name:'退回重拍原因'});const reject=page.getByRole('button',{name:'退回重拍',exact:true});
 assert.equal(await reject.isDisabled(),true);await reason.fill('A 照片模糊');await reject.evaluate(el=>{el.click();el.click()});assert.equal(await page.evaluate(()=>window.calls.length),1);
 await page.evaluate(()=>window.pending[0].resolve({source:'api_error',blocked:true,error:{message:'保存失败'}}));await page.getByRole('alert').waitFor();assert.equal(await reason.inputValue(),'A 照片模糊');
 await reject.click();await page.evaluate(()=>window.select('B'));await reason.fill('B 门牌不清楚');await page.evaluate(()=>window.pending[1].resolve({source:'api',reviewStatus:'需重拍'}));assert.equal(await reason.inputValue(),'B 门牌不清楚');assert.equal(await page.evaluate(()=>window.notices.length),0);
 await page.evaluate(()=>window.select('A'));assert.equal(await reason.inputValue(),'A 照片模糊');
 await page.evaluate(()=>window.select('B'));assert.equal(await reason.inputValue(),'B 门牌不清楚');
 await page.evaluate(()=>window.allow(false));assert.equal(await reject.isDisabled(),true);assert.equal(await page.getByRole('button',{name:'证据复核通过'}).isDisabled(),true);
 await page.getByRole('button',{name:'查看水印照片'}).click();await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('alert').textContent(),'照片读取失败');
 await page.evaluate(()=>{
  window.revoked=[];const revoke=URL.revokeObjectURL.bind(URL);URL.revokeObjectURL=url=>{window.revoked.push(url);revoke(url)};
  const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOuoAAAAASUVORK5CYII='),c=>c.charCodeAt(0));
  window.photoResult={source:'api',contentType:'image/png',contentBlob:new Blob([bytes],{type:'image/png'})};
 });
 await page.getByRole('button',{name:'查看水印照片'}).click();
 await page.getByRole('img',{name:'水印照片',exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelector('img')?.naturalWidth===1);
 const obsoleteUrl=await page.getByRole('img').getAttribute('src');
 await page.evaluate(()=>{window.replacementId='NEW-ATT-B';window.allow(true)});
 await page.getByRole('img').waitFor({state:'detached'});
 assert.equal(await page.evaluate(url=>window.revoked.includes(url),obsoleteUrl),true);
 await page.getByRole('button',{name:'查看水印照片'}).click();await page.getByRole('img').waitFor();
 const firstUrl=await page.getByRole('img').getAttribute('src');
 await page.getByRole('button',{name:'查看水印照片'}).click();
 await page.waitForFunction(url=>window.revoked.includes(url),firstUrl);
 const secondUrl=await page.getByRole('img').getAttribute('src');
 await page.evaluate(()=>window.select('A'));
 await page.getByRole('img').waitFor({state:'detached'});
 assert.equal(await page.getByRole('img').count(),0);
 assert.equal(await page.evaluate(url=>window.revoked.includes(url),secondUrl),true);
 await page.evaluate(()=>{window.deferPhoto=true});
 await page.getByRole('button',{name:'查看水印照片'}).click();
 await page.evaluate(()=>{window.replacementId='NEWER-ATT-A';window.allow(false)});
 await page.getByText('当前账号没有送达证据复核权限。',{exact:true}).waitFor();
 await page.evaluate(()=>window.resolvePhoto(window.photoResult));
 await page.getByRole('alert').waitFor();
 assert.equal(await page.getByRole('alert').textContent(),'照片已更新，请重新查看当前证据。');
 assert.equal(await page.getByRole('img').count(),0);
 await page.evaluate(()=>{window.deferPhoto=false;window.allow(true)});
 await page.getByRole('button',{name:'证据复核通过'}).click();
 const call=await page.evaluate(()=>window.calls.at(-1));assert.equal(call.fulfillment.id,'A');assert.equal(call.reviewStatus,'已复核');
 await page.evaluate(()=>window.pending.at(-1).resolve({source:'api',reviewStatus:'已复核'}));
 await page.waitForFunction(()=>window.refreshes.includes('A'));
 assert.deepEqual(await page.evaluate(()=>window.notices),['送达证据：已复核']);
 assert.deepEqual(errors,[]);console.log('PASS evidence panel duplicate, failure retention, stale response, permission, attachment failure, image decode/URL cleanup and successful review refresh checks; mocked API, not canonical shell acceptance.');
}finally{await browser.close();}
