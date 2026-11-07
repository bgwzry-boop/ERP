// Integration regression: invalid-route correction must compose with the order edit guard.
// Business writes are denied; only the signed preview-session exchange is allowed.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.ERP_RECEIVING_CLEANUP_UI_BASE_URL || 'http://127.0.0.1:4174/';
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const writes = [], errors = [];
  await context.route('**/api/**', route => {
    const r = route.request(), path = new URL(r.url()).pathname;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(r.method()) && path !== '/api/auth/prototype-login') {
      writes.push({ method: r.method(), path }); return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  for (const nav of ['material-receiving', 'order-entry']) {
    await page.goto(`${base}?erpViewport=desktop&routeComposition=${Date.now()}#${nav}`);
    await page.getByText('管理A', { exact: true }).first().waitFor({ timeout: 45000 });
    await page.locator(`[data-nav-id="${nav}"][aria-current="page"]`).waitFor();
    let input;
    if (nav === 'order-entry') {
      input = page.getByRole('textbox', { name: '客户订单原文', exact: true });
      await input.fill('3037 红 500 个 黄松');
    }
    await page.evaluate(() => { window.location.hash = 'unknown-combination-route'; });
    await page.waitForFunction(id => window.location.hash === `#${id}`, nav);
    assert.equal(await page.locator(`[data-nav-id="${nav}"][aria-current="page"]`).count(), 1);
    assert.equal(await page.getByRole('alertdialog').count(), 0, 'invalid destination must not queue a discard prompt');
    if (input) assert.equal(await input.inputValue(), '3037 红 500 个 黄松');
  }
  assert.deepEqual(writes, []);
  assert.deepEqual(errors, []);
  console.log('Route guard composition passed: invalid hashes preserve receiving and unsaved order content without queued prompts.');
} finally { await browser.close(); }
