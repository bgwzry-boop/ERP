import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
const built = await build({alias:{react:process.cwd()+"/node_modules/react","react-dom":process.cwd()+"/node_modules/react-dom"},stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
import React from 'react';
import {createRoot} from 'react-dom/client';
import {PrinterDeviceQaPanel} from './src/features/production/ProductionPrintDevicePanels.jsx';
const root=createRoot(document.getElementById('app'));
window.render=saving=>root.render(<PrinterDeviceQaPanel qaState={{saving, selectedDeviceId:'P1',devices:[{printDeviceId:'P1',name:'Printer'}],checks:[{key:'sample_print',label:'Sample',status:'pending'}],note:'Original'}}/>);
window.render(true);
`},bundle:true,write:false,jsx:'automatic',logLevel:'silent'});
const browser = await chromium.launch();
try {
 const page=await browser.newPage();
 await page.setContent('<div id="app"></div>');
 await page.addScriptTag({content:built.outputFiles[0].text});
 await page.locator('.printer-device-qa-note input').waitFor();
 const fields=page.locator('.printer-device-qa-form input, .printer-device-qa-form select, .printer-device-qa-checks select, .printer-device-qa-evidence input, .printer-device-qa-note input');
 assert.ok(await fields.count()>6);
 for(const field of await fields.all()) assert.equal(await field.isDisabled(),true);
 assert.equal(await page.locator('.printer-device-qa-note input').inputValue(),'Original');
 await page.evaluate(()=>window.render(false));
 await page.waitForFunction(()=>!document.querySelector('.printer-device-qa-note input').disabled);
 for(const field of await fields.all()) assert.equal(await field.isEnabled(),true);
 console.log('PASS actual QA panel disables all record inputs while saving and restores editing afterward; isolated browser component.');
} finally {await browser.close();}
