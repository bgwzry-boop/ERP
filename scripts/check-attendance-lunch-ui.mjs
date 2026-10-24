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
  employees: [{ employeeId: "EMP-LUNCH-UI", name: "合成普通员工", roleName: "普工", totalWorkMinutes: 540, pendingExceptionCount: 0, readyForDraft: false, blockers: ["正式工资条件未验收"] },
    { employeeId: "EMP-SILK-UI", name: "合成丝印员工", roleName: "丝印", totalWorkMinutes: 600, pendingExceptionCount: 0, readyForDraft: false, blockers: ["正式工资条件未验收"] }],
  payrollRuns: [], summary: { draftReady: false }, sourceStatus: { configured: false, label: "合成界面验收，无真实接入" },
};
const attendance = { days: [{ workDate: "2026-09-15", punchTimes: ["08:00", "12:30", "13:30", "18:00"], expectedPunchCount: 4, actualPunchCount: 4, rawWorkMinutes: 540, workMinutes: 540, status: "reviewed", statusLabel: "已复核",
  minuteCalculation: { breakRule: "fixed_lunch", legacyReviewedMinutesPreserved: true, rawWorkMinutes: 540, unpaidBreakMinutes: 30, calculatedWorkMinutes: 510 } }] };
const silkAttendance = { days: [{ workDate: "2026-09-15", punchTimes: ["08:00", "18:00"], expectedPunchCount: 2, actualPunchCount: 2, rawWorkMinutes: 600, workMinutes: 600, status: "normal", statusLabel: "正常",
  minuteCalculation: { breakRule: "actual_rest_review", rawWorkMinutes: 600, unpaidBreakMinutes: 0, calculatedWorkMinutes: 600 } }] };
const bundle = await build({ stdin: { contents: `
  import React from 'react'; import {createRoot} from 'react-dom/client';
  import {PayrollAttendancePage} from './src/features/payroll/PayrollAttendancePage.jsx';
  import './src/styles/tokens.css';
  import './docs/prototypes/raw-material-roll-inventory-review/src/styles.css';
  import './src/styles/features/payroll-attendance.css';
  window.reviewWrites=[]; window.fixture=${JSON.stringify(fixture)}; window.attendance=${JSON.stringify(attendance)}; window.silkAttendance=${JSON.stringify(silkAttendance)};
  window.readApi=(name,input)=>{
    if(name==='getOfficePayrollWorkbench')return Promise.resolve({data:window.fixture});
    if(name==='getOfficeEmployeeAttendance')return Promise.resolve({data:input.employeeId==='EMP-SILK-UI'?window.silkAttendance:window.attendance});
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
  await page.getByLabel("复核日期").selectOption("2026-09-15");
  const facts = page.getByRole("definition");
  assert.equal(await facts.count(), 3);
  assert.deepEqual(await facts.allTextContents(), ["9.00小时", "0.50小时", "8.50小时"]);
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
  await page.getByRole("row", { name: /合成丝印员工/ }).click();
  await page.getByLabel("复核日期").selectOption("2026-09-15");
  assert.match(await page.getByLabel("复核日期").textContent(), /可按实休复核/);
  assert.deepEqual(await facts.allTextContents(), ["10.00小时", "不固定扣除", "10.00小时"]);
  assert.match(await form.textContent(), /丝印不固定扣 12:00—13:00/);
  assert.doesNotMatch(await form.textContent(), /已排除 12:00—13:00/);
  await form.screenshot({ path: resolve(output, "silk-actual-rest-1440.png") });
  await page.getByLabel("复核结果").selectOption("adjusted");
  await page.getByLabel("调整后工时").fill("9.58");
  assert.match(await form.textContent(), /实际工作与经复核的休息/);
  assert.match(await form.textContent(), /不预设休息 1 小时/);
  await form.screenshot({ path: resolve(output, "silk-manual-rest-1440.png") });
  assert.equal(await form.evaluate((node) => node.scrollWidth <= node.clientWidth), true);
  assert.equal(await page.evaluate(() => window.reviewWrites.length), 0);
  assert.deepEqual(errors, []);
  console.log(`Attendance lunch UI passed: ordinary 9h raw / 0.5h lunch / 8.5h proposed, normal silk-screen optional actual-rest review / no fixed deduction, legacy minutes untouched and no business writes. Screenshots: ${output}`);
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
