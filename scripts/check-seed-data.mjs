import { loadSyntheticOfficeSeed } from "../server/seeds/syntheticOfficeSeed.mjs";
import { getEffectivePermissionsForUser } from "../server/authSeed.mjs";
import { getEffectivePermissions } from "../server/seedData.mjs";
import { systemV1ActionPermissions } from "../shared/auth/roleCatalog.js";
import { calculateLinePricing, p0BagPriceRows } from "../src/domain/priceTable.js";
import { resolveTodoReference } from "../server/services/todoReferenceService.mjs";

const workspace = loadSyntheticOfficeSeed();
const clonedWorkspace = loadSyntheticOfficeSeed();
const officePermissions = getEffectivePermissionsForUser("U-OFFICE-A");
const warehousePermissions = getEffectivePermissionsForUser("U-WAREHOUSE-A");
const financePermissions = getEffectivePermissionsForUser("U-FINANCE-A");
const managementPermissions = getEffectivePermissionsForUser("U-MANAGER-A");
const technicalPermissions = getEffectivePermissionsForUser("U-TECH-A");
const workshopPermissions = getEffectivePermissionsForUser("U-WORKSHOP-A");
const packingPermissions = getEffectivePermissionsForUser("U-PACKING-A");
const driverPermissions = getEffectivePermissionsForUser("U-DRIVER-A");
const printDriverPermissions = getEffectivePermissionsForUser("U-PRINT-DRIVER-A");
const officeSeedFixturePermissions = getEffectivePermissions("U-OFFICE-A", {
  runtimeUsers: [
    {
      userId: "U-OFFICE-A",
      identityKind: "seed_fixture",
      roles: ["management"],
      actionPermissions: ["statement.write_off"],
    },
  ],
});

const checks = [
  ["scenario", Boolean(workspace.scenario?.id)],
  ["customers", workspace.customers.length >= 12],
  ["orderLines", workspace.orderLines.length >= 30],
  ["inventories", workspace.inventories.length >= 10],
  ["orderDrafts", workspace.orderDrafts.length >= 1],
  ["todos", workspace.todos.length >= 8],
  ["fulfillments", workspace.fulfillments.length >= 8],
  ["statements", workspace.statements.length >= 6],
  ["sampleText", typeof workspace.sampleText === "string" && workspace.sampleText.length > 0],
  ["defaultSelections", Object.values(workspace.defaultSelections).every(Boolean)],
  ["todoExplicitReferences", workspace.todos.every((todo) => todo.ref && todo.refType && todo.refId === todo.ref)],
  ["todoReferenceIntegrity", workspace.todos.every((todo) => resolveTodoReference(workspace, todo).referenceStatus === "valid")],
  ["draftTodoTraceability", workspace.todos.some((todo) => todo.refType === "order_draft" && workspace.orderDrafts.some((draft) => draft.id === todo.refId))],
  ["cloneIsolation", workspace.orderLines !== clonedWorkspace.orderLines && workspace.orderLines[0] !== clonedWorkspace.orderLines[0]],
  [
    "officePermissions",
      officePermissions.actionPermissions.includes("order.draft.recognize") &&
      officePermissions.actionPermissions.includes("order.void") &&
      officePermissions.actionPermissions.includes("order.quantity.adjust") &&
      officePermissions.actionPermissions.includes("production.report.complete") &&
      officePermissions.actionPermissions.includes("packing.complete") &&
      officePermissions.actionPermissions.includes("fulfillment.dispatch.update") &&
      officePermissions.actionPermissions.includes("fulfillment.cancel") &&
      officePermissions.actionPermissions.includes("delivery.evidence.review") &&
      officePermissions.actionPermissions.includes("inventory.correction.create") &&
      !officePermissions.actionPermissions.some((permission) => permission.startsWith("system.v1_")),
  ],
  [
    "seedFixturePermissionIsolation",
    officeSeedFixturePermissions.roles.includes("office") &&
      !officeSeedFixturePermissions.roles.includes("management") &&
      officeSeedFixturePermissions.actionPermissions.includes("order.draft.recognize") &&
      !officeSeedFixturePermissions.actionPermissions.some((permission) => permission.startsWith("system.v1_")),
  ],
  [
    "technicalPermissions",
    technicalPermissions.roles.includes("technical_operations") &&
      systemV1ActionPermissions.every((permission) => technicalPermissions.actionPermissions.includes(permission)) &&
      !technicalPermissions.actionPermissions.includes("order.confirm") &&
      !technicalPermissions.actionPermissions.includes("statement.payment.record"),
  ],
  [
    "warehousePermissions",
      warehousePermissions.actionPermissions.includes("fulfillment.print") &&
      warehousePermissions.actionPermissions.includes("inventory.correction.create") &&
      warehousePermissions.actionPermissions.includes("packing.complete") &&
      !warehousePermissions.actionPermissions.includes("fulfillment.dispatch.update") &&
      !warehousePermissions.actionPermissions.includes("order.void") &&
      !warehousePermissions.actionPermissions.includes("order.quantity.adjust") &&
      !warehousePermissions.actionPermissions.includes("production.report.complete") &&
      !warehousePermissions.actionPermissions.includes("fulfillment.cancel") &&
      !warehousePermissions.actionPermissions.includes("statement.payment.record") &&
      !warehousePermissions.actionPermissions.includes("system.v1_field_evidence_intake.apply") &&
      !warehousePermissions.actionPermissions.includes("system.v1_field_evidence.validate") &&
      !warehousePermissions.actionPermissions.includes("system.v1_production_env.precheck") &&
      !warehousePermissions.actionPermissions.includes("system.v1_production_env_file_preview.precheck") &&
      !warehousePermissions.actionPermissions.includes("system.v1_persistence.precheck") &&
      !warehousePermissions.actionPermissions.includes("system.v1_attachment_retention.precheck") &&
      !warehousePermissions.actionPermissions.includes("system.v1_runtime_readiness.precheck") &&
      !warehousePermissions.actionPermissions.includes("system.v1_v2_boundary.precheck") &&
      !warehousePermissions.actionPermissions.includes("system.v1_release_candidate.refresh_precheck"),
  ],
  [
    "financePermissions",
    financePermissions.actionPermissions.includes("statement.payment.record") &&
      financePermissions.actionPermissions.includes("attachment.create") &&
      !financePermissions.actionPermissions.includes("order.draft.recognize"),
  ],
  [
    "managementPermissions",
    managementPermissions.actionPermissions.includes("order.void") &&
      managementPermissions.actionPermissions.includes("order.quantity.adjust") &&
      managementPermissions.actionPermissions.includes("production.report.complete") &&
      managementPermissions.actionPermissions.includes("packing.complete") &&
      managementPermissions.actionPermissions.includes("fulfillment.dispatch.update") &&
      managementPermissions.actionPermissions.includes("fulfillment.cancel") &&
      managementPermissions.actionPermissions.includes("delivery.evidence.review") &&
      managementPermissions.actionPermissions.includes("inventory.correction.confirm") &&
      managementPermissions.actionPermissions.includes("system.v1_field_evidence_intake.apply") &&
      managementPermissions.actionPermissions.includes("system.v1_field_evidence.validate") &&
      managementPermissions.actionPermissions.includes("system.v1_production_env.precheck") &&
      managementPermissions.actionPermissions.includes("system.v1_production_env_file_preview.precheck") &&
      managementPermissions.actionPermissions.includes("system.v1_persistence.precheck") &&
      managementPermissions.actionPermissions.includes("system.v1_attachment_retention.precheck") &&
      managementPermissions.actionPermissions.includes("system.v1_runtime_readiness.precheck") &&
      managementPermissions.actionPermissions.includes("system.v1_v2_boundary.precheck") &&
      managementPermissions.actionPermissions.includes("system.v1_release_candidate.refresh_precheck"),
  ],
  [
    "driverPermissions",
    driverPermissions.actionPermissions.includes("delivery.complete") &&
      driverPermissions.actionPermissions.includes("delivery.device_qa.record") &&
      driverPermissions.actionPermissions.includes("attachment.delivery_evidence.create") &&
      !driverPermissions.actionPermissions.includes("fulfillment.dispatch.update") &&
      !driverPermissions.actionPermissions.includes("delivery.evidence.review") &&
      !driverPermissions.actionPermissions.includes("statement.payment.record"),
  ],
  [
    "workshopPermissions",
    workshopPermissions.actionPermissions.includes("production.report.complete") &&
      workshopPermissions.actionPermissions.includes("attachment.finished_goods_photo.create") &&
      !workshopPermissions.actionPermissions.includes("packing.complete") &&
      !workshopPermissions.actionPermissions.includes("attachment.create") &&
      !workshopPermissions.actionPermissions.includes("order.void") &&
      !workshopPermissions.actionPermissions.includes("statement.payment.record"),
  ],
  [
    "packingPermissions",
    packingPermissions.actionPermissions.includes("packing.complete") &&
      !packingPermissions.actionPermissions.includes("production.report.complete") &&
      !packingPermissions.actionPermissions.includes("order.quantity.adjust") &&
      !packingPermissions.actionPermissions.includes("statement.payment.record"),
  ],
  [
    "printDriverPermissions",
    printDriverPermissions.actionPermissions.includes("print.job.callback") &&
      !printDriverPermissions.actionPermissions.includes("fulfillment.print") &&
      !printDriverPermissions.actionPermissions.includes("order.draft.recognize") &&
      !printDriverPermissions.actionPermissions.includes("statement.payment.record"),
  ],
  [
    "currentPriceTable20260703",
    calculateLinePricing({ size: "30*38*10", style: "空白袋", handle: "普通提", print: "否", qty: 500 }).amount === 170 &&
      calculateLinePricing({ size: "35*27*10", style: "空白袋", handle: "普通提", print: "是", printSide: "单面", qty: 1500 }).amount === 585 &&
      calculateLinePricing({ size: "30*38*10", style: "空白袋", handle: "普通提", print: "是", printSide: "双面", qty: 1000 }).amount === 470 &&
      p0BagPriceRows.some((row) => row.style === "覆膜" && row.size === "30*27*10" && row.metallicPrice === 0.63) &&
      p0BagPriceRows.some((row) => row.style === "小熊小狗" && row.size === "40*35*12" && row.normalPrice === 0.69),
  ],
];

const failed = checks.filter(([, passed]) => !passed).map(([name]) => name);
if (failed.length > 0) {
  throw new Error(`Seed data check failed: ${failed.join(", ")}`);
}

console.log(
  `Seed data check passed: ${workspace.customers.length} customers, ${workspace.orderLines.length} order lines, ${workspace.inventories.length} inventory rows`,
);
