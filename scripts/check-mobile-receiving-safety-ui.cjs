/**
 * Isolated UI regression: actual receiving/warehouse components and production CSS.
 * Synthetic facts and browser-local GET/document fixtures only. This is not account,
 * backend write, OCR/device, printer, or physical iPhone/Safari acceptance.
 * Run from any directory: node scripts/check-mobile-receiving-safety-ui.cjs
 * Optional ERP_MOBILE_UI_OUTPUT_DIR retains artifacts under an explicitly chosen base.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { build } = require('esbuild');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const outputBase = process.env.ERP_MOBILE_UI_OUTPUT_DIR
  ? path.resolve(process.env.ERP_MOBILE_UI_OUTPUT_DIR)
  : os.tmpdir();
fs.mkdirSync(outputBase, { recursive: true });
const output = fs.mkdtempSync(path.join(outputBase, 'erp-mobile-safety-'));
const results = [];
const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1';

async function buildFixture() {
  const { buildRawMaterialInboundDraftFromOcr } = await import(pathToFileURL(path.join(root, 'server/services/rawMaterialOcrParserService.mjs')));
  const cells = rows => rows.flatMap((row, y) => row.map((text, x) => ({ text, rowTl: y, rowBr: y, colTl: x, colBr: x, confidence: 98 })));
  const receipt = buildRawMaterialInboundDraftFromOcr({
    inboundId: 'UI-ONLY-RECEIPT', supplierNameHint: '隔离供应商', documentDirectionHint: 'supplier_delivery',
    recognizedAt: '2026-11-07T01:00:00Z',
    ocr: { pageCount: 1, tables: [{ sourcePageIndex: 0, cells: cells([
      ['隔离供应商送货单'], ['品名', '颜色', '规格', '数量', '重量', '单价', '金额'],
      ['无纺布', '红色', '78*090*1500', '1', '68', '11.8', '802.4'],
      ['无纺布', '宝蓝', '78*090*1500', '1', '70', '11.8', '826'],
    ]) }] },
  });
  receipt.supplierName = '隔离供应商';
  const source = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { RawMaterialMobileReceiving } from './src/features/raw-materials/RawMaterialMobileReceiving.jsx';
import { RawMaterialMobileOcrReview } from './src/features/raw-materials/RawMaterialMobileOcrReview.jsx';
import { WarehouseMobilePage } from './src/features/warehouse/WarehouseMobilePage.jsx';
import { ActionModal } from './src/app/ActionModals.jsx';
import { MobileRoleShellHeader } from './src/app/MobileRoleShellHeader.jsx';
${['tokens', 'base', 'shared', 'semantic-tags', 'shell', 'components', 'interface-polish'].map(name => `import './src/styles/${name}.css';`).join('\n')}
${['mobile-roles', 'role-tools', 'warehouse', 'raw-material', 'raw-material-foundation', 'raw-material-mobile', 'raw-material-mobile-atlas', 'raw-material-source-evidence', 'attachments', 'office-inbound-flow'].map(name => `import './src/styles/features/${name}.css';`).join('\n')}
const receipt = ${JSON.stringify(receipt)};
const role = window.fixtureRole;
const user = { userId: 'UI-ONLY-USER', displayName: '隔离界面测试', defaultRole: role };
const auth = { source: 'api_runtime', authenticated: true, session: { accessToken: 'UI_FIXTURE_INVALID_NOT_REAL' }, permissions: { user, actionPermissions: [], buttonPermissions: [] } };
window.fixtureWrites = [];
const forbidWrite = (...args) => { window.fixtureWrites.push(args); throw Error('Business writes are forbidden in this UI fixture'); };
function Office() {
  const [stage, setStage] = useState('home');
  const [discarding, setDiscarding] = useState(false);
  const [discardDisabled, setDiscardDisabled] = useState(false);
  const [documentDraft, setDocumentDraft] = useState({ supplierName: '隔离供应商' });
  const [lineDrafts, setLineDrafts] = useState({});
  window.setFixtureDiscardDisabled = setDiscardDisabled;
  window.fixtureDiscardCalls ??= 0;
  function simulatePendingDiscard() {
    window.fixtureDiscardCalls += 1;
    setDiscarding(true);
    return new Promise(resolve => { window.resolveFixtureDiscard = result => { setDiscarding(false); resolve(result); }; });
  }
  return stage === 'review'
    ? <div className="raw-material-detail-pane has-mobile-ocr-review"><RawMaterialMobileOcrReview
        authState={auth} selected={receipt} documentDraft={documentDraft} lineDrafts={lineDrafts}
        discarding={discarding} discardDisabled={discardDisabled}
        onDocumentFieldChange={(key, value) => setDocumentDraft(current => ({ ...current, [key]: value }))}
        onLineFieldChange={(id, key, value) => setLineDrafts(current => ({ ...current, [id]: { ...(current[id] ?? receipt.ocrLines.find(line => line.lineId === id).values), [key]: value } }))}
        onBack={() => setStage('home')} onDiscard={simulatePendingDiscard} onSubmit={forbidWrite} onOpenColorMapping={forbidWrite}
      /></div>
    : <RawMaterialMobileReceiving records={[receipt]} selected={receipt} mobileStage="home" onStageChange={setStage}
        reviewState={{ disabled: false }} attachState={{ disabled: false }} printState={{ disabled: false }}
        onDeliveryNoteRecognize={forbidWrite} onDeliveryNotePageSelect={forbidWrite} />;
}
const fulfillment = { id: 'UI-FULFILLMENT', lineId: 'UI-LINE', customerId: 'UI-CUSTOMER', qty: 500, actualQty: 500,
  status: '待出库', method: '自提', latest: '今天 17:00', goods: '红色无纺布袋 30×37cm', packages: '1包',
  warehouseTaskVisible: true, paperOutboundStatus: '已打印待交库房', printed: true, revision: 1 };
const line = { id: 'UI-LINE', customerId: 'UI-CUSTOMER', product: '无纺布袋', size: '30×37cm', qty: 500 };
const findCustomer = () => ({ name: '隔离客户' });
function Warehouse() {
  const [selected, setSelected] = useState(fulfillment.id);
  const [modal, setModal] = useState(null);
  return <><WarehouseMobilePage fulfillments={[fulfillment]} orderLines={[line]} selectedId={selected} setSelectedId={setSelected}
      helpers={{ findCustomer, findOrderLine: () => line, getFulfillmentGoodsDisplay: () => fulfillment.goods }}
      onAction={(action, id) => setModal({ type: 'warehouseExecution', fulfillmentId: id, prepareOnly: true, initialWarehouseResult: '已备货' })} />
    {modal ? createPortal(<ActionModal modal={modal} fulfillments={[fulfillment]} statements={[]} orderLines={[line]}
      findCustomer={findCustomer} getStatementBlockingAmount={() => 0} onClose={() => setModal(null)} onConfirm={forbidWrite} />,
      document.getElementById('overlay-root')) : null}</>;
}
const pageKey = role === 'office' ? 'rawMaterials' : 'warehouseMobile';
function App() {
  return <div className={'app-shell app-shell-' + pageKey + ' app-shell-mobile-role'}>
    <div className="workspace"><MobileRoleShellHeader currentUser={user} pageKey={pageKey} fixedPreviewMode />
      <main className="content">{role === 'office' ? <Office /> : <Warehouse />}</main></div>
    <div id="overlay-root" />
  </div>;
}
createRoot(document.getElementById('root')).render(<App />);
`;
  const bundle = await build({
    absWorkingDir: root,
    stdin: { contents: source, resolveDir: root, sourcefile: 'mobile-safety-fixture.jsx', loader: 'jsx' },
    alias: { react: path.dirname(require.resolve('react/package.json')), 'react-dom': path.dirname(require.resolve('react-dom/package.json')) },
    bundle: true, write: true, outfile: path.join(output, 'fixture.js'), platform: 'browser', format: 'iife', jsx: 'automatic',
    loader: { '.svg': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl' }, define: { 'import.meta.env': '{}' }, metafile: true,
  });
  const sourceHashes = Object.keys(bundle.metafile.inputs)
    .filter(name => !name.includes('node_modules') && !name.includes('mobile-safety-fixture') && !name.startsWith('<'))
    .map(name => { const file = path.resolve(root, name); return { path: path.relative(root, file), sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') }; });
  fs.writeFileSync(path.join(output, 'sources.json'), JSON.stringify({ head, sourceHashes }, null, 2));
}

async function withPhone(browser, role, width, check) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, userAgent, locale: 'zh-CN' });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const errors = [], network = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const request = route.request();
    if (request.resourceType() === 'document' && request.method() === 'GET' && request.url() === 'http://phone-fixture.invalid/') {
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div>' });
    }
    network.push({ method: request.method(), url: request.url() });
    return route.abort();
  });
  try {
    await page.goto('http://phone-fixture.invalid/');
    await page.evaluate(value => { window.fixtureRole = value; }, role);
    await page.addStyleTag({ path: path.join(output, 'fixture.css') });
    await page.addScriptTag({ path: path.join(output, 'fixture.js') });
    assert.ok(await page.evaluate(() => navigator.maxTouchPoints > 0 && matchMedia('(pointer:coarse)').matches), 'Phone touch emulation must be active');
    await check(page);
    assert.deepEqual(errors, [], 'No browser exceptions');
    assert.deepEqual(network, [], 'The fixture must not attempt a business/network request');
    assert.deepEqual(await page.evaluate(() => window.fixtureWrites), [], 'No business action may execute');
    results.push({ role, width, passed: true });
  } catch (error) {
    results.push({ role, width, passed: false, error: error.message, errors, network });
    await page.screenshot({ path: path.join(output, `${role}-${width}-failure.png`), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}

async function checkReceiptGeometry(page) {
  await page.getByRole('button', { name: '核对全部卷材', exact: true }).tap();
  const geometry = await page.locator('.raw-material-mobile-review-list article').first().evaluate(article => {
    const summary = article.querySelector('.raw-material-mobile-review-line-summary');
    return {
      width: innerWidth, documentWidth: document.documentElement.scrollWidth,
      buttons: [...summary.querySelectorAll('button')].map(button => {
        const rect = button.getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return { text: button.textContent, width: rect.width, height: rect.height, hittable: hit === button || button.contains(hit) };
      }),
      fields: [...article.querySelectorAll('.line-color,.line-spec,.line-weight,.raw-material-mobile-review-line-number')]
        .map(element => ({ className: element.className, text: element.textContent, width: element.clientWidth, contentWidth: element.scrollWidth, rect: element.getBoundingClientRect().toJSON() })),
      factoryFont: getComputedStyle(article.querySelector('.raw-material-factory-color')).fontSize,
      ticketFont: getComputedStyle(article.querySelector('.raw-material-ticket-color')).fontSize,
    };
  });
  assert.equal(geometry.documentWidth, geometry.width, 'No page overflow');
  for (const button of geometry.buttons) {
    assert.equal(button.hittable, true, `${button.text}: center is clipped or covered`);
    assert.ok(button.width >= 44 && button.height >= 44, `${button.text}: target ${button.width}×${button.height}, expected at least 44×44`);
  }
  for (const field of geometry.fields) assert.ok(field.contentWidth <= field.width + 1, `${field.className}: content clipped ${field.contentWidth}/${field.width}`);
  // A min-width can make the element itself wider than its grid track. Internal
  // scrollWidth alone then passes even while the specification covers the weight.
  const facts = geometry.fields.filter(field => ['line-color', 'line-spec', 'line-weight'].some(name => field.className.split(/\s+/).includes(name)));
  for (let i = 0; i < facts.length; i += 1) for (let j = i + 1; j < facts.length; j += 1) {
    const a = facts[i], b = facts[j];
    const horizontalGap = Math.max(a.rect.left - b.rect.right, b.rect.left - a.rect.right);
    const verticalGap = Math.max(a.rect.top - b.rect.bottom, b.rect.top - a.rect.bottom);
    assert.ok(Math.max(horizontalGap, verticalGap) >= 4, `${a.className}/${b.className}: fact fields overlap or lose their readable gap (${horizontalGap}px/${verticalGap}px)`);
  }
  assert.equal(geometry.factoryFont, '12px');
  assert.equal(geometry.ticketFont, '14px');
  assert.equal(geometry.fields.find(field => field.className === 'line-color').text, '红色（红色）');
  assert.ok(geometry.fields.find(field => field.className.split(/\s+/).includes('line-spec')).text.includes('90'), 'Specification preserved');
  assert.ok(geometry.fields.find(field => field.className === 'line-weight').text.includes('68'), 'Weight preserved');
  assert.equal(geometry.fields.find(field => field.className === 'raw-material-mobile-review-line-number').text, '1');
  results.push({ role: 'receipt-geometry', ...geometry });
}

async function checkReceiptDialog(page) {
  await page.getByRole('button', { name: '核对全部卷材', exact: true }).tap();
  const back = page.getByRole('button', { name: /返回/ }), dialog = page.getByRole('dialog');
  await back.focus();
  await back.tap();
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), '继续核对', 'Default focus must be the safe choice');
  for (const key of ['Tab', 'Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab']) {
    await page.keyboard.press(key);
    assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true, `${key}: focus escaped`);
  }
  await page.keyboard.press('Escape');
  assert.equal(await dialog.count(), 0, 'Idle Escape returns to review');
  assert.equal(await back.evaluate(element => element === document.activeElement), true, 'Return focus to opening control');

  await page.evaluate(() => window.setFixtureDiscardDisabled(true));
  await back.tap();
  assert.equal(await page.getByRole('button', { name: '放弃这张，重新拍', exact: true }).isDisabled(), true);
  for (const key of ['Tab', 'Shift+Tab']) {
    await page.keyboard.press(key);
    assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true);
  }
  await page.keyboard.press('Escape');
  assert.equal(await dialog.count(), 0, 'No discard permission must not disable safe Escape/continue');

  await page.evaluate(() => window.setFixtureDiscardDisabled(false));
  await back.tap();
  await page.getByRole('button', { name: '放弃这张，重新拍', exact: true }).tap();
  await page.getByRole('button', { name: '正在放弃…', exact: true }).waitFor();
  assert.equal(await dialog.locator('button:not(:disabled)').count(), 0);
  await page.keyboard.press('Escape');
  assert.equal(await dialog.count(), 1, 'Pending discard cannot be bypassed by Escape');
  for (const key of ['Tab', 'Shift+Tab', 'Tab']) {
    await page.keyboard.press(key);
    assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true, 'All-disabled pending state must retain focus');
  }
  await page.evaluate(() => window.resolveFixtureDiscard({ ok: false, message: '隔离模拟失败；原草稿保留' }));
  await page.getByRole('button', { name: '继续核对', exact: true }).tap();
  assert.equal(await dialog.count(), 0);
  assert.equal(await page.locator('.raw-material-mobile-ocr-review').count(), 1);
  assert.equal(await page.evaluate(() => window.fixtureDiscardCalls), 1);
}

async function checkWarehouseMask(page) {
  await page.getByRole('button', { name: /登记已备货/ }).tap();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  const nav = page.getByRole('navigation', { name: '成品库房手机导航' }).getByRole('button', { name: /待处理/ });
  const point = await nav.evaluate(button => {
    const rect = button.getBoundingClientRect(), x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    return { x, y, hitsNavigation: hit === button || button.contains(hit) };
  });
  assert.equal(point.hitsNavigation, false, 'Modal must cover the bottom navigation');
  await page.touchscreen.tap(point.x, point.y);
  assert.equal(await page.locator('.warehouse-mobile-queue').count(), 0, 'Background must not navigate while modal is open');
  assert.equal(await dialog.count(), 1);
  await page.getByRole('button', { name: '取消', exact: true }).tap();
  assert.equal(await dialog.count(), 0);
}

(async () => {
  await buildFixture();
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [375, 390, 430, 500, 501]) await withPhone(browser, 'office', width, checkReceiptGeometry);
    await withPhone(browser, 'office', 390, checkReceiptDialog);
    await withPhone(browser, 'warehouse', 390, checkWarehouseMask);
    console.log(`PASS mobile receiving UI: 5 widths, physical touch targets, safe/busy/no-permission focus, warehouse modal mask. Synthetic UI only. Evidence: ${output}`);
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ head, syntheticUiOnly: true, realBusinessWrites: false, results }, null, 2));
  }
})().catch(error => { console.error(error); console.error(`UI evidence: ${output}`); process.exitCode = 1; });
