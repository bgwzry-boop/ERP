// 负责人 2026-11-05：开单时客户整单选一次（必填），按名称、简称、联系人、电话找，选完带出联系人、电话、结算周期。
import assert from "node:assert/strict";
import { createCustomerAddressCommandService } from "../server/services/customerAddressCommandService.mjs";
import { paginate } from "../server/seedData.mjs";
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
const service = createCustomerAddressCommandService({ buildOperationLog: (_workspace, log) => log });
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
  paginate, writeActionPermissions: { saveOrderDraft: "order.draft.save", createMasterDataImportConfirmationPlan: "master_data.import.plan.create" },
  requireActionPermission: (_response, _context, permission) => { if (!allowed) sent.push({ status: 403, permission }); return allowed; },
  sendJson: (_response, status, body) => sent.push({ status, body }), sendNotFound: (_response, code) => sent.push({ status: 404, code }),
  customerAddressCommandService: service,
});
assert.equal(await call(`/api/master-data/customers?q=${encodeURIComponent("华强")}`), true);
assert.deepEqual([sent.at(-1).status, sent.at(-1).body.items.map(item => item.customerId)], [200, ["C1"]]);
await call("/api/master-data/customers?q=", false);
assert.deepEqual(sent.at(-1), { status: 403, permission: "order.draft.save" });

await call("/api/master-data/customer-records?page=2&pageSize=2");
assert.deepEqual(sent.at(-1).body.items.map(({customerId, enabled}) => [customerId, enabled]), [["C3", false], ["C4", true]]);
assert.equal(sent.at(-1).body.total, 4);
await call("/api/master-data/customer-records", false);
assert.deepEqual(sent.at(-1), { status: 403, permission: "master_data.import.plan.create" });

console.log("customer search ok: name, short name, contact and phone; disabled customers hidden; order-draft permission required.");

// 开单时直接新建客户：名称必填，电话、地址可不填；同名不重复建。
{
  const applied = [];
  const store = { customers: [...workspace.customers], customerContacts: [...workspace.customerContacts], customerAddresses: [] };
  const ws = {
    ...store,
    masterDataImportTransactionRepository: {
      kind: "local_transaction",
      async applyImportExecution({ importExecution, operationLog }) {
        applied.push({ importExecution, operationLog });
        const records = importExecution.importPayload.targetRecords;
        for (const key of ["customers", "customerContacts", "customerAddresses"]) ws[key].push(...(records[key] ?? []));
        return { operationLogId: "LOG-1" };
      },
    },
  };
  const create = body => service.createCustomer({ workspace: ws, body, operatorId: "U-OFFICE-A" });
  assert.equal((await create({ name: "" })).code, "CUSTOMER_NAME_INVALID");
  assert.equal((await create({ name: "张大姐", phone: "abc" })).code, "CUSTOMER_PHONE_INVALID");
  const made = await create({ name: " 张大姐 ", phone: "13600000009", address: "宁晋县河渠镇大召村东头" });
  assert.equal(made.statusCode, 201);
  assert.equal(made.response.customer.name, "张大姐");
  assert.match(made.response.customer.customerId, /^C-[0-9A-F]{8}$/);
  const records = applied[0].importExecution.importPayload.targetRecords;
  assert.equal(records.customers[0].settlementCycle, "未设置");
  assert.deepEqual([records.customerContacts[0].phone, records.customerContacts[0].isDefault], ["13600000009", true]);
  assert.deepEqual([records.customerAddresses[0].address, records.customerAddresses[0].isDefault, records.customerAddresses[0].contactId], ["宁晋县河渠镇大召村东头", true, records.customerContacts[0].id]);
  assert.equal(applied[0].operationLog.action, "create_customer");
  const again = await create({ name: "张大姐" });
  assert.deepEqual([again.statusCode, again.response.code, again.response.customer.customerId], [409, "CUSTOMER_NAME_EXISTS", made.response.customer.customerId], "same name is not created twice");
  assert.equal(applied.length, 1);
  const nameOnly = await create({ name: "李哥" });
  assert.equal(nameOnly.statusCode, 201);
  assert.deepEqual(Object.keys(applied[1].importExecution.importPayload.targetRecords), ["customers"], "name only: no empty contact or address rows");
  assert.deepEqual(service.searchCustomers({ workspace: ws, query: "张大姐" }).response.items.map(item => item.phone), ["13600000009"], "the new customer is found right away");
  console.log("create customer ok: name required, phone/address optional, same name returns the existing customer.");
}

// 消息开头或结尾写的客户名字。
{
  const { detectMessageCustomer } = await import("../shared/orderMessageCustomer.js");
  const customers = [{ id: "C1", name: "宁晋华强超市", shortName: "华强" }, { id: "C3", name: "王五包装" }];
  assert.deepEqual(detectMessageCustomer("王五包装 30*38红5000个 明天自提", customers), { name: "王五包装", customerId: "C3", matchedText: "王五包装" });
  assert.equal(detectMessageCustomer("你好老板\n30*38红5000个\n35*27黄2000个\n华强", customers).customerId, "C1", "name on the last line");
  assert.equal(detectMessageCustomer("30*38红5000个 明天自提 王五", customers).customerId, "C3", "name after the quantities on one line");
  assert.deepEqual(detectMessageCustomer("张大姐\n30*38白1000个 送货", customers), { name: "张大姐", customerId: "" }, "unknown name: offered for a new customer");
  assert.equal(detectMessageCustomer("30*38红5000个\n35*27黄2000个", customers), null, "no name written");
  assert.equal(detectMessageCustomer("老板 30*38 白 3000个 印刷 明天要", customers), null, "greetings are not names");
  const similar = [{ id: "HS", name: "黄松" }, { id: "HSL", name: "黄松林" }];
  for (const source of ["3037 红500个黄松", "3037 红500 个 黄松", "3037 红500 个 黄松林"]) {
    assert.equal(detectMessageCustomer(source, similar).customerId, source.endsWith("林") ? "HSL" : "HS", source);
  }
  const company = [{ id: "HS", name: "东莞市黄松包装有限公司", shortName: "黄松" }];
  assert.equal(detectMessageCustomer("3037 红500个黄松", company).customerId, "HS");
  const ambiguous = [...company, { id: "HS2", name: "黄松商贸", shortName: "黄松" }];
  assert.equal(detectMessageCustomer("3037 红500个黄松", ambiguous).customerId, "");
  assert.equal(detectMessageCustomer("3037 红500个黄松", ambiguous).ambiguous.length, 2);
  console.log("message customer ok: name at the start or end of the message.");
}
