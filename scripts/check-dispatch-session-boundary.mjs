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
        permissionContext: { actionPermissions: ['fulfillment.dispatch.update'] },
        fulfillments: [{ id: 'F' }],
        saveFulfillmentDispatch: () => new Promise(resolve => { window.finish = resolve; }),
      });
      window.controller = controller;
      return <output>{controller.modal ? controller.modal.fulfillmentId : 'closed'}</output>;
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
  await page.evaluate(() => window.controller.openModal({ type: 'dispatch', fulfillmentId: 'F' }));
  await page.waitForFunction(() => document.querySelector('output').textContent === 'F');
  await page.evaluate(() => { window.pending = window.controller.confirmModal({}); });
  await page.evaluate(() => window.render('B', 'token-b'));
  await page.waitForFunction(() => document.querySelector('output').textContent === 'closed', null, { timeout: 2000 });
  await page.evaluate(() => window.controller.openModal({ type: 'dispatch', fulfillmentId: 'new-record' }));
  await page.waitForFunction(() => document.querySelector('output').textContent === 'new-record');
  const oldResult = await page.evaluate(async () => { window.finish({ feedback: 'Saved' }); return await window.pending; });
  assert.equal(oldResult.stale, true);
  assert.equal(await page.locator('output').textContent(), 'new-record');
  await page.evaluate(() => window.render('B', 'token-b-renewed'));
  await page.waitForFunction(() => document.querySelector('output').textContent === 'closed');
  console.log('PASS actual dispatch hook: user/token changes invalidate editor; old completion preserves new editor. Write callback mocked.');
} finally { await browser.close(); }
