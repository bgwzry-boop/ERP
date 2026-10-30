import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {directionFixture, correctedFixture, colourFixture, provisionalFixture} from './check-raw-material-direction-color.mjs';
const browser=await chromium.launch();
const out='screenshots/receipt-direction-color';
await mkdir(out,{recursive:true});
try {
  for(const width of [1440,800]) {
    const page=await browser.newPage({viewport:{width,height:1000}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    let current=structuredClone(directionFixture), correctionCalls=0, mappingCalls=0, failCorrection=true;
    await page.route('**/api/raw-material-inbounds**',async route=>{
      const req=route.request();
      if(req.method()==='GET') return route.fulfill({json:{items:[current,colourFixture],page:1,pageSize:200,total:2}});
      assert.ok(req.url().endsWith('/'+current.id+'/reparse-ocr'),'unexpected business command');
      correctionCalls++;
      const body=req.postDataJSON();assert.equal(body.documentDirectionHint,'supplier_return');
      assert.equal(body.expectedRevision,1);
      if(failCorrection) return route.fulfill({status:409,json:{code:'TEST_CONFLICT',message:'测试：请刷新后重试'}});
      current={...correctedFixture,revision:2};
      return route.fulfill({json:{inbound:current,operationLogId:'TEST-AUDIT'}});
    });
    await page.route('**/api/master-data/raw-material-supplier-colors*',async route=>{
      if(route.request().method()==='GET')return route.fulfill({json:{items:[],options:{suppliers:[{supplierSourceId:'人意无纺布',supplierName:'人意无纺布'}],factoryColors:['宝蓝','海蓝','米白','玫红']}}});
      mappingCalls++;
      const body=route.request().postDataJSON();assert.equal(body.supplierColor,'海兰');
      return route.fulfill({json:{mapping:{id:'TEST-MAPPING',supplierSourceId:'人意无纺布',supplierColor:'海兰',factoryColor:'海蓝',enabled:true},operationLogId:'TEST-MAP-AUDIT'}});
    });
    await page.goto(`http://127.0.0.1:4174/?receiptFixTest=${width}&erpViewport=desktop#material-receiving`);
    await page.getByRole('button',{name:'改为退货单核对',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'请先核对退货方向',exact:true}).isDisabled(),true);
    assert.equal(await page.locator('.office-roll-table').count(),0,'direction conflict must not ask for incoming colours');
    await page.getByRole('button',{name:'改为退货单核对',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'测试：请刷新后重试'}).first().waitFor();
    assert.equal(correctionCalls,1);
    failCorrection=false;
    await page.getByRole('button',{name:'改为退货单核对',exact:true}).click();
    await page.getByRole('tab',{name:'退货单 1',exact:true}).click();
    await page.getByRole('button',{name:'确认退货，不入库',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'改为退货单核对',exact:true}).count(),0);
    assert.match(await page.locator('.office-roll-table').innerText(),/-68kg/);
    assert.equal(await page.locator('.office-roll-table').getByText('厂内标准色待确认',{exact:true}).count(),0);
    await page.screenshot({path:`${out}/desktop-return-${width}.png`,fullPage:true});
    await page.getByRole('tab',{name:'待核对 1',exact:true}).click();
    await page.locator('.office-roll-row').filter({hasText:'海兰'}).first().waitFor();
    assert.equal(await page.locator('.office-roll-color-text').filter({hasText:'暂用票面色 · 厂内色待统一'}).count(),6);
    await page.locator('.office-roll-row').filter({hasText:'海兰'}).first().getByRole('button',{name:'改这一卷',exact:true}).click();
    await page.getByRole('button',{name:'维护厂家颜色对应',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'厂家颜色资料'});
    await dialog.waitFor();
    assert.equal(await dialog.getByLabel('票面颜色',{exact:true}).inputValue(),'海兰');
    await dialog.getByPlaceholder('选择或输入标准色',{exact:true}).fill('海蓝');
    await dialog.getByRole('button',{name:'保存规则',exact:true}).click();
    await dialog.waitFor({state:'hidden'});
    assert.equal(mappingCalls,1);
    assert.equal(await page.locator('.office-roll-color-text').filter({hasText:'暂用票面色 · 厂内色待统一'}).count(),4,'only matching source-colour lines are filled');
    assert.equal(await page.locator('.office-roll-color-text').filter({hasText:'海蓝'}).count(),2);
    assert.equal(await page.locator('.office-roll-editor').count(),0,'old blank editor must not overwrite saved mapping');
    if(width===1440) assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:`${out}/desktop-colour-${width}.png`,fullPage:true});
    assert.deepEqual(errors,[]);
    await page.close();
  }
  for(const fixture of [directionFixture,provisionalFixture]) {
    const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    let current=structuredClone(fixture);
    await page.route('**/api/raw-material-inbounds**',async route=>{
      if(route.request().method()==='GET') return route.fulfill({json:{items:[current],page:1,pageSize:200,total:1}});
      assert.ok(route.request().url().endsWith('/'+directionFixture.id+'/reparse-ocr'));
      assert.equal(route.request().postDataJSON().documentDirectionHint,'supplier_return');
      current={...correctedFixture,revision:2};
      return route.fulfill({json:{inbound:current,operationLogId:'TEST-MOBILE-AUDIT'}});
    });
    await page.goto(`http://127.0.0.1:4174/?receiptFixMobile=${fixture.id}&erpViewport=mobile#material-receiving`);
    await page.getByRole('button',{name:'核对全部卷材',exact:true}).click();
    if(fixture===directionFixture) {
      assert.equal(await page.getByRole('button',{name:'请先核对退货方向',exact:true}).isDisabled(),true);
      await page.getByRole('button',{name:'改为退货单核对',exact:true}).click();
      await page.getByLabel('退货逐件核对').getByText('核对退货单',{exact:true}).waitFor();
      assert.doesNotMatch(await page.locator('body').innerText(),/current =>|isCurrent\(\)/,'toast must show a message, never a state-updater function');
      assert.match(await page.locator('.raw-material-mobile-review-list').innerText(),/-68/);
      assert.equal(await page.getByRole('button',{name:'改为退货单核对',exact:true}).count(),0);
    } else {
      assert.equal(await page.getByText('厂家：海兰',{exact:true}).count(),1);
      const row=page.locator('.raw-material-mobile-review-list > article').first();
      await row.getByRole('button',{name:'修改',exact:true}).click();
      await page.getByText('待统一',{exact:true}).waitFor();
      assert.equal(await row.getByRole('button',{name:'核对正确',exact:true}).isEnabled(),true,'unmapped supplier colour does not block line confirmation');
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:`${out}/mobile-${fixture===directionFixture?'return':'colour'}.png`,fullPage:true});
    assert.deepEqual(errors,[]);await page.close();
  }
  console.log('PASS desktop 1440/800 and phone 390: direction guard/retry/correction, source colours and mapping refill; all tested business writes mocked.');
} finally {await browser.close();}
