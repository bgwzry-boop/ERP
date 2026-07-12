import {
  normalizeV1GoLiveStatus,
  sanitizeV1ModuleDifferences,
  sanitizeV1StatusTextList,
} from "./v1ReleaseStatusProjectionService.mjs";
import { sanitizeV1SensitiveStatusText } from "./v1StatusTextSanitizer.mjs";

export function sanitizeV1UnblockPlan(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  return {
    status: normalizeV1GoLiveStatus(source.status),
    ready: source.ready === true,
    summary: {
      label: sanitizeV1SensitiveStatusText(summary.label) || "V1 解除阻塞仍有 52 项待处理",
      taskCount: normalizeNonNegativeInteger(summary.taskCount),
      releaseTaskCount: normalizeNonNegativeInteger(summary.releaseTaskCount),
      evidenceTaskCount: normalizeNonNegativeInteger(summary.evidenceTaskCount),
      signoffTaskCount: normalizeNonNegativeInteger(summary.signoffTaskCount),
      boundaryTaskCount: normalizeNonNegativeInteger(summary.boundaryTaskCount),
      phaseCount: normalizeNonNegativeInteger(summary.phaseCount),
      roleCount: normalizeNonNegativeInteger(summary.roleCount),
    },
    phases: Array.isArray(source.phases)
      ? source.phases.map(sanitizeV1UnblockPhase).filter(Boolean)
      : [],
    roleBuckets: Array.isArray(source.roleBuckets)
      ? source.roleBuckets.map(sanitizeV1RoleBucket).filter(Boolean)
      : [],
    firstActions: Array.isArray(source.firstActions)
      ? source.firstActions.map(sanitizeV1UnblockTask).filter(Boolean)
      : [],
    safeguards: {
      nonMutating: true,
      rawEvidenceRefsIncluded: false,
      rawSignersIncluded: false,
      rawNotesIncluded: false,
      rawSecretsIncluded: false,
      artifactPathExposed: false,
      localPathExposed: false,
    },
  };
}

export function sanitizeV1RoleTaskBoard(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const tasks = Array.isArray(source.tasks)
    ? source.tasks.map(sanitizeV1RoleTaskBoardTask).filter(Boolean)
    : [];
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const roleRows = Array.isArray(source.roleBuckets)
    ? source.roleBuckets
        .map((bucket) => sanitizeV1RoleTaskBoardRole(bucket, tasks, taskById))
        .filter(Boolean)
    : deriveV1RoleTaskBoardRoles(tasks);
  const taskCount = normalizeNonNegativeInteger(summary.taskCount) || tasks.length;
  const releaseTaskCount = normalizeNonNegativeInteger(summary.releaseTaskCount) ||
    tasks.filter(isV1ReleaseTask).length;
  const evidenceTaskCount = normalizeNonNegativeInteger(summary.evidenceTaskCount) ||
    tasks.filter(isV1EvidenceTask).length;
  const signoffTaskCount = normalizeNonNegativeInteger(summary.signoffTaskCount) ||
    tasks.filter(isV1SignoffTask).length;
  const boundaryTaskCount = normalizeNonNegativeInteger(summary.boundaryTaskCount) ||
    tasks.filter(isV1BoundaryTask).length;
  const categorySummaries = buildV1RoleTaskBoardCategorySummaries({
    releaseTaskCount,
    evidenceTaskCount,
    signoffTaskCount,
    boundaryTaskCount,
    tasks,
  });

  return {
    status: normalizeV1GoLiveStatus(source.status),
    ready: source.ready === true,
    available: tasks.length > 0 || roleRows.length > 0,
    summary: {
      label:
        sanitizeV1SensitiveStatusText(summary.label) ||
        (taskCount ? `V1 现场仍有 ${taskCount} 个待处理任务` : "V1 现场角色任务清单未生成"),
      taskCount,
      releaseTaskCount,
      evidenceTaskCount,
      signoffTaskCount,
      boundaryTaskCount,
      roleCount: normalizeNonNegativeInteger(summary.roleCount) || roleRows.length,
      categoryCount: categorySummaries.length,
      shownRoleCount: roleRows.slice(0, 6).length,
      shownTaskCount: roleRows
        .slice(0, 6)
        .reduce((total, role) => total + role.tasks.length, 0),
    },
    categorySummaries,
    roles: roleRows.slice(0, 6),
    firstActions: tasks.slice(0, 10),
    safeguards: {
      nonMutating: true,
      rawOnsiteTaskBoardIncluded: false,
      rawEvidenceRefsIncluded: false,
      rawSignersIncluded: false,
      rawNotesIncluded: false,
      rawSecretsIncluded: false,
      artifactPathExposed: false,
      localPathExposed: false,
    },
  };
}

export function sanitizeV1V2BoundaryBrief(scope = {}, completion = {}) {
  const source = isPlainObject(scope) ? scope : {};
  const summarySource = isPlainObject(source.summary) ? source.summary : {};
  const ownerReviewSource = isPlainObject(source.ownerReview) ? source.ownerReview : {};
  const v1MustContinue = sanitizeV1StatusTextList(
    source.v1MustContinue ?? completion.v1MustContinue ?? [],
  ).slice(0, 8);
  const v2Categories = sanitizeV1StatusTextList(source.v2Categories ?? []).slice(0, 7);
  const v2Differences = sanitizeV1StatusTextList(
    source.v2Differences ?? completion.v2Differences ?? [],
  ).slice(0, 20);
  const moduleDifferences = sanitizeV1ModuleDifferences(
    source.moduleDifferences ?? completion.moduleV1V2Differences ?? [],
  ).slice(0, 12);
  const ownerReview = {
    question: sanitizeV1SensitiveStatusText(ownerReviewSource.question),
    recommendation: sanitizeV1SensitiveStatusText(ownerReviewSource.recommendation),
    approvalRule: sanitizeV1SensitiveStatusText(ownerReviewSource.approvalRule),
  };
  const ownerReviewRuleCount = Object.values(ownerReview).filter(Boolean).length;
  const available =
    v1MustContinue.length > 0 ||
    v2Categories.length > 0 ||
    v2Differences.length > 0 ||
    moduleDifferences.length > 0 ||
    ownerReviewRuleCount > 0;
  const ready = source.ready === true;
  return {
    status: ready ? "confirmed" : "pending_confirmation",
    ready,
    available,
    canDeclareV1Complete: ready && source.canDeclareV1Complete === true,
    conclusion:
      sanitizeV1SensitiveStatusText(source.conclusion) ||
      "V1/V2 边界已整理，但 V1 仍未完成；不得把生产配置、真实设备、现场证据或签字后移到 V2。",
    summary: {
      label:
        sanitizeV1SensitiveStatusText(summarySource.label) ||
        "V1/V2 边界待确认：V1 必做项不能后移到 V2",
      v1MustContinueCount:
        normalizeNonNegativeInteger(summarySource.v1MustContinueCount) || v1MustContinue.length,
      v2CategoryCount:
        normalizeNonNegativeInteger(summarySource.v2CategoryCount) || v2Categories.length,
      v2DifferenceCount:
        normalizeNonNegativeInteger(summarySource.v2DifferenceCount) || v2Differences.length,
      moduleDifferenceCount:
        normalizeNonNegativeInteger(summarySource.moduleDifferenceCount) || moduleDifferences.length,
      ownerReviewRuleCount,
    },
    v1MustContinue,
    v2Categories,
    v2Differences,
    moduleDifferences,
    ownerReview,
    nextAction: ownerReview.recommendation || "先处理 V1 必做阻塞，再复核 V2 延后项。",
    safeguards: {
      nonMutating: true,
      boundaryConfirmationMutated: false,
      rawEvidenceRefsIncluded: false,
      rawSignersIncluded: false,
      rawNotesIncluded: false,
      rawSecretsIncluded: false,
      artifactPathExposed: false,
      localPathExposed: false,
    },
  };
}

function sanitizeV1UnblockPhase(value = {}) {
  if (!isPlainObject(value)) return null;
  const key = cleanText(value.key);
  const label = sanitizeV1SensitiveStatusText(value.label);
  if (!key || !label) return null;
  return {
    key,
    label,
    taskCount: normalizeNonNegativeInteger(value.taskCount),
    releaseTaskCount: normalizeNonNegativeInteger(value.releaseTaskCount),
    evidenceTaskCount: normalizeNonNegativeInteger(value.evidenceTaskCount),
    signoffTaskCount: normalizeNonNegativeInteger(value.signoffTaskCount),
    boundaryTaskCount: normalizeNonNegativeInteger(value.boundaryTaskCount),
    roles: sanitizeV1StatusTextList(value.roles),
    nextStep: sanitizeV1SensitiveStatusText(value.nextStep),
    groups: Array.isArray(value.groups)
      ? value.groups
          .map((group) => ({
            group: sanitizeV1SensitiveStatusText(group?.group),
            count: normalizeNonNegativeInteger(group?.count),
          }))
          .filter((group) => group.group)
      : [],
    firstTasks: Array.isArray(value.firstTasks)
      ? value.firstTasks.map(sanitizeV1UnblockTask).filter(Boolean)
      : [],
  };
}

function sanitizeV1UnblockTask(value = {}) {
  if (!isPlainObject(value)) return null;
  const title = sanitizeV1SensitiveStatusText(value.title);
  if (!title) return null;
  return {
    id: cleanText(value.id),
    type: sanitizeV1SensitiveStatusText(value.type),
    primaryRole: sanitizeV1SensitiveStatusText(value.primaryRole),
    roles: sanitizeV1StatusTextList(value.roles),
    group: sanitizeV1SensitiveStatusText(value.group),
    title,
    status: cleanText(value.status),
    action: sanitizeV1SensitiveStatusText(value.action),
  };
}

function sanitizeV1RoleBucket(value = {}) {
  if (!isPlainObject(value)) return null;
  const role = sanitizeV1SensitiveStatusText(value.role);
  if (!role) return null;
  return {
    role,
    taskCount: normalizeNonNegativeInteger(value.taskCount),
    p0TaskCount: normalizeNonNegativeInteger(value.p0TaskCount),
  };
}

function buildV1RoleTaskBoardCategorySummaries({
  releaseTaskCount = 0,
  evidenceTaskCount = 0,
  signoffTaskCount = 0,
  boundaryTaskCount = 0,
  tasks = [],
} = {}) {
  const taskRows = Array.isArray(tasks) ? tasks.filter(Boolean) : [];
  const categories = [
    {
      key: "release",
      title: "发布门禁",
      type: "发布门禁",
      count: releaseTaskCount,
      nextAction: "先处理生产配置门禁、运行时门禁、真实持久化、对象存储、打印和司机真机门禁。",
      predicate: isV1ReleaseTask,
    },
    {
      key: "evidence",
      title: "现场证据",
      type: "现场证据",
      count: evidenceTaskCount,
      nextAction: "按证据组补真实 PostgreSQL、对象存储、打印、司机真机和业务试跑留档。",
      predicate: isV1EvidenceTask,
    },
    {
      key: "signoff",
      title: "负责人签字",
      type: "负责人签字",
      count: signoffTaskCount,
      nextAction: "补齐办公室、仓库/出库、车间、司机、财务、技术/管理负责人签字。",
      predicate: isV1SignoffTask,
    },
    {
      key: "boundary",
      title: "V1/V2 边界",
      type: "V1/V2 边界",
      count: boundaryTaskCount,
      nextAction: "确认 V1 必做项不能后移到 V2，再复核计划 V2 差异。",
      predicate: isV1BoundaryTask,
    },
  ];

  return categories.map((category) => {
    const firstTasks = taskRows.filter(category.predicate).slice(0, 3);
    return {
      key: category.key,
      title: category.title,
      type: category.type,
      count: normalizeNonNegativeInteger(category.count),
      status: category.count > 0 ? "pending" : "cleared",
      statusLabel: category.count > 0 ? "待处理" : "已清空",
      nextAction: category.nextAction,
      firstTasks,
    };
  });
}

function sanitizeV1RoleTaskBoardRole(value = {}, tasks = [], taskById = new Map()) {
  if (!isPlainObject(value)) return null;
  const role = sanitizeV1SensitiveStatusText(value.role);
  if (!role) return null;
  const taskIds = Array.isArray(value.tasks)
    ? value.tasks.map((item) => cleanText(item)).filter(Boolean)
    : [];
  const roleTasks = taskIds.length
    ? taskIds.map((taskId) => taskById.get(taskId)).filter(Boolean)
    : tasks.filter((task) => task.roles.includes(role) || task.primaryRole === role);
  return buildV1RoleTaskBoardRole({
    role,
    sourceCount: normalizeNonNegativeInteger(value.taskCount),
    p0TaskCount: normalizeNonNegativeInteger(value.p0TaskCount),
    tasks: roleTasks,
  });
}

function deriveV1RoleTaskBoardRoles(tasks = []) {
  const roles = [];
  for (const task of tasks) {
    for (const role of task.roles) {
      if (!roles.includes(role)) roles.push(role);
    }
  }
  return roles
    .map((role) => buildV1RoleTaskBoardRole({
      role,
      sourceCount: 0,
      p0TaskCount: 0,
      tasks: tasks.filter((task) => task.roles.includes(role) || task.primaryRole === role),
    }))
    .filter(Boolean);
}

function buildV1RoleTaskBoardRole({ role, sourceCount, p0TaskCount, tasks }) {
  const taskRows = Array.isArray(tasks) ? tasks.filter(Boolean) : [];
  return {
    role,
    taskCount: sourceCount || taskRows.length,
    p0TaskCount: p0TaskCount || taskRows.length,
    releaseTaskCount: taskRows.filter(isV1ReleaseTask).length,
    evidenceTaskCount: taskRows.filter(isV1EvidenceTask).length,
    signoffTaskCount: taskRows.filter(isV1SignoffTask).length,
    boundaryTaskCount: taskRows.filter(isV1BoundaryTask).length,
    tasks: taskRows.slice(0, 5),
  };
}

function sanitizeV1RoleTaskBoardTask(value = {}) {
  if (!isPlainObject(value)) return null;
  const id = cleanText(value.id);
  const title = sanitizeV1SensitiveStatusText(value.title);
  if (!id || !title) return null;
  const roles = sanitizeV1StatusTextList(value.roles);
  const primaryRole = sanitizeV1SensitiveStatusText(value.primaryRole) || roles[0] || "";
  return {
    id,
    type: sanitizeV1SensitiveStatusText(value.type),
    group: sanitizeV1SensitiveStatusText(value.group),
    title,
    status: cleanText(value.status) || "pending",
    priority: cleanText(value.priority) || "P0",
    primaryRole,
    roles,
    action: sanitizeV1SensitiveStatusText(value.action),
  };
}

function isV1ReleaseTask(task = {}) {
  return cleanText(task.id).startsWith("release.") || cleanText(task.type).includes("发布");
}

function isV1EvidenceTask(task = {}) {
  return cleanText(task.id).startsWith("evidence.") || cleanText(task.type).includes("证据");
}

function isV1SignoffTask(task = {}) {
  return cleanText(task.id).startsWith("signoff.") || cleanText(task.type).includes("签字");
}

function isV1BoundaryTask(task = {}) {
  return cleanText(task.id).startsWith("boundary.") || cleanText(task.type).includes("边界");
}

function normalizeNonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.trunc(parsed);
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
