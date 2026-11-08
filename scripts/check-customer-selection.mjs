// 客户输入框：输入≠选中。只有唯一同名才自动认定真实客户；否则保留输入并提示未选中。
import assert from "node:assert/strict";
import { resolveCustomerSelection } from "../docs/prototypes/raw-material-roll-inventory-review/src/customerSelection.js";

const huang = { customerId: "C-HUANG", name: "黄松" };
const other = { customerId: "C-OTHER", name: "黄松林" };

assert.deepEqual(resolveCustomerSelection("黄松", [huang, other]), { customer: huang, pendingName: "" }, "唯一同名应直接认定");
assert.deepEqual(resolveCustomerSelection(" 黄松 ", [huang]), { customer: huang, pendingName: "" }, "首尾空格不应影响");
assert.deepEqual(resolveCustomerSelection("黄松", []), { customer: null, pendingName: "黄松" }, "没有匹配必须保留输入并提示");
assert.deepEqual(resolveCustomerSelection("黄松", [huang, { ...huang, customerId: "C-DUP" }]), { customer: null, pendingName: "黄松" }, "重名不得自动认定");
assert.deepEqual(resolveCustomerSelection("黄", [huang]), { customer: null, pendingName: "黄" }, "模糊输入不得自动认定");
assert.deepEqual(resolveCustomerSelection("", [huang]), { customer: null, pendingName: "" }, "空输入什么都不做");
assert.notEqual(resolveCustomerSelection("黄松", [huang, other]).customer?.customerId, "C-OTHER", "不能误选相似名字");

console.log("Customer selection checks passed: exact unique name binds; ambiguous/missing keeps input with pending hint.");
