import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch();
await mkdir('screenshots/canonical-colour-conflict',{recursive:true});
try {
 for(const width of [1440,800]) {
  const page=await browser.newPage({viewport:{width,height:900}});
  let mapping={id:'TEST-COLOR',supplierSourceId:'TEST-SUP',supplierColor:'184',factoryColor:'本白',enabled:true,updatedAt:'2026-09-06T00:00:00Z'};
  const requests=[];
  await page.route('**/api/master-data/raw-material-supplier-colors*',async route=>{
   if(route.request().method()==='POST'){
    requests.push(route.request().postDataJSON());
    mapping={...mapping,factoryColor:'大红',updatedAt:'2026-09-06T01:00:00Z'};
    return route.fulfill({status:409,json:{code:'RAW_MATERIAL_COLOR_MAPPING_SNAPSHOT_CONFLICT',message:'规则已被其他操作修改，请刷新并重新选择规则。'}});
   }
   return route.fulfill({json:{items:[mapping],options:{suppliers:[{supplierSourceId:'TEST-SUP',supplierName:'测试厂家'}],factoryColors:['本白','大红','宝兰']}}});
  });
  await page.goto(`http://127.0.0.1:4174/?audit=colour-conflict-${width}&erpViewport=desktop#material-receiving`);
  assert.equal(await page.locator('html').getAttribute('data-erp-app-id'),'bagwin-complete-review-4174');
  assert.equal(await page.locator('meta[name=erp-preview-kind]').getAttribute('content'),'local-unreleased');
  assert.match(await page.locator('meta[name=erp-preview-base-commit]').getAttribute('content'),/^[0-9a-f]{40}$/);
  await page.locator('#erp-local-preview-badge').waitFor();
  assert.match(await page.locator('#erp-local-preview-badge').innerText(),/本地修改稿 · 未部署/);
  const entry=page.getByRole('button',{name:'厂家颜色资料',exact:true});await entry.click();
  const dialog=page.getByRole('dialog');await dialog.locator('button.row').click();
  await dialog.getByPlaceholder('选择或输入标准色',{exact:true}).fill('宝兰');
  await dialog.getByLabel('修改原因',{exact:true}).fill('需要保留的修改说明');
  await dialog.getByRole('button',{name:'保存规则',exact:true}).click();
  await dialog.getByRole('alert').waitFor();
  assert.equal(await dialog.getByLabel('修改原因',{exact:true}).inputValue(),'需要保留的修改说明');
  assert.equal(requests[0].expectedMapping.factoryColor,'本白');
  assert.equal(requests[0].supplierSourceId,'TEST-SUP');
  await dialog.getByRole('button',{name:'刷新',exact:true}).click();
  await dialog.locator('button.row').filter({hasText:'大红'}).waitFor();
  assert.equal(await dialog.getByLabel('修改原因',{exact:true}).inputValue(),'需要保留的修改说明');
  await dialog.locator('button.row').click();
  assert.equal(await dialog.getByPlaceholder('选择或输入标准色',{exact:true}).inputValue(),'大红');
  await page.screenshot({path:`screenshots/canonical-colour-conflict/${width}.png`,fullPage:true});
  await dialog.getByRole('button',{name:'关闭厂家颜色资料'}).click();
  assert.equal(await entry.evaluate(element=>element===document.activeElement),true);
  await page.close();
 }
 console.log('PASS current canonical 4174 app-id/local-unreleased/40-character base identity, desktop+compact colour conflict retains input, refreshes current mapping and restores trigger focus. Mapping GET/POST intercepted with synthetic responses; no business writes.');
}finally{await browser.close();}
