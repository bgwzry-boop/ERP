import assert from 'node:assert/strict';
import {chromium, expect} from '@playwright/test';
const origin=String(process.env.ERP_COMPLETE_REVIEW_URL || 'http://127.0.0.1:4174').replace(/\/$/,'');
assert.ok(['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname),'This check is restricted to local review');
assert.match(await (await fetch(origin)).text(),/bagwin-complete-review-4174/);
const browser=await chromium.launch({headless:true});
const errors=[],writes=[];
try {
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'});
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',route=>{
  const r=route.request(),path=new URL(r.url()).pathname;
  if(!['GET','HEAD','OPTIONS'].includes(r.method())&&path!=='/api/auth/prototype-login'){
   writes.push(path);return route.abort();
  }
  return route.continue();
 });
 await page.goto(`${origin}/?audit=viewport-live-readonly&erpViewport=mobile#material-receiving`);
 for(const width of [390,1440,767,768,390,1440]){
  await page.setViewportSize({width,height:900});
  const mobile=width<=767;
  await expect(page.locator('html')).toHaveAttribute('data-erp-runtime-family',mobile?'mobile':'desktop');
  await expect(page).toHaveURL(new RegExp(`erpViewport=${mobile?'mobile':'desktop'}`));
  if(mobile){
   await expect(page.locator('.raw-material-mobile-capture-card')).toBeVisible();
   await expect(page.locator('.pc-business-tree')).toHaveCount(0);
  }else{
   await expect(page.locator('.pc-business-tree')).toBeVisible();
   await expect(page.locator('.raw-material-mobile-capture-card')).toHaveCount(0);
  }
  await expect(page.locator('#erp-local-preview-badge')).toContainText('本地修改稿 · 未部署');
  console.log(`PASS ${width}px ${mobile?'mobile capture':'complete desktop shell'}`);
 }
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
 console.log('PASS actual 4174 bidirectional viewport boundary; no business writes or page errors');
}finally{await browser.close();}
