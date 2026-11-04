// 负责人 2026-11-04：一个客户可能有多个收货地址（比如同行让印完送到别的工厂）。
// 每张单送货时选这个客户已有的地址，或者本单另填一个地址；不选就用客户的默认地址。
export const DELIVERY_ADDRESS_MAX_LENGTH = 200;

// The customer's saved addresses plus any added since the customer list was built.
export function customerWithAddresses(workspace = {}, customer = {}) {
  const customerId = String(customer.id ?? customer.customerId ?? "").trim();
  const saved = Array.isArray(customer.addresses) ? customer.addresses : [];
  const known = new Set(saved.map((item) => String(item.addressId ?? item.id ?? "")));
  const added = (Array.isArray(workspace.customerAddresses) ? workspace.customerAddresses : [])
    .filter((item) => String(item.customerId ?? item.customer_id ?? "") === customerId && !known.has(String(item.addressId ?? item.id ?? "")));
  return { ...customer, addresses: [...saved, ...added] };
}

export function customerDeliveryAddresses(customer = {}) {
  return (Array.isArray(customer.addresses) ? customer.addresses : [])
    .map((item) => ({
      addressId: String(item.addressId ?? item.id ?? "").trim(),
      address: String(item.address ?? "").trim(),
      area: String(item.area ?? "").trim(),
      isDefault: item.isDefault === true,
      remark: String(item.remark ?? "").trim(),
    }))
    .filter((item) => item.addressId && item.address);
}

// Returns the address this line is delivered to, or an error message for an address that does
// not belong to the customer. Lines without a choice fall back to the customer's default.
export function resolveDeliveryAddress(customer = {}, line = {}) {
  const addresses = customerDeliveryAddresses(customer);
  const chosenId = String(line.deliveryAddressId ?? "").trim();
  const oneOff = String(line.deliveryAddress ?? "").replace(/\s+/gu, " ").trim();
  if (chosenId) {
    const match = addresses.find((item) => item.addressId === chosenId);
    if (!match) return { error: "所选送货地址不是这个客户的地址，请刷新后重新选择。" };
    return { address: match.address, addressId: match.addressId, source: "customer_address" };
  }
  if (oneOff) {
    if (oneOff.length > DELIVERY_ADDRESS_MAX_LENGTH) return { error: `本单送货地址最多 ${DELIVERY_ADDRESS_MAX_LENGTH} 个字。` };
    return { address: oneOff, addressId: "", source: "order_one_off" };
  }
  const fallback = addresses.find((item) => item.isDefault) ?? addresses[0];
  return fallback ? { address: fallback.address, addressId: fallback.addressId, source: "customer_default" } : { address: "", addressId: "", source: "none" };
}
