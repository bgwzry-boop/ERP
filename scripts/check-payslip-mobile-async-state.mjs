import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Release review 2026-11-03: on a slow network the September confirmation reply arrived after the
// worker switched to October, reloaded the page with September parameters and left the October
// payslip stuck on 「正在读取」. Real React lifetimes with deliberately reordered API promises.
const queue = [];
const names = ["getMyOfficeAttendance", "getMyOfficePayslip", "acknowledgeMyOfficePayslip"];
globalThis.__payslipTestApi = Object.fromEntries(names.map((name) => [name, (input) => new Promise((resolve) => queue.push({ name, input, resolve }))]));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const directory = await mkdtemp(join(tmpdir(), "erp-payslip-state-"));
try {
  const built = await build({ stdin: { contents: `
    import React from 'react';
    import { create, act } from 'react-test-renderer';
    import { EmployeeAttendanceMobilePage } from './src/features/payroll/EmployeeAttendanceMobilePage.jsx';
    export { create, act };
    export const element = props => <EmployeeAttendanceMobilePage {...props} />;
  `, resolveDir: process.cwd(), loader: "jsx" }, bundle: true, platform: "node", format: "cjs", jsx: "automatic", write: false, logLevel: "silent", plugins: [{ name: "isolated-payslip-api", setup(builder) {
    builder.onResolve({ filter: /^(react(?:\/.*)?|react-test-renderer)$/ }, (args) => ({ path: createRequire(import.meta.url).resolve(args.path), external: true }));
    builder.onResolve({ filter: /^@ant-design\/icons$/ }, () => ({ path: "icons", namespace: "payslip-test" }));
    builder.onLoad({ filter: /.*/, namespace: "payslip-test" }, () => ({ contents: ["CalendarOutlined", "CheckCircleOutlined", "ClockCircleOutlined", "FileDoneOutlined", "ReloadOutlined", "WarningOutlined"].map((name) => `export const ${name} = () => null;`).join("\n") }));
    builder.onLoad({ filter: /officeAttendancePayrollApiClient\.js$/ }, () => ({ contents: names.map((name) => `export const ${name} = input => globalThis.__payslipTestApi.${name}(input);`).join("\n") }));
  } }] });
  const file = join(directory, "test.cjs");
  await writeFile(file, built.outputFiles[0].text);
  const { create, act, element } = createRequire(import.meta.url)(file);
  let tree;
  const take = (name, predicate = () => true) => {
    const index = queue.findIndex((item) => item.name === name && predicate(item.input));
    assert.ok(index >= 0, `missing ${name}: ${JSON.stringify(queue.map((item) => ({ name: item.name, input: item.input })))}`);
    return queue.splice(index, 1)[0];
  };
  const settle = async (request, data) => act(async () => request.resolve({ blocked: false, data }));
  const host = (predicate) => tree.root.findAll((node) => typeof node.type === "string" && predicate(node));
  const nodeText = (node) => typeof node === "string" ? node : (node.children || []).map(nodeText).join("");
  const text = () => JSON.stringify(tree.toJSON());
  const attendance = (minutes) => ({ employee: { name: "合成员工", roleName: "制袋" }, summary: { totalWorkMinutes: minutes, attendanceDayCount: 1, pendingExceptionCount: 0 }, days: [] });
  const slip = (month, netWage) => ({ month, payslip: { payrollMonth: month, revision: 1, status: "paid", statusLabel: "已发放", paidAt: "", netWage, payableNow: netWage, insuranceDepositWithheld: 0, heldWage: 0, items: [{ label: "基础工资", amount: netWage }], adjustmentReason: "", acknowledgedAt: "" }, yearEndSettlement: { year: month.slice(0, 4), total: 0 } });
  const chooseMonth = async (month) => act(async () => host((node) => node.props["aria-label"] === "考勤月份")[0].props.onChange({ target: { value: month } }));

  await act(async () => { tree = create(element({ authState: { session: { accessToken: "worker" } }, currentUser: { userId: "U-WORKER" } })); });
  await settle(take("getMyOfficeAttendance"), attendance(60));
  await settle(take("getMyOfficePayslip"), { month: "2026-11", payslip: null, yearEndSettlement: { total: 0 } });

  await chooseMonth("2026-09");
  await settle(take("getMyOfficeAttendance", (input) => input.month === "2026-09"), attendance(600));
  await settle(take("getMyOfficePayslip", (input) => input.month === "2026-09"), slip("2026-09", 3000));
  assert.match(text(), /10\.00小时/);
  const confirmButton = host((node) => node.type === "button" && nodeText(node).includes("核对无误，确认工资条"))[0];
  assert.ok(confirmButton, "September confirm button");
  await act(async () => { confirmButton.props.onClick(); });
  const septemberAck = take("acknowledgeMyOfficePayslip");
  assert.deepEqual({ month: septemberAck.input.month, revision: septemberAck.input.revision, netWage: septemberAck.input.netWage }, { month: "2026-09", revision: 1, netWage: 3000 });

  await chooseMonth("2026-10");
  await settle(take("getMyOfficeAttendance", (input) => input.month === "2026-10"), attendance(1200));
  await settle(take("getMyOfficePayslip", (input) => input.month === "2026-10"), slip("2026-10", 4000));
  assert.match(text(), /20\.00小时/);

  // The September reply arrives late, after October is on screen.
  await act(async () => septemberAck.resolve({ blocked: false, data: { acknowledgement: { acknowledgedAt: "2026-10-05T02:00:00Z" } } }));
  assert.equal(queue.filter((item) => item.name !== "acknowledgeMyOfficePayslip").length, 0, `a late September reply must not reload anything: ${JSON.stringify(queue.map((item) => item.input))}`);
  assert.match(text(), /20\.00小时/, "October hours stay on screen");
  assert.doesNotMatch(text(), /10\.00小时/, "September hours never come back");
  assert.doesNotMatch(text(), /正在读取工资条/, "the October payslip is not stuck loading");
  assert.match(text(), /4,000\.00/);

  // A late read for an older month never overwrites the current one either.
  await chooseMonth("2026-08");
  const staleAttendance = take("getMyOfficeAttendance", (input) => input.month === "2026-08");
  const stalePayslip = take("getMyOfficePayslip", (input) => input.month === "2026-08");
  await chooseMonth("2026-10");
  await settle(take("getMyOfficeAttendance", (input) => input.month === "2026-10"), attendance(1200));
  await settle(take("getMyOfficePayslip", (input) => input.month === "2026-10"), slip("2026-10", 4000));
  await settle(staleAttendance, attendance(30));
  await settle(stalePayslip, slip("2026-08", 999));
  assert.match(text(), /20\.00小时/);
  assert.doesNotMatch(text(), /999\.00/);
  await act(async () => tree.unmount());
  console.log("Payslip mobile async checks passed: a late confirmation reply or stale read for another month never reloads or overwrites the month on screen.");
} finally {
  await rm(directory, { recursive: true, force: true });
}
