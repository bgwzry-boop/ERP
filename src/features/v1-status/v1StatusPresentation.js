export const v1StatusSummary = {
  statusLabel: "V1 仍未完成",
  conclusion: "代码侧能力已接近收口，但真实生产配置、现场证据、设备 / 真机验收和签字仍未完成。",
  generatedAt: "2026-07-05 11:30",
  metrics: [
    ["需求确认", "85-90%", "success"],
    ["P0/代码", "97-98%", "success"],
    ["V1 就绪", "80-83%", "warning"],
    ["发布门禁", "0/4", "danger"],
    ["现场证据", "0/34", "danger"],
    ["负责人签字", "0/6", "danger"],
  ],
  gates: [
    ["发布候选", "0/4", "blocked", "生产 env、现场证据、运行时 readiness、现场报告仍未同时通过。"],
    ["运行时门禁", "5/11", "blocked", "系统持久化、附件留档、打印 spool、CUPS、打印 V1、司机真机仍阻塞。"],
    ["现场任务", "52 项", "blocked", "技术/管理、办公室、仓库、司机、财务和车间仍有现场任务。"],
    ["V1/V2 边界", "待签字", "pending", "V2 差异已整理，但负责人仍需确认边界。"],
  ],
  blockers: [
    "真实 PostgreSQL / 对象存储 profile 启动并通过系统 V1 持久化门禁。",
    "真实标签机 / 针式机出纸、纸张对位、条码扫码和 CUPS 队列现场证据。",
    "司机真机原生扫码 / 原生导航 / 水印照片现场 QA。",
    "真实业务试跑、34 项现场证据、6 个角色签字和 V1/V2 边界确认。",
  ],
};

export const v1StatusSnapshotMaxAgeMs = 15 * 60 * 1000;

export const v1ModuleCompletionRows = [
  ["客户 / 价格表 / 基础资料", "90-93%", "98%", "70%", "更多真实 Excel 样本、真实导入验收、生产身份部署。"],
  ["生产 / 车间报工", "90-93%", "91%", "63%", "车间稳定试用、真实相机 / 成品图验收、现场产能校准。"],
  ["公共待办", "98%", "91%", "62%", "后台提醒配置、真实多账号并发、生产待办压力验证。"],
  ["原材料 / 成本 / 毛利", "98%", "87%", "60%", "真实 OCR、标签机/标签纸、手机扫码签单、机边扫码、毛利经营分析深化。"],
  ["对账 / 收款", "94%", "85%", "59%", "客户最终 Excel 样式、真实对象存储、企微回调和在线预览。"],
  ["订单录入 / 识别", "93%", "88%", "55%", "真实样本文本库、置信度评分、OCR / AI 后续接入。"],
  ["订单池 / 订单管理", "90%", "85%", "55%", "真实大数据量性能、更多正式调整 / 售后联动。"],
  ["库存查询 / 修正 / 流水", "93%", "82%", "55%", "实际库区命名、安全库存初始值、盘点现场流程。"],
  ["出库 / 交付", "97%", "85%", "55%", "LQ-615KII 真实单据样张、标签纸、库房手机端现场试用。"],
  ["打包 / 标签", "92-94%", "85%", "54%", "真实打印质量 QA、真机拍照验收、客户打包偏好沉淀。"],
  ["打印设备 / 打印作业", "95%", "89%", "53%", "LQ-615KII / 标签机出纸、现场 lpstat、纸张对位和扫码。"],
  ["排产 / 生产看板", "93%", "79%", "47%", "自动插单策略、换模工单、车间大屏和真实看板验证。"],
  ["司机端送货", "97%", "79%", "42%", "真实 Android / iOS 原生壳、物理标签扫码、地图 SDK 和司机手机 QA。"],
  ["售后 / 责任 / 绩效扣款", "91%", "30%", "18%", "售后页面、责任分摊、绩效扣款权限和工资联动。"],
  ["工资 / 考勤 / 人事", "65%", "20%", "10%", "现有工资表、打卡机导出格式、工资草稿页面。"],
  ["自动化 / 企微 / 客户群", "82%", "15%", "5%", "V1 冻结为人工；V2 再做会话存档、发送代理和风控。"],
].map(([module, requirements, p0Code, v1Readiness, remaining]) => ({
  module,
  requirements,
  p0Code,
  v1Readiness,
  remaining,
}));

export const v2DifferenceItems = [
  ["AI / OCR", "客户群、图片订单、付款截图和原材料单据的自动识别；高可信场景再推荐自动成单。"],
  ["企微 / 客户自动化", "会话存档、自动回执抓取、固定模板发送代理、白名单试点、风控和 kill switch。"],
  ["路线 / 司机", "路线优化、实时位置、司机绩效、更多原生能力和异常自动分派。"],
  ["排产 / 车间", "自动插单建议、产能预测、换模优化、大屏深度联动和图片质量自动识别。"],
  ["原材料 / 成本毛利", "更完整批次、跨批次 / 多订单深度归因、毛利经营分析和最终财务结算联动。"],
  ["售后 / 工资", "售后闭环、责任分摊、绩效 / 扣款审批、考勤导入和工资草稿。"],
  ["外部接口 / BI", "承运商接口、客户自助确认、更多经营报表、权限审计和生产运维自动化。"],
];

export const v1UnblockPlan = {
  summary: {
    label: "V1 解除阻塞仍有 52 项待处理",
    taskCount: "52 项",
    releaseTaskCount: "11 项",
    evidenceTaskCount: "34 项",
    signoffTaskCount: "6 项",
    boundaryTaskCount: "1 项",
  },
  phases: [
    {
      key: "production_environment",
      label: "1. 先补生产环境和持久化",
      taskCount: 16,
      releaseTaskCount: 7,
      evidenceTaskCount: 9,
      signBoundaryCount: 0,
      roles: "办公室、财务、仓库/出库、技术/管理",
      nextStep: "先由技术 / 管理补真实 PostgreSQL、对象存储和生产 env，再重新跑生产环境预检与系统持久化门禁。",
      firstTasks: [
        ["发布门禁", "生产环境变量预检", "统一 V1 持久化 profile", "技术/管理", "缺少或未启用：ERP_V1_PERSISTENCE_PROFILE=postgres、数据库 URL、ERP_V1_FILE_STORAGE_PROFILE=object_storage。"],
        ["发布门禁", "生产环境变量预检", "附件对象存储环境变量", "技术/管理", "补齐附件对象存储 endpoint、bucket、access key 和 secret key。"],
        ["发布门禁", "生产环境变量预检", "对账导出对象存储环境变量", "技术/管理", "补齐对账导出对象存储配置，或确认附件对象存储 fallback 完整。"],
        ["发布门禁", "生产环境变量预检", "系统打印 command_bridge 环境变量", "技术/管理", "补齐系统打印开关、命令桥、命令参数、白名单和 spool 目录。"],
      ],
    },
    {
      key: "print_hardware",
      label: "2. 再补真实打印链路",
      taskCount: 11,
      releaseTaskCount: 3,
      evidenceTaskCount: 8,
      signBoundaryCount: 0,
      roles: "办公室、仓库/出库、技术/管理、司机",
      nextStep: "在真实打印机器上完成 CUPS 队列预检、样张出纸、纸张对位、条码扫码和作废重打证据。",
      firstTasks: [
        ["发布门禁", "运行时 V1 readiness", "打印 spool 状态回读", "技术/管理", "配置并验证 spool 状态回读诊断。"],
        ["发布门禁", "运行时 V1 readiness", "CUPS 队列预检", "技术/管理", "在真实打印机器上执行 CUPS 队列预检。"],
        ["发布门禁", "运行时 V1 readiness", "打印 V1 上线门禁", "技术/管理", "补齐打印 V1 门禁剩余 6 项阻塞。"],
        ["现场证据", "司机真机 / 原生壳", "纸质包裹标签原生扫码已匹配任务", "司机", "用真实纸质标签扫码并回填 evidenceRef。"],
      ],
    },
    {
      key: "driver_device",
      label: "3. 再补司机真机验收",
      taskCount: 7,
      releaseTaskCount: 1,
      evidenceTaskCount: 5,
      signBoundaryCount: 1,
      roles: "技术/管理、司机",
      nextStep: "用司机真实手机完成原生扫码、定位、导航、水印照片和上传兜底验收，并回填证据编号。",
      firstTasks: [
        ["发布门禁", "运行时 V1 readiness", "司机端 V1 真机门禁", "技术/管理", "用真实 Android / iOS 设备补齐司机端 V1 门禁。"],
        ["现场证据", "司机真机 / 原生壳", "相机权限、拍照和水印信息已通过", "司机", "真实手机拍照并确认水印信息。"],
        ["现场证据", "司机真机 / 原生壳", "真实 Android / iOS 手机已安装并登录", "司机", "记录真实机型、系统和登录证据。"],
        ["现场证据", "司机真机 / 原生壳", "定位权限和送达位置记录已通过", "司机", "确认定位权限、地址和送达位置记录。"],
      ],
    },
    {
      key: "business_pilot",
      label: "4. 再补真实业务试跑",
      taskCount: 9,
      releaseTaskCount: 0,
      evidenceTaskCount: 8,
      signBoundaryCount: 1,
      roles: "办公室、财务、仓库/出库、技术/管理",
      nextStep: "用真实订单跑完订单录入、库存占用、出库交付、生产打包、对账收款和异常待办闭环。",
      firstTasks: [
        ["现场证据", "生产持久化", "恢复演练或恢复样本已留档", "技术/管理", "完成恢复样本或恢复演练并留档。"],
        ["现场证据", "生产持久化", "生产库账号、最小权限和连接池配置已确认", "技术/管理", "确认生产库账号、连接池和最小权限。"],
        ["现场证据", "真实业务试运行", "异常待办责任人、提醒和处理闭环已确认", "办公室", "用真实异常待办跑完责任和处理闭环。"],
        ["现场证据", "真实业务试运行", "真实出库、交付、异常和重打流程已通过", "办公室", "用真实出库单验证交付、异常和重打。"],
      ],
    },
    {
      key: "security_and_signoff",
      label: "5. 最后补安全运维、签字和 V1/V2 边界",
      taskCount: 8,
      releaseTaskCount: 0,
      evidenceTaskCount: 3,
      signBoundaryCount: 5,
      roles: "办公室、财务、车间、技术/管理",
      nextStep: "确认生产账号、审计留存、备份监控、回滚负责人后，完成 6 个负责人签字和 V1/V2 边界确认。",
      firstTasks: [
        ["现场证据", "账号 / 权限 / 运维", "操作日志和访问审计留存策略已确认", "技术/管理", "确认审计留存策略并记录证据。"],
        ["现场证据", "账号 / 权限 / 运维", "初始密码、强制改密、重置和撤销流程已确认", "技术/管理", "用真实账号演练密码和撤销流程。"],
        ["现场证据", "账号 / 权限 / 运维", "回滚窗口、回滚负责人和沟通路径已确认", "技术/管理", "确认回滚窗口、负责人和通知路径。"],
        ["负责人签字", "负责人签字", "办公室 负责人签字", "办公室", "负责人复核真实证据后填写 signer / signedAt。"],
      ],
    },
    {
      key: "remaining",
      label: "6. 其它剩余阻塞项",
      taskCount: 1,
      releaseTaskCount: 0,
      evidenceTaskCount: 1,
      signBoundaryCount: 0,
      roles: "办公室、财务、仓库/出库",
      nextStep: "按角色任务清单继续补齐剩余 P0 任务，完成后重新生成 V1 go-live suite。",
      firstTasks: [
        ["现场证据", "真实业务试运行", "真实客户订单录入、识别和确认已通过", "办公室", "用真实客户消息完成录入、识别、确认并回填 evidenceRef。"],
      ],
    },
  ],
  roleBuckets: [
    ["技术/管理", "34"],
    ["办公室", "19"],
    ["仓库/出库", "19"],
    ["财务", "15"],
    ["司机", "8"],
    ["车间", "1"],
  ],
};

export const v1EvidenceStageStatusOptions = [
  { value: "passed", label: "已通过" },
  { value: "blocked", label: "阻塞" },
  { value: "pending", label: "待补" },
  { value: "not_applicable", label: "不适用" },
];

export const v1SignoffStageStatusOptions = [
  { value: "signed", label: "已签字" },
  { value: "blocked", label: "阻塞" },
  { value: "pending", label: "待补" },
];

export const v1BoundaryStageStatusOptions = [
  { value: "confirmed", label: "已确认" },
  { value: "blocked", label: "阻塞" },
  { value: "pending", label: "待补" },
];

export function formatV1StatusSnapshotTime(value) {
  const timestamp = Date.parse(String(value ?? ""));
  if (!Number.isFinite(timestamp)) return "--";
  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function normalizeV1PhaseTaskForPage(task, index = 0) {
  if (Array.isArray(task)) {
    return {
      key: `${task[2] || "task"}-${index}`,
      type: task[0] || "",
      group: task[1] || "",
      title: task[2] || "",
      primaryRole: task[3] || "",
      roleLabel: task[3] || "",
      status: "pending",
      statusLabel: "待处理",
      action: task[4] || "",
    };
  }
  return {
    key: `${task?.type || "task"}-${task?.group || ""}-${task?.title || index}`,
    type: task?.type || "",
    group: task?.group || "",
    title: task?.title || "",
    primaryRole: task?.primaryRole || "",
    roleLabel: task?.roleLabel || task?.primaryRole || "",
    status: task?.status || "pending",
    statusLabel: task?.statusLabel || "待处理",
    action: task?.action || "",
  };
}

export function normalizeV1PhaseGroupForPage(group, index = 0) {
  if (Array.isArray(group)) {
    return {
      key: `${group[0] || "group"}-${index}`,
      group: group[0] || "",
      countLabel: group[1] ? `${group[1]} 项` : "",
    };
  }
  return {
    key: `${group?.group || "group"}-${index}`,
    group: group?.group || "",
    countLabel: group?.countLabel || (group?.count ? `${group.count} 项` : ""),
  };
}

export function getV1PhaseTaskTone(task) {
  if (task.type === "发布门禁") return "danger";
  if (task.type?.includes("签字")) return "warning";
  if (task.type?.includes("边界")) return "warning";
  return "blue";
}

export function getProductionEnvTemplateSectionLabel(line) {
  const text = String(line ?? "").trim();
  const match = text.match(/^#\s+(BLOCKING|WARNING)\s+\|\s+[^|]+\|\s+(.+)$/);
  return match ? match[2].trim() : "";
}

export function buildProductionEnvVariableCheckOverlayForPage(baseItems = [], candidates = []) {
  const baseKeys = new Set(
    normalizeProductionEnvObjectListForPage(baseItems)
      .map((item) => String(item.key ?? "").trim())
      .filter(Boolean),
  );
  const baseLabels = new Set(
    normalizeProductionEnvObjectListForPage(baseItems)
      .map((item) => String(item.label ?? "").trim())
      .filter(Boolean),
  );

  for (const candidate of candidates) {
    const sourceLabel = String(candidate?.sourceLabel ?? "").trim();
    const liveItems = getProductionEnvPrecheckItemsForPage(candidate?.result)
      .map((item) => ({ ...item, sourceLabel }))
      .filter((item) => item.label || item.key);
    const matchedItems = liveItems.filter((item) => (
      (item.key && baseKeys.has(item.key)) ||
      (item.label && baseLabels.has(item.label))
    ));
    if (!matchedItems.length) continue;
    const itemsByKey = new Map();
    liveItems.forEach((item) => {
      if (item.key) itemsByKey.set(`key:${item.key}`, item);
      if (item.label) itemsByKey.set(`label:${item.label}`, item);
    });
    return { sourceLabel, itemsByKey, matchedCount: matchedItems.length };
  }

  return { sourceLabel: "", itemsByKey: new Map(), matchedCount: 0 };
}

export function getProductionEnvPrecheckItemsForPage(result = {}) {
  const checks = normalizeProductionEnvObjectListForPage(result?.checks);
  const fallbackChecks = [
    ...normalizeProductionEnvObjectListForPage(result?.blockingChecks),
    ...normalizeProductionEnvObjectListForPage(result?.warningChecks),
  ];
  const sourceItems = checks.length ? checks : fallbackChecks;
  const seen = new Set();
  return sourceItems.filter((item) => {
    const itemKey = String(item.key ?? "").trim();
    const itemLabel = String(item.label ?? "").trim();
    if (!itemKey && !itemLabel) return false;
    const key = itemKey ? `key:${itemKey}` : `label:${itemLabel}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getProductionEnvVariableCheckOverlayItemForPage(overlay, item = {}) {
  if (!overlay?.itemsByKey) return null;
  const key = String(item.key ?? "").trim();
  const label = String(item.label ?? "").trim();
  return (key ? overlay.itemsByKey.get(`key:${key}`) : null) ||
    (label ? overlay.itemsByKey.get(`label:${label}`) : null) ||
    null;
}

export function getProductionEnvVariableCheckCountLabelForPage(item = {}) {
  const configuredCount = Number(item.configuredVariableCount) || 0;
  const totalCount = Number(item.totalVariableCount) || 0;
  return `${configuredCount}/${totalCount}`;
}

export function buildProductionEnvVariableChecksForPage(item = {}, liveItem = null) {
  const statusItem = liveItem || item;
  const requiredVariables = [
    ...normalizeProductionEnvStringListForPage(item.requiredVariables),
    ...normalizeProductionEnvStringListForPage(statusItem.requiredVariables),
  ];
  const missingVariables = normalizeProductionEnvStringListForPage(statusItem.missingVariables);
  const placeholderVariables = normalizeProductionEnvStringListForPage(statusItem.placeholderVariables);
  const missingSet = new Set(missingVariables);
  const placeholderSet = new Set(placeholderVariables);
  const variableNames = [...requiredVariables, ...missingVariables, ...placeholderVariables]
    .map((name) => String(name ?? "").trim())
    .filter(Boolean);
  const uniqueNames = [...new Set(variableNames)];
  return uniqueNames.map((name) => {
    if (placeholderSet.has(name)) return { name, status: "placeholder", statusLabel: "占位" };
    if (missingSet.has(name)) return { name, status: "missing", statusLabel: "待补" };
    if (isProductionEnvRuleLineForPage(name)) return { name, status: "rule", statusLabel: "规则" };
    return { name, status: "configured", statusLabel: "已配置" };
  });
}

export function normalizeProductionEnvObjectListForPage(value) {
  return Array.isArray(value)
    ? value.filter((item) => item && typeof item === "object")
    : [];
}

export function normalizeProductionEnvStringListForPage(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

export function isProductionEnvRuleLineForPage(value) {
  const text = String(value ?? "");
  return /\b(Either|complete all|leave them empty|fallback|or)\b/i.test(text);
}

export function buildV1StatusSummaryForPage(goLiveStatus) {
  if (!goLiveStatus) return v1StatusSummary;
  return {
    statusLabel: goLiveStatus.statusLabel || v1StatusSummary.statusLabel,
    conclusion: goLiveStatus.conclusion || v1StatusSummary.conclusion,
    generatedAt: goLiveStatus.generatedAt || v1StatusSummary.generatedAt,
    metrics: goLiveStatus.metrics?.length ? goLiveStatus.metrics : v1StatusSummary.metrics,
    gates: goLiveStatus.gates?.length ? goLiveStatus.gates : v1StatusSummary.gates,
    blockers: goLiveStatus.blockers?.length ? goLiveStatus.blockers : v1StatusSummary.blockers,
  };
}
