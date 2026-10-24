import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "@playwright/test";

// Real component and incumbent CSS, synthetic read-only API. No shared preview
// server or business endpoint is used by this focused rendering check.
const apiNames = ["generateOfficePayrollDraft", "getOfficeEmployeeAttendance", "createOfficePayrollExport", "getOfficePayrollHistory", "getOfficePayrollRun", "getOfficePayrollWorkbench", "precheckOfficeAttendanceSync", "reviewOfficeAttendanceDay", "saveOfficePayrollPolicy", "syncOfficeAttendance", "transitionOfficePayrollRun", "updateOfficePayrollLineAdjustment"];
const fixture = {
  employees: [{ employeeId: "EMP-LUNCH-UI", name: "合成验收员工", roleName: "丝印", totalWorkMinutes: 600, pendingExceptionCount: 0, readyForDraft: false, blockers: ["正式工资条件未验收"] }],
  payrollRuns: [], summary: { draftReady: false }, sourceStatus: { configured: false, label: "合成界面验收，无真实接入" },
};
const attendance = { days: [{ workDate: "2026-09-15", punchTimes: ["08:00", "18:00"], expectedPunchCount: 2, actualPunchCount: 2, rawWorkMinutes: 600, workMinutes: 600, status: "reviewed", statusLabel: "已复核",
  minuteCalculation: { legacyReviewedMinutesPreserved: true, rawWorkMinutes: 600, unpaidBreakMinutes: 60, calculatedWorkMinutes: 540 } }] };
const bundle = await build({ stdin: { contents: `
  import React from 'react'; import {createRoot} from 'react-dom/client';
  import {PayrollAttendancePage} from './src/features/payroll/PayrollAttendancePage.jsx';
  import './src/styles/tokens.css';
  import './docs/prototypes/raw-material-roll-inventory-review/src/styles.css';
  import './src/styles/features/payroll-attendance.css';
  window.reviewWrites=[]; window.fixture=${JSON.stringify(fixture)}; window.attendance=${JSON.stringify(attendance)};
  window.readApi=(name,input)=>{
    if(name==='getOfficePayrollWorkbench')return Promise.resolve({data:window.fixture});
    if(name==='getOfficeEmployeeAttendance')return Promise.resolve({data:window.attendance});
    if(name==='getOfficePayrollHistory')return Promise.resolve({data:{items:[],total:0}});
    window.reviewWrites.push({name,input});return Promise.resolve({blocked:true,error:{message:'合成验收不执行写入'}});
  };
  createRoot(document.getElementById('root')).render(<PayrollAttendancePage authState={{session:{accessToken:'synthetic'}}} currentUser={{userId:'SYNTHETIC'}} permissionContext={{actionPermissions:['attendance.review']}} />);
`, resolveDir: process.cwd(), loader: "jsx" }, bundle: true, write: false, outfile: "view.js", jsx: "automatic",
  loader: { ".svg": "dataurl", ".png": "dataurl", ".woff2": "dataurl" },
  plugins: [{ name: "synthetic-attendance-only", setup(builder) {
    builder.onLoad({ filter: /officeAttendancePayrollApiClient\.js$/ }, () => ({ contents: apiNames.map((name) => `export const ${name}=(input)=>window.readApi('${name}',input);`).join("\n") }));
    builder.onLoad({ filter: /officeAttachmentApiClient\.js$/ }, () => ({ contents: "export const createPayrollAdjustmentEvidenceAttachmentInput=x=>x;export const uploadOfficeAttachmentFile=x=>window.readApi('upload',x);" }));
  } }], define: { "process.env.NODE_ENV": '"test"' }, logLevel: "silent",
});
const javascript = bundle.outputFiles.find((file) => file.path.endsWith(".js")).text;
const css = bundle.outputFiles.find((file) => file.path.endsWith(".css")).text;
const server = createServer((request, response) => {
  response.setHeader("Content-Type", request.url === "/view.js" ? "application/javascript" : request.url === "/view.css" ? "text/css" : "text/html; charset=utf-8");
  response.end(request.url === "/view.js" ? javascript : request.url === "/view.css" ? css : '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>本地合成界面验收 · 未部署</title><link rel="stylesheet" href="/view.css"><style>body{margin:0;padding:24px}#root{height:calc(100vh - 48px)}.payroll-review-workbench{height:100%}</style><div id="root"></div><script type="module" src="/view.js"></script></html>');
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const browser = await chromium.launch();
const output = resolve(".erp-local-storage/attendance-r3");
await mkdir(output, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.getByLabel("工资月份").fill("2026-09");
  await page.getByLabel("待复核日期").selectOption("2026-09-15");
  const facts = page.getByRole("definition");
  assert.equal(await facts.count(), 3);
  assert.deepEqual(await facts.allTextContents(), ["10.00小时", "1.00小时", "9.00小时"]);
  await page.getByText("本次拟确认", { exact: true }).scrollIntoViewIfNeeded();
  const form = page.locator(".payroll-review-form");
  await form.screenshot({ path: resolve(output, "lunch-review-1440.png") });
  await page.screenshot({ path: resolve(output, "lunch-workbench-1440.png"), fullPage: true });
  assert.equal(await page.evaluate(() => window.reviewWrites.length), 0);
  assert.equal(await form.evaluate((node) => node.scrollWidth <= node.clientWidth), true);
  await page.getByLabel("复核结果").selectOption("adjusted");
  await page.getByLabel("调整后工时").fill("8.5");
  assert.match(await form.textContent(), /人工填写的是最终确认工时/);
  await form.screenshot({ path: resolve(output, "lunch-manual-review-1440.png") });
  assert.deepEqual(errors, []);
  console.log(`Attendance lunch UI passed: real component/CSS, 10h raw / 1h lunch / 9h proposed, legacy minutes untouched on view, separate manual confirmation and readable form. Screenshots: ${output}`);
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
