import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const statementPageSource = readFileSync(new URL("../src/features/statements/StatementPage.jsx", import.meta.url), "utf8");
const officePageSource = readFileSync(new URL("../src/pages/office/index.jsx", import.meta.url), "utf8");
const statementStyleSource = readFileSync(new URL("../src/styles/features/statements.css", import.meta.url), "utf8");

assert.match(statementPageSource, /export function StatementPage/);
assert.match(statementPageSource, /from "\.\.\/\.\.\/shared\/ui\/operational\.jsx"/);
assert.match(statementPageSource, /<FilterBar/);
assert.match(statementPageSource, /<OperationalPanel/);
assert.match(statementPageSource, /\?\? filtered\[0\] \?\? null/);
assert.match(statementPageSource, /aria-label="对账快捷范围"/);
assert.match(statementPageSource, /aria-label="对账客户或单号"/);
assert.match(statementPageSource, /aria-label="对账范围"/);
assert.match(statementPageSource, /className="statement-detail-scroll"/);
assert.match(statementPageSource, /className="statement-facts"/);
assert.match(statementPageSource, /STATEMENT_ACTIONS_BY_TAB/);
assert.match(statementPageSource, /本期未收.*历史欠款.*累计待收/);
for (const label of ["本期应收", "本期实收", "本期未收", "历史欠款", "累计欠款"]) {
  assert.equal(statementPageSource.includes(label), true, `statement page should retain ${label}`);
}
for (const label of ["确认财务经营决定", "处理结果", "处理说明", "业务决定人", "系统操作人", "决定渠道 / 时间", "决定内容", "授权依据", "预计影响"]) {
  assert.equal(statementPageSource.includes(label), true, `statement decision confirmation should retain ${label}`);
}
assert.match(statementPageSource, /formatBusinessDecisionChannelAndTime/);
for (const selector of [".statement-quick-filters", ".statement-detail-overview", ".statement-detail-scroll", ".statement-facts", ".statement-actions"]) {
  assert.equal(statementStyleSource.includes(selector), true, `statement styles should own ${selector}`);
}
assert.match(statementStyleSource, /\.statement-actions\s*\{[\s\S]*?position: static;/);
assert.match(statementStyleSource, /@media \(max-width: 1100px\)/);
assert.match(officePageSource, /export \{ StatementPage \} from "\.\.\/\.\.\/features\/statements\/StatementPage\.jsx";/);
assert.doesNotMatch(officePageSource, /function StatementPage/);

console.log("Office statement page check passed: customer filters, five financial trust amounts, independent detail scrolling, and tab-scoped actions remain visible.");
