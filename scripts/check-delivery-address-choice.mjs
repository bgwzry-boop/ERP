import assert from "node:assert/strict";
import { customerDeliveryAddresses, resolveDeliveryAddress } from "../shared/deliveryAddress.js";

// 负责人 2026-11-04：一个客户可能有多个收货地址（同行让印完送到别的工厂）。
const customer = {
  id: "C1",
  contact: "张老板",
  phone: "13900000001",
  addresses: [
    { addressId: "A1", address: "虎门大道 36 号", isDefault: true },
    { addressId: "A2", address: "厚街镇某村 8 号 李记制袋厂", remark: "常送这里" },
    { addressId: "", address: "无编号的地址会被忽略" },
  ],
};
assert.deepEqual(customerDeliveryAddresses(customer).map((item) => item.addressId), ["A1", "A2"]);
assert.deepEqual(resolveDeliveryAddress(customer, {}), { address: "虎门大道 36 号", addressId: "A1", source: "customer_default" });
assert.deepEqual(resolveDeliveryAddress(customer, { deliveryAddressId: "A2" }), { address: "厚街镇某村 8 号 李记制袋厂", addressId: "A2", source: "customer_address" });
assert.deepEqual(resolveDeliveryAddress(customer, { deliveryAddress: "  长安镇  某工业区 3 栋 " }), { address: "长安镇 某工业区 3 栋", addressId: "", source: "order_one_off" });
assert.match(resolveDeliveryAddress(customer, { deliveryAddressId: "OTHER-CUSTOMER" }).error, /不是这个客户的地址/);
assert.match(resolveDeliveryAddress(customer, { deliveryAddress: "长".repeat(201) }).error, /200/);
assert.deepEqual(resolveDeliveryAddress({ addresses: [] }, {}), { address: "", addressId: "", source: "none" });

// The confirm command freezes the chosen address on the fulfillment; the driver task reads it there.
const { createOrderDraftCommandService } = await import("../server/services/orderDraftCommandService.mjs");
const source = (await import("node:fs")).readFileSync(new URL("../server/services/orderDraftCommandService.mjs", import.meta.url), "utf8");
assert.equal((source.match(/customerSnapshot: buildFulfillmentCustomerSnapshot\(workspace, fulfillment, (confirmation\.)?newLines\)/g) ?? []).length, 2, "normal and split confirmation both freeze the address");
assert.equal((source.match(/findDeliveryAddressError\(workspace, cancellationResolution\.activeLines\)/g) ?? []).length, 2, "both reject another customer's address before writing");
assert.equal(typeof createOrderDraftCommandService, "function");
const driverSource = (await import("node:fs")).readFileSync(new URL("../server/driverDeliveryTaskReadRepository.mjs", import.meta.url), "utf8");
assert.match(driverSource, /customer_snapshot->>'\$\{key\}'/, "the driver task prefers the address frozen on the fulfillment");
console.log("Delivery address choice: customer default, another saved address or a one-off address per order; another customer's address is refused.");

// Read route: the office sees the customer's addresses only with order-draft permission.
{
  const { handleMasterDataReadRoutes } = await import("../server/routes/masterDataReadRoutes.mjs");
  const sent = [];
  const call = (path, allowed = true) => handleMasterDataReadRoutes({
    url: new URL(`http://erp.test${path}`), response: {}, workspace: { customers: [customer] }, permissionContext: {},
    writeActionPermissions: { saveOrderDraft: "order.draft.save" },
    requireActionPermission: (_response, _context, permission) => { if (!allowed) sent.push({ status: 403, permission }); return allowed; },
    sendJson: (_response, status, body) => sent.push({ status, body }), sendNotFound: (_response, code) => sent.push({ status: 404, code }),
  });
  assert.equal(await call("/api/master-data/customers/C1/delivery-addresses"), true);
  assert.deepEqual([sent.at(-1).status, sent.at(-1).body.defaultAddressId, sent.at(-1).body.addresses.length], [200, "A1", 2]);
  await call("/api/master-data/customers/NOPE/delivery-addresses");
  assert.deepEqual(sent.at(-1), { status: 404, code: "CUSTOMER_NOT_FOUND" });
  await call("/api/master-data/customers/C1/delivery-addresses", false);
  assert.deepEqual(sent.at(-1), { status: 403, permission: "order.draft.save" });
}

// 负责人 2026-11-04：客户资料不指望一步填齐，地址可以开单时、办公室事后、送货时补充。
{
  const { createCustomerAddressCommandService } = await import("../server/services/customerAddressCommandService.mjs");
  const { createLocalMasterDataImportTransactionRepository } = await import("../server/masterDataImportTransactionRepository.mjs");
  const service = createCustomerAddressCommandService({ buildOperationLog: (_workspace, input) => ({ id: `LOG-${input.action}-${Math.random()}`, ...input }) });
  const workspace = { customers: [{ id: "C9", name: "李记制袋", addresses: [] }], customerAddresses: [], operationLogs: [],
    masterDataImportTransactionRepository: createLocalMasterDataImportTransactionRepository() };
  const first = await service.addDeliveryAddress({ workspace, customerId: "C9", body: { address: " 厚街镇  某村 8 号 ", source: "order_entry" }, operatorId: "U-OFFICE-A" });
  assert.equal(first.statusCode, 201, JSON.stringify(first));
  assert.deepEqual([first.response.address.address, first.response.address.isDefault, first.response.address.remark], ["厚街镇 某村 8 号", true, "开单时补充"], "the first address becomes the default");
  assert.equal(workspace.customerAddresses.length, 1, "saved into the customer's addresses");
  const again = await service.addDeliveryAddress({ workspace, customerId: "C9", body: { address: "厚街镇某村8号" }, operatorId: "U-OFFICE-A" });
  assert.deepEqual([again.statusCode, again.response.created, again.response.address.addressId], [200, false, first.response.address.addressId], "the same address typed again is not added twice");
  const second = await service.addDeliveryAddress({ workspace, customerId: "C9", body: { address: "长安镇某工业区 3 栋" }, operatorId: "U-OFFICE-A" });
  assert.equal(second.response.address.isDefault, false);
  assert.deepEqual(customerDeliveryAddresses((await import("../shared/deliveryAddress.js")).customerWithAddresses(workspace, workspace.customers[0])).length, 2);
  assert.equal((await service.addDeliveryAddress({ workspace, customerId: "NOPE", body: { address: "某地" } })).notFound, true);
  assert.equal((await service.addDeliveryAddress({ workspace, customerId: "C9", body: { address: "x" } })).code, "CUSTOMER_ADDRESS_REQUIRED");
}
console.log("Customer addresses can be added later (order entry, office, delivery) without duplicates.");
