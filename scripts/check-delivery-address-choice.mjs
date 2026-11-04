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
