// Owner decision 2026-11-02: while the raw-material trial runs without machine
// tasks, a 杂工 may scan a roll out without picking a production task. Once the
// first batch goes live in production, every roll must be picked against a task.
//
//   ERP_RAW_MATERIAL_UNTASKED_ISSUE=allow | block   (explicit override)
//   unset → allowed outside production, blocked in production.

export function resolveRawMaterialUntaskedIssueAllowed({ env = process.env, runtimeConfig = {} } = {}) {
  const value = String(env?.ERP_RAW_MATERIAL_UNTASKED_ISSUE ?? "").trim().toLowerCase();
  if (value === "allow") return true;
  if (value === "block") return false;
  if (value) {
    const error = new Error("ERP_RAW_MATERIAL_UNTASKED_ISSUE must be allow or block.");
    error.code = "RAW_MATERIAL_UNTASKED_ISSUE_POLICY_INVALID";
    throw error;
  }
  return runtimeConfig?.production !== true;
}

export function assertRawMaterialUntaskedIssueAllowed(workspace = {}, productionTaskId = "") {
  if (String(productionTaskId ?? "").trim()) return;
  if (workspace?.rawMaterialUntaskedIssueAllowed === false) {
    throw Object.assign(new Error("正式上线后必须先选生产任务再扫码领料；试用期的「没有任务直接出库」已关闭。"), {
      statusCode: 409,
      code: "RAW_MATERIAL_ISSUE_TASK_REQUIRED",
    });
  }
}
