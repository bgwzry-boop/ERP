import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const built = await build({
  stdin: { resolveDir: process.cwd(), loader: 'jsx', contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { useOfficeInteractionController } from './src/app/useOfficeInteractionController.js';
    function Harness({ user, token }) {
      const controller = useOfficeInteractionController({
        currentUserId: user, authState: { session: { accessToken: token } },
        permissionContext: { actionPermissions: ['order.void'] },
        orderLines: [{ id: 'F' }],
        executeOrderLineAction: () => new Promise(resolve => { window.finish = resolve; }),
      });
      window.controller = controller;
      return <output>{controller.orderActionModal ? controller.orderActionModal.orderLineId : 'closed'}</output>;
    }
    const root = createRoot(document.getElementById('app'));
    window.render = (user, token) => root.render(<Harness user={user} token={token} />);
    window.render('A', 'token-a');
  ` }, bundle: true, write: false, jsx: 'automatic', logLevel: 'silent',
});
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent('<div id="app"></div>');
  await page.addScriptTag({ content: built.outputFiles[0].text });
  await page.waitForFunction(() => window.controller);
  await page.evaluate(() => window.controller.openOrderActionModal({ type: 'void', orderLineId: 'F' }));
  await page.waitForFunction(() => document.querySelector('output').textContent === 'F');
  await page.evaluate(() => { window.pending = window.controller.confirmOrderLineAction({}); });
  await page.evaluate(() => window.render('B', 'token-b'));
  await page.waitForFunction(() => document.querySelector('output').textContent === 'closed', null, { timeout: 2000 });
  await page.evaluate(() => window.controller.openOrderActionModal({ type: 'void', orderLineId: 'new-record' }));
  await page.waitForFunction(() => document.querySelector('output').textContent === 'new-record');
  const oldResult = await page.evaluate(async () => { window.finish({ source: 'api', closeModal: true, feedback: 'Saved' }); return await window.pending; });
  assert.equal(oldResult.stale, true);
  assert.equal(await page.locator('output').textContent(), 'new-record');
  await page.evaluate(() => window.render('B', 'token-b-renewed'));
  await page.waitForFunction(() => document.querySelector('output').textContent === 'closed');
  console.log('PASS actual interaction hook: user/token changes invalidate order editor; old completion preserves the new editor. Write callback mocked.');
} finally { await browser.close(); }
