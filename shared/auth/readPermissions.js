// Explicit read capabilities participate in the same allow/deny catalog as writes.
const officeReads = ["order.read", "production.read", "production.read.all", "packing.read", "packing.read.all", "inventory.read", "fulfillment.read", "todo.read", "raw_material.inbound.read", "raw_material.stock.read", "raw_material.accounting.read", "print.read", "audit.read", "office.workspace.read"];
export const roleReadPermissions = Object.freeze({
  office: officeReads,
  management: [...officeReads, "system.read"],
  finance: ["order.read", "inventory.read", "fulfillment.read", "todo.read", "raw_material.inbound.read", "raw_material.stock.read", "raw_material.accounting.read"],
  warehouse: ["inventory.read", "fulfillment.read", "packing.read", "raw_material.stock.read", "print.read"],
  workshop: ["production.read", "raw_material.stock.read"],
  packing: ["packing.read", "raw_material.stock.read"],
  technical_operations: ["system.read"],
});
