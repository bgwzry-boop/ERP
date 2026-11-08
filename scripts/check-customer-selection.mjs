// 客户输入框：输入≠选中。只有唯一同名才自动认定真实客户；否则保留输入并提示未选中。
import assert from "node:assert/strict";
import { findSimilarCustomers, resolveCustomerSelection, resolveRecognizedCustomer } from "../docs/prototypes/raw-material-roll-inventory-review/src/customerSelection.js";

const huang = { customerId: "C-HUANG", name: "黄松" };
const other = { customerId: "C-OTHER", name: "黄松林" };

assert.equal(resolveCustomerSelection("黄松", [huang]).customer?.customerId, "C-HUANG", "只有唯一同名客户时应直接认定");
assert.equal(resolveCustomerSelection("黄松", [huang, other]).customer, null, "同名但还有相似客户时不得主观认定");
assert.deepEqual(resolveCustomerSelection("黄松", [huang, other]).candidates.map((item) => item.name), ["黄松", "黄松林"], "应把两个候选都给人选");
assert.deepEqual(resolveCustomerSelection(" 黄松 ", [huang]), { customer: huang, pendingName: "" }, "首尾空格不应影响");
assert.deepEqual(resolveCustomerSelection("黄松", []), { customer: null, pendingName: "黄松", candidates: [] }, "没有匹配必须保留输入并提示");
assert.equal(resolveCustomerSelection("黄松", [huang, { ...huang, customerId: "C-DUP" }]).customer, null, "重名不得自动认定");
assert.equal(resolveCustomerSelection("黄", [huang]).customer, null, "只写一半名字不得自动认定");
assert.deepEqual(resolveCustomerSelection("", [huang]), { customer: null, pendingName: "" }, "空输入什么都不做");
assert.notEqual(resolveCustomerSelection("黄松", [huang, other]).customer?.customerId, "C-OTHER", "不能误选相似名字");

// 识别文里带客户名：有档案直接关联，没档案把名字回填给人工确认。
assert.deepEqual(
  resolveRecognizedCustomer({ name: "黄松", customerId: "C-HUANG" }, null),
  { customer: { customerId: "C-HUANG", name: "黄松", selectionSource: "recognition" }, pendingName: "" },
  "识别到已有客户应直接关联",
);
assert.deepEqual(
  resolveRecognizedCustomer({ name: "黄松" }, null),
  { customer: null, pendingName: "黄松" },
  "识别到名字但无档案时回填名字，等人新建/选择",
);
assert.deepEqual(
  resolveRecognizedCustomer({ name: "黄松", customerId: "C-HUANG" }, { customerId: "C-MANUAL", name: "手动客户", selectionSource: "manual" }),
  { customer: { customerId: "C-MANUAL", name: "手动客户", selectionSource: "manual" }, pendingName: "" },
  "人工先选的客户不被识别结果覆盖",
);
assert.deepEqual(resolveRecognizedCustomer(null, null), { customer: null, pendingName: "" }, "没有客户名时保持空白待手选");

// 识别漏字时先给相似客户，而不是直接提示新建。
const directory = [{ customerId: "C-HUANG", name: "黄松" }, { customerId: "C-LIN", name: "黄松林" }, { customerId: "C-ZHANG", name: "张三服饰" }];
assert.deepEqual(findSimilarCustomers("黄", directory).map((item) => item.name), ["黄松", "黄松林"], "少写一个字时应列出相似客户");
assert.deepEqual(findSimilarCustomers("黄松", directory).map((item) => item.name), ["黄松", "黄松林"], "包含关系的也算相似");
assert.deepEqual(findSimilarCustomers("王五", directory), [], "完全不沾边才建议新建");
assert.deepEqual(findSimilarCustomers("", directory), [], "空名字不查");

console.log("Customer selection checks passed: exact unique name binds; ambiguous/missing keeps input with pending hint.");
