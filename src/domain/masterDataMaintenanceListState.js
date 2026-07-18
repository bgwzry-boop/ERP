import {
  normalizeV1RuntimeEmployeeRoleKey,
  normalizeV1RuntimeEmployeeRoleKeys,
} from "../../shared/auth/roleCatalog.js";

export const MASTER_DATA_MAINTENANCE_TABS = ["客户档案", "价格表", "规格库存", "员工机台"];
export const MASTER_DATA_EMPLOYEE_VIEWS = ["正式账号", "演示账号"];
export const MASTER_DATA_EMPLOYEE_REVIEW_FILTERS = ["全部", "可启用", "待身份", "待机台", "已启用"];

export function buildMasterDataMaintenanceViewItems({
  customers = [],
  orderLines = [],
  inventoryRecords = [],
  employeeAccountReviews = [],
} = {}) {
  const counts = {
    客户档案: customers.length,
    价格表: orderLines.length,
    规格库存: inventoryRecords.length,
    员工机台: employeeAccountReviews.length,
  };
  return MASTER_DATA_MAINTENANCE_TABS.map((key) => ({ key, label: key, count: counts[key] ?? 0 }));
}

export function filterMasterDataMaintenanceRecords(records = [], keyword = "") {
  const query = String(keyword ?? "").trim().toLowerCase();
  if (!query) return records;
  return records.filter((record) => String(record.searchText ?? record.label ?? "").toLowerCase().includes(query));
}

export function filterMasterDataEmployeeReviewRecords(records = [], filter = "全部") {
  if (filter === "可启用") return records.filter(isMasterDataEmployeeEnableCandidate);
  if (filter === "待身份") return records.filter(requiresMasterDataEmployeeIdentityConfirmation);
  if (filter === "待机台") return records.filter(requiresMasterDataEmployeeMachineReview);
  if (filter === "已启用") return records.filter((record) => record.employeeReview?.accountEnabled === true);
  return records;
}

export function buildMasterDataEmployeeReviewFilterCounts(records = []) {
  const formalRecords = records.filter((record) => record.sourceType === "formal");
  return {
    全部: formalRecords.length,
    可启用: formalRecords.filter(isMasterDataEmployeeEnableCandidate).length,
    待身份: formalRecords.filter(requiresMasterDataEmployeeIdentityConfirmation).length,
    待机台: formalRecords.filter(requiresMasterDataEmployeeMachineReview).length,
    已启用: formalRecords.filter((record) => record.employeeReview?.accountEnabled === true).length,
  };
}

export function requiresMasterDataEmployeeMachineReview(record = {}) {
  const review = record.employeeReview ?? record;
  if (!getEmployeeReviewRoleKeys(review).includes("workshop")) return false;
  const configurationStatus = String(review.machineConfigurationStatus ?? "").trim();
  if (configurationStatus) return !["active", "legacy_alias"].includes(configurationStatus);
  return !String(review.defaultMachineId ?? "").trim();
}

export function requiresMasterDataEmployeeIdentityConfirmation(record = {}) {
  const review = record.employeeReview ?? record;
  return review.accountActivationBlocked === true || (
    review.identityConfirmationRequired === true && review.identityConfirmed !== true
  );
}

export function isMasterDataEmployeeEnableCandidate(record = {}) {
  const review = record.employeeReview ?? record;
  return Boolean(
    String(review.employeeId ?? "").trim() &&
    getEmployeeReviewRoleKey(review) &&
    review.accountEnabled !== true &&
    !requiresMasterDataEmployeeIdentityConfirmation(review) &&
    !requiresMasterDataEmployeeMachineReview(review),
  );
}

export function getMasterDataMaintenanceColumns(tab) {
  if (tab === "价格表") return ["品名", "尺寸", "颜色/提手", "单双面", "参考单价", "客户", "来源"];
  if (tab === "规格库存") return ["尺寸", "颜色", "提手", "款式", "库区", "状态", "可用"];
  if (tab === "员工机台") return ["员工", "账号", "岗位", "车间", "机台 / 安排", "状态"];
  return ["客户", "结算", "联系人", "电话", "欠款", "标签"];
}

export function getMasterDataMaintenanceTableClass(tab) {
  if (tab === "价格表") return "price";
  if (tab === "规格库存") return "stock";
  if (tab === "员工机台") return "employee";
  return "customer";
}

export function getMasterDataSearchPlaceholder(tab) {
  if (tab === "价格表") return "搜索品名 / 尺寸 / 颜色 / 客户 / 订单";
  if (tab === "规格库存") return "搜索尺寸 / 颜色 / 款式 / 库区 / 状态";
  if (tab === "员工机台") return "搜索员工 / 账号 / 岗位 / 车间 / 机台";
  return "搜索客户 / 联系人 / 手机 / 地址 / 标签";
}

function getEmployeeReviewRoleKey(review = {}) {
  return normalizeV1RuntimeEmployeeRoleKey(
    review.recommendedRoleKey ?? review.reviewedRoleKey ?? review.roleKey,
    review.roleName,
  );
}

function getEmployeeReviewRoleKeys(review = {}) {
  return normalizeV1RuntimeEmployeeRoleKeys([
    review.recommendedRoleKey ?? review.reviewedRoleKey ?? review.roleKey,
    review.recommendedRoleKeys ?? review.reviewedRoleKeys ?? review.roleKeys,
    review.roleName,
  ]);
}
