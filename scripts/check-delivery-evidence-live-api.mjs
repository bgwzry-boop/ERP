import { withLocalRepositoryFixture } from "./helpers/localRepositoryFixture.mjs";
import { deliveryEvidenceSnapshot } from "../shared/deliveryEvidenceSnapshot.js";
import {createServer as reservePort} from 'node:net';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=await mkdtemp(join(tmpdir(),'erp-evidence-api-'));
const priorStorage=process.env.ERP_LOCAL_STORAGE_DIR;
process.env.ERP_LOCAL_STORAGE_DIR=dir;
const {createApiServer}=await import('../server/apiServer.mjs');
const {loadSeedWorkspace}=await import('../server/seedData.mjs');
const {createRuntimeSession}=await import('../server/authSeed.mjs');
const authSecret='isolated-evidence-review-session-secret';
const users=[{userId:'TEST-evidence-office',loginName:'test-office',displayName:'Evidence test office',roles:['office'],defaultRole:'office',enabled:true,loginEnabled:true,passwordHash:'fixture',passwordStatus:'active',sessionVersion:1}];
const authorization='Bearer '+createRuntimeSession('TEST-evidence-office',{authSecret,sessionVersion:1}).accessToken;
const seed=loadSeedWorkspace({runtimeMode:'test',source:'synthetic'});
const record={...seed.fulfillments.find(row=>row.id==='F008'),status:'已交付',deliveryEvidenceReviewStatus:'待复核'};
const probe=reservePort();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const testPort=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const server=createApiServer(withLocalRepositoryFixture({runtimeMode:'test',applyProductionEnvFile:false,strictAuth:true,authSecret,corsAllowedOrigins:[`http://127.0.0.1:${testPort}`],runtimeIdentityRepository:{kind:'test_memory',loadState:async()=>({users,revokedSeedSessions:[]}),saveState:async()=>({})},coreWorkspaceReadRepository:{kind:'test_memory',loadState:async()=>({fulfillments:[record]})}}));
try{
 await new Promise(resolve=>server.listen(testPort,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 async function request(path,body){const response=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',authorization},body:body?JSON.stringify(body):undefined});const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;}
 const denied=await fetch(`${base}/api/fulfillments/${record.id}/delivery-evidence-review`,{method:'POST',headers:{'content-type':'application/json','x-erp-user-id':'TEST-evidence-office'},body:JSON.stringify({reviewStatus:'已复核'})});assert.equal(denied.status,401,'Unsigned spoofed identity must not review');
 const attachment=await request('/api/attachments',{ownerType:'fulfillment',ownerId:record.id,purpose:'delivery_watermark_photo',fileType:'image',fileName:'synthetic-pixel.png',contentRef:'test://delivery-evidence/synthetic-pixel',mimeType:'image/png',contentDataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOuoAAAAASUVORK5CYII='});
 record.watermarkedPhotoAttachmentId=attachment.attachmentId;
 const unsignedContent=await fetch(`${base}/api/attachments/${attachment.attachmentId}/content`);assert.equal(unsignedContent.status,401);
 const content=await fetch(`${base}/api/attachments/${attachment.attachmentId}/content`,{headers:{authorization}});assert.equal(content.status,200);assert.ok((await content.arrayBuffer()).byteLength>0);
 const staleSnapshot=deliveryEvidenceSnapshot(await request(`/api/fulfillments/${record.id}`));
 const result=await request(`/api/fulfillments/${record.id}/delivery-evidence-review`,{expectedEvidence:deliveryEvidenceSnapshot(await request(`/api/fulfillments/${record.id}`)),reviewStatus:'已复核',reviewerName:'SPOOF',reviewedAt:'2099-01-01T00:00:00Z'});assert.equal(result.reviewStatus,'已复核');assert.notEqual(result.reviewedBy,'SPOOF');
 const detail=await request(`/api/fulfillments/${record.id}`);assert.equal(detail.deliveryEvidenceReviewStatus,'已复核');assert.equal(detail.watermarkedPhotoAttachmentId,attachment.attachmentId);assert.equal(detail.deliveryEvidenceReviewedByUserId,'TEST-evidence-office');assert.notEqual(detail.deliveryEvidenceReviewedAt,'2099-01-01T00:00:00Z');console.log('PASS isolated real HTTP attachment content, review and readback; signed session and local repository; not canonical browser acceptance.');
 const staleResponse=await fetch(`${base}/api/fulfillments/${record.id}/delivery-evidence-review`,{method:'POST',headers:{'content-type':'application/json',authorization},body:JSON.stringify({reviewStatus:'需重拍',reason:'obsolete browser',expectedEvidence:staleSnapshot})});
 assert.equal(staleResponse.status,409);
 assert.deepEqual(await request(`/api/fulfillments/${record.id}`),detail,'Rejected stale review must preserve the persisted detail');
 const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`import React from 'react';import{createRoot}from'react-dom/client';import{DeliveryEvidenceReviewPanel}from'./src/features/fulfillment/DeliveryEvidenceReviewPanel.jsx';createRoot(document.getElementById('app')).render(<DeliveryEvidenceReviewPanel authState={window.testAuth} fulfillmentId="F008"/>);`},bundle:true,write:false,outfile:'panel.js',jsx:'automatic',define:{'import.meta.env':'{"VITE_ERP_API_BASE_URL":"/api"}','process.env.NODE_ENV':'"test"'}});
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route(base+'/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="zh-CN"><div id="app"></div></html>'}));
  await page.goto(base+'/');
  await page.evaluate(token=>{window.testAuth={session:{accessToken:token},permissions:{actionPermissions:['fulfillment.read','delivery.evidence.review']}}},authorization.slice(7));
  await page.addScriptTag({content:bundle.outputFiles.find(file=>file.path.endsWith('.js')).text});
  await page.getByText('复核状态：已复核',{exact:true}).waitFor();
  await page.getByRole('button',{name:'查看水印照片'}).click();
  await page.waitForFunction(()=>document.querySelector('img')?.naturalWidth===1);
  await page.getByRole('textbox',{name:'退回重拍原因'}).fill('合成测试：请补拍完整货物');
  await page.getByRole('button',{name:'退回重拍',exact:true}).click();
  await page.getByText('复核状态：需重拍',{exact:true}).waitFor({timeout:5000}).catch(async error=>{console.error(await page.locator('body').innerText());throw error;});
  const reviewed=await request('/api/fulfillments/F008');assert.equal(reviewed.deliveryEvidenceReviewStatus,'需重拍');assert.equal(reviewed.deliveryEvidenceIssueReason,'合成测试：请补拍完整货物');
  assert.deepEqual(errors,[]);console.log('PASS actual React panel + real clients + signed HTTP: decoded photo and retake persisted/read back. Isolated local repository, not canonical shell.');
 }finally{await browser.close();}
}finally{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});if(priorStorage===undefined)delete process.env.ERP_LOCAL_STORAGE_DIR;else process.env.ERP_LOCAL_STORAGE_DIR=priorStorage;}
