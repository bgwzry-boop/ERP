import { expect, test, devices } from '@playwright/test';

test('桌面完整读取超过200条的订单，搜索不会遗漏后面的客户', async ({page}) => {
  const pages = new Set();
  let template;
  await page.route('**/api/order-lines?*', async route => {
    const response=await route.fetch(); const body=await response.json();
    template ||= body.items[0];
    expect(template).toBeTruthy();
    const url=new URL(route.request().url());const pageNumber=Number(url.searchParams.get('page')||1);
    const pageSize=Math.min(Number(url.searchParams.get('pageSize')||50),200); pages.add(pageNumber);
    const all=Array.from({length:451},(_,index)=>({...template,orderLineId:`P1-LINE-${index}`,id:`P1-LINE-${index}`,customerName:index===450?'第451条末页客户':'分页测试客户'}));
    await route.fulfill({response,json:{...body,page:pageNumber,pageSize,total:all.length,items:all.slice((pageNumber-1)*pageSize,pageNumber*pageSize)}});
  });
  await page.goto('/?erpReviewCheck=p1-page#order-pool');
  await expect(page.locator('.business-panel-heading')).toContainText('451');
  await page.getByRole('textbox',{name:'订单池搜索'}).fill('第451条末页客户');
  await expect(page.locator('.business-table-body')).toContainText('第451条末页客户');
  expect([...pages].sort()).toEqual([1,2,3]);
});

test('电脑库存按钮打开选中库存项真实流水和盘点表单', async ({page}) => {
  const reads=[];page.on('request',request=>{if(request.url().includes('/inventory/ledger-entries'))reads.push(request.url());});
  await page.goto('/?erpReviewCheck=p1-inventory#inventory-query');
  await page.getByRole('button',{name:'库存流水与盘点',exact:true}).click();
  await expect(page.getByRole('region',{name:'当前库存项流水'})).toBeVisible();
  await expect(page.getByRole('region',{name:'当前库存修正记录'})).toBeVisible();
  await page.getByRole('button',{name:'发起库存修正',exact:true}).click();
  await expect(page.getByRole('form',{name:'库存修正草稿'})).toBeVisible();
  expect(reads.length).toBeGreaterThan(0);
  expect(new URL(reads.at(-1)).searchParams.get('inventoryItemId')).toBeTruthy();
  await expect(page.getByText('提交只建立待确认草稿，不立即改变库存。',{exact:false})).toBeVisible();
});

test('待排产任务显示机台、数量、依据和发布入口',async({page})=>{
  await page.goto('/?erpReviewCheck=p1-production#production-tasks');
  await page.getByRole('row').filter({hasText:'黑马二批'}).click();
  const panel=page.getByRole('region',{name:'办公室排产'});
  await expect(panel.getByLabel('生产机台')).toBeVisible();
  await expect(panel.getByLabel('排产数量（个）')).toHaveValue('1800');
  await expect(panel.getByRole('button',{name:'确认并发布排产'})).toBeDisabled();
  await panel.getByLabel('安排或调整依据').fill('测试机台与交期核对');
  await expect(panel.getByRole('button',{name:'确认并发布排产'})).toBeEnabled();
});

test('电脑对账入口打开选中账单的实际明细并能返回', async ({page}) => {
  const ids=[];
  page.on('request',request=>{const path=new URL(request.url()).pathname;if(/^\/api\/statements\/[^/]+$/.test(path)&&!path.endsWith('/customers'))ids.push(path);});
  await page.goto('/?erpReviewCheck=p1-finance#customer-statements');
  const row=page.getByRole('table',{name:'对账收款列表'}).getByRole('row').nth(1);
  await expect(row).toBeVisible();
  await row.click();
  await page.getByRole('button',{name:'查看对账明细与收款',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByRole('heading',{name:'对账明细',exact:true})).toBeVisible();
  await expect(dialog.getByLabel('本期累计实收（元）')).toBeVisible();
  expect(ids.length).toBeGreaterThan(0);
  await dialog.getByRole('button',{name:'返回列表',exact:true}).click();
  await expect(dialog).toHaveCount(0);
});

test('电脑打印作业入口打开所选作业，设备行不能冒充作业', async ({page}) => {
  const job={printJobId:'PJ-P1-ENTRY',targetId:'F-P1-ENTRY',documentType:'delivery_note',jobStatus:'sent',driverMode:'system_printer',printDeviceId:'PRN-P1',payload:{printTemplate:{fields:{customerName:'打印入口合成客户',quantity:100}}}};
  await page.route('**/api/print-jobs**',async route=>{
    const url=new URL(route.request().url());
    if(route.request().method()!=='GET')throw new Error('入口检查不得写入打印作业');
    await route.fulfill({json:url.pathname.endsWith('/PJ-P1-ENTRY')?{printJob:job}:{items:[job],total:1,page:1,pageSize:200}});
  });
  await page.goto('/?erpReviewCheck=p1-print#print-devices');
  await expect(page.getByRole('button',{name:'查看打印作业详情',exact:true})).toBeDisabled();
  await page.getByRole('tab',{name:'打印作业',exact:true}).click();
  await page.getByRole('button',{name:'查看打印作业详情',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'打印作业详情'});
  await expect(dialog).toContainText('打印入口合成客户');
  await expect(dialog).toContainText('不能手动标成已打印');
  await expect(dialog.getByRole('button',{name:'确认派发',exact:true})).toHaveCount(0);
  await dialog.getByRole('button',{name:'返回列表',exact:true}).click();
  await expect(dialog).toHaveCount(0);
});

test.describe('手机正式页面驱动加载',()=>{
  test.use({viewport:devices['iPhone 13'].viewport, userAgent:devices['iPhone 13'].userAgent, isMobile:true, hasTouch:true, deviceScaleFactor:3});
  test('默认收货读取原料；我的考勤可进入并返回收货',async({page})=>{
    const reads=[];page.on('request',request=>reads.push(new URL(request.url()).pathname));
    await page.goto('/?erpReviewCheck=p1-mobile&erpViewport=mobile#material-receiving');
    await expect(page.getByText('录原材料',{exact:true})).toBeVisible();
    await expect.poll(()=>reads.includes('/api/raw-material-inbounds')).toBe(true);
    await page.getByRole('button',{name:'我的考勤',exact:true}).click();
    await expect(page.getByText('考勤月份',{exact:true})).toBeVisible();
    await expect.poll(()=>reads.includes('/api/attendance/me')).toBe(true);
    await page.getByRole('button',{name:'返回任务',exact:true}).click();
    await expect(page.getByText('录原材料',{exact:true})).toBeVisible();
  });
});
