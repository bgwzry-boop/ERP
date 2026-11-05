import { fulfillReceiptRead, selectReceiptRow, selectReceiptTab } from "./receipt-ui-read-fixtures.mjs";
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
      if (await fulfillReceiptRead(route, [current, colourFixture])) return;
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
    await selectReceiptRow(page, current.id);
    await page.getByRole('button',{name:'改为退货单核对',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'请先核对退货方向',exact:true}).isDisabled(),true);
    assert.equal(await page.locator('.office-roll-table').count(),0,'direction conflict must not ask for incoming colours');
    await page.getByRole('button',{name:'改为退货单核对',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'测试：请刷新后重试'}).first().waitFor();
    assert.equal(correctionCalls,1);
    failCorrection=false;
    await page.getByRole('button',{name:'改为退货单核对',exact:true}).click();
    await selectReceiptTab(page, '退货单 1');
    await selectReceiptRow(page, current.id);
    await page.getByRole('button',{name:'确认退货，不入库',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'改为退货单核对',exact:true}).count(),0);
    assert.match(await page.locator('.office-roll-table').innerText(),/-68kg/);
    assert.equal(await page.locator('.office-roll-table').getByText('厂内标准色待确认',{exact:true}).count(),0);
    await page.screenshot({path:`${out}/desktop-return-${width}.png`,fullPage:true});
    await selectReceiptTab(page, '待核对 1');
    await selectReceiptRow(page, colourFixture.id);
    await page.locator('.office-roll-row').filter({hasText:'海兰'}).first().waitFor();
    assert.deepEqual(await page.locator('.office-roll-color-text').allTextContents(),['（海兰）','（海兰）','（米黄）','（米黄）','宝蓝（宝兰）','宝蓝（宝兰）','（米黄）','（梅红）']);
    assert.equal(await page.locator('.office-roll-color-text small').count(),0);
    const ticketMetrics = await page.locator('.office-roll-color-text').filter({hasText:'宝蓝（宝兰）'}).first().evaluate((element) => {
      const factory = element.querySelector('.raw-material-factory-color');
      const ticket = element.querySelector('.raw-material-ticket-color');
      const factoryStyle = getComputedStyle(factory);
      const ticketStyle = getComputedStyle(ticket);
      const rowElement = element.closest('.office-roll-row');
      const row = rowElement.getBoundingClientRect();
      const text = element.getBoundingClientRect();
      const widthCell = rowElement.querySelector('.office-roll-fact:nth-of-type(2)').getBoundingClientRect();
      const label = rowElement.querySelector('strong');
      const chip = rowElement.querySelector('.raw-material-color-chip').getBoundingClientRect();
      const labelBox = label.getBoundingClientRect();
      const separated = [...document.querySelectorAll('.office-roll-row')].every((item) => {
        const roll = item.querySelector('strong');
        const swatch = item.querySelector('.raw-material-color-chip');
        if (!roll || !swatch) return true;
        const rollBox = roll.getBoundingClientRect();
        const swatchBox = swatch.getBoundingClientRect();
        return roll.scrollWidth <= roll.clientWidth + 1 && swatchBox.left >= rollBox.right + 6 && swatchBox.left >= rollBox.left + roll.scrollWidth + 6;
      });
      return {
        text: element.textContent,
        factorySize: factoryStyle.fontSize,
        ticketSize: ticketStyle.fontSize,
        sameFamily: factoryStyle.fontFamily === ticketStyle.fontFamily,
        sameWeight: factoryStyle.fontWeight === ticketStyle.fontWeight,
        fitsText: element.scrollWidth <= element.clientWidth + 1,
        colorRoom: element.closest('.office-roll-fact').clientWidth - chip.width - parseFloat(getComputedStyle(element.closest('.office-roll-fact')).columnGap || 0),
        textScroll: element.scrollWidth,
        insideRow: text.right <= row.right + 0.5 && text.bottom <= row.bottom + 0.5,
        clearOfWidth: text.right <= widthCell.left + 0.5,
        labelFits: label.scrollWidth <= label.clientWidth + 1,
        chipAfterLabel: chip.left >= labelBox.right + 6,
        separated,
      };
    });
    assert.equal(ticketMetrics.text, '宝蓝（宝兰）');
    assert.equal(ticketMetrics.factorySize, '12px');
    assert.equal(ticketMetrics.ticketSize, '14px');
    assert.equal(ticketMetrics.sameFamily, true);
    assert.equal(ticketMetrics.sameWeight, true);
    assert.equal(ticketMetrics.fitsText, true, `ticket colour overflowed its cell at ${width}px`);
    assert.ok(ticketMetrics.colorRoom >= ticketMetrics.textScroll + 12, `common ticket colour has less than 12px spare at ${width}px (${ticketMetrics.colorRoom} vs ${ticketMetrics.textScroll})`);
    assert.equal(ticketMetrics.insideRow, true);
    assert.equal(ticketMetrics.clearOfWidth, true);
    assert.equal(ticketMetrics.labelFits, true, `roll number was clipped at ${width}px`);
    assert.equal(ticketMetrics.chipAfterLabel, true, `colour chip overlapped the roll number at ${width}px`);
    assert.equal(ticketMetrics.separated, true, `a roll number still meets its colour chip at ${width}px`);
    await page.locator('.office-roll-row').filter({hasText:'海兰'}).first().getByRole('button',{name:'改这一卷',exact:true}).click();
    await page.getByRole('button',{name:'维护厂家颜色对应',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'厂家颜色资料'});
    await dialog.waitFor();
    assert.equal(await dialog.getByLabel('票面颜色',{exact:true}).inputValue(),'海兰');
    await dialog.getByPlaceholder('选择或输入标准色',{exact:true}).fill('海蓝');
    await dialog.getByRole('button',{name:'保存规则',exact:true}).click();
    await dialog.waitFor({state:'hidden'});
    assert.equal(mappingCalls,1);
    assert.deepEqual(await page.locator('.office-roll-color-text').allTextContents(),['海蓝（海兰）','海蓝（海兰）','（米黄）','（米黄）','宝蓝（宝兰）','宝蓝（宝兰）','（米黄）','（梅红）'],'only matching source-colour lines are filled');
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
      if (await fulfillReceiptRead(route, [current])) return;
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
      assert.equal(await page.locator('.line-color').filter({hasText:/^（海兰）$/}).count(),1);
      const row=page.locator('.raw-material-mobile-review-list > article').first();
      await row.getByRole('button',{name:'修改',exact:true}).click();
      await page.getByText('待统一',{exact:true}).waitFor();
      assert.equal(await row.getByRole('button',{name:'核对正确',exact:true}).isEnabled(),true,'unmapped supplier colour does not block line confirmation');
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:`${out}/mobile-${fixture===directionFixture?'return':'colour'}.png`,fullPage:true});
    assert.deepEqual(errors,[]);await page.close();
  }
  {
    const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/api/raw-material-inbounds**',async route=>{
      if (await fulfillReceiptRead(route, [colourFixture])) return;
      return route.fulfill({status:404,json:{message:'unexpected write'}});
    });
    await page.goto('http://127.0.0.1:4174/?receiptTicketColor=1&erpViewport=mobile#material-receiving');
    await page.getByRole('button',{name:'核对全部卷材',exact:true}).click();
    const line=page.locator('.line-color').filter({hasText:'宝蓝（宝兰）'}).first();
    await line.waitFor();
    const mobileMetrics=await line.evaluate((element)=>{
      const factory=element.querySelector('.raw-material-factory-color');
      const ticket=element.querySelector('.raw-material-ticket-color');
      const factoryStyle=getComputedStyle(factory);
      const ticketStyle=getComputedStyle(ticket);
      const self=element.getBoundingClientRect();
      const summary=element.closest('.raw-material-mobile-review-line-summary').getBoundingClientRect();
      const next=element.nextElementSibling.getBoundingClientRect();
      return {
        text:element.textContent,
        factorySize:factoryStyle.fontSize,
        ticketSize:ticketStyle.fontSize,
        sameFamily:factoryStyle.fontFamily===ticketStyle.fontFamily,
        sameWeight:factoryStyle.fontWeight===ticketStyle.fontWeight,
        overflow:getComputedStyle(element).overflowX,
        nowrap:getComputedStyle(element).whiteSpace,
        insideSummary:self.right<=summary.right+0.5 && self.left>=summary.left-0.5,
        clearOfSpec:self.right<=next.left+0.5,
        fitsText:element.scrollWidth<=element.clientWidth+1,
        colorWidth:element.getBoundingClientRect().width,
      };
    });
    assert.equal(mobileMetrics.text,'宝蓝（宝兰）');
    assert.equal(mobileMetrics.fitsText,true,'phone review colour column still clips 宝蓝（宝兰）');
    assert.ok(mobileMetrics.colorWidth>=92,'phone review colour column is narrower than 宝蓝（宝兰）');
    assert.equal(mobileMetrics.factorySize,'14px');
    assert.equal(mobileMetrics.ticketSize,'16px');
    assert.equal(mobileMetrics.sameFamily,true);
    assert.equal(mobileMetrics.sameWeight,true);
    assert.equal(mobileMetrics.nowrap,'nowrap');
    assert.notEqual(mobileMetrics.overflow,'visible');
    assert.equal(mobileMetrics.insideSummary,true);
    assert.equal(mobileMetrics.clearOfSpec,true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[]);
    await page.close();
  }
  console.log('PASS desktop 1440/800 and phone 390: direction guard/retry/correction, source colours and mapping refill; ticket colour is 2px larger inside parentheses; all tested business writes mocked.');
} finally {await browser.close();}

await import("./check-raw-material-return-direction-ui.mjs");
