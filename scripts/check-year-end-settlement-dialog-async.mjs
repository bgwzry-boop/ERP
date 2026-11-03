import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Release review 2026-11-03: on a slow network the office switched the year-end settlement from
// 2024 to 2025, the late 2024 list replaced the page, and 「确认已发放」 then submitted 2024.
// Real React lifetimes with deliberately reordered API promises; no business writes.
const queue = [];
const names = ["getOfficeYearEndSettlement", "confirmOfficeYearEndSettlement"];
globalThis.__yearEndTestApi = Object.fromEntries(names.map((name) => [name, (input) => new Promise((resolve) => queue.push({ name, input, resolve }))]));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const directory = await mkdtemp(join(tmpdir(), "erp-year-end-state-"));
try {
  const built = await build({ stdin: { contents: `
    import React from 'react';
    import { create, act } from 'react-test-renderer';
    import { YearEndSettlementDialog } from './src/features/payroll/YearEndSettlementDialog.jsx';
    export { create, act };
    export const element = props => <YearEndSettlementDialog {...props} />;
  `, resolveDir: process.cwd(), loader: "jsx" }, bundle: true, platform: "node", format: "cjs", jsx: "automatic", write: false, logLevel: "silent", plugins: [{ name: "isolated-year-end-api", setup(builder) {
    builder.onResolve({ filter: /^(react(?:\/.*)?|react-test-renderer)$/ }, (args) => ({ path: createRequire(import.meta.url).resolve(args.path), external: true }));
    builder.onLoad({ filter: /officeAttendancePayrollApiClient\.js$/ }, () => ({ contents: names.map((name) => `export const ${name} = input => globalThis.__yearEndTestApi.${name}(input);`).join("\n") }));
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
  const list = (year, name, amount) => ({ year, confirmable: true, confirmableFrom: `${year + 1}-01-01`, previewDigest: `digest-${year}`, pendingCount: 1, pendingTotal: amount,
    rows: [{ employeeId: `E${year}`, name, heldWage: amount, insuranceDeposit: 0, depositForfeited: 0, payableAmount: amount, note: "", settledAt: "" }] });
  const chooseYear = async (year) => act(async () => host((node) => node.props["aria-label"] === "结算年份")[0].props.onChange({ target: { value: year } }));
  const fillReference = async (value) => act(async () => host((node) => node.props["aria-label"] === "年底结算付款凭证编号")[0].props.onChange({ target: { value } }));
  const confirmButton = () => host((node) => node.type === "button" && nodeText(node).includes("确认已发放年底结算"))[0];

  await act(async () => { tree = create(element({ authState: { session: { accessToken: "office" } }, operatorId: "U-BOSS", canConfirm: true, onClose: () => {} })); });
  const initial = take("getOfficeYearEndSettlement");
  await chooseYear("2024");
  const slow2024 = take("getOfficeYearEndSettlement", (input) => input.year === "2024");
  await chooseYear("2025");
  const read2025 = take("getOfficeYearEndSettlement", (input) => input.year === "2025");
  await settle(read2025, list(2025, "二五年员工", 5000));
  assert.match(text(), /二五年员工/);

  // The 2024 list and the initial read arrive late; neither may replace 2025.
  await settle(slow2024, list(2024, "二四年员工", 952));
  await settle(initial, list(Number(initial.input.year), "初始年份员工", 1));
  assert.match(text(), /二五年员工/, "2025 stays on screen");
  assert.doesNotMatch(text(), /二四年员工|初始年份员工/, "a late list for another year never shows");

  await fillReference("YE-2025-01");
  await act(async () => { confirmButton().props.onClick(); });
  const confirm2025 = take("confirmOfficeYearEndSettlement");
  assert.deepEqual({ year: confirm2025.input.year, previewDigest: confirm2025.input.previewDigest }, { year: 2025, previewDigest: "digest-2025" },
    "the confirmation is for the year on screen");

  // A reply whose year does not match what was asked is never shown or confirmable.
  await settle(confirm2025, { settlements: [] });
  const reload2025 = take("getOfficeYearEndSettlement", (input) => input.year === "2025");
  await settle(reload2025, list(2024, "错年回包", 952));
  assert.doesNotMatch(text(), /错年回包/);
  assert.equal(confirmButton(), undefined, "nothing can be confirmed while the shown year is unknown");

  // A confirmation reply that arrives after switching years reloads nothing for the old year.
  await chooseYear("2025 ");
  await settle(take("getOfficeYearEndSettlement", (input) => input.year === "2025 "), list(2025, "二五年员工", 5000));
  await fillReference("YE-2025-02");
  await act(async () => { confirmButton().props.onClick(); });
  const lateConfirm = take("confirmOfficeYearEndSettlement");
  assert.equal(lateConfirm.input.year, 2025);
  assert.equal(host((node) => node.props["aria-label"] === "结算年份")[0].props.disabled, true, "the year cannot change while confirming");
  await settle(lateConfirm, { settlements: [] });
  await settle(take("getOfficeYearEndSettlement", (input) => input.year === "2025 "), { ...list(2025, "二五年员工", 5000), pendingCount: 0, rows: [] });
  assert.equal(queue.length, 0, `no stray reads: ${JSON.stringify(queue.map((item) => item.input))}`);
  console.log("Year-end settlement dialog: late lists for another year never replace the year on screen, and 「确认已发放」 always submits the year shown.");
} finally {
  await rm(directory, { recursive: true, force: true });
}
