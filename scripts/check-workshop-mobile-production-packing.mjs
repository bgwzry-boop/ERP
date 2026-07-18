import {
  canUseUiAction,
  getSeedPermissionContext,
  getUiActionState,
} from "../src/auth/seedPermissions.js";
import {
  createLocalSeedAuthState,
} from "../src/services/officeAuthService.js";
import {
  createFinishedGoodsPhotoAttachmentInput,
} from "../src/services/officeAttachmentApiClient.js";
import {
  completeOfficePackingTask,
  listOfficeProductionTasks,
  reportOfficeProductionDailyProgress,
  reportOfficeProductionComplete,
  uploadOfficeProductionFinishedGoodsPhoto,
} from "../src/services/officeProductionPackingApiClient.js";
import {
  authenticatePrototypeSeedUser,
  getEffectivePermissionsForUser,
} from "../server/authSeed.mjs";

const productionLine = {
  id: "ORD-0629-003-01",
  customerId: "C004",
  product: "美的空调",
  size: "30*38*10",
  color: "白色",
  handle: "普通提",
  style: "空白袋",
  qty: 1000,
  print: "是",
  printColor: "黄色",
  printSide: "双面",
  status: "制袋中",
  fulfillment: "快递快运",
};
const inventoryItem = {
  id: "30*38*10-白色-普通提-空白袋-待快运区",
  size: "30*38*10",
  color: "白色",
  handle: "普通提",
  style: "空白袋",
  zone: "待快运区",
};
const packingTask = {
  packingTaskId: "PKT-ORD-0629-003-01",
  orderLineId: productionLine.id,
  plannedQty: 1000,
  packageCount: 3,
  status: "待打包",
};

const workshopLogin = authenticatePrototypeSeedUser("U-WORKSHOP-A");
const packingLogin = authenticatePrototypeSeedUser("U-PACKING-A");
assert(workshopLogin.authenticated === true, "workshop backend seed login failed");
assert(packingLogin.authenticated === true, "packing backend seed login failed");

const workshopPermissions = getSeedPermissionContext("U-WORKSHOP-A");
const packingPermissions = getSeedPermissionContext("U-PACKING-A");
const workshopServerPermissions = getEffectivePermissionsForUser("U-WORKSHOP-A");
const packingServerPermissions = getEffectivePermissionsForUser("U-PACKING-A");

assert(canUseUiAction(workshopPermissions, "workshopMobile", "报工完成"), "workshop user cannot use mobile production report action");
assert(canUseUiAction(workshopPermissions, "workshopMobile", "报当日数量"), "workshop user cannot use mobile daily progress action");
assert(canUseUiAction(workshopPermissions, "workshopMobile", "上传成品图"), "workshop user cannot use mobile finished-goods photo upload action");
assert(!canUseUiAction(workshopPermissions, "workshopMobile", "提交打包完成"), "workshop user should not complete packing");
assert(getUiActionState(workshopPermissions, "workshopMobile", "提交打包完成").permissionKey === "packing.complete", "workshop mobile packing denial is not surfaced");
assert(canUseUiAction(packingPermissions, "workshopMobile", "提交打包完成"), "packing user cannot use mobile packing action");
assert(!canUseUiAction(packingPermissions, "workshopMobile", "报工完成"), "packing user should not complete production report");
assert(!canUseUiAction(packingPermissions, "workshopMobile", "上传成品图"), "packing user should not upload workshop finished-goods photos");
assert(workshopServerPermissions.actionPermissions.includes("production.report.complete"), "backend workshop role lacks production report permission");
assert(!workshopServerPermissions.actionPermissions.includes("packing.complete"), "backend workshop role should not include packing permission");
assert(packingServerPermissions.actionPermissions.includes("packing.complete"), "backend packing role lacks packing permission");
assert(!packingServerPermissions.actionPermissions.includes("production.report.complete"), "backend packing role should not include production report permission");

const taskListCalls = [];
const taskListResult = await listOfficeProductionTasks(
  {
    authState: createLocalSeedAuthState("U-WORKSHOP-A"),
    query: { visibility: "workshop_mobile", machineId: "BAG-01", status: "open", pageSize: 200 },
    operatorId: "U-WORKSHOP-A",
  },
  {
    fetchImpl: async (url, init) => {
      taskListCalls.push({ url, init });
      return createJsonResponse(200, {
        items: [
          {
            productionTaskId: "PT-ORD-0629-003-01",
            orderLineId: productionLine.id,
            productionTask: {
              productionTaskId: "PT-ORD-0629-003-01",
              orderLineId: productionLine.id,
              taskType: "制袋",
              machineId: "BAG-01",
              publishedScheduleId: "SCH-WORKSHOP-BAG-01",
              plannedQty: 1000,
              taskStatus: "制袋中",
            },
            orderLine: {
              orderLineId: productionLine.id,
              productName: productionLine.product,
              size: productionLine.size,
              bagColor: productionLine.color,
              handleType: productionLine.handle,
              style: productionLine.style,
              originalQty: 1000,
              lineStatus: "制袋中",
            },
          },
        ],
        page: 1,
        pageSize: 200,
        total: 1,
      });
    },
  },
);
assert(taskListResult.source === "api", "workshop production task list should use API");
assert(taskListCalls[0]?.url.includes("visibility=workshop_mobile"), "workshop production task list did not request workshop visibility");
assert(taskListCalls[0]?.url.includes("machineId=BAG-01"), "workshop production task list did not request current machine");
assert(taskListCalls[0]?.url.includes("status=open"), "workshop production task list did not request open tasks");
assert(taskListResult.items[0]?.productionTask?.publishedScheduleId === "SCH-WORKSHOP-BAG-01", "workshop task list did not preserve published schedule");

const finishedGoodsPhotoFile = {
  name: "workshop-finished-goods-check.jpg",
  type: "image/jpeg",
  size: 128,
  contentDataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w==",
};
const finishedGoodsAttachmentInput = createFinishedGoodsPhotoAttachmentInput({
  productionTaskId: "PT-ORD-0629-003-01",
  orderLine: productionLine,
  operatorId: "U-WORKSHOP-A",
  remark: "车间手机端上传成品图",
  file: finishedGoodsPhotoFile,
});
assert(finishedGoodsAttachmentInput.ownerType === "production_task", "finished-goods photo owner type is incorrect");
assert(finishedGoodsAttachmentInput.purpose === "finished_goods_photo", "finished-goods photo purpose is incorrect");
assert(finishedGoodsAttachmentInput.fileName === finishedGoodsPhotoFile.name, "finished-goods photo file name was not preserved");
assert(finishedGoodsAttachmentInput.contentDataUrl === finishedGoodsPhotoFile.contentDataUrl, "finished-goods photo data URL was not preserved");

const finishedPhotoUploadCalls = [];
const finishedPhotoUploadResult = await uploadOfficeProductionFinishedGoodsPhoto(
  {
    authState: createLocalSeedAuthState("U-WORKSHOP-A"),
    orderLine: productionLine,
    productionTaskId: "PT-ORD-0629-003-01",
    attachmentId: "ATT-WORKSHOP-FINISHED-001",
    fileName: finishedGoodsPhotoFile.name,
    operatorId: "U-WORKSHOP-A",
    remark: "车间手机端上传成品图",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      finishedPhotoUploadCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        productionTaskId: "PT-ORD-0629-003-01",
        orderLineId: productionLine.id,
        finishedGoodsPhoto: {
          status: "待确认",
          required: true,
          attachmentId: "ATT-WORKSHOP-FINISHED-001",
          fileName: finishedGoodsPhotoFile.name,
          uploadedBy: "U-WORKSHOP-A",
          uploadedAt: "2026-07-03T10:30:00.000Z",
        },
        customerNotificationTodoCreated: false,
        inventoryCreated: false,
        reservationCreated: false,
        packingTaskCreated: false,
        operationLogId: "LOG-WORKSHOP-FINISHED-PHOTO",
      });
    },
  },
);
assert(finishedPhotoUploadResult.source === "api", "mobile finished-goods photo upload did not use API");
assert(finishedPhotoUploadCalls[0]?.url.includes("/production-tasks/PT-ORD-0629-003-01/finished-goods-photo"), "mobile finished-goods photo upload URL is incorrect");
assert(finishedPhotoUploadCalls[0]?.init.headers["x-erp-user-id"] === "U-WORKSHOP-A", "mobile finished-goods photo upload did not send workshop user header");
assert(finishedPhotoUploadCalls[0]?.body.attachmentId === "ATT-WORKSHOP-FINISHED-001", "mobile finished-goods photo upload did not send attachment ID");
assert(finishedPhotoUploadCalls[0]?.body.remark.includes("车间手机端"), "mobile finished-goods photo upload remark did not identify mobile entry");
assert(finishedPhotoUploadResult.finishedGoodsPhoto?.status === "待确认", "mobile finished-goods photo upload status was not mapped");
assert(finishedPhotoUploadResult.inventoryCreated === false, "mobile finished-goods photo upload must not create inventory");
assert(finishedPhotoUploadResult.reservationCreated === false, "mobile finished-goods photo upload must not reserve inventory");
assert(finishedPhotoUploadResult.packingTaskCreated === false, "mobile finished-goods photo upload must not create packing task");

const dailyProgressCalls = [];
const dailyProgressResult = await reportOfficeProductionDailyProgress(
  {
    authState: createLocalSeedAuthState("U-WORKSHOP-A"),
    orderLine: productionLine,
    dailyQualifiedQty: 420,
    exceptionQty: 3,
    machineCount: 820,
    operatorId: "U-WORKSHOP-A",
    remark: "车间手机端提交跨日当日报数",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      dailyProgressCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        productionTaskId: "PT-ORD-0629-003-01",
        reportId: "WDP-PT-ORD-0629-003-01-MOBILE",
        orderLineId: productionLine.id,
        status: "跨日继续",
        taskStatus: "跨日继续",
        plannedQty: 1000,
        progressDate: "2026-07-03",
        dailyQualifiedQty: 420,
        previousQualifiedQty: 0,
        cumulativeQualifiedQty: 420,
        remainingQty: 580,
        carryOver: true,
        nextWorkDate: "2026-07-04",
        machineCount: 820,
        machineCountAffectsInventory: false,
        inventoryCreated: false,
        reservationCreated: false,
        packingTaskCreated: false,
        operationLogId: "LOG-WDP-MOBILE",
      });
    },
  },
);
assert(dailyProgressResult.source === "api", "mobile daily progress did not use API");
assert(dailyProgressCalls[0]?.url.includes("/production-tasks/PT-ORD-0629-003-01/daily-progress"), "mobile daily progress did not call daily-progress endpoint");
assert(dailyProgressCalls[0]?.init.headers["x-erp-user-id"] === "U-WORKSHOP-A", "mobile daily progress did not send workshop user header");
assert(dailyProgressCalls[0]?.body.dailyQualifiedQty === 420, "mobile daily progress did not send daily quantity");
assert(dailyProgressCalls[0]?.body.machineCount === 820, "mobile daily progress did not send machine count");
assert(!("inventoryItemId" in dailyProgressCalls[0].body), "mobile daily progress must not send inventory item");
assert(dailyProgressResult.inventoryCreated === false, "mobile daily progress must not create inventory");
assert(dailyProgressResult.reservationCreated === false, "mobile daily progress must not reserve inventory");
assert(dailyProgressResult.packingTaskCreated === false, "mobile daily progress must not create packing task");

const reportCalls = [];
const reportResult = await reportOfficeProductionComplete(
  {
    authState: createLocalSeedAuthState("U-WORKSHOP-A"),
    orderLine: productionLine,
    inventoryItem,
    qualifiedQty: 1000,
    exceptionQty: 0,
    machineCount: 1888,
    operatorId: "U-WORKSHOP-A",
    remark: "车间手机端提交生产报工完成",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      reportCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        productionTaskId: "PT-ORD-0629-003-01",
        reportId: "WR-PT-ORD-0629-003-01-MOBILE",
        orderLineId: productionLine.id,
        status: "已完成",
        orderLineStatus: "待打包",
        qualifiedQty: 1000,
        machineCount: 1888,
        machineCountAffectsInventory: false,
        inventoryItemId: inventoryItem.id,
        reservationId: "RSV-PT-ORD-0629-003-01-MOBILE",
        packingTaskId: "PKT-ORD-0629-003-01",
      });
    },
  },
);
assert(reportResult.source === "api", "mobile production report did not use API");
assert(reportCalls[0]?.init.headers["x-erp-user-id"] === "U-WORKSHOP-A", "mobile production report did not send workshop user header");
assert(reportCalls[0]?.body.remark.includes("车间手机端"), "mobile production report remark did not identify mobile entry");
assert(reportCalls[0]?.body.machineCount === 1888, "mobile production report did not send machine count");

const packingCalls = [];
const packingResult = await completeOfficePackingTask(
  {
    authState: createLocalSeedAuthState("U-PACKING-A"),
    packingTask,
    orderLine: productionLine,
    inventoryItem,
    actualPackedQty: 1000,
    packageCount: 3,
    operatorId: "U-PACKING-A",
    remark: "打包手机端提交打包完成",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      packingCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        packingTaskId: packingTask.packingTaskId,
        orderLineId: productionLine.id,
        status: "已完成",
        actualPackedQty: 1000,
        packageIds: ["PKG-MOBILE-1", "PKG-MOBILE-2", "PKG-MOBILE-3"],
        fulfillmentStatus: "待打印标签",
        orderLineStatus: "待打印标签",
        inventoryDeducted: false,
      });
    },
  },
);
assert(packingResult.source === "api", "mobile packing completion did not use API");
assert(packingCalls[0]?.init.headers["x-erp-user-id"] === "U-PACKING-A", "mobile packing completion did not send packing user header");
assert(packingCalls[0]?.body.remark.includes("打包手机端"), "mobile packing remark did not identify mobile entry");
assert(!Object.hasOwn(packingCalls[0]?.body ?? {}, "labelsPrinted"), "mobile packing must not send a browser-reported label flag");
assert(packingResult.inventoryDeducted === false, "mobile packing completion must not deduct inventory");

console.log("Workshop mobile production/packing check passed: seed roles, UI permissions, finished-goods photo upload, and API client headers are covered.");

function createJsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
