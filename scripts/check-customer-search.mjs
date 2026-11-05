// 负责人 2026-11-05：开单时客户整单选一次（必填），按名称、简称、联系人、电话找，选完带出联系人、电话、结算周期。
import assert from "node:assert/strict";
import { createCustomerAddressCommandService } from "../server/services/customerAddressCommandService.mjs";
import { handleMasterDataReadRoutes } from "../server/routes/masterDataReadRoutes.mjs";

const workspace = {
  customers: [
    { id: "C1", name: "宁晋华强超市", shortName: "华强", settlementCycle: "月结" },
    { id: "C2", name: "邢台强盛商贸", phone: "13900000002" },
    { id: "C3", name: "河渠小卖部", shortName: "小卖部", status: "停用" },
    { id: "C4", name: "大召村王记", contact: "王师傅", phone: "13700000004" },
  ],
  customerContacts: [{ customerId: "C1", contactName: "李姐", phone: "13800000001", isDefault: true }],
};
const service = createCustomerAddressCommandService({ buildOperationLog: () => ({}) });
const names = query => service.searchCustomers({ workspace, query }).response.items.map(item => item.customerId);

assert.deepEqual(names("").sort(), ["C1", "C2", "C4"], "empty search lists customers, not disabled ones");
assert.deepEqual(names("华强"), ["C1"]);
assert.deepEqual(names("强").sort(), ["C1", "C2"], "both match 强");
assert.deepEqual(names("宁晋"), ["C1"], "name prefix");
assert.deepEqual(names("李姐"), ["C1"], "by contact");
assert.deepEqual(names("1370000"), ["C4"], "by phone");
assert.deepEqual(names("王师傅"), ["C4"]);
assert.deepEqual(names("没有这个"), []);
const [first] = service.searchCustomers({ workspace, query: "华强" }).response.items;
assert.deepEqual(first, { customerId: "C1", name: "宁晋华强超市", shortName: "华强", settlementCycle: "月结", contactName: "李姐", phone: "13800000001" });
assert.equal(service.searchCustomers({ workspace, query: "", limit: 1 }).response.items.length, 1);
assert.equal(service.searchCustomers({ workspace, query: "", limit: 1 }).response.total, 3);

// Read route: only with order-draft permission.
const sent = [];
const call = (path, allowed = true) => handleMasterDataReadRoutes({
  url: new URL(`http://erp.test${path}`), response: {}, workspace, permissionContext: {},
  writeActionPermissions: { saveOrderDraft: "order.draft.save" },
  requireActionPermission: (_response, _context, permission) => { if (!allowed) sent.push({ status: 403, permission }); return allowed; },
  sendJson: (_response, status, body) => sent.push({ status, body }), sendNotFound: (_response, code) => sent.push({ status: 404, code }),
  customerAddressCommandService: service,
});
assert.equal(await call(`/api/master-data/customers?q=${encodeURIComponent("华强")}`), true);
assert.deepEqual([sent.at(-1).status, sent.at(-1).body.items.map(item => item.customerId)], [200, ["C1"]]);
await call("/api/master-data/customers?q=", false);
assert.deepEqual(sent.at(-1), { status: 403, permission: "order.draft.save" });

console.log("customer search ok: name, short name, contact and phone; disabled customers hidden; order-draft permission required.");
