import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const statementPageSource = readFileSync(new URL("../src/features/statements/StatementPage.jsx", import.meta.url), "utf8");
const officePageSource = readFileSync(new URL("../src/pages/office/index.jsx", import.meta.url), "utf8");

assert.match(statementPageSource, /export function StatementPage/);
assert.match(statementPageSource, /from "\.\.\/\.\.\/components\/ui\.jsx"/);
for (const label of ["本期应收", "本期实收", "本期未收", "历史欠款", "累计欠款"]) {
  assert.equal(statementPageSource.includes(label), true, `statement page should retain ${label}`);
}
assert.match(officePageSource, /export \{ StatementPage \} from "\.\.\/\.\.\/features\/statements\/StatementPage\.jsx";/);
assert.doesNotMatch(officePageSource, /function StatementPage/);

console.log("Office statement page check passed: the feature is isolated and the five financial trust amounts remain visible.");
