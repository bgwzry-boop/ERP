import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { searchGlobalDesktopRecords } from "../src/globalSearch.js";

const desktopData = {
  statements: [
    { customerId: "C003", customerName: "王五包装", settlementCycle: "现结", statementId: "ST-3" },
  ],
  orderLines: [
    { id: "ORD-0629-001-01", orderNo: "ORD-0629-001", customerId: "C001", customerName: "张三服饰", product: "空白袋", size: "30*38*10", color: "红色" },
    { id: "ORD-0629-001-02", orderNo: "ORD-0629-001", customerId: "C001", customerName: "张三服饰", product: "空白袋", size: "30*38*10", color: "黑色" },
    { id: "ORD-0629-002-01", orderNo: "ORD-0629-002", customerId: "C002", customerName: "李四电商", product: "服装店白袋", size: "25*32*10", color: "白色", printColor: "黄色" },
  ],
};

test("searching 张三 opens 张三服饰 in 客户档案 ahead of that customer's orders", () => {
  const results = searchGlobalDesktopRecords(desktopData, "张三");
  assert.equal(results[0].kind, "customer");
  assert.equal(results[0].navId, "customer-records");
  assert.equal(results[0].recordId, "C001");
  assert.equal(results[0].title, "张三服饰");
  assert.equal(results[0].query, "张三");
  assert.ok(results.slice(1).every((item) => item.kind === "order" && item.recordId.startsWith("ORD-0629-001")));
  assert.equal(results.some((item) => item.recordId === "ORD-0629-002-01"), false);
});

test("a statement-only customer is searchable even without an order line", () => {
  const [result] = searchGlobalDesktopRecords(desktopData, "王五");
  assert.equal(result.kind, "customer");
  assert.equal(result.recordId, "C003");
  assert.equal(result.title, "王五包装");
});

test("size, colour and order number search land on the matching order", () => {
  assert.equal(searchGlobalDesktopRecords(desktopData, "25*32")[0].recordId, "ORD-0629-002-01");
  assert.equal(searchGlobalDesktopRecords(desktopData, "黄色")[0].recordId, "ORD-0629-002-01");
  const byNumber = searchGlobalDesktopRecords(desktopData, "ORD-0629-002");
  assert.ok(byNumber.every((item) => item.recordId === "ORD-0629-002-01"));
  assert.equal(byNumber[0].navId, "order-pool");
  assert.equal(byNumber[0].query, "ORD-0629-002");
});

test("blank queries and unknown names return no results", () => {
  assert.deepEqual(searchGlobalDesktopRecords(desktopData, ""), []);
  assert.deepEqual(searchGlobalDesktopRecords(desktopData, "   "), []);
  assert.deepEqual(searchGlobalDesktopRecords(desktopData, "不存在的客户"), []);
});

test("hidden workbenches are omitted and the result list stays bounded", () => {
  const ordersOnly = searchGlobalDesktopRecords(desktopData, "张三", { allowedNavIds: ["order-pool"] });
  assert.ok(ordersOnly.length > 0);
  assert.ok(ordersOnly.every((item) => item.navId === "order-pool"));

  const many = {
    orderLines: Array.from({ length: 12 }, (_, index) => ({
      id: `ORD-${String(index).padStart(2, "0")}`,
      customerId: "C009",
      customerName: "红叶电商",
      product: "空白袋",
      size: "30*38*10",
      color: "红色",
    })),
  };
  assert.equal(searchGlobalDesktopRecords(many, "红叶", { limit: 8 }).length, 8);
});

test("the topbar search box submits into the customer archive and order pool", async () => {
  const [appSource, searchSource, workspaceSource] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/GlobalSearch.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/BusinessWorkspaces.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(appSource, /<GlobalSearch\b/);
  assert.match(appSource, /preserveWorkspaceFocus/);
  assert.match(searchSource, /placeholder="搜索 客户 \/ 订单 \/ 尺寸 \/ 颜色 \/ 单据"/);
  assert.match(searchSource, /searchGlobalDesktopRecords/);
  assert.match(searchSource, /onKeyDown/);
  assert.match(searchSource, /role="listbox"/);
  assert.match(searchSource, /value=\{query\}/);
  assert.match(workspaceSource, /useState\(focus\?\.query \|\| ""\)/);
  assert.match(workspaceSource, /useState\(focus\?\.recordId \|\| /);
});
