import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{FulfillmentPage}from'./src/features/fulfillment/FulfillmentPage.jsx';
const rows=['A','B'].map(id=>({id,lineId:'LINE-'+id,customerId:id,method:'送货',status:'已交付',qty:100,packages:'1包',watermarkedPhotoAttachmentId:'ATT-'+id,deliveryEvidenceReviewStatus:'待复核'}));
const lines=rows.map(row=>({id:row.lineId,product:'合成袋',size:'30×38',color:'白色',handle:'普通提',qty:100}));
const helpers={findCustomer:id=>({name:'合成客户'+id,contact:'联系人',phone:'',address:'合成地址'}),findOrderLine:(all,id)=>all.find(row=>row.id===id),getDeliveryEvidenceReviewStatus:row=>row.deliveryEvidenceReviewStatus,getDeliveryEvidenceReviewTone:()=> 'neutral',getFulfillmentActions:()=>[],getFulfillmentGoodsDisplay:()=> '合成袋',getFulfillmentNextStep:()=> '复核凭证',getUiActionState:()=>({disabled:false}),getLineColorSpecLabel:()=> '白色',getLinePrintSide:()=> '单面',getLineRemark:()=>'',isCustomProductLine:()=>false,statusTone:()=> 'neutral'};
window.calls=[];window.pending=[];
function App(){const[id,setId]=useState('A');const[tab,setTab]=useState('全部');window.selectTask=setId;return <FulfillmentPage tab={tab} setTab={setTab} fulfillments={rows} orderLines={lines} selectedId={id} setSelectedId={setId} helpers={helpers} onAction={(action,id,payload)=>{window.calls.push({action,id,payload});return new Promise((resolve,reject)=>window.pending.push({resolve,reject}));}}/>;}
createRoot(document.getElementById('app')).render(<App/>);`},bundle:true,write:false,outfile:'office-review-test.js',format:'iife',jsx:'automatic',define:{'import.meta.env':'{}','process.env.NODE_ENV':'"test"'}});
const styles=await build({stdin:{resolveDir:process.cwd(),loader:'css',contents:['tokens','base','shared','semantic-tags','shell','components','features/fulfillment','interface-polish'].map(name=>'@import "./src/styles/'+name+'.css";').join('\n')},bundle:true,write:false,outfile:'office-review.css',loader:{'.woff2':'dataurl','.woff':'dataurl','.png':'dataurl','.svg':'dataurl'}});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(5000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<!doctype html><html lang="zh-CN"><div id="app"></div></html>');await page.addScriptTag({content:bundle.outputFiles.find(file=>file.path.endsWith('.js')).text});
 await page.addStyleTag({content:styles.outputFiles.find(file=>file.path.endsWith('.css')).text});
 await page.getByRole('tab',{name:'单据/证据',exact:true}).click();
 await mkdir('/tmp/erp-office-review-layout',{recursive:true});
 await page.screenshot({path:'/tmp/erp-office-review-layout/desktop-after.png',fullPage:true});
 const reason=page.getByRole('textbox',{name:'退回重拍原因',exact:true});
 const reject=page.getByRole('button',{name:/退回重拍/});
 const reasonBox=await reason.boundingBox();
 const approveBox=await page.getByRole('button',{name:/证据复核通过/}).boundingBox();
 assert.ok(approveBox.y >= reasonBox.y + reasonBox.height, 'Review actions must follow the full-width reason input');
 assert.equal(await reject.isDisabled(),true);
 await reason.fill('A 单照片模糊，请补拍整批货物');
 await reject.evaluate(el=>{el.click();el.click();});
 assert.equal(await page.evaluate(()=>window.calls.length),1);
 assert.equal(await reason.isDisabled(),true);
 await page.evaluate(()=>window.pending[0].resolve({blocked:true,error:{message:'保存失败'}}));
 await page.getByRole('alert').waitFor();assert.equal(await reason.inputValue(),'A 单照片模糊，请补拍整批货物');
 await page.evaluate(()=>window.selectTask('B'));
 await page.getByRole('tab',{name:'单据/证据',exact:true}).click();
 assert.equal(await reason.inputValue(),'');assert.equal(await reject.isDisabled(),true);
 await reason.fill('B 单缺少门牌，请补拍定位');await reject.click();
 assert.equal(await page.evaluate(()=>window.calls[1].id),'B');
 await page.evaluate(()=>window.selectTask('A'));await page.getByRole('tab',{name:'单据/证据',exact:true}).click();
 assert.equal(await reason.inputValue(),'A 单照片模糊，请补拍整批货物');
 await page.evaluate(()=>window.pending[1].resolve({blocked:false}));
 assert.equal(await reason.inputValue(),'A 单照片模糊，请补拍整批货物');
 for(const width of [1024,800]){
  await page.setViewportSize({width,height:1000});
  assert.equal(await page.locator('.fulfillment-filter-grid').evaluate(el=>el.scrollWidth<=el.clientWidth),true,'Narrow filters must fit');
  assert.equal(await page.locator('.fulfillment-workbench').evaluate(el=>el.scrollWidth<=el.clientWidth),true,'Narrow workbench must not clip columns');
  await reason.fill('照片模糊，需要重新拍摄完整货物和客户门牌。'.repeat(12));
  await reject.click();
  await page.evaluate(()=>window.pending.at(-1).resolve({blocked:true,error:{message:'保存失败，请检查网络连接后重试；已填写的原因会保留。'.repeat(12)}}));
  await page.getByRole('alert').waitFor();
  const input=await reason.boundingBox();
  const action=await page.getByRole('button',{name:/证据复核通过/}).boundingBox();
  assert.ok(action.y>=input.y+input.height, 'Narrow desktop actions remain below reason');
  assert.equal(await page.getByRole('alert').evaluate(el=>el.scrollWidth<=el.clientWidth),true,'Long error must wrap');
  await page.screenshot({path:'/tmp/erp-office-review-layout/narrow-'+width+'.png',fullPage:true});
 }
 assert.deepEqual(errors,[]);
 console.log('PASS real FulfillmentPage: blank reason blocked, same-tick duplicate prevented, pending input locked, failure preserves reason, task drafts isolated. Root application CSS loaded; screenshot captured. Mock action; no complete-review shell/server acceptance.');
}finally{await browser.close();}
