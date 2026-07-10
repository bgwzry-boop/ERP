import { useEffect, useRef, useState } from "react";
import { SearchOutlined } from "@ant-design/icons";
import { DataTable, DetailPane, InfoGrid, MetricStrip, Segmented, StatusPill, Timeline } from "../../components/ui.jsx";
import {
  applyDriverPackageScan,
  getDriverLoadPackageCheckState,
  getDriverNavigationUrl,
  getDriverRouteExecutionContext,
  getDriverRouteLabel,
  getDriverRouteStopLabel,
} from "../../services/driverMobileApiClient.js";
import {
  DRIVER_DEVICE_FIELD_TEST_STATUS_OPTIONS,
  appendDriverDeviceFieldTestNote,
  applyDriverPackageCameraFieldTestSignal,
  applyDriverPackageLabelScanFieldTestSignal,
  buildDriverDeviceFieldTestRecord,
  buildDriverPackageLabelScanSample,
  createDriverDeviceFieldTestChecks,
  getDriverDeviceFieldTestContext,
  getDriverDeviceFieldTestSummary,
  getDriverPackageLabelScanSampleSummary,
  updateDriverDeviceFieldTestCheck,
} from "../../services/driverDeviceFieldTestClient.js";
import {
  PRINTER_DEVICE_FIELD_TEST_EVIDENCE_ITEMS,
  PRINTER_DEVICE_FIELD_TEST_STATUS_OPTIONS,
  getPrinterDeviceFieldTestEvidenceSummary,
  getPrinterDeviceFieldTestSummary,
} from "../../services/printerDeviceFieldTestClient.js";
import {
  captureDriverDeliveryPhotoFromVideo,
  startDriverDeliveryPhotoCamera,
} from "../../services/driverCameraPhotoClient.js";
import { getDriverDeviceReadiness } from "../../services/driverDeviceReadinessClient.js";
import { startDriverPackageCameraScanner } from "../../services/driverPackageCameraScannerClient.js";
import {
  getDriverNativePackageScannerSupport,
  requestDriverNativePackageLabelScan,
} from "../../services/driverNativeBridgeClient.js";
import {
  getDriverNativeNavigationSupport,
  requestDriverNativeNavigation,
} from "../../services/driverNativeNavigationBridgeClient.js";
import { getDriverNativeCapabilityDiagnostics } from "../../services/driverNativeCapabilityClient.js";
import {
  buildDriverNativeIntegrationKit,
  getDriverNativeIntegrationKitSummary,
} from "../../services/driverNativeIntegrationKitClient.js";
import {
  formatPrintBatchPackageList,
  getPrintBatchRecordsForTodo,
} from "../../state/officeTodoActions.js";
import {
  buildPrintDriverReadinessChecklist,
  getPrintDriverReadinessSummary,
} from "../../services/officePrintDriverConfigApiClient.js";
import {
  buildOfficePrintDriverIntegrationKit,
  getOfficePrintDriverIntegrationKitSummary,
} from "../../services/officePrintDriverIntegrationKitClient.js";
import { precheckRawMaterialSupplierStatementWorkbook } from "../../domain/rawMaterialSupplierStatementImport.js";
import {
  buildRawMaterialInboundMetrics,
  canConfirmRawMaterialConsumptionRoll,
  canConfirmRawMaterialAttachment,
  canIssueRawMaterialRoll,
  canIssueRawMaterialToMachine,
  canPrintRawMaterialLabels,
  canReturnRawMaterialLeftoverRoll,
  canReviewRawMaterialInbound,
  canReviewRawMaterialLeftoverRoll,
  filterRawMaterialInboundsByKeyword,
  filterRawMaterialInboundsByTab,
  formatRawMaterialDeliveryNoteNo,
  formatSupplierPayableAmount,
  getRawMaterialInboundSourceLabel,
  getRawMaterialInboundTone,
  getSupplierStatementReviewSourceLabel,
  getSupplierStatementReviewTone,
  getSupplierStatementStatusTone,
} from "../../domain/rawMaterialInboundListState.js";

const PRINT_DRIVER_MODE_OPTIONS = [
  { value: "preview_only", label: "仅预览" },
  { value: "system_printer", label: "系统打印" },
];

const defaultInventoryLedgerPanelFilters = {
  keyword: "",
  changeType: "全部",
  sourceType: "全部",
  dateFrom: "",
  dateTo: "",
};

const inventoryLedgerChangeTypeOptions = [
  { value: "全部", label: "全部变动" },
  { value: "correction", label: "库存修正" },
  { value: "订单占用", label: "订单占用" },
  { value: "释放占用", label: "释放占用" },
  { value: "出库扣减", label: "出库扣减" },
  { value: "生产入库", label: "生产入库" },
  { value: "生产完成占用", label: "生产占用" },
  { value: "打包完成确认", label: "打包完成" },
  { value: "订单改量释放占用", label: "改量释放" },
  { value: "订单改量补占用", label: "改量补占" },
  { value: "取消出库释放占用", label: "取消出库" },
];

const inventoryLedgerSourceTypeOptions = [
  { value: "全部", label: "全部来源" },
  { value: "inventory_correction", label: "库存修正" },
  { value: "order_confirm", label: "订单确认" },
  { value: "inventory_reservation_release", label: "释放占用" },
  { value: "order_line_quantity_adjustment", label: "订单改量" },
  { value: "order_line_void", label: "订单作废" },
  { value: "fulfillment_complete", label: "完成出库" },
  { value: "fulfillment_pickup", label: "确认拉走" },
  { value: "fulfillment_cancel", label: "取消出库" },
  { value: "production_report", label: "生产报工" },
  { value: "production_report_reservation", label: "生产占用" },
  { value: "packing_complete", label: "打包完成" },
];

const v1StatusSummary = {
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

const v1StatusSnapshotMaxAgeMs = 15 * 60 * 1000;

function formatV1StatusSnapshotTime(value) {
  const timestamp = Date.parse(String(value ?? ""));
  if (!Number.isFinite(timestamp)) return "--";
  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const v1ModuleCompletionRows = [
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

const v2DifferenceItems = [
  ["AI / OCR", "客户群、图片订单、付款截图和原材料单据的自动识别；高可信场景再推荐自动成单。"],
  ["企微 / 客户自动化", "会话存档、自动回执抓取、固定模板发送代理、白名单试点、风控和 kill switch。"],
  ["路线 / 司机", "路线优化、实时位置、司机绩效、更多原生能力和异常自动分派。"],
  ["排产 / 车间", "自动插单建议、产能预测、换模优化、大屏深度联动和图片质量自动识别。"],
  ["原材料 / 成本毛利", "更完整批次、跨批次 / 多订单深度归因、毛利经营分析和最终财务结算联动。"],
  ["售后 / 工资", "售后闭环、责任分摊、绩效 / 扣款审批、考勤导入和工资草稿。"],
  ["外部接口 / BI", "承运商接口、客户自助确认、更多经营报表、权限审计和生产运维自动化。"],
];

const v1UnblockPlan = {
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

function renderV1ProductionEnvFileSourceStatusList(sourceStatuses = []) {
  const rows = Array.isArray(sourceStatuses) ? sourceStatuses.filter((source) => source?.envVariable) : [];
  if (!rows.length) return null;
  return (
    <div className="v1-production-env-file-audit-source-list">
      <strong>服务端来源状态</strong>
      {rows.map((source) => (
        <span key={source.envVariable}>
          <em>{source.label}</em>
          <strong>{source.envVariable}</strong>
          <small>
            {source.selected
              ? "当前使用"
              : source.ignored
                ? "已配置但未使用"
                : source.configured
                  ? "已配置"
                  : "未配置"}
            {source.envFileCount ? ` / ${source.envFileCount} 个文件` : ""}
          </small>
        </span>
      ))}
    </div>
  );
}

function normalizeV1PhaseTaskForPage(task, index = 0) {
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

function normalizeV1PhaseGroupForPage(group, index = 0) {
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

function getV1PhaseTaskTone(task) {
  if (task.type === "发布门禁") return "danger";
  if (task.type?.includes("签字")) return "warning";
  if (task.type?.includes("边界")) return "warning";
  return "blue";
}

const v1EvidenceStageStatusOptions = [
  { value: "passed", label: "已通过" },
  { value: "blocked", label: "阻塞" },
  { value: "pending", label: "待补" },
  { value: "not_applicable", label: "不适用" },
];

const v1SignoffStageStatusOptions = [
  { value: "signed", label: "已签字" },
  { value: "blocked", label: "阻塞" },
  { value: "pending", label: "待补" },
];

const v1BoundaryStageStatusOptions = [
  { value: "confirmed", label: "已确认" },
  { value: "blocked", label: "阻塞" },
  { value: "pending", label: "待补" },
];

export function V1StatusPage({
  fieldEvidenceDraftAction = {},
  fieldEvidenceValidationAction = {},
  fieldEvidenceStageRowAction = {},
  fieldEvidenceAttachmentAction = {},
  fieldEvidenceAttachmentListAction = {},
  signoffBoundaryAttachmentAction = {},
  signoffBoundaryAttachmentListAction = {},
  productionEnvPrecheckAction = {},
  productionEnvSetupAction = {},
  productionEnvIntakePrecheckAction = {},
  productionEnvFileAuditPrecheckAction = {},
  productionEnvFilePreviewPrecheckAction = {},
  productionGoLivePrecheckAction = {},
  productionPersistenceEvidenceAction = {},
  productionFirstStageExecutionAction = {},
  productionFirstStageValuesDryRunAction = {},
  productionFirstStageValuesApplyAction = {},
  persistencePrecheckAction = {},
  attachmentRetentionPrecheckAction = {},
  printSpoolPrecheckAction = {},
  printCupsPrecheckAction = {},
  printReadinessPrecheckAction = {},
  driverReadinessPrecheckAction = {},
  runtimeReadinessPrecheckAction = {},
  v1V2BoundaryPrecheckAction = {},
  v1V2ScopeBriefRefreshAction = {},
  releaseCandidateRefreshPrecheckAction = {},
  releaseCandidateRefreshAction = {},
  goLiveStatus = null,
  goLiveMeta = {},
  onGenerateFieldEvidenceDraft,
  onStageFieldEvidenceRow,
  onUploadFieldEvidenceAttachment,
  onListFieldEvidenceAttachments,
  onUploadSignoffBoundaryAttachment,
  onListSignoffBoundaryAttachments,
  onPrecheckProductionEnv,
  onRunProductionEnvSetup,
  onPrecheckProductionEnvIntake,
  onPrecheckProductionEnvFileAudit,
  onPrecheckProductionEnvFilePreview,
  onPrecheckProductionGoLive,
  onRunProductionPersistenceEvidence,
  onRunProductionFirstStageExecution,
  onPrecheckProductionFirstStageValuesDryRun,
  onApplyProductionFirstStageValues,
  onPrecheckV1Persistence,
  onPrecheckV1AttachmentRetention,
  onPrecheckV1PrintSpool,
  onPrecheckV1PrintCups,
  onPrecheckV1PrintReadiness,
  onPrecheckV1DriverReadiness,
  onPrecheckRuntimeReadiness,
  onPrecheckV1V2Boundary,
  onRefreshV1V2ScopeBrief,
  onPrecheckReleaseCandidateRefresh,
  onRefreshReleaseCandidate,
  onValidateFieldEvidenceDraft,
}) {
  const [selectedModuleName, setSelectedModuleName] = useState("原材料 / 成本 / 毛利");
  const [selectedPhaseKey, setSelectedPhaseKey] = useState("production_environment");
  const [evidenceStageDraft, setEvidenceStageDraft] = useState({
    selectionKey: "",
    onsiteStatus: "passed",
    onsiteEvidenceRef: "",
    onsiteNotes: "",
  });
  const [evidenceAttachmentFile, setEvidenceAttachmentFile] = useState(null);
  const [signoffBoundaryAttachmentFile, setSignoffBoundaryAttachmentFile] = useState(null);
  const [showAllMissingEvidenceItems, setShowAllMissingEvidenceItems] = useState(false);
  const [selectedMissingEvidenceGroupKey, setSelectedMissingEvidenceGroupKey] = useState("");
  const [showAllV1MustContinueItems, setShowAllV1MustContinueItems] = useState(false);
  const [showAllV2BoundaryDifferences, setShowAllV2BoundaryDifferences] = useState(false);
  const [showAllV1V2ModuleDifferences, setShowAllV1V2ModuleDifferences] = useState(false);
  const [showAllProductionEnvFixItems, setShowAllProductionEnvFixItems] = useState(false);
  const [showAllProductionEnvTemplateLines, setShowAllProductionEnvTemplateLines] = useState(false);
  const [showAllProductionEnvMinimumTemplateLines, setShowAllProductionEnvMinimumTemplateLines] = useState(false);
  const [focusedProductionEnvTemplateLineIndex, setFocusedProductionEnvTemplateLineIndex] = useState(null);
  const [signoffStageDraft, setSignoffStageDraft] = useState({
    selectionKey: "",
    onsiteStatus: "signed",
    person: "",
    time: "",
    onsiteNotes: "",
  });
  const evidenceStageCardRef = useRef(null);
  const evidenceStageRefInputRef = useRef(null);
  const signoffStageCardRef = useRef(null);
  const signoffStagePersonInputRef = useRef(null);
  const fieldEvidenceIntakeQualityRef = useRef(null);
  const fieldEvidenceProgressRef = useRef(null);
  const fieldAcceptanceReportRef = useRef(null);
  const runtimeReadinessSectionRef = useRef(null);
  const v1V2BoundaryBriefRef = useRef(null);
  const productionEnvGateRef = useRef(null);
  const productionEnvIntakeVerificationRef = useRef(null);
  const productionFirstStageExecutionRef = useRef(null);
  const productionEnvFixChecklistRef = useRef(null);
  const productionEnvMinimumValuesFragmentTemplateRef = useRef(null);
  const productionEnvFillTemplateRef = useRef(null);
  const productionEnvTemplatePreviewRef = useRef(null);
  const statusSummary = buildV1StatusSummaryForPage(goLiveStatus);
  const moduleCompletionRows = goLiveStatus?.moduleCompletionRows?.length
    ? goLiveStatus.moduleCompletionRows
    : v1ModuleCompletionRows;
  const unblockPlan = goLiveStatus?.unblockPlan?.phases?.length
    ? goLiveStatus.unblockPlan
    : v1UnblockPlan;
  const v2DifferenceItemsForPage = goLiveStatus?.v2DifferenceItems?.length
    ? goLiveStatus.v2DifferenceItems
    : v2DifferenceItems;
  const productionEnvFixChecklist = goLiveStatus?.productionEnvFixChecklist?.items?.length
    ? goLiveStatus.productionEnvFixChecklist
    : null;
  const fieldEvidenceProgress = goLiveStatus?.fieldEvidenceProgress?.available
    ? goLiveStatus.fieldEvidenceProgress
    : null;
  const fieldEvidenceIntakeGuidance = goLiveStatus?.fieldEvidenceIntakeGuidance?.available
    ? goLiveStatus.fieldEvidenceIntakeGuidance
    : null;
  const fieldEvidenceIntakeQuality = goLiveStatus?.fieldEvidenceIntakeQuality?.available
    ? goLiveStatus.fieldEvidenceIntakeQuality
    : null;
  const roleTaskBoard = goLiveStatus?.roleTaskBoard?.available
    ? goLiveStatus.roleTaskBoard
    : null;
  const v1V2BoundaryBrief = goLiveStatus?.v1V2BoundaryBrief?.available
    ? goLiveStatus.v1V2BoundaryBrief
    : null;
  const v1MustContinueItemsForPage = v1V2BoundaryBrief
    ? (showAllV1MustContinueItems ? v1V2BoundaryBrief.v1MustContinue : v1V2BoundaryBrief.v1MustContinue.slice(0, 4))
    : [];
  const v2BoundaryDifferencesForPage = v1V2BoundaryBrief
    ? (showAllV2BoundaryDifferences ? v1V2BoundaryBrief.v2Differences : v1V2BoundaryBrief.v2Differences.slice(0, 5))
    : [];
  const v1V2ModuleDifferencesForPage = v1V2BoundaryBrief
    ? (showAllV1V2ModuleDifferences ? v1V2BoundaryBrief.moduleDifferences : v1V2BoundaryBrief.moduleDifferences.slice(0, 5))
    : [];
  const ownerDecisionBrief = goLiveStatus?.ownerDecisionBrief?.available
    ? goLiveStatus.ownerDecisionBrief
    : null;
  const completionAudit = goLiveStatus?.completionAudit?.available
    ? goLiveStatus.completionAudit
    : null;
  const runtimeReadinessBlockers = goLiveStatus?.runtimeReadinessBlockers?.available
    ? goLiveStatus.runtimeReadinessBlockers
    : null;
  const fieldAcceptanceReport = goLiveStatus?.fieldAcceptanceReport?.available
    ? goLiveStatus.fieldAcceptanceReport
    : null;
  const productionEnvGate = goLiveStatus?.productionEnvGate?.available
    ? goLiveStatus.productionEnvGate
    : null;
  const productionEnvIntakeVerification = goLiveStatus?.productionEnvIntakeVerification?.available
    ? goLiveStatus.productionEnvIntakeVerification
    : null;
  const productionEnvMinimumBlockingItems = productionEnvIntakeVerification?.minimumBlockingItems ?? [];
  const productionFirstStageExecution = goLiveStatus?.productionFirstStageExecution?.available
    ? goLiveStatus.productionFirstStageExecution
    : null;
  const productionPersistenceEvidence = goLiveStatus?.productionPersistenceEvidence?.available
    ? goLiveStatus.productionPersistenceEvidence
    : null;
  const productionPersistenceEvidenceSummary = productionPersistenceEvidence?.summary ?? {};
  const productionPersistenceEvidenceLatestBlockers = productionPersistenceEvidence?.blockingStages ?? [];
  const productionPersistenceEvidenceLiveResult = productionPersistenceEvidenceAction?.result ?? null;
  const productionPersistenceEvidenceLiveSummary = productionPersistenceEvidenceLiveResult?.summary ?? {};
  const productionPersistenceEvidenceGuidance = productionPersistenceEvidenceLiveResult?.serverConfigGuidance ?? {};
  const productionPersistenceEvidenceBlockers = [
    ...(productionPersistenceEvidenceLiveResult?.blockingItems ?? []),
    ...(productionPersistenceEvidenceLiveResult?.blockingStages ?? []),
  ];
  const productionEnvFillTemplate = goLiveStatus?.productionEnvFillTemplate?.available
    ? goLiveStatus.productionEnvFillTemplate
    : null;
  const productionEnvMinimumValuesFragmentTemplate = goLiveStatus?.productionEnvMinimumValuesFragmentTemplate?.available
    ? goLiveStatus.productionEnvMinimumValuesFragmentTemplate
    : null;
  const productionEnvValuesFragmentSourceStatus = goLiveStatus?.productionEnvValuesFragmentSourceStatus?.available
    ? goLiveStatus.productionEnvValuesFragmentSourceStatus
    : null;
  const productionEnvValuesApplyGateStatus = goLiveStatus?.productionEnvValuesApplyGateStatus?.available
    ? goLiveStatus.productionEnvValuesApplyGateStatus
    : null;
  const productionEnvFixItemsForPage = productionEnvFixChecklist
    ? (showAllProductionEnvFixItems
        ? productionEnvFixChecklist.items
        : productionEnvFixChecklist.items.slice(0, 6))
    : [];
  const productionEnvVariableCheckOverlay = buildProductionEnvVariableCheckOverlayForPage(
    productionEnvFixChecklist?.items ?? [],
    [
      { sourceLabel: "安全 env 文件应用预检", result: productionEnvFilePreviewPrecheckAction.result },
      { sourceLabel: "当前 env 预检", result: productionEnvPrecheckAction.result },
    ],
  );
  const productionEnvTemplatePreviewLines = productionEnvFillTemplate?.previewLines ?? [];
  const productionEnvTemplateSectionIndexByLabel = new Map();
  productionEnvTemplatePreviewLines.forEach((line, index) => {
    const sectionLabel = getProductionEnvTemplateSectionLabel(line);
    if (sectionLabel && !productionEnvTemplateSectionIndexByLabel.has(sectionLabel)) {
      productionEnvTemplateSectionIndexByLabel.set(sectionLabel, index);
    }
  });
  const productionEnvTemplateLinesForPage = productionEnvFillTemplate
    ? (showAllProductionEnvTemplateLines
        ? productionEnvTemplatePreviewLines
        : productionEnvTemplatePreviewLines.slice(0, 36))
    : [];
  const productionEnvMinimumTemplatePreviewLines = productionEnvMinimumValuesFragmentTemplate?.previewLines ?? [];
  const productionEnvMinimumTemplateLinesForPage = productionEnvMinimumValuesFragmentTemplate
    ? (showAllProductionEnvMinimumTemplateLines
        ? productionEnvMinimumTemplatePreviewLines
        : productionEnvMinimumTemplatePreviewLines.slice(0, 34))
    : [];
  const focusProductionEnvTemplateSection = (item) => {
    const sectionIndex = productionEnvTemplateSectionIndexByLabel.get(item.label);
    if (!Number.isFinite(sectionIndex)) return;
    setShowAllProductionEnvTemplateLines(true);
    setFocusedProductionEnvTemplateLineIndex(sectionIndex);
    window.setTimeout(() => {
      const target = productionEnvTemplatePreviewRef.current?.querySelector(`[data-env-line-index="${sectionIndex}"]`);
      target?.scrollIntoView({ block: "center", inline: "nearest" });
    }, 0);
  };
  const selectedModule = moduleCompletionRows.find((item) => item.module === selectedModuleName) ?? moduleCompletionRows[0];
  const selectedPhase = unblockPlan.phases.find((item) => item.key === selectedPhaseKey) ?? unblockPlan.phases[0];
  const lastSuccessfulTimestamp = Date.parse(String(goLiveMeta.lastSuccessfulAt ?? ""));
  const hasV1StatusSnapshot = Boolean(goLiveStatus);
  const v1StatusSnapshotExpired =
    hasV1StatusSnapshot &&
    (!Number.isFinite(lastSuccessfulTimestamp) || Date.now() - lastSuccessfulTimestamp > v1StatusSnapshotMaxAgeMs);
  const statusSourceLabel = !hasV1StatusSnapshot
    ? (goLiveMeta.loading ? "后端状态读取中" : "状态未读取")
    : v1StatusSnapshotExpired
      ? "后端快照已过期"
      : goLiveMeta.error
        ? "后端快照（未刷新）"
        : goLiveStatus.sourceLabel || "后端 go-live 产物";
  const statusSourceDetail = goLiveMeta.loading
    ? "刷新中"
    : !hasV1StatusSnapshot
      ? goLiveMeta.error || "尚未取得后端 V1 状态。"
      : v1StatusSnapshotExpired
        ? `最近成功读取：${formatV1StatusSnapshotTime(goLiveMeta.lastSuccessfulAt)}，已超过 15 分钟。`
        : goLiveMeta.error
          ? `API 不可用；显示最近成功快照：${formatV1StatusSnapshotTime(goLiveMeta.lastSuccessfulAt)}。`
          : `后端已同步：${formatV1StatusSnapshotTime(goLiveMeta.lastSuccessfulAt)}`;
  const selectedPhaseRoles = selectedPhase.roleItems?.length
    ? selectedPhase.roleItems
    : String(selectedPhase.roles ?? "").split("、").map((role) => role.trim()).filter(Boolean);
  const selectedPhaseGroups = Array.isArray(selectedPhase.groups)
    ? selectedPhase.groups.map(normalizeV1PhaseGroupForPage).filter((group) => group.group)
    : [];
  const selectedPhaseTasks = Array.isArray(selectedPhase.firstTasks)
    ? selectedPhase.firstTasks.map(normalizeV1PhaseTaskForPage).filter((task) => task.title)
    : [];
  const canGenerateFieldEvidenceDraft =
    Boolean(onGenerateFieldEvidenceDraft) &&
    fieldEvidenceIntakeQuality?.summary?.canGenerateDraft === true &&
    !fieldEvidenceDraftAction.loading &&
    !fieldEvidenceValidationAction.loading &&
    !releaseCandidateRefreshPrecheckAction.loading &&
    !releaseCandidateRefreshAction.loading;
  const canValidateFieldEvidenceDraft =
    Boolean(onValidateFieldEvidenceDraft) &&
    fieldEvidenceIntakeQuality?.summary?.draftManifestStatus === "available" &&
    !fieldEvidenceDraftAction.loading &&
    !fieldEvidenceValidationAction.loading &&
    !releaseCandidateRefreshPrecheckAction.loading &&
    !releaseCandidateRefreshAction.loading;
  const canPrecheckReleaseCandidateRefresh =
    Boolean(onPrecheckReleaseCandidateRefresh) &&
    Boolean(fieldEvidenceIntakeQuality) &&
    !fieldEvidenceDraftAction.loading &&
    !fieldEvidenceValidationAction.loading &&
    !releaseCandidateRefreshPrecheckAction.loading &&
    !releaseCandidateRefreshAction.loading;
  const canRefreshReleaseCandidate =
    Boolean(onRefreshReleaseCandidate) &&
    Boolean(fieldEvidenceIntakeQuality) &&
    !fieldEvidenceDraftAction.loading &&
    !fieldEvidenceValidationAction.loading &&
    !releaseCandidateRefreshPrecheckAction.loading &&
    !releaseCandidateRefreshAction.loading;
  const canRunFieldEvidenceCloseoutReview =
    canValidateFieldEvidenceDraft &&
    canPrecheckReleaseCandidateRefresh;
  const canRunV1CloseoutFullReview =
    canPrecheckReleaseCandidateRefresh &&
    Boolean(onValidateFieldEvidenceDraft) &&
    Boolean(onPrecheckProductionEnv) &&
    Boolean(onPrecheckProductionEnvFileAudit) &&
    Boolean(onPrecheckProductionEnvFilePreview) &&
    Boolean(onPrecheckV1V2Boundary) &&
    Boolean(onPrecheckProductionGoLive) &&
    Boolean(onPrecheckRuntimeReadiness) &&
    !productionEnvPrecheckAction.loading &&
    !productionEnvFileAuditPrecheckAction.loading &&
    !productionEnvFilePreviewPrecheckAction.loading &&
    !v1V2BoundaryPrecheckAction.loading &&
    !productionGoLivePrecheckAction.loading &&
    !runtimeReadinessPrecheckAction.loading;
  const canShowProductionEnvFrontDoorReview =
    Boolean(onPrecheckProductionEnvFileAudit) &&
    Boolean(onPrecheckProductionEnvFilePreview) &&
    Boolean(onPrecheckProductionEnv);
  const productionEnvFrontDoorReviewLoading =
    productionEnvFileAuditPrecheckAction.loading ||
    productionEnvFilePreviewPrecheckAction.loading ||
    productionEnvPrecheckAction.loading;
  const canRunProductionEnvFrontDoorReview =
    canShowProductionEnvFrontDoorReview &&
    !productionEnvFrontDoorReviewLoading;
  const canReviewFieldEvidenceAfterStage =
    Boolean(onValidateFieldEvidenceDraft) &&
    Boolean(onPrecheckReleaseCandidateRefresh) &&
    Boolean(fieldEvidenceIntakeQuality) &&
    !fieldEvidenceDraftAction.loading &&
    !fieldEvidenceValidationAction.loading &&
    !releaseCandidateRefreshPrecheckAction.loading &&
    !releaseCandidateRefreshAction.loading;
  const missingEvidenceOptions = fieldEvidenceProgress?.missingItems || [];
  const missingEvidenceDisplayLimit = 12;
  const fieldEvidenceGroupSummaries = fieldEvidenceProgress?.groupSummaries?.length
    ? fieldEvidenceProgress.groupSummaries
    : buildFieldEvidenceGroupSummaries(
        fieldEvidenceProgress?.groups || [],
        missingEvidenceOptions,
      );
  const selectedMissingEvidenceGroup =
    fieldEvidenceGroupSummaries.find((group) => group.key === selectedMissingEvidenceGroupKey) || null;
  const scopedMissingEvidenceOptions = selectedMissingEvidenceGroup
    ? missingEvidenceOptions.filter((item) => item.groupKey === selectedMissingEvidenceGroup.key)
    : missingEvidenceOptions;
  const visibleMissingEvidenceItems = showAllMissingEvidenceItems
    ? scopedMissingEvidenceOptions
    : scopedMissingEvidenceOptions.slice(0, missingEvidenceDisplayLimit);
  const missingEvidenceTotalCount =
    selectedMissingEvidenceGroup
      ? scopedMissingEvidenceOptions.length
      : fieldEvidenceProgress?.summary?.missingEvidenceItemCount || missingEvidenceOptions.length;
  const missingEvidenceDisplayCountLabel = `${visibleMissingEvidenceItems.length}/${missingEvidenceTotalCount}`;
  const missingEvidenceDisplayLabel = selectedMissingEvidenceGroup
    ? `${selectedMissingEvidenceGroup.label} ${missingEvidenceDisplayCountLabel}`
    : missingEvidenceDisplayCountLabel;
  const canToggleMissingEvidenceItems = scopedMissingEvidenceOptions.length > missingEvidenceDisplayLimit;
  const signoffBoundaryOptions = fieldEvidenceProgress?.signoffBoundaryActions || [];
  const roleTaskCategorySummaries = roleTaskBoard
    ? buildRoleTaskCategorySummaries(roleTaskBoard)
    : [];
  const selectedEvidenceStageItem =
    missingEvidenceOptions.find((item) => `${item.groupKey}:${item.key}` === evidenceStageDraft.selectionKey) ||
    missingEvidenceOptions[0] ||
    null;
  const selectedEvidenceAttachmentOwnerId = selectedEvidenceStageItem
    ? `${selectedEvidenceStageItem.groupKey || "field_evidence"}:${selectedEvidenceStageItem.key || "evidence_item"}`
    : "";
  const selectedEvidenceAttachmentListResult =
    fieldEvidenceAttachmentListAction.result?.ownerId === selectedEvidenceAttachmentOwnerId
      ? fieldEvidenceAttachmentListAction.result
      : null;
  const selectedEvidenceAttachmentListError =
    fieldEvidenceAttachmentListAction.ownerId === selectedEvidenceAttachmentOwnerId
      ? fieldEvidenceAttachmentListAction.error
      : "";
  const selectedSignoffBoundaryStageItem =
    signoffBoundaryOptions.find((item) => `${item.type}:${item.key}` === signoffStageDraft.selectionKey) ||
    signoffBoundaryOptions[0] ||
    null;
  const selectedSignoffBoundaryAttachmentOwnerId = selectedSignoffBoundaryStageItem
    ? `${selectedSignoffBoundaryStageItem.type || "signoff"}:${selectedSignoffBoundaryStageItem.key || "owner"}`
    : "";
  const selectedSignoffBoundaryAttachmentListResult =
    signoffBoundaryAttachmentListAction.result?.ownerId === selectedSignoffBoundaryAttachmentOwnerId
      ? signoffBoundaryAttachmentListAction.result
      : null;
  const selectedSignoffBoundaryAttachmentListError =
    signoffBoundaryAttachmentListAction.ownerId === selectedSignoffBoundaryAttachmentOwnerId
      ? signoffBoundaryAttachmentListAction.error
      : "";
  const selectedSignoffStatusOptions =
    selectedSignoffBoundaryStageItem?.type === "boundary"
      ? v1BoundaryStageStatusOptions
      : v1SignoffStageStatusOptions;
  const evidenceStageRequiresRef = ["passed", "accepted"].includes(evidenceStageDraft.onsiteStatus);
  const signoffStageRequiresPersonTime =
    selectedSignoffBoundaryStageItem?.type === "boundary"
      ? signoffStageDraft.onsiteStatus === "confirmed"
      : ["signed", "accepted"].includes(signoffStageDraft.onsiteStatus);
  const canStageEvidenceRow =
    Boolean(onStageFieldEvidenceRow) &&
    Boolean(selectedEvidenceStageItem) &&
    !fieldEvidenceStageRowAction.loading &&
    !fieldEvidenceAttachmentAction.loading &&
    (!evidenceStageRequiresRef || evidenceStageDraft.onsiteEvidenceRef.trim());
  const canStageEvidenceRowAndReview =
    canStageEvidenceRow &&
    canReviewFieldEvidenceAfterStage;
  const canUploadAndStageEvidenceAttachment =
    Boolean(onUploadFieldEvidenceAttachment) &&
    Boolean(onStageFieldEvidenceRow) &&
    Boolean(selectedEvidenceStageItem) &&
    Boolean(evidenceAttachmentFile) &&
    !fieldEvidenceAttachmentAction.loading &&
    !fieldEvidenceAttachmentListAction.loading &&
    !fieldEvidenceStageRowAction.loading;
  const canListEvidenceAttachments =
    Boolean(onListFieldEvidenceAttachments) &&
    Boolean(selectedEvidenceStageItem) &&
    !fieldEvidenceAttachmentAction.loading &&
    !fieldEvidenceAttachmentListAction.loading &&
    !fieldEvidenceStageRowAction.loading;
  const canStageSignoffBoundaryRow =
    Boolean(onStageFieldEvidenceRow) &&
    Boolean(selectedSignoffBoundaryStageItem) &&
    !fieldEvidenceStageRowAction.loading &&
    !signoffBoundaryAttachmentAction.loading &&
    !signoffBoundaryAttachmentListAction.loading &&
    (!signoffStageRequiresPersonTime || (signoffStageDraft.person.trim() && signoffStageDraft.time.trim()));
  const canStageSignoffBoundaryRowAndReview =
    canStageSignoffBoundaryRow &&
    canReviewFieldEvidenceAfterStage;
  const canStageBoundaryRowAndPrecheck =
    canStageSignoffBoundaryRow &&
    selectedSignoffBoundaryStageItem?.type === "boundary" &&
    Boolean(onPrecheckV1V2Boundary) &&
    !v1V2BoundaryPrecheckAction.loading;
  const canUploadSignoffBoundaryAttachment =
    Boolean(onUploadSignoffBoundaryAttachment) &&
    Boolean(selectedSignoffBoundaryStageItem) &&
    Boolean(signoffBoundaryAttachmentFile) &&
    !fieldEvidenceStageRowAction.loading &&
    !signoffBoundaryAttachmentAction.loading &&
    !signoffBoundaryAttachmentListAction.loading;
  const canListSignoffBoundaryAttachments =
    Boolean(onListSignoffBoundaryAttachments) &&
    Boolean(selectedSignoffBoundaryStageItem) &&
    !fieldEvidenceStageRowAction.loading &&
    !signoffBoundaryAttachmentAction.loading &&
    !signoffBoundaryAttachmentListAction.loading;

  useEffect(() => {
    if (!missingEvidenceOptions.length) return;
    const stillExists = missingEvidenceOptions.some((item) => `${item.groupKey}:${item.key}` === evidenceStageDraft.selectionKey);
    if (!stillExists) {
      const first = missingEvidenceOptions[0];
      setEvidenceStageDraft((current) => ({
        ...current,
        selectionKey: `${first.groupKey}:${first.key}`,
      }));
    }
  }, [missingEvidenceOptions, evidenceStageDraft.selectionKey]);

  useEffect(() => {
    if (!selectedMissingEvidenceGroupKey) return;
    const stillExists = fieldEvidenceGroupSummaries.some((group) => group.key === selectedMissingEvidenceGroupKey);
    if (!stillExists) {
      setSelectedMissingEvidenceGroupKey("");
    }
  }, [fieldEvidenceGroupSummaries, selectedMissingEvidenceGroupKey]);

  useEffect(() => {
    if (!signoffBoundaryOptions.length) return;
    const stillExists = signoffBoundaryOptions.some((item) => `${item.type}:${item.key}` === signoffStageDraft.selectionKey);
    if (!stillExists) {
      const first = signoffBoundaryOptions[0];
      setSignoffStageDraft((current) => ({
        ...current,
        selectionKey: `${first.type}:${first.key}`,
        onsiteStatus: first.type === "boundary" ? "confirmed" : "signed",
      }));
    }
  }, [signoffBoundaryOptions, signoffStageDraft.selectionKey]);

  if (!hasV1StatusSnapshot) {
    return (
      <section className="v1-status-page">
        <div className="v1-status-banner v1-status-unavailable-banner">
          <div>
            <StatusPill tone="warning">{goLiveMeta.loading ? "状态读取中" : "状态未读取"}</StatusPill>
            <h2>V1 完成度快照</h2>
            <p>未能从后端取得 V1 上线状态，不展示固定完成度、发布门禁、现场证据或签字数字。</p>
          </div>
          <div className="v1-status-source">
            <span>最近成功快照：--</span>
            <strong>{statusSourceLabel}</strong>
            <em>{statusSourceDetail}</em>
          </div>
        </div>
        <div className="v1-status-unavailable">
          <strong>当前不能据此判断 V1 是否可上线。</strong>
          <span>{goLiveMeta.loading ? "正在读取后端 go-live 产物。" : "接口恢复后将自动读取最新后端 go-live 产物。"}</span>
        </div>
      </section>
    );
  }

  function stageSelectedEvidenceRow() {
    if (!canStageEvidenceRow || !selectedEvidenceStageItem) return;
    onStageFieldEvidenceRow({
      rowType: "evidence",
      groupKey: selectedEvidenceStageItem.groupKey,
      itemKey: selectedEvidenceStageItem.key,
      onsiteStatus: evidenceStageDraft.onsiteStatus,
      onsiteEvidenceRef: evidenceStageDraft.onsiteEvidenceRef,
      onsiteNotes: evidenceStageDraft.onsiteNotes,
    });
  }

  async function stageSelectedEvidenceRowAndReview() {
    if (!canStageEvidenceRowAndReview || !selectedEvidenceStageItem) return;
    const result = await onStageFieldEvidenceRow({
      rowType: "evidence",
      groupKey: selectedEvidenceStageItem.groupKey,
      itemKey: selectedEvidenceStageItem.key,
      onsiteStatus: evidenceStageDraft.onsiteStatus,
      onsiteEvidenceRef: evidenceStageDraft.onsiteEvidenceRef,
      onsiteNotes: evidenceStageDraft.onsiteNotes,
    });
    if (!result?.stageResult || result?.blocked) return;
    await onValidateFieldEvidenceDraft();
    await onPrecheckReleaseCandidateRefresh();
  }

  async function uploadAndStageSelectedEvidenceAttachment() {
    if (!canUploadAndStageEvidenceAttachment || !selectedEvidenceStageItem) return;
    const uploadResult = await onUploadFieldEvidenceAttachment({
      evidenceItem: selectedEvidenceStageItem,
      file: evidenceAttachmentFile,
      remark: evidenceStageDraft.onsiteNotes,
    });
    const attachmentId = uploadResult?.attachment?.attachmentId || "";
    if (!attachmentId || uploadResult?.blocked) return;
    setEvidenceStageDraft((current) => ({
      ...current,
      onsiteEvidenceRef: attachmentId,
      onsiteNotes: current.onsiteNotes || uploadResult.attachment.fileName || "",
    }));
    await onStageFieldEvidenceRow({
      rowType: "evidence",
      groupKey: selectedEvidenceStageItem.groupKey,
      itemKey: selectedEvidenceStageItem.key,
      onsiteStatus: evidenceStageDraft.onsiteStatus,
      onsiteEvidenceRef: attachmentId,
      onsiteNotes: evidenceStageDraft.onsiteNotes || uploadResult.attachment.fileName || "",
    });
  }

  async function listSelectedEvidenceAttachments() {
    if (!canListEvidenceAttachments || !selectedEvidenceStageItem) return;
    await onListFieldEvidenceAttachments({
      evidenceItem: selectedEvidenceStageItem,
    });
  }

  function selectMissingEvidenceForStage(item) {
    if (!item?.groupKey || !item?.key) return;
    setEvidenceStageDraft((current) => ({
      ...current,
      selectionKey: `${item.groupKey}:${item.key}`,
      onsiteStatus: current.onsiteStatus || "passed",
      onsiteEvidenceRef: "",
      onsiteNotes: "",
    }));
    setEvidenceAttachmentFile(null);
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      evidenceStageCardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      evidenceStageRefInputRef.current?.focus();
    });
  }

  function selectSignoffBoundaryForStage(item) {
    if (!item?.type || !item?.key) return;
    setSignoffStageDraft({
      selectionKey: `${item.type}:${item.key}`,
      onsiteStatus: item.type === "boundary" ? "confirmed" : "signed",
      person: "",
      time: "",
      onsiteNotes: "",
    });
    setSignoffBoundaryAttachmentFile(null);
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      signoffStageCardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      signoffStagePersonInputRef.current?.focus();
    });
  }

  function fillEvidenceRefFromAttachment(attachment) {
    const attachmentId = attachment?.attachmentId || "";
    if (!/^ATT-/.test(attachmentId)) return;
    setEvidenceStageDraft((current) => ({
      ...current,
      onsiteEvidenceRef: attachmentId,
      onsiteNotes: current.onsiteNotes || attachment.fileName || "",
    }));
  }

  async function uploadAndFillSelectedSignoffBoundaryAttachment() {
    if (!canUploadSignoffBoundaryAttachment || !selectedSignoffBoundaryStageItem) return;
    const uploadResult = await onUploadSignoffBoundaryAttachment({
      signoffItem: selectedSignoffBoundaryStageItem,
      file: signoffBoundaryAttachmentFile,
      remark: signoffStageDraft.onsiteNotes,
    });
    const attachment = uploadResult?.attachment;
    if (!attachment?.attachmentId || uploadResult?.blocked) return;
    fillSignoffBoundaryNoteFromAttachment(attachment);
  }

  async function listSelectedSignoffBoundaryAttachments() {
    if (!canListSignoffBoundaryAttachments || !selectedSignoffBoundaryStageItem) return;
    await onListSignoffBoundaryAttachments({
      signoffItem: selectedSignoffBoundaryStageItem,
    });
  }

  async function runFieldEvidenceCloseoutReview() {
    if (!canRunFieldEvidenceCloseoutReview) return;
    await onValidateFieldEvidenceDraft();
    await onPrecheckReleaseCandidateRefresh();
  }

  async function runV1CloseoutFullReview() {
    if (!canRunV1CloseoutFullReview) return;
    await onPrecheckProductionEnvFileAudit();
    await onPrecheckProductionEnvFilePreview();
    await onPrecheckProductionEnv();
    await onPrecheckProductionGoLive();
    if (canValidateFieldEvidenceDraft) await onValidateFieldEvidenceDraft();
    await onPrecheckV1V2Boundary();
    await onPrecheckReleaseCandidateRefresh();
    await onPrecheckRuntimeReadiness();
  }

  async function runProductionEnvFrontDoorReview({ includeCombo = false } = {}) {
    if (!canRunProductionEnvFrontDoorReview) return;
    await onPrecheckProductionEnvFileAudit();
    await onPrecheckProductionEnvFilePreview();
    await onPrecheckProductionEnv();
    if (includeCombo && onPrecheckProductionGoLive && !productionGoLivePrecheckAction.loading) {
      await onPrecheckProductionGoLive();
    }
  }

  function fillSignoffBoundaryNoteFromAttachment(attachment) {
    const attachmentId = attachment?.attachmentId || "";
    if (!/^ATT-/.test(attachmentId)) return;
    const fileName = attachment.fileName || "签字附件";
    const attachmentNote = `附件:${attachmentId} ${fileName}`;
    setSignoffStageDraft((current) => ({
      ...current,
      onsiteNotes: current.onsiteNotes.includes(attachmentId)
        ? current.onsiteNotes
        : current.onsiteNotes
          ? `${current.onsiteNotes}；${attachmentNote}`
        : attachmentNote,
    }));
  }

  function buildSelectedSignoffBoundaryStageRow() {
    if (!selectedSignoffBoundaryStageItem) return null;
    const isBoundary = selectedSignoffBoundaryStageItem.type === "boundary";
    return {
      rowType: selectedSignoffBoundaryStageItem.type,
      role: selectedSignoffBoundaryStageItem.key,
      onsiteStatus: signoffStageDraft.onsiteStatus,
      onsiteSigner: isBoundary ? "" : signoffStageDraft.person,
      onsiteSignedAt: isBoundary ? "" : signoffStageDraft.time,
      onsiteConfirmedBy: isBoundary ? signoffStageDraft.person : "",
      onsiteConfirmedAt: isBoundary ? signoffStageDraft.time : "",
      onsiteNotes: signoffStageDraft.onsiteNotes,
    };
  }

  function stageSelectedSignoffBoundaryRow() {
    if (!canStageSignoffBoundaryRow || !selectedSignoffBoundaryStageItem) return;
    const row = buildSelectedSignoffBoundaryStageRow();
    if (!row) return;
    onStageFieldEvidenceRow(row);
  }

  async function stageSelectedSignoffBoundaryRowAndReview() {
    if (!canStageSignoffBoundaryRowAndReview || !selectedSignoffBoundaryStageItem) return;
    const row = buildSelectedSignoffBoundaryStageRow();
    if (!row) return;
    const result = await onStageFieldEvidenceRow(row);
    if (!result?.stageResult || result?.blocked) return;
    await onValidateFieldEvidenceDraft();
    await onPrecheckReleaseCandidateRefresh();
  }

  async function stageSelectedBoundaryRowAndPrecheck() {
    if (!canStageBoundaryRowAndPrecheck || selectedSignoffBoundaryStageItem?.type !== "boundary") return;
    const row = buildSelectedSignoffBoundaryStageRow();
    if (!row) return;
    const result = await onStageFieldEvidenceRow(row);
    if (!result?.stageResult || result?.blocked) return;
    await onPrecheckV1V2Boundary();
  }

  function scrollV1StatusRefIntoView(targetRef) {
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      targetRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }

  function focusProductionEnvFixChecklistFromBlocker() {
    setShowAllProductionEnvFixItems(true);
    scrollV1StatusRefIntoView(productionEnvFixChecklistRef);
  }

  function focusV1V2BoundaryBriefFromBlocker() {
    setShowAllV1MustContinueItems(true);
    scrollV1StatusRefIntoView(v1V2BoundaryBriefRef);
  }

  function focusProductionEnvFillTemplateFromPhase() {
    setShowAllProductionEnvTemplateLines(true);
    scrollV1StatusRefIntoView(productionEnvFillTemplateRef);
  }

  function focusProductionEnvMinimumValuesTemplateFromPhase() {
    setShowAllProductionEnvMinimumTemplateLines(true);
    scrollV1StatusRefIntoView(productionEnvMinimumValuesFragmentTemplateRef);
  }

  function findProductionEnvFixItemForGate(item = {}) {
    const key = item.key || "";
    const label = item.label || "";
    const variableLabel = item.variableLabel || "";
    return productionEnvFixChecklist?.items?.find((fixItem) => {
      const fixKey = fixItem.key || "";
      const fixLabel = fixItem.label || "";
      return (key && fixKey === key) ||
        (label && fixLabel === label) ||
        (variableLabel && fixItem.variableLabel === variableLabel);
    }) || null;
  }

  function focusProductionEnvFixItemFromGate(item = {}) {
    setShowAllProductionEnvFixItems(true);
    scrollV1StatusRefIntoView(productionEnvFixChecklistRef);
    const fixItem = findProductionEnvFixItemForGate(item);
    if (fixItem && productionEnvTemplateSectionIndexByLabel.has(fixItem.label)) {
      setFocusedProductionEnvTemplateLineIndex(productionEnvTemplateSectionIndexByLabel.get(fixItem.label));
    }
  }

  function buildProductionEnvGateActions(item = {}) {
    const key = item.key || "";
    const haystack = [
      key,
      item.label,
      item.ownerRole,
      item.nextAction,
      item.variableLabel,
    ].filter(Boolean).join(" ");
    const actions = [];
    const fixItem = findProductionEnvFixItemForGate(item);
    const knownProductionEnvGateKeys = new Set([
      "v1-persistence-profile",
      "attachment-object-storage-env",
      "statement-export-object-storage-env",
      "system-printer-command-bridge-env",
      "cups-preflight-env",
      "v1-readiness-identity-env",
      "v1-field-acceptance-report-env",
      "local-v1-acceptance-bypass-env",
      "preflight-redaction-safeguard",
    ]);
    const hasKnownProductionEnvGateKey = knownProductionEnvGateKeys.has(key);

    if (fixItem) {
      addPhaseAction(actions, {
        key: "open-env-fix",
        label: "查看修正项",
        onClick: () => focusProductionEnvFixItemFromGate(item),
      });
      if (productionEnvTemplateSectionIndexByLabel.has(fixItem.label)) {
        addPhaseAction(actions, {
          key: "open-env-template-section",
          label: "定位草稿段",
          onClick: () => focusProductionEnvTemplateSection(fixItem),
        });
      }
    }

    if (onPrecheckProductionEnv) {
      addPhaseAction(actions, {
        key: "run-production-env-precheck",
        label: productionEnvPrecheckAction.loading ? "预检中" : "当前 env 预检",
        onClick: onPrecheckProductionEnv,
        disabled: productionEnvPrecheckAction.loading,
      });
    }

    if ((key === "v1-persistence-profile" || (!hasKnownProductionEnvGateKey && (haystack.includes("持久化") || haystack.includes("PostgreSQL")))) && onPrecheckV1Persistence) {
      addPhaseAction(actions, {
        key: "run-persistence-precheck",
        label: persistencePrecheckAction.loading ? "预检中" : "持久化预检",
        onClick: onPrecheckV1Persistence,
        disabled: persistencePrecheckAction.loading,
      });
    }

    if ((key === "attachment-object-storage-env" || (!hasKnownProductionEnvGateKey && haystack.includes("附件对象存储"))) && onPrecheckV1AttachmentRetention) {
      addPhaseAction(actions, {
        key: "run-attachment-retention",
        label: attachmentRetentionPrecheckAction.loading ? "预检中" : "附件留档预检",
        onClick: onPrecheckV1AttachmentRetention,
        disabled: attachmentRetentionPrecheckAction.loading,
      });
    }

    if ((key === "system-printer-command-bridge-env" || (!hasKnownProductionEnvGateKey && haystack.includes("command_bridge"))) && onPrecheckV1PrintSpool) {
      addPhaseAction(actions, {
        key: "run-print-spool",
        label: printSpoolPrecheckAction.loading ? "预检中" : "spool 预检",
        onClick: onPrecheckV1PrintSpool,
        disabled: printSpoolPrecheckAction.loading,
      });
    }

    if ((key === "cups-preflight-env" || (!hasKnownProductionEnvGateKey && haystack.includes("CUPS"))) && onPrecheckV1PrintCups) {
      addPhaseAction(actions, {
        key: "run-print-cups",
        label: printCupsPrecheckAction.loading ? "预检中" : "CUPS 预检",
        onClick: onPrecheckV1PrintCups,
        disabled: printCupsPrecheckAction.loading,
      });
    }

    if ((key === "system-printer-command-bridge-env" || key === "cups-preflight-env" || (!hasKnownProductionEnvGateKey && haystack.includes("打印"))) && onPrecheckV1PrintReadiness) {
      addPhaseAction(actions, {
        key: "run-print-readiness",
        label: printReadinessPrecheckAction.loading ? "预检中" : "打印门禁预检",
        onClick: onPrecheckV1PrintReadiness,
        disabled: printReadinessPrecheckAction.loading,
      });
    }

    if (onPrecheckProductionGoLive) {
      addPhaseAction(actions, {
        key: "run-production-go-live",
        label: productionGoLivePrecheckAction.loading ? "预检中" : "组合预检",
        onClick: onPrecheckProductionGoLive,
        disabled: productionGoLivePrecheckAction.loading,
      });
    }

    return actions;
  }

  function focusRuntimeReadinessFromPhase() {
    scrollV1StatusRefIntoView(runtimeReadinessSectionRef);
  }

  function focusFieldEvidenceProgressFromPhase() {
    setShowAllMissingEvidenceItems(true);
    scrollV1StatusRefIntoView(fieldEvidenceProgressRef);
  }

  function focusFieldAcceptanceReportFromPhase() {
    scrollV1StatusRefIntoView(fieldAcceptanceReportRef);
  }

  function findMatchingMissingEvidenceOptionByText(patterns = []) {
    const normalizedPatterns = patterns.filter(Boolean);
    if (!normalizedPatterns.length) return null;
    return missingEvidenceOptions.find((item) => {
      const haystack = [
        item.label,
        item.groupLabel,
        item.group,
        item.ownerRole,
        item.progressLabel,
        item.nextAction,
      ].filter(Boolean).join(" ");
      return normalizedPatterns.some((pattern) => haystack.includes(pattern));
    }) || null;
  }

  function findMissingEvidenceOptionByText(patterns = []) {
    return findMatchingMissingEvidenceOptionByText(patterns) || missingEvidenceOptions[0] || null;
  }

  function findSignoffBoundaryOptionByText(patterns = []) {
    const normalizedPatterns = patterns.filter(Boolean);
    return signoffBoundaryOptions.find((item) => {
      const haystack = [
        item.label,
        item.key,
        item.role,
        item.type,
        item.progressLabel,
        item.nextAction,
      ].filter(Boolean).join(" ");
      return normalizedPatterns.some((pattern) => haystack.includes(pattern));
    }) || null;
  }

  function addPhaseAction(actions, action) {
    if (!action || actions.some((item) => item.key === action.key)) return;
    actions.push(action);
  }

  function buildFieldEvidenceGroupSummaries(groups = [], missingItems = []) {
    const missingByGroup = new Map();
    missingItems.forEach((item) => {
      const groupKey = item.groupKey || "ungrouped";
      if (!missingByGroup.has(groupKey)) {
        missingByGroup.set(groupKey, []);
      }
      missingByGroup.get(groupKey).push(item);
    });
    return groups.map((group) => {
      const groupMissingItems = missingByGroup.get(group.key) || [];
      const missingCount = groupMissingItems.length || group.blockedRequired || 0;
      return {
        ...group,
        missingItems: groupMissingItems,
        missingCount,
        missingLabel: group.requiredTotal > 0 ? `${missingCount}/${group.requiredTotal}` : `${missingCount}`,
        firstMissingItem: groupMissingItems[0] || null,
        firstMissingItems: groupMissingItems.slice(0, 3),
        previewItems: groupMissingItems.slice(0, 3),
        hiddenPreviewCount: Math.max(0, groupMissingItems.length - 3),
      };
    }).filter((group) => group.key);
  }

  function focusMissingEvidenceGroup(group = {}) {
    if (!group.key) return;
    setSelectedMissingEvidenceGroupKey(group.key);
    setShowAllMissingEvidenceItems(true);
    scrollV1StatusRefIntoView(fieldEvidenceProgressRef);
  }

  function clearMissingEvidenceGroupFilter() {
    setSelectedMissingEvidenceGroupKey("");
    setShowAllMissingEvidenceItems(false);
    scrollV1StatusRefIntoView(fieldEvidenceProgressRef);
  }

  function buildFieldEvidenceGroupActions(group = {}) {
    const actions = [];
    const groupKey = group.key || "";
    const firstMissingItem = group.firstMissingItem || null;
    const driverSignoffItem = findSignoffBoundaryOptionByText(["司机"]);
    const firstOwnerSignoffItem = findSignoffBoundaryOptionByText(["技术", "管理", "办公室", "财务"]) ||
      signoffBoundaryOptions.find((option) => option.type !== "boundary") ||
      null;
    const boundaryItem = signoffBoundaryOptions.find((option) => option.type === "boundary") || null;

    if (firstMissingItem) {
      addPhaseAction(actions, {
        key: `fill-first-${groupKey}`,
        label: "填本组第一条",
        onClick: () => selectMissingEvidenceForStage(firstMissingItem),
      });
    }

    if (groupKey === "production_persistence") {
      if (onPrecheckV1Persistence) {
        addPhaseAction(actions, {
          key: "run-persistence-precheck",
          label: persistencePrecheckAction.loading ? "预检中" : "持久化预检",
          onClick: onPrecheckV1Persistence,
          disabled: persistencePrecheckAction.loading,
        });
      }
      if (onPrecheckProductionEnv) {
        addPhaseAction(actions, {
          key: "run-production-env-precheck",
          label: productionEnvPrecheckAction.loading ? "预检中" : "当前 env 预检",
          onClick: onPrecheckProductionEnv,
          disabled: productionEnvPrecheckAction.loading,
        });
      }
      if (onPrecheckProductionGoLive) {
        addPhaseAction(actions, {
          key: "run-production-go-live",
          label: productionGoLivePrecheckAction.loading ? "预检中" : "组合预检",
          onClick: onPrecheckProductionGoLive,
          disabled: productionGoLivePrecheckAction.loading,
        });
      }
    }

    if (groupKey === "object_storage") {
      if (onPrecheckV1AttachmentRetention) {
        addPhaseAction(actions, {
          key: "run-attachment-retention",
          label: attachmentRetentionPrecheckAction.loading ? "预检中" : "附件留档预检",
          onClick: onPrecheckV1AttachmentRetention,
          disabled: attachmentRetentionPrecheckAction.loading,
        });
      }
      if (onPrecheckProductionEnv) {
        addPhaseAction(actions, {
          key: "run-production-env-precheck",
          label: productionEnvPrecheckAction.loading ? "预检中" : "当前 env 预检",
          onClick: onPrecheckProductionEnv,
          disabled: productionEnvPrecheckAction.loading,
        });
      }
    }

    if (groupKey === "print_hardware") {
      if (onPrecheckV1PrintSpool) {
        addPhaseAction(actions, {
          key: "run-print-spool",
          label: printSpoolPrecheckAction.loading ? "预检中" : "spool 预检",
          onClick: onPrecheckV1PrintSpool,
          disabled: printSpoolPrecheckAction.loading,
        });
      }
      if (onPrecheckV1PrintCups) {
        addPhaseAction(actions, {
          key: "run-print-cups",
          label: printCupsPrecheckAction.loading ? "预检中" : "CUPS 预检",
          onClick: onPrecheckV1PrintCups,
          disabled: printCupsPrecheckAction.loading,
        });
      }
      if (onPrecheckV1PrintReadiness) {
        addPhaseAction(actions, {
          key: "run-print-readiness",
          label: printReadinessPrecheckAction.loading ? "预检中" : "打印门禁预检",
          onClick: onPrecheckV1PrintReadiness,
          disabled: printReadinessPrecheckAction.loading,
        });
      }
    }

    if (groupKey === "driver_native_device") {
      if (onPrecheckV1DriverReadiness) {
        addPhaseAction(actions, {
          key: "run-driver-readiness",
          label: driverReadinessPrecheckAction.loading ? "预检中" : "司机真机预检",
          onClick: onPrecheckV1DriverReadiness,
          disabled: driverReadinessPrecheckAction.loading,
        });
      }
      if (driverSignoffItem) {
        addPhaseAction(actions, {
          key: "fill-driver-signoff",
          label: "填司机签字",
          onClick: () => selectSignoffBoundaryForStage(driverSignoffItem),
        });
      }
    }

    if (groupKey === "business_workflow_pilot") {
      addPhaseAction(actions, {
        key: "open-field-acceptance",
        label: "现场验收报告",
        onClick: focusFieldAcceptanceReportFromPhase,
      });
      if (onPrecheckReleaseCandidateRefresh) {
        addPhaseAction(actions, {
          key: "run-refresh-precheck",
          label: releaseCandidateRefreshPrecheckAction.loading ? "预检中" : "刷新预检",
          onClick: onPrecheckReleaseCandidateRefresh,
          disabled: releaseCandidateRefreshPrecheckAction.loading,
        });
      }
    }

    if (groupKey === "security_operations") {
      if (firstOwnerSignoffItem) {
        addPhaseAction(actions, {
          key: "fill-owner-signoff",
          label: "填负责人签字",
          onClick: () => selectSignoffBoundaryForStage(firstOwnerSignoffItem),
        });
      }
      if (boundaryItem) {
        addPhaseAction(actions, {
          key: "fill-boundary",
          label: "填边界确认",
          onClick: () => selectSignoffBoundaryForStage(boundaryItem),
        });
      }
      if (onPrecheckV1V2Boundary) {
        addPhaseAction(actions, {
          key: "run-boundary-precheck",
          label: v1V2BoundaryPrecheckAction.loading ? "预检中" : "边界预检",
          onClick: onPrecheckV1V2Boundary,
          disabled: v1V2BoundaryPrecheckAction.loading,
        });
      }
    }

    if (group.missingCount > 0) {
      addPhaseAction(actions, {
        key: `filter-evidence-${groupKey}`,
        label: selectedMissingEvidenceGroupKey === groupKey ? "正在看本组" : "只看本组",
        onClick: () => focusMissingEvidenceGroup(group),
        disabled: selectedMissingEvidenceGroupKey === groupKey,
      });
    }

    return actions;
  }

  function buildSelectedPhaseQuickActions() {
    const phaseKey = selectedPhase.key || "";
    const knownPhaseKeys = new Set([
      "production_environment",
      "print_hardware",
      "driver_device",
      "business_pilot",
      "security_and_signoff",
      "remaining",
    ]);
    const hasKnownPhaseKey = knownPhaseKeys.has(phaseKey);
    const phaseHeadlineText = [
      phaseKey,
      selectedPhase.label,
      selectedPhase.nextStep,
    ].filter(Boolean).join(" ");
    const actions = [];
    const isProductionPhase = phaseKey === "production_environment" ||
      (!hasKnownPhaseKey && (phaseHeadlineText.includes("生产环境") || phaseHeadlineText.includes("持久化") || phaseHeadlineText.includes("PostgreSQL")));
    const isPrintPhase = phaseKey === "print_hardware" ||
      (!hasKnownPhaseKey && (phaseHeadlineText.includes("打印") || phaseHeadlineText.includes("CUPS") || phaseHeadlineText.includes("spool") || phaseHeadlineText.includes("标签")));
    const isDriverPhase = phaseKey === "driver_device" ||
      (!hasKnownPhaseKey && (phaseHeadlineText.includes("司机") || phaseHeadlineText.includes("真机") || phaseHeadlineText.includes("原生")));
    const isBusinessPhase = phaseKey === "business_pilot" || phaseKey === "remaining" ||
      (!hasKnownPhaseKey && (phaseHeadlineText.includes("业务试跑") || phaseHeadlineText.includes("业务试运行") || phaseHeadlineText.includes("真实订单") || phaseHeadlineText.includes("客户订单")));
    const isSecurityPhase = phaseKey === "security_and_signoff" ||
      (!hasKnownPhaseKey && (phaseHeadlineText.includes("签字") || phaseHeadlineText.includes("边界") || phaseHeadlineText.includes("安全运维") || phaseHeadlineText.includes("审计")));

    if (isProductionPhase) {
      addPhaseAction(actions, {
        key: "open-production-gate",
        label: "生产配置门禁",
        onClick: () => scrollV1StatusRefIntoView(productionEnvGateRef),
      });
      addPhaseAction(actions, {
        key: "open-env-fix",
        label: "查看 env 修正项",
        onClick: focusProductionEnvFixChecklistFromBlocker,
      });
      addPhaseAction(actions, {
        key: "open-env-template",
        label: "查看安全 env 草稿",
        onClick: focusProductionEnvFillTemplateFromPhase,
      });
      addPhaseAction(actions, {
        key: "open-minimum-env-template",
        label: "查看最小片段",
        onClick: focusProductionEnvMinimumValuesTemplateFromPhase,
        disabled: !productionEnvMinimumValuesFragmentTemplate,
      });
      if (onPrecheckProductionEnv) {
        addPhaseAction(actions, {
          key: "run-env-precheck",
          label: productionEnvPrecheckAction.loading ? "预检中" : "当前 env 预检",
          onClick: onPrecheckProductionEnv,
          disabled: productionEnvPrecheckAction.loading,
        });
      }
      if (onPrecheckV1Persistence) {
        addPhaseAction(actions, {
          key: "run-persistence-precheck",
          label: persistencePrecheckAction.loading ? "预检中" : "持久化预检",
          onClick: onPrecheckV1Persistence,
          disabled: persistencePrecheckAction.loading,
        });
      }
      if (onPrecheckProductionGoLive) {
        addPhaseAction(actions, {
          key: "run-production-go-live",
          label: productionGoLivePrecheckAction.loading ? "预检中" : "组合预检",
          onClick: onPrecheckProductionGoLive,
          disabled: productionGoLivePrecheckAction.loading,
        });
      }
    }

    if (isPrintPhase) {
      addPhaseAction(actions, {
        key: "open-runtime-readiness",
        label: "运行时门禁",
        onClick: focusRuntimeReadinessFromPhase,
      });
      if (onPrecheckV1PrintSpool) {
        addPhaseAction(actions, {
          key: "run-print-spool",
          label: printSpoolPrecheckAction.loading ? "预检中" : "spool 预检",
          onClick: onPrecheckV1PrintSpool,
          disabled: printSpoolPrecheckAction.loading,
        });
      }
      if (onPrecheckV1PrintCups) {
        addPhaseAction(actions, {
          key: "run-print-cups",
          label: printCupsPrecheckAction.loading ? "预检中" : "CUPS 预检",
          onClick: onPrecheckV1PrintCups,
          disabled: printCupsPrecheckAction.loading,
        });
      }
      if (onPrecheckV1PrintReadiness) {
        addPhaseAction(actions, {
          key: "run-print-readiness",
          label: printReadinessPrecheckAction.loading ? "预检中" : "打印门禁预检",
          onClick: onPrecheckV1PrintReadiness,
          disabled: printReadinessPrecheckAction.loading,
        });
      }
      const printEvidenceItem = findMissingEvidenceOptionByText(["打印", "标签", "CUPS", "样张", "纸张", "条码"]);
      if (printEvidenceItem) {
        addPhaseAction(actions, {
          key: "fill-print-evidence",
          label: "填打印证据",
          onClick: () => selectMissingEvidenceForStage(printEvidenceItem),
        });
      }
    }

    if (isDriverPhase) {
      addPhaseAction(actions, {
        key: "open-runtime-readiness",
        label: "运行时门禁",
        onClick: focusRuntimeReadinessFromPhase,
      });
      if (onPrecheckV1DriverReadiness) {
        addPhaseAction(actions, {
          key: "run-driver-readiness",
          label: driverReadinessPrecheckAction.loading ? "预检中" : "司机真机预检",
          onClick: onPrecheckV1DriverReadiness,
          disabled: driverReadinessPrecheckAction.loading,
        });
      }
      const driverEvidenceItem = findMissingEvidenceOptionByText(["司机", "真机", "原生", "定位", "水印", "导航", "扫码"]);
      if (driverEvidenceItem) {
        addPhaseAction(actions, {
          key: "fill-driver-evidence",
          label: "填司机证据",
          onClick: () => selectMissingEvidenceForStage(driverEvidenceItem),
        });
      }
      const driverSignoffItem = findSignoffBoundaryOptionByText(["司机"]);
      if (driverSignoffItem) {
        addPhaseAction(actions, {
          key: "fill-driver-signoff",
          label: "填司机签字",
          onClick: () => selectSignoffBoundaryForStage(driverSignoffItem),
        });
      }
    }

    if (isBusinessPhase) {
      addPhaseAction(actions, {
        key: "open-field-evidence",
        label: "现场证据进度",
        onClick: focusFieldEvidenceProgressFromPhase,
      });
      addPhaseAction(actions, {
        key: "open-field-acceptance",
        label: "现场验收报告",
        onClick: focusFieldAcceptanceReportFromPhase,
      });
      const businessEvidenceItem = findMissingEvidenceOptionByText(["真实业务", "真实订单", "客户订单", "出库", "交付", "异常待办", "订单录入"]);
      if (businessEvidenceItem) {
        addPhaseAction(actions, {
          key: "fill-business-evidence",
          label: "填业务试跑证据",
          onClick: () => selectMissingEvidenceForStage(businessEvidenceItem),
        });
      }
      if (onPrecheckReleaseCandidateRefresh) {
        addPhaseAction(actions, {
          key: "run-refresh-precheck",
          label: releaseCandidateRefreshPrecheckAction.loading ? "预检中" : "刷新预检",
          onClick: onPrecheckReleaseCandidateRefresh,
          disabled: releaseCandidateRefreshPrecheckAction.loading,
        });
      }
    }

    if (isSecurityPhase) {
      const firstSignoffItem = findSignoffBoundaryOptionByText(["办公室", "技术", "管理", "财务"]) ||
        signoffBoundaryOptions.find((option) => option.type !== "boundary") ||
        null;
      const boundaryItem = signoffBoundaryOptions.find((option) => option.type === "boundary") || null;
      addPhaseAction(actions, {
        key: "open-field-evidence",
        label: "现场证据进度",
        onClick: focusFieldEvidenceProgressFromPhase,
      });
      if (firstSignoffItem) {
        addPhaseAction(actions, {
          key: "fill-owner-signoff",
          label: "填负责人签字",
          onClick: () => selectSignoffBoundaryForStage(firstSignoffItem),
        });
      }
      if (boundaryItem) {
        addPhaseAction(actions, {
          key: "fill-boundary",
          label: "填边界确认",
          onClick: () => selectSignoffBoundaryForStage(boundaryItem),
        });
      }
      addPhaseAction(actions, {
        key: "open-v1-v2-boundary",
        label: "查看 V1/V2 边界",
        onClick: focusV1V2BoundaryBriefFromBlocker,
      });
      if (onPrecheckV1V2Boundary) {
        addPhaseAction(actions, {
          key: "run-boundary-precheck",
          label: v1V2BoundaryPrecheckAction.loading ? "预检中" : "边界预检",
          onClick: onPrecheckV1V2Boundary,
          disabled: v1V2BoundaryPrecheckAction.loading,
        });
      }
    }

    if (!actions.length) {
      addPhaseAction(actions, {
        key: "open-field-evidence",
        label: "现场证据进度",
        onClick: focusFieldEvidenceProgressFromPhase,
      });
      addPhaseAction(actions, {
        key: "open-field-acceptance",
        label: "现场验收报告",
        onClick: focusFieldAcceptanceReportFromPhase,
      });
    }

    return actions;
  }

  function buildCompletionAuditActions(criterion = {}) {
    const actions = [];
    const key = criterion.key || "";

    if (key === "release_candidate") {
      addPhaseAction(actions, {
        key: "open-intake-quality",
        label: "回填质量检查",
        onClick: () => scrollV1StatusRefIntoView(fieldEvidenceIntakeQualityRef),
      });
      if (onPrecheckReleaseCandidateRefresh) {
        addPhaseAction(actions, {
          key: "run-refresh-precheck",
          label: releaseCandidateRefreshPrecheckAction.loading ? "预检中" : "刷新预检",
          onClick: onPrecheckReleaseCandidateRefresh,
          disabled: releaseCandidateRefreshPrecheckAction.loading,
        });
      }
      if (onRefreshReleaseCandidate) {
        addPhaseAction(actions, {
          key: "run-refresh-candidate",
          label: releaseCandidateRefreshAction.loading ? "刷新中" : "刷新候选",
          onClick: onRefreshReleaseCandidate,
          disabled: releaseCandidateRefreshAction.loading,
        });
      }
    }

    if (key === "production_env") {
      addPhaseAction(actions, {
        key: "open-production-gate",
        label: "生产配置门禁",
        onClick: () => scrollV1StatusRefIntoView(productionEnvGateRef),
      });
      if (canShowProductionEnvFrontDoorReview) {
        addPhaseAction(actions, {
          key: "run-production-env-front-door",
          label: productionEnvFrontDoorReviewLoading ? "连续预检中" : "env 连续预检",
          onClick: () => runProductionEnvFrontDoorReview({ includeCombo: true }),
          disabled: !canRunProductionEnvFrontDoorReview || productionGoLivePrecheckAction.loading,
        });
      }
      if (onPrecheckProductionEnv) {
        addPhaseAction(actions, {
          key: "run-production-env-precheck",
          label: productionEnvPrecheckAction.loading ? "预检中" : "当前 env 预检",
          onClick: onPrecheckProductionEnv,
          disabled: productionEnvPrecheckAction.loading,
        });
      }
      if (onPrecheckProductionGoLive) {
        addPhaseAction(actions, {
          key: "run-production-go-live",
          label: productionGoLivePrecheckAction.loading ? "预检中" : "组合预检",
          onClick: onPrecheckProductionGoLive,
          disabled: productionGoLivePrecheckAction.loading,
        });
      }
    }

    if (key === "runtime_readiness") {
      addPhaseAction(actions, {
        key: "open-runtime-readiness",
        label: "运行时门禁",
        onClick: focusRuntimeReadinessFromPhase,
      });
      if (onPrecheckRuntimeReadiness) {
        addPhaseAction(actions, {
          key: "run-runtime-readiness",
          label: runtimeReadinessPrecheckAction.loading ? "预检中" : "当前运行时预检",
          onClick: onPrecheckRuntimeReadiness,
          disabled: runtimeReadinessPrecheckAction.loading,
        });
      }
    }

    if (key === "field_acceptance") {
      addPhaseAction(actions, {
        key: "open-field-acceptance",
        label: "现场验收报告",
        onClick: focusFieldAcceptanceReportFromPhase,
      });
      addPhaseAction(actions, {
        key: "open-field-evidence",
        label: "现场证据进度",
        onClick: focusFieldEvidenceProgressFromPhase,
      });
    }

    if (key === "field_evidence") {
      const firstEvidenceItem = missingEvidenceOptions[0] || null;
      addPhaseAction(actions, {
        key: "open-field-evidence",
        label: "现场证据进度",
        onClick: focusFieldEvidenceProgressFromPhase,
      });
      if (firstEvidenceItem) {
        addPhaseAction(actions, {
          key: "fill-first-evidence",
          label: "填第一条证据",
          onClick: () => selectMissingEvidenceForStage(firstEvidenceItem),
        });
      }
      if (canRunFieldEvidenceCloseoutReview) {
        addPhaseAction(actions, {
          key: "run-field-evidence-closeout",
          label: fieldEvidenceValidationAction.loading || releaseCandidateRefreshPrecheckAction.loading ? "复核中" : "校验并预检刷新",
          onClick: runFieldEvidenceCloseoutReview,
          disabled: fieldEvidenceValidationAction.loading || releaseCandidateRefreshPrecheckAction.loading,
        });
      }
    }

    if (key === "owner_signoff") {
      const firstSignoffItem = signoffBoundaryOptions.find((option) => option.type !== "boundary") || null;
      addPhaseAction(actions, {
        key: "open-field-evidence",
        label: "签字 / 边界进度",
        onClick: focusFieldEvidenceProgressFromPhase,
      });
      if (firstSignoffItem) {
        addPhaseAction(actions, {
          key: "fill-owner-signoff",
          label: "填负责人签字",
          onClick: () => selectSignoffBoundaryForStage(firstSignoffItem),
        });
      }
    }

    if (key === "v1_v2_boundary") {
      const boundaryItem = signoffBoundaryOptions.find((option) => option.type === "boundary") || null;
      addPhaseAction(actions, {
        key: "open-v1-v2-boundary",
        label: "查看 V1/V2 边界",
        onClick: focusV1V2BoundaryBriefFromBlocker,
      });
      if (boundaryItem) {
        addPhaseAction(actions, {
          key: "fill-boundary",
          label: "填边界确认",
          onClick: () => selectSignoffBoundaryForStage(boundaryItem),
        });
      }
      if (onPrecheckV1V2Boundary) {
        addPhaseAction(actions, {
          key: "run-boundary-precheck",
          label: v1V2BoundaryPrecheckAction.loading ? "预检中" : "边界预检",
          onClick: onPrecheckV1V2Boundary,
          disabled: v1V2BoundaryPrecheckAction.loading,
        });
      }
    }

    return actions;
  }

  function buildRoleTaskQuickActions(task = {}) {
    const actions = [];
    const taskType = task.type || "";
    const haystack = [
      task.id,
      task.type,
      task.group,
      task.title,
      task.action,
      task.primaryRole,
      ...(Array.isArray(task.roles) ? task.roles : []),
    ].filter(Boolean).join(" ");
    const addRoleAction = (action) => addPhaseAction(actions, action);

    if (taskType === "发布门禁" || haystack.includes("生产环境变量")) {
      if (haystack.includes("生产环境变量") || haystack.includes("env") || haystack.includes("环境变量")) {
        addRoleAction({
          key: "open-production-gate",
          label: "生产配置门禁",
          onClick: () => scrollV1StatusRefIntoView(productionEnvGateRef),
        });
        addRoleAction({
          key: "open-env-fix",
          label: "查看 env 修正项",
          onClick: focusProductionEnvFixChecklistFromBlocker,
        });
        if (onPrecheckProductionEnv) {
          addRoleAction({
            key: "run-production-env-precheck",
            label: productionEnvPrecheckAction.loading ? "预检中" : "当前 env 预检",
            onClick: onPrecheckProductionEnv,
            disabled: productionEnvPrecheckAction.loading,
          });
        }
      }
      if (haystack.includes("运行时 V1") || haystack.includes("readiness") || haystack.includes("门禁")) {
        addRoleAction({
          key: "open-runtime-readiness",
          label: "运行时门禁",
          onClick: focusRuntimeReadinessFromPhase,
        });
      }
      if (haystack.includes("持久化") || haystack.includes("PostgreSQL")) {
        if (onPrecheckV1Persistence) {
          addRoleAction({
            key: "run-persistence-precheck",
            label: persistencePrecheckAction.loading ? "预检中" : "持久化预检",
            onClick: onPrecheckV1Persistence,
            disabled: persistencePrecheckAction.loading,
          });
        }
      }
      if (haystack.includes("附件") || haystack.includes("对象存储")) {
        if (onPrecheckV1AttachmentRetention) {
          addRoleAction({
            key: "run-attachment-retention",
            label: attachmentRetentionPrecheckAction.loading ? "预检中" : "附件留档预检",
            onClick: onPrecheckV1AttachmentRetention,
            disabled: attachmentRetentionPrecheckAction.loading,
          });
        }
      }
      if (haystack.includes("spool")) {
        if (onPrecheckV1PrintSpool) {
          addRoleAction({
            key: "run-print-spool",
            label: printSpoolPrecheckAction.loading ? "预检中" : "spool 预检",
            onClick: onPrecheckV1PrintSpool,
            disabled: printSpoolPrecheckAction.loading,
          });
        }
      }
      if (haystack.includes("CUPS")) {
        if (onPrecheckV1PrintCups) {
          addRoleAction({
            key: "run-print-cups",
            label: printCupsPrecheckAction.loading ? "预检中" : "CUPS 预检",
            onClick: onPrecheckV1PrintCups,
            disabled: printCupsPrecheckAction.loading,
          });
        }
      }
      if (haystack.includes("打印 V1") || haystack.includes("打印门禁")) {
        if (onPrecheckV1PrintReadiness) {
          addRoleAction({
            key: "run-print-readiness",
            label: printReadinessPrecheckAction.loading ? "预检中" : "打印门禁预检",
            onClick: onPrecheckV1PrintReadiness,
            disabled: printReadinessPrecheckAction.loading,
          });
        }
      }
      if (haystack.includes("司机") || haystack.includes("真机") || haystack.includes("原生")) {
        if (onPrecheckV1DriverReadiness) {
          addRoleAction({
            key: "run-driver-readiness",
            label: driverReadinessPrecheckAction.loading ? "预检中" : "司机真机预检",
            onClick: onPrecheckV1DriverReadiness,
            disabled: driverReadinessPrecheckAction.loading,
          });
        }
      }
    }

    if (taskType === "现场证据") {
      const evidenceItem = findMatchingMissingEvidenceOptionByText([task.title, task.group, task.action]);
      if (evidenceItem) {
        addRoleAction({
          key: "fill-evidence",
          label: "填证据草稿",
          onClick: () => selectMissingEvidenceForStage(evidenceItem),
        });
      }
      addRoleAction({
        key: "open-field-evidence",
        label: "现场证据进度",
        onClick: focusFieldEvidenceProgressFromPhase,
      });
    }

    if (taskType.includes("签字") || haystack.includes("负责人签字")) {
      const signoffItem = findSignoffBoundaryOptionByText([task.title, task.primaryRole, task.group]);
      if (signoffItem) {
        addRoleAction({
          key: "fill-signoff",
          label: "填签字草稿",
          onClick: () => selectSignoffBoundaryForStage(signoffItem),
        });
      }
      addRoleAction({
        key: "open-field-evidence",
        label: "签字进度",
        onClick: focusFieldEvidenceProgressFromPhase,
      });
    }

    if (taskType.includes("边界") || haystack.includes("V1/V2 边界")) {
      const boundaryItem = signoffBoundaryOptions.find((option) => option.type === "boundary") || null;
      if (boundaryItem) {
        addRoleAction({
          key: "fill-boundary",
          label: "填边界确认",
          onClick: () => selectSignoffBoundaryForStage(boundaryItem),
        });
      }
      addRoleAction({
        key: "open-v1-v2-boundary",
        label: "查看 V1/V2 边界",
        onClick: focusV1V2BoundaryBriefFromBlocker,
      });
      if (onPrecheckV1V2Boundary) {
        addRoleAction({
          key: "run-boundary-precheck",
          label: v1V2BoundaryPrecheckAction.loading ? "预检中" : "边界预检",
          onClick: onPrecheckV1V2Boundary,
          disabled: v1V2BoundaryPrecheckAction.loading,
        });
      }
    }

    if (!actions.length) {
      addRoleAction({
        key: "open-field-evidence",
        label: "现场证据进度",
        onClick: focusFieldEvidenceProgressFromPhase,
      });
      addRoleAction({
        key: "open-field-acceptance",
        label: "现场验收报告",
        onClick: focusFieldAcceptanceReportFromPhase,
      });
    }

    return actions;
  }

  function buildRoleTaskCategorySummaries(board = {}) {
    const summary = board.summary || {};
    const sourceCategories = Array.isArray(board.categorySummaries) ? board.categorySummaries : [];
    const sourceByKey = new Map(sourceCategories.map((item) => [item.key, item]));
    const firstEvidenceItem = missingEvidenceOptions[0] || null;
    const firstSignoffItem = signoffBoundaryOptions.find((option) => option.type !== "boundary") || null;
    const boundaryItem = signoffBoundaryOptions.find((option) => option.type === "boundary") || null;
    const categories = [
      {
        key: "release",
        title: sourceByKey.get("release")?.title || "发布门禁",
        tone: "danger",
        count: Number(sourceByKey.get("release")?.count ?? summary.releaseTaskCount) || 0,
        description: sourceByKey.get("release")?.nextAction || "先处理生产 env、runtime readiness、持久化、对象存储、打印和司机真机门禁。",
        firstTasks: sourceByKey.get("release")?.firstTasks || [],
        actions: [],
      },
      {
        key: "evidence",
        title: sourceByKey.get("evidence")?.title || "现场证据",
        tone: "blue",
        count: Number(sourceByKey.get("evidence")?.count ?? summary.evidenceTaskCount) || 0,
        description: sourceByKey.get("evidence")?.nextAction || "按证据组补真实 PostgreSQL、对象存储、打印、司机真机和业务试跑留档。",
        firstTasks: sourceByKey.get("evidence")?.firstTasks || [],
        actions: [],
      },
      {
        key: "signoff",
        title: sourceByKey.get("signoff")?.title || "负责人签字",
        tone: "warning",
        count: Number(sourceByKey.get("signoff")?.count ?? summary.signoffTaskCount) || 0,
        description: sourceByKey.get("signoff")?.nextAction || "完成办公室、仓库/出库、车间、司机、财务、技术/管理负责人确认。",
        firstTasks: sourceByKey.get("signoff")?.firstTasks || [],
        actions: [],
      },
      {
        key: "boundary",
        title: sourceByKey.get("boundary")?.title || "V1/V2 边界",
        tone: "warning",
        count: Number(sourceByKey.get("boundary")?.count ?? summary.boundaryTaskCount) || 0,
        description: sourceByKey.get("boundary")?.nextAction || "确认哪些必须留在 V1 完成，哪些进入计划 V2，避免把上线门禁后移。",
        firstTasks: sourceByKey.get("boundary")?.firstTasks || [],
        actions: [],
      },
    ];
    const releaseCategory = categories.find((item) => item.key === "release");
    const evidenceCategory = categories.find((item) => item.key === "evidence");
    const signoffCategory = categories.find((item) => item.key === "signoff");
    const boundaryCategory = categories.find((item) => item.key === "boundary");

    if (releaseCategory) {
      addPhaseAction(releaseCategory.actions, {
        key: "open-production-gate",
        label: "生产配置门禁",
        onClick: () => scrollV1StatusRefIntoView(productionEnvGateRef),
      });
      addPhaseAction(releaseCategory.actions, {
        key: "open-runtime-readiness",
        label: "运行时门禁",
        onClick: focusRuntimeReadinessFromPhase,
      });
      if (onPrecheckProductionEnv) {
        addPhaseAction(releaseCategory.actions, {
          key: "run-production-env-precheck",
          label: productionEnvPrecheckAction.loading ? "预检中" : "当前 env 预检",
          onClick: onPrecheckProductionEnv,
          disabled: productionEnvPrecheckAction.loading,
        });
      }
      if (onPrecheckProductionGoLive) {
        addPhaseAction(releaseCategory.actions, {
          key: "run-production-go-live",
          label: productionGoLivePrecheckAction.loading ? "预检中" : "组合预检",
          onClick: onPrecheckProductionGoLive,
          disabled: productionGoLivePrecheckAction.loading,
        });
      }
    }

    if (evidenceCategory) {
      addPhaseAction(evidenceCategory.actions, {
        key: "open-field-evidence",
        label: "现场证据进度",
        onClick: focusFieldEvidenceProgressFromPhase,
      });
      if (firstEvidenceItem) {
        addPhaseAction(evidenceCategory.actions, {
          key: "fill-first-evidence",
          label: "填第一条证据",
          onClick: () => selectMissingEvidenceForStage(firstEvidenceItem),
        });
      }
      addPhaseAction(evidenceCategory.actions, {
        key: "open-field-acceptance",
        label: "现场验收报告",
        onClick: focusFieldAcceptanceReportFromPhase,
      });
      addPhaseAction(evidenceCategory.actions, {
        key: "open-field-intake-quality",
        label: "回填质量检查",
        onClick: () => scrollV1StatusRefIntoView(fieldEvidenceIntakeQualityRef),
      });
    }

    if (signoffCategory) {
      addPhaseAction(signoffCategory.actions, {
        key: "open-signoff-progress",
        label: "签字进度",
        onClick: focusFieldEvidenceProgressFromPhase,
      });
      if (firstSignoffItem) {
        addPhaseAction(signoffCategory.actions, {
          key: "fill-first-signoff",
          label: "填负责人签字",
          onClick: () => selectSignoffBoundaryForStage(firstSignoffItem),
        });
      }
    }

    if (boundaryCategory) {
      if (boundaryItem) {
        addPhaseAction(boundaryCategory.actions, {
          key: "fill-boundary",
          label: "填边界确认",
          onClick: () => selectSignoffBoundaryForStage(boundaryItem),
        });
      }
      addPhaseAction(boundaryCategory.actions, {
        key: "open-v1-v2-boundary",
        label: "查看 V1/V2 边界",
        onClick: focusV1V2BoundaryBriefFromBlocker,
      });
      if (onPrecheckV1V2Boundary) {
        addPhaseAction(boundaryCategory.actions, {
          key: "run-boundary-precheck",
          label: v1V2BoundaryPrecheckAction.loading ? "预检中" : "边界预检",
          onClick: onPrecheckV1V2Boundary,
          disabled: v1V2BoundaryPrecheckAction.loading,
        });
      }
    }

    return categories.map((category) => ({
      ...category,
      countLabel: `${category.count} 项`,
      statusLabel: sourceByKey.get(category.key)?.statusLabel || (category.count > 0 ? "待处理" : "已清空"),
      firstTasks: category.firstTasks.slice(0, 3),
    }));
  }

  function buildRuntimeReadinessBlockerActions(item = {}) {
    const key = item.key || "";
    const haystack = [
      key,
      item.label,
      item.group,
      item.ownerRole,
      item.detail,
      item.nextAction,
    ].filter(Boolean).join(" ");
    const actions = [];
    const addRuntimeAction = (action) => addPhaseAction(actions, action);
    const printEvidenceItem = findMatchingMissingEvidenceOptionByText(["打印", "标签", "CUPS", "spool", "样张", "纸张", "条码"]);
    const knownRuntimeBlockerKeys = new Set([
      "system-v1-persistence",
      "attachment-v1-readiness",
      "print-spool-diagnostics",
      "print-cups-diagnostics",
      "print-v1-readiness",
      "driver-v1-readiness",
    ]);
    const hasKnownRuntimeBlockerKey = knownRuntimeBlockerKeys.has(key);

    if (key === "system-v1-persistence" || (!hasKnownRuntimeBlockerKey && (haystack.includes("持久化") || haystack.includes("PostgreSQL")))) {
      if (onPrecheckV1Persistence) {
        addRuntimeAction({
          key: "run-persistence-precheck",
          label: persistencePrecheckAction.loading ? "预检中" : "持久化预检",
          onClick: onPrecheckV1Persistence,
          disabled: persistencePrecheckAction.loading,
        });
      }
      const persistenceEvidenceItem = findMatchingMissingEvidenceOptionByText(["PostgreSQL", "生产持久化", "生产库", "迁移", "备份", "恢复"]);
      if (persistenceEvidenceItem) {
        addRuntimeAction({
          key: "fill-persistence-evidence",
          label: "填持久化证据",
          onClick: () => selectMissingEvidenceForStage(persistenceEvidenceItem),
        });
      }
      addRuntimeAction({
        key: "open-env-fix",
        label: "查看 env 修正项",
        onClick: focusProductionEnvFixChecklistFromBlocker,
      });
    }

    if (key === "attachment-v1-readiness" || (!hasKnownRuntimeBlockerKey && (haystack.includes("附件") || haystack.includes("对象存储")))) {
      if (onPrecheckV1AttachmentRetention) {
        addRuntimeAction({
          key: "run-attachment-retention-precheck",
          label: attachmentRetentionPrecheckAction.loading ? "预检中" : "附件留档预检",
          onClick: onPrecheckV1AttachmentRetention,
          disabled: attachmentRetentionPrecheckAction.loading,
        });
      }
      const attachmentEvidenceItem = findMatchingMissingEvidenceOptionByText(["对象存储", "附件", "bucket", "短期访问", "访问审计", "对账导出"]);
      if (attachmentEvidenceItem) {
        addRuntimeAction({
          key: "fill-attachment-evidence",
          label: "填对象存储证据",
          onClick: () => selectMissingEvidenceForStage(attachmentEvidenceItem),
        });
      }
      addRuntimeAction({
        key: "open-env-fix",
        label: "查看 env 修正项",
        onClick: focusProductionEnvFixChecklistFromBlocker,
      });
    }

    if (key === "print-spool-diagnostics" || (!hasKnownRuntimeBlockerKey && haystack.includes("spool"))) {
      if (onPrecheckV1PrintSpool) {
        addRuntimeAction({
          key: "run-print-spool",
          label: printSpoolPrecheckAction.loading ? "预检中" : "spool 预检",
          onClick: onPrecheckV1PrintSpool,
          disabled: printSpoolPrecheckAction.loading,
        });
      }
      if (printEvidenceItem) {
        addRuntimeAction({
          key: "fill-print-evidence",
          label: "填打印证据",
          onClick: () => selectMissingEvidenceForStage(printEvidenceItem),
        });
      }
    }

    if (key === "print-cups-diagnostics" || (!hasKnownRuntimeBlockerKey && haystack.includes("CUPS"))) {
      if (onPrecheckV1PrintCups) {
        addRuntimeAction({
          key: "run-print-cups",
          label: printCupsPrecheckAction.loading ? "预检中" : "CUPS 预检",
          onClick: onPrecheckV1PrintCups,
          disabled: printCupsPrecheckAction.loading,
        });
      }
      if (printEvidenceItem) {
        addRuntimeAction({
          key: "fill-print-evidence",
          label: "填打印证据",
          onClick: () => selectMissingEvidenceForStage(printEvidenceItem),
        });
      }
    }

    if (key === "print-v1-readiness" || (!hasKnownRuntimeBlockerKey && (haystack.includes("打印 V1") || haystack.includes("打印门禁")))) {
      if (onPrecheckV1PrintReadiness) {
        addRuntimeAction({
          key: "run-print-readiness",
          label: printReadinessPrecheckAction.loading ? "预检中" : "打印门禁预检",
          onClick: onPrecheckV1PrintReadiness,
          disabled: printReadinessPrecheckAction.loading,
        });
      }
      if (printEvidenceItem) {
        addRuntimeAction({
          key: "fill-print-evidence",
          label: "填打印证据",
          onClick: () => selectMissingEvidenceForStage(printEvidenceItem),
        });
      }
      addRuntimeAction({
        key: "open-field-acceptance",
        label: "现场验收报告",
        onClick: focusFieldAcceptanceReportFromPhase,
      });
    }

    if (key === "driver-v1-readiness" || (!hasKnownRuntimeBlockerKey && (haystack.includes("司机") || haystack.includes("真机") || haystack.includes("原生")))) {
      if (onPrecheckV1DriverReadiness) {
        addRuntimeAction({
          key: "run-driver-readiness",
          label: driverReadinessPrecheckAction.loading ? "预检中" : "司机真机预检",
          onClick: onPrecheckV1DriverReadiness,
          disabled: driverReadinessPrecheckAction.loading,
        });
      }
      const driverEvidenceItem = findMatchingMissingEvidenceOptionByText(["司机", "真机", "原生", "定位", "水印", "导航", "扫码"]);
      if (driverEvidenceItem) {
        addRuntimeAction({
          key: "fill-driver-evidence",
          label: "填司机证据",
          onClick: () => selectMissingEvidenceForStage(driverEvidenceItem),
        });
      }
      const driverSignoffItem = findSignoffBoundaryOptionByText(["司机"]);
      if (driverSignoffItem) {
        addRuntimeAction({
          key: "fill-driver-signoff",
          label: "填司机签字",
          onClick: () => selectSignoffBoundaryForStage(driverSignoffItem),
        });
      }
    }

    if (!actions.length && onPrecheckRuntimeReadiness) {
      addRuntimeAction({
        key: "run-runtime-readiness",
        label: runtimeReadinessPrecheckAction.loading ? "预检中" : "当前预检",
        onClick: onPrecheckRuntimeReadiness,
        disabled: runtimeReadinessPrecheckAction.loading,
      });
      addRuntimeAction({
        key: "open-field-evidence",
        label: "现场证据进度",
        onClick: focusFieldEvidenceProgressFromPhase,
      });
    }

    return actions;
  }

  function buildReleaseCandidateRefreshBlockerActions(item = {}) {
    const key = item.key || "";
    const firstProductionGoLiveBlockedStageKey =
      releaseCandidateRefreshPrecheckAction.result?.summary?.productionGoLiveFirstBlockedStageKey ||
      releaseCandidateRefreshAction.result?.summary?.productionGoLiveFirstBlockedStageKey ||
      "";
    const firstProductionGoLiveBlockedStageLabel =
      releaseCandidateRefreshPrecheckAction.result?.summary?.productionGoLiveFirstBlockedStageLabel ||
      releaseCandidateRefreshAction.result?.summary?.productionGoLiveFirstBlockedStageLabel ||
      "";
    const firstMissingEvidenceItem = missingEvidenceOptions[0] || null;
    const firstSignoffItem = signoffBoundaryOptions.find((option) => option.type !== "boundary") || null;
    const boundaryItem = signoffBoundaryOptions.find((option) => option.type === "boundary") || null;
    const actions = [];

    if (key === "field-evidence-draft-missing" || key === "field-evidence-draft-invalid") {
      actions.push({
        key: "open-field-evidence-quality",
        label: "到回填质量检查",
        onClick: () => scrollV1StatusRefIntoView(fieldEvidenceIntakeQualityRef),
      });
    }

    if (key === "field-evidence-draft-blocked") {
      if (firstMissingEvidenceItem) {
        actions.push({
          key: "fill-first-evidence",
          label: "填第一条证据",
          onClick: () => selectMissingEvidenceForStage(firstMissingEvidenceItem),
        });
      }
      if (firstSignoffItem) {
        actions.push({
          key: "fill-first-signoff",
          label: "填负责人签字",
          onClick: () => selectSignoffBoundaryForStage(firstSignoffItem),
        });
      }
      if (boundaryItem) {
        actions.push({
          key: "fill-boundary",
          label: "填边界确认",
          onClick: () => selectSignoffBoundaryForStage(boundaryItem),
        });
      }
    }

    if (key === "signoff-incomplete" && firstSignoffItem) {
      actions.push({
        key: "fill-signoff",
        label: "填负责人签字",
        onClick: () => selectSignoffBoundaryForStage(firstSignoffItem),
      });
    }

    if (key === "v1-v2-boundary-pending") {
      if (boundaryItem) {
        actions.push({
          key: "fill-boundary",
          label: "填边界确认",
          onClick: () => selectSignoffBoundaryForStage(boundaryItem),
        });
      }
      actions.push({
        key: "open-boundary",
        label: "查看 V1/V2 边界",
        onClick: focusV1V2BoundaryBriefFromBlocker,
      });
    }

    if (key === "production-env-preflight-blocked") {
      actions.push({
        key: "open-env-fix",
        label: "查看 env 修正项",
        onClick: focusProductionEnvFixChecklistFromBlocker,
      });
      if (onPrecheckProductionEnv) {
        actions.push({
          key: "run-env-precheck",
          label: productionEnvPrecheckAction.loading ? "预检中" : "当前 env 预检",
          onClick: onPrecheckProductionEnv,
          disabled: productionEnvPrecheckAction.loading,
        });
      }
    }

    if (key === "production-go-live-combo-blocked") {
      const firstBlockedStageIsEnvFileAudit =
        firstProductionGoLiveBlockedStageKey === "production-env-file-audit" ||
        firstProductionGoLiveBlockedStageLabel.includes("生产 env 文件安全审计") ||
        String(item.detail || "").includes("生产 env 文件安全审计");
      if (firstBlockedStageIsEnvFileAudit && canShowProductionEnvFrontDoorReview) {
        actions.push({
          key: "run-env-front-door-review",
          label: productionEnvFrontDoorReviewLoading || productionGoLivePrecheckAction.loading ? "连续预检中" : "env 连续预检",
          onClick: () => runProductionEnvFrontDoorReview({ includeCombo: true }),
          disabled: productionEnvFrontDoorReviewLoading || productionGoLivePrecheckAction.loading,
        });
      }
      if (firstBlockedStageIsEnvFileAudit && onPrecheckProductionEnvFileAudit) {
        actions.push({
          key: "run-env-file-audit",
          label: productionEnvFileAuditPrecheckAction.loading ? "审计中" : "env 文件审计",
          onClick: onPrecheckProductionEnvFileAudit,
          disabled: productionEnvFileAuditPrecheckAction.loading,
        });
      }
      if (firstBlockedStageIsEnvFileAudit && onPrecheckProductionEnvFilePreview) {
        actions.push({
          key: "run-env-file-preview",
          label: productionEnvFilePreviewPrecheckAction.loading ? "预检中" : "文件应用预检",
          onClick: onPrecheckProductionEnvFilePreview,
          disabled: productionEnvFilePreviewPrecheckAction.loading,
        });
      }
      if (firstBlockedStageIsEnvFileAudit && onPrecheckProductionEnv) {
        actions.push({
          key: "run-current-env-precheck",
          label: productionEnvPrecheckAction.loading ? "预检中" : "当前 env 预检",
          onClick: onPrecheckProductionEnv,
          disabled: productionEnvPrecheckAction.loading,
        });
      }
      actions.push({
        key: "open-production-gate",
        label: "查看生产配置门禁",
        onClick: () => scrollV1StatusRefIntoView(productionEnvGateRef),
      });
      if (onPrecheckProductionGoLive) {
        actions.push({
          key: "run-combo-precheck",
          label: productionGoLivePrecheckAction.loading ? "预检中" : "组合预检",
          onClick: onPrecheckProductionGoLive,
          disabled: productionGoLivePrecheckAction.loading,
        });
      }
    }

    return actions;
  }

  return (
    <section className="v1-status-page">
      <div className="v1-status-banner">
        <div>
          <StatusPill tone={goLiveStatus?.ready ? "success" : "danger"}>{statusSummary.statusLabel}</StatusPill>
          <h2>V1 完成度快照</h2>
          <p>{statusSummary.conclusion}</p>
        </div>
        <div className="v1-status-source">
          <span>快照：{statusSummary.generatedAt}</span>
          <strong className={v1StatusSnapshotExpired ? "status-stale" : ""}>{statusSourceLabel}</strong>
          <em>{statusSourceDetail}</em>
        </div>
      </div>

      <MetricStrip items={statusSummary.metrics} />

      <section className="page-grid two-col">
        <div className="list-pane">
          <div className="panel-head compact">
            <div>
              <h2>发布门禁</h2>
              <span>只有门禁、现场证据和签字都通过，才可宣布 V1 完成。</span>
            </div>
          </div>
          <div className="v1-gate-list">
            {statusSummary.gates.map(([label, value, status, detail]) => (
              <div className="v1-gate-row" key={label}>
                <div>
                  <strong>{label}</strong>
                  <p>{detail}</p>
                </div>
                <StatusPill tone={status === "blocked" ? "danger" : "warning"}>{value}</StatusPill>
              </div>
            ))}
          </div>

          <div className="panel-head compact">
            <div>
              <h2>最小解除阻塞路径</h2>
              <span>来自 go-live suite；按阶段完成后，重新跑 release candidate。</span>
            </div>
          </div>
          <div className="v1-unblock-summary">
            <div>
              <span>待处理</span>
              <strong>{unblockPlan.summary.taskCount}</strong>
            </div>
            <div>
              <span>发布门禁</span>
              <strong>{unblockPlan.summary.releaseTaskCount}</strong>
            </div>
            <div>
              <span>现场证据</span>
              <strong>{unblockPlan.summary.evidenceTaskCount}</strong>
            </div>
            <div>
              <span>签字</span>
              <strong>{unblockPlan.summary.signoffTaskCount}</strong>
            </div>
            <div>
              <span>边界</span>
              <strong>{unblockPlan.summary.boundaryTaskCount}</strong>
            </div>
          </div>
          <div className="v1-phase-list">
            {unblockPlan.phases.map((phase) => (
              <button
                className={`v1-phase-row${phase.key === selectedPhase.key ? " active" : ""}`}
                key={phase.key}
                type="button"
                onClick={() => setSelectedPhaseKey(phase.key)}
              >
                <div>
                  <strong>{phase.label}</strong>
                  <p>{phase.nextStep}</p>
                </div>
                <span>{phase.taskCount} 项</span>
              </button>
            ))}
          </div>

          <div className="panel-head compact">
            <div>
              <h2>分模块完成度</h2>
              <span>百分比是当前代码和验收证据口径，不是上线承诺。</span>
            </div>
          </div>
          <DataTable
            className="v1-module-table"
            columns={["模块", "需求", "P0/代码", "V1"]}
            rows={moduleCompletionRows.map((item) => ({
              id: item.module,
              active: item.module === selectedModule.module,
              tone: Number.parseInt(item.v1Readiness, 10) < 50 ? "danger" : Number.parseInt(item.v1Readiness, 10) < 65 ? "warning" : "success",
              onClick: () => setSelectedModuleName(item.module),
              cells: [
                item.module,
                item.requirements,
                item.p0Code,
                <StatusPill key={`${item.module}-v1`} tone={Number.parseInt(item.v1Readiness, 10) < 50 ? "danger" : Number.parseInt(item.v1Readiness, 10) < 65 ? "warning" : "success"}>
                  {item.v1Readiness}
                </StatusPill>,
              ],
            }))}
          />
        </div>

        <DetailPane title={selectedModule.module} subtitle="模块完成度详情">
          <InfoGrid
            rows={[
              ["需求确认", selectedModule.requirements],
              ["P0/代码", selectedModule.p0Code],
              ["V1 上线就绪", selectedModule.v1Readiness],
              ["完成标准", "发布门禁 + 现场证据 + 签字"],
              ["当前阶段", `${selectedPhase.label} / ${selectedPhase.taskCount} 项`],
            ]}
          />
          {ownerDecisionBrief ? (
            <section className="detail-section">
              <h3>负责人决策摘要</h3>
              <div className="v1-owner-decision-head">
                <StatusPill tone={ownerDecisionBrief.canDeclareV1Complete ? "success" : "danger"}>
                  {ownerDecisionBrief.decision.label || "不能宣布 V1 已完成"}
                </StatusPill>
                <p>{ownerDecisionBrief.conclusion}</p>
              </div>
              <div className="v1-owner-decision-summary">
                <span>发布门禁 <strong>{ownerDecisionBrief.completion.releaseGate}</strong></span>
                <span>运行时 <strong>{ownerDecisionBrief.completion.runtimeReadiness}</strong></span>
                <span>现场任务 <strong>{ownerDecisionBrief.completion.onsiteTaskLabel}</strong></span>
                <span>现场证据 <strong>{ownerDecisionBrief.completion.fieldEvidence}</strong></span>
              </div>
              <div className="v1-owner-decision-grid">
                <div className="v1-owner-decision-column">
                  <strong>已完成基础</strong>
                  <div className="v1-owner-decision-list">
                    {ownerDecisionBrief.doneHighlights.map((item) => (
                      <p key={item}>{item}</p>
                    ))}
                  </div>
                </div>
                <div className="v1-owner-decision-column">
                  <strong>还没完成</strong>
                  <div className="v1-owner-decision-list">
                    {ownerDecisionBrief.unfinishedItems.slice(0, 5).map((item) => (
                      <p key={`${item.type}-${item.label}`}>
                        <b>{item.label}</b>：{item.detail}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
              {ownerDecisionBrief.releaseGates.length ? (
                <div className="v1-owner-decision-gates">
                  {ownerDecisionBrief.releaseGates.map((gate) => (
                    <div className="v1-owner-decision-gate" key={gate.label}>
                      <StatusPill tone={gate.status === "blocked" ? "danger" : "warning"}>{gate.summary}</StatusPill>
                      <div>
                        <strong>{gate.label}</strong>
                        <p>{gate.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {(ownerDecisionBrief.nextActions.length || ownerDecisionBrief.topBlockers.length) ? (
                <div className="v1-owner-action-plan">
                  {ownerDecisionBrief.nextActions.length ? (
                    <div className="v1-owner-action-column">
                      <strong>优先动作 <span>{ownerDecisionBrief.summary.nextActionLabel}</span></strong>
                      <div className="v1-owner-action-list">
                        {ownerDecisionBrief.nextActions.map((action) => (
                          <p key={action}>{action}</p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {ownerDecisionBrief.topBlockers.length ? (
                    <div className="v1-owner-action-column">
                      <strong>首批阻塞 <span>{ownerDecisionBrief.summary.topBlockerLabel}</span></strong>
                      <div className="v1-owner-blocker-list">
                        {ownerDecisionBrief.topBlockers.map((blocker) => (
                          <div className="v1-owner-blocker-row" key={`${blocker.gate}-${blocker.label}`}>
                            <StatusPill tone="danger">{blocker.gate || "阻塞"}</StatusPill>
                            <div>
                              <strong>{blocker.label}</strong>
                              <p>{blocker.detail}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="v1-owner-decision-question">
                <strong>负责人需要判断</strong>
                <p>{ownerDecisionBrief.decision.ownerQuestion}</p>
                <p>{ownerDecisionBrief.decision.recommendation}</p>
              </div>
            </section>
          ) : null}
          {completionAudit ? (
            <section className="detail-section">
              <h3>V1 完成审计</h3>
              <div className="v1-owner-decision-head">
                <StatusPill tone={completionAudit.canDeclareV1Complete ? "success" : "danger"}>
                  {completionAudit.canDeclareV1Complete ? "可以宣布完成" : "不能宣布完成"}
                </StatusPill>
                <p>{completionAudit.summary.label}</p>
              </div>
              <div className="v1-owner-decision-summary">
                <span>完成标准 <strong>{completionAudit.summary.passedCriteriaCount}/{completionAudit.summary.criteriaCount}</strong></span>
                <span>阻塞 <strong>{completionAudit.summary.blockingCriteriaLabel}</strong></span>
                <span>现场任务 <strong>{completionAudit.summary.onsiteTaskLabel}</strong></span>
                <span>V2 差异 <strong>{completionAudit.summary.v2DifferenceLabel}</strong></span>
              </div>
              <div className="v1-owner-decision-gates">
                {completionAudit.criteria.map((criterion) => {
                  const criterionActions = buildCompletionAuditActions(criterion);
                  return (
                    <div className="v1-owner-decision-gate" key={criterion.key}>
                      <StatusPill tone={criterion.ready ? "success" : "danger"}>{criterion.statusLabel}</StatusPill>
                      <div>
                        <strong>{criterion.label}</strong>
                        <p>当前：{criterion.evidenceLabel}</p>
                        {criterion.proofRequirements?.length ? (
                          <div className="v1-completion-proof-list">
                            <span>需证明</span>
                            {criterion.proofRequirements.map((proof) => (
                              <b key={proof}>{proof}</b>
                            ))}
                          </div>
                        ) : null}
                        {criterion.proofGaps?.length ? (
                          <div className="v1-completion-gap-list">
                            <span>{criterion.proofGapCountLabel ? `还缺 ${criterion.proofGapCountLabel}` : "还缺"}</span>
                            {criterion.proofGaps.map((gap) => (
                              <b key={gap}>{gap}</b>
                            ))}
                          </div>
                        ) : null}
                        <p>{criterion.ready ? criterion.current : criterion.nextAction}</p>
                        {criterionActions.length ? (
                          <div className="v1-refresh-precheck-actions">
                            {criterionActions.map((action) => (
                              <button
                                className="ghost-button"
                                disabled={action.disabled}
                                key={`${criterion.key}-${action.key}`}
                                onClick={action.onClick}
                                type="button"
                              >
                                {action.label}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="v1-owner-decision-question">
                <strong>V1/V2 边界</strong>
                <p>{completionAudit.v2Boundary.label}</p>
                <p>{completionAudit.v2Boundary.nextAction}</p>
              </div>
            </section>
          ) : null}
          <section className="detail-section">
            <h3>当前解除阻塞阶段</h3>
            <div className="v1-phase-detail">
              <p>{selectedPhase.nextStep}</p>
              <div className="v1-phase-meta">
                <span>发布门禁 {selectedPhase.releaseTaskCount}</span>
                <span>现场证据 {selectedPhase.evidenceTaskCount}</span>
                <span>签字/边界 {selectedPhase.signBoundaryCount}</span>
                {selectedPhase.groupLabel ? <span>分组 {selectedPhase.groupLabel}</span> : null}
                {selectedPhase.firstTaskLabel ? <span>首批任务 {selectedPhase.firstTaskLabel}</span> : null}
              </div>
              <div className="v1-role-strip">
                {selectedPhaseRoles.map((role) => <span key={role}>{role}</span>)}
              </div>
              {selectedPhaseGroups.length ? (
                <div className="v1-phase-group-list">
                  {selectedPhaseGroups.map((group) => (
                    <span className="v1-phase-group" key={group.key}>
                      <strong>{group.group}</strong>
                      {group.countLabel ? <em>{group.countLabel}</em> : null}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="v1-phase-quick-actions">
                {buildSelectedPhaseQuickActions().map((action) => (
                  <button
                    className="ghost-button"
                    disabled={action.disabled}
                    key={`${selectedPhase.key}-${action.key}`}
                    onClick={action.onClick}
                    type="button"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="v1-action-list">
              {selectedPhaseTasks.map((task) => (
                <div className="v1-action-row" key={`${selectedPhase.key}-${task.key}`}>
                  <StatusPill tone={getV1PhaseTaskTone(task)}>{task.type || "待办"}</StatusPill>
                  <div>
                    <strong>{task.title}</strong>
                    <p>{task.group} / {task.roleLabel}：{task.action}</p>
                    <div className="v1-action-meta">
                      <span>{task.statusLabel}</span>
                      {task.primaryRole ? <span>{task.primaryRole}</span> : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
          {productionEnvGate ? (
            <section className="detail-section" ref={productionEnvGateRef}>
              <div className="v1-section-title-row">
                <h3>生产配置门禁</h3>
                <div className="v1-section-title-actions">
                  <button className="ghost-button" type="button" onClick={() => runProductionEnvFrontDoorReview()} disabled={!canShowProductionEnvFrontDoorReview || !canRunProductionEnvFrontDoorReview}>
                    {productionEnvFrontDoorReviewLoading ? "连续预检中" : "env 连续预检"}
                  </button>
                  <button className="primary-button" type="button" onClick={onRunProductionEnvSetup} disabled={!onRunProductionEnvSetup || productionEnvSetupAction.loading}>
                    {productionEnvSetupAction.loading ? "准备中" : "生成/复核安全草稿"}
                  </button>
                  <button className="ghost-button" type="button" onClick={onPrecheckProductionEnvFileAudit} disabled={!onPrecheckProductionEnvFileAudit || productionEnvFileAuditPrecheckAction.loading}>
                    {productionEnvFileAuditPrecheckAction.loading ? "审计中" : "env 文件审计"}
                  </button>
                  <button className="ghost-button" type="button" onClick={onPrecheckProductionEnvFilePreview} disabled={!onPrecheckProductionEnvFilePreview || productionEnvFilePreviewPrecheckAction.loading}>
                    {productionEnvFilePreviewPrecheckAction.loading ? "预检中" : "文件应用预检"}
                  </button>
                  <button className="ghost-button" type="button" onClick={onPrecheckProductionEnv} disabled={!onPrecheckProductionEnv || productionEnvPrecheckAction.loading}>
                    {productionEnvPrecheckAction.loading ? "预检中" : "当前预检"}
                  </button>
                  <button className="primary-button" type="button" onClick={onPrecheckProductionGoLive} disabled={!onPrecheckProductionGoLive || productionGoLivePrecheckAction.loading}>
                    {productionGoLivePrecheckAction.loading ? "预检中" : "组合预检"}
                  </button>
                </div>
              </div>
              <div className="v1-production-env-gate-summary">
                <span>通过 <strong>{productionEnvGate.summary.passedLabel}</strong></span>
                <span>阻塞 <strong>{productionEnvGate.summary.blockingLabel}</strong></span>
                <span>警告 <strong>{productionEnvGate.summary.warningLabel}</strong></span>
                <span>env 文件审计 <strong>{productionEnvGate.summary.auditStatusLabel}</strong></span>
              </div>
              {productionEnvSetupAction.result || productionEnvSetupAction.error ? (
                <div className="v1-production-env-setup-live-result">
                  {productionEnvSetupAction.result ? (
                    <>
                      <div>
                        <StatusPill tone={productionEnvSetupAction.result.ready ? "success" : productionEnvSetupAction.result.status === "error" ? "danger" : productionEnvSetupAction.result.status === "prepared" ? "warning" : "danger"}>
                          {productionEnvSetupAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近安全草稿 setup</strong>
                      </div>
                      <p>{productionEnvSetupAction.result.nextAction}</p>
                      <div className="v1-field-intake-summary">
                        <span>setup <strong>{productionEnvSetupAction.result.summary.setupReady ? "已准备" : "未就绪"}</strong></span>
                        <span>审计 <strong>{productionEnvSetupAction.result.summary.auditReady ? "通过" : "未通过"}</strong></span>
                        <span>env 预检 <strong>{productionEnvSetupAction.result.summary.envPreflightLabel || "0/0"}</strong></span>
                        <span>剩余修正 <strong>{productionEnvSetupAction.result.summary.remainingFixItemCount || 0} 项</strong></span>
                        <span>目标 env 写入 <strong>{productionEnvSetupAction.result.summary.targetEnvFileWritten ? "是" : "否"}</strong></span>
                        <span>真实值写入 <strong>{productionEnvSetupAction.result.summary.productionEnvRealValuesWritten ? "是" : "否"}</strong></span>
                        <span>路径暴露 <strong>{productionEnvSetupAction.result.summary.targetEnvFilePathExposed ? "是" : "否"}</strong></span>
                        <span>请求体 <strong>{productionEnvSetupAction.result.summary.requestBodyIgnored ? "已忽略" : "未忽略"}</strong></span>
                        <span>候选刷新 <strong>{productionEnvSetupAction.result.summary.releaseCandidateRefreshed ? "是" : "否"}</strong></span>
                      </div>
                      {productionEnvSetupAction.result.serverConfigGuidance?.steps?.length ? (
                        <div className="v1-production-env-file-audit-guidance">
                          <strong>服务端 setup 指引</strong>
                          <div className="v1-action-meta">
                            <span>目标来源 {productionEnvSetupAction.result.serverConfigGuidance.targetSource || "server-default"}</span>
                            <span>前端目标路径 {productionEnvSetupAction.result.serverConfigGuidance.acceptsFrontendTargetPath ? "允许" : "不允许"}</span>
                            <span>前端导入路径 {productionEnvSetupAction.result.serverConfigGuidance.acceptsFrontendImportPath ? "允许" : "不允许"}</span>
                            <span>前端 env 值 {productionEnvSetupAction.result.serverConfigGuidance.acceptsFrontendEnvValues ? "允许" : "不允许"}</span>
                            <span>force 覆盖 {productionEnvSetupAction.result.serverConfigGuidance.forceOverwriteEnabled ? "允许" : "不允许"}</span>
                          </div>
                          <ul>
                            {productionEnvSetupAction.result.serverConfigGuidance.steps.slice(0, 4).map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {productionEnvSetupAction.result.remainingFixItems.length ? (
                        <div className="v1-production-env-live-blockers">
                          {productionEnvSetupAction.result.remainingFixItems.slice(0, 5).map((item) => (
                            <p key={item.key || item.label}>
                              {item.label}：{item.nextAction || item.missingVariables.join(" / ")}
                            </p>
                          ))}
                        </div>
                      ) : productionEnvSetupAction.result.setupFindings.length ? (
                        <div className="v1-production-env-live-blockers">
                          {productionEnvSetupAction.result.setupFindings.slice(0, 5).map((item) => (
                            <p key={item.key || item.label}>
                              {item.label}：{item.nextAction || item.detail}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p>{productionEnvSetupAction.error}</p>
                  )}
                </div>
              ) : null}
              {productionEnvFileAuditPrecheckAction.result || productionEnvFileAuditPrecheckAction.error ? (
                <div className="v1-production-env-file-audit-live-result">
                  {productionEnvFileAuditPrecheckAction.result ? (
                    <>
                      <div>
                        <StatusPill tone={productionEnvFileAuditPrecheckAction.result.ready ? "success" : productionEnvFileAuditPrecheckAction.result.status === "not_configured" ? "warning" : "danger"}>
                          {productionEnvFileAuditPrecheckAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近 env 文件审计</strong>
                      </div>
                      <p>{productionEnvFileAuditPrecheckAction.result.nextAction}</p>
                      <div className="v1-field-intake-summary">
                        <span>服务端路径 <strong>{productionEnvFileAuditPrecheckAction.result.summary.envFilePathConfigured ? "已配置" : "未配置"}</strong></span>
                        <span>审计文件 <strong>{productionEnvFileAuditPrecheckAction.result.summary.fileCount} 个</strong></span>
                        <span>阻塞 <strong>{productionEnvFileAuditPrecheckAction.result.summary.blockingLabel}</strong></span>
                        <span>警告 <strong>{productionEnvFileAuditPrecheckAction.result.summary.warningLabel}</strong></span>
                        <span>跨文件重复 <strong>{productionEnvFileAuditPrecheckAction.result.summary.crossFileDuplicateVariableCount || 0} 个</strong></span>
                        <span>
                          当前来源{" "}
                          <strong>
                            {productionEnvFileAuditPrecheckAction.result.summary.selectedEnvVariable
                              ? `${productionEnvFileAuditPrecheckAction.result.summary.selectedEnvVariableLabel || "变量"} ${productionEnvFileAuditPrecheckAction.result.summary.selectedEnvVariable}`
                              : "未配置"}
                          </strong>
                        </span>
                        <span>前端路径输入 <strong>{productionEnvFileAuditPrecheckAction.result.summary.envFilePathAccepted ? "允许" : "不允许"}</strong></span>
                        <span>路径暴露 <strong>{productionEnvFileAuditPrecheckAction.result.safeguards?.envFilePathExposed ? "是" : "否"}</strong></span>
                      </div>
                      {productionEnvFileAuditPrecheckAction.result.serverConfigGuidance?.primaryEnvVariable ? (
                        <div className="v1-production-env-file-audit-guidance">
                          <strong>服务端配置指引</strong>
                          <p>
                            主变量 {productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.primaryEnvVariable}
                            {productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.fallbackEnvVariables.length
                              ? `；fallback ${productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.fallbackEnvVariables.join(" / ")}`
                              : ""}
                          </p>
                          <div className="v1-action-meta">
                            <span>
                              当前来源{" "}
                              {productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.selectedEnvVariable
                                ? `${productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.selectedEnvVariableLabel || "变量"} ${productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.selectedEnvVariable}`
                                : "未配置"}
                            </span>
                            <span>fallback 使用 {productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.fallbackSourceUsed ? "是" : "否"}</span>
                            <span>已配置来源 {productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.configuredSourceVariableCount || 0} 个</span>
                            <span>被忽略 fallback {productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.ignoredConfiguredFallbackVariableCount || 0} 个</span>
                            <span>重启 API {productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.restartRequired ? "需要" : "不需要"}</span>
                            <span>前端传路径 {productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.acceptsFrontendPath ? "允许" : "不允许"}</span>
                            <span>真实路径暴露 {productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.pathValueExposed ? "是" : "否"}</span>
                          </div>
                          {renderV1ProductionEnvFileSourceStatusList(productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.sourceStatuses)}
                          <ul>
                            {productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.steps.slice(0, 4).map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {productionEnvFileAuditPrecheckAction.result.files.length ? (
                        <div className="v1-production-env-file-audit-files">
                          {productionEnvFileAuditPrecheckAction.result.files.slice(0, 3).map((item) => (
                            <span key={item.key}>
                              {item.label}：变量 {item.variableCount} 个 / 占位 {item.placeholderAssignmentCount} 个 / 权限 {item.fileMode || "未知"}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {(productionEnvFileAuditPrecheckAction.result.blockingFindings.length || productionEnvFileAuditPrecheckAction.result.warningFindings.length) ? (
                        <div className="v1-production-env-file-audit-blockers">
                          {[...productionEnvFileAuditPrecheckAction.result.blockingFindings, ...productionEnvFileAuditPrecheckAction.result.warningFindings].slice(0, 4).map((item) => (
                            <p key={item.key || item.label}>
                              {item.label}：{item.nextAction || item.detail}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p>{productionEnvFileAuditPrecheckAction.error}</p>
                  )}
                </div>
              ) : null}
              {productionEnvFilePreviewPrecheckAction.result || productionEnvFilePreviewPrecheckAction.error ? (
                <div className="v1-production-env-file-preview-live-result">
                  {productionEnvFilePreviewPrecheckAction.result ? (
                    <>
                      <div>
                        <StatusPill tone={productionEnvFilePreviewPrecheckAction.result.ready ? "success" : productionEnvFilePreviewPrecheckAction.result.status === "not_configured" ? "warning" : "danger"}>
                          {productionEnvFilePreviewPrecheckAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近 env 文件应用预检</strong>
                      </div>
                      <p>{productionEnvFilePreviewPrecheckAction.result.nextAction}</p>
                      <div className="v1-field-intake-summary">
                        <span>服务端路径 <strong>{productionEnvFilePreviewPrecheckAction.result.summary.envFilePathConfigured ? "已配置" : "未配置"}</strong></span>
                        <span>内存应用 <strong>{productionEnvFilePreviewPrecheckAction.result.summary.appliedInMemory ? "是" : "否"}</strong></span>
                        <span>当前进程改写 <strong>{productionEnvFilePreviewPrecheckAction.result.summary.processEnvMutated ? "是" : "否"}</strong></span>
                        <span>通过 <strong>{productionEnvFilePreviewPrecheckAction.result.summary.passedLabel}</strong></span>
                        <span>阻塞 <strong>{productionEnvFilePreviewPrecheckAction.result.summary.blockerLabel}</strong></span>
                        <span>审计 <strong>{productionEnvFilePreviewPrecheckAction.result.summary.envFileAuditStatusLabel || "未执行"}</strong></span>
                        <span>当前阶段 <strong>{productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.currentStageLabel || productionEnvFilePreviewPrecheckAction.result.summary.currentStageLabel || "未识别"}</strong></span>
                        <span>
                          配置源{" "}
                          <strong>
                            {productionEnvFilePreviewPrecheckAction.result.summary.selectedEnvVariable
                              ? `${productionEnvFilePreviewPrecheckAction.result.summary.selectedEnvVariableLabel || "变量"} ${productionEnvFilePreviewPrecheckAction.result.summary.selectedEnvVariable}`
                              : "未配置"}
                          </strong>
                        </span>
                      </div>
                      {productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.currentStageLabel ? (
                        <div className="v1-production-env-file-preview-stage">
                          <div>
                            <StatusPill tone={productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.stageStatus === "ready" ? "success" : productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.stageStatus === "not_configured" ? "warning" : "danger"}>
                              {productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.stageStatusLabel || "待处理"}
                            </StatusPill>
                            <strong>{productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.currentStageLabel}</strong>
                            {productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.nextStageLabel ? (
                              <span>下一阶段：{productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.nextStageLabel}</span>
                            ) : null}
                          </div>
                          <div className="v1-action-meta">
                            <span>
                              配置源{" "}
                              {productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.selectedEnvVariable
                                ? `${productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.selectedEnvVariableLabel || "变量"} ${productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.selectedEnvVariable}`
                                : "未配置"}
                            </span>
                            <span>fallback 使用 {productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.fallbackSourceUsed ? "是" : "否"}</span>
                            <span>已配置来源 {productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.configuredSourceVariableCount || 0} 个</span>
                          </div>
                          {renderV1ProductionEnvFileSourceStatusList(productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.sourceStatuses)}
                          {productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.detail ? (
                            <p>{productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.detail}</p>
                          ) : null}
                        </div>
                      ) : null}
                      {productionEnvFilePreviewPrecheckAction.result.blockingChecks.length ? (
                        <div className="v1-production-env-file-preview-blockers">
                          {productionEnvFilePreviewPrecheckAction.result.blockingChecks.slice(0, 4).map((item) => (
                            <p key={item.key || item.label}>
                              {item.label}：{item.nextAction}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p>{productionEnvFilePreviewPrecheckAction.error}</p>
                  )}
                </div>
              ) : null}
              {productionEnvPrecheckAction.result || productionEnvPrecheckAction.error ? (
                <div className="v1-production-env-live-result">
                  {productionEnvPrecheckAction.result ? (
                    <>
                      <div>
                        <StatusPill tone={productionEnvPrecheckAction.result.ready ? "success" : "warning"}>
                          {productionEnvPrecheckAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近 env 预检</strong>
                      </div>
                      <p>{productionEnvPrecheckAction.result.nextAction}</p>
                      <div className="v1-field-intake-summary">
                        <span>当前进程 <strong>{productionEnvPrecheckAction.result.summary.currentRuntime ? "是" : "否"}</strong></span>
                        <span>通过 <strong>{productionEnvPrecheckAction.result.summary.passedLabel}</strong></span>
                        <span>阻塞 <strong>{productionEnvPrecheckAction.result.summary.blockerLabel}</strong></span>
                        <span>警告 <strong>{productionEnvPrecheckAction.result.summary.warningLabel}</strong></span>
                        <span>env 路径输入 <strong>{productionEnvPrecheckAction.result.summary.envFilePathAccepted ? "允许" : "不允许"}</strong></span>
                        <span>候选刷新 <strong>{productionEnvPrecheckAction.result.summary.releaseCandidateRefreshed ? "是" : "否"}</strong></span>
                      </div>
                      {productionEnvPrecheckAction.result.blockingChecks.length ? (
                        <div className="v1-production-env-live-blockers">
                          {productionEnvPrecheckAction.result.blockingChecks.slice(0, 3).map((item) => (
                            <p key={item.key || item.label}>
                              {item.label}：{item.nextAction}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p>{productionEnvPrecheckAction.error}</p>
                  )}
                </div>
              ) : null}
              {productionGoLivePrecheckAction.result || productionGoLivePrecheckAction.error ? (
                <div className="v1-production-go-live-live-result">
                  {productionGoLivePrecheckAction.result ? (
                    <>
                      <div>
                        <StatusPill tone={productionGoLivePrecheckAction.result.ready ? "success" : productionGoLivePrecheckAction.result.status === "error" ? "danger" : "warning"}>
                          {productionGoLivePrecheckAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近生产上线组合预检</strong>
                      </div>
                      <p>{productionGoLivePrecheckAction.result.nextAction}</p>
                      <div className="v1-field-intake-summary">
                        <span>阶段 <strong>{productionGoLivePrecheckAction.result.summary.readinessLabel}</strong></span>
                        <span>阻塞 <strong>{productionGoLivePrecheckAction.result.summary.blockerLabel}</strong></span>
                        <span>env 文件 <strong>{productionGoLivePrecheckAction.result.summary.configuredEnvFileCount} 个</strong></span>
                        <span>当前实例 <strong>{productionGoLivePrecheckAction.result.summary.currentRuntime ? "是" : "否"}</strong></span>
                        <span>应用 env <strong>{productionGoLivePrecheckAction.result.summary.productionEnvAppliedToProcess ? "是" : "否"}</strong></span>
                        <span>候选刷新 <strong>{productionGoLivePrecheckAction.result.summary.releaseCandidateRefreshed ? "是" : "否"}</strong></span>
                      </div>
                      {renderV1ProductionEnvFileSourceStatusList(productionGoLivePrecheckAction.result.summary.sourceStatuses)}
                      {productionGoLivePrecheckAction.result.fieldEvidenceCoverage.items.length ? (
                        <div className="v1-production-go-live-evidence-coverage">
                          <div>
                            <strong>现场证据覆盖</strong>
                            <span>
                              报告可支持 <strong>{productionGoLivePrecheckAction.result.fieldEvidenceCoverage.summary.reportSupportedLabel}</strong>
                            </span>
                            <span>
                              仍需补证 <strong>{productionGoLivePrecheckAction.result.fieldEvidenceCoverage.summary.stillNeedsFieldEvidenceLabel}</strong>
                            </span>
                          </div>
                          <p>{productionGoLivePrecheckAction.result.fieldEvidenceCoverage.summary.nextAction}</p>
                          {productionGoLivePrecheckAction.result.fieldEvidenceCoverage.items.slice(0, 5).map((item) => (
                            <div className="v1-production-go-live-evidence-row" key={`${item.groupKey}-${item.itemKey}`}>
                              <StatusPill
                                tone={
                                  item.status === "report_supported"
                                    ? "success"
                                    : item.status === "needs_onsite_ref"
                                      ? "warning"
                                      : "danger"
                                }
                              >
                                {item.statusLabel}
                              </StatusPill>
                              <div>
                                <strong>{item.groupLabel} / {item.itemLabel}</strong>
                                <p>{item.nextAction}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {productionGoLivePrecheckAction.result.stages.length ? (
                        <div className="v1-production-go-live-stages">
                          {productionGoLivePrecheckAction.result.stages.map((stage) => (
                            <div className="v1-production-go-live-stage" key={stage.key || stage.label}>
                              <StatusPill tone={stage.ready ? "success" : "warning"}>
                                {stage.ready ? "通过" : "阻塞"}
                              </StatusPill>
                              <div>
                                <strong>{stage.label}</strong>
                                <p>{stage.summary.label || stage.nextActions[0] || "等待预检结果"}</p>
                                {stage.blockingItems.length ? (
                                  <div className="v1-production-go-live-blockers">
                                    {stage.blockingItems.slice(0, 3).map((item) => (
                                      <span key={item.key || item.label}>{item.label}：{item.detail}</span>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {productionGoLivePrecheckAction.result.unblockChecklist.length ? (
                        <div className="v1-production-go-live-unblock-list">
                          <strong>解除阻塞清单</strong>
                          {productionGoLivePrecheckAction.result.unblockChecklist.slice(0, 4).map((item) => (
                            <div className="v1-production-go-live-unblock-row" key={item.key || item.label}>
                              <div>
                                <StatusPill tone={item.ready ? "success" : "warning"}>
                                  {item.ready ? "已通过" : "待处理"}
                                </StatusPill>
                                <strong>{item.stageOrder ? `${item.stageOrder}. ${item.label}` : item.label}</strong>
                                <span>{item.ownerRole}</span>
                              </div>
                              <p>{item.nextAction}</p>
                              {item.verificationSteps.length || item.evidenceToKeep.length ? (
                                <div className="v1-production-go-live-unblock-meta">
                                  {item.verificationSteps[0] ? <span>复核：{item.verificationSteps[0]}</span> : null}
                                  {item.evidenceToKeep[0] ? <span>留证：{item.evidenceToKeep[0]}</span> : null}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p>{productionGoLivePrecheckAction.error}</p>
                  )}
                </div>
              ) : null}
              <div className="v1-production-env-audit">
                <StatusPill tone={productionEnvGate.audit.included ? productionEnvGate.audit.ready ? "success" : "warning" : "warning"}>
                  {productionEnvGate.audit.statusLabel}
                </StatusPill>
                <div>
                  <strong>env 文件审计</strong>
                  <p>{productionEnvGate.audit.summary.label || "填写安全 env 文件后重新执行 env 文件安全审计。"}</p>
                </div>
              </div>
              <div className="v1-production-env-gate-list">
                {(productionEnvGate.blockingChecks.length ? productionEnvGate.blockingChecks : productionEnvGate.checks).slice(0, 5).map((item) => {
                  const gateActions = buildProductionEnvGateActions(item);
                  return (
                    <div className="v1-production-env-gate-row" key={item.key || item.label}>
                      <div>
                        <StatusPill tone={item.severity === "blocking" ? "danger" : item.severity === "warning" ? "warning" : "success"}>
                          {item.severity === "blocking" ? "阻塞" : item.severity === "warning" ? "警告" : "已通过"}
                        </StatusPill>
                        <strong>{item.label}</strong>
                      </div>
                      <p>{item.nextAction}</p>
                      <div className="v1-production-env-gate-meta">
                        <span>{item.ownerRole}</span>
                        <span>{item.configuredVariableCount}/{item.totalVariableCount} 已配置</span>
                        {item.variableLabel ? <span>{item.variableLabel}</span> : null}
                      </div>
                      {gateActions.length ? (
                        <div className="v1-production-env-gate-actions">
                          {gateActions.map((action) => (
                            <button
                              className="ghost-button"
                              disabled={action.disabled}
                              key={`${item.key || item.label}-${action.key}`}
                              onClick={action.onClick}
                              type="button"
                            >
                              {action.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <p className="v1-production-env-gate-note">{productionEnvGate.nextAction}</p>
            </section>
          ) : null}
          {productionEnvIntakeVerification ? (
            <section className="detail-section" ref={productionEnvIntakeVerificationRef}>
              <div className="v1-section-title-row">
                <h3>生产 env 真实值校验</h3>
                <div className="v1-section-title-actions">
                  <button
                    className="primary-button"
                    type="button"
                    onClick={onPrecheckProductionEnvIntake}
                    disabled={!onPrecheckProductionEnvIntake || productionEnvIntakePrecheckAction.loading}
                  >
                    {productionEnvIntakePrecheckAction.loading ? "校验中" : "重新校验真实值"}
                  </button>
                  <button className="ghost-button" type="button" onClick={() => scrollV1StatusRefIntoView(productionEnvFixChecklistRef)}>
                    查看修正清单
                  </button>
                  <button className="ghost-button" type="button" onClick={() => scrollV1StatusRefIntoView(productionEnvMinimumValuesFragmentTemplateRef)}>
                    查看最小片段
                  </button>
                  <button className="ghost-button" type="button" onClick={() => scrollV1StatusRefIntoView(productionEnvFillTemplateRef)}>
                    查看填写草稿
                  </button>
                </div>
              </div>
              <div className="v1-field-intake-summary">
                <span>真实值清单 <strong>{productionEnvIntakeVerification.summary.configuredLabel}</strong></span>
                <span>最小阻塞补值 <strong>{productionEnvIntakeVerification.summary.minimumBlockingLabel}</strong></span>
                <span>建议 / 可选补值 <strong>{productionEnvIntakeVerification.summary.minimumWarningLabel}</strong></span>
                <span>缺失 <strong>{productionEnvIntakeVerification.summary.missingRowCount} 行</strong></span>
                <span>阻塞 <strong>{productionEnvIntakeVerification.summary.blockingLabel}</strong></span>
                <span>警告 <strong>{productionEnvIntakeVerification.summary.warningLabel}</strong></span>
                <span>任选组 <strong>{productionEnvIntakeVerification.summary.alternativeGroupBlockingCount}/{productionEnvIntakeVerification.summary.alternativeGroupCount} 阻塞</strong></span>
                <span>安全审计 <strong>{productionEnvIntakeVerification.summary.auditReady ? "通过" : "未通过"}</strong></span>
                <span>清单 CSV <strong>{productionEnvIntakeVerification.summary.intakeCsvReady ? "可读" : "未就绪"}</strong></span>
              </div>
              <div className="v1-production-env-intake-priority">
                <strong>优先补值路径</strong>
                <p>
                  先按最小 blocking 片段补齐 {productionEnvIntakeVerification.summary.minimumBlockingMissingCount} 项：
                  {productionEnvIntakeVerification.summary.minimumBlockingVariableRowCount} 个变量行
                  {productionEnvIntakeVerification.summary.minimumBlockingAlternativeGroupCount
                    ? ` + ${productionEnvIntakeVerification.summary.minimumBlockingAlternativeGroupCount} 个任选组`
                    : ""}
                  。补完后先跑真实值 dry-run，通过后再正式合并真实值。
                </p>
                <div className="v1-action-meta">
                  <span>全量清单 {productionEnvIntakeVerification.summary.fullIntakeConfiguredLabel}</span>
                  <span>最小补值缺 {productionEnvIntakeVerification.summary.minimumBlockingMissingCount} 项</span>
                  <span>建议 / 可选缺 {productionEnvIntakeVerification.summary.minimumWarningMissingCount} 项</span>
                  <span>模板 {productionEnvMinimumValuesFragmentTemplate ? "已生成" : "未生成"}</span>
                  <span>仍不接收浏览器 env 值</span>
                </div>
              </div>
              {productionEnvMinimumBlockingItems.length ? (
                <div className="v1-production-env-intake-blockers">
                  <strong>最小补值清单</strong>
                  <p>
                    先补下面 {productionEnvMinimumBlockingItems.length} 项；真实值只填安全 env 文件，页面只显示变量名和值类型。
                  </p>
                  {productionEnvMinimumBlockingItems.map((item) => (
                    <div className="v1-production-env-gate-row" key={item.key || item.variableLabel || item.label}>
                      <div>
                        <StatusPill tone="danger">待补</StatusPill>
                        <strong>{item.label}</strong>
                      </div>
                      <p>{item.nextAction || item.detail || "补齐安全 env 文件后重新校验真实值。"}</p>
                      <div className="v1-production-env-gate-meta">
                        {item.ownerRole ? <span>{item.ownerRole}</span> : null}
                        {item.variableLabel ? <span>{item.variableLabel}</span> : null}
                        {item.sourceSystem ? <span>{item.sourceSystem}</span> : null}
                        {item.expectedValueType ? <span>{item.expectedValueType}</span> : null}
                        <span>已配置 {item.configured || item.configuredKeyCount > 0 ? "是" : "否"}</span>
                        <span>已验收 {item.verifiedMarked ? "是" : "否"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="v1-production-env-intake-result">
                <div>
                  <StatusPill tone={productionEnvIntakeVerification.ready ? "success" : productionEnvIntakeVerification.status === "blocked" ? "danger" : "warning"}>
                    {productionEnvIntakeVerification.statusLabel}
                  </StatusPill>
                  <strong>{productionEnvIntakeVerification.summary.label}</strong>
                </div>
                <p>{productionEnvIntakeVerification.nextActions[0] || "按真实值清单补齐安全 env 文件，再重新运行生产 env 真实值校验。"}</p>
                <div className="v1-action-meta">
                  <span>env 路径暴露 {productionEnvIntakeVerification.safeguards?.envFilePathIncluded ? "是" : "否"}</span>
                  <span>真实值暴露 {productionEnvIntakeVerification.safeguards?.envValuesIncluded ? "是" : "否"}</span>
                  <span>secret 暴露 {productionEnvIntakeVerification.safeguards?.secretFieldsIncluded ? "是" : "否"}</span>
                  <span>原始证据号暴露 {productionEnvIntakeVerification.safeguards?.rawProofRefIncluded ? "是" : "否"}</span>
                </div>
              </div>
              {productionEnvIntakePrecheckAction.result || productionEnvIntakePrecheckAction.error ? (
                <div className="v1-production-env-intake-live-result">
                  {productionEnvIntakePrecheckAction.result ? (
                    <>
                      <div>
                        <StatusPill
                          tone={
                            productionEnvIntakePrecheckAction.result.ready
                              ? "success"
                              : productionEnvIntakePrecheckAction.result.status === "error"
                                ? "danger"
                                : "warning"
                          }
                        >
                          {productionEnvIntakePrecheckAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近真实值校验</strong>
                      </div>
                      <p>{productionEnvIntakePrecheckAction.result.nextAction}</p>
                      <div className="v1-field-intake-summary">
                        <span>真实值清单 <strong>{productionEnvIntakePrecheckAction.result.summary.configuredLabel}</strong></span>
                        <span>最小补值 <strong>{productionEnvIntakePrecheckAction.result.summary.minimumBlockingLabel}</strong></span>
                        <span>建议 / 可选 <strong>{productionEnvIntakePrecheckAction.result.summary.minimumWarningLabel}</strong></span>
                        <span>阻塞 <strong>{productionEnvIntakePrecheckAction.result.summary.blockerLabel}</strong></span>
                        <span>setup 安全文件 <strong>{productionEnvIntakePrecheckAction.result.summary.envFileFromProductionSetup ? "已复用" : "未就绪"}</strong></span>
                        <span>清单 CSV <strong>{productionEnvIntakePrecheckAction.result.summary.intakeCsvReady ? "可读" : "未就绪"}</strong></span>
                        <span>请求体 <strong>{productionEnvIntakePrecheckAction.result.summary.requestBodyIgnored ? "已忽略" : "未确认"}</strong></span>
                        <span>路径暴露 <strong>{productionEnvIntakePrecheckAction.result.summary.envFilePathExposed ? "是" : "否"}</strong></span>
                        <span>写 env <strong>{productionEnvIntakePrecheckAction.result.summary.productionEnvFileMutated ? "是" : "否"}</strong></span>
                        <span>候选刷新 <strong>{productionEnvIntakePrecheckAction.result.summary.releaseCandidateRefreshed ? "是" : "否"}</strong></span>
                      </div>
                      {productionEnvIntakePrecheckAction.result.serverConfigGuidance?.steps?.length ? (
                        <div className="v1-production-env-file-audit-guidance">
                          <strong>{productionEnvIntakePrecheckAction.result.serverConfigGuidance.label || "真实值校验边界"}</strong>
                          <p>
                            输入 {productionEnvIntakePrecheckAction.result.serverConfigGuidance.primaryInput || "production env setup latest"}
                            ；前端传路径 {productionEnvIntakePrecheckAction.result.serverConfigGuidance.acceptsFrontendPath ? "允许" : "不允许"}
                          </p>
                          <div className="v1-action-meta">
                            <span>setup 报告 {productionEnvIntakePrecheckAction.result.serverConfigGuidance.setupReportAvailable ? "存在" : "缺失"}</span>
                            <span>setup ready {productionEnvIntakePrecheckAction.result.serverConfigGuidance.setupReady ? "是" : "否"}</span>
                            <span>env 文件数 {productionEnvIntakePrecheckAction.result.serverConfigGuidance.envFileCount}</span>
                            <span>路径暴露 {productionEnvIntakePrecheckAction.result.serverConfigGuidance.pathValueExposed ? "是" : "否"}</span>
                          </div>
                          <ul>
                            {productionEnvIntakePrecheckAction.result.serverConfigGuidance.steps.slice(0, 4).map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {(productionEnvIntakePrecheckAction.result.blockingItems.length || productionEnvIntakePrecheckAction.result.blockingFindings.length) ? (
                        <div className="v1-production-env-intake-blockers">
                          {[...productionEnvIntakePrecheckAction.result.blockingItems, ...productionEnvIntakePrecheckAction.result.blockingFindings].slice(0, 5).map((item) => (
                            <p key={item.key || item.label}>
                              {item.label}：{item.nextAction || item.detail}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p>{productionEnvIntakePrecheckAction.error}</p>
                  )}
                </div>
              ) : null}
              {(productionEnvIntakeVerification.blockingFindings.length || productionEnvIntakeVerification.warningFindings.length) ? (
                <div className="v1-production-env-intake-blockers">
                  {[...productionEnvIntakeVerification.blockingFindings, ...productionEnvIntakeVerification.warningFindings].slice(0, 6).map((item) => (
                    <div className="v1-production-env-gate-row" key={item.key || item.label}>
                      <div>
                        <StatusPill tone={item.severity === "blocking" ? "danger" : item.severity === "warning" ? "warning" : "success"}>
                          {item.severity === "blocking" ? "阻塞" : item.severity === "warning" ? "警告" : "已通过"}
                        </StatusPill>
                        <strong>{item.label}</strong>
                      </div>
                      <p>{item.nextAction || item.detail}</p>
                      <div className="v1-production-env-gate-meta">
                        {item.ownerRole ? <span>{item.ownerRole}</span> : null}
                        {item.variableLabel ? <span>{item.variableLabel}</span> : null}
                        {item.sourceSystem ? <span>{item.sourceSystem}</span> : null}
                        {item.expectedValueType ? <span>{item.expectedValueType}</span> : null}
                        <span>已配置 {item.configured || item.configuredKeyCount > 0 ? "是" : "否"}</span>
                        <span>已验收 {item.verifiedMarked ? "是" : "否"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
          {productionFirstStageExecution ? (
            <section className="detail-section" ref={productionFirstStageExecutionRef}>
              <div className="v1-section-title-row">
                <h3>生产环境 / 持久化第一阶段</h3>
                <div className="v1-section-title-actions">
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={onRunProductionPersistenceEvidence}
                    disabled={!onRunProductionPersistenceEvidence || productionPersistenceEvidenceAction.loading}
                  >
                    {productionPersistenceEvidenceAction.loading ? "留证中" : "持久化留证"}
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={onRunProductionFirstStageExecution}
                    disabled={!onRunProductionFirstStageExecution || productionFirstStageExecutionAction.loading}
                  >
                    {productionFirstStageExecutionAction.loading ? "执行中" : "执行第一阶段"}
                  </button>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={onPrecheckProductionFirstStageValuesDryRun}
                    disabled={!onPrecheckProductionFirstStageValuesDryRun || productionFirstStageValuesDryRunAction.loading}
                  >
                    {productionFirstStageValuesDryRunAction.loading ? "dry-run 中" : "真实值 dry-run"}
                  </button>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={onApplyProductionFirstStageValues}
                    disabled={!onApplyProductionFirstStageValues || productionFirstStageValuesApplyAction.loading}
                  >
                    {productionFirstStageValuesApplyAction.loading ? "合并中" : "正式合并真实值"}
                  </button>
                  <button className="ghost-button" type="button" onClick={() => scrollV1StatusRefIntoView(productionEnvIntakeVerificationRef)}>
                    查看真实值校验
                  </button>
                  <button className="ghost-button" type="button" onClick={() => scrollV1StatusRefIntoView(productionEnvMinimumValuesFragmentTemplateRef)}>
                    查看最小片段
                  </button>
                  <button className="ghost-button" type="button" onClick={() => scrollV1StatusRefIntoView(productionEnvFillTemplateRef)}>
                    查看填写草稿
                  </button>
                </div>
              </div>
              <div className="v1-field-intake-summary">
                <span>执行步骤 <strong>{productionFirstStageExecution.summary.passedLabel}</strong></span>
                <span>阻塞 <strong>{productionFirstStageExecution.summary.blockingLabel}</strong></span>
                <span>错误 <strong>{productionFirstStageExecution.summary.errorLabel}</strong></span>
                <span>env 来源 <strong>{productionFirstStageExecution.execution.envFileSourceLabel || "未记录"}</strong></span>
                <span>intake 全量 <strong>{productionFirstStageExecution.intakeCoverage.fullIntakeConfiguredLabel || "未纳入"}</strong></span>
                <span>intake 最小补值 <strong>{productionFirstStageExecution.intakeCoverage.minimumBlockingLabel || "未纳入"}</strong></span>
                <span>intake 缺 <strong>{productionFirstStageExecution.intakeCoverage.minimumBlockingMissingCount} 项</strong></span>
                <span>values dry-run <strong>{productionFirstStageExecution.dryRunCoverage.statusLabel}</strong></span>
                <span>dry-run 最小补值 <strong>{productionFirstStageExecution.dryRunCoverage.minimumBlockingLabel}</strong></span>
              </div>
              {productionEnvValuesFragmentSourceStatus ? (
                <div className="v1-production-first-stage-result v1-production-env-values-fragment-source-status">
                  <div>
                    <StatusPill
                      tone={
                        productionEnvValuesFragmentSourceStatus.ready
                          ? "success"
                          : productionEnvValuesFragmentSourceStatus.status === "multiple_configured"
                            ? "danger"
                            : "warning"
                      }
                    >
                      {productionEnvValuesFragmentSourceStatus.statusLabel}
                    </StatusPill>
                    <strong>真实值片段来源</strong>
                  </div>
                  <p>{productionEnvValuesFragmentSourceStatus.nextAction}</p>
                  <div className="v1-action-meta">
                    <span>
                      主变量 <strong>{productionEnvValuesFragmentSourceStatus.summary.primaryEnvVariable || "ERP_V1_PRODUCTION_ENV_VALUES_FILE"}</strong>
                    </span>
                    <span>
                      fallback <strong>{productionEnvValuesFragmentSourceStatus.summary.fallbackEnvVariables.join(" / ") || "无"}</strong>
                    </span>
                    <span>
                      当前来源{" "}
                      <strong>
                        {productionEnvValuesFragmentSourceStatus.summary.selectedEnvVariable
                          ? `${productionEnvValuesFragmentSourceStatus.summary.selectedEnvVariableLabel || "变量"} ${productionEnvValuesFragmentSourceStatus.summary.selectedEnvVariable}`
                          : "未配置"}
                      </strong>
                    </span>
                    <span>已配置来源 <strong>{productionEnvValuesFragmentSourceStatus.summary.configuredSourceVariableCount}</strong></span>
                    <span>最小阻塞补值 <strong>{productionEnvValuesFragmentSourceStatus.summary.minimumBlockingLabel || "未生成"}</strong></span>
                    <span>最小补值缺 <strong>{productionEnvValuesFragmentSourceStatus.summary.minimumBlockingMissingCount} 项</strong></span>
                    <span>全量清单 <strong>{productionEnvValuesFragmentSourceStatus.summary.fullIntakeConfiguredLabel || "未生成"}</strong></span>
                    <span>前端传路径 <strong>{productionEnvValuesFragmentSourceStatus.summary.acceptsFrontendPath ? "允许" : "不允许"}</strong></span>
                    <span>真实路径暴露 <strong>{productionEnvValuesFragmentSourceStatus.summary.pathValueExposed ? "是" : "否"}</strong></span>
                    <span>目标 setup <strong>{productionEnvValuesFragmentSourceStatus.summary.targetSetupReady ? "已就绪" : "未就绪"}</strong></span>
                    <span>setup 报告 <strong>{productionEnvValuesFragmentSourceStatus.summary.targetSetupReportAvailable ? "有" : "无"}</strong></span>
                    <span>目标 env 文件 <strong>{productionEnvValuesFragmentSourceStatus.summary.targetSetupEnvFileCount} 个</strong></span>
                    <span>片段审计 <strong>{productionEnvValuesFragmentSourceStatus.summary.valuesFileAuditReady ? "通过" : productionEnvValuesFragmentSourceStatus.summary.valuesFileAuditExecuted ? "未通过" : "未执行"}</strong></span>
                    <span>审计阻塞 <strong>{productionEnvValuesFragmentSourceStatus.summary.valuesFileAuditBlockingCount} 项</strong></span>
                    <span>审计警告 <strong>{productionEnvValuesFragmentSourceStatus.summary.valuesFileAuditWarningCount} 项</strong></span>
                    <span>dry-run <strong>{productionEnvValuesFragmentSourceStatus.summary.dryRunExecuted ? "已执行" : "未执行"}</strong></span>
                    <span>目标 env 写入 <strong>{productionEnvValuesFragmentSourceStatus.summary.productionEnvFileMutated ? "是" : "否"}</strong></span>
                  </div>
                  {renderV1ProductionEnvFileSourceStatusList(productionEnvValuesFragmentSourceStatus.serverConfigGuidance.sourceStatuses)}
                </div>
              ) : null}
              {productionEnvValuesApplyGateStatus ? (
                <div className="v1-production-first-stage-result v1-production-env-values-apply-gate-status">
                  <div>
                    <StatusPill
                      tone={
                        productionEnvValuesApplyGateStatus.ready
                          ? "success"
                          : productionEnvValuesApplyGateStatus.status === "multiple_configured"
                            ? "danger"
                            : "warning"
                      }
                    >
                      {productionEnvValuesApplyGateStatus.statusLabel}
                    </StatusPill>
                    <strong>正式合并开关</strong>
                  </div>
                  <p>{productionEnvValuesApplyGateStatus.nextAction}</p>
                  <div className="v1-action-meta">
                    <span>
                      开关变量 <strong>{productionEnvValuesApplyGateStatus.summary.applyEnableEnvVariable}</strong>
                    </span>
                    <span>开关 <strong>{productionEnvValuesApplyGateStatus.summary.applyEnabled ? "已启用" : "未启用"}</strong></span>
                    <span>真实值片段 <strong>{productionEnvValuesApplyGateStatus.summary.valuesFilePathConfigured ? "已配置" : "未配置"}</strong></span>
                    <span>
                      当前来源{" "}
                      <strong>
                        {productionEnvValuesApplyGateStatus.summary.selectedEnvVariable
                          ? `${productionEnvValuesApplyGateStatus.summary.selectedEnvVariableLabel || "变量"} ${productionEnvValuesApplyGateStatus.summary.selectedEnvVariable}`
                          : "未配置"}
                      </strong>
                    </span>
                    <span>目标 env 可能写入 <strong>{productionEnvValuesApplyGateStatus.summary.targetEnvFileMayBeMutated ? "是" : "否"}</strong></span>
                    <span>最小阻塞补值 <strong>{productionEnvValuesApplyGateStatus.summary.minimumBlockingLabel || "未生成"}</strong></span>
                    <span>最小补值缺 <strong>{productionEnvValuesApplyGateStatus.summary.minimumBlockingMissingCount} 项</strong></span>
                    <span>全量清单 <strong>{productionEnvValuesApplyGateStatus.summary.fullIntakeConfiguredLabel || "未生成"}</strong></span>
                    <span>目标 setup <strong>{productionEnvValuesApplyGateStatus.summary.targetSetupReady ? "已就绪" : "未就绪"}</strong></span>
                    <span>setup 报告 <strong>{productionEnvValuesApplyGateStatus.summary.targetSetupReportAvailable ? "有" : "无"}</strong></span>
                    <span>目标 env 文件 <strong>{productionEnvValuesApplyGateStatus.summary.targetSetupEnvFileCount} 个</strong></span>
                    <span>片段审计 <strong>{productionEnvValuesApplyGateStatus.summary.valuesFileAuditReady ? "通过" : productionEnvValuesApplyGateStatus.summary.valuesFileAuditExecuted ? "未通过" : "未执行"}</strong></span>
                    <span>审计阻塞 <strong>{productionEnvValuesApplyGateStatus.summary.valuesFileAuditBlockingCount} 项</strong></span>
                    <span>审计警告 <strong>{productionEnvValuesApplyGateStatus.summary.valuesFileAuditWarningCount} 项</strong></span>
                    <span>dry-run 证明 <strong>{productionEnvValuesApplyGateStatus.summary.dryRunProofReady ? "通过" : productionEnvValuesApplyGateStatus.summary.dryRunProofStatusLabel || "未生成"}</strong></span>
                    <span>片段指纹 <strong>{productionEnvValuesApplyGateStatus.summary.dryRunProofValuesFingerprintMatched ? "已匹配" : productionEnvValuesApplyGateStatus.summary.dryRunProofValuesFingerprintStatusLabel || "未检查"}</strong></span>
                    <span>指纹摘要暴露 <strong>{productionEnvValuesApplyGateStatus.summary.dryRunProofValuesFingerprintDigestExposed ? "是" : "否"}</strong></span>
                    <span>dry-run 时效 <strong>{productionEnvValuesApplyGateStatus.summary.dryRunProofFresh ? "有效" : productionEnvValuesApplyGateStatus.summary.dryRunProofFreshnessLabel || "未生成"}</strong></span>
                    <span>dry-run 有效期 <strong>{productionEnvValuesApplyGateStatus.summary.dryRunProofMaxAgeHours ? `${productionEnvValuesApplyGateStatus.summary.dryRunProofMaxAgeHours} 小时` : "未设"}</strong></span>
                    <span>dry-run 失效 <strong>{productionEnvValuesApplyGateStatus.summary.dryRunProofExpiresAt || "未生成"}</strong></span>
                    <span>dry-run 剩余 <strong>{Number.isFinite(productionEnvValuesApplyGateStatus.summary.dryRunProofRemainingHours) ? `${productionEnvValuesApplyGateStatus.summary.dryRunProofRemainingHours} 小时` : "未生成"}</strong></span>
                    <span>dry-run 最小补值 <strong>{productionEnvValuesApplyGateStatus.summary.dryRunProofMinimumBlockingLabel || "未生成"}</strong></span>
                    <span>dry-run 缺 <strong>{productionEnvValuesApplyGateStatus.summary.dryRunProofMinimumBlockingMissingCount} 项</strong></span>
                    <span>本次已合并 <strong>{productionEnvValuesApplyGateStatus.summary.applyExecuted ? "是" : "否"}</strong></span>
                    <span>目标 env 已写入 <strong>{productionEnvValuesApplyGateStatus.summary.productionEnvFileMutated ? "是" : "否"}</strong></span>
                    <span>请求体 <strong>{productionEnvValuesApplyGateStatus.summary.requestBodyIgnored ? "已忽略" : "未确认"}</strong></span>
                    <span>路径暴露 <strong>{productionEnvValuesApplyGateStatus.summary.valuesFilePathExposed || productionEnvValuesApplyGateStatus.summary.targetEnvFilePathExposed ? "是" : "否"}</strong></span>
                    <span>迁移 apply <strong>{productionEnvValuesApplyGateStatus.summary.schemaMigrationApplyExecuted ? "已执行" : "未执行"}</strong></span>
                  </div>
                  {renderV1ProductionEnvFileSourceStatusList(productionEnvValuesApplyGateStatus.serverConfigGuidance.sourceStatuses)}
                </div>
              ) : null}
              {productionPersistenceEvidence ? (
                <div className="v1-production-first-stage-result v1-production-persistence-evidence-latest">
                  <div>
                    <StatusPill tone={productionPersistenceEvidence.ready ? "success" : productionPersistenceEvidence.status === "error" ? "danger" : "warning"}>
                      {productionPersistenceEvidence.statusLabel}
                    </StatusPill>
                    <strong>当前持久化留证 latest</strong>
                  </div>
                  <p>{productionPersistenceEvidence.nextAction || "按持久化留证阻塞项补齐真实 PostgreSQL、恢复验证库、对象存储或 production env 后重试。"}</p>
                  <div className="v1-action-meta">
                    <span>阶段 <strong>{productionPersistenceEvidenceSummary.passedLabel || "0/0"}</strong></span>
                    <span>阻塞 <strong>{productionPersistenceEvidenceSummary.blockingLabel || "0 项"}</strong></span>
                    <span>警告 <strong>{productionPersistenceEvidenceSummary.warningLabel || "0 项"}</strong></span>
                    <span>env 来源 <strong>{productionPersistenceEvidenceSummary.envFileSourceLabel || "未记录"}</strong></span>
                    <span>持久化 env <strong>{productionPersistenceEvidenceSummary.persistenceEnvReady ? "通过" : "未通过"}</strong></span>
                    <span>PostgreSQL <strong>{productionPersistenceEvidenceSummary.postgresReady ? "通过" : "未通过"}</strong></span>
                    <span>备份恢复 <strong>{productionPersistenceEvidenceSummary.postgresBackupRestoreReady ? "通过" : "未通过"}</strong></span>
                    <span>对象存储 <strong>{productionPersistenceEvidenceSummary.objectStorageReady ? "通过" : "未通过"}</strong></span>
                    <span>bucket 治理 <strong>{productionPersistenceEvidenceSummary.objectStorageGovernanceReady ? "通过" : "未通过"}</strong></span>
                    <span>迁移 apply <strong>{productionPersistenceEvidence.safeguards?.migrationApplyExecuted ? "已执行" : "未执行"}</strong></span>
                    <span>恢复重置 <strong>{productionPersistenceEvidence.safeguards?.postgresBackupRestoreResetExplicitlyAllowed ? "已授权" : "未授权"}</strong></span>
                    <span>路径暴露 <strong>{productionPersistenceEvidence.safeguards?.envFilePathExposed ? "是" : "否"}</strong></span>
                  </div>
                  {productionPersistenceEvidenceLatestBlockers.length ? (
                    <div className="v1-blocker-preview-list">
                      {productionPersistenceEvidenceLatestBlockers.slice(0, 5).map((item) => (
                        <div className="v1-blocker-preview-row" key={`${item.key || item.label}-${item.status || "blocked"}`}>
                          <StatusPill tone={item.ready ? "success" : item.status === "warning" ? "warning" : "danger"}>
                            {item.statusLabel || (item.ready ? "已通过" : "阻塞")}
                          </StatusPill>
                          <span>{item.label}</span>
                          <small>{item.nextAction || item.detail}</small>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {productionPersistenceEvidenceLiveResult || productionPersistenceEvidenceAction.error ? (
                <div className="v1-production-first-stage-result v1-production-persistence-evidence-live-result">
                  {productionPersistenceEvidenceLiveResult ? (
                    <>
                      <div>
                        <StatusPill
                          tone={
                            productionPersistenceEvidenceLiveResult.ready
                              ? "success"
                              : productionPersistenceEvidenceLiveResult.status === "error"
                                ? "danger"
                                : "warning"
                          }
                        >
                          {productionPersistenceEvidenceLiveResult.statusLabel}
                        </StatusPill>
                        <strong>最近持久化留证</strong>
                      </div>
                      <p>{productionPersistenceEvidenceLiveResult.nextAction || productionPersistenceEvidenceLiveResult.nextActions?.[0]}</p>
                      <div className="v1-action-meta">
                        <span>阶段 <strong>{productionPersistenceEvidenceLiveSummary.passedLabel || "0/0"}</strong></span>
                        <span>阻塞 <strong>{productionPersistenceEvidenceLiveSummary.blockerLabel || "0 项"}</strong></span>
                        <span>警告 <strong>{productionPersistenceEvidenceLiveSummary.warningLabel || "0 项"}</strong></span>
                        <span>env 来源 <strong>{productionPersistenceEvidenceLiveSummary.envFileSourceLabel || "未记录"}</strong></span>
                        <span>持久化 env <strong>{productionPersistenceEvidenceLiveSummary.persistenceEnvReady ? "通过" : "未通过"}</strong></span>
                        <span>PostgreSQL <strong>{productionPersistenceEvidenceLiveSummary.postgresReady ? "通过" : "未通过"}</strong></span>
                        <span>备份恢复 <strong>{productionPersistenceEvidenceLiveSummary.postgresBackupRestoreReady ? "通过" : "未通过"}</strong></span>
                        <span>对象存储 <strong>{productionPersistenceEvidenceLiveSummary.objectStorageReady ? "通过" : "未通过"}</strong></span>
                        <span>bucket 治理 <strong>{productionPersistenceEvidenceLiveSummary.objectStorageGovernanceReady ? "通过" : "未通过"}</strong></span>
                        <span>前端路径 <strong>{productionPersistenceEvidenceLiveSummary.envFilePathAccepted ? "已接受" : "不接受"}</strong></span>
                        <span>路径暴露 <strong>{productionPersistenceEvidenceLiveSummary.envFilePathExposed ? "是" : "否"}</strong></span>
                        <span>迁移 apply <strong>{productionPersistenceEvidenceLiveSummary.schemaMigrationApplyExecuted ? "已执行" : "未执行"}</strong></span>
                        <span>恢复重置 <strong>{productionPersistenceEvidenceLiveSummary.restoreResetExplicitlyAllowed ? "已授权" : "未授权"}</strong></span>
                        <span>业务数据 <strong>{productionPersistenceEvidenceLiveSummary.businessDataMutated ? "已改动" : "未改动"}</strong></span>
                        <span>打印设备 <strong>{productionPersistenceEvidenceLiveSummary.physicalPrinterCalled ? "已调用" : "未调用"}</strong></span>
                        <span>司机状态 <strong>{productionPersistenceEvidenceLiveSummary.driverDeliveryStatusChanged ? "已改动" : "未改动"}</strong></span>
                      </div>
                      <div className="v1-field-intake-summary v1-production-first-stage-server-guidance">
                        <span>服务端输入 <strong>{productionPersistenceEvidenceGuidance.primaryInput || "production env setup latest"}</strong></span>
                        <span>前端路径 <strong>{productionPersistenceEvidenceGuidance.acceptsFrontendPath ? "允许" : "不允许"}</strong></span>
                        <span>默认迁移 apply <strong>{productionPersistenceEvidenceGuidance.applyMigrationsByDefault ? "是" : "否"}</strong></span>
                        <span>默认恢复重置 <strong>{productionPersistenceEvidenceGuidance.restoreResetAllowedByDefault ? "是" : "否"}</strong></span>
                        <span>业务写入 <strong>{productionPersistenceEvidenceGuidance.writesBusinessData ? "是" : "否"}</strong></span>
                      </div>
                      {productionPersistenceEvidenceGuidance.steps?.length ? (
                        <ul className="v1-compact-list">
                          {productionPersistenceEvidenceGuidance.steps.slice(0, 4).map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      ) : null}
                      {productionPersistenceEvidenceBlockers.length ? (
                        <div className="v1-blocker-preview-list">
                          {productionPersistenceEvidenceBlockers.slice(0, 5).map((item) => (
                            <div className="v1-blocker-preview-row" key={`${item.key || item.label}-${item.status || item.severity || "blocked"}`}>
                              <StatusPill tone={item.severity === "warning" ? "warning" : item.ready ? "success" : "danger"}>
                                {item.statusLabel || (item.ready ? "已通过" : "阻塞")}
                              </StatusPill>
                              <span>{item.label}</span>
                              <small>{item.nextAction || item.detail}</small>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <div>
                        <StatusPill tone="danger">失败</StatusPill>
                        <strong>最近持久化留证</strong>
                      </div>
                      <p>{productionPersistenceEvidenceAction.error}</p>
                    </>
                  )}
                </div>
              ) : null}
              <div className="v1-production-first-stage-result">
                <div>
                  <StatusPill tone={productionFirstStageExecution.ready ? "success" : productionFirstStageExecution.status === "blocked" ? "danger" : "warning"}>
                    {productionFirstStageExecution.statusLabel}
                  </StatusPill>
                  <strong>{productionFirstStageExecution.summary.label}</strong>
                </div>
                <p>{productionFirstStageExecution.nextActions[0] || productionFirstStageExecution.dryRunCoverage.nextAction}</p>
                <div className="v1-action-meta">
                  <span>真实值 intake {productionFirstStageExecution.intakeCoverage.statusLabel}</span>
                  <span>全量清单 {productionFirstStageExecution.intakeCoverage.fullIntakeConfiguredLabel}</span>
                  <span>最小阻塞补值 {productionFirstStageExecution.intakeCoverage.minimumBlockingLabel}</span>
                  <span>最小补值缺 {productionFirstStageExecution.intakeCoverage.minimumBlockingMissingCount} 项</span>
                  <span>建议 / 可选补值 {productionFirstStageExecution.intakeCoverage.minimumWarningLabel}</span>
                  <span>intake CSV {productionFirstStageExecution.intakeCoverage.intakeCsvReady ? "ready" : "blocked"}</span>
                  <span>安全 env 文件 {productionFirstStageExecution.execution.envFileFromProductionSetup ? "来自 setup" : "未确认 setup 来源"}</span>
                  <span>迁移 apply {productionFirstStageExecution.execution.applyMigrations ? "已执行" : "未执行"}</span>
                  <span>恢复重置授权 {productionFirstStageExecution.execution.restoreResetExplicitlyAllowed ? "已显式授权" : "未授权"}</span>
                  <span>业务数据改动 {productionFirstStageExecution.safeguards?.businessDataMutated ? "是" : "否"}</span>
                </div>
              </div>
              <div className="v1-production-first-stage-result">
                <div>
                  <StatusPill tone={productionFirstStageExecution.dryRunCoverage.included ? productionFirstStageExecution.dryRunCoverage.minimumBlockingReady ? "success" : "warning" : "warning"}>
                    {productionFirstStageExecution.dryRunCoverage.statusLabel}
                  </StatusPill>
                  <strong>{productionFirstStageExecution.dryRunCoverage.included ? "真实值 dry-run 覆盖已纳入" : "真实值 dry-run 覆盖未纳入"}</strong>
                </div>
                <p>{productionFirstStageExecution.dryRunCoverage.nextAction}</p>
                <div className="v1-action-meta">
                  <span>预计 env 预检 {productionFirstStageExecution.dryRunCoverage.envPreflightLabel}</span>
                  <span>预计 intake {productionFirstStageExecution.dryRunCoverage.intakeLabel}</span>
                  <span>最小阻塞补值 {productionFirstStageExecution.dryRunCoverage.minimumBlockingLabel}</span>
                  <span>建议 / 可选补值 {productionFirstStageExecution.dryRunCoverage.minimumWarningLabel}</span>
                </div>
              </div>
              {productionFirstStageExecutionAction.result || productionFirstStageExecutionAction.error ? (
                <div className="v1-production-first-stage-execution-live-result">
                  {productionFirstStageExecutionAction.result ? (
                    <>
                      <div>
                        <StatusPill
                          tone={
                            productionFirstStageExecutionAction.result.ready
                              ? "success"
                              : productionFirstStageExecutionAction.result.status === "error"
                                ? "danger"
                                : "warning"
                          }
                        >
                          {productionFirstStageExecutionAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近第一阶段执行</strong>
                      </div>
                      <p>{productionFirstStageExecutionAction.result.nextAction}</p>
                      <div className="v1-field-intake-summary">
                        <span>执行步骤 <strong>{productionFirstStageExecutionAction.result.summary.passedLabel}</strong></span>
                        <span>阻塞 <strong>{productionFirstStageExecutionAction.result.summary.blockerLabel}</strong></span>
                        <span>错误 <strong>{productionFirstStageExecutionAction.result.summary.errorLabel}</strong></span>
                        <span>env 来源 <strong>{productionFirstStageExecutionAction.result.summary.envFileSourceLabel || "未记录"}</strong></span>
                        <span>intake 全量 <strong>{productionFirstStageExecutionAction.result.firstStageExecution.intakeCoverage.fullIntakeConfiguredLabel}</strong></span>
                        <span>intake 最小补值 <strong>{productionFirstStageExecutionAction.result.firstStageExecution.intakeCoverage.minimumBlockingLabel}</strong></span>
                        <span>intake 缺 <strong>{productionFirstStageExecutionAction.result.firstStageExecution.intakeCoverage.minimumBlockingMissingCount} 项</strong></span>
                        <span>请求体 <strong>{productionFirstStageExecutionAction.result.summary.requestBodyIgnored ? "已忽略" : "未确认"}</strong></span>
                        <span>前端路径 <strong>{productionFirstStageExecutionAction.result.summary.envFilePathAccepted ? "已接受" : "不接受"}</strong></span>
                        <span>路径暴露 <strong>{productionFirstStageExecutionAction.result.summary.envFilePathExposed ? "是" : "否"}</strong></span>
                        <span>runtime smoke <strong>{productionFirstStageExecutionAction.result.summary.runtimeSmokeUsesCurrentApi ? "当前 API" : "未确认"}</strong></span>
                        <span>API 地址输入 <strong>{productionFirstStageExecutionAction.result.summary.runtimeSmokeApiBaseUrlAccepted ? "已接受" : "不接受"}</strong></span>
                        <span>迁移 apply <strong>{productionFirstStageExecutionAction.result.summary.schemaMigrationApplyExecuted ? "已执行" : "未执行"}</strong></span>
                        <span>恢复重置 <strong>{productionFirstStageExecutionAction.result.summary.restoreResetExplicitlyAllowed ? "已授权" : "未授权"}</strong></span>
                        <span>业务数据 <strong>{productionFirstStageExecutionAction.result.summary.businessDataMutated ? "已改动" : "未改动"}</strong></span>
                        <span>候选刷新 <strong>{productionFirstStageExecutionAction.result.summary.releaseCandidateRefreshed ? "是" : "否"}</strong></span>
                      </div>
                      {productionFirstStageExecutionAction.result.serverConfigGuidance?.steps?.length ? (
                        <div className="v1-production-env-file-audit-guidance">
                          <strong>{productionFirstStageExecutionAction.result.serverConfigGuidance.label || "第一阶段执行边界"}</strong>
                          <p>
                            输入 {productionFirstStageExecutionAction.result.serverConfigGuidance.primaryInput || "production env setup latest"}
                            ；前端传路径 {productionFirstStageExecutionAction.result.serverConfigGuidance.acceptsFrontendPath ? "允许" : "不允许"}
                          </p>
                          <div className="v1-action-meta">
                            <span>默认迁移 apply {productionFirstStageExecutionAction.result.serverConfigGuidance.applyMigrationsByDefault ? "是" : "否"}</span>
                            <span>默认恢复重置 {productionFirstStageExecutionAction.result.serverConfigGuidance.restoreResetAllowedByDefault ? "允许" : "不允许"}</span>
                            <span>runtime smoke API {productionFirstStageExecutionAction.result.serverConfigGuidance.runtimeSmokeApiBaseUrlAcceptedFromFrontend ? "前端可传" : "当前请求"}</span>
                            <span>真实值片段输入 {productionFirstStageExecutionAction.result.serverConfigGuidance.productionEnvValuesFileAccepted ? "接受" : "不接受"}</span>
                            <span>路径暴露 {productionFirstStageExecutionAction.result.serverConfigGuidance.pathValueExposed ? "是" : "否"}</span>
                          </div>
                          <ul>
                            {productionFirstStageExecutionAction.result.serverConfigGuidance.steps.slice(0, 4).map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {(productionFirstStageExecutionAction.result.blockingItems.length || productionFirstStageExecutionAction.result.blockingStages.length) ? (
                        <div className="v1-production-first-stage-blockers">
                          {[...productionFirstStageExecutionAction.result.blockingItems, ...productionFirstStageExecutionAction.result.blockingStages].slice(0, 5).map((item) => (
                            <p key={item.key || item.label}>
                              {item.label}：{item.nextAction || item.detail}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p>{productionFirstStageExecutionAction.error}</p>
                  )}
                </div>
              ) : null}
              {productionFirstStageValuesDryRunAction.result || productionFirstStageValuesDryRunAction.error ? (
                <div className="v1-production-first-stage-dry-run-live-result">
                  {productionFirstStageValuesDryRunAction.result ? (
                    <>
                      <div>
                        <StatusPill
                          tone={
                            productionFirstStageValuesDryRunAction.result.ready
                              ? "success"
                              : productionFirstStageValuesDryRunAction.result.status === "not_configured"
                                ? "warning"
                                : productionFirstStageValuesDryRunAction.result.status === "error"
                                  ? "danger"
                                  : "warning"
                          }
                        >
                          {productionFirstStageValuesDryRunAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近真实值 dry-run</strong>
                      </div>
                      <p>{productionFirstStageValuesDryRunAction.result.nextAction}</p>
                      <div className="v1-field-intake-summary">
                        <span>真实值片段 <strong>{productionFirstStageValuesDryRunAction.result.summary.valuesFilePathConfigured ? "已配置" : "未配置"}</strong></span>
                        <span>配置来源 <strong>{productionFirstStageValuesDryRunAction.result.summary.selectedEnvVariable || "未配置"}</strong></span>
                        <span>目标 setup <strong>{productionFirstStageValuesDryRunAction.result.summary.targetSetupReady ? "已就绪" : "未就绪"}</strong></span>
                        <span>setup 报告 <strong>{productionFirstStageValuesDryRunAction.result.summary.targetSetupReportAvailable ? "有" : "无"}</strong></span>
                        <span>目标 env 文件 <strong>{productionFirstStageValuesDryRunAction.result.summary.targetSetupEnvFileCount} 个</strong></span>
                        <span>片段审计 <strong>{productionFirstStageValuesDryRunAction.result.summary.valuesFileAuditReady ? "通过" : productionFirstStageValuesDryRunAction.result.summary.valuesFileAuditExecuted ? "未通过" : "未执行"}</strong></span>
                        <span>审计阻塞 <strong>{productionFirstStageValuesDryRunAction.result.summary.valuesFileAuditBlockingCount} 项</strong></span>
                        <span>最小补值 <strong>{productionFirstStageValuesDryRunAction.result.dryRunCoverage.minimumBlockingLabel}</strong></span>
                        <span>dry-run 证明 <strong>{productionFirstStageValuesDryRunAction.result.summary.dryRunProofReady ? "通过" : productionFirstStageValuesDryRunAction.result.summary.dryRunProofStatusLabel || "未生成"}</strong></span>
                        <span>片段指纹 <strong>{productionFirstStageValuesDryRunAction.result.summary.dryRunProofValuesFingerprintMatched ? "已匹配" : productionFirstStageValuesDryRunAction.result.summary.dryRunProofValuesFingerprintStatusLabel || "未检查"}</strong></span>
                        <span>指纹摘要暴露 <strong>{productionFirstStageValuesDryRunAction.result.summary.dryRunProofValuesFingerprintDigestExposed ? "是" : "否"}</strong></span>
                        <span>dry-run 时效 <strong>{productionFirstStageValuesDryRunAction.result.summary.dryRunProofFresh ? "有效" : productionFirstStageValuesDryRunAction.result.summary.dryRunProofFreshnessLabel || "未生成"}</strong></span>
                        <span>dry-run 有效期 <strong>{productionFirstStageValuesDryRunAction.result.summary.dryRunProofMaxAgeHours ? `${productionFirstStageValuesDryRunAction.result.summary.dryRunProofMaxAgeHours} 小时` : "未设"}</strong></span>
                        <span>dry-run 失效 <strong>{productionFirstStageValuesDryRunAction.result.summary.dryRunProofExpiresAt || "未生成"}</strong></span>
                        <span>dry-run 剩余 <strong>{Number.isFinite(productionFirstStageValuesDryRunAction.result.summary.dryRunProofRemainingHours) ? `${productionFirstStageValuesDryRunAction.result.summary.dryRunProofRemainingHours} 小时` : "未生成"}</strong></span>
                        <span>dry-run 最小补值 <strong>{productionFirstStageValuesDryRunAction.result.summary.dryRunProofMinimumBlockingLabel || "未生成"}</strong></span>
                        <span>dry-run 缺 <strong>{productionFirstStageValuesDryRunAction.result.summary.dryRunProofMinimumBlockingMissingCount} 项</strong></span>
                        <span>预计 env <strong>{productionFirstStageValuesDryRunAction.result.dryRunCoverage.envPreflightLabel}</strong></span>
                        <span>预计 intake <strong>{productionFirstStageValuesDryRunAction.result.dryRunCoverage.intakeLabel}</strong></span>
                        <span>目标 env 写入 <strong>{productionFirstStageValuesDryRunAction.result.summary.productionEnvFileMutated ? "是" : "否"}</strong></span>
                        <span>路径暴露 <strong>{productionFirstStageValuesDryRunAction.result.summary.valuesFilePathExposed ? "是" : "否"}</strong></span>
                        <span>请求体 <strong>{productionFirstStageValuesDryRunAction.result.summary.requestBodyIgnored ? "已忽略" : "未确认"}</strong></span>
                      </div>
                      {productionFirstStageValuesDryRunAction.result.serverConfigGuidance?.primaryEnvVariable ? (
                        <div className="v1-production-env-file-audit-guidance">
                          <strong>真实值片段服务端配置</strong>
                          <p>
                            主变量 {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.primaryEnvVariable}
                            {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.fallbackEnvVariables.length
                              ? `；fallback ${productionFirstStageValuesDryRunAction.result.serverConfigGuidance.fallbackEnvVariables.join(" / ")}`
                              : ""}
                          </p>
                          <div className="v1-action-meta">
                            <span>
                              当前来源{" "}
                              {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.selectedEnvVariable
                                ? `${productionFirstStageValuesDryRunAction.result.serverConfigGuidance.selectedEnvVariableLabel || "变量"} ${productionFirstStageValuesDryRunAction.result.serverConfigGuidance.selectedEnvVariable}`
                                : "未配置"}
                            </span>
                            <span>已配置来源 {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.configuredSourceVariableCount || 0} 个</span>
                            <span>前端传路径 {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.acceptsFrontendPath ? "允许" : "不允许"}</span>
                            <span>真实路径暴露 {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.pathValueExposed ? "是" : "否"}</span>
                            <span>目标 setup {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.targetSetupReady ? "已就绪" : "未就绪"}</span>
                            <span>setup 报告 {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.targetSetupReportAvailable ? "有" : "无"}</span>
                            <span>目标 env 文件 {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.targetSetupEnvFileCount || 0} 个</span>
                            <span>片段审计 {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.valuesFileAuditReady ? "通过" : productionFirstStageValuesDryRunAction.result.serverConfigGuidance.valuesFileAuditExecuted ? "未通过" : "未执行"}</span>
                            <span>审计阻塞 {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.valuesFileAuditBlockingCount || 0} 项</span>
                            <span>dry-run 证明 {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.dryRunProofReady ? "通过" : productionFirstStageValuesDryRunAction.result.serverConfigGuidance.dryRunProofStatusLabel || "未生成"}</span>
                            <span>dry-run 时效 {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.dryRunProofFresh ? "有效" : productionFirstStageValuesDryRunAction.result.serverConfigGuidance.dryRunProofFreshnessLabel || "未生成"}</span>
                            <span>dry-run 最小补值 {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.dryRunProofMinimumBlockingLabel || "未生成"}</span>
                          </div>
                          {renderV1ProductionEnvFileSourceStatusList(productionFirstStageValuesDryRunAction.result.serverConfigGuidance.sourceStatuses)}
                          <ul>
                            {productionFirstStageValuesDryRunAction.result.serverConfigGuidance.steps.slice(0, 4).map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {(productionFirstStageValuesDryRunAction.result.blockingItems.length || productionFirstStageValuesDryRunAction.result.blockingStages.length) ? (
                        <div className="v1-production-first-stage-blockers">
                          {[...productionFirstStageValuesDryRunAction.result.blockingItems, ...productionFirstStageValuesDryRunAction.result.blockingStages].slice(0, 4).map((item) => (
                            <p key={item.key || item.label}>
                              {item.label}：{item.nextAction || item.detail}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p>{productionFirstStageValuesDryRunAction.error}</p>
                  )}
                </div>
              ) : null}
              {productionFirstStageValuesApplyAction.result || productionFirstStageValuesApplyAction.error ? (
                <div className="v1-production-first-stage-apply-live-result">
                  {productionFirstStageValuesApplyAction.result ? (
                    <>
                      <div>
                        <StatusPill
                          tone={
                            productionFirstStageValuesApplyAction.result.ready
                              ? "success"
                              : productionFirstStageValuesApplyAction.result.status === "disabled" ||
                                  productionFirstStageValuesApplyAction.result.status === "not_configured"
                                ? "warning"
                                : productionFirstStageValuesApplyAction.result.status === "error"
                                  ? "danger"
                                  : productionFirstStageValuesApplyAction.result.summary.productionEnvFileMutated
                                    ? "warning"
                                    : "danger"
                          }
                        >
                          {productionFirstStageValuesApplyAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近正式合并真实值</strong>
                      </div>
                      <p>{productionFirstStageValuesApplyAction.result.nextAction}</p>
                      <div className="v1-field-intake-summary">
                        <span>正式开关 <strong>{productionFirstStageValuesApplyAction.result.summary.applyEnabled ? "已启用" : "未启用"}</strong></span>
                        <span>真实值片段 <strong>{productionFirstStageValuesApplyAction.result.summary.valuesFilePathConfigured ? "已配置" : "未配置"}</strong></span>
                        <span>配置来源 <strong>{productionFirstStageValuesApplyAction.result.summary.selectedEnvVariable || "未配置"}</strong></span>
                        <span>写入变量 <strong>{productionFirstStageValuesApplyAction.result.summary.appliedVariableCount}</strong></span>
                        <span>目标 env 写入 <strong>{productionFirstStageValuesApplyAction.result.summary.productionEnvFileMutated ? "是" : "否"}</strong></span>
                        <span>目标 env 变更 <strong>{productionFirstStageValuesApplyAction.result.summary.targetEnvChanged ? "是" : "否"}</strong></span>
                        <span>目标 setup <strong>{productionFirstStageValuesApplyAction.result.summary.targetSetupReady ? "已就绪" : "未就绪"}</strong></span>
                        <span>setup 报告 <strong>{productionFirstStageValuesApplyAction.result.summary.targetSetupReportAvailable ? "有" : "无"}</strong></span>
                        <span>目标 env 文件 <strong>{productionFirstStageValuesApplyAction.result.summary.targetSetupEnvFileCount} 个</strong></span>
                        <span>片段审计 <strong>{productionFirstStageValuesApplyAction.result.summary.valuesFileAuditReady ? "通过" : productionFirstStageValuesApplyAction.result.summary.valuesFileAuditExecuted ? "未通过" : "未执行"}</strong></span>
                        <span>审计阻塞 <strong>{productionFirstStageValuesApplyAction.result.summary.valuesFileAuditBlockingCount} 项</strong></span>
                        <span>dry-run 证明 <strong>{productionFirstStageValuesApplyAction.result.summary.dryRunProofReady ? "通过" : productionFirstStageValuesApplyAction.result.summary.dryRunProofStatusLabel || "未生成"}</strong></span>
                        <span>片段指纹 <strong>{productionFirstStageValuesApplyAction.result.summary.dryRunProofValuesFingerprintMatched ? "已匹配" : productionFirstStageValuesApplyAction.result.summary.dryRunProofValuesFingerprintStatusLabel || "未检查"}</strong></span>
                        <span>指纹摘要暴露 <strong>{productionFirstStageValuesApplyAction.result.summary.dryRunProofValuesFingerprintDigestExposed ? "是" : "否"}</strong></span>
                        <span>dry-run 时效 <strong>{productionFirstStageValuesApplyAction.result.summary.dryRunProofFresh ? "有效" : productionFirstStageValuesApplyAction.result.summary.dryRunProofFreshnessLabel || "未生成"}</strong></span>
                        <span>dry-run 有效期 <strong>{productionFirstStageValuesApplyAction.result.summary.dryRunProofMaxAgeHours ? `${productionFirstStageValuesApplyAction.result.summary.dryRunProofMaxAgeHours} 小时` : "未设"}</strong></span>
                        <span>dry-run 失效 <strong>{productionFirstStageValuesApplyAction.result.summary.dryRunProofExpiresAt || "未生成"}</strong></span>
                        <span>dry-run 剩余 <strong>{Number.isFinite(productionFirstStageValuesApplyAction.result.summary.dryRunProofRemainingHours) ? `${productionFirstStageValuesApplyAction.result.summary.dryRunProofRemainingHours} 小时` : "未生成"}</strong></span>
                        <span>dry-run 最小补值 <strong>{productionFirstStageValuesApplyAction.result.summary.dryRunProofMinimumBlockingLabel || "未生成"}</strong></span>
                        <span>setup <strong>{productionFirstStageValuesApplyAction.result.summary.setupReady ? "通过" : "未通过"}</strong></span>
                        <span>env 预检 <strong>{productionFirstStageValuesApplyAction.result.summary.envPreflightLabel}</strong></span>
                        <span>intake 阻塞 <strong>{productionFirstStageValuesApplyAction.result.summary.intakeVerificationBlockingCount} 项</strong></span>
                        <span>路径暴露 <strong>{productionFirstStageValuesApplyAction.result.summary.valuesFilePathExposed || productionFirstStageValuesApplyAction.result.summary.targetEnvFilePathExposed ? "是" : "否"}</strong></span>
                        <span>请求体 <strong>{productionFirstStageValuesApplyAction.result.summary.requestBodyIgnored ? "已忽略" : "未确认"}</strong></span>
                        <span>迁移 apply <strong>{productionFirstStageValuesApplyAction.result.summary.schemaMigrationApplyExecuted ? "已执行" : "未执行"}</strong></span>
                      </div>
                      {productionFirstStageValuesApplyAction.result.serverConfigGuidance?.applyEnableEnvVariable ? (
                        <div className="v1-production-env-file-audit-guidance">
                          <strong>正式合并服务端配置</strong>
                          <p>
                            开关 {productionFirstStageValuesApplyAction.result.serverConfigGuidance.applyEnableEnvVariable}
                            ；真实值变量 {productionFirstStageValuesApplyAction.result.serverConfigGuidance.primaryEnvVariable}
                          </p>
                          <div className="v1-action-meta">
                            <span>开关 {productionFirstStageValuesApplyAction.result.serverConfigGuidance.applyEnabled ? "已启用" : "未启用"}</span>
                            <span>已配置来源 {productionFirstStageValuesApplyAction.result.serverConfigGuidance.configuredSourceVariableCount || 0} 个</span>
                            <span>目标 setup {productionFirstStageValuesApplyAction.result.serverConfigGuidance.targetSetupReady ? "已就绪" : "未就绪"}</span>
                            <span>setup 报告 {productionFirstStageValuesApplyAction.result.serverConfigGuidance.targetSetupReportAvailable ? "有" : "无"}</span>
                            <span>片段审计 {productionFirstStageValuesApplyAction.result.serverConfigGuidance.valuesFileAuditReady ? "通过" : productionFirstStageValuesApplyAction.result.serverConfigGuidance.valuesFileAuditExecuted ? "未通过" : "未执行"}</span>
                            <span>审计阻塞 {productionFirstStageValuesApplyAction.result.serverConfigGuidance.valuesFileAuditBlockingCount || 0} 项</span>
                            <span>dry-run 证明 {productionFirstStageValuesApplyAction.result.serverConfigGuidance.dryRunProofReady ? "通过" : productionFirstStageValuesApplyAction.result.serverConfigGuidance.dryRunProofStatusLabel || "未生成"}</span>
                            <span>dry-run 时效 {productionFirstStageValuesApplyAction.result.serverConfigGuidance.dryRunProofFresh ? "有效" : productionFirstStageValuesApplyAction.result.serverConfigGuidance.dryRunProofFreshnessLabel || "未生成"}</span>
                            <span>dry-run 最小补值 {productionFirstStageValuesApplyAction.result.serverConfigGuidance.dryRunProofMinimumBlockingLabel || "未生成"}</span>
                            <span>前端传路径 {productionFirstStageValuesApplyAction.result.serverConfigGuidance.acceptsFrontendPath ? "允许" : "不允许"}</span>
                            <span>真实路径暴露 {productionFirstStageValuesApplyAction.result.serverConfigGuidance.pathValueExposed ? "是" : "否"}</span>
                          </div>
                          {renderV1ProductionEnvFileSourceStatusList(productionFirstStageValuesApplyAction.result.serverConfigGuidance.sourceStatuses)}
                          <ul>
                            {productionFirstStageValuesApplyAction.result.serverConfigGuidance.steps.slice(0, 4).map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {(productionFirstStageValuesApplyAction.result.blockingItems.length || productionFirstStageValuesApplyAction.result.blockingFindings.length) ? (
                        <div className="v1-production-first-stage-blockers">
                          {[...productionFirstStageValuesApplyAction.result.blockingItems, ...productionFirstStageValuesApplyAction.result.blockingFindings].slice(0, 5).map((item) => (
                            <p key={item.key || item.label}>
                              {item.label}：{item.nextAction || item.detail}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p>{productionFirstStageValuesApplyAction.error}</p>
                  )}
                </div>
              ) : null}
              {productionFirstStageExecution.blockingStages.length ? (
                <div className="v1-production-first-stage-blockers">
                  {productionFirstStageExecution.blockingStages.slice(0, 5).map((stage) => (
                    <div className="v1-production-env-gate-row" key={stage.key || stage.label}>
                      <div>
                        <StatusPill tone={stage.status === "blocked" || stage.status === "error" ? "danger" : "warning"}>
                          {stage.statusLabel}
                        </StatusPill>
                        <strong>{stage.label}</strong>
                      </div>
                      <p>{stage.detail || stage.evidence.summaryLabel}</p>
                      <div className="v1-production-env-gate-meta">
                        {stage.evidence.summaryLabel ? <span>{stage.evidence.summaryLabel}</span> : null}
                        {stage.evidence.blockingCount ? <span>阻塞 {stage.evidence.blockingCount} 项</span> : null}
                        {stage.evidence.warningCount ? <span>警告 {stage.evidence.warningCount} 项</span> : null}
                        <span>命令暴露 否</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
          {runtimeReadinessBlockers ? (
            <section className="detail-section" ref={runtimeReadinessSectionRef}>
              <div className="v1-section-title-row">
                <h3>运行时门禁阻塞</h3>
                <div className="v1-section-title-actions">
                  <button className="ghost-button" type="button" onClick={onPrecheckV1Persistence} disabled={!onPrecheckV1Persistence || persistencePrecheckAction.loading}>
                    {persistencePrecheckAction.loading ? "预检中" : "持久化预检"}
                  </button>
                  <button className="ghost-button" type="button" onClick={onPrecheckV1AttachmentRetention} disabled={!onPrecheckV1AttachmentRetention || attachmentRetentionPrecheckAction.loading}>
                    {attachmentRetentionPrecheckAction.loading ? "预检中" : "附件留档预检"}
                  </button>
                  <button className="ghost-button" type="button" onClick={onPrecheckV1PrintSpool} disabled={!onPrecheckV1PrintSpool || printSpoolPrecheckAction.loading}>
                    {printSpoolPrecheckAction.loading ? "预检中" : "spool 预检"}
                  </button>
                  <button className="ghost-button" type="button" onClick={onPrecheckV1PrintCups} disabled={!onPrecheckV1PrintCups || printCupsPrecheckAction.loading}>
                    {printCupsPrecheckAction.loading ? "预检中" : "CUPS 预检"}
                  </button>
                  <button className="ghost-button" type="button" onClick={onPrecheckV1PrintReadiness} disabled={!onPrecheckV1PrintReadiness || printReadinessPrecheckAction.loading}>
                    {printReadinessPrecheckAction.loading ? "预检中" : "打印门禁预检"}
                  </button>
                  <button className="ghost-button" type="button" onClick={onPrecheckV1DriverReadiness} disabled={!onPrecheckV1DriverReadiness || driverReadinessPrecheckAction.loading}>
                    {driverReadinessPrecheckAction.loading ? "预检中" : "司机真机预检"}
                  </button>
                  <button className="ghost-button" type="button" onClick={onPrecheckRuntimeReadiness} disabled={!onPrecheckRuntimeReadiness || runtimeReadinessPrecheckAction.loading}>
                    {runtimeReadinessPrecheckAction.loading ? "预检中" : "当前预检"}
                  </button>
                </div>
              </div>
              <div className="v1-runtime-readiness-summary">
                <span>通过 <strong>{runtimeReadinessBlockers.summary.passedLabel}</strong></span>
                <span>阻塞 <strong>{runtimeReadinessBlockers.summary.blockingLabel}</strong></span>
                <span>显示 <strong>{runtimeReadinessBlockers.summary.shownBlockingLabel}</strong></span>
              </div>
              {runtimeReadinessPrecheckAction.result || runtimeReadinessPrecheckAction.error ? (
                <div className="v1-runtime-readiness-live-result">
                  {runtimeReadinessPrecheckAction.result ? (
                    <>
                      <div>
                        <StatusPill tone={runtimeReadinessPrecheckAction.result.ready ? "success" : "warning"}>
                          {runtimeReadinessPrecheckAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近运行时预检</strong>
                      </div>
                      <p>{runtimeReadinessPrecheckAction.result.nextAction}</p>
                      <div className="v1-field-intake-summary">
                        <span>当前实例 <strong>{runtimeReadinessPrecheckAction.result.summary.currentRuntime ? "是" : "否"}</strong></span>
                        <span>通过 <strong>{runtimeReadinessPrecheckAction.result.summary.passedLabel}</strong></span>
                        <span>阻塞 <strong>{runtimeReadinessPrecheckAction.result.summary.blockerLabel}</strong></span>
                        <span>不出纸 <strong>{runtimeReadinessPrecheckAction.result.summary.nonPrinting ? "是" : "否"}</strong></span>
                        <span>候选刷新 <strong>{runtimeReadinessPrecheckAction.result.summary.releaseCandidateRefreshed ? "是" : "否"}</strong></span>
                      </div>
                      {runtimeReadinessPrecheckAction.result.blockingCriteria.length ? (
                        <div className="v1-runtime-readiness-live-blockers">
                          {runtimeReadinessPrecheckAction.result.blockingCriteria.slice(0, 3).map((item) => (
                            <p key={item.key || item.label}>
                              {item.label}：{item.detail}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p>{runtimeReadinessPrecheckAction.error}</p>
                  )}
                </div>
              ) : null}
              {attachmentRetentionPrecheckAction.result || attachmentRetentionPrecheckAction.error ? (
                <div className="v1-attachment-retention-live-result">
                  {attachmentRetentionPrecheckAction.result ? (
                    <>
                      <div>
                        <StatusPill tone={attachmentRetentionPrecheckAction.result.ready ? "success" : "warning"}>
                          {attachmentRetentionPrecheckAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近附件留档预检</strong>
                      </div>
                      <p>{attachmentRetentionPrecheckAction.result.nextAction}</p>
                      <div className="v1-field-intake-summary">
                        <span>当前实例 <strong>{attachmentRetentionPrecheckAction.result.summary.currentRuntime ? "是" : "否"}</strong></span>
                        <span>通过 <strong>{attachmentRetentionPrecheckAction.result.summary.passedLabel}</strong></span>
                        <span>存储 <strong>{attachmentRetentionPrecheckAction.result.summary.storageKindLabel}</strong></span>
                        <span>对象存储 <strong>{attachmentRetentionPrecheckAction.result.summary.objectStorageLive ? "是" : "否"}</strong></span>
                        <span>诊断读写 <strong>{attachmentRetentionPrecheckAction.result.summary.diagnosticReady ? "是" : "否"}</strong></span>
                        <span>清理 <strong>{attachmentRetentionPrecheckAction.result.summary.diagnosticObjectCleanedUp ? "是" : "否"}</strong></span>
                        <span>本地批准 <strong>{attachmentRetentionPrecheckAction.result.summary.localFsAcceptedForV1 ? "是" : "否"}</strong></span>
                        <span>候选刷新 <strong>{attachmentRetentionPrecheckAction.result.summary.releaseCandidateRefreshed ? "是" : "否"}</strong></span>
                      </div>
                      {attachmentRetentionPrecheckAction.result.blockingCriteria.length ? (
                        <div className="v1-attachment-retention-live-blockers">
                          {attachmentRetentionPrecheckAction.result.blockingCriteria.slice(0, 3).map((item) => (
                            <p key={item.key || item.label}>
                              {item.label}：{item.detail}
                            </p>
                          ))}
                        </div>
                      ) : null}
                      <div className="v1-runtime-readiness-meta">
                        <span>写入 {attachmentRetentionPrecheckAction.result.diagnostics.writeOk ? "是" : "否"}</span>
                        <span>读回 {attachmentRetentionPrecheckAction.result.diagnostics.readOk ? "是" : "否"}</span>
                        <span>摘要 {attachmentRetentionPrecheckAction.result.diagnostics.digestOk ? "是" : "否"}</span>
                        <span>缺配置 {attachmentRetentionPrecheckAction.result.diagnostics.missingConfigFields.length} 项</span>
                      </div>
                    </>
                  ) : (
                    <p>{attachmentRetentionPrecheckAction.error}</p>
                  )}
                </div>
              ) : null}
              {printSpoolPrecheckAction.result || printSpoolPrecheckAction.error ? (
                <div className="v1-print-spool-live-result">
                  {printSpoolPrecheckAction.result ? (
                    <>
                      <div>
                        <StatusPill tone={printSpoolPrecheckAction.result.ready ? "success" : "warning"}>
                          {printSpoolPrecheckAction.result.ready ? "已通过" : "仍未通过"}
                        </StatusPill>
                        <strong>最近 spool 预检</strong>
                      </div>
                      <p>只检查命令桥 spool 写入、状态回读和清理；不创建业务打印作业，不调用物理打印机。</p>
                      <div className="v1-field-intake-summary">
                        <span>不出纸 <strong>{printSpoolPrecheckAction.result.safeguards.nonPrinting ? "是" : "否"}</strong></span>
                        <span>写入 <strong>{printSpoolPrecheckAction.result.writeOk ? "是" : "否"}</strong></span>
                        <span>待打回读 <strong>{printSpoolPrecheckAction.result.pendingPollOk ? "是" : "否"}</strong></span>
                        <span>完成回读 <strong>{printSpoolPrecheckAction.result.completedPollOk ? "是" : "否"}</strong></span>
                        <span>清理 <strong>{printSpoolPrecheckAction.result.cleanupOk ? "是" : "否"}</strong></span>
                        <span>物理打印 <strong>{printSpoolPrecheckAction.result.safeguards.physicalPrinterCalled ? "是" : "否"}</strong></span>
                      </div>
                      {printSpoolPrecheckAction.result.blockers.length ? (
                        <div className="v1-print-spool-live-blockers">
                          {printSpoolPrecheckAction.result.blockers.slice(0, 3).map((item) => (
                            <p key={item.key || item.label}>
                              {item.label}：{item.detail}
                            </p>
                          ))}
                        </div>
                      ) : null}
                      <div className="v1-runtime-readiness-meta">
                        <span>模式 {printSpoolPrecheckAction.result.mode || "unknown"}</span>
                        <span>存储 {printSpoolPrecheckAction.result.storageKind || "unknown"}</span>
                        <span>缺配置 {printSpoolPrecheckAction.result.missingConfigFields.length} 项</span>
                      </div>
                    </>
                  ) : (
                    <p>{printSpoolPrecheckAction.error}</p>
                  )}
                </div>
              ) : null}
              {printCupsPrecheckAction.result || printCupsPrecheckAction.error ? (
                <div className="v1-print-cups-live-result">
                  {printCupsPrecheckAction.result ? (
                    <>
                      <div>
                        <StatusPill tone={printCupsPrecheckAction.result.ready ? "success" : "warning"}>
                          {printCupsPrecheckAction.result.ready ? "已通过" : "仍未通过"}
                        </StatusPill>
                        <strong>最近 CUPS 预检</strong>
                      </div>
                      <p>只检查 CUPS 队列状态命令和白名单；不生成打印文件，不调用物理打印机。</p>
                      <div className="v1-field-intake-summary">
                        <span>不出纸 <strong>{printCupsPrecheckAction.result.safeguards.nonPrinting ? "是" : "否"}</strong></span>
                        <span>队列配置 <strong>{printCupsPrecheckAction.result.cupsPrinterConfigured ? "是" : "否"}</strong></span>
                        <span>白名单 <strong>{printCupsPrecheckAction.result.cupsPrinterAllowed ? "是" : "否"}</strong></span>
                        <span>状态命令 <strong>{printCupsPrecheckAction.result.cupsStatusCommandConfigured ? "是" : "否"}</strong></span>
                        <span>命令可执行 <strong>{printCupsPrecheckAction.result.cupsStatusCommandRunnable ? "是" : "否"}</strong></span>
                        <span>物理打印 <strong>{printCupsPrecheckAction.result.safeguards.physicalPrinterCalled ? "是" : "否"}</strong></span>
                      </div>
                      {printCupsPrecheckAction.result.blockers.length ? (
                        <div className="v1-print-cups-live-blockers">
                          {printCupsPrecheckAction.result.blockers.slice(0, 3).map((item) => (
                            <p key={item.key || item.label}>
                              {item.label}：{item.detail}
                            </p>
                          ))}
                        </div>
                      ) : null}
                      <div className="v1-runtime-readiness-meta">
                        <span>模式 {printCupsPrecheckAction.result.preflightResult?.mode || "unknown"}</span>
                        <span>适配器 {printCupsPrecheckAction.result.configuration.systemPrinterAdapterKind || "unknown"}</span>
                        <span>允许设备 {printCupsPrecheckAction.result.configuration.allowedPrinterCount}</span>
                        <span>stdout 暴露 {printCupsPrecheckAction.result.safeguards.stdoutExposed ? "是" : "否"}</span>
                        <span>stderr 暴露 {printCupsPrecheckAction.result.safeguards.stderrExposed ? "是" : "否"}</span>
                      </div>
                    </>
                  ) : (
                    <p>{printCupsPrecheckAction.error}</p>
                  )}
                </div>
              ) : null}
              {printReadinessPrecheckAction.result || printReadinessPrecheckAction.error ? (
                <div className="v1-print-readiness-live-result">
                  {printReadinessPrecheckAction.result ? (
                    <>
                      <div>
                        <StatusPill tone={printReadinessPrecheckAction.result.ready ? "success" : "warning"}>
                          {printReadinessPrecheckAction.result.ready ? "已通过" : "仍未通过"}
                        </StatusPill>
                        <strong>最近打印门禁预检</strong>
                      </div>
                      <p>只读取当前 V1 打印上线门禁、spool / CUPS 诊断和设备 QA 摘要；不生成打印文件，不调用物理打印机。</p>
                      <div className="v1-field-intake-summary">
                        <span>通过 <strong>{printReadinessPrecheckAction.result.summary.label}</strong></span>
                        <span>阻塞 <strong>{printReadinessPrecheckAction.result.summary.blockingCount} 项</strong></span>
                        <span>门禁项 <strong>{printReadinessPrecheckAction.result.criteria.length}</strong></span>
                        <span>必需设备 <strong>{printReadinessPrecheckAction.result.deviceReadiness.filter((item) => item.ready).length}/{printReadinessPrecheckAction.result.deviceReadiness.length}</strong></span>
                        <span>spool <strong>{printReadinessPrecheckAction.result.spoolDiagnostics.ready ? "通过" : "阻塞"}</strong></span>
                        <span>CUPS <strong>{printReadinessPrecheckAction.result.cupsDiagnostics.ready ? "通过" : "阻塞"}</strong></span>
                        <span>不出纸 <strong>{printReadinessPrecheckAction.result.safeguards.nonPrinting ? "是" : "否"}</strong></span>
                        <span>物理打印 <strong>{printReadinessPrecheckAction.result.safeguards.physicalPrinterCalled ? "是" : "否"}</strong></span>
                      </div>
                      {printReadinessPrecheckAction.result.criteria.filter((item) => item.blocking && item.status !== "passed").length ? (
                        <div className="v1-print-readiness-live-blockers">
                          {printReadinessPrecheckAction.result.criteria
                            .filter((item) => item.blocking && item.status !== "passed")
                            .slice(0, 4)
                            .map((item) => (
                              <p key={item.key || item.label}>
                                {item.label}：{item.detail}
                              </p>
                            ))}
                        </div>
                      ) : null}
                      {printReadinessPrecheckAction.result.remainingV1Risks.length ? (
                        <div className="v1-print-readiness-live-blockers">
                          {printReadinessPrecheckAction.result.remainingV1Risks.slice(0, 2).map((risk) => (
                            <p key={risk}>剩余风险：{risk}</p>
                          ))}
                        </div>
                      ) : null}
                      <div className="v1-runtime-readiness-meta">
                        <span>单据类型 {printReadinessPrecheckAction.result.requiredDocumentTypes.length}</span>
                        <span>命令值暴露 {printReadinessPrecheckAction.result.safeguards.commandValueExposed ? "是" : "否"}</span>
                        <span>参数暴露 {printReadinessPrecheckAction.result.safeguards.commandArgsExposed ? "是" : "否"}</span>
                        <span>spool 路径暴露 {printReadinessPrecheckAction.result.safeguards.spoolPathExposed ? "是" : "否"}</span>
                        <span>payload 暴露 {printReadinessPrecheckAction.result.safeguards.payloadExposed ? "是" : "否"}</span>
                      </div>
                    </>
                  ) : (
                    <p>{printReadinessPrecheckAction.error}</p>
                  )}
                </div>
              ) : null}
              {driverReadinessPrecheckAction.result || driverReadinessPrecheckAction.error ? (
                <div className="v1-driver-readiness-live-result">
                  {driverReadinessPrecheckAction.result ? (
                    <>
                      <div>
                        <StatusPill tone={driverReadinessPrecheckAction.result.ready ? "success" : "warning"}>
                          {driverReadinessPrecheckAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近司机真机预检</strong>
                      </div>
                      <p>只读取司机端 V1 真机门禁、现场验收摘要、原生桥接和纸质包裹标签扫码样本；不改送货状态，不调用摄像头、扫码或导航。</p>
                      <div className="v1-field-intake-summary">
                        <span>当前实例 <strong>{driverReadinessPrecheckAction.result.summary.currentRuntime ? "是" : "否"}</strong></span>
                        <span>通过 <strong>{driverReadinessPrecheckAction.result.summary.readinessLabel}</strong></span>
                        <span>阻塞 <strong>{driverReadinessPrecheckAction.result.summary.blockerLabel}</strong></span>
                        <span>任务读取 <strong>{driverReadinessPrecheckAction.result.summary.deliveryTaskCount} 条</strong></span>
                        <span>现场验收 <strong>{driverReadinessPrecheckAction.result.summary.fieldTestRecordAvailable ? driverReadinessPrecheckAction.result.summary.fieldTestLabel : "未记录"}</strong></span>
                        <span>原生能力 <strong>{driverReadinessPrecheckAction.result.summary.nativeSupportedLabel}</strong></span>
                        <span>标签扫码 <strong>{driverReadinessPrecheckAction.result.summary.packageLabelScanMatched ? "已匹配" : "未匹配"}</strong></span>
                        <span>原生扫码 <strong>{driverReadinessPrecheckAction.result.summary.packageLabelScanNative ? "是" : "否"}</strong></span>
                      </div>
                      {driverReadinessPrecheckAction.result.blockingCriteria.length ? (
                        <div className="v1-driver-readiness-live-blockers">
                          {driverReadinessPrecheckAction.result.blockingCriteria.slice(0, 4).map((item) => (
                            <p key={item.key || item.label}>
                              {item.label}：{item.detail}
                            </p>
                          ))}
                        </div>
                      ) : null}
                      {driverReadinessPrecheckAction.result.remainingV1Risks.length ? (
                        <div className="v1-driver-readiness-live-blockers">
                          {driverReadinessPrecheckAction.result.remainingV1Risks.slice(0, 2).map((risk) => (
                            <p key={risk}>剩余风险：{risk}</p>
                          ))}
                        </div>
                      ) : null}
                      <div className="v1-runtime-readiness-meta">
                        <span>司机验收账号 {driverReadinessPrecheckAction.result.driverOperatorId || "未返回"}</span>
                        <span>送货状态变更 {driverReadinessPrecheckAction.result.safeguards.deliveryTaskStatusChanged ? "是" : "否"}</span>
                        <span>调用摄像头 {driverReadinessPrecheckAction.result.safeguards.cameraPermissionRequested ? "是" : "否"}</span>
                        <span>调用导航 {driverReadinessPrecheckAction.result.safeguards.navigationAppOpened ? "是" : "否"}</span>
                        <span>调用原生桥 {driverReadinessPrecheckAction.result.safeguards.nativeBridgeInvoked ? "是" : "否"}</span>
                        <span>payload 暴露 {driverReadinessPrecheckAction.result.safeguards.payloadExposed ? "是" : "否"}</span>
                      </div>
                    </>
                  ) : (
                    <p>{driverReadinessPrecheckAction.error}</p>
                  )}
                </div>
              ) : null}
              {persistencePrecheckAction.result || persistencePrecheckAction.error ? (
                <div className="v1-persistence-live-result">
                  {persistencePrecheckAction.result ? (
                    <>
                      <div>
                        <StatusPill tone={persistencePrecheckAction.result.ready ? "success" : "warning"}>
                          {persistencePrecheckAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近持久化预检</strong>
                      </div>
                      <p>{persistencePrecheckAction.result.nextAction}</p>
                      <div className="v1-field-intake-summary">
                        <span>当前实例 <strong>{persistencePrecheckAction.result.summary.currentRuntime ? "是" : "否"}</strong></span>
                        <span>通过 <strong>{persistencePrecheckAction.result.summary.passedLabel}</strong></span>
                        <span>仓储组 <strong>{persistencePrecheckAction.result.summary.repositoryGroupLabel}</strong></span>
                        <span>生产仓储 <strong>{persistencePrecheckAction.result.summary.repositoryLabel}</strong></span>
                        <span>本地仓储 <strong>{persistencePrecheckAction.result.summary.localRepositoryLabel}</strong></span>
                        <span>本地接受 <strong>{persistencePrecheckAction.result.summary.localPersistenceAcceptedForV1 ? "是" : "否"}</strong></span>
                        <span>候选刷新 <strong>{persistencePrecheckAction.result.summary.releaseCandidateRefreshed ? "是" : "否"}</strong></span>
                      </div>
                      {persistencePrecheckAction.result.repositoryGroups.length ? (
                        <div className="v1-persistence-group-list">
                          {persistencePrecheckAction.result.repositoryGroups.slice(0, 5).map((group) => (
                            <div className="v1-persistence-group-row" key={group.key || group.label}>
                              <div>
                                <StatusPill tone={group.ready ? "success" : "danger"}>{group.statusLabel}</StatusPill>
                                <strong>{group.label}</strong>
                              </div>
                              <p>{group.nextAction}</p>
                              <div className="v1-runtime-readiness-meta">
                                <span>生产仓储 {group.repositoryLabel}</span>
                                <span>本地 {group.localRepositoryLabel}</span>
                                <span>内存 {group.localMemoryCount} / JSON {group.localJsonCount} / 文件 {group.localFsCount}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p>{persistencePrecheckAction.error}</p>
                  )}
                </div>
              ) : null}
              <div className="v1-runtime-readiness-list">
                {runtimeReadinessBlockers.blockers.map((item) => {
                  const blockerActions = buildRuntimeReadinessBlockerActions(item);
                  return (
                    <div className="v1-runtime-readiness-row" key={item.key}>
                      <div>
                        <StatusPill tone={item.ready ? "success" : "danger"}>{item.statusLabel}</StatusPill>
                        <strong>{item.label}</strong>
                      </div>
                      <p>{item.detail}</p>
                      <div className="v1-runtime-readiness-meta">
                        <span>{item.group}</span>
                        <span>{item.ownerRole}</span>
                        <span>{item.nextAction}</span>
                      </div>
                      {blockerActions.length ? (
                        <div className="v1-runtime-readiness-actions">
                          {blockerActions.map((action) => (
                            <button
                              className="ghost-button"
                              type="button"
                              key={action.key}
                              onClick={action.onClick}
                              disabled={action.disabled}
                            >
                              {action.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <p className="v1-runtime-readiness-note">{runtimeReadinessBlockers.nextAction}</p>
            </section>
          ) : null}
          {fieldAcceptanceReport ? (
            <section className="detail-section" ref={fieldAcceptanceReportRef}>
              <h3>现场验收报告</h3>
              <div className="v1-field-acceptance-summary">
                <span>通过 <strong>{fieldAcceptanceReport.summary.passedLabel}</strong></span>
                <span>阻塞 <strong>{fieldAcceptanceReport.summary.blockingLabel}</strong></span>
                <span>显示 <strong>{fieldAcceptanceReport.summary.shownBlockingLabel}</strong></span>
              </div>
              <p className="v1-field-acceptance-conclusion">{fieldAcceptanceReport.conclusion}</p>
              <div className="v1-field-acceptance-module-list">
                {fieldAcceptanceReport.modules.map((item) => (
                  <div className="v1-field-acceptance-module-row" key={item.key}>
                    <div>
                      <StatusPill tone={item.ready ? "success" : "danger"}>{item.statusLabel}</StatusPill>
                      <strong>{item.label}</strong>
                    </div>
                    <p>{item.detail}</p>
                    {item.evidence.length ? (
                      <div className="v1-field-acceptance-evidence">
                        {item.evidence.map((evidence) => <span key={evidence}>{evidence}</span>)}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="v1-field-acceptance-blocker-list">
                {fieldAcceptanceReport.blockingCriteria.map((item) => (
                  <div className="v1-field-acceptance-blocker-row" key={item.key}>
                    <div>
                      <StatusPill tone={item.blocking ? "danger" : "warning"}>{item.statusLabel}</StatusPill>
                      <strong>{item.label}</strong>
                    </div>
                    <p>{item.detail}</p>
                    <div className="v1-field-acceptance-meta">
                      <span>{item.nextAction}</span>
                    </div>
                  </div>
                ))}
              </div>
              {fieldAcceptanceReport.requiredFieldEvidence.length ? (
                <div className="v1-field-acceptance-required">
                  <strong>现场必须留档</strong>
                  <div className="v1-field-acceptance-required-list">
                    {fieldAcceptanceReport.requiredFieldEvidence.map((item) => (
                      <div className="v1-field-acceptance-required-row" key={item.key}>
                        <span>{item.label}<strong>{item.requiredLabel}</strong></span>
                        {item.required.slice(0, 2).map((text) => <p key={text}>{text}</p>)}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}
          {roleTaskBoard ? (
            <section className="detail-section">
              <h3>角色现场任务</h3>
              <div className="v1-role-task-summary">
                <span>任务 <strong>{roleTaskBoard.summary.taskCountLabel}</strong></span>
                <span>角色 <strong>{roleTaskBoard.summary.roleCountLabel}</strong></span>
                <span>发布门禁 <strong>{roleTaskBoard.summary.releaseTaskCount} 项</strong></span>
                <span>现场证据 <strong>{roleTaskBoard.summary.evidenceTaskCount} 项</strong></span>
                <span>签字/边界 <strong>{roleTaskBoard.summary.signoffTaskCount + roleTaskBoard.summary.boundaryTaskCount} 项</strong></span>
              </div>
              {roleTaskCategorySummaries.length ? (
                <div className="v1-role-category-grid">
                  {roleTaskCategorySummaries.map((category) => (
                    <div className="v1-role-category-card" data-role-task-category={category.key} key={category.key}>
                      <div className="v1-role-category-head">
                        <div>
                          <StatusPill tone={category.tone}>{category.title}</StatusPill>
                          <strong>{category.countLabel}</strong>
                        </div>
                        <span>{category.statusLabel}</span>
                      </div>
                      <p>{category.description}</p>
                      {category.firstTasks.length ? (
                        <div className="v1-role-category-preview">
                          {category.firstTasks.slice(0, 2).map((task) => (
                            <span key={`${category.key}-${task.id}`}>{task.title}</span>
                          ))}
                        </div>
                      ) : null}
                      {category.actions.length ? (
                        <div className="v1-role-category-actions">
                          {category.actions.map((action) => (
                            <button
                              className="ghost-button"
                              disabled={action.disabled}
                              key={action.key}
                              onClick={action.onClick}
                              type="button"
                            >
                              {action.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
              {roleTaskBoard.firstActions?.length ? (
                <div className="v1-role-first-actions">
                  <div className="v1-role-first-actions-head">
                    <strong>首批现场动作</strong>
                    <span>显示 {roleTaskBoard.firstActions.length}/{roleTaskBoard.summary.taskCount}</span>
                  </div>
                  <div className="v1-role-first-action-list">
                    {roleTaskBoard.firstActions.map((task) => {
                      const taskActions = buildRoleTaskQuickActions(task);
                      return (
                        <div className="v1-role-first-action-row" key={task.id}>
                          <div>
                            <StatusPill tone={task.type === "发布门禁" ? "danger" : task.type.includes("签字") || task.type.includes("边界") ? "warning" : "blue"}>
                              {task.type || "待办"}
                            </StatusPill>
                            <strong>{task.title}</strong>
                          </div>
                          <p>{task.group} / {task.action}</p>
                          <div className="v1-role-task-meta">
                            <span>{task.priority || "P0"}</span>
                            <span>{task.primaryRole || task.roles?.[0] || "待分派"}</span>
                            <span>{task.status || "pending"}</span>
                          </div>
                          {taskActions.length ? (
                            <div className="v1-role-first-action-buttons">
                              {taskActions.map((action) => (
                                <button
                                  className="ghost-button"
                                  disabled={action.disabled}
                                  key={action.key}
                                  onClick={action.onClick}
                                  type="button"
                                >
                                  {action.label}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              <div className="v1-role-task-list">
                {roleTaskBoard.roles.map((role) => (
                  <div className="v1-role-task-row" key={role.role}>
                    <div className="v1-role-task-head">
                      <strong>{role.role}</strong>
                      <span>显示 {role.tasks.length}/{role.taskCount} 项</span>
                    </div>
                    <div className="v1-role-task-meta">
                      <span>门禁 {role.releaseTaskCount}</span>
                      <span>证据 {role.evidenceTaskCount}</span>
                      <span>签字 {role.signoffTaskCount}</span>
                      <span>边界 {role.boundaryTaskCount}</span>
                    </div>
                    <div className="v1-role-task-items">
                      {role.tasks.slice(0, 4).map((task) => (
                        <div className="v1-role-task-item" key={`${role.role}-${task.id}`}>
                          <StatusPill tone={task.type === "发布门禁" ? "danger" : task.type.includes("签字") ? "warning" : "blue"}>
                            {task.type || "待办"}
                          </StatusPill>
                          <div>
                            <strong>{task.title}</strong>
                            <p>{task.group} / {task.action}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    {role.taskCount > role.tasks.length ? (
                      <p className="v1-role-task-more">
                        还有 {role.taskCount - role.tasks.length} 项在交接包角色任务文件中，先处理上方首批现场动作和本角色预览。
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          {fieldEvidenceProgress ? (
            <section className="detail-section" ref={fieldEvidenceProgressRef}>
              <h3>现场证据 / 签字进度</h3>
              <div className="v1-field-evidence-summary">
                <span>证据组 <strong>{fieldEvidenceProgress.summary.evidenceGroupsLabel}</strong></span>
                <span>证据 <strong>{fieldEvidenceProgress.summary.evidenceItemsLabel}</strong></span>
                <span>签字 <strong>{fieldEvidenceProgress.summary.signoffLabel}</strong></span>
                <span>V1/V2 边界 <strong>{fieldEvidenceProgress.boundary.label}</strong></span>
              </div>
              <div className="v1-field-evidence-list">
                {fieldEvidenceGroupSummaries.slice(0, 6).map((group) => {
                  const groupActions = buildFieldEvidenceGroupActions(group);
                  const previewItems = group.previewItems?.length
                    ? group.previewItems
                    : group.firstMissingItems || [];
                  const hiddenPreviewCount =
                    group.hiddenPreviewCount ||
                    Math.max(0, (group.missingCount || 0) - previewItems.length);
                  return (
                    <div className="v1-field-evidence-row" key={group.key}>
                      <div>
                        <StatusPill tone={group.ready ? "success" : "danger"}>
                          {group.ready ? "已满足" : "阻塞"}
                        </StatusPill>
                        <strong>{group.label}</strong>
                      </div>
                      <p>{group.firstMissingItem?.nextAction || group.nextAction}</p>
                      <div className="v1-field-evidence-meta">
                        <span>{group.ownerRole}</span>
                        <span>{group.progressLabel || `${group.completedRequired}/${group.requiredTotal}`} 已完成</span>
                        <span>缺 {group.missingLabel} 项</span>
                      </div>
                      {previewItems.length ? (
                        <div className="v1-field-evidence-group-preview">
                          <strong>本组待补</strong>
                          {previewItems.map((item) => (
                            <div className="v1-field-evidence-group-preview-row" key={`${group.key}:${item.key}`}>
                              <span>{item.label}</span>
                              <button
                                className="ghost-button"
                                onClick={() => selectMissingEvidenceForStage(item)}
                                type="button"
                              >
                                填到草稿
                              </button>
                            </div>
                          ))}
                          {hiddenPreviewCount > 0 ? (
                            <p>还有 {hiddenPreviewCount} 项，点只看本组后继续处理。</p>
                          ) : null}
                        </div>
                      ) : null}
                      {groupActions.length ? (
                        <div className="v1-field-evidence-group-actions">
                          {groupActions.map((action) => (
                            <button
                              className="ghost-button"
                              disabled={action.disabled}
                              key={action.key}
                              onClick={action.onClick}
                              type="button"
                            >
                              {action.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {fieldEvidenceProgress.missingItems?.length ? (
                <div className="v1-field-evidence-missing">
                  <div className="v1-field-evidence-missing-head">
                    <div>
                      <strong>优先补证据</strong>
                      <span>显示 {missingEvidenceDisplayLabel}</span>
                    </div>
                    {selectedMissingEvidenceGroup ? (
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={clearMissingEvidenceGroupFilter}
                      >
                        显示全部证据
                      </button>
                    ) : canToggleMissingEvidenceItems ? (
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => setShowAllMissingEvidenceItems((value) => !value)}
                      >
                        {showAllMissingEvidenceItems ? "收起证据" : "展开全部证据"}
                      </button>
                    ) : null}
                  </div>
                  <div className="v1-field-evidence-item-list">
                    {visibleMissingEvidenceItems.map((item) => (
                      <div className="v1-field-evidence-item" key={`${item.groupKey}:${item.key}`}>
                        <div>
                          <StatusPill tone={item.evidenceFilled ? "warning" : "danger"}>
                            {item.evidenceFilled ? "待确认" : "缺证据"}
                          </StatusPill>
                          <strong>{item.label}</strong>
                          <button
                            className="ghost-button v1-field-evidence-fill-button"
                            onClick={() => selectMissingEvidenceForStage(item)}
                            type="button"
                          >
                            填到草稿
                          </button>
                        </div>
                        <p>{item.nextAction}</p>
                        <div className="v1-field-evidence-meta">
                          <span>{item.groupLabel}</span>
                          <span>{item.ownerRole}</span>
                          <span>{item.progressLabel || item.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {fieldEvidenceProgress.signoffBoundarySummary ? (
                <div className="v1-signoff-boundary-summary">
                  <div className="v1-field-evidence-missing-head">
                    <div>
                      <strong>签字 / 边界收尾</strong>
                      <span>待办 {fieldEvidenceProgress.signoffBoundarySummary.actionLabel}</span>
                    </div>
                  </div>
                  <div className="v1-field-intake-summary">
                    <span>
                      签字 <strong>{fieldEvidenceProgress.signoffBoundarySummary.signoffProgressLabel}</strong>
                    </span>
                    <span>
                      缺签字 <strong>{fieldEvidenceProgress.signoffBoundarySummary.missingSignoffCount}</strong>
                    </span>
                    <span>
                      边界 <strong>{fieldEvidenceProgress.signoffBoundarySummary.boundaryLabel}</strong>
                    </span>
                    <span>
                      首批{" "}
                      <strong>
                        {fieldEvidenceProgress.signoffBoundarySummary.previewActions.length}/
                        {fieldEvidenceProgress.signoffBoundarySummary.actionCount}
                      </strong>
                    </span>
                  </div>
                  <p className="v1-field-intake-note">{fieldEvidenceProgress.signoffBoundarySummary.nextAction}</p>
                  {fieldEvidenceProgress.signoffBoundarySummary.previewActions.length ? (
                    <div className="v1-signoff-boundary-list">
                      {fieldEvidenceProgress.signoffBoundarySummary.previewActions.map((item) => (
                        <div className="v1-signoff-boundary-row" key={`summary-${item.type}-${item.key}`}>
                          <div>
                            <StatusPill tone={item.type === "boundary" ? "warning" : "danger"}>
                              {item.type === "boundary" ? "边界确认" : "负责人签字"}
                            </StatusPill>
                            <strong>{item.label}</strong>
                            <button
                              className="ghost-button v1-field-evidence-fill-button"
                              onClick={() => selectSignoffBoundaryForStage(item)}
                              type="button"
                            >
                              填到草稿
                            </button>
                          </div>
                          <p>{item.nextAction}</p>
                          <div className="v1-field-evidence-meta">
                            <span>{item.progressLabel || item.status}</span>
                            <span>{item.personFilled ? "已填负责人" : item.type === "boundary" ? "缺确认人" : "缺签字人"}</span>
                            <span>{item.timeFilled ? "已填时间" : "缺时间"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {fieldEvidenceProgress.signoffBoundarySummary.hiddenActionCount > 0 ? (
                    <p className="v1-field-intake-note">
                      还有 {fieldEvidenceProgress.signoffBoundarySummary.hiddenActionCount} 项在下方签字/边界待办中继续处理。
                    </p>
                  ) : null}
                </div>
              ) : null}
              {fieldEvidenceProgress.signoffBoundaryActions?.length ? (
                <div className="v1-signoff-boundary-actions">
                  <div className="v1-field-evidence-missing-head">
                    <strong>签字/边界待办</strong>
                    <span>显示 {fieldEvidenceProgress.summary.signoffBoundaryActionsLabel || `${fieldEvidenceProgress.signoffBoundaryActions.length}/${fieldEvidenceProgress.summary.signoffBoundaryActionCount}`}</span>
                  </div>
                  <div className="v1-signoff-boundary-list">
                    {fieldEvidenceProgress.signoffBoundaryActions.map((item) => (
                      <div className="v1-signoff-boundary-row" key={`${item.type}-${item.key}`}>
                        <div>
                          <StatusPill tone={item.type === "boundary" ? "warning" : "danger"}>
                            {item.type === "boundary" ? "边界确认" : "负责人签字"}
                          </StatusPill>
                          <strong>{item.label}</strong>
                          <button
                            className="ghost-button v1-field-evidence-fill-button"
                            onClick={() => selectSignoffBoundaryForStage(item)}
                            type="button"
                          >
                            填到草稿
                          </button>
                        </div>
                        <p>{item.nextAction}</p>
                        <div className="v1-field-evidence-meta">
                          <span>{item.progressLabel || item.status}</span>
                          <span>{item.personFilled ? "已填负责人" : item.type === "boundary" ? "缺确认人" : "缺签字人"}</span>
                          <span>{item.timeFilled ? "已填时间" : "缺时间"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {fieldEvidenceIntakeQuality ? (
                <div className="v1-field-intake-quality" ref={fieldEvidenceIntakeQualityRef}>
                  <div className="v1-field-intake-head">
                    <div>
                      <strong>回填质量检查</strong>
                      <span>阻塞 {fieldEvidenceIntakeQuality.summary.blockingIssueLabel}</span>
                    </div>
                    <div className="v1-field-intake-actions">
                      <button
                        className="ghost-button"
                        disabled={!canGenerateFieldEvidenceDraft}
                        onClick={onGenerateFieldEvidenceDraft}
                        type="button"
                      >
                        {fieldEvidenceDraftAction.loading ? "生成中" : "生成草稿"}
                      </button>
                      <button
                        className="ghost-button"
                        disabled={!canValidateFieldEvidenceDraft}
                        onClick={onValidateFieldEvidenceDraft}
                        type="button"
                      >
                        {fieldEvidenceValidationAction.loading ? "校验中" : "校验草稿"}
                      </button>
                      <button
                        className="ghost-button"
                        disabled={!canPrecheckReleaseCandidateRefresh}
                        onClick={onPrecheckReleaseCandidateRefresh}
                        type="button"
                      >
                        {releaseCandidateRefreshPrecheckAction.loading ? "预检中" : "刷新预检"}
                      </button>
                      <button
                        className="ghost-button"
                        disabled={!canRefreshReleaseCandidate}
                        onClick={onRefreshReleaseCandidate}
                        type="button"
                      >
                        {releaseCandidateRefreshAction.loading ? "刷新中" : "刷新候选"}
                      </button>
                      <button
                        className="ghost-button"
                        disabled={!canRunFieldEvidenceCloseoutReview}
                        onClick={runFieldEvidenceCloseoutReview}
                        type="button"
                      >
                        {fieldEvidenceValidationAction.loading ||
                        releaseCandidateRefreshPrecheckAction.loading ||
                        releaseCandidateRefreshAction.loading
                          ? "复核中"
                          : "校验并预检刷新"}
                      </button>
                      <button
                        className="ghost-button"
                        disabled={!canRunV1CloseoutFullReview}
                        onClick={runV1CloseoutFullReview}
                        type="button"
                      >
                        {fieldEvidenceValidationAction.loading ||
                        productionEnvPrecheckAction.loading ||
                        productionEnvFileAuditPrecheckAction.loading ||
                        productionEnvFilePreviewPrecheckAction.loading ||
                        v1V2BoundaryPrecheckAction.loading ||
                        productionGoLivePrecheckAction.loading ||
                        releaseCandidateRefreshPrecheckAction.loading ||
                        runtimeReadinessPrecheckAction.loading ||
                        releaseCandidateRefreshAction.loading
                          ? "总复核中"
                          : "V1 收尾总复核"}
                      </button>
                    </div>
                  </div>
                  <div className="v1-field-intake-summary">
                    <span>证据 <strong>{fieldEvidenceIntakeQuality.summary.evidenceProgress}</strong></span>
                    <span>签字 <strong>{fieldEvidenceIntakeQuality.summary.signoffProgress}</strong></span>
                    <span>边界 <strong>{fieldEvidenceIntakeQuality.summary.boundaryLabel}</strong></span>
                    <span>草稿 <strong>{fieldEvidenceIntakeQuality.summary.draftManifestLabel}</strong></span>
                    <span>草稿匹配 <strong>{fieldEvidenceIntakeQuality.summary.draftFreshnessLabel}</strong></span>
                    <span>可生成草稿 <strong>{fieldEvidenceIntakeQuality.summary.canGenerateDraft ? "是" : "否"}</strong></span>
                    <span>可刷新候选 <strong>{fieldEvidenceIntakeQuality.summary.canRefreshReleaseCandidate ? "是" : "否"}</strong></span>
                  </div>
                  {missingEvidenceOptions.length || signoffBoundaryOptions.length ? (
                    <div className="v1-field-stage-grid">
                      {missingEvidenceOptions.length ? (
                        <div className="v1-field-stage-card" ref={evidenceStageCardRef}>
                          <div className="v1-field-stage-title">
                            <strong>现场证据草稿</strong>
                            <span>{selectedEvidenceStageItem?.groupLabel || "待选择"}</span>
                          </div>
                          <select
                            value={evidenceStageDraft.selectionKey || (selectedEvidenceStageItem ? `${selectedEvidenceStageItem.groupKey}:${selectedEvidenceStageItem.key}` : "")}
                            onChange={(event) => setEvidenceStageDraft((current) => ({ ...current, selectionKey: event.target.value }))}
                          >
                            {missingEvidenceOptions.map((item) => (
                              <option key={`${item.groupKey}:${item.key}`} value={`${item.groupKey}:${item.key}`}>
                                {item.groupLabel} / {item.label}
                              </option>
                            ))}
                          </select>
                          <div className="v1-field-stage-row">
                            <select
                              value={evidenceStageDraft.onsiteStatus}
                              onChange={(event) => setEvidenceStageDraft((current) => ({ ...current, onsiteStatus: event.target.value }))}
                            >
                              {v1EvidenceStageStatusOptions.map((item) => (
                                <option key={item.value} value={item.value}>{item.label}</option>
                              ))}
                            </select>
                            <input
                              ref={evidenceStageRefInputRef}
                              value={evidenceStageDraft.onsiteEvidenceRef}
                              onChange={(event) => setEvidenceStageDraft((current) => ({ ...current, onsiteEvidenceRef: event.target.value }))}
                              placeholder="证据编号 / 文件名"
                            />
                          </div>
                          <input
                            value={evidenceStageDraft.onsiteNotes}
                            onChange={(event) => setEvidenceStageDraft((current) => ({ ...current, onsiteNotes: event.target.value }))}
                            placeholder="备注"
                          />
                          <div className="v1-field-stage-upload">
                            <input
                              type="file"
                              accept="image/*,application/pdf,.pdf,.xlsx,.xls,.csv,.doc,.docx,.txt"
                              onChange={(event) => setEvidenceAttachmentFile(event.target.files?.[0] ?? null)}
                            />
                            <button
                              className="ghost-button"
                              disabled={!canUploadAndStageEvidenceAttachment}
                              onClick={uploadAndStageSelectedEvidenceAttachment}
                              type="button"
                            >
                              {fieldEvidenceAttachmentAction.loading ? "上传中" : "上传并保存证据"}
                            </button>
                          </div>
                          <div className="v1-field-stage-actions">
                            <button
                              className="ghost-button"
                              disabled={!canListEvidenceAttachments}
                              onClick={listSelectedEvidenceAttachments}
                              type="button"
                            >
                              {fieldEvidenceAttachmentListAction.loading ? "查询中" : "查询已登记附件"}
                            </button>
                          </div>
                          {selectedEvidenceAttachmentListResult || selectedEvidenceAttachmentListError ? (
                            <div className="v1-field-attachment-list">
                              {selectedEvidenceAttachmentListResult ? (
                                <>
                                  <div className="v1-field-stage-title">
                                    <strong>已登记证据附件</strong>
                                    <span>{selectedEvidenceAttachmentListResult.items.length}/{selectedEvidenceAttachmentListResult.total}</span>
                                  </div>
                                  {selectedEvidenceAttachmentListResult.items.length ? (
                                    selectedEvidenceAttachmentListResult.items.map((item) => (
                                      <div className="v1-field-attachment-row" key={item.attachmentId}>
                                        <div>
                                          <strong>{item.attachmentId}</strong>
                                          <span>{item.fileName || "未命名附件"}</span>
                                        </div>
                                        <button
                                          className="ghost-button"
                                          onClick={() => fillEvidenceRefFromAttachment(item)}
                                          type="button"
                                        >
                                          填入引用
                                        </button>
                                      </div>
                                    ))
                                  ) : (
                                    <p>当前证据项还没有后端 ATT 附件。</p>
                                  )}
                                </>
                              ) : (
                                <p>{selectedEvidenceAttachmentListError}</p>
                              )}
                            </div>
                          ) : null}
                          <div className="v1-field-stage-actions">
                            <button
                              className="ghost-button"
                              disabled={!canStageEvidenceRow}
                              onClick={stageSelectedEvidenceRow}
                              type="button"
                            >
                              {fieldEvidenceStageRowAction.loading ? "保存中" : "保存证据草稿"}
                            </button>
                            <button
                              className="ghost-button"
                              disabled={!canStageEvidenceRowAndReview}
                              onClick={stageSelectedEvidenceRowAndReview}
                              type="button"
                            >
                              {fieldEvidenceStageRowAction.loading ||
                              fieldEvidenceValidationAction.loading ||
                              releaseCandidateRefreshPrecheckAction.loading ||
                              releaseCandidateRefreshAction.loading
                                ? "保存复核中"
                                : "保存并复核证据"}
                            </button>
                          </div>
                        </div>
                      ) : null}
                      {signoffBoundaryOptions.length ? (
                        <div className="v1-field-stage-card" ref={signoffStageCardRef}>
                          <div className="v1-field-stage-title">
                            <strong>签字 / 边界草稿</strong>
                            <span>{selectedSignoffBoundaryStageItem?.type === "boundary" ? "边界确认" : "负责人签字"}</span>
                          </div>
                          <select
                            value={signoffStageDraft.selectionKey || (selectedSignoffBoundaryStageItem ? `${selectedSignoffBoundaryStageItem.type}:${selectedSignoffBoundaryStageItem.key}` : "")}
                            onChange={(event) => {
                              const next = signoffBoundaryOptions.find((item) => `${item.type}:${item.key}` === event.target.value);
                              setSignoffStageDraft((current) => ({
                                ...current,
                                selectionKey: event.target.value,
                                onsiteStatus: next?.type === "boundary" ? "confirmed" : "signed",
                              }));
                            }}
                          >
                            {signoffBoundaryOptions.map((item) => (
                              <option key={`${item.type}:${item.key}`} value={`${item.type}:${item.key}`}>
                                {item.label}
                              </option>
                            ))}
                          </select>
                          <div className="v1-field-stage-row">
                            <select
                              value={signoffStageDraft.onsiteStatus}
                              onChange={(event) => setSignoffStageDraft((current) => ({ ...current, onsiteStatus: event.target.value }))}
                            >
                              {selectedSignoffStatusOptions.map((item) => (
                                <option key={item.value} value={item.value}>{item.label}</option>
                              ))}
                            </select>
                            <input
                              ref={signoffStagePersonInputRef}
                              value={signoffStageDraft.person}
                              onChange={(event) => setSignoffStageDraft((current) => ({ ...current, person: event.target.value }))}
                              placeholder={selectedSignoffBoundaryStageItem?.type === "boundary" ? "确认人" : "签字人"}
                            />
                          </div>
                          <div className="v1-field-stage-row">
                            <input
                              type="datetime-local"
                              value={signoffStageDraft.time}
                              onChange={(event) => setSignoffStageDraft((current) => ({ ...current, time: event.target.value }))}
                            />
                            <input
                              value={signoffStageDraft.onsiteNotes}
                              onChange={(event) => setSignoffStageDraft((current) => ({ ...current, onsiteNotes: event.target.value }))}
                              placeholder="备注"
                            />
                          </div>
                          <div className="v1-field-stage-upload">
                            <input
                              type="file"
                              accept="image/*,application/pdf,.pdf,.doc,.docx,.txt"
                              onChange={(event) => setSignoffBoundaryAttachmentFile(event.target.files?.[0] ?? null)}
                            />
                            <button
                              className="ghost-button"
                              disabled={!canUploadSignoffBoundaryAttachment}
                              onClick={uploadAndFillSelectedSignoffBoundaryAttachment}
                              type="button"
                            >
                              {signoffBoundaryAttachmentAction.loading ? "上传中" : "上传并填入备注"}
                            </button>
                          </div>
                          <div className="v1-field-stage-actions">
                            <button
                              className="ghost-button"
                              disabled={!canListSignoffBoundaryAttachments}
                              onClick={listSelectedSignoffBoundaryAttachments}
                              type="button"
                            >
                              {signoffBoundaryAttachmentListAction.loading ? "查询中" : "查询已登记签字附件"}
                            </button>
                          </div>
                          {selectedSignoffBoundaryAttachmentListResult || selectedSignoffBoundaryAttachmentListError ? (
                            <div className="v1-field-attachment-list">
                              {selectedSignoffBoundaryAttachmentListResult ? (
                                <>
                                  <div className="v1-field-stage-title">
                                    <strong>已登记签字 / 边界附件</strong>
                                    <span>{selectedSignoffBoundaryAttachmentListResult.items.length}/{selectedSignoffBoundaryAttachmentListResult.total}</span>
                                  </div>
                                  {selectedSignoffBoundaryAttachmentListResult.items.length ? (
                                    selectedSignoffBoundaryAttachmentListResult.items.map((item) => (
                                      <div className="v1-field-attachment-row" key={item.attachmentId}>
                                        <div>
                                          <strong>{item.attachmentId}</strong>
                                          <span>{item.fileName || "未命名附件"}</span>
                                        </div>
                                        <button
                                          className="ghost-button"
                                          onClick={() => fillSignoffBoundaryNoteFromAttachment(item)}
                                          type="button"
                                        >
                                          填入备注
                                        </button>
                                      </div>
                                    ))
                                  ) : (
                                    <p>当前签字 / 边界项还没有后端 ATT 附件。</p>
                                  )}
                                </>
                              ) : (
                                <p>{selectedSignoffBoundaryAttachmentListError}</p>
                              )}
                            </div>
                          ) : null}
                          <div className="v1-field-stage-actions">
                            <button
                              className="ghost-button"
                              disabled={!canStageSignoffBoundaryRow}
                              onClick={stageSelectedSignoffBoundaryRow}
                              type="button"
                            >
                              {fieldEvidenceStageRowAction.loading ? "保存中" : "保存签字草稿"}
                            </button>
                            <button
                              className="ghost-button"
                              disabled={!canStageSignoffBoundaryRowAndReview}
                              onClick={stageSelectedSignoffBoundaryRowAndReview}
                              type="button"
                            >
                              {fieldEvidenceStageRowAction.loading ||
                              fieldEvidenceValidationAction.loading ||
                              releaseCandidateRefreshPrecheckAction.loading ||
                              releaseCandidateRefreshAction.loading
                                ? "保存复核中"
                                : selectedSignoffBoundaryStageItem?.type === "boundary"
                                  ? "保存并复核边界"
                                  : "保存并复核签字"}
                            </button>
                            {selectedSignoffBoundaryStageItem?.type === "boundary" ? (
                              <button
                                className="ghost-button"
                                disabled={!canStageBoundaryRowAndPrecheck}
                                onClick={stageSelectedBoundaryRowAndPrecheck}
                                type="button"
                              >
                                {fieldEvidenceStageRowAction.loading || v1V2BoundaryPrecheckAction.loading
                                  ? "保存预检中"
                                  : "保存并预检边界"}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {fieldEvidenceStageRowAction.result || fieldEvidenceStageRowAction.error ? (
                    <div className="v1-field-stage-result">
                      {fieldEvidenceStageRowAction.result ? (
                        <>
                          <div>
                            <StatusPill tone={fieldEvidenceStageRowAction.result.ready ? "success" : "warning"}>
                              {fieldEvidenceStageRowAction.result.statusLabel}
                            </StatusPill>
                            <strong>最近草稿行保存</strong>
                          </div>
                          <p>{fieldEvidenceStageRowAction.result.nextAction}</p>
                          <div className="v1-field-intake-summary">
                            <span>行 <strong>{fieldEvidenceStageRowAction.result.summary.rowLabel}</strong></span>
                            <span>证据 <strong>{fieldEvidenceStageRowAction.result.summary.evidenceProgress}</strong></span>
                            <span>签字 <strong>{fieldEvidenceStageRowAction.result.summary.signoffProgress}</strong></span>
                            <span>边界 <strong>{fieldEvidenceStageRowAction.result.summary.boundaryLabel}</strong></span>
                            <span>CSV <strong>{fieldEvidenceStageRowAction.result.summary.csvUpdated ? "已更新" : "未更新"}</strong></span>
                            <span>候选刷新 <strong>{fieldEvidenceStageRowAction.result.summary.releaseCandidateRefreshed ? "是" : "否"}</strong></span>
                          </div>
                          {fieldEvidenceStageRowAction.result.evidenceCloseout ? (
                            <div className="v1-field-stage-closeout">
                              <div className="v1-field-stage-title">
                                <strong>现场证据剩余</strong>
                                <span>{fieldEvidenceStageRowAction.result.evidenceCloseout.actionLabel}</span>
                              </div>
                              <p>{fieldEvidenceStageRowAction.result.evidenceCloseout.nextAction}</p>
                              <div className="v1-field-intake-summary">
                                <span>证据 <strong>{fieldEvidenceStageRowAction.result.evidenceCloseout.evidenceProgress}</strong></span>
                                <span>缺证据 <strong>{fieldEvidenceStageRowAction.result.evidenceCloseout.missingEvidenceRows}</strong></span>
                                <span>已填引用 <strong>{fieldEvidenceStageRowAction.result.evidenceCloseout.filledEvidenceRows}</strong></span>
                                <span>无效行 <strong>{fieldEvidenceStageRowAction.result.evidenceCloseout.invalidEvidenceRows}</strong></span>
                              </div>
                              {fieldEvidenceStageRowAction.result.evidenceCloseout.actions.length ? (
                                <div className="v1-field-stage-closeout-list">
                                  {fieldEvidenceStageRowAction.result.evidenceCloseout.actions.map((item) => (
                                    <div className="v1-field-stage-closeout-row" key={`${item.groupKey}:${item.key}`}>
                                      <div>
                                        <StatusPill tone={item.evidenceFilled ? "warning" : "danger"}>
                                          {item.evidenceFilled ? "待确认状态" : "缺现场证据"}
                                        </StatusPill>
                                        <strong>{item.label}</strong>
                                        <span>{item.groupLabel || item.ownerRole || item.progressLabel}</span>
                                        <button
                                          className="ghost-button v1-field-evidence-fill-button"
                                          onClick={() => selectMissingEvidenceForStage(item)}
                                          type="button"
                                        >
                                          填到草稿
                                        </button>
                                      </div>
                                      <p>{item.nextAction}</p>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                          {fieldEvidenceStageRowAction.result.closeout ? (
                            <div className="v1-field-stage-closeout">
                              <div className="v1-field-stage-title">
                                <strong>签字 / 边界剩余</strong>
                                <span>
                                  {fieldEvidenceStageRowAction.result.closeout.signoffBoundarySummary?.actionLabel ||
                                    fieldEvidenceStageRowAction.result.closeout.actionLabel}
                                </span>
                              </div>
                              <p>
                                {fieldEvidenceStageRowAction.result.closeout.signoffBoundarySummary?.nextAction ||
                                  fieldEvidenceStageRowAction.result.closeout.nextAction}
                              </p>
                              <div className="v1-field-intake-summary">
                                <span>
                                  签字{" "}
                                  <strong>
                                    {fieldEvidenceStageRowAction.result.closeout.signoffBoundarySummary?.signoffProgressLabel ||
                                      fieldEvidenceStageRowAction.result.closeout.signoffProgress}
                                  </strong>
                                </span>
                                <span>
                                  缺签字{" "}
                                  <strong>
                                    {fieldEvidenceStageRowAction.result.closeout.signoffBoundarySummary?.missingSignoffCount ??
                                      fieldEvidenceStageRowAction.result.closeout.missingSignoffRows}
                                  </strong>
                                </span>
                                <span>无效行 <strong>{fieldEvidenceStageRowAction.result.closeout.invalidSignoffRows}</strong></span>
                                <span>
                                  边界{" "}
                                  <strong>
                                    {fieldEvidenceStageRowAction.result.closeout.signoffBoundarySummary?.boundaryLabel ||
                                      fieldEvidenceStageRowAction.result.closeout.boundaryLabel}
                                  </strong>
                                </span>
                                {fieldEvidenceStageRowAction.result.closeout.signoffBoundarySummary ? (
                                  <span>
                                    首批{" "}
                                    <strong>
                                      {fieldEvidenceStageRowAction.result.closeout.signoffBoundarySummary.previewActions.length}/
                                      {fieldEvidenceStageRowAction.result.closeout.signoffBoundarySummary.actionCount}
                                    </strong>
                                  </span>
                                ) : null}
                              </div>
                              {fieldEvidenceStageRowAction.result.closeout.actions.length ? (
                                <div className="v1-field-stage-closeout-list">
                                  {fieldEvidenceStageRowAction.result.closeout.actions.map((item) => (
                                    <div className="v1-field-stage-closeout-row" key={`${item.type}:${item.key}`}>
                                      <div>
                                        <StatusPill tone={item.type === "boundary" ? "warning" : "danger"}>
                                          {item.type === "boundary" ? "边界确认" : "负责人签字"}
                                        </StatusPill>
                                        <strong>{item.label}</strong>
                                        <span>{item.progressLabel || item.status}</span>
                                        <button
                                          className="ghost-button v1-field-evidence-fill-button"
                                          onClick={() => selectSignoffBoundaryForStage(item)}
                                          type="button"
                                        >
                                          填到草稿
                                        </button>
                                      </div>
                                      <p>{item.nextAction}</p>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <p>{fieldEvidenceStageRowAction.error}</p>
                      )}
                    </div>
                  ) : null}
                  {fieldEvidenceAttachmentAction.result || fieldEvidenceAttachmentAction.error ? (
                    <div className="v1-field-stage-result">
                      {fieldEvidenceAttachmentAction.result ? (
                        <>
                          <div>
                            <StatusPill tone="warning">附件已登记</StatusPill>
                            <strong>最近证据附件</strong>
                          </div>
                          <div className="v1-field-intake-summary">
                            <span>附件 <strong>{fieldEvidenceAttachmentAction.result.attachmentId}</strong></span>
                            <span>文件 <strong>{fieldEvidenceAttachmentAction.result.fileName || "未命名"}</strong></span>
                            <span>草稿引用 <strong>{fieldEvidenceAttachmentAction.result.attachmentId ? "可写入" : "不可写入"}</strong></span>
                          </div>
                        </>
                      ) : (
                        <p>{fieldEvidenceAttachmentAction.error}</p>
                      )}
                    </div>
                  ) : null}
                  {signoffBoundaryAttachmentAction.result || signoffBoundaryAttachmentAction.error ? (
                    <div className="v1-field-stage-result">
                      {signoffBoundaryAttachmentAction.result ? (
                        <>
                          <div>
                            <StatusPill tone="warning">附件已登记</StatusPill>
                            <strong>最近签字 / 边界附件</strong>
                          </div>
                          <div className="v1-field-intake-summary">
                            <span>附件 <strong>{signoffBoundaryAttachmentAction.result.attachmentId}</strong></span>
                            <span>文件 <strong>{signoffBoundaryAttachmentAction.result.fileName || "未命名"}</strong></span>
                            <span>备注引用 <strong>{signoffBoundaryAttachmentAction.result.attachmentId ? "可填入" : "不可填入"}</strong></span>
                          </div>
                        </>
                      ) : (
                        <p>{signoffBoundaryAttachmentAction.error}</p>
                      )}
                    </div>
                  ) : null}
                  {fieldEvidenceDraftAction.result || fieldEvidenceDraftAction.error ? (
                    <div className="v1-field-intake-draft-result">
                      {fieldEvidenceDraftAction.result ? (
                        <>
                          <div>
                            <StatusPill tone={fieldEvidenceDraftAction.result.output?.draftWritten ? "warning" : "danger"}>
                              {fieldEvidenceDraftAction.result.statusLabel}
                            </StatusPill>
                            <strong>最近草稿生成</strong>
                          </div>
                          <p>{fieldEvidenceDraftAction.result.nextAction}</p>
                          <div className="v1-field-intake-summary">
                            <span>应用 <strong>{fieldEvidenceDraftAction.result.summary.appliedLabel}</strong></span>
                            <span>无效 <strong>{fieldEvidenceDraftAction.result.summary.invalidLabel}</strong></span>
                            <span>证据 <strong>{fieldEvidenceDraftAction.result.summary.evidenceProgress}</strong></span>
                            <span>签字 <strong>{fieldEvidenceDraftAction.result.summary.signoffProgress}</strong></span>
                            <span>候选刷新 <strong>{fieldEvidenceDraftAction.result.output.releaseCandidateRefreshed ? "是" : "否"}</strong></span>
                          </div>
                          {fieldEvidenceDraftAction.result.invalidRows.length ? (
                            <div className="v1-field-intake-invalid-list">
                              {fieldEvidenceDraftAction.result.invalidRows.slice(0, 3).map((row) => (
                                <p key={`${row.type}-${row.row}-${row.groupKey}-${row.itemKey}`}>
                                  第 {row.row} 行：{row.fixHint || row.reason}
                                </p>
                              ))}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <p>{fieldEvidenceDraftAction.error}</p>
                      )}
                    </div>
                  ) : null}
                  {fieldEvidenceValidationAction.result || fieldEvidenceValidationAction.error ? (
                    <div className="v1-field-intake-validation-result">
                      {fieldEvidenceValidationAction.result ? (
                        <>
                          <div>
                            <StatusPill tone={fieldEvidenceValidationAction.result.ready ? "success" : fieldEvidenceValidationAction.result.schemaValid ? "warning" : "danger"}>
                              {fieldEvidenceValidationAction.result.statusLabel}
                            </StatusPill>
                            <strong>最近草稿校验</strong>
                          </div>
                          <p>{fieldEvidenceValidationAction.result.nextAction}</p>
                          <div className="v1-field-intake-summary">
                            <span>证据 <strong>{fieldEvidenceValidationAction.result.summary.evidenceProgress}</strong></span>
                            <span>签字 <strong>{fieldEvidenceValidationAction.result.summary.signoffProgress}</strong></span>
                            <span>证据组 <strong>{fieldEvidenceValidationAction.result.summary.evidenceGroupsReadyLabel}</strong></span>
                            <span>阻塞 <strong>{fieldEvidenceValidationAction.result.summary.blockingIssueLabel}</strong></span>
                            <span>候选刷新 <strong>{fieldEvidenceValidationAction.result.summary.releaseCandidateRefreshed ? "是" : "否"}</strong></span>
                          </div>
                          {fieldEvidenceValidationAction.result.blockers.length ? (
                            <div className="v1-field-intake-invalid-list">
                              {fieldEvidenceValidationAction.result.blockers.slice(0, 3).map((item, index) => (
                                <p key={`${item.type}-${item.groupLabel}-${item.label}-${index}`}>
                                  {item.groupLabel ? `${item.groupLabel} / ` : ""}{item.label || item.type}：{item.nextAction || item.reason}
                                </p>
                              ))}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <p>{fieldEvidenceValidationAction.error}</p>
                      )}
                    </div>
                  ) : null}
                  {releaseCandidateRefreshPrecheckAction.result || releaseCandidateRefreshPrecheckAction.error ? (
                    <div className="v1-field-intake-refresh-precheck-result">
                      {releaseCandidateRefreshPrecheckAction.result ? (
                        <>
                          <div>
                            <StatusPill tone={releaseCandidateRefreshPrecheckAction.result.ready ? "success" : "warning"}>
                              {releaseCandidateRefreshPrecheckAction.result.statusLabel}
                            </StatusPill>
                            <strong>最近刷新预检</strong>
                          </div>
                          <p>{releaseCandidateRefreshPrecheckAction.result.nextAction}</p>
                          <div className="v1-field-intake-summary">
                            <span>证据 <strong>{releaseCandidateRefreshPrecheckAction.result.summary.evidenceProgress}</strong></span>
                            <span>签字 <strong>{releaseCandidateRefreshPrecheckAction.result.summary.signoffProgress}</strong></span>
                            <span>生产 env <strong>{releaseCandidateRefreshPrecheckAction.result.summary.productionEnvPreflightLabel}</strong></span>
                            <span>组合门禁 <strong>{releaseCandidateRefreshPrecheckAction.result.summary.productionGoLiveReadinessLabel}</strong></span>
                            {releaseCandidateRefreshPrecheckAction.result.summary.productionGoLiveFirstBlockedStageLabel ? (
                              <span>首个阻塞 <strong>{releaseCandidateRefreshPrecheckAction.result.summary.productionGoLiveFirstBlockedStageLabel}</strong></span>
                            ) : null}
                            <span>边界 <strong>{releaseCandidateRefreshPrecheckAction.result.summary.boundaryLabel}</strong></span>
                            <span>阻塞 <strong>{releaseCandidateRefreshPrecheckAction.result.summary.blockerLabel}</strong></span>
                            <span>候选刷新 <strong>{releaseCandidateRefreshPrecheckAction.result.summary.releaseCandidateRefreshed ? "是" : "否"}</strong></span>
                          </div>
                          {renderV1ProductionEnvFileSourceStatusList(
                            releaseCandidateRefreshPrecheckAction.result.summary.productionGoLiveSourceStatuses,
                          )}
                          {releaseCandidateRefreshPrecheckAction.result.blockers.length ? (
                            <div className="v1-field-intake-invalid-list">
                              {releaseCandidateRefreshPrecheckAction.result.blockers.map((item) => {
                                const blockerActions = buildReleaseCandidateRefreshBlockerActions(item);
                                return (
                                  <div className="v1-refresh-precheck-blocker-row" key={item.key}>
                                    <div>
                                      <StatusPill tone="danger">阻塞</StatusPill>
                                      <strong>{item.label}</strong>
                                    </div>
                                    <p>{item.nextAction || item.detail}</p>
                                    {blockerActions.length ? (
                                      <div className="v1-refresh-precheck-actions">
                                        {blockerActions.map((action) => (
                                          <button
                                            className="ghost-button"
                                            disabled={action.disabled}
                                            key={`${item.key}-${action.key}`}
                                            onClick={action.onClick}
                                            type="button"
                                          >
                                            {action.label}
                                          </button>
                                        ))}
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <p>{releaseCandidateRefreshPrecheckAction.error}</p>
                      )}
                    </div>
                  ) : null}
                  {releaseCandidateRefreshAction.result || releaseCandidateRefreshAction.error ? (
                    <div className="v1-field-intake-refresh-precheck-result">
                      {releaseCandidateRefreshAction.result ? (
                        <>
                          <div>
                            <StatusPill tone={releaseCandidateRefreshAction.result.ready ? "success" : "warning"}>
                              {releaseCandidateRefreshAction.result.statusLabel}
                            </StatusPill>
                            <strong>最近候选刷新</strong>
                          </div>
                          <p>{releaseCandidateRefreshAction.result.nextAction}</p>
                          <div className="v1-field-intake-summary">
                            <span>发布候选 <strong>{releaseCandidateRefreshAction.result.summary.releaseGateLabel || releaseCandidateRefreshAction.result.summary.label}</strong></span>
                            <span>证据 <strong>{releaseCandidateRefreshAction.result.summary.evidenceProgress || releaseCandidateRefreshAction.result.summary.fieldEvidenceLabel}</strong></span>
                            <span>签字 <strong>{releaseCandidateRefreshAction.result.summary.signoffProgress || "待复核"}</strong></span>
                            <span>生产 env <strong>{releaseCandidateRefreshAction.result.summary.productionEnvPreflightLabel || "待复核"}</strong></span>
                            <span>组合门禁 <strong>{releaseCandidateRefreshAction.result.summary.productionGoLiveReadinessLabel || "待复核"}</strong></span>
                            {releaseCandidateRefreshAction.result.summary.productionGoLiveFirstBlockedStageLabel ? (
                              <span>首个阻塞 <strong>{releaseCandidateRefreshAction.result.summary.productionGoLiveFirstBlockedStageLabel}</strong></span>
                            ) : null}
                            <span>阻塞 <strong>{releaseCandidateRefreshAction.result.summary.blockerLabel}</strong></span>
                            <span>候选刷新 <strong>{releaseCandidateRefreshAction.result.summary.releaseCandidateRefreshed ? "是" : "否"}</strong></span>
                            <span>套件刷新 <strong>{releaseCandidateRefreshAction.result.summary.goLiveSuiteRefreshed ? "是" : "否"}</strong></span>
                          </div>
                          {renderV1ProductionEnvFileSourceStatusList(
                            releaseCandidateRefreshAction.result.summary.productionGoLiveSourceStatuses,
                          )}
                          {releaseCandidateRefreshAction.result.blockers.length ? (
                            <div className="v1-field-intake-invalid-list">
                              {releaseCandidateRefreshAction.result.blockers.slice(0, 3).map((item) => (
                                <p key={item.key}>
                                  {item.label}：{item.nextAction || item.detail}
                                </p>
                              ))}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <p>{releaseCandidateRefreshAction.error}</p>
                      )}
                    </div>
                  ) : null}
                  <div className="v1-field-intake-quality-list">
                    {fieldEvidenceIntakeQuality.checks.map((item) => (
                      <div className="v1-field-intake-quality-row" key={item.key}>
                        <div>
                          <StatusPill tone={item.ready ? "success" : item.blocking ? "danger" : "warning"}>
                            {item.statusLabel}
                          </StatusPill>
                          <strong>{item.label}</strong>
                        </div>
                        <p>{item.detail}</p>
                        <span>{item.nextAction}</span>
                      </div>
                    ))}
                  </div>
                  <p className="v1-field-intake-note">{fieldEvidenceIntakeQuality.nextAction}</p>
                </div>
              ) : null}
              {fieldEvidenceIntakeGuidance ? (
                <div className="v1-field-intake-guidance">
                  <div className="v1-field-intake-head">
                    <strong>现场证据回填指引</strong>
                    <span>{fieldEvidenceIntakeGuidance.summary.commandCountLabel}</span>
                  </div>
                  <div className="v1-field-intake-summary">
                    <span>证据 <strong>{fieldEvidenceIntakeGuidance.summary.evidenceProgressLabel}</strong></span>
                    <span>签字 <strong>{fieldEvidenceIntakeGuidance.summary.signoffProgressLabel}</strong></span>
                    <span>边界 <strong>{fieldEvidenceIntakeGuidance.summary.boundaryLabel}</strong></span>
                    <span>草稿 <strong>{fieldEvidenceIntakeGuidance.summary.draftManifestLabel}</strong></span>
                    <span>草稿匹配 <strong>{fieldEvidenceIntakeGuidance.summary.draftFreshnessLabel}</strong></span>
                  </div>
                  <p className="v1-field-intake-note">{fieldEvidenceIntakeGuidance.blockedReason}</p>
                  <div className="v1-field-intake-command-list">
                    {fieldEvidenceIntakeGuidance.commands.map((item, index) => (
                      <div className="v1-field-intake-command-row" key={item.key}>
                        <div>
                          <StatusPill tone={index === 0 ? "warning" : "blue"}>第 {index + 1} 步</StatusPill>
                          <strong>{item.label}</strong>
                        </div>
                        <p>{item.description}</p>
                        <code>{item.command}</code>
                      </div>
                    ))}
                  </div>
                  <p className="v1-field-intake-note">{fieldEvidenceIntakeGuidance.nextAction}</p>
                </div>
              ) : null}
              <div className="v1-signoff-strip">
                {fieldEvidenceProgress.signoffs.map((signoff) => (
                  <span key={signoff.role} className={signoff.ready ? "ready" : ""}>
                    {signoff.role}<strong>{signoff.ready ? "已签字" : "待签字"}</strong>
                  </span>
                ))}
              </div>
              <p className="v1-field-evidence-boundary">
                V1/V2 边界：{fieldEvidenceProgress.boundary.label}，V1 {fieldEvidenceProgress.boundary.v1ItemCount} 项继续完成，V2 {fieldEvidenceProgress.boundary.v2ItemCount} 项延后。
              </p>
            </section>
          ) : null}
          {v1V2BoundaryBrief ? (
            <section className="detail-section" ref={v1V2BoundaryBriefRef}>
              <div className="v1-section-title-row">
                <h3>V1/V2 边界</h3>
                <div className="v1-section-title-actions">
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={onRefreshV1V2ScopeBrief}
                    disabled={!onRefreshV1V2ScopeBrief || v1V2ScopeBriefRefreshAction.loading || v1V2BoundaryPrecheckAction.loading}
                  >
                    {v1V2ScopeBriefRefreshAction.loading ? "刷新中" : "刷新差异"}
                  </button>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={onPrecheckV1V2Boundary}
                    disabled={!onPrecheckV1V2Boundary || v1V2BoundaryPrecheckAction.loading || v1V2ScopeBriefRefreshAction.loading}
                  >
                    {v1V2BoundaryPrecheckAction.loading ? "预检中" : "边界预检"}
                  </button>
                </div>
              </div>
              <p className="v1-v2-boundary-conclusion">{v1V2BoundaryBrief.conclusion}</p>
              <div className="v1-v2-boundary-summary">
                <span>V1 必做 <strong>{v1V2BoundaryBrief.summary.v1MustContinueLabel}</strong></span>
                <span>V2 分类 <strong>{v1V2BoundaryBrief.summary.v2CategoryLabel}</strong></span>
                <span>V2 差异 <strong>{v1V2BoundaryBrief.summary.v2DifferenceLabel}</strong></span>
                <span>模块 <strong>{v1V2BoundaryBrief.summary.moduleDifferenceLabel}</strong></span>
              </div>
              {v1V2ScopeBriefRefreshAction.result || v1V2ScopeBriefRefreshAction.error ? (
                <div className="v1-v2-boundary-precheck-result">
                  {v1V2ScopeBriefRefreshAction.result ? (
                    <>
                      <div>
                        <StatusPill tone={v1V2ScopeBriefRefreshAction.result.ready ? "success" : "warning"}>
                          {v1V2ScopeBriefRefreshAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近差异刷新</strong>
                      </div>
                      <p>{v1V2ScopeBriefRefreshAction.result.nextAction}</p>
                      <div className="v1-field-intake-summary">
                        <span>V1 必做 <strong>{v1V2ScopeBriefRefreshAction.result.summary.v1MustContinueLabel}</strong></span>
                        <span>V2 分类 <strong>{v1V2ScopeBriefRefreshAction.result.summary.v2CategoryLabel}</strong></span>
                        <span>V2 差异 <strong>{v1V2ScopeBriefRefreshAction.result.summary.v2DifferenceLabel}</strong></span>
                        <span>模块 <strong>{v1V2ScopeBriefRefreshAction.result.summary.moduleDifferenceLabel}</strong></span>
                        <span>摘要刷新 <strong>{v1V2ScopeBriefRefreshAction.result.summary.scopeBriefRefreshed ? "是" : "否"}</strong></span>
                        <span>候选刷新 <strong>{v1V2ScopeBriefRefreshAction.result.summary.releaseCandidateRefreshed ? "是" : "否"}</strong></span>
                      </div>
                    </>
                  ) : (
                    <p>{v1V2ScopeBriefRefreshAction.error}</p>
                  )}
                </div>
              ) : null}
              {v1V2BoundaryPrecheckAction.result || v1V2BoundaryPrecheckAction.error ? (
                <div className="v1-v2-boundary-precheck-result">
                  {v1V2BoundaryPrecheckAction.result ? (
                    <>
                      <div>
                        <StatusPill tone={v1V2BoundaryPrecheckAction.result.ready ? "success" : "warning"}>
                          {v1V2BoundaryPrecheckAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近边界预检</strong>
                      </div>
                      <p>{v1V2BoundaryPrecheckAction.result.nextAction}</p>
                      <div className="v1-field-intake-summary">
                        <span>边界 <strong>{v1V2BoundaryPrecheckAction.result.summary.boundaryLabel}</strong></span>
                        <span>V1 必做 <strong>{v1V2BoundaryPrecheckAction.result.summary.v1MustContinueLabel}</strong></span>
                        <span>V2 差异 <strong>{v1V2BoundaryPrecheckAction.result.summary.v2DifferenceLabel}</strong></span>
                        <span>阻塞 <strong>{v1V2BoundaryPrecheckAction.result.summary.blockerLabel}</strong></span>
                        <span>候选刷新 <strong>{v1V2BoundaryPrecheckAction.result.summary.releaseCandidateRefreshed ? "是" : "否"}</strong></span>
                      </div>
                      {v1V2BoundaryPrecheckAction.result.blockers.length ? (
                        <div className="v1-v2-boundary-precheck-blockers">
                          {v1V2BoundaryPrecheckAction.result.blockers.slice(0, 3).map((item) => (
                            <p key={item.key || item.label}>
                              {item.label}：{item.nextAction}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p>{v1V2BoundaryPrecheckAction.error}</p>
                  )}
                </div>
              ) : null}
              <div className="v1-v2-boundary-grid">
                <div className="v1-v2-boundary-column">
                  <div className="v1-v2-list-head">
                    <strong>V1 必须继续完成</strong>
                    <span>{v1MustContinueItemsForPage.length}/{v1V2BoundaryBrief.v1MustContinue.length}</span>
                  </div>
                  <div className="v1-v2-boundary-list">
                    {v1MustContinueItemsForPage.map((item) => (
                      <p key={item}>{item}</p>
                    ))}
                  </div>
                  {v1V2BoundaryBrief.v1MustContinue.length > 4 ? (
                    <button className="ghost-button v1-v2-list-toggle" type="button" onClick={() => setShowAllV1MustContinueItems((value) => !value)}>
                      {showAllV1MustContinueItems ? "收起 V1 必做" : "展开全部 V1 必做"}
                    </button>
                  ) : null}
                </div>
                <div className="v1-v2-boundary-column">
                  <div className="v1-v2-list-head">
                    <strong>计划 V2</strong>
                    <span>{v2BoundaryDifferencesForPage.length}/{v1V2BoundaryBrief.v2Differences.length}</span>
                  </div>
                  <div className="v1-v2-category-list">
                    {v1V2BoundaryBrief.v2Categories.map((item) => <span key={item}>{item}</span>)}
                  </div>
                  <div className="v1-v2-boundary-list">
                    {v2BoundaryDifferencesForPage.map((item) => (
                      <p key={item}>{item}</p>
                    ))}
                  </div>
                  {v1V2BoundaryBrief.v2Differences.length > 5 ? (
                    <button className="ghost-button v1-v2-list-toggle" type="button" onClick={() => setShowAllV2BoundaryDifferences((value) => !value)}>
                      {showAllV2BoundaryDifferences ? "收起 V2 差异" : "展开全部 V2 差异"}
                    </button>
                  ) : null}
                </div>
              </div>
              {v1V2BoundaryBrief.moduleDifferences.length ? (
                <div className="v1-v2-module-list">
                  <div className="v1-v2-list-head">
                    <strong>模块差异</strong>
                    <span>{v1V2ModuleDifferencesForPage.length}/{v1V2BoundaryBrief.moduleDifferences.length}</span>
                  </div>
                  {v1V2ModuleDifferencesForPage.map((item) => (
                    <div className="v1-v2-module-row" key={item.module}>
                      <strong>{item.module}</strong>
                      <span>V1：{item.v1}</span>
                      <span>V2：{item.v2}</span>
                    </div>
                  ))}
                  {v1V2BoundaryBrief.moduleDifferences.length > 5 ? (
                    <button className="ghost-button v1-v2-list-toggle" type="button" onClick={() => setShowAllV1V2ModuleDifferences((value) => !value)}>
                      {showAllV1V2ModuleDifferences ? "收起模块差异" : "展开全部模块差异"}
                    </button>
                  ) : null}
                </div>
              ) : null}
              <div className="v1-v2-owner-review">
                <strong>负责人复核</strong>
                <p>{v1V2BoundaryBrief.ownerReview.question}</p>
                <p>{v1V2BoundaryBrief.ownerReview.approvalRule}</p>
              </div>
            </section>
          ) : null}
          {productionEnvFixChecklist ? (
            <section className="detail-section" ref={productionEnvFixChecklistRef}>
              <h3>生产环境修正清单</h3>
              <div className="v1-env-fix-summary">
                <span>清单 <strong>{productionEnvFixChecklist.summary.itemCount} 项</strong></span>
                <span>阻塞 <strong>{productionEnvFixChecklist.summary.blockingCount} 项</strong></span>
                <span>警告 <strong>{productionEnvFixChecklist.summary.warningCount} 项</strong></span>
                <span>变量 <strong>{productionEnvFixChecklist.summary.configuredLabel}</strong></span>
              </div>
              <div className="v1-env-fix-list">
                <div className="v1-env-list-head">
                  <strong>修正项</strong>
                  <span>{productionEnvFixItemsForPage.length}/{productionEnvFixChecklist.items.length}</span>
                </div>
                {productionEnvFixItemsForPage.map((item) => {
                  const liveVariableCheckItem = getProductionEnvVariableCheckOverlayItemForPage(productionEnvVariableCheckOverlay, item);
                  const variableChecks = buildProductionEnvVariableChecksForPage(item, liveVariableCheckItem);
                  const variableCheckSourceLabel = liveVariableCheckItem?.sourceLabel || "交接包快照";
                  const variableCheckCountLabel = getProductionEnvVariableCheckCountLabelForPage(liveVariableCheckItem || item);
                  return (
                    <div className="v1-env-fix-row" key={item.key || item.label}>
                      <div>
                        <StatusPill tone={item.severity === "blocking" ? "danger" : item.severity === "warning" ? "warning" : "success"}>
                          {item.severity === "blocking" ? "阻塞" : item.severity === "warning" ? "警告" : "已通过"}
                        </StatusPill>
                        <strong>{item.label}</strong>
                        {productionEnvTemplateSectionIndexByLabel.has(item.label) ? (
                          <button className="ghost-button v1-env-template-locate-button" type="button" onClick={() => focusProductionEnvTemplateSection(item)}>
                            定位草稿段
                          </button>
                        ) : null}
                      </div>
                      <p>{item.nextAction}</p>
                      <div className="v1-env-fix-meta">
                        <span>{item.ownerRole}</span>
                        <span>{item.configuredVariableCount}/{item.totalVariableCount} 已配置</span>
                        {item.variableLabel ? <span>{item.variableLabel}</span> : null}
                        {!productionEnvTemplateSectionIndexByLabel.has(item.label) ? <span>无 env 草稿段</span> : null}
                      </div>
                      <div className="v1-env-variable-checks">
                        <div className="v1-env-variable-check-head">
                          <strong>变量检查</strong>
                          <span className={`v1-env-variable-check-source ${liveVariableCheckItem ? "live" : ""}`}>
                            {liveVariableCheckItem ? `最近预检：${variableCheckSourceLabel} ${variableCheckCountLabel}` : `来源：${variableCheckSourceLabel} ${variableCheckCountLabel}`}
                          </span>
                        </div>
                        <div className="v1-env-variable-check-list">
                          {variableChecks.length ? variableChecks.map((variable) => (
                            <span className={`v1-env-variable-chip ${variable.status}`} key={`${item.key || item.label}-${variable.name}`}>
                              <strong>{variable.statusLabel}</strong>
                              {variable.name}
                            </span>
                          )) : (
                            <span className="v1-env-variable-chip none">
                              <strong>无需填写</strong>
                              当前项没有待填写变量
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {productionEnvFixChecklist.items.length > 6 ? (
                  <button className="ghost-button v1-env-list-toggle" type="button" onClick={() => setShowAllProductionEnvFixItems((value) => !value)}>
                    {showAllProductionEnvFixItems ? "收起 env 修正项" : "展开全部 env 修正项"}
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}
          {productionEnvMinimumValuesFragmentTemplate ? (
            <section className="detail-section v1-production-env-minimum-values-template" ref={productionEnvMinimumValuesFragmentTemplateRef}>
              <h3>最小真实值片段模板</h3>
              <div className="v1-env-template-summary">
                <span>变量 <strong>{productionEnvMinimumValuesFragmentTemplate.summary.variableCount}</strong></span>
                <span>待填写 <strong>{productionEnvMinimumValuesFragmentTemplate.summary.placeholderCount}</strong></span>
                <span>目标 <strong>{productionEnvMinimumValuesFragmentTemplate.summary.targetLabel || "最小补值"}</strong></span>
                <span>阻塞段 <strong>{productionEnvMinimumValuesFragmentTemplate.summary.blockingSectionCount}</strong></span>
                <span>写 env <strong>{productionEnvMinimumValuesFragmentTemplate.safeguards?.productionEnvFileMutated ? "是" : "否"}</strong></span>
                <span>浏览器值 <strong>{productionEnvMinimumValuesFragmentTemplate.safeguards?.browserEnvValuesAccepted ? "接收" : "不接收"}</strong></span>
              </div>
              <p className="v1-production-env-gate-note">
                只展示模板和占位符；真实 PostgreSQL、对象存储、打印命令、spool 路径和 token 仍必须填到安全未跟踪片段后再 dry-run。
              </p>
              <div className="v1-env-list-head">
                <strong>脱敏预览</strong>
                <span>{productionEnvMinimumTemplateLinesForPage.length}/{productionEnvMinimumTemplatePreviewLines.length}</span>
              </div>
              <pre className="v1-env-template-preview">
                {productionEnvMinimumTemplateLinesForPage.map((line, index) => {
                  const sectionLabel = getProductionEnvTemplateSectionLabel(line);
                  return (
                    <span
                      className={[
                        "v1-env-template-line",
                        sectionLabel ? "section" : "",
                      ].filter(Boolean).join(" ")}
                      key={`minimum-${index}-${line}`}
                    >
                      {line}
                    </span>
                  );
                })}
              </pre>
              {productionEnvMinimumTemplatePreviewLines.length > 34 ? (
                <button className="ghost-button v1-env-list-toggle" type="button" onClick={() => setShowAllProductionEnvMinimumTemplateLines((value) => !value)}>
                  {showAllProductionEnvMinimumTemplateLines ? "收起最小片段" : "展开完整最小片段"}
                </button>
              ) : null}
            </section>
          ) : null}
          {productionEnvFillTemplate ? (
            <section className="detail-section" ref={productionEnvFillTemplateRef}>
              <h3>安全 env 填写草稿</h3>
              <div className="v1-env-template-summary">
                <span>变量 <strong>{productionEnvFillTemplate.summary.variableCount}</strong></span>
                <span>待填写 <strong>{productionEnvFillTemplate.summary.placeholderCount}</strong></span>
                <span>阻塞段 <strong>{productionEnvFillTemplate.summary.blockingSectionCount}</strong></span>
                <span>警告段 <strong>{productionEnvFillTemplate.summary.warningSectionCount}</strong></span>
              </div>
              <div className="v1-env-list-head">
                <strong>脱敏预览</strong>
                <span>{productionEnvTemplateLinesForPage.length}/{productionEnvTemplatePreviewLines.length}</span>
              </div>
              <pre className="v1-env-template-preview" ref={productionEnvTemplatePreviewRef}>
                {productionEnvTemplateLinesForPage.map((line, index) => {
                  const sectionLabel = getProductionEnvTemplateSectionLabel(line);
                  const envLineIndex = index;
                  const isFocusedLine = focusedProductionEnvTemplateLineIndex === envLineIndex;
                  return (
                    <span
                      className={[
                        "v1-env-template-line",
                        sectionLabel ? "section" : "",
                        isFocusedLine ? "focused" : "",
                      ].filter(Boolean).join(" ")}
                      data-env-line-index={envLineIndex}
                      key={`${envLineIndex}-${index}-${line}`}
                    >
                      {line}
                    </span>
                  );
                })}
              </pre>
              {productionEnvTemplatePreviewLines.length > 36 ? (
                <button className="ghost-button v1-env-list-toggle" type="button" onClick={() => setShowAllProductionEnvTemplateLines((value) => !value)}>
                  {showAllProductionEnvTemplateLines ? "收起 env 草稿" : "展开完整 env 草稿"}
                </button>
              ) : null}
            </section>
          ) : null}
          <section className="detail-section">
            <h3>角色压力</h3>
            <div className="v1-role-buckets">
              {unblockPlan.roleBuckets.map(([role, count]) => (
                <span key={role}>{role}<strong>{count}</strong></span>
              ))}
            </div>
          </section>
          <section className="detail-section">
            <h3>主要未完成</h3>
            <p>{selectedModule.remaining}</p>
          </section>
          <section className="detail-section">
            <h3>当前最小阻塞</h3>
            <ul className="v1-blocker-list">
              {statusSummary.blockers.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>
          <section className="detail-section">
            <h3>计划 V2 差异</h3>
            <div className="v2-difference-list">
              {v2DifferenceItemsForPage.map(([label, text]) => (
                <div className="v2-difference-row" key={label}>
                  <strong>{label}</strong>
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </section>
        </DetailPane>
      </section>
    </section>
  );
}

function getProductionEnvTemplateSectionLabel(line) {
  const text = String(line ?? "").trim();
  const match = text.match(/^#\s+(BLOCKING|WARNING)\s+\|\s+[^|]+\|\s+(.+)$/);
  return match ? match[2].trim() : "";
}

function buildProductionEnvVariableCheckOverlayForPage(baseItems = [], candidates = []) {
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

function getProductionEnvPrecheckItemsForPage(result = {}) {
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

function getProductionEnvVariableCheckOverlayItemForPage(overlay, item = {}) {
  if (!overlay?.itemsByKey) return null;
  const key = String(item.key ?? "").trim();
  const label = String(item.label ?? "").trim();
  return (key ? overlay.itemsByKey.get(`key:${key}`) : null) ||
    (label ? overlay.itemsByKey.get(`label:${label}`) : null) ||
    null;
}

function getProductionEnvVariableCheckCountLabelForPage(item = {}) {
  const configuredCount = Number(item.configuredVariableCount) || 0;
  const totalCount = Number(item.totalVariableCount) || 0;
  return `${configuredCount}/${totalCount}`;
}

function buildProductionEnvVariableChecksForPage(item = {}, liveItem = null) {
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

function normalizeProductionEnvObjectListForPage(value) {
  return Array.isArray(value)
    ? value.filter((item) => item && typeof item === "object")
    : [];
}

function normalizeProductionEnvStringListForPage(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function isProductionEnvRuleLineForPage(value) {
  const text = String(value ?? "");
  return /\b(Either|complete all|leave them empty|fallback|or)\b/i.test(text);
}

function buildV1StatusSummaryForPage(goLiveStatus) {
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

export function TodoPage({ todos, todoMeta = {}, printBatchRecords = [], selectedTodoId, onSelect, view, setView, onAction, helpers }) {
  const { currentUser, findCustomer, getTodoActions, getTodoCustomerNotificationDraft, getTodoHandlingRule, getTodoTone, getUiActionState, isPrintTodo, sortTodos } = helpers;
  const sortedTodos = sortTodos(todos);
  const openTodos = sortedTodos.filter((item) => !item.handled);
  const handledTodos = sortedTodos.filter((item) => item.handled);
  const visibleTodos = view === "已处理" ? handledTodos : view === "全部" ? sortedTodos : openTodos;
  const selected = visibleTodos.find((item) => item.id === selectedTodoId) ?? visibleTodos[0];
  const customerInfo = selected ? findCustomer(selected.customerId) : null;
  const actions = selected ? getTodoActions(selected) : [];
  const customerNotificationDraft = selected && customerInfo ? getTodoCustomerNotificationDraft?.(selected, customerInfo) : null;
  const selectedPrintBatchRecords = selected ? getPrintBatchRecordsForTodo(printBatchRecords, selected.id).slice(0, 3) : [];
  const printOpenCount = openTodos.filter(isPrintTodo).length;
  const stats = [
    ["未处理", openTodos.length, "warning"],
    ["今天要发", openTodos.filter((item) => item.latest.includes("今天")).length, "blue"],
    ["异常红点", openTodos.filter((item) => item.urgency === "异常").length, "danger"],
    ["已处理(今日)", handledTodos.length, "success"],
  ];

  return (
    <section className="page-grid two-col">
      <div className="list-pane">
        <MetricStrip items={stats} />
        <div className="panel-head compact todo-head">
          <div>
            <h2>公共待办池</h2>
            <span>
              急单、异常、今天要发、等待时长排序
              {todoMeta.source ? ` · ${todoMeta.source === "api" ? "后端公共待办" : "本地公共待办"} ${todoMeta.total ?? todos.length} 条` : ""}
            </span>
          </div>
          <Segmented value={view} onChange={setView} items={["未处理", "已处理", "全部"]} />
        </div>
        {printOpenCount > 0 ? (
          <div className="todo-bulk-row">
            <span>打印类待办 {printOpenCount} 条，打印后需确认结果</span>
            <button
              disabled={getUiActionState("todo", "批量打印标签").disabled}
              title={getUiActionState("todo", "批量打印标签").title}
              onClick={() => onAction("批量打印标签")}
            >
              批量打印标签
            </button>
          </div>
        ) : null}
        <div className="todo-list">
          {visibleTodos.length ? visibleTodos.map((item) => {
            const customer = findCustomer(item.customerId);
            return (
              <button className={`${item.id === selected?.id ? "todo-row active" : "todo-row"} ${item.handled ? "handled" : ""} ${item.reminder ? "snoozed" : ""}`} key={item.id} onClick={() => onSelect(item.id)}>
                <div className="todo-main">
                  <strong>{item.type}</strong>
                  <span>{customer.name} · {item.ref}</span>
                  <small>{item.summary}</small>
                  <em>{getTodoHandlingRule(item)}{item.reminder ? ` · 提醒 ${item.reminder}` : ""}</em>
                </div>
                <div className="todo-side">
                  <StatusPill tone={getTodoTone(item)}>
                    {item.handled ? "已处理" : item.urgency}
                  </StatusPill>
                  <em>{item.handledBy ? item.handledBy : item.reminder ? `提醒 ${item.reminder}` : item.wait}</em>
                </div>
              </button>
            );
          }) : <div className="empty-row">当前视图没有待办</div>}
        </div>
      </div>
      {selected && customerInfo ? (
      <DetailPane title={selected.type} subtitle={`${customerInfo.name} · ${selected.ref}`}>
        <InfoGrid
          rows={[
            ["客户", customerInfo.name],
            ["联系人", `${customerInfo.contact} ${customerInfo.phone}`],
            ["最晚时间", selected.latest],
            ["等待时长", selected.wait],
            ["处理方式", getTodoHandlingRule(selected)],
            ["提醒状态", selected.reminder ?? "未设置"],
            ["影响", selected.impact],
            ["最后动作", selected.lastAction ?? selected.handledAt ?? "未处理"],
          ]}
        />
        <section className="detail-section">
          <h3>摘要</h3>
          <p>{selected.summary}</p>
        </section>
        {customerNotificationDraft ? (
          <section className="detail-section">
            <h3>客户通知</h3>
            <div className="todo-notification-card">
              <InfoGrid
                rows={[
                  ["发送渠道", customerNotificationDraft.channel],
                  ["通知状态", customerNotificationDraft.status],
                  ["成品图", customerNotificationDraft.photoPrompt],
                ]}
              />
              <p>{customerNotificationDraft.copyText}</p>
            </div>
          </section>
        ) : null}
        {selectedPrintBatchRecords.length ? (
          <section className="detail-section">
            <h3>打印批次</h3>
            <div className="print-batch-records">
              {selectedPrintBatchRecords.map((record) => (
                <div className="print-batch-record" key={record.printBatchId}>
                  <div>
                    <strong>{record.printBatchId}</strong>
                    <StatusPill tone={record.status === "printed" ? "success" : record.status === "partial" ? "warning" : "danger"}>
                      {record.resultLabel}
                    </StatusPill>
                  </div>
                  <p>{record.summary}</p>
                  <small>已打：{formatPrintBatchPackageList(record.printedPackages, record.printedPackageIds)}</small>
                  <small>待打：{formatPrintBatchPackageList(record.pendingPackages, record.pendingPackageIds)}</small>
                  <em>{record.operatorName} · {record.createdAt}</em>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        <section className="detail-section">
          <h3>建议动作</h3>
          <div className="action-row">
            {actions.map((item) => {
              const actionState = getUiActionState("todo", item.label);
              return (
                <button className={item.variant === "primary" ? "primary-action" : ""} disabled={actionState.disabled} key={item.label} title={actionState.title} onClick={() => onAction(item.label, selected.id)}>{item.label}</button>
              );
            })}
          </div>
        </section>
        {!selected.handled && (
          <section className="detail-section">
            <h3>稍后提醒</h3>
            <div className="action-row">
              {[
                ["稍后30分钟", "30分钟"],
                ["稍后2小时", "2小时"],
                ["稍后明早", "明早"],
                ["稍后指定时间", "指定时间"],
              ].map(([action, label]) => {
                const actionState = getUiActionState("todo", action);
                return <button disabled={actionState.disabled} key={action} title={actionState.title} onClick={() => onAction(action, selected.id)}>{label}</button>;
              })}
            </div>
          </section>
        )}
        <Timeline items={["系统创建待办", selected.lastAction ?? `${currentUser.displayName} 查看详情`, selected.handled ? "已处理" : selected.reminder ? `已设提醒 ${selected.reminder}` : "等待人工处理"]} />
      </DetailPane>
      ) : (
        <DetailPane title="公共待办" subtitle="未选择">
          <div className="empty-row">没有可显示的待办</div>
        </DetailPane>
      )}
    </section>
  );
}

export function EntryPage({ entryText, setEntryText, draftRows, draftStatus, selectedDraftId, setSelectedDraftId, onRecognize, onDraftFieldChange, onDraftCommand, onAction, helpers }) {
  const { editableColors, getDraftColorSpecLabel, getDraftMissingFields, getDraftNote, getDraftStatusTone, getDraftTypeLabel, getUiActionState, money, sampleText } = helpers;
  const selected = draftRows.find((item) => item.id === selectedDraftId) ?? draftRows[0];
  const selectedMissing = selected ? getDraftMissingFields(selected) : [];
  const recognizeState = getUiActionState("entry", "识别");
  return (
    <section className="page-stack">
      <div className="entry-box">
        <textarea value={entryText} onChange={(event) => setEntryText(event.target.value)} />
        <div className="entry-actions">
          <button className="primary-button" disabled={recognizeState.disabled} title={recognizeState.title} onClick={onRecognize}>识别</button>
          <button onClick={() => setEntryText("")}>清空</button>
          <button onClick={() => setEntryText(sampleText)}>填入样例</button>
        </div>
      </div>
      <section className="page-grid split-detail">
        <div className="table-pane">
          <div className="table-tools">
            <div>
              <StatusPill tone={getDraftStatusTone(draftStatus)}>{draftStatus}</StatusPill>
              <span>{draftRows.length} 行识别明细</span>
              {selected ? <small>当前：{selected.id}</small> : <small>未选择明细</small>}
            </div>
            <div className="tool-actions">
              <button onClick={() => onDraftCommand("合并下一行")}>合并下一行</button>
              <button onClick={() => onDraftCommand("拆分当前行")}>拆分当前行</button>
              <button onClick={() => onDraftCommand("删除当前行")}>删除当前行</button>
            </div>
          </div>
          <EntryDraftTable rows={draftRows} selectedId={selected?.id} onSelect={setSelectedDraftId} onChange={onDraftFieldChange} helpers={helpers} />
          <div className="footer-actions">
            {["保存草稿", "保存并确认", "拆分订单", "作废草稿"].map((item) => {
              const actionState = getUiActionState("entry", item);
              return <button className={item === "保存并确认" ? "primary-action" : ""} disabled={actionState.disabled} key={item} title={actionState.title} onClick={() => onAction(item)}>{item}</button>;
            })}
          </div>
        </div>
        <DetailPane title="识别详情" subtitle={selected?.id ?? "未选择"}>
          {selected ? (
            <>
              <InfoGrid
                rows={[
                  ["置信度", selected.confidence === "high" ? "高" : selected.confidence === "medium" ? "中，需要确认" : "低，必须补充"],
                  ["草稿状态", draftStatus],
                  ["业务类型", getDraftTypeLabel(selected)],
                  ["底袋款式", selected.style],
                  ["颜色短写", getDraftColorSpecLabel(selected)],
                  ["备注", getDraftNote(selected) || "无"],
                  ["原文片段", selected.source],
                  ["印刷图/稿件", selected.artworkStatus ?? (selected.print === "是" ? "待上传" : "非印刷不需要")],
                  ["客户备注", "从原文识别，文员可补充"],
                  ["价格快照", `${money(selected.amount)}，正式保存前重算`],
                ]}
              />
              <section className="detail-section">
                <h3>印刷 / 提手 / 备注</h3>
                <div className="detail-form">
                  {selected.print === "是" ? (
                    <>
                    <label>
                      <span>印刷颜色</span>
                      <select value={selected.printColor ?? "待确认"} onChange={(event) => onDraftFieldChange(selected.id, "printColor", event.target.value)}>
                        <option>待确认</option>
                        {editableColors.map((color) => <option key={color}>{color}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>印刷面</span>
                      <select value={selected.printSide ?? "待确认"} onChange={(event) => onDraftFieldChange(selected.id, "printSide", event.target.value)}>
                        <option>待确认</option>
                        <option>单面</option>
                        <option>双面</option>
                      </select>
                    </label>
                    <label>
                      <span>印刷图/稿件</span>
                      <select value={selected.artworkStatus ?? "待上传"} onChange={(event) => onDraftFieldChange(selected.id, "artworkStatus", event.target.value)}>
                        <option>待上传</option>
                        <option>客户待补</option>
                        <option>已上传</option>
                        <option>已有稿件</option>
                      </select>
                    </label>
                    </>
                  ) : (
                    <p>非印刷单不需要填写印刷图、印刷颜色或印刷面。</p>
                  )}
                  <label>
                    <span>提手颜色</span>
                    <select value={selected.handleColor ?? ""} onChange={(event) => onDraftFieldChange(selected.id, "handleColor", event.target.value)}>
                      <option value="">同袋色/未特殊</option>
                      <option>待确认</option>
                      {editableColors.map((color) => <option key={color}>{color}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>备注</span>
                    <input value={selected.note ?? ""} onChange={(event) => onDraftFieldChange(selected.id, "note", event.target.value)} placeholder="加长提、提手颜色更换、其他" />
                  </label>
                </div>
              </section>
              <section className="detail-section">
                <h3>缺字段检查</h3>
                <StatusPill tone={selectedMissing.length ? "danger" : selected.confidence === "medium" ? "warning" : "success"}>
                  {selectedMissing.length ? `缺 ${selectedMissing.join("、")}` : selected.confidence === "medium" ? "可保存前需复核库存/时间" : "可保存确认"}
                </StatusPill>
              </section>
            </>
          ) : null}
        </DetailPane>
      </section>
    </section>
  );
}

function EntryDraftTable({ rows, selectedId, onSelect, onChange, helpers }) {
  const { customers, getDraftTypeLabel, getDraftTypeTone, money, statusTone } = helpers;
  const columns = ["客户", "品名/印刷", "尺寸", "颜色", "提手", "款式/类型", "印刷", "数量", "交付", "最晚", "库存", "预估"];
  return (
    <div className="data-table entry-table" style={{ "--cols": columns.length }}>
      <div className="data-row head">
        {columns.map((column) => <span key={column}>{column}</span>)}
      </div>
      {rows.map((row) => (
        <div className={`data-row entry-edit-row ${row.id === selectedId ? "active" : ""} ${row.confidence}`} key={row.id} onClick={() => onSelect(row.id)}>
          <span>
            <select value={row.customerId} onChange={(event) => onChange(row.id, "customerId", event.target.value)}>
              <option value="">待确认</option>
              {customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.name}</option>)}
            </select>
          </span>
          <span><input value={row.product} onChange={(event) => onChange(row.id, "product", event.target.value)} /></span>
          <span><input value={row.size} onChange={(event) => onChange(row.id, "size", event.target.value)} /></span>
          <span><input value={row.color} onChange={(event) => onChange(row.id, "color", event.target.value)} /></span>
          <span>
            <select value={row.handle} onChange={(event) => onChange(row.id, "handle", event.target.value)}>
              <option>普通提</option>
              <option>加长提</option>
            </select>
          </span>
          <span>
            {getDraftTypeLabel(row) === row.style ? (
              <select value={row.style} onChange={(event) => onChange(row.id, "style", event.target.value)}>
                <option>空白袋</option>
                <option>小熊袋</option>
                <option>喜</option>
                <option>福</option>
                <option>外加工</option>
              </select>
            ) : (
              <StatusPill tone={getDraftTypeTone(row)}>{getDraftTypeLabel(row)}</StatusPill>
            )}
          </span>
          <span>
            <select value={row.print} onChange={(event) => onChange(row.id, "print", event.target.value)}>
              <option>否</option>
              <option>是</option>
            </select>
          </span>
          <span><input type="number" min="0" value={row.qty} onChange={(event) => onChange(row.id, "qty", event.target.value)} /></span>
          <span>
            <select value={row.fulfillment} onChange={(event) => onChange(row.id, "fulfillment", event.target.value)}>
              <option>待确认</option>
              <option>自提</option>
              <option>送货</option>
              <option>快递快运</option>
            </select>
          </span>
          <span><input value={row.latest} onChange={(event) => onChange(row.id, "latest", event.target.value)} /></span>
          <span><StatusPill tone={statusTone(row.inventory)}>{row.inventory}</StatusPill></span>
          <span>{money(row.amount)}</span>
        </div>
      ))}
    </div>
  );
}

export function OrderPoolPage({ orderLines, fulfillments, statements, selectedOrderId, setSelectedOrderId, filters, setFilters, orderPoolMeta, selectedOrderDetail, onLocateFulfillment, onLocateStatement, onOrderAction, setToast, helpers }) {
  const {
    customers,
    defaultOrderFilters,
    findCustomer,
    getLineColorSpecLabel,
    getLineRemark,
    getOrderExceptionState,
    getOrderFinanceState,
    getOrderLineShortNo,
    getUiActionState,
    getStatementForLine,
    money,
    orderMatchesFilters,
    statusTone,
  } = helpers;
  const filtered = orderLines.filter((item) => orderMatchesFilters(item, filters, statements));
  const selected = filtered.find((item) => item.id === selectedOrderId) ?? filtered[0] ?? orderLines[0];
  if (!selected) {
    return (
      <section className="page-grid split-detail">
        <div className="table-pane">
          <div className="order-filter-panel">
            <div className="filter-summary">
              <span>{getOrderPoolSourceLabel(orderPoolMeta)}</span>
              <button onClick={() => setFilters(defaultOrderFilters)}>重置筛选</button>
            </div>
          </div>
          <div className="empty-state">暂无订单明细。</div>
        </div>
        <DetailPane title="订单池" subtitle="暂无可显示明细">
          <InfoGrid rows={[["列表", getOrderPoolSourceLabel(orderPoolMeta)]]} />
        </DetailPane>
      </section>
    );
  }
  const apiDetail = selectedOrderDetail?.orderLine?.id === selected.id ? selectedOrderDetail : null;
  const customerInfo = findCustomer(selected.customerId);
  const selectedFulfillment = fulfillments.find((item) => item.lineId === selected.id);
  const apiFulfillment = apiDetail?.fulfillment?.[0];
  const selectedStatement = getStatementForLine(statements, selected.id);
  const apiStatement = apiDetail?.statement?.[0];
  const financeState = getOrderFinanceState(selected, statements);
  const exceptionState = getOrderExceptionState(selected);
  const orderActionBlocker = getOrderLineMutationBlocker(selected);
  const quantityActionState = getOrderActionState(getUiActionState, "调整正式单数量", orderActionBlocker);
  const voidActionState = getOrderActionState(getUiActionState, "作废正式单", orderActionBlocker);
  const filterOptions = {
    status: ["全部", "待处理", "生产中", "待出库", "缺货", "已交付", "待对账"],
    orderType: ["全部", "现货有货", "现货缺货", "定制印刷", "印刷通货", "外加工印刷"],
    fulfillment: ["全部", "自提", "送货", "快递快运"],
    exception: ["全部", "仅异常", "无异常"],
    finance: ["全部", "待对账", "差额/欠款", "收款待确认", "已结清/无差额"],
  };

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function resetFilters() {
    setFilters(defaultOrderFilters);
    setToast("订单池筛选已重置。");
  }

  return (
    <section className="page-grid split-detail">
      <div className="table-pane">
        <div className="order-filter-panel">
          <div className="filter-grid">
            <label>
              <span>客户</span>
              <select value={filters.customerId} onChange={(event) => updateFilter("customerId", event.target.value)}>
                <option value="全部">全部客户</option>
                {customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.name}</option>)}
              </select>
            </label>
            <label>
              <span>状态</span>
              <select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}>
                {filterOptions.status.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label>
              <span>类型</span>
              <select value={filters.orderType} onChange={(event) => updateFilter("orderType", event.target.value)}>
                {filterOptions.orderType.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label>
              <span>交付</span>
              <select value={filters.fulfillment} onChange={(event) => updateFilter("fulfillment", event.target.value)}>
                {filterOptions.fulfillment.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label>
              <span>异常</span>
              <select value={filters.exception} onChange={(event) => updateFilter("exception", event.target.value)}>
                {filterOptions.exception.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label>
              <span>对账/欠款</span>
              <select value={filters.finance} onChange={(event) => updateFilter("finance", event.target.value)}>
                {filterOptions.finance.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
          </div>
          <div className="filter-summary">
            <span>命中 {filtered.length} / {orderLines.length} 行；{getOrderPoolSourceLabel(orderPoolMeta)}。</span>
            <button onClick={resetFilters}>重置筛选</button>
          </div>
        </div>
        <DataTable
          className="order-table"
          columns={["订单/明细", "客户", "品名", "尺寸", "颜色", "提手", "数量", "类型", "状态", "交付", "异常", "对账"]}
          rows={filtered.map((row) => ({
            id: row.id,
            active: row.id === selected.id,
            tone: statusTone(row.status),
            onClick: () => setSelectedOrderId(row.id),
            cells: [getOrderLineShortNo(row), findCustomer(row.customerId).name, row.product, row.size, row.color, row.handle, row.qty, row.orderType, row.status, row.fulfillment, getOrderExceptionState(row), getOrderFinanceState(row, statements)],
          }))}
        />
      </div>
      <DetailPane title={`${selected.orderNo}-${selected.lineNo}`} subtitle={`${customerInfo.name} · ${selected.status}`}>
        <InfoGrid
          rows={[
            ["产品", `${selected.product} / ${selected.size} / ${getLineColorSpecLabel(selected)}`],
            ["数量", `${selected.qty} 个`],
            ["交付", `${selected.fulfillment} · ${selected.latest}`],
            ["库存", getOrderDetailInventoryLabel(apiDetail, selected.inventory)],
            ["金额", money(selected.amount)],
            ["异常", selected.exceptions.length ? selected.exceptions.join("、") : exceptionState],
            ["对账", selectedStatement ? `${selectedStatement.status} · ${selectedStatement.period}` : apiStatement ? `${apiStatement.status} · ${apiStatement.period}` : financeState],
            ["客户欠款", customerInfo.debt ? money(customerInfo.debt) : "无"],
          ]}
        />
        <section className="detail-section">
          <h3>生产 / 库存</h3>
          <InfoGrid
            rows={[
              ["订单类型", selected.orderType],
              ["印刷", selected.print === "是" ? "需要印刷" : "非印刷"],
              ["印刷颜色", selected.print === "是" ? selected.printColor || "待确认" : "非印刷"],
              ["印刷面", selected.print === "是" ? selected.printSide || "待确认" : "非印刷"],
              ["提手颜色", selected.handleColor || "同袋色/未特殊"],
              ["备注", getLineRemark(selected) || "无"],
              ["生产状态", selected.print === "是" ? selected.status : "不进生产"],
              ["库存状态", `${selected.inventory}；正式动作前需重校验`],
            ]}
          />
        </section>
        <section className="detail-section">
          <h3>打包 / 交付</h3>
          <InfoGrid
            rows={[
              ["交付方式", selected.fulfillment],
              ["交付状态", selectedFulfillment?.status ?? apiFulfillment?.status ?? selected.status],
              ["包裹/单据", selectedFulfillment ? `${selectedFulfillment.packages} / ${selectedFulfillment.printed ? "已打印" : "未打印"}` : apiFulfillment ? `${apiFulfillment.expectedQty} 个 / ${apiFulfillment.status}` : "未生成出库记录"],
              ["交付定位", selectedFulfillment ? selectedFulfillment.lineId : apiFulfillment?.orderLineId ?? "无对应出库记录"],
            ]}
          />
        </section>
        <section className="detail-section">
          <h3>对账 / 收款</h3>
          <InfoGrid
            rows={[
              ["财务状态", financeState],
              ["对账单", selectedStatement?.id ?? apiStatement?.statementId ?? "未生成"],
              ["应收/已收", selectedStatement ? `${money(selectedStatement.receivable)} / ${money(selectedStatement.received)}` : apiStatement ? `${money(apiStatement.receivable)} / ${money(apiStatement.received)}` : `${money(selected.amount)} / 未登记`],
              ["差额", selectedStatement ? money(selectedStatement.variance || 0) : apiStatement ? money(apiStatement.variance || 0) : customerInfo.debt ? money(customerInfo.debt) : "无"],
            ]}
          />
        </section>
        <section className="detail-section">
          <h3>流转摘要</h3>
          <Timeline items={["订单确认", selected.print === "是" ? "丝印/制袋" : "查库存", selectedFulfillment ? `交付：${selectedFulfillment.status}` : apiFulfillment ? `交付：${apiFulfillment.status}` : selected.status, selectedStatement ? `对账：${selectedStatement.status}` : apiStatement ? `对账：${apiStatement.status}` : "待进入对账", orderPoolMeta?.detailLoading ? "详情读取中" : apiDetail ? "详情已同步" : "关键修改需留痕"]} />
        </section>
        <div className="action-row">
          <button onClick={() => setToast("已复制订单摘要。")}>复制</button>
          <button onClick={() => selectedFulfillment ? onLocateFulfillment(selected.id) : setToast("当前明细没有对应出库记录。")}>定位出库</button>
          <button onClick={() => selectedStatement ? onLocateStatement(selected.id) : setToast("当前明细没有对应对账记录。")}>定位对账</button>
          <button onClick={() => setToast("已打开订单详情占位；正式详情页后接。")}>打开详情</button>
          <button disabled={quantityActionState.disabled} title={quantityActionState.title} onClick={() => onOrderAction("quantity", selected)}>调整数量</button>
          <button disabled={voidActionState.disabled} title={voidActionState.title} onClick={() => onOrderAction("void", selected)}>作废正式单</button>
        </div>
      </DetailPane>
    </section>
  );
}

function getOrderActionState(getUiActionState, action, blocker) {
  const permissionState = getUiActionState?.("orders", action) ?? { disabled: false, title: "" };
  if (permissionState.disabled) return permissionState;
  if (blocker) return { disabled: true, title: blocker };
  return permissionState;
}

function getOrderLineMutationBlocker(line) {
  const status = String(line?.status ?? line?.lineStatus ?? "").trim();
  if (!line) return "没有选中的订单明细。";
  if (!status) return "订单状态不完整，不能直接修改。";
  if (status.includes("已关闭") || status.includes("已取消") || status.includes("已交付")) return "已交付、已关闭或已取消的订单不能直接改量或作废。";
  if (status.includes("丝印") || status.includes("制袋") || status.includes("打包")) return "已进入生产或打包的订单不能在订单池直接改量或作废。";
  return "";
}

function getOrderPoolSourceLabel(meta = {}) {
  if (meta.loading) return "正在读取后端订单池";
  if (meta.source === "api") {
    const syncText = meta.lastSyncedAt ? `，${meta.lastSyncedAt} 同步` : "";
    return `后端订单池 ${meta.total ?? 0} 行${syncText}`;
  }
  if (meta.source === "api_error") return `后端订单池返回错误，保留当前列表`;
  if (meta.source === "local_fallback") return "后端未连接，使用本地演示数据";
  return "本地演示数据";
}

function getOrderDetailInventoryLabel(detail, fallback) {
  const traces = Array.isArray(detail?.inventory) ? detail.inventory : [];
  if (!traces.length) return fallback || "未记录";
  const states = [...new Set(traces.map((item) => item.state).filter(Boolean))];
  const reservedQty = traces.reduce((sum, item) => sum + Number(item.reservedQty || 0), 0);
  const stateText = states.length ? states.join("、") : fallback || "库存占用";
  return reservedQty > 0 ? `${stateText}；占用 ${reservedQty}` : stateText;
}

export function InventoryPage({
  inventoryRecords,
  inventoryMeta = {},
  inventoryLedgerEntries = [],
  inventoryLedgerMeta = {},
  inventoryLedgerFilters = defaultInventoryLedgerPanelFilters,
  setInventoryLedgerFilters,
  inventoryCorrectionDetailState = {},
  inventoryCorrectionQueueState = {},
  selectedStockId,
  setSelectedStockId,
  setToast,
  onCreateCorrectionDraft,
  onConfirmCorrectionDraft,
  onOpenCorrectionDraft,
  onRefreshCorrectionQueue,
  onRefreshInventoryLedger,
  onLocateInventoryLedgerSource,
  helpers,
}) {
  const { availableQty, formatStockKey, getStockStateGroup, getStockStateTone, getStockTone, getStockTrustLabel, getUiActionState, isPendingStock, uniqueStockOptions } = helpers;
  const [filters, setFilters] = useState({ query: "", size: "全部", color: "全部", handle: "全部", style: "全部", state: "默认可用", trust: "全部" });
  const [showPending, setShowPending] = useState(false);
  const [requestQty, setRequestQty] = useState(500);
  const [correctionActual, setCorrectionActual] = useState("");
  const [correctionReason, setCorrectionReason] = useState("盘点差异");
  const [correctionDraft, setCorrectionDraft] = useState(null);
  const ledgerFilters = { ...defaultInventoryLedgerPanelFilters, ...inventoryLedgerFilters };
  const includePending = showPending || filters.state === "待处理";
  const visible = inventoryRecords.filter((item) => {
    const queryText = `${item.size} ${item.color} ${item.handle} ${item.style} ${item.zone} ${item.state}`.toLowerCase();
    if (!includePending && isPendingStock(item)) return false;
    if (filters.query.trim() && !queryText.includes(filters.query.trim().toLowerCase())) return false;
    if (filters.size !== "全部" && item.size !== filters.size) return false;
    if (filters.color !== "全部" && item.color !== filters.color) return false;
    if (filters.handle !== "全部" && item.handle !== filters.handle) return false;
    if (filters.style !== "全部" && item.style !== filters.style) return false;
    if (filters.state !== "默认可用" && filters.state !== "全部" && getStockStateGroup(item) !== filters.state) return false;
    if (filters.trust !== "全部" && (filters.trust === "估算/待复核") !== item.estimated) return false;
    return true;
  });
  const selected = visible.find((item) => item.id === selectedStockId) ?? visible[0] ?? inventoryRecords[0];
  const selectedLedgerEntries = inventoryLedgerEntries
    .filter((entry) => !entry.inventoryItemId || entry.inventoryItemId === selected.id)
    .slice(0, 20);
  const available = availableQty(selected);
  const safeRequestQty = Number(requestQty || 0);
  const shortage = Math.max(0, safeRequestQty - available);
  const similarStocks = inventoryRecords
    .filter((item) => item.id !== selected.id)
    .filter((item) => item.size === selected.size && item.handle === selected.handle && item.style === selected.style)
    .filter((item) => !isPendingStock(item) && availableQty(item) > 0)
    .slice(0, 3);
  const customerText =
    shortage > 0
      ? `${formatStockKey(selected)} 当前可用 ${Math.max(0, available)} 个，您要 ${safeRequestQty} 个还差 ${shortage} 个。可以确认等生产、先发可用数量，或改数量/颜色/款式。`
      : `${formatStockKey(selected)} 当前可用 ${available} 个，可满足 ${safeRequestQty} 个；正式确认前我们会再复核库存。`;
  const stats = [
    ["可用键", inventoryRecords.filter((item) => !isPendingStock(item) && availableQty(item) > 0).length, "success"],
    ["占用/锁定", inventoryRecords.filter((item) => item.reserved > 0 || item.locked > 0).length, "warning"],
    ["缺货/零可用", inventoryRecords.filter((item) => !isPendingStock(item) && availableQty(item) <= 0).length, "danger"],
    ["待处理", inventoryRecords.filter(isPendingStock).length, "blue"],
  ];
  const correctionState = getUiActionState("inventory", "生成修正草稿");
  const correctionConfirmState = getUiActionState("inventory", "确认修正生效");
  const correctionQueueItems = Array.isArray(inventoryCorrectionQueueState.items) ? inventoryCorrectionQueueState.items : [];

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function resetFilters() {
    setFilters({ query: "", size: "全部", color: "全部", handle: "全部", style: "全部", state: "默认可用", trust: "全部" });
    setShowPending(false);
    setToast("库存筛选已重置，默认隐藏待处理/报废库存。");
  }

  function updateLedgerFilter(field, value) {
    setInventoryLedgerFilters?.((current) => ({
      ...defaultInventoryLedgerPanelFilters,
      ...current,
      [field]: value,
    }));
  }

  function applyLedgerFilters(nextFilters = ledgerFilters) {
    const normalized = normalizeInventoryLedgerPanelFilters(nextFilters);
    setInventoryLedgerFilters?.(normalized);
    onRefreshInventoryLedger?.({ stockId: selected.id, filters: normalized, showToast: true });
  }

  function resetLedgerFilters() {
    setInventoryLedgerFilters?.(defaultInventoryLedgerPanelFilters);
    onRefreshInventoryLedger?.({ stockId: selected.id, filters: defaultInventoryLedgerPanelFilters, showToast: true });
    setToast("库存流水筛选已重置。");
  }

  function handleLedgerFilterKeyDown(event) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    applyLedgerFilters();
  }

  async function createCorrectionDraft() {
    if (correctionState.disabled) {
      setToast(correctionState.title);
      return;
    }
    const actualQty = correctionActual === "" ? selected.inStock : Number(correctionActual || 0);
    if (actualQty < 0) {
      setToast("实盘数量不能小于 0。");
      return;
    }
    const draft = await onCreateCorrectionDraft?.({ stock: selected, actualQty, reason: correctionReason });
    if (draft) setCorrectionDraft(draft);
  }

  return (
    <section className="page-grid split-detail">
      <div className="table-pane">
        <div className="inventory-filter-panel">
          <div className="toolbar-line">
            <label className="search small">
              <SearchOutlined />
              <input placeholder="尺寸 / 颜色 / 提手 / 款式 / 库区" value={filters.query} onChange={(event) => updateFilter("query", event.target.value)} />
            </label>
            <button className="ghost-button" onClick={() => setShowPending((value) => !value)}>{showPending ? "隐藏待处理" : "展开待处理"}</button>
            <button className="ghost-button" onClick={resetFilters}>重置</button>
          </div>
          <div className="filter-grid inventory-filter-grid">
            {[
              ["size", "尺寸", uniqueStockOptions(inventoryRecords, "size")],
              ["color", "颜色", uniqueStockOptions(inventoryRecords, "color")],
              ["handle", "提手", uniqueStockOptions(inventoryRecords, "handle")],
              ["style", "款式", uniqueStockOptions(inventoryRecords, "style")],
            ].map(([field, label, options]) => (
              <label key={field}>
                <span>{label}</span>
                <select value={filters[field]} onChange={(event) => updateFilter(field, event.target.value)}>
                  <option>全部</option>
                  {options.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
            ))}
            <label>
              <span>状态</span>
              <select value={filters.state} onChange={(event) => updateFilter("state", event.target.value)}>
                {["默认可用", "全部", "可用", "已占用", "待提货锁定", "缺货", "待处理"].map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label>
              <span>可信度</span>
              <select value={filters.trust} onChange={(event) => updateFilter("trust", event.target.value)}>
                {["全部", "已清点", "估算/待复核"].map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
          </div>
          <div className="filter-summary">
            <span>
              命中 {visible.length} / {inventoryRecords.length} 个库存键；{getInventoryListSourceLabel(inventoryMeta)}。
            </span>
            <span>{includePending ? "已包含待处理库存，仅供查看" : "待处理库存已折叠"}</span>
          </div>
          {inventoryMeta.error && <p className="panel-warning">{inventoryMeta.error}</p>}
        </div>
        <MetricStrip items={stats} />
        <DataTable
          className="inventory-table"
          columns={["尺寸", "颜色", "提手", "款式", "库区", "状态", "在库", "占用", "锁定", "待处", "可用", "可信"]}
          rows={visible.map((row) => {
            const available = availableQty(row);
            return {
              id: row.id,
              active: row.id === selected.id,
              tone: getStockTone(row),
              onClick: () => setSelectedStockId(row.id),
              cells: [row.size, row.color, row.handle, row.style, row.zone, <StatusPill tone={getStockStateTone(getStockStateGroup(row))}>{getStockStateGroup(row)}</StatusPill>, row.inStock, row.reserved, row.locked, row.pending, available, getStockTrustLabel(row)],
            };
          })}
        />
      </div>
      <DetailPane title="库存明细" subtitle={`${selected.size} ${selected.color} ${selected.handle} ${selected.style}`}>
        <InfoGrid
          rows={[
            ["精确库存键", `${formatStockKey(selected)} / ${selected.zone}`],
            ["状态/可信度", `${getStockStateGroup(selected)} / ${getStockTrustLabel(selected)}`],
            ["在库/占用/锁定", `${selected.inStock} / ${selected.reserved} / ${selected.locked}`],
            ["可用库存", `${available} 个`],
            ["来源摘要", selected.estimated ? "估算库存 / 待复核" : selected.state],
            ["待处理", `${selected.pending} 个`],
          ]}
        />
        <section className="detail-section inventory-ledger-section">
          <div className="inventory-ledger-head">
            <div>
              <h3>库存流水</h3>
              <p>
                {inventoryLedgerMeta.loading
                  ? "正在读取库存变动历史"
                  : inventoryLedgerMeta.lastSyncedAt
                    ? `${getInventoryLedgerSourceLabel(inventoryLedgerMeta.source)} · ${inventoryLedgerMeta.total ?? selectedLedgerEntries.length} 条 · ${inventoryLedgerMeta.lastSyncedAt}`
                    : "按当前库存键读取真实变动来源"}
              </p>
            </div>
            <button
              className="ghost-button"
              disabled={inventoryLedgerMeta.loading}
              onClick={() => onRefreshInventoryLedger?.({ stockId: selected.id, filters: ledgerFilters, showToast: true })}
            >
              刷新流水
            </button>
          </div>
          <div className="inventory-ledger-filters">
            <label className="inventory-ledger-filter-keyword">
              <span>关键词</span>
              <input
                placeholder="流水号 / 来源单号 / 操作人"
                value={ledgerFilters.keyword}
                onChange={(event) => updateLedgerFilter("keyword", event.target.value)}
                onKeyDown={handleLedgerFilterKeyDown}
              />
            </label>
            <label>
              <span>变动</span>
              <select value={ledgerFilters.changeType} onChange={(event) => updateLedgerFilter("changeType", event.target.value)}>
                {inventoryLedgerChangeTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>
              <span>来源</span>
              <select value={ledgerFilters.sourceType} onChange={(event) => updateLedgerFilter("sourceType", event.target.value)}>
                {inventoryLedgerSourceTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>
              <span>起始</span>
              <input type="date" value={ledgerFilters.dateFrom} onChange={(event) => updateLedgerFilter("dateFrom", event.target.value)} />
            </label>
            <label>
              <span>截止</span>
              <input type="date" value={ledgerFilters.dateTo} onChange={(event) => updateLedgerFilter("dateTo", event.target.value)} />
            </label>
            <div className="inventory-ledger-filter-actions">
              <button type="button" disabled={inventoryLedgerMeta.loading} onClick={() => applyLedgerFilters()}>
                <SearchOutlined /> 筛选
              </button>
              <button type="button" disabled={inventoryLedgerMeta.loading} onClick={resetLedgerFilters}>重置</button>
            </div>
          </div>
          <p className="inventory-ledger-filter-summary">
            {getInventoryLedgerFilterSummary(ledgerFilters)}
          </p>
          {inventoryLedgerMeta.error ? (
            <p className="ledger-message danger">{inventoryLedgerMeta.error}</p>
          ) : inventoryLedgerMeta.loading ? (
            <p className="ledger-message">正在加载库存流水。</p>
          ) : selectedLedgerEntries.length ? (
            <div className="inventory-ledger-list">
              {selectedLedgerEntries.map((entry) => (
                <div className="inventory-ledger-row" key={entry.ledgerId}>
                  <div>
                    <StatusPill tone={getInventoryLedgerTone(entry)}>{getInventoryLedgerChangeLabel(entry.changeType)}</StatusPill>
                    <strong>数量 {formatInventoryLedgerQty(entry.qtyChange)}</strong>
                    <span>库存 {entry.qtyBefore} → {entry.qtyAfter}</span>
                  </div>
                  <p className="inventory-ledger-source">
                    <span>{getInventoryLedgerSourceText(entry)}</span>
                    <button
                      type="button"
                      disabled={!entry.sourceId}
                      onClick={() => onLocateInventoryLedgerSource?.(entry)}
                    >
                      {getInventoryLedgerLocateLabel(entry)}
                    </button>
                  </p>
                  <small>{entry.ledgerId} · {formatInventoryLedgerTime(entry.occurredAt || entry.createdAt)} · {entry.operatorName || entry.operatorId || "操作人待确认"}</small>
                </div>
              ))}
            </div>
          ) : (
            <p className="ledger-message">当前库存键暂无流水记录；确认订单占用、出库、释放占用或库存修正确认后会写入。</p>
          )}
        </section>
        {(inventoryCorrectionDetailState.loading || inventoryCorrectionDetailState.error || inventoryCorrectionDetailState.detail) && (
          <section className="detail-section inventory-correction-detail-section">
            <div className="inventory-correction-detail-head">
              <div>
                <h3>库存修正详情</h3>
                <p>
                  {inventoryCorrectionDetailState.loading
                    ? "正在读取修正记录"
                    : inventoryCorrectionDetailState.lastSyncedAt
                      ? `${getInventoryCorrectionDetailSourceLabel(inventoryCorrectionDetailState.source)} · ${inventoryCorrectionDetailState.lastSyncedAt}`
                      : "从库存流水打开的修正记录"}
                </p>
              </div>
              {inventoryCorrectionDetailState.detail?.status && (
                <StatusPill tone={getInventoryCorrectionStatusTone(inventoryCorrectionDetailState.detail.status)}>
                  {inventoryCorrectionDetailState.detail.status}
                </StatusPill>
              )}
            </div>
            {inventoryCorrectionDetailState.error ? (
              <p className="ledger-message danger">{inventoryCorrectionDetailState.error}</p>
            ) : inventoryCorrectionDetailState.loading ? (
              <p className="ledger-message">正在加载库存修正详情。</p>
            ) : inventoryCorrectionDetailState.detail ? (
              <InventoryCorrectionDetail detail={inventoryCorrectionDetailState.detail} />
            ) : null}
          </section>
        )}
        <section className="detail-section inventory-correction-queue-section">
          <div className="inventory-correction-detail-head">
            <div>
              <h3>库存修正确认队列</h3>
              <p>
                {inventoryCorrectionQueueState.loading
                  ? "正在读取待确认修正"
                  : inventoryCorrectionQueueState.lastSyncedAt
                    ? `${getInventoryCorrectionQueueSourceLabel(inventoryCorrectionQueueState.source)} · ${inventoryCorrectionQueueState.total ?? correctionQueueItems.length} 条 · ${inventoryCorrectionQueueState.lastSyncedAt}`
                    : "发起草稿后由有确认权限账号处理"}
              </p>
            </div>
            <button
              className="ghost-button"
              disabled={inventoryCorrectionQueueState.loading}
              onClick={() => onRefreshCorrectionQueue?.({ showToast: true })}
            >
              刷新队列
            </button>
          </div>
          {inventoryCorrectionQueueState.error ? (
            <p className="ledger-message danger">{inventoryCorrectionQueueState.error}</p>
          ) : inventoryCorrectionQueueState.loading ? (
            <p className="ledger-message">正在加载库存修正确认队列。</p>
          ) : correctionQueueItems.length ? (
            <div className="inventory-correction-queue-list">
              {correctionQueueItems.map((item) => {
                const draftId = item.correctionDraftId || item.id;
                const disabledReason =
                  item.status !== "待确认生效"
                    ? "只有待确认生效的修正草稿可以确认。"
                    : correctionConfirmState.disabled
                      ? correctionConfirmState.title
                      : "";
                const confirming = inventoryCorrectionQueueState.confirmingId === draftId;
                return (
                  <div className="inventory-correction-queue-row" key={draftId}>
                    <div>
                      <StatusPill tone={getInventoryCorrectionStatusTone(item.status)}>{item.status}</StatusPill>
                      <strong>{draftId}</strong>
                      <span>{item.stockKey || item.inventoryItemId}{item.zone ? ` / ${item.zone}` : ""}</span>
                    </div>
                    <p>
                      系统 {item.systemQty} → 实盘 {item.actualQty}，差异 {formatInventoryLedgerQty(item.diff)}；{item.reason || "原因待确认"}
                    </p>
                    <small>{item.operatorName || item.operatorId || "发起人待确认"} · {formatInventoryCorrectionTime(item.createdAt)}</small>
                    <div className="inventory-correction-queue-actions">
                      <button type="button" onClick={() => onOpenCorrectionDraft?.(draftId)}>查看详情</button>
                      <button
                        type="button"
                        disabled={Boolean(disabledReason) || confirming}
                        title={disabledReason || ""}
                        onClick={() => onConfirmCorrectionDraft?.(item)}
                      >
                        {confirming ? "确认中" : "确认生效"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="ledger-message">暂无待确认库存修正草稿。</p>
          )}
        </section>
        <section className={shortage > 0 ? "detail-section alert" : "detail-section"}>
          <h3>缺货判断</h3>
          <div className="inline-form-row">
            <label>
              <span>客户要货数量</span>
              <input type="number" min="0" value={requestQty} onChange={(event) => setRequestQty(Number(event.target.value || 0))} />
            </label>
          </div>
          <p>{shortage > 0 ? `当前缺口 ${shortage} 个；建议先确认客户是否等生产、先发可用数量，或改数量/颜色/款式。` : `当前可用 ${available} 个，可满足本次查询数量。正式承诺客户前仍需重新校验。`}</p>
        </section>
        <section className="detail-section">
          <h3>参考提示</h3>
          {similarStocks.length ? (
            <ul className="reference-list">
              {similarStocks.map((item) => (
                <li key={item.id}>{item.color} / {item.zone} / 可用 {availableQty(item)} 个 / {getStockTrustLabel(item)}</li>
              ))}
            </ul>
          ) : (
            <p>没有同尺寸、同提手、同款式的可用参考库存。</p>
          )}
          <p>近似颜色/尺寸只作参考；不能一键替代，也不能自动生成有货话术。</p>
        </section>
        <section className="detail-section">
          <h3>客户话术</h3>
          <p>{customerText}</p>
        </section>
        <section className="detail-section">
          <h3>库存修正草稿</h3>
          <div className="detail-form">
            <label>
              <span>系统在库</span>
              <input value={selected.inStock} readOnly />
            </label>
            <label>
              <span>实盘数量</span>
              <input type="number" min="0" placeholder={`${selected.inStock}`} value={correctionActual} onChange={(event) => setCorrectionActual(event.target.value)} />
            </label>
            <label>
              <span>差异原因</span>
              <select value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)}>
                {["盘点差异", "找不到货", "包装/标签问题", "车间报数需复核", "待处理转报废", "其他"].map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
          </div>
          {correctionDraft && (
            <div className="correction-draft">
              <StatusPill tone="warning">{correctionDraft.status}</StatusPill>
              <strong>{correctionDraft.id}</strong>
              <p>{correctionDraft.stockKey} / {correctionDraft.zone}：系统 {correctionDraft.systemQty}，实盘 {correctionDraft.actualQty}，差异 {correctionDraft.diff}；{correctionDraft.reason}</p>
            </div>
          )}
        </section>
        <div className="action-row">
          <button className="primary-action" disabled={correctionState.disabled} title={correctionState.title} onClick={createCorrectionDraft}>生成修正草稿</button>
          <button onClick={() => setToast(`已复制客户话术：${customerText}`)}>复制客户话术</button>
        </div>
      </DetailPane>
    </section>
  );
}

function normalizeInventoryLedgerPanelFilters(filters = {}) {
  return {
    keyword: String(filters.keyword ?? "").trim(),
    changeType: String(filters.changeType ?? "全部").trim() || "全部",
    sourceType: String(filters.sourceType ?? "全部").trim() || "全部",
    dateFrom: String(filters.dateFrom ?? "").trim(),
    dateTo: String(filters.dateTo ?? "").trim(),
  };
}

function getInventoryLedgerFilterSummary(filters = {}) {
  const normalized = normalizeInventoryLedgerPanelFilters(filters);
  const labels = [];
  if (normalized.keyword) labels.push(`关键词 ${normalized.keyword}`);
  if (normalized.changeType !== "全部") labels.push(getInventoryLedgerChangeLabel(normalized.changeType));
  if (normalized.sourceType !== "全部") labels.push(getInventoryLedgerSourceTypeLabel(normalized.sourceType));
  if (normalized.dateFrom || normalized.dateTo) {
    labels.push(`${normalized.dateFrom || "开始"} 至 ${normalized.dateTo || "今天"}`);
  }
  return labels.length ? `筛选：${labels.join(" / ")}` : "筛选：全部流水";
}

function getInventoryLedgerSourceTypeLabel(value) {
  const found = inventoryLedgerSourceTypeOptions.find((option) => option.value === value);
  return found?.label ?? value;
}

function InventoryCorrectionDetail({ detail }) {
  const operatorText = detail.operatorName || detail.operatorId || "发起人待确认";
  const confirmedText = detail.confirmedByName || detail.confirmedBy || (detail.status === "已确认生效" ? "确认人待确认" : "未确认");
  return (
    <div className="inventory-correction-detail">
      <InfoGrid
        rows={[
          ["修正单号", detail.correctionDraftId],
          ["库存键", `${detail.stockKey || detail.inventoryItemId || "库存键待确认"}${detail.zone ? ` / ${detail.zone}` : ""}`],
          ["修正数量", `系统 ${detail.systemQty} → 实盘 ${detail.actualQty}，差异 ${formatInventoryLedgerQty(detail.diff)}`],
          ["原因/备注", [detail.reason, detail.remark].filter(Boolean).join("；") || "未填写"],
          ["发起/确认", `${operatorText} / ${confirmedText}`],
          ["时间", `${formatInventoryCorrectionTime(detail.createdAt)} / ${formatInventoryCorrectionTime(detail.confirmedAt || detail.updatedAt)}`],
        ]}
      />
      {detail.ledger && (
        <div className="inventory-correction-ledger">
          <span>关联流水</span>
          <strong>{detail.ledger.ledgerId}</strong>
          <small>{getInventoryLedgerChangeLabel(detail.ledger.changeType)} · 库存 {detail.ledger.qtyBefore} → {detail.ledger.qtyAfter}</small>
        </div>
      )}
      {detail.operationLogs?.length ? (
        <div className="inventory-correction-audit">
          {detail.operationLogs.map((log) => (
            <div className="inventory-correction-audit-row" key={log.operationLogId || log.id}>
              <span>{getInventoryCorrectionOperationLabel(log.action)}</span>
              <strong>{log.operatorId || "操作人待确认"}</strong>
              <small>{formatInventoryCorrectionTime(log.createdAt)}{log.reason ? ` · ${log.reason}` : ""}</small>
            </div>
          ))}
        </div>
      ) : (
        <p className="ledger-message">暂无可展示的操作记录。</p>
      )}
    </div>
  );
}

function getInventoryLedgerTone(entry) {
  const qtyChange = Number(entry?.qtyChange ?? 0);
  if (qtyChange > 0) return "success";
  if (qtyChange < 0) return "danger";
  return "neutral";
}

function formatInventoryLedgerQty(value) {
  const qty = Number(value ?? 0);
  if (!Number.isFinite(qty)) return "0";
  if (qty > 0) return `+${qty}`;
  return String(qty);
}

function getInventoryLedgerSourceText(entry) {
  const type = String(entry?.sourceType ?? "").trim();
  const id = String(entry?.sourceId ?? "").trim();
  const labels = {
    inventory_correction: "库存修正",
    inventory_reservation: "库存占用",
    inventory_reservation_release: "释放占用",
    order_confirm: "订单确认",
    order_line: "订单明细",
    order_line_quantity_adjustment: "订单改量",
    order_line_void: "订单作废",
    fulfillment_complete: "完成出库",
    fulfillment_complete_legacy: "旧单出库扣减",
    fulfillment_pickup: "确认拉走",
    fulfillment_pickup_legacy: "旧单确认拉走",
    fulfillment_cancel: "取消出库",
    production_report: "生产报工",
    production_report_reservation: "生产占用",
    packing_complete: "打包完成",
  };
  const typeLabel = labels[type] || type || "来源待确认";
  return id ? `${typeLabel} · ${id}` : typeLabel;
}

function getInventoryLedgerLocateLabel(entry) {
  const type = String(entry?.sourceType ?? "").trim();
  if (!entry?.sourceId) return "无来源";
  if (["fulfillment_complete", "fulfillment_complete_legacy", "fulfillment_pickup", "fulfillment_pickup_legacy", "fulfillment_cancel"].includes(type)) {
    return "定位出库";
  }
  if (["order_confirm", "order_line", "order_line_quantity_adjustment", "order_line_void", "inventory_reservation", "inventory_reservation_release"].includes(type)) {
    return "定位订单";
  }
  if (["production_report", "production_report_reservation", "packing_complete"].includes(type)) return "打开打包";
  if (type === "inventory_correction") return "查看修正";
  return "定位来源";
}

function getInventoryLedgerChangeLabel(value) {
  const type = String(value ?? "").trim();
  const labels = {
    correction: "库存修正",
    reservation: "库存占用",
    release: "释放占用",
    outbound: "出库扣减",
    return: "退回入库",
    pending_handling: "转待处理",
    订单占用: "订单占用",
    释放占用: "释放占用",
    出库扣减: "出库扣减",
    生产入库: "生产入库",
    生产完成占用: "生产占用",
    打包完成确认: "打包完成",
    取消出库释放占用: "取消出库",
    订单改量释放占用: "改量释放",
    订单改量补占用: "改量补占",
  };
  return labels[type] || type || "库存变动";
}

function getInventoryLedgerSourceLabel(source) {
  if (source === "api") return "后端 API";
  if (source === "local_fallback") return "本地降级";
  if (source === "api_error") return "后端返回错误";
  return "本地演示";
}

function getInventoryListSourceLabel(meta = {}) {
  if (meta.loading) return "库存列表同步中";
  const source = meta.source;
  const synced = meta.lastSyncedAt ? ` · ${meta.lastSyncedAt}` : "";
  if (source === "api") return `后端库存列表${synced}`;
  if (source === "local_fallback") return `本地库存降级${synced}`;
  if (source === "api_error") return "后端库存列表返回错误";
  return "本地库存演示";
}

function getInventoryCorrectionDetailSourceLabel(source) {
  if (source === "api") return "后端修正详情";
  if (source === "local_fallback") return "本地修正降级";
  if (source === "api_error") return "后端返回错误";
  return "修正详情";
}

function getInventoryCorrectionQueueSourceLabel(source) {
  if (source === "api") return "后端确认队列";
  if (source === "local_fallback") return "本地修正队列";
  if (source === "api_error") return "后端返回错误";
  return "确认队列";
}

function getInventoryCorrectionStatusTone(status) {
  const text = String(status ?? "");
  if (text.includes("待")) return "warning";
  if (text.includes("已确认")) return "success";
  if (text.includes("作废") || text.includes("拒绝")) return "neutral";
  return "warning";
}

function getInventoryCorrectionOperationLabel(action) {
  const labels = {
    create_inventory_correction_draft: "发起修正",
    confirm_inventory_correction_draft: "确认生效",
  };
  return labels[action] || action || "操作记录";
}

const rawMaterialInboundTabs = ["入库单", "待贴标", "机边领料", "供应商对账"];

export function RawMaterialInboundPage({
  inbounds = [],
  meta = {},
  productionTasks = [],
  statementReviews = [],
  statementReviewMeta = {},
  selectedId,
  setSelectedId,
  onAction,
  onStatementReviewDraftCreate,
  onStatementReviewConfirm,
  onStatementConfirm,
  onPayableDraftGenerate,
  onPaymentConfirm,
  helpers = {},
}) {
  const { getUiActionState = () => ({ disabled: false, title: "" }), money = (value) => `¥${value}` } = helpers;
  const [activeTab, setActiveTab] = useState(rawMaterialInboundTabs[0]);
  const [keyword, setKeyword] = useState("");
  const [statementImport, setStatementImport] = useState(null);
  const [statementImportLoading, setStatementImportLoading] = useState(false);
  const [statementReviewSaving, setStatementReviewSaving] = useState(false);
  const records = filterRawMaterialInboundsByTab(inbounds, activeTab);
  const visibleRecords = filterRawMaterialInboundsByKeyword(records, keyword);
  const selected = visibleRecords.find((item) => item.id === selectedId) ?? records.find((item) => item.id === selectedId) ?? visibleRecords[0] ?? records[0] ?? null;
  const costState = getUiActionState("rawMaterial", "查看成本");
  const canViewCost = !costState.disabled;
  const reviewState = getUiActionState("rawMaterial", "复核送货单");
  const printState = getUiActionState("rawMaterial", "打印卷标");
  const attachState = getUiActionState("rawMaterial", "确认贴标入库");
  const issueState = getUiActionState("rawMaterial", "机边领料");
  const consumptionState = getUiActionState("rawMaterial", "确认消耗");
  const leftoverState = getUiActionState("rawMaterial", "余料退回");
  const leftoverReviewState = getUiActionState("rawMaterial", "复核余料可用");
  const exceptionState = getUiActionState("rawMaterial", "标记异常");
  const costDraftState = getUiActionState("rawMaterial", "生成成本草稿");
  const costConfirmState = getUiActionState("rawMaterial", "确认成本草稿");
  const lossCalibrationState = getUiActionState("rawMaterial", "校准损耗");
  const marginSnapshotState = getUiActionState("rawMaterial", "生成毛利快照");
  const marginReviewState = getUiActionState("rawMaterial", "复核毛利快照");
  const payableState = getUiActionState("rawMaterial", "生成应付");
  const paymentState = getUiActionState("rawMaterial", "确认付款");
  const metrics = buildRawMaterialInboundMetrics(inbounds);

  useEffect(() => {
    if (!selected) return;
    if (selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected?.id, selectedId, setSelectedId]);

  function changeTab(tab) {
    setActiveTab(tab);
    setKeyword("");
  }

  async function handleSupplierStatementImport(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setStatementImportLoading(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await precheckRawMaterialSupplierStatementWorkbook({
        bytes,
        fileName: file.name,
        supplierName: selected?.supplierName,
        existingInbounds: inbounds,
      });
      setStatementImport(result);
    } catch (error) {
      setStatementImport({
        summary: {
          status: "blocked",
          statusLabel: "无法识别",
          rowCount: 0,
          matchedRowCount: 0,
          candidateRowCount: 0,
          unmatchedRowCount: 0,
          adjustmentCount: 0,
          totalWeightKg: 0,
          totalAmount: 0,
        },
        adapter: { label: "供应商 Excel" },
        fileName: file.name,
        recommendedAction: "Excel 无法读取，请确认是 .xlsx 文件，或先另存后重新上传。",
        rows: [],
        adjustments: [],
        issues: [{
          severity: "error",
          severityLabel: "阻断",
          message: error?.message || String(error),
        }],
      });
    } finally {
      setStatementImportLoading(false);
    }
  }

  async function handleSaveSupplierStatementReviewDraft() {
    if (!statementImport || statementReviewSaving) return;
    setStatementReviewSaving(true);
    try {
      const saved = await onStatementReviewDraftCreate?.(statementImport, {
        supplierName: selected?.supplierName || statementImport.supplierName,
        fileName: statementImport.fileName,
        note: "办公室保存供应商月结 Excel 预检结果，等待人工复核。",
      });
      if (saved?.reviewId) {
        setStatementImport((current) => ({
          ...(current ?? {}),
          savedReviewId: saved.reviewId,
        }));
      }
    } finally {
      setStatementReviewSaving(false);
    }
  }

  function handleConfirmSupplierStatementReview(reviewId, decision) {
    onStatementReviewConfirm?.(reviewId, {
      decision,
      note: "办公室在原材料页标记月结复核草稿状态；不生成应付或付款。",
    });
  }

  function handleConfirmSupplierStatement(reviewId) {
    onStatementConfirm?.(reviewId, {
      note: "办公室确认供应商月结对账一致；只进入待财务付款确认，不直接付款。",
    });
  }

  function handleGenerateSupplierPayableDraft(reviewId) {
    onPayableDraftGenerate?.(reviewId, {
      note: "财务基于已确认供应商月结生成应付草稿；付款仍需另行确认。",
    });
  }

  function handleConfirmSupplierPayment(review) {
    onPaymentConfirm?.(review.reviewId, {
      paidAmount: review.supplierPayableDraft?.payableAmount,
      paymentMethod: "银行转账",
      note: "财务确认供应商应付草稿已实际付款；只记录付款确认，不写原材料库存。",
    });
  }

  return (
    <section className="page-grid split-detail raw-material-inbound-page">
      <div className="table-pane">
        <div className="raw-material-inbound-head">
          <div>
            <Segmented value={activeTab} onChange={changeTab} items={rawMaterialInboundTabs} />
            <span>原材料送货单 OCR 仅预填；供应商单号有则录、无则空，ERP 入库单号和卷号统一生成；打印标签只是待贴标。</span>
            <span>{getRawMaterialInboundSourceLabel(meta)}</span>
          </div>
          <button className="ghost-button" onClick={() => setKeyword("")}>重置</button>
        </div>
        <div className="inventory-filter-panel">
          <div className="toolbar-line">
            <label className="search small">
              <SearchOutlined />
              <input placeholder="搜索供应商 / 供应商单号 / ERP 入库单 / 原料 / 颜色 / 批号" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
            </label>
          </div>
          <div className="filter-summary">
            <span>命中 {visibleRecords.length} / {records.length} 条；成本和单价只给有权限账号查看。</span>
            <span>{activeTab} · 原材料入库</span>
          </div>
        </div>
        <MetricStrip items={metrics} />
        <DataTable
          className="raw-material-inbound-table"
          columns={["供应商", "外部/内部单号", "原料", "规格/颜色", "卷/重量", "状态", "下一步"]}
          rows={visibleRecords.map((item) => ({
            id: item.id,
            active: item.id === selected?.id,
            tone: getRawMaterialInboundTone(item.status),
            onClick: () => setSelectedId(item.id),
            cells: [
              item.supplierName,
              formatRawMaterialDeliveryNoteNo(item),
              item.productName || item.materialType,
              `${item.spec} / ${item.factoryColor || item.supplierColor}`,
              `${item.rollCount || item.rolls?.length || 0}${item.materialType === "提手" ? "件" : "卷"} / ${formatRawMaterialWeight(item)}`,
              item.status,
              item.nextStep,
            ],
          }))}
        />
      </div>
      <DetailPane
        title={selected ? `${selected.supplierName} · ${formatRawMaterialDeliveryNoteNo(selected)}` : "原材料入库"}
        subtitle={selected ? `${selected.status} · ${selected.source}` : "原材料送货单 OCR / 一卷一标"}
      >
        {selected ? (
          <>
            <InfoGrid
              rows={[
                ["原料", `${selected.productName || selected.materialType} / ${selected.materialType}`],
                ["外部/内部单号", formatRawMaterialDeliveryNoteNo(selected)],
                ["规格颜色", `${selected.spec} / ${selected.supplierColor} -> ${selected.factoryColor}`],
                ["卷/件数", `${selected.rollCount || selected.rolls?.length || 0}`],
                ["重量/单位", `${formatRawMaterialWeight(selected)} / ${selected.unit || "未填"}`],
                ["单价/金额", canViewCost ? formatRawMaterialCost(selected, money) : "成本权限可见"],
                ["库位", selected.location || "待分配"],
                ["OCR", selected.ocrStatus || "待识别"],
                ["签单", selected.signedNoteStatus || "待上传"],
              ]}
            />
            <section className="detail-section">
              <h3>入库动作</h3>
              <p>OCR 仅预填字段；供应商原始单号有则录、没有就留空，内部统一用 ERP 入库单号和卷号追踪；人工复核、打印卷标和贴标扫码是三个独立状态，不能跳过贴标扫码直接形成可用原材料库存。</p>
              <div className="action-row raw-material-actions">
                <button
                  className="primary-action"
                  disabled={reviewState.disabled || !canReviewRawMaterialInbound(selected)}
                  title={reviewState.title || (!canReviewRawMaterialInbound(selected) ? "当前状态无需复核" : "")}
                  onClick={() => onAction?.("复核送货单", selected.id)}
                >
                  复核送货单
                </button>
                <button
                  disabled={printState.disabled || !canPrintRawMaterialLabels(selected)}
                  title={printState.title || (!canPrintRawMaterialLabels(selected) ? "先完成送货单复核" : "")}
                  onClick={() => onAction?.("打印卷标", selected.id)}
                >
                  打印卷标
                </button>
                <button
                  disabled={attachState.disabled || !canConfirmRawMaterialAttachment(selected)}
                  title={attachState.title || (!canConfirmRawMaterialAttachment(selected) ? "先打印卷标并贴到实物" : "")}
                  onClick={() => onAction?.("确认贴标入库", selected.id)}
                >
                  确认全部贴标
                </button>
                <button
                  disabled={issueState.disabled || !canIssueRawMaterialToMachine(selected)}
                  title={issueState.title || (!canIssueRawMaterialToMachine(selected) ? "只有已贴标扫码可用的卷/件才能机边领料" : "")}
                  onClick={() => onAction?.("机边领料", selected.id, buildRawMaterialIssueOptions(selected, null, productionTasks))}
                >
                  全部机边领料
                </button>
                <button
                  disabled={exceptionState.disabled || selected.status === "入库异常/待确认"}
                  title={exceptionState.title || ""}
                  onClick={() => onAction?.("标记异常", selected.id, { reason: "页面手工标记异常。" })}
                >
                  标记异常
                </button>
                <button
                  disabled={costDraftState.disabled || !canGenerateRawMaterialCostDraft(selected)}
                  title={costDraftState.title || (!canGenerateRawMaterialCostDraft(selected) ? "需先确认消耗，且领料记录必须已匹配生产任务" : "")}
                  onClick={() => onAction?.("生成成本草稿", selected.id, { note: "V1 生成原材料成本分摊草稿；仍需成本/管理复核。" })}
                >
                  生成成本草稿
                </button>
                <button
                  disabled={costConfirmState.disabled || !canConfirmRawMaterialCostDraft(selected)}
                  title={costConfirmState.title || (!canConfirmRawMaterialCostDraft(selected) ? "需先生成待复核成本草稿" : "")}
                  onClick={() => onAction?.("确认成本草稿", selected.id, { note: "V1 复核确认原材料成本快照；损耗和毛利仍走独立流程。" })}
                >
                  确认成本草稿
                </button>
                <button
                  disabled={lossCalibrationState.disabled || !canCalibrateRawMaterialLoss(selected)}
                  title={lossCalibrationState.title || (!canCalibrateRawMaterialLoss(selected) ? "需先确认成本草稿，且不能重复校准损耗" : "")}
                  onClick={() => onAction?.("校准损耗", selected.id, buildRawMaterialLossCalibrationOptions(selected))}
                >
                  校准损耗
                </button>
                <button
                  disabled={marginSnapshotState.disabled || !canGenerateRawMaterialMarginSnapshot(selected)}
                  title={marginSnapshotState.title || (!canGenerateRawMaterialMarginSnapshot(selected) ? "需先完成损耗校准，且不能重复生成毛利快照" : "")}
                  onClick={() => onAction?.("生成毛利快照", selected.id, buildRawMaterialMarginSnapshotOptions(selected))}
                >
                  生成毛利快照
                </button>
                <button
                  disabled={marginReviewState.disabled || !canReviewRawMaterialMarginSnapshot(selected)}
                  title={marginReviewState.title || (!canReviewRawMaterialMarginSnapshot(selected) ? "需先生成毛利快照，且订单收入必须完整、不能重复复核" : "")}
                  onClick={() => onAction?.("复核毛利快照", selected.id, buildRawMaterialMarginReviewOptions(selected))}
                >
                  复核毛利快照
                </button>
              </div>
            </section>
            <section className="detail-section">
              <h3>卷/件标签</h3>
              <div className="raw-material-roll-list">
                {(selected.rolls ?? []).map((roll) => {
                  const canAttachRoll = roll.labelStatus === "已打印待贴标" && roll.inventoryStatus !== "可用";
                  const canIssueRoll = canIssueRawMaterialRoll(roll);
                  const canPartialIssueRoll = canIssueRoll && Number(roll.weightKg || 0) > 0;
                  const canConfirmConsumption = canConfirmRawMaterialConsumptionRoll(roll);
                  const canPartialConsumeRoll = canConfirmConsumption && Number(roll.weightKg || 0) > 0;
                  const canReturnLeftover = canReturnRawMaterialLeftoverRoll(roll);
                  const canReviewLeftover = canReviewRawMaterialLeftoverRoll(roll);
                  return (
                    <div className="raw-material-roll-row" key={roll.id}>
                      <div>
                        <strong>{roll.id}</strong>
                        <span>{roll.supplierRollNo} / {roll.weightKg ? `${roll.weightKg}kg` : selected.unit || "件"}</span>
                      </div>
                      <StatusPill tone={getRawMaterialRollTone(roll)}>{roll.labelStatus} / {roll.inventoryStatus || "不可用"}</StatusPill>
                      <span>{roll.location || "待分配"}</span>
                      <span>{roll.consumptionStatus || roll.signedNoteStatus || "待扫码/签单"}</span>
                      <button
                        disabled={attachState.disabled || !canAttachRoll}
                        title={attachState.title || (!canAttachRoll ? "该卷/件还未到可贴标确认状态" : "")}
                        onClick={() => onAction?.("确认贴标入库", selected.id, { rollId: roll.id })}
                      >
                        贴标确认
                      </button>
                      <button
                        disabled={issueState.disabled || !canIssueRoll}
                        title={issueState.title || (!canIssueRoll ? "该卷/件还不是可用库存，或已经领到机边" : "")}
                        onClick={() => onAction?.("机边领料", selected.id, buildRawMaterialIssueOptions(selected, roll, productionTasks))}
                      >
                        机边领料
                      </button>
                      <button
                        disabled={issueState.disabled || !canPartialIssueRoll}
                        title={issueState.title || (!canPartialIssueRoll ? "只有有重量的可用卷料才能拆卷部分领料" : "")}
                        onClick={() => onAction?.("机边领料", selected.id, buildRawMaterialPartialIssueOptions(selected, roll, productionTasks))}
                      >
                        部分领料
                      </button>
                      <button
                        disabled={consumptionState.disabled || !canConfirmConsumption}
                        title={consumptionState.title || (!canConfirmConsumption ? "只有机边领用且待消耗确认的卷/件才能确认消耗" : "")}
                        onClick={() => onAction?.("确认消耗", selected.id, buildRawMaterialConsumptionOptions(selected, roll))}
                      >
                        确认消耗
                      </button>
                      <button
                        disabled={consumptionState.disabled || !canPartialConsumeRoll}
                        title={consumptionState.title || (!canPartialConsumeRoll ? "只有有重量的机边卷料才能登记部分消耗" : "")}
                        onClick={() => onAction?.("确认消耗", selected.id, buildRawMaterialPartialConsumptionOptions(selected, roll))}
                      >
                        部分消耗
                      </button>
                      <button
                        disabled={leftoverState.disabled || !canReturnLeftover}
                        title={leftoverState.title || (!canReturnLeftover ? "只有机边领用的卷/件才能退回余料" : "")}
                        onClick={() => onAction?.("余料退回", selected.id, buildRawMaterialLeftoverReturnOptions(selected, roll))}
                      >
                        余料退回
                      </button>
                      <button
                        disabled={leftoverReviewState.disabled || !canReviewLeftover}
                        title={leftoverReviewState.title || (!canReviewLeftover ? "只有余料待复核的卷/件才能复核转可用" : "")}
                        onClick={() => onAction?.("复核余料可用", selected.id, buildRawMaterialLeftoverReviewOptions(selected, roll))}
                      >
                        复核余料
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
            <section className="detail-section">
              <h3>机边领料 / 消耗</h3>
              <InfoGrid
                rows={[
                  ["领料状态", selected.issueStatus || (selected.rawMaterialIssueRecords?.length ? "部分领料/机边" : "未领料")],
                  ["机台/任务", `${selected.machineId || "未分配"} / ${selected.productionTaskId || "未关联生产任务"}`],
                  ["任务匹配", formatRawMaterialTaskMatch(selected)],
                  ["领料记录", `${selected.rawMaterialIssueRecords?.length || 0}`],
                  ["拆卷记录", `${selected.rawMaterialSplitRecords?.length || 0}`],
                  ["消耗确认", `${selected.rawMaterialConsumptionRecords?.length || 0}`],
                  ["余料退回", `${selected.rawMaterialLeftoverReturnRecords?.length || 0}`],
                  ["余料复核", `${selected.rawMaterialLeftoverReviewRecords?.length || 0}`],
                  ["成本草稿", formatRawMaterialCostDraftSummary(selected, canViewCost, money)],
                  ["成本确认", formatRawMaterialCostConfirmationSummary(selected, canViewCost, money)],
                  ["损耗校准", formatRawMaterialLossCalibrationSummary(selected, canViewCost, money)],
                  ["毛利快照", formatRawMaterialMarginSnapshotSummary(selected, canViewCost, money)],
                  ["毛利报表", formatRawMaterialMarginReportSummary(selected, canViewCost, money)],
                ]}
              />
              <div className="supplier-statement-note-list">
                {(selected.rawMaterialIssueRecords ?? []).slice(0, 4).map((record) => (
                  <span key={record.issueRecordId}>{formatRawMaterialIssueRecord(record)}</span>
                ))}
                {(selected.rawMaterialSplitRecords ?? []).slice(0, 4).map((record) => (
                  <span key={record.splitRecordId}>{formatRawMaterialSplitRecord(record)}</span>
                ))}
                {(selected.rawMaterialConsumptionRecords ?? []).slice(0, 4).map((record) => (
                  <span key={record.consumptionRecordId}>{formatRawMaterialConsumptionRecord(record)}</span>
                ))}
                {(selected.rawMaterialLeftoverReturnRecords ?? []).slice(0, 4).map((record) => (
                  <span key={record.leftoverReturnRecordId}>{formatRawMaterialLeftoverReturnRecord(record)}</span>
                ))}
                {(selected.rawMaterialLeftoverReviewRecords ?? []).slice(0, 4).map((record) => (
                  <span key={record.leftoverReviewRecordId}>{formatRawMaterialLeftoverReviewRecord(record)}</span>
                ))}
                {(selected.rawMaterialCostAllocationDrafts ?? []).slice(0, 4).map((record) => (
                  <span key={record.costAllocationDraftId}>{formatRawMaterialCostAllocationDraft(record, canViewCost, money)}</span>
                ))}
                {(selected.rawMaterialCostAllocationConfirmations ?? []).slice(0, 3).map((record) => (
                  <span key={record.costConfirmationId}>{formatRawMaterialCostAllocationConfirmation(record, canViewCost, money)}</span>
                ))}
                {(selected.rawMaterialCostLossCalibrations ?? []).slice(0, 3).map((record) => (
                  <span key={record.lossCalibrationId}>{formatRawMaterialCostLossCalibration(record, canViewCost, money)}</span>
                ))}
                {(selected.rawMaterialOrderMarginSnapshots ?? []).slice(0, 3).map((record) => (
                  <span key={record.marginSnapshotId}>{formatRawMaterialOrderMarginSnapshot(record, canViewCost, money)}</span>
                ))}
                {(selected.rawMaterialOrderMarginReports ?? []).slice(0, 3).map((record) => (
                  <span key={record.marginReportId}>{formatRawMaterialOrderMarginReport(record, canViewCost, money)}</span>
                ))}
                {(selected.rawMaterialCostAllocationWarnings ?? []).slice(0, 3).map((warning) => (
                  <span key={warning}>成本草稿提示：{warning}</span>
                ))}
                {!(
                  (selected.rawMaterialIssueRecords ?? []).length ||
                  (selected.rawMaterialSplitRecords ?? []).length ||
                  (selected.rawMaterialConsumptionRecords ?? []).length ||
                  (selected.rawMaterialLeftoverReturnRecords ?? []).length ||
                  (selected.rawMaterialLeftoverReviewRecords ?? []).length ||
                  (selected.rawMaterialCostAllocationDrafts ?? []).length ||
                  (selected.rawMaterialCostAllocationConfirmations ?? []).length ||
                  (selected.rawMaterialCostLossCalibrations ?? []).length ||
                  (selected.rawMaterialOrderMarginSnapshots ?? []).length ||
                  (selected.rawMaterialOrderMarginReports ?? []).length
                ) ? <span>暂无机边领料 / 消耗 / 余料记录。</span> : null}
              </div>
            </section>
            <section className="detail-section">
              <h3>供应商对账</h3>
              <InfoGrid
                rows={[
                  ["月结状态", selected.statementStatus || "待上传"],
                  ["匹配摘要", selected.statementSummary || "等待供应商月结 Excel"],
                  ["差异项", (selected.statementDifferences ?? []).join(" / ") || "暂无"],
                ]}
              />
              <p>供应商月结对账只确认 ERP 入库记录和供应商 Excel 是否一致；确认对账不等于付款，付款仍走财务对账收款流程。</p>
              <div className="raw-material-statement-import">
                <div className="toolbar-line">
                  <label className="file-upload-button">
                    上传月结 Excel
                    <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleSupplierStatementImport} />
                  </label>
                  <span>{statementImportLoading ? "正在识别供应商月结单..." : "支持白侯重1-重5、北陈批号明细和通用字段预检查。"}</span>
                </div>
                {statementImport ? (
                  <SupplierStatementImportPreview
                    result={statementImport}
                    onSaveDraft={handleSaveSupplierStatementReviewDraft}
                    saving={statementReviewSaving}
                  />
                ) : null}
                <SupplierStatementReviewList
                  reviews={statementReviews}
                  meta={statementReviewMeta}
                  onConfirm={handleConfirmSupplierStatementReview}
                  onStatementConfirm={handleConfirmSupplierStatement}
                  onPayableDraftGenerate={handleGenerateSupplierPayableDraft}
                  onPaymentConfirm={handleConfirmSupplierPayment}
                  payableState={payableState}
                  paymentState={paymentState}
                  money={money}
                />
              </div>
            </section>
            <section className="detail-section">
              <h3>流程记录</h3>
              <Timeline items={buildRawMaterialInboundTimeline(selected)} />
            </section>
          </>
        ) : (
          <div className="empty-row">暂无原材料入库单。</div>
        )}
      </DetailPane>
    </section>
  );
}

function SupplierStatementImportPreview({ result = {}, onSaveDraft, saving = false }) {
  const summary = result.summary ?? {};
  const rows = Array.isArray(result.rows) ? result.rows.slice(0, 6) : [];
  const adjustments = Array.isArray(result.adjustments) ? result.adjustments.slice(0, 3) : [];
  const issues = Array.isArray(result.issues) ? result.issues.slice(0, 3) : [];
  const canSave = typeof onSaveDraft === "function" && !result.savedReviewId;
  return (
    <div className="supplier-statement-preview">
      <div className="supplier-statement-preview-head">
        <div>
          <strong>{result.fileName || "供应商月结 Excel"}</strong>
          <span>{result.adapter?.label || "模板待识别"} · {result.recommendedAction || "等待人工复核。"}</span>
        </div>
        <StatusPill tone={getSupplierStatementStatusTone(summary.status)}>{summary.statusLabel || "待识别"}</StatusPill>
      </div>
      <InfoGrid
        rows={[
          ["明细", `${summary.rowCount || 0} 行；匹配 ${summary.matchedRowCount || 0} / 候选 ${summary.candidateRowCount || 0} / 未匹配 ${summary.unmatchedRowCount || 0}`],
          ["退货/调整", `${summary.returnRowCount || 0} 行退货；${summary.adjustmentCount || 0} 个 footer 调整项`],
          ["重量/金额", `${summary.totalWeightKg || 0}kg / ¥${summary.totalAmount || 0}`],
        ]}
      />
      <div className="supplier-statement-review-actions">
        <span>{result.savedReviewId ? `已保存复核草稿：${result.savedReviewId}` : "预检结果可保存为人工复核草稿；不会写库存、应付或付款。"}</span>
        <button
          className="primary-action"
          disabled={!canSave || saving}
          title={result.savedReviewId ? "该预检结果已保存为复核草稿" : ""}
          onClick={onSaveDraft}
        >
          {saving ? "保存中" : "保存复核草稿"}
        </button>
      </div>
      {rows.length ? (
        <div className="supplier-statement-row-list">
          {rows.map((row) => (
            <div className="supplier-statement-row" key={row.id}>
              <div>
                <strong>{row.documentNo || row.batchNo || row.productName || "未命名单据行"}</strong>
                <span>{row.productName || row.spec || "品名待补"} / {row.color || "颜色待补"} / {row.rollLabel || row.batchNo || "卷号待补"}</span>
              </div>
              <span>{row.totalWeightKg ?? row.rollWeightKg ?? "-"}kg</span>
              <span>¥{row.amount ?? "-"}</span>
              <StatusPill tone={row.matchingStatus === "matched" ? "success" : row.matchingStatus === "candidate" ? "warning" : "danger"}>
                {row.matchingStatus === "matched" ? "已匹配" : row.matchingStatus === "candidate" ? "候选匹配" : "未匹配"}
              </StatusPill>
            </div>
          ))}
        </div>
      ) : null}
      {adjustments.length ? (
        <div className="supplier-statement-note-list">
          {adjustments.map((item) => (
            <span key={item.id}>{formatSupplierStatementAdjustment(item)}</span>
          ))}
        </div>
      ) : null}
      {issues.length ? (
        <div className="supplier-statement-issues">
          {issues.map((issue, index) => (
            <span key={`${issue.severity}-${issue.row || index}`}>{issue.severityLabel || "提示"}：{issue.message}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function formatSupplierStatementAdjustment(item = {}) {
  const typeLabel = item.typeLabel || (item.adjustmentType === "paper_tube_deduction" ? "纸管扣项" : "调整项");
  const amountText = item.amount != null ? `¥${formatSupplierAdjustmentNumber(item.amount)}` : "金额待确认";
  const formulaText = item.calculationBasis?.formulaText ? ` · ${item.calculationBasis.formulaText}` : "";
  const reportedText =
    item.supplierReportedAmount != null && item.supplierReportedAmount !== item.amount
      ? ` · 供应商原金额 ¥${formatSupplierAdjustmentNumber(item.supplierReportedAmount)}`
      : "";
  const scopeText = item.isCurrentPeriod === false ? " · 仅参考不进本期应付" : " · 进入本期复核";
  return `${typeLabel}：${amountText}${formulaText}${reportedText}${scopeText}`;
}

function formatSupplierAdjustmentNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? "-");
  return number.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function SupplierStatementReviewList({
  reviews = [],
  meta = {},
  onConfirm,
  onStatementConfirm,
  onPayableDraftGenerate,
  onPaymentConfirm,
  payableState = {},
  paymentState = {},
  money = (value) => `¥${value}`,
}) {
  const recent = reviews.slice(0, 5);
  return (
    <div className="supplier-statement-review-list">
      <div className="supplier-statement-review-list-head">
        <strong>月结复核草稿</strong>
        <span>{getSupplierStatementReviewSourceLabel(meta)}</span>
      </div>
      {recent.length ? (
        recent.map((review) => {
          const isDraft = review.reviewStatus === "draft";
          const canConfirmStatement =
            review.reviewStatus === "reviewed" && String(review.status ?? "").includes("一致") && !review.statementConfirmationId;
          const canGeneratePayable =
            review.reviewStatus === "statement_confirmed" && review.statementConfirmationId && !review.supplierPayableId;
          const canConfirmPayment =
            review.supplierPayableId &&
            review.supplierPayableDraft &&
            review.paymentStatus !== "已确认付款" &&
            !review.supplierPaymentConfirmationId;
          return (
            <div className="supplier-statement-review-row" key={review.reviewId}>
              <div>
                <strong>{review.reviewId}</strong>
                <span>{review.supplierName || "供应商待补"} / {review.fileName || "文件名待补"}</span>
                <span>{review.summaryText || "等待复核摘要"}</span>
                {Array.isArray(review.adjustments) && review.adjustments.length ? (
                  <span>{formatSupplierStatementAdjustment(review.adjustments[0])}</span>
                ) : null}
                {review.statementConfirmationId ? (
                  <span>{review.statementConfirmationId} / {review.paymentStatus || "待财务付款确认"}</span>
                ) : null}
                {review.supplierPayableId ? (
                  <span>
                    {review.supplierPayableId} / {review.payableStatus || "待财务复核"} / {formatSupplierPayableAmount(review.supplierPayableDraft?.payableAmount ?? 0, money)}
                  </span>
                ) : null}
                {review.supplierPaymentConfirmationId ? (
                  <span>
                    {review.supplierPaymentConfirmationId} / 已确认付款 / {formatSupplierPayableAmount(review.supplierPaymentRecord?.paidAmount ?? 0, money)}
                  </span>
                ) : null}
              </div>
              <StatusPill tone={getSupplierStatementReviewTone(review.status)}>{review.status || "待人工复核"}</StatusPill>
              <div className="action-row compact-actions">
                <button disabled={!isDraft} onClick={() => onConfirm?.(review.reviewId, "一致")}>标记一致</button>
                <button disabled={!isDraft} onClick={() => onConfirm?.(review.reviewId, "有差异")}>标记有差异</button>
                <button disabled={!canConfirmStatement} onClick={() => onStatementConfirm?.(review.reviewId)}>确认对账</button>
                <button
                  disabled={!canGeneratePayable || payableState.disabled}
                  title={payableState.disabled ? payableState.title : (!canGeneratePayable ? "需先确认对账且不能重复生成应付" : "")}
                  onClick={() => onPayableDraftGenerate?.(review.reviewId)}
                >
                  生成应付
                </button>
                <button
                  disabled={!canConfirmPayment || paymentState.disabled}
                  title={paymentState.disabled ? paymentState.title : (!canConfirmPayment ? "需先生成应付草稿且不能重复确认付款" : "")}
                  onClick={() => onPaymentConfirm?.(review)}
                >
                  确认付款
                </button>
              </div>
            </div>
          );
        })
      ) : (
        <div className="empty-row">暂无已保存的供应商月结复核草稿。</div>
      )}
    </div>
  );
}

function canGenerateRawMaterialCostDraft(item = {}) {
  const existingConsumptionIds = new Set((item.rawMaterialCostAllocationDrafts ?? []).map((record) => record.consumptionRecordId).filter(Boolean));
  return (item.rawMaterialConsumptionRecords ?? []).some((record) => {
    if (existingConsumptionIds.has(record.consumptionRecordId)) return false;
    const issueRecord = (item.rawMaterialIssueRecords ?? []).find((issue) => issue.issueRecordId === record.issueRecordId)
      || (item.rawMaterialIssueRecords ?? []).find((issue) => issue.rollId === record.rollId);
    return Boolean(issueRecord?.productionTaskId && issueRecord?.productionTaskMatchStatus === "已匹配");
  });
}

function canConfirmRawMaterialCostDraft(item = {}) {
  return (item.rawMaterialCostAllocationDrafts ?? []).some((record) => !record.costConfirmationId && record.allocationStatus !== "已复核/待损耗校准");
}

function canCalibrateRawMaterialLoss(item = {}) {
  const calibratedConfirmationIds = new Set(
    (item.rawMaterialCostLossCalibrations ?? [])
      .flatMap((record) => [record.costConfirmationId, ...(record.costConfirmationIds ?? [])])
      .filter(Boolean),
  );
  return (item.rawMaterialCostAllocationConfirmations ?? []).some(
    (record) => !calibratedConfirmationIds.has(record.costConfirmationId) && record.lossCalibrationStatus !== "已校准/待毛利确认",
  );
}

function canGenerateRawMaterialMarginSnapshot(item = {}) {
  const snapshottedCalibrationIds = new Set(
    (item.rawMaterialOrderMarginSnapshots ?? []).flatMap((record) => record.lossCalibrationIds ?? []).filter(Boolean),
  );
  return (item.rawMaterialCostLossCalibrations ?? []).some(
    (record) => !snapshottedCalibrationIds.has(record.lossCalibrationId) && record.marginEffect !== "margin_snapshot_pending_review",
  );
}

function canReviewRawMaterialMarginSnapshot(item = {}) {
  const reportedSnapshotIds = new Set(
    (item.rawMaterialOrderMarginReports ?? []).flatMap((record) => record.marginSnapshotIds ?? []).filter(Boolean),
  );
  return (item.rawMaterialOrderMarginSnapshots ?? []).some((record) => {
    if (reportedSnapshotIds.has(record.marginSnapshotId)) return false;
    if (record.marginEffect === "reviewed_margin_report_snapshot" || record.reviewStatus === "已财务复核/报表可用") return false;
    const missingRevenue = (record.lineItems ?? []).some(
      (line) => Number(line.salesAmount || 0) <= 0 || line.marginStatus === "需补订单收入",
    );
    return !missingRevenue && !(record.warnings ?? []).some((warning) => String(warning).includes("缺少订单销售金额"));
  });
}

function buildRawMaterialIssueOptions(item = {}, roll = null, productionTasks = []) {
  const targetTask = findRawMaterialProductionTaskCandidate(item, productionTasks);
  const machineId = targetTask?.machineId || (item.materialType === "提手" ? "提手备料区" : "BAG-01");
  return {
    rollId: roll?.id,
    machineId,
    productionTaskId: targetTask?.productionTaskId || "",
    issuePurpose: "生产领料",
    issuedWeightKg: roll?.weightKg || undefined,
    issuedQuantity: roll && !roll.weightKg ? 1 : undefined,
    note: targetTask?.productionTaskId
      ? `V1 按生产任务 ${targetTask.productionTaskId} 领料；等待生产报工确认消耗，不生成成品数量或成本分摊。`
      : "V1 整卷/整件机边领料；未匹配生产任务时只允许先形成机边留痕，成本分摊前必须补关联。",
  };
}

function buildRawMaterialPartialIssueOptions(item = {}, roll = null, productionTasks = []) {
  const targetTask = findRawMaterialProductionTaskCandidate(item, productionTasks);
  const machineId = targetTask?.machineId || (item.materialType === "提手" ? "提手备料区" : "BAG-01");
  const fullWeight = Number(roll?.weightKg || 0);
  const issuedWeightKg = fullWeight > 0 ? Math.max(0.001, Math.round((fullWeight / 2) * 1000) / 1000) : undefined;
  return {
    rollId: roll?.id,
    machineId,
    productionTaskId: targetTask?.productionTaskId || "",
    issuePurpose: "生产领料",
    issuedWeightKg,
    partialIssue: true,
    note: targetTask?.productionTaskId
      ? `V1 按生产任务 ${targetTask.productionTaskId} 拆卷部分领料；剩余重量保留可用，等待后续称重复核和成本流程。`
      : "V1 拆卷部分领料；未匹配生产任务时只允许先形成机边留痕，成本分摊前必须补关联。",
  };
}

function findRawMaterialProductionTaskCandidate(item = {}, productionTasks = []) {
  if (item.materialType === "提手") return null;
  const materialColorKey = normalizeRawMaterialColorKey(item.factoryColor || item.supplierColor);
  const rows = (Array.isArray(productionTasks) ? productionTasks : [])
    .filter((task) => task?.productionTaskId)
    .filter((task) => {
      const taskType = String(task.taskType || task.productionTask?.taskType || "");
      if (taskType.includes("丝印")) return false;
      const taskColorKey = normalizeRawMaterialColorKey(task.bagColor || task.color || task.orderLine?.bagColor);
      return !materialColorKey || !taskColorKey || materialColorKey === taskColorKey;
    })
    .sort((left, right) => {
      const leftPublished = left.publishedScheduleId ? 0 : 1;
      const rightPublished = right.publishedScheduleId ? 0 : 1;
      if (leftPublished !== rightPublished) return leftPublished - rightPublished;
      return String(left.productionTaskId).localeCompare(String(right.productionTaskId));
    });
  return rows[0] || null;
}

function normalizeRawMaterialColorKey(value) {
  const text = String(value || "")
    .trim()
    .replace(/本白/g, "白")
    .replace(/大红/g, "红")
    .replace(/浅黄/g, "黄")
    .replace(/深黄/g, "黄")
    .replace(/色/g, "")
    .replace(/\s+/g, "");
  if (!text) return "";
  const hit = ["白", "黑", "红", "黄", "蓝", "绿", "灰", "粉", "紫", "橙"].find((token) => text.includes(token));
  return hit || text;
}

function buildRawMaterialConsumptionOptions(item = {}, roll = null) {
  return {
    rollId: roll?.id,
    machineId: roll?.machineId || item.machineId || (item.materialType === "提手" ? "提手备料区" : "制袋机-01"),
    productionTaskId: roll?.productionTaskId || item.productionTaskId || "",
    consumedWeightKg: roll?.weightKg || undefined,
    consumedQuantity: roll && !roll.weightKg ? 1 : undefined,
    machineCount: "",
    qualifiedOutputQuantity: 0,
    note: "V1 只确认整卷/整件消耗；机台计数只作动作证据，不生成成品数量或成本分摊。",
  };
}

function buildRawMaterialPartialConsumptionOptions(item = {}, roll = null) {
  const machineSideWeight = Number(roll?.weightKg || roll?.remainingMachineSideWeightKg || 0);
  const consumedWeightKg = machineSideWeight > 0 ? Math.max(0.001, Math.round((machineSideWeight / 2) * 1000) / 1000) : undefined;
  return {
    rollId: roll?.id,
    machineId: roll?.machineId || item.machineId || (item.materialType === "提手" ? "提手备料区" : "制袋机-01"),
    productionTaskId: roll?.productionTaskId || item.productionTaskId || "",
    consumedWeightKg,
    machineCount: "",
    qualifiedOutputQuantity: 0,
    partialConsumption: true,
    note: "V1 记录机边部分消耗，剩余重量仍在机边；机台计数只作动作证据，不生成成品数量或成本分摊。",
  };
}

function buildRawMaterialLeftoverReturnOptions(item = {}, roll = null) {
  return {
    rollId: roll?.id,
    machineId: roll?.machineId || item.machineId || (item.materialType === "提手" ? "提手备料区" : "制袋机-01"),
    productionTaskId: roll?.productionTaskId || item.productionTaskId || "",
    leftoverWeightKg: roll?.weightKg || undefined,
    leftoverQuantity: roll && !roll.weightKg ? 1 : undefined,
    returnLocation: "余料区",
    reason: "机边余料退回",
    note: "V1 余料退回先进入待复核，不自动变可用库存，不做成本分摊。",
  };
}

function buildRawMaterialLeftoverReviewOptions(_item = {}, roll = null) {
  const reviewedWeightKg = Number(roll?.leftoverWeightKg) || Number(roll?.weightKg) || undefined;
  return {
    rollId: roll?.id,
    reviewedWeightKg,
    reviewedQuantity: roll && !reviewedWeightKg ? Number(roll.leftoverQuantity || 1) : undefined,
    reviewLocation: "原料库-余料可用区",
    reason: "余料重新称重复核通过",
    note: "V1 余料复核只把退回余料转回可用原材料库存，不做成本分摊或毛利计算。",
  };
}

function buildRawMaterialLossCalibrationOptions(item = {}) {
  const latestConfirmation = [...(item.rawMaterialCostAllocationConfirmations ?? [])].reverse()[0] ?? {};
  const expectedOutputQuantity = Number(latestConfirmation.confirmedQuantity || 0) || 1000;
  const actualQualifiedOutputQuantity = Math.max(0, Math.round(expectedOutputQuantity * 0.98));
  return {
    expectedOutputQuantity,
    actualQualifiedOutputQuantity,
    note: "V1 损耗校准第一版；先形成待毛利确认的成本校准快照，不自动更新订单毛利。",
  };
}

function buildRawMaterialMarginSnapshotOptions() {
  return {
    note: "V1 订单毛利快照第一版；只供财务复核，不自动写客户对账或最终结算。",
  };
}

function buildRawMaterialMarginReviewOptions() {
  return {
    note: "V1 毛利快照财务复核第一版；生成内部毛利报表，不自动写客户对账或收款结算。",
  };
}

function getRawMaterialRollTone(roll = {}) {
  if (roll.inventoryStatus === "可用") return "success";
  if (roll.inventoryStatus === "机边领用") return "warning";
  if (roll.inventoryStatus === "已消耗") return "success";
  if (roll.inventoryStatus === "余料待复核") return "warning";
  if (roll.leftoverReviewRecordId) return "success";
  if (String(roll.inventoryStatus ?? "").includes("异常")) return "danger";
  return "neutral";
}

function formatRawMaterialWeight(item = {}) {
  const weight = Number(item.totalWeightKg || 0);
  if (!weight) return item.unit === "件" ? `${item.rollCount || item.rolls?.length || 0}件` : "未填重量";
  return `${weight}kg`;
}

function formatRawMaterialCost(item = {}, money) {
  const unitPrice = Number(item.unitPrice || 0);
  const amount = Number(item.amount || 0);
  const unit = item.unit || "单位";
  return `${money(unitPrice)}/${unit} / ${money(amount)}`;
}

function buildRawMaterialInboundTimeline(item = {}) {
  const rows = [
    `${item.receivedAt || "到货时间未填"} 原材料送货单拍照${item.deliveryNoteNo ? "" : "（供应商未提供单号）"}`,
    item.ocrStatus || "OCR 待识别",
  ];
  if (item.reviewedAt) rows.push(`${formatRawMaterialTimelineTime(item.reviewedAt)} ${item.reviewedBy || "办公室"}复核原材料送货单`);
  if (item.labelPrintedAt) rows.push(`${formatRawMaterialTimelineTime(item.labelPrintedAt)} ${item.labelPrintedBy || "库房"}打印卷标`);
  const attached = (item.rolls ?? []).filter((roll) => roll.inventoryStatus === "可用");
  if (attached.length) rows.push(`已贴标扫码 ${attached.length}/${item.rolls?.length || attached.length} 卷/件`);
  const split = (item.rawMaterialSplitRecords ?? []).length;
  if (split) rows.push(`已拆卷部分领料 ${split} 次；剩余重量仍保留库存状态`);
  const issued = (item.rawMaterialIssueRecords ?? []).length;
  if (issued) rows.push(`已机边领料 ${issued} 卷/件；等待生产报工确认消耗`);
  const consumed = (item.rawMaterialConsumptionRecords ?? []).length;
  if (consumed) rows.push(`已确认消耗 ${consumed} 卷/件；仍不生成成品数量或成本分摊`);
  const returned = (item.rawMaterialLeftoverReturnRecords ?? []).length;
  if (returned) rows.push(`已退回余料 ${returned} 卷/件；等待重新称重 / 复核`);
  const leftoverReviewed = (item.rawMaterialLeftoverReviewRecords ?? []).length;
  if (leftoverReviewed) rows.push(`余料复核通过 ${leftoverReviewed} 卷/件；已转回可用库存`);
  const lossCalibrations = (item.rawMaterialCostLossCalibrations ?? []).length;
  if (lossCalibrations) rows.push(`损耗校准 ${lossCalibrations} 次；仍需毛利报表确认`);
  const marginSnapshots = (item.rawMaterialOrderMarginSnapshots ?? []).length;
  if (marginSnapshots) rows.push(`毛利快照 ${marginSnapshots} 次；等待财务复核，不写最终结算`);
  const marginReports = (item.rawMaterialOrderMarginReports ?? []).length;
  if (marginReports) rows.push(`毛利报表 ${marginReports} 次；已财务复核，客户对账仍走独立流程`);
  rows.push(item.nextStep || "等待下一步");
  return rows;
}

function formatRawMaterialIssueRecord(record = {}) {
  const quantity = Number(record.issuedWeightKg) > 0 ? `${record.issuedWeightKg}kg` : `${record.issuedQuantity || 1}${record.unit || "件"}`;
  const splitText = record.splitRecordId ? ` / 源卷 ${record.sourceRollId || "待补"} / 剩余 ${record.remainingWeightKg || 0}kg` : "";
  const machineSideRemaining = Number(record.remainingMachineSideWeightKg || 0) > 0 ? ` / 机边余 ${record.remainingMachineSideWeightKg}kg` : "";
  const taskMatch = record.productionTaskMatchStatus ? ` / ${record.productionTaskMatchStatus}${record.productionTaskId ? ` ${record.productionTaskId}` : ""}` : "";
  return `${record.issueRecordId || "领料记录"}：${record.rollId || "卷号待补"} / ${quantity}${splitText}${machineSideRemaining} / ${record.machineId || "机边待分配"}${taskMatch} / ${record.consumptionStatus || "待生产消耗确认"}`;
}

function formatRawMaterialSplitRecord(record = {}) {
  const taskMatch = record.productionTaskMatchStatus ? ` / ${record.productionTaskMatchStatus}${record.productionTaskId ? ` ${record.productionTaskId}` : ""}` : "";
  return `${record.splitRecordId || "拆卷记录"}：${record.sourceRollId || "源卷待补"} -> ${record.issuedRollId || "机边卷待补"} / 领 ${record.issuedWeightKg || 0}kg / 余 ${record.remainingWeightKg || 0}kg / ${record.machineId || "机边待分配"}${taskMatch}`;
}

function formatRawMaterialTaskMatch(item = {}) {
  const latestIssueRecord = [...(item.rawMaterialIssueRecords ?? [])].reverse()[0] ?? null;
  const status = item.productionTaskMatchStatus || latestIssueRecord?.productionTaskMatchStatus || "未关联生产任务";
  const taskId = item.productionTaskId || latestIssueRecord?.productionTaskId || "";
  const reason = item.productionTaskMatchReason || latestIssueRecord?.productionTaskMatchReason || "";
  const goodsSpec = item.productionTaskGoodsSpec || latestIssueRecord?.productionTaskGoodsSpec || "";
  return [status, taskId, goodsSpec, reason].filter(Boolean).join(" / ");
}

function formatRawMaterialConsumptionRecord(record = {}) {
  const quantity = Number(record.consumedWeightKg) > 0 ? `${record.consumedWeightKg}kg` : `${record.consumedQuantity || 1}${record.unit || "件"}`;
  const remaining = Number(record.remainingMachineSideWeightKg || 0) > 0 ? ` / 机边余 ${record.remainingMachineSideWeightKg}kg` : "";
  return `${record.consumptionRecordId || "消耗记录"}：${record.rollId || "卷号待补"} / ${quantity}${remaining} / ${record.machineId || "机边待分配"} / ${record.consumptionStatus || "已确认消耗"}`;
}

function formatRawMaterialLeftoverReturnRecord(record = {}) {
  const quantity = Number(record.leftoverWeightKg) > 0 ? `${record.leftoverWeightKg}kg` : `${record.leftoverQuantity || 1}${record.unit || "件"}`;
  const status = record.reviewStatus || record.consumptionStatus || "待复核";
  return `${record.leftoverReturnRecordId || "余料记录"}：${record.rollId || "卷号待补"} / ${quantity} / ${record.returnLocation || "余料区"} / ${status}`;
}

function formatRawMaterialLeftoverReviewRecord(record = {}) {
  const quantity = Number(record.reviewedWeightKg) > 0 ? `${record.reviewedWeightKg}kg` : `${record.reviewedQuantity || 1}${record.unit || "件"}`;
  return `${record.leftoverReviewRecordId || "余料复核"}：${record.rollId || "卷号待补"} / ${quantity} / ${record.reviewLocation || "原料库-余料可用区"} / 可用`;
}

function formatRawMaterialCostDraftSummary(item = {}, canViewCost = false, money = (value) => `¥${value}`) {
  const count = item.rawMaterialCostAllocationDrafts?.length || item.costAllocationDraftCount || 0;
  if (!count) return "未生成";
  const status = item.costAllocationStatus || "成本草稿待复核";
  const amount = Number(item.costAllocationDraftAmount || 0);
  return canViewCost && amount > 0 ? `${status} / ${count} 条 / ${money(amount)}` : `${status} / ${count} 条`;
}

function formatRawMaterialCostConfirmationSummary(item = {}, canViewCost = false, money = (value) => `¥${value}`) {
  const count = item.rawMaterialCostAllocationConfirmations?.length || item.costAllocationConfirmedCount || 0;
  if (!count) return "未确认";
  const status = item.costAllocationReviewStatus || item.costAllocationStatus || "已复核/待损耗校准";
  const amount = Number(item.costAllocationConfirmedAmount || 0);
  return canViewCost && amount > 0 ? `${status} / ${count} 次 / ${money(amount)}` : `${status} / ${count} 次`;
}

function formatRawMaterialLossCalibrationSummary(item = {}, canViewCost = false, money = (value) => `¥${value}`) {
  const count = item.rawMaterialCostLossCalibrations?.length || item.lossCalibrationCount || 0;
  if (!count) return "待校准";
  const status = item.lossCalibrationStatus || item.costAllocationReviewStatus || "已校准/待毛利确认";
  const amount = Number(item.lossCalibrationAmount || 0);
  const rate = Number(item.lossCalibrationRatePercent || 0);
  const rateText = rate > 0 ? ` / 损耗 ${rate}%` : "";
  return canViewCost && amount > 0 ? `${status} / ${count} 次${rateText} / ${money(amount)}` : `${status} / ${count} 次${rateText}`;
}

function formatRawMaterialMarginSnapshotSummary(item = {}, canViewCost = false, money = (value) => `¥${value}`) {
  const count = item.rawMaterialOrderMarginSnapshots?.length || item.marginSnapshotCount || 0;
  if (!count) return "待生成";
  const status = item.marginSnapshotStatus || item.costAllocationReviewStatus || "已生成/待财务复核";
  const grossProfit = Number(item.marginSnapshotGrossProfitAmount || 0);
  const rate = Number(item.marginSnapshotGrossMarginRatePercent || 0);
  const rateText = rate ? ` / ${rate}%` : "";
  return canViewCost ? `${status} / ${count} 次 / 毛利 ${money(grossProfit)}${rateText}` : `${status} / ${count} 次`;
}

function formatRawMaterialMarginReportSummary(item = {}, canViewCost = false, money = (value) => `¥${value}`) {
  const count = item.rawMaterialOrderMarginReports?.length || item.marginReportCount || 0;
  if (!count) return "待复核";
  const status = item.marginReportStatus || item.costAllocationReviewStatus || "已生成内部毛利报表";
  const grossProfit = Number(item.marginReportGrossProfitAmount || item.marginSnapshotGrossProfitAmount || 0);
  const rate = Number(item.marginReportGrossMarginRatePercent || item.marginSnapshotGrossMarginRatePercent || 0);
  const rateText = rate ? ` / ${rate}%` : "";
  return canViewCost ? `${status} / ${count} 次 / 毛利 ${money(grossProfit)}${rateText}` : `${status} / ${count} 次`;
}

function formatRawMaterialCostAllocationDraft(record = {}, canViewCost = false, money = (value) => `¥${value}`) {
  const quantity = Number(record.allocatedWeightKg) > 0
    ? `${record.allocatedWeightKg}kg`
    : `${record.allocatedQuantity || 1}${record.unit || "件"}`;
  const amount = canViewCost ? ` / ${money(record.allocatedCostAmount || 0)}` : "";
  const task = record.productionTaskId ? ` / ${record.productionTaskId}` : "";
  const goods = record.productionTaskGoodsSpec ? ` / ${record.productionTaskGoodsSpec}` : "";
  return `${record.costAllocationDraftId || "成本草稿"}：${record.rollId || "卷号待补"} / ${quantity}${amount}${task}${goods} / ${record.allocationStatus || "草稿/待成本复核"}`;
}

function formatRawMaterialCostAllocationConfirmation(record = {}, canViewCost = false, money = (value) => `¥${value}`) {
  const quantity = Number(record.confirmedWeightKg) > 0
    ? `${record.confirmedWeightKg}kg`
    : `${record.confirmedQuantity || record.confirmedCount || 1}项`;
  const amount = canViewCost ? ` / ${money(record.confirmedCostAmount || 0)}` : "";
  const tasks = record.productionTaskIds?.length ? ` / ${record.productionTaskIds.join(",")}` : "";
  return `${record.costConfirmationId || "成本确认"}：${quantity}${amount}${tasks} / ${record.reviewStatus || "已复核/待损耗校准"}`;
}

function formatRawMaterialCostLossCalibration(record = {}, canViewCost = false, money = (value) => `¥${value}`) {
  const quantity = Number(record.actualQualifiedOutputQuantity || 0) > 0 && Number(record.expectedOutputQuantity || 0) > 0
    ? `${record.actualQualifiedOutputQuantity}/${record.expectedOutputQuantity} 合格`
    : `${record.confirmedWeightKg || record.confirmedCount || 1}项`;
  const amount = canViewCost ? ` / ${money(record.confirmedCostAmount || 0)}` : "";
  const rate = Number(record.lossRatePercent || 0) > 0 ? ` / 损耗 ${record.lossRatePercent}%` : "";
  const tasks = record.productionTaskIds?.length ? ` / ${record.productionTaskIds.join(",")}` : "";
  return `${record.lossCalibrationId || "损耗校准"}：${quantity}${amount}${rate}${tasks} / ${record.calibrationStatus || "已校准/待毛利确认"}`;
}

function formatRawMaterialOrderMarginSnapshot(record = {}, canViewCost = false, money = (value) => `¥${value}`) {
  const lineCount = record.lineItems?.length || record.orderLineIds?.length || 0;
  const amount = canViewCost
    ? ` / 收 ${money(record.totalSalesAmount || 0)} / 料 ${money(record.totalMaterialCostAmount || 0)} / 毛利 ${money(record.grossProfitAmount || 0)}`
    : "";
  const rate = canViewCost && Number(record.grossMarginRatePercent || 0) ? ` / ${record.grossMarginRatePercent}%` : "";
  const lines = record.orderLineIds?.length ? ` / ${record.orderLineIds.join(",")}` : "";
  return `${record.marginSnapshotId || "毛利快照"}：${lineCount || 1} 单${amount}${rate}${lines} / ${record.reviewStatus || "已生成/待财务复核"}`;
}

function formatRawMaterialOrderMarginReport(record = {}, canViewCost = false, money = (value) => `¥${value}`) {
  const lineCount = record.lineItems?.length || record.orderLineIds?.length || 0;
  const amount = canViewCost
    ? ` / 收 ${money(record.totalSalesAmount || 0)} / 料 ${money(record.totalMaterialCostAmount || 0)} / 毛利 ${money(record.grossProfitAmount || 0)}`
    : "";
  const rate = canViewCost && Number(record.grossMarginRatePercent || 0) ? ` / ${record.grossMarginRatePercent}%` : "";
  const snapshots = record.marginSnapshotIds?.length ? ` / 快照 ${record.marginSnapshotIds.join(",")}` : "";
  return `${record.marginReportId || "毛利报表"}：${lineCount || 1} 单${amount}${rate}${snapshots} / ${record.reviewStatus || "已财务复核/报表可用"}`;
}

function formatRawMaterialTimelineTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const masterDataMaintenanceTabs = ["客户档案", "价格表", "规格库存", "员工机台"];

export function MasterDataMaintenancePage({
  customers = [],
  orderLines = [],
  inventoryRecords = [],
  statements = [],
  employeeAccountReviews = [],
  importReviewDrafts = [],
  importExecutions = [],
  maintenanceDrafts = [],
  selectedTab,
  setSelectedTab,
  selectedId,
  setSelectedId,
  onSaveDraft,
  onOpenImportTemplate,
  helpers,
}) {
  const {
    availableQty,
    formatStockKey,
    getLineColorSpecLabel,
    getLinePrintSide,
    getLineRemark,
    getStockStateGroup,
    getStockStateTone,
    getStockTrustLabel,
    getUiActionState,
    money,
    seedUserOptions = [],
  } = helpers;
  const [keyword, setKeyword] = useState("");
  const [draftField, setDraftField] = useState("");
  const [draftValue, setDraftValue] = useState("");
  const [draftReason, setDraftReason] = useState("日常维护，待管理复核后通过导入确认流程写入。");
  const activeTab = masterDataMaintenanceTabs.includes(selectedTab) ? selectedTab : masterDataMaintenanceTabs[0];
  const records = buildMasterDataMaintenanceRecords({
    tab: activeTab,
    customers,
    orderLines,
    inventoryRecords,
    statements,
    employeeAccountReviews,
    seedUserOptions,
    helpers: { availableQty, formatStockKey, getLineColorSpecLabel, getLinePrintSide, getLineRemark, getStockStateGroup, getStockStateTone, getStockTrustLabel, money },
  });
  const visibleRecords = filterMasterDataMaintenanceRecords(records, keyword);
  const selected = visibleRecords.find((item) => item.id === selectedId) ?? records.find((item) => item.id === selectedId) ?? visibleRecords[0] ?? records[0] ?? null;
  const selectedField = selected?.fields.find((field) => field.key === draftField) ?? selected?.fields[0] ?? null;
  const draftState = getUiActionState("masterData", "生成维护草稿");
  const relatedDrafts = maintenanceDrafts
    .filter((draft) => draft.tab === activeTab && (!selected?.id || draft.recordId === selected.id))
    .slice(0, 4);
  const tabDrafts = maintenanceDrafts.filter((draft) => draft.tab === activeTab);
  const blockedExecutions = importExecutions.filter((execution) => String(execution.status ?? "").includes("failed") || String(execution.statusLabel ?? "").includes("失败"));
  const employeeReviewPending = employeeAccountReviews.filter(
    (review) => !review.accountEnabled || ["temporary_password_issued", "password_expired"].includes(review.passwordStatus),
  ).length;
  const stats = [
    ["当前资料", records.length, "blue"],
    ["维护草稿", tabDrafts.length, tabDrafts.length ? "warning" : "success"],
    ["导入草稿", importReviewDrafts.length, importReviewDrafts.length ? "blue" : "success"],
    ["待复核", employeeReviewPending + blockedExecutions.length, employeeReviewPending + blockedExecutions.length ? "warning" : "success"],
  ];

  useEffect(() => {
    if (!selected) return;
    if (selected.id !== selectedId) setSelectedId(selected.id);
    const firstField = selected.fields[0];
    if (!selected.fields.some((field) => field.key === draftField)) {
      setDraftField(firstField?.key ?? "");
      setDraftValue(String(firstField?.currentValue ?? ""));
    }
  }, [selected?.id, activeTab]);

  function changeTab(tab) {
    setSelectedTab(tab);
    setKeyword("");
  }

  function changeDraftField(fieldKey) {
    setDraftField(fieldKey);
    const field = selected?.fields.find((item) => item.key === fieldKey);
    setDraftValue(String(field?.currentValue ?? ""));
  }

  function saveDraft() {
    if (!selected || !selectedField) return;
    onSaveDraft?.({
      tab: activeTab,
      recordId: selected.id,
      recordLabel: selected.label,
      field: selectedField.key,
      fieldLabel: selectedField.label,
      nextValue: draftValue,
      reason: draftReason,
    });
  }

  return (
    <section className="page-grid split-detail master-data-maintenance-page">
      <div className="table-pane">
        <div className="master-data-maintenance-head">
          <div>
            <Segmented value={activeTab} onChange={changeTab} items={masterDataMaintenanceTabs} />
            <span>维护草稿不直接写库，复核后继续走导入确认计划和正式导入。</span>
          </div>
          <button className="ghost-button" onClick={() => onOpenImportTemplate?.(activeTab)}>导入模板</button>
        </div>
        <div className="inventory-filter-panel">
          <div className="toolbar-line">
            <label className="search small">
              <SearchOutlined />
              <input placeholder="搜索名称 / 尺寸 / 颜色 / 手机 / 单号" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
            </label>
            <button className="ghost-button" onClick={() => setKeyword("")}>重置</button>
          </div>
          <div className="filter-summary">
            <span>命中 {visibleRecords.length} / {records.length} 条；最近导入草稿 {importReviewDrafts.length} 条，执行记录 {importExecutions.length} 条。</span>
            <span>{activeTab} · 独立维护入口</span>
          </div>
        </div>
        <MetricStrip items={stats} />
        <DataTable
          className={`master-data-maintenance-table ${getMasterDataMaintenanceTableClass(activeTab)}`}
          columns={getMasterDataMaintenanceColumns(activeTab)}
          rows={visibleRecords.map((record) => ({
            id: record.id,
            active: record.id === selected?.id,
            tone: record.tone,
            onClick: () => setSelectedId(record.id),
            cells: record.cells,
          }))}
        />
      </div>
      <DetailPane title={selected?.label ?? "基础资料"} subtitle={selected ? `${activeTab} · ${selected.statusLabel}` : activeTab}>
        {selected ? (
          <>
            <InfoGrid rows={selected.detailRows} />
            <section className="detail-section">
              <h3>维护草稿</h3>
              <div className="detail-form">
                <label>
                  <span>维护字段</span>
                  <select value={draftField} onChange={(event) => changeDraftField(event.target.value)}>
                    {selected.fields.map((field) => (
                      <option key={field.key} value={field.key}>{field.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>当前值</span>
                  <input value={String(selectedField?.currentValue ?? "")} readOnly />
                </label>
                <label>
                  <span>建议改为</span>
                  <input value={draftValue} onChange={(event) => setDraftValue(event.target.value)} />
                </label>
                <label>
                  <span>原因 / 备注</span>
                  <textarea rows={3} value={draftReason} onChange={(event) => setDraftReason(event.target.value)} />
                </label>
              </div>
              <div className="action-row master-data-maintenance-actions">
                <button className="primary-action" disabled={draftState.disabled} title={draftState.title} onClick={saveDraft}>保存维护草稿</button>
                <button onClick={() => onOpenImportTemplate?.(activeTab)}>打开导入模板</button>
              </div>
            </section>
            <section className="detail-section">
              <h3>关联草稿</h3>
              {relatedDrafts.length ? (
                <div className="master-data-maintenance-drafts">
                  {relatedDrafts.map((draft) => (
                    <div className="master-data-maintenance-draft" key={draft.draftId}>
                      <StatusPill tone="warning">{draft.status}</StatusPill>
                      <strong>{draft.draftId} · {draft.fieldLabel}</strong>
                      <span>{draft.nextValue || "待补值"} / {draft.createdBy} / {formatMasterDataMaintenanceTime(draft.createdAt)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p>该记录暂无维护草稿；需要批量更新时优先使用导入模板。</p>
              )}
            </section>
            <section className="detail-section">
              <h3>复核边界</h3>
              <p>{selected.reviewRule}</p>
            </section>
          </>
        ) : (
          <div className="empty-row">当前没有可维护的基础资料。</div>
        )}
      </DetailPane>
    </section>
  );
}

function buildMasterDataMaintenanceRecords(input) {
  if (input.tab === "价格表") return buildMasterDataPriceRecords(input);
  if (input.tab === "规格库存") return buildMasterDataInventoryRecords(input);
  if (input.tab === "员工机台") return buildMasterDataEmployeeMachineRecords(input);
  return buildMasterDataCustomerRecords(input);
}

function buildMasterDataCustomerRecords({ customers = [], statements = [], helpers = {} }) {
  const money = helpers.money ?? ((value) => `¥${value}`);
  return customers.map((customer) => {
    const customerStatements = statements.filter((statement) => statement.customerId === customer.id);
    const pendingAmount = customerStatements.reduce((total, statement) => total + Number(statement.variance || 0), 0);
    const debt = Number(customer.debt || 0);
    const statusLabel = debt > 0 || pendingAmount > 0 ? "需财务关注" : "正常";
    return {
      id: customer.id,
      label: customer.name,
      statusLabel,
      tone: debt > 0 || pendingAmount > 0 ? "warning" : "success",
      cells: [customer.name, customer.cycle, customer.contact, customer.phone, money(debt), (customer.tags ?? []).join(" / ")],
      detailRows: [
        ["客户编号", customer.id],
        ["联系人", `${customer.contact} ${customer.phone}`],
        ["结算周期", customer.cycle],
        ["地址", customer.address],
        ["应收/欠款", `${money(customer.receivable || 0)} / ${money(debt)}`],
        ["最近对账", customer.lastStatement || "未记录"],
      ],
      fields: [
        { key: "cycle", label: "结算周期", currentValue: customer.cycle },
        { key: "contact", label: "联系人", currentValue: customer.contact },
        { key: "phone", label: "联系电话", currentValue: customer.phone },
        { key: "address", label: "地址", currentValue: customer.address },
        { key: "tags", label: "客户标签", currentValue: (customer.tags ?? []).join("，") },
      ],
      searchText: [customer.id, customer.name, customer.cycle, customer.contact, customer.phone, customer.address, ...(customer.tags ?? [])].join(" "),
      reviewRule: "客户资料影响接单、对账和欠款提醒，保存后先进入维护草稿；结算周期、收货地址和手机号变更需要办公室或管理复核。",
    };
  });
}

function buildMasterDataPriceRecords({ orderLines = [], customers = [], helpers = {} }) {
  const money = helpers.money ?? ((value) => `¥${value}`);
  const getLineColorSpecLabel = helpers.getLineColorSpecLabel ?? (() => "");
  const getLinePrintSide = helpers.getLinePrintSide ?? (() => "");
  const getLineRemark = helpers.getLineRemark ?? (() => "");
  return orderLines.map((line) => {
    const customer = customers.find((item) => item.id === line.customerId);
    const qty = Number(line.qty || line.originalQty || 0);
    const amount = Number(line.amount || 0);
    const unitPrice = qty > 0 ? amount / qty : 0;
    const printSide = getLinePrintSide(line) || (line.print === "是" ? "印刷" : "无印刷");
    const colorSpec = getLineColorSpecLabel(line) || [line.color, line.handle].filter(Boolean).join(" / ");
    const remark = getLineRemark(line);
    const label = `${line.product} ${line.size} ${colorSpec}`;
    return {
      id: `PRICE-${line.id}`,
      label,
      statusLabel: line.orderType || "订单快照",
      tone: line.orderType === "定制印刷" ? "warning" : "neutral",
      cells: [line.product, line.size, colorSpec, printSide, money(unitPrice), customer?.name ?? line.customerId, line.orderNo],
      detailRows: [
        ["来源订单", line.id],
        ["客户", customer?.name ?? line.customerId],
        ["品名/尺寸", `${line.product} / ${line.size}`],
        ["颜色/提手", colorSpec],
        ["单双面", printSide],
        ["参考单价", `${money(unitPrice)} / 个`],
      ],
      fields: [
        { key: "bagPrice", label: "袋子单价", currentValue: money(unitPrice) },
        { key: "printPrice", label: "印刷单价", currentValue: line.print === "是" ? "按订单快照复核" : "0" },
        { key: "customerScope", label: "客户范围", currentValue: customer?.name ?? "通用" },
        { key: "remark", label: "价格备注", currentValue: remark || line.orderType || "订单价格快照" },
      ],
      searchText: [line.id, line.orderNo, customer?.name, line.product, line.size, colorSpec, printSide, remark, line.orderType].join(" "),
      reviewRule: "价格资料直接影响订单金额和对账，应只保存为维护草稿；正式启用价格必须由管理复核，并通过确认计划记录价格版本。",
    };
  });
}

function buildMasterDataInventoryRecords({ inventoryRecords = [], helpers = {} }) {
  const availableQty = helpers.availableQty ?? ((item) => Number(item.inStock || 0) - Number(item.reserved || 0) - Number(item.locked || 0));
  const formatStockKey = helpers.formatStockKey ?? ((item) => [item.size, item.color, item.handle, item.style].filter(Boolean).join(" / "));
  const getStockStateGroup = helpers.getStockStateGroup ?? ((item) => item.state || "状态待确认");
  const getStockStateTone = helpers.getStockStateTone ?? (() => "neutral");
  const getStockTrustLabel = helpers.getStockTrustLabel ?? ((item) => item.estimated ? "估算/待复核" : "已清点");
  return inventoryRecords.map((stock) => {
    const stateLabel = getStockStateGroup(stock);
    const available = availableQty(stock);
    return {
      id: `STOCK-${stock.id}`,
      label: formatStockKey(stock),
      statusLabel: stateLabel,
      tone: getStockStateTone(stateLabel),
      cells: [stock.size, stock.color, stock.handle, stock.style, stock.zone, stateLabel, available],
      detailRows: [
        ["库存键", formatStockKey(stock)],
        ["库区", stock.zone],
        ["状态", stateLabel],
        ["在库/占用/锁定", `${stock.inStock} / ${stock.reserved} / ${stock.locked}`],
        ["待处理", `${stock.pending} 个`],
        ["可用/可信", `${available} / ${getStockTrustLabel(stock)}`],
      ],
      fields: [
        { key: "zone", label: "库区", currentValue: stock.zone },
        { key: "state", label: "库存状态", currentValue: stateLabel },
        { key: "safeStock", label: "安全库存", currentValue: "待设置" },
        { key: "trust", label: "可信度", currentValue: getStockTrustLabel(stock) },
      ],
      searchText: [stock.id, stock.size, stock.color, stock.handle, stock.style, stock.zone, stateLabel, getStockTrustLabel(stock)].join(" "),
      reviewRule: "规格库存主数据会影响识别匹配、可用库存和出库扣减。数量差异请走库存修正草稿；规格、库区和安全库存变更先进入基础资料维护草稿。",
    };
  });
}

function buildMasterDataEmployeeMachineRecords({ employeeAccountReviews = [], seedUserOptions = [] }) {
  const importedEmployees = employeeAccountReviews.map((review) => ({
    id: `EMP-${review.employeeId || review.userId || review.loginName}`,
    label: review.name || review.loginName || review.employeeId,
    statusLabel: review.accountEnabled ? getEmployeePasswordStatusLabel(review.passwordStatus) : "待复核启用",
    tone: review.passwordStatus === "password_revoked" ? "danger" : review.passwordStatus === "password_expired" ? "warning" : review.accountEnabled ? "success" : "warning",
    cells: [review.name || review.employeeId, review.loginName || review.userId, review.roleName || review.roleKey || "岗位待补", review.defaultMachineId || "未绑定", review.accountEnabled ? "已启用" : "待启用", getEmployeePasswordStatusLabel(review.passwordStatus)],
    detailRows: [
      ["员工", review.name || review.employeeId],
      ["登录名", review.loginName || review.userId || "待生成"],
      ["岗位", review.roleName || review.roleKey || "岗位待补"],
      ["默认机台", review.defaultMachineId || "未绑定"],
      ["账号状态", review.accountEnabled ? "已启用" : "待复核启用"],
      ["密码状态", getEmployeePasswordStatusLabel(review.passwordStatus)],
    ],
    fields: [
      { key: "role", label: "岗位", currentValue: review.roleName || review.roleKey || "" },
      { key: "defaultMachineId", label: "默认机台", currentValue: review.defaultMachineId || "" },
      { key: "loginName", label: "登录名", currentValue: review.loginName || "" },
      { key: "accountEnabled", label: "账号启用", currentValue: review.accountEnabled ? "是" : "否" },
    ],
    searchText: [review.employeeId, review.name, review.loginName, review.userId, review.roleName, review.roleKey, review.defaultMachineId].join(" "),
    reviewRule: "员工和机台资料影响权限、车间任务可见性和报工归属。账号启用、密码发放和撤销仍必须在员工账号复核区完成。",
  }));
  const seedEmployees = seedUserOptions.map((user) => ({
    id: `SEED-${user.userId}`,
    label: user.displayName,
    statusLabel: user.defaultMachineId ? "seed账号 / 已绑定机台" : "seed账号",
    tone: "neutral",
    cells: [user.displayName, user.userId, user.roleLabel, user.defaultMachineId || "未绑定", "seed账号", "不发正式密码"],
    detailRows: [
      ["用户 ID", user.userId],
      ["显示名", user.displayName],
      ["岗位", user.roleLabel],
      ["角色", user.defaultRole],
      ["默认机台", user.defaultMachineId || "未绑定"],
      ["来源", "本地 seed 权限"],
    ],
    fields: [
      { key: "displayName", label: "显示名", currentValue: user.displayName },
      { key: "roleLabel", label: "岗位说明", currentValue: user.roleLabel },
      { key: "defaultMachineId", label: "默认机台", currentValue: user.defaultMachineId || "" },
    ],
    searchText: [user.userId, user.displayName, user.roleLabel, user.defaultRole, user.defaultMachineId].join(" "),
    reviewRule: "seed 账号只用于原型和本地权限演示；真实员工必须通过员工机台导入和账号复核进入运行期身份仓储。",
  }));
  return [...importedEmployees, ...seedEmployees];
}

function filterMasterDataMaintenanceRecords(records = [], keyword = "") {
  const query = String(keyword ?? "").trim().toLowerCase();
  if (!query) return records;
  return records.filter((record) => String(record.searchText ?? record.label ?? "").toLowerCase().includes(query));
}

function getMasterDataMaintenanceColumns(tab) {
  if (tab === "价格表") return ["品名", "尺寸", "颜色/提手", "单双面", "参考单价", "客户", "来源"];
  if (tab === "规格库存") return ["尺寸", "颜色", "提手", "款式", "库区", "状态", "可用"];
  if (tab === "员工机台") return ["员工", "账号", "岗位", "机台", "状态", "密码"];
  return ["客户", "结算", "联系人", "电话", "欠款", "标签"];
}

function getMasterDataMaintenanceTableClass(tab) {
  if (tab === "价格表") return "price";
  if (tab === "规格库存") return "stock";
  if (tab === "员工机台") return "employee";
  return "customer";
}

function getEmployeePasswordStatusLabel(status = "") {
  const labels = {
    temporary_password_issued: "临时密码待改密",
    active: "正式密码已生效",
    password_expired: "密码已过期待改密",
    password_revoked: "密码已撤销",
  };
  return labels[status] || status || "密码待发放";
}

function formatMasterDataMaintenanceTime(value) {
  if (!value) return "时间待确认";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间待确认";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatInventoryLedgerTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间待确认";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatInventoryCorrectionTime(value) {
  if (!value) return "时间待确认";
  return formatInventoryLedgerTime(value);
}

export { FulfillmentPage } from "../../features/fulfillment/FulfillmentPage.jsx";

export function ProductionPackingPage({
  orderLines,
  inventoryRecords,
  productionPacking,
  focusTarget,
  sourceDetailState,
  printerDeviceQa,
  printJobQueue,
  printDriverConfig,
  printDriverReadiness,
  printDriverCupsDiagnostics,
  onAction,
  onRefreshPrintDriverConfig,
  onRefreshPrintDriverReadiness,
  onRefreshPrinterDeviceQa,
  onSelectPrinterDeviceQaDevice,
  onChangePrinterDeviceQaField,
  onChangePrinterDeviceQaCheck,
  onChangePrinterDeviceQaEvidenceField,
  onSavePrinterDeviceMode,
  onSavePrinterDeviceQa,
  onRefreshPrintJobs,
  onDispatchPrintJob,
  onRetryPrintJob,
  helpers,
}) {
  const {
    buildProductionTaskId,
    findCustomer,
    findProductionInventoryItem,
    getLineColorSpecLabel,
    getLinePrintSide,
    getLineRemark,
    getUiActionState,
    statusTone,
  } = helpers;
  const taskListFromApi = isProductionPackingTaskListFromApi(productionPacking);
  const taskListStatusText = getProductionPackingTaskListStatusText(productionPacking);
  const apiProductionLines = Array.isArray(productionPacking.productionTasks) ? productionPacking.productionTasks.filter(Boolean) : [];
  const baseProductionLines = taskListFromApi ? apiProductionLines.filter(isProductionReportCandidate) : orderLines.filter(isProductionReportCandidate);
  const focusedProductionLine =
    focusTarget?.mode === "production"
      ? findFocusedProductionLine([...apiProductionLines, ...orderLines], focusTarget, buildProductionTaskId)
      : null;
  const productionLines =
    focusedProductionLine && !baseProductionLines.some((line) => line.id === focusedProductionLine.id)
      ? [focusedProductionLine, ...baseProductionLines]
      : baseProductionLines;
  const packingTasks = buildPackingTaskRows({
    orderLines,
    packingTasks: productionPacking.packingTasks,
    includeLocalProjections: !taskListFromApi,
  });
  const lastAppliedFocusKeyRef = useRef("");
  const [selectedProductionLineId, setSelectedProductionLineId] = useState(productionLines[0]?.id ?? "");
  const [selectedPackingTaskId, setSelectedPackingTaskId] = useState(packingTasks[0]?.packingTaskId ?? "");
  const [activeDetail, setActiveDetail] = useState(productionLines.length ? "production" : "packing");
  const [reportInputs, setReportInputs] = useState({});
  const [packingInputs, setPackingInputs] = useState({});
  const [queueMoveDraft, setQueueMoveDraft] = useState({
    targetMachineId: "",
    targetQueueSeq: "1",
    reasonCode: "supervisor_order",
  });
  const selectedProductionLine = productionLines.find((item) => item.id === selectedProductionLineId) ?? productionLines[0] ?? null;
  const selectedPackingTask = packingTasks.find((item) => item.packingTaskId === selectedPackingTaskId) ?? packingTasks[0] ?? null;
  const resolveInventoryItem = (line, task = null) => findProductionInventoryItem(line, inventoryRecords) ?? line?.inventoryItem ?? task?.inventoryItem ?? null;
  const detailMode = activeDetail === "packing" && selectedPackingTask ? "packing" : "production";
  const detailLine = detailMode === "packing" ? selectedPackingTask?.orderLine : selectedProductionLine;
  const detailInventoryItem = detailLine ? resolveInventoryItem(detailLine, selectedPackingTask) : null;
  const reportState = getUiActionState("productionPacking", "报工完成");
  const reportDailyState = getUiActionState("productionPacking", "报当日数量");
  const publishScheduleState = getUiActionState("productionPacking", "发布排产");
  const uploadFinishedPhotoState = getUiActionState("productionPacking", "上传成品图");
  const acceptFinishedPhotoState = getUiActionState("productionPacking", "确认成品图");
  const rejectFinishedPhotoState = getUiActionState("productionPacking", "退回成品图");
  const packingState = getUiActionState("productionPacking", "提交打包完成");
  const reportQualifiedQty = getNumericInput(reportInputs, selectedProductionLine?.id, "qualifiedQty", selectedProductionLine?.qty ?? 0);
  const reportExceptionQty = getNumericInput(reportInputs, selectedProductionLine?.id, "exceptionQty", 0);
  const reportMachineCount = getNumericInput(reportInputs, selectedProductionLine?.id, "machineCount", "");
  const packingActualQty = getNumericInput(packingInputs, selectedPackingTask?.packingTaskId, "actualPackedQty", selectedPackingTask?.plannedQty ?? 0);
  const packingPackageCount = getNumericInput(packingInputs, selectedPackingTask?.packingTaskId, "packageCount", selectedPackingTask?.packageCount ?? inferPackageCountFromQty(selectedPackingTask?.plannedQty));
  const packingLabelsPrinted = getBooleanInput(packingInputs, selectedPackingTask?.packingTaskId, "labelsPrinted", false);
  const selectedProductionCanReport = selectedProductionLine ? isProductionReportCandidate(selectedProductionLine) : false;
  const selectedPublishedScheduleId = getProductionPublishedScheduleId(selectedProductionLine);
  const selectedProductionMachineId = getProductionMachineIdLabel(selectedProductionLine);
  const selectedFinishedGoodsPhoto = getProductionFinishedGoodsPhoto(selectedProductionLine);
  const selectedFinishedGoodsPhotoRequired = isProductionFinishedGoodsPhotoRequired(selectedProductionLine);
  const scheduleQueueItems = Array.isArray(productionPacking.scheduleQueueItems)
    ? productionPacking.scheduleQueueItems.filter(Boolean)
    : [];
  const scheduleQueueStatusText = getProductionScheduleQueueStatusText(productionPacking);
  const sequenceState = getUiActionState("productionPacking", "调整排产顺序");
  const selectedScheduleQueueItem = findScheduleQueueItemForLine(scheduleQueueItems, selectedProductionLine, buildProductionTaskId);
  const selectedMachineScheduleQueueItems = selectedScheduleQueueItem
    ? scheduleQueueItems
        .filter((item) => item.machineId === selectedScheduleQueueItem.machineId)
        .sort(sortScheduleQueueItemsBySeq)
    : [];
  const scheduleQueueMachineOptions = getScheduleQueueMachineOptions(scheduleQueueItems, productionLines);
  const selectedScheduleSourceMachineId = String(selectedScheduleQueueItem?.machineId ?? "").trim();
  const queueMoveTargetMachineId = scheduleQueueMachineOptions.includes(queueMoveDraft.targetMachineId)
    ? queueMoveDraft.targetMachineId
    : getDefaultQueueMoveTargetMachineId(scheduleQueueMachineOptions, selectedScheduleSourceMachineId);
  const queueMoveTargetItems = getScheduleQueueItemsForMachine(
    scheduleQueueItems,
    queueMoveTargetMachineId,
    selectedScheduleQueueItem?.productionTaskId,
  );
  const queueMovePositionOptions = getQueueMovePositionOptions(queueMoveTargetItems);
  const queueMoveTargetSeq = getNormalizedQueueMoveSeq(queueMoveDraft.targetQueueSeq, queueMovePositionOptions.length);
  const selectedScheduleQueueIndex = selectedScheduleQueueItem
    ? selectedMachineScheduleQueueItems.findIndex((item) => item.productionTaskId === selectedScheduleQueueItem.productionTaskId)
    : -1;
  const canMoveScheduleUp = selectedScheduleQueueIndex > 0;
  const canMoveScheduleDown = selectedScheduleQueueIndex >= 0 && selectedScheduleQueueIndex < selectedMachineScheduleQueueItems.length - 1;
  const queueMoveReason = getQueueMoveReason(queueMoveDraft.reasonCode);
  const queueMoveImpact = getQueueMoveImpactSummary({
    selectedItem: selectedScheduleQueueItem,
    sourceItems: selectedMachineScheduleQueueItems,
    sourceIndex: selectedScheduleQueueIndex,
    targetMachineId: queueMoveTargetMachineId,
    targetItems: queueMoveTargetItems,
    targetSeq: queueMoveTargetSeq,
    reasonLabel: queueMoveReason.label,
  });
  const queueMoveSamePosition =
    selectedScheduleQueueItem &&
    selectedScheduleSourceMachineId === queueMoveTargetMachineId &&
    Math.max(1, Math.trunc(Number(selectedScheduleQueueItem.queueSeq ?? 1))) === queueMoveTargetSeq;
  const queueMoveDisabled =
    sequenceState.disabled || !selectedScheduleQueueItem || !queueMoveTargetMachineId || queueMoveSamePosition;
  const queueMoveTitle =
    sequenceState.title ||
    (!selectedScheduleQueueItem
      ? "先选择机台排产队列中的任务"
      : !queueMoveTargetMachineId
        ? "没有可移动的目标机台"
        : queueMoveSamePosition
          ? "目标机台和位置与当前一致"
          : `移动到 ${queueMoveTargetMachineId} #${queueMoveTargetSeq}`);
  const visibleSourceDetail = getVisibleProductionPackingSourceDetail(sourceDetailState, {
    detailMode,
    selectedProductionLine,
    selectedPackingTask,
    buildProductionTaskId,
  });
  const focusNotice = getProductionPackingFocusNotice(focusTarget, {
    detailMode,
    selectedProductionLine,
    selectedPackingTask,
    buildProductionTaskId,
  });
  const stats = [
    ["待报工", baseProductionLines.length, baseProductionLines.length ? "warning" : "success"],
    ["排产队列", productionPacking.scheduleQueueTotal ?? scheduleQueueItems.length, scheduleQueueItems.length ? "blue" : "success"],
    ["跨日继续", baseProductionLines.filter((line) => getProductionDailyProgress(line)?.carryOver).length, "blue"],
    ["待打包", packingTasks.filter((item) => item.status !== "已完成").length, "blue"],
    ["已打包", packingTasks.filter((item) => item.status === "已完成").length, "success"],
  ];
  const reportDisabled = reportState.disabled || !selectedProductionLine || !detailInventoryItem || !selectedProductionCanReport;
  const reportTitle = reportState.title || (!selectedProductionCanReport ? "该订单明细已完成生产报工或不在可报工状态" : !detailInventoryItem ? "未找到匹配库存键，不能报工入库" : "");
  const reportDailyDisabled = reportDailyState.disabled || !selectedProductionLine || !selectedProductionCanReport;
  const reportDailyTitle = reportDailyState.title || (!selectedProductionCanReport ? "该订单明细已完成生产报工或不在可报工状态" : "");
  const publishScheduleDisabled = publishScheduleState.disabled || !selectedProductionLine || !selectedProductionCanReport || Boolean(selectedPublishedScheduleId);
  const publishScheduleTitle = publishScheduleState.title || (selectedPublishedScheduleId ? "该生产任务已发布到车间任务池" : !selectedProductionCanReport ? "该订单明细不在可发布排产状态" : "");
  const finishedPhotoUploadDisabled = uploadFinishedPhotoState.disabled || !selectedProductionLine || !selectedFinishedGoodsPhotoRequired;
  const finishedPhotoUploadTitle =
    uploadFinishedPhotoState.title ||
    (!selectedProductionLine
      ? "请先选择生产任务"
      : !selectedFinishedGoodsPhotoRequired
        ? "空白通货补货默认不强制上传成品图"
        : "");
  const finishedPhotoReviewDisabled =
    acceptFinishedPhotoState.disabled ||
    !selectedProductionLine ||
    !selectedFinishedGoodsPhoto.attachmentId ||
    selectedFinishedGoodsPhoto.status === "已接受";
  const finishedPhotoReviewTitle =
    acceptFinishedPhotoState.title ||
    (!selectedFinishedGoodsPhoto.attachmentId
      ? "先上传成品图"
      : selectedFinishedGoodsPhoto.status === "已接受"
        ? "成品图已确认"
        : "");
  const finishedPhotoRejectDisabled =
    rejectFinishedPhotoState.disabled ||
    !selectedProductionLine ||
    !selectedFinishedGoodsPhoto.attachmentId ||
    selectedFinishedGoodsPhoto.status === "需重拍";
  const finishedPhotoRejectTitle =
    rejectFinishedPhotoState.title ||
    (!selectedFinishedGoodsPhoto.attachmentId
      ? "先上传成品图"
      : selectedFinishedGoodsPhoto.status === "需重拍"
        ? "已退回重拍"
        : "");
  const packingDisabled = packingState.disabled || !selectedPackingTask || selectedPackingTask.status === "已完成";
  const packingTitle = packingState.title || (selectedPackingTask?.status === "已完成" ? "该打包任务已完成" : "");

  function selectProductionLine(lineId) {
    setSelectedProductionLineId(lineId);
    setActiveDetail("production");
  }

  function selectPackingTask(taskId) {
    setSelectedPackingTaskId(taskId);
    setActiveDetail("packing");
  }

  function selectScheduleQueueItem(queueItem) {
    const targetLine = productionLines.find((line) => {
      const lineTaskId = buildProductionTaskId(line);
      return (
        queueItem.productionTaskId === line.productionTaskId ||
        queueItem.productionTaskId === lineTaskId ||
        queueItem.orderLineId === line.id ||
        queueItem.orderLineId === line.orderLineId
      );
    });
    if (!targetLine) return;
    selectProductionLine(targetLine.id);
  }

  function moveSelectedScheduleQueue(direction) {
    if (!selectedScheduleQueueItem) return;
    const nextOrderedItems = moveScheduleQueueItem(selectedMachineScheduleQueueItems, selectedScheduleQueueItem.productionTaskId, direction);
    if (!nextOrderedItems.length) return;
    onAction("调整排产顺序", {
      machineId: selectedScheduleQueueItem.machineId,
      orderedProductionTaskIds: nextOrderedItems.map((item) => item.productionTaskId),
      remark: `${selectedScheduleQueueItem.machineId} ${selectedScheduleQueueItem.productionTaskId} ${direction === "up" ? "上移" : "下移"}`,
    });
  }

  function moveSelectedScheduleQueueToTarget() {
    if (queueMoveDisabled) return;
    onAction("移动排产任务", {
      productionTaskId: selectedScheduleQueueItem.productionTaskId,
      orderLineId: selectedScheduleQueueItem.orderLineId,
      sourceMachineId: selectedScheduleQueueItem.machineId,
      targetMachineId: queueMoveTargetMachineId,
      targetQueueSeq: queueMoveTargetSeq,
      reasonCode: queueMoveReason.value,
      reasonLabel: queueMoveReason.label,
      impactSummary: queueMoveImpact.remark,
      remark: `${queueMoveReason.label}：${selectedScheduleQueueItem.productionTaskId} 从 ${selectedScheduleQueueItem.machineId} 移到 ${queueMoveTargetMachineId} #${queueMoveTargetSeq}；${queueMoveImpact.remark}`,
    });
  }

  function updateQueueMoveTargetMachine(targetMachineId) {
    setQueueMoveDraft((current) => ({
      ...current,
      targetMachineId,
      targetQueueSeq: "1",
    }));
  }

  function updateQueueMoveTargetSeq(targetQueueSeq) {
    setQueueMoveDraft((current) => ({
      ...current,
      targetQueueSeq,
    }));
  }

  function updateQueueMoveReason(reasonCode) {
    setQueueMoveDraft((current) => ({
      ...current,
      reasonCode,
    }));
  }

  useEffect(() => {
    if (!focusTarget?.focusKey || lastAppliedFocusKeyRef.current === focusTarget.focusKey) return;
    if (focusTarget.mode === "packing") {
      const taskId = String(focusTarget.taskId ?? focusTarget.packingTaskId ?? "").trim();
      const targetTask =
        packingTasks.find((task) => task.packingTaskId === taskId) ??
        packingTasks.find((task) => task.orderLineId === focusTarget.orderLineId);
      if (!targetTask) return;
      setSelectedPackingTaskId(targetTask.packingTaskId);
      setActiveDetail("packing");
      lastAppliedFocusKeyRef.current = focusTarget.focusKey;
      return;
    }

    if (focusTarget.mode === "production") {
      const targetLine = findFocusedProductionLine(productionLines, focusTarget, buildProductionTaskId);
      if (!targetLine) return;
      setSelectedProductionLineId(targetLine.id);
      setActiveDetail("production");
      lastAppliedFocusKeyRef.current = focusTarget.focusKey;
    }
  }, [focusTarget, packingTasks, productionLines, buildProductionTaskId]);

  function updateReportInput(field, value) {
    if (!selectedProductionLine) return;
    setReportInputs((current) => ({
      ...current,
      [selectedProductionLine.id]: {
        ...(current[selectedProductionLine.id] ?? {}),
        [field]: value,
      },
    }));
  }

  function updatePackingInput(field, value) {
    if (!selectedPackingTask) return;
    setPackingInputs((current) => ({
      ...current,
      [selectedPackingTask.packingTaskId]: {
        ...(current[selectedPackingTask.packingTaskId] ?? {}),
        [field]: value,
      },
    }));
  }

  return (
    <section className="page-grid split-detail">
      <div className="table-pane">
        <MetricStrip items={stats} />
        <div className="toolbar-line">
          <span>生产报工只认合格数量；机器计数只做凭证。打包完成不扣库存。</span>
          <strong className="toolbar-focus-hint">{taskListStatusText}</strong>
          <strong className="toolbar-focus-hint">{scheduleQueueStatusText}</strong>
          {focusNotice ? <strong className="toolbar-focus-hint">{focusNotice}</strong> : null}
        </div>
        <section className="detail-section compact-section">
          <div className="section-head-row">
            <h3>机台排产队列</h3>
            <div className="section-tools">
              <span className="section-count">{productionPacking.scheduleQueueTotal ?? scheduleQueueItems.length} 条</span>
              <button
                disabled={sequenceState.disabled || !canMoveScheduleUp}
                title={sequenceState.title || (!selectedScheduleQueueItem ? "先选择机台排产队列中的任务" : !canMoveScheduleUp ? "当前任务已在本机台最前" : "上移当前任务")}
                onClick={() => moveSelectedScheduleQueue("up")}
              >
                上移
              </button>
              <button
                disabled={sequenceState.disabled || !canMoveScheduleDown}
                title={sequenceState.title || (!selectedScheduleQueueItem ? "先选择机台排产队列中的任务" : !canMoveScheduleDown ? "当前任务已在本机台最后" : "下移当前任务")}
                onClick={() => moveSelectedScheduleQueue("down")}
              >
                下移
              </button>
              <div className="queue-move-controls" aria-label="移动排产任务">
                <label>
                  <span>目标</span>
                  <select
                    value={queueMoveTargetMachineId}
                    disabled={sequenceState.disabled || !selectedScheduleQueueItem}
                    title={sequenceState.title || "选择目标机台"}
                    onChange={(event) => updateQueueMoveTargetMachine(event.target.value)}
                  >
                    {scheduleQueueMachineOptions.map((machineId) => (
                      <option key={machineId} value={machineId}>
                        {machineId}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>位置</span>
                  <select
                    value={String(queueMoveTargetSeq)}
                    disabled={sequenceState.disabled || !selectedScheduleQueueItem}
                    title={sequenceState.title || "选择插入位置"}
                    onChange={(event) => updateQueueMoveTargetSeq(event.target.value)}
                  >
                    {queueMovePositionOptions.map((seq) => (
                      <option key={seq} value={seq}>
                        #{seq}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>原因</span>
                  <select
                    value={queueMoveReason.value}
                    disabled={sequenceState.disabled || !selectedScheduleQueueItem}
                    title={sequenceState.title || "选择本次排产调整原因"}
                    onChange={(event) => updateQueueMoveReason(event.target.value)}
                  >
                    {queueMoveReasonOptions.map((reason) => (
                      <option key={reason.value} value={reason.value}>
                        {reason.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button disabled={queueMoveDisabled} title={queueMoveTitle} onClick={moveSelectedScheduleQueueToTarget}>
                  移动/插队
                </button>
              </div>
            </div>
          </div>
          <div className="queue-move-impact" aria-live="polite">
            {queueMoveImpact.text}
          </div>
          <DataTable
            className="production-schedule-queue-table"
            columns={["机台", "顺序", "任务", "客户", "货品规格", "计划/剩余", "状态"]}
            rows={scheduleQueueItems.map((item) => {
              const active =
                detailMode === "production" &&
                selectedProductionLine &&
                (item.orderLineId === selectedProductionLine.id ||
                  item.orderLineId === selectedProductionLine.orderLineId ||
                  item.productionTaskId === selectedProductionLine.productionTaskId ||
                  item.productionTaskId === buildProductionTaskId(selectedProductionLine));
              return {
                id: item.scheduleRecordId || item.publishedScheduleId || item.productionTaskId,
                active,
                tone: item.queueReason === "跨日继续" ? "warning" : "blue",
                onClick: () => selectScheduleQueueItem(item),
                cells: [
                  item.machineId || "未分配",
                  item.queueSeq ? `#${item.queueSeq}` : "-",
                  item.publishedScheduleId || item.productionTaskId,
                  item.customerName || item.customerId || "未匹配",
                  formatProductionScheduleQueueSpec(item),
                  formatProductionScheduleQueueQty(item),
                  formatProductionScheduleQueueStatus(item),
                ],
              };
            })}
          />
        </section>
        <section className="detail-section compact-section">
          <div className="section-head-row">
            <h3>生产报工</h3>
            <span className="section-count">{productionLines.length} 条</span>
          </div>
          <DataTable
            className="production-task-table"
            columns={["任务", "客户", "货品", "规格", "计划", "工序", "状态", "进度/库存"]}
            rows={productionLines.map((line) => {
              const inventoryItem = resolveInventoryItem(line);
              const progressLabel = formatProductionDailyProgressLabel(line);
              return {
                id: line.id,
                active: line.id === selectedProductionLine?.id && detailMode === "production",
                tone: inventoryItem ? statusTone(line.status) : "danger",
                onClick: () => selectProductionLine(line.id),
                cells: [
                  buildProductionTaskId(line),
                  findCustomer(line.customerId).name,
                  line.product,
                  `${line.size} ${getLineColorSpecLabel(line)}`,
                  line.qty,
                  getProductionProcessLabel(line),
                  line.status,
                  progressLabel || (inventoryItem ? inventoryItem.zone : "缺库存键"),
                ],
              };
            })}
          />
        </section>
        <section className="detail-section compact-section">
          <div className="section-head-row">
            <h3>打包任务</h3>
            <span className="section-count">{packingTasks.length} 条</span>
          </div>
          <DataTable
            className="packing-task-table"
            columns={["任务", "客户", "货品", "规格", "计划", "实包", "包裹", "状态"]}
            rows={packingTasks.map((task) => {
              const line = task.orderLine;
              return {
                id: task.packingTaskId,
                active: task.packingTaskId === selectedPackingTask?.packingTaskId && detailMode === "packing",
                tone: statusTone(task.status),
                onClick: () => selectPackingTask(task.packingTaskId),
                cells: [
                  task.packingTaskId,
                  findCustomer(line.customerId).name,
                  line.product,
                  `${line.size} ${getLineColorSpecLabel(line)}`,
                  task.plannedQty,
                  task.actualPackedQty || "未填",
                  `${task.packageCount ?? inferPackageCountFromQty(task.plannedQty)}包`,
                  task.status,
                ],
              };
            })}
          />
        </section>
      </div>
      <DetailPane
        title={detailMode === "packing" ? selectedPackingTask?.packingTaskId ?? "打包任务" : selectedProductionLine ? buildProductionTaskId(selectedProductionLine) : "生产报工"}
        subtitle={detailLine ? `${findCustomer(detailLine.customerId).name} · ${detailLine.id}` : "未选择"}
      >
        {detailLine ? (
          <>
            <PrinterDeviceQaPanel
              qaState={printerDeviceQa}
              saveState={getUiActionState("productionPacking", "保存打印验收")}
              deviceModeSaveState={getUiActionState("productionPacking", "保存设备模式")}
              onRefresh={onRefreshPrinterDeviceQa}
              onSelectDevice={onSelectPrinterDeviceQaDevice}
              onChangeField={onChangePrinterDeviceQaField}
              onChangeCheck={onChangePrinterDeviceQaCheck}
              onChangeEvidence={onChangePrinterDeviceQaEvidenceField}
              onSaveDeviceMode={onSavePrinterDeviceMode}
              onSave={onSavePrinterDeviceQa}
            />
            <PrintDriverV1ReadinessPanel
              readinessState={printDriverReadiness}
              onRefresh={onRefreshPrintDriverReadiness}
            />
            <PrintDriverDiagnosticsPanel
              driverState={printDriverConfig}
              cupsDiagnosticsState={printDriverCupsDiagnostics}
              onRefresh={onRefreshPrintDriverConfig}
            />
            <PrintJobQueuePanel
              queueState={printJobQueue}
              dispatchState={getUiActionState("productionPacking", "派发打印作业")}
              retryState={getUiActionState("productionPacking", "重试打印作业")}
              onRefresh={onRefreshPrintJobs}
              onDispatch={onDispatchPrintJob}
              onRetry={onRetryPrintJob}
            />
            <InfoGrid
              rows={[
                ["货品", `${detailLine.product} / ${detailLine.size}`],
                ["颜色/印刷/提手", `${getLineColorSpecLabel(detailLine)} / ${getLinePrintSide(detailLine)}`],
                ["数量", `${detailLine.qty} 个`],
                ["交付", `${detailLine.fulfillment} · ${detailLine.latest}`],
                ["排产发布", detailMode === "production" ? (selectedPublishedScheduleId ? `${selectedProductionMachineId} / ${selectedPublishedScheduleId}` : "未发布到车间任务池") : "生产完成后进入打包"],
                ["库存键", detailInventoryItem ? `${detailInventoryItem.id} / ${detailInventoryItem.zone}` : "未找到匹配库存键"],
                ["跨日进度", formatProductionDailyProgressLabel(detailLine) || "暂无日报数"],
                ["成品图", detailMode === "production" ? formatProductionFinishedGoodsPhotoLabel(selectedFinishedGoodsPhoto) : "生产侧确认"],
                ["备注", getLineRemark(detailLine) || "无"],
              ]}
            />
            {visibleSourceDetail ? (
              <ProductionPackingSourceDetailCard detailState={visibleSourceDetail} detailMode={detailMode} />
            ) : null}
            {detailMode === "production" ? (
              <>
                <section className="detail-section">
                  <h3>报工字段</h3>
                  <div className="detail-form">
                    <label>
                      <span>合格数量</span>
                      <input type="number" min="1" value={reportQualifiedQty} onChange={(event) => updateReportInput("qualifiedQty", event.target.value)} />
                    </label>
                    <label>
                      <span>异常/废品数</span>
                      <input type="number" min="0" value={reportExceptionQty} onChange={(event) => updateReportInput("exceptionQty", event.target.value)} />
                    </label>
                    <label>
                      <span>机器计数/动作次数</span>
                      <input type="number" min="0" placeholder="只作凭证" value={reportMachineCount} onChange={(event) => updateReportInput("machineCount", event.target.value)} />
                    </label>
                  </div>
                </section>
                <section className="detail-section">
                  <h3>事务结果</h3>
                  <p>报当日数量只记录跨日进度，不入库、不占用、不生成打包任务；报工完成才会把合格数量入库并占用给该订单。</p>
                </section>
                <section className="detail-section finished-goods-photo-section">
                  <div className="section-title-row">
                    <h3>定制成品图</h3>
                    <StatusPill tone={getProductionFinishedGoodsPhotoTone(selectedFinishedGoodsPhoto)}>
                      {selectedFinishedGoodsPhoto.status}
                    </StatusPill>
                  </div>
                  <InfoGrid
                    rows={[
                      ["附件", selectedFinishedGoodsPhoto.fileName || selectedFinishedGoodsPhoto.attachmentId || "未上传"],
                      ["上传", selectedFinishedGoodsPhoto.uploadedAt ? formatCompactDateTime(selectedFinishedGoodsPhoto.uploadedAt) : "未上传"],
                      ["复核", selectedFinishedGoodsPhoto.reviewedAt ? formatCompactDateTime(selectedFinishedGoodsPhoto.reviewedAt) : "待确认"],
                      ["退回原因", selectedFinishedGoodsPhoto.rejectedReason || "无"],
                    ]}
                  />
                  <div className="action-row">
                    <button
                      disabled={finishedPhotoUploadDisabled}
                      title={finishedPhotoUploadTitle}
                      onClick={() =>
                        onAction("上传成品图", {
                          orderLineId: selectedProductionLine.id,
                          orderLine: selectedProductionLine,
                          productionTaskId: selectedProductionLine.productionTaskId || buildProductionTaskId(selectedProductionLine),
                        })
                      }
                    >
                      上传成品图
                    </button>
                    <button
                      className="primary-action"
                      disabled={finishedPhotoReviewDisabled}
                      title={finishedPhotoReviewTitle}
                      onClick={() =>
                        onAction("确认成品图", {
                          orderLineId: selectedProductionLine.id,
                          orderLine: selectedProductionLine,
                          productionTaskId: selectedProductionLine.productionTaskId || buildProductionTaskId(selectedProductionLine),
                        })
                      }
                    >
                      确认成品图
                    </button>
                    <button
                      disabled={finishedPhotoRejectDisabled}
                      title={finishedPhotoRejectTitle}
                      onClick={() =>
                        onAction("退回成品图", {
                          orderLineId: selectedProductionLine.id,
                          orderLine: selectedProductionLine,
                          productionTaskId: selectedProductionLine.productionTaskId || buildProductionTaskId(selectedProductionLine),
                        })
                      }
                    >
                      退回重拍
                    </button>
                  </div>
                </section>
                <div className="action-row">
                  <button
                    disabled={publishScheduleDisabled}
                    title={publishScheduleTitle}
                    onClick={() =>
                      onAction("发布排产", {
                        orderLineId: selectedProductionLine.id,
                        orderLine: selectedProductionLine,
                        productionTaskId: selectedProductionLine.productionTaskId || buildProductionTaskId(selectedProductionLine),
                        processType: getProductionProcessLabel(selectedProductionLine),
                        machineId: selectedProductionMachineId,
                        plannedQty: selectedProductionLine.qty,
                      })
                    }
                  >
                    {selectedPublishedScheduleId ? "已发布排产" : "发布排产"}
                  </button>
                  <button
                    disabled={reportDailyDisabled}
                    title={reportDailyTitle}
                    onClick={() =>
                      onAction("报当日数量", {
                        orderLineId: selectedProductionLine.id,
                        orderLine: selectedProductionLine,
                        dailyQualifiedQty: Number(reportQualifiedQty || 0),
                        exceptionQty: Number(reportExceptionQty || 0),
                        machineCount: reportMachineCount === "" ? undefined : Number(reportMachineCount),
                      })
                    }
                  >
                    报当日数量
                  </button>
                  <button
                    className="primary-action"
                    disabled={reportDisabled}
                    title={reportTitle}
                    onClick={() =>
                      onAction("报工完成", {
                        orderLineId: selectedProductionLine.id,
                        orderLine: selectedProductionLine,
                        qualifiedQty: Number(reportQualifiedQty || 0),
                        exceptionQty: Number(reportExceptionQty || 0),
                        machineCount: reportMachineCount === "" ? undefined : Number(reportMachineCount),
                      })
                    }
                  >
                    报工完成
                  </button>
                </div>
              </>
            ) : (
              <>
                <section className="detail-section">
                  <h3>包裹明细</h3>
                  <div className="detail-form">
                    <label>
                      <span>实际打包数量</span>
                      <input type="number" min="1" value={packingActualQty} onChange={(event) => updatePackingInput("actualPackedQty", event.target.value)} />
                    </label>
                    <label>
                      <span>包裹数</span>
                      <input type="number" min="1" value={packingPackageCount} onChange={(event) => updatePackingInput("packageCount", event.target.value)} />
                    </label>
                    <label>
                      <span>标签状态</span>
                      <select value={packingLabelsPrinted ? "已打印" : "未打印"} onChange={(event) => updatePackingInput("labelsPrinted", event.target.value === "已打印")}>
                        <option>未打印</option>
                        <option>已打印</option>
                      </select>
                    </label>
                  </div>
                </section>
                <section className="detail-section">
                  <h3>事务结果</h3>
                  <p>提交后生成包裹记录，快递快运未打印标签时进入待打印标签；打包完成本身不扣库存。</p>
                </section>
                <div className="action-row">
                  <button
                    className="primary-action"
                    disabled={packingDisabled}
                    title={packingTitle}
                    onClick={() =>
                      onAction("提交打包完成", {
                        packingTaskId: selectedPackingTask.packingTaskId,
                        packingTask: selectedPackingTask,
                        orderLineId: selectedPackingTask.orderLineId,
                        orderLine: selectedPackingTask.orderLine,
                        actualPackedQty: Number(packingActualQty || 0),
                        packageCount: Number(packingPackageCount || 1),
                        labelsPrinted: packingLabelsPrinted,
                      })
                    }
                  >
                    提交打包完成
                  </button>
                </div>
              </>
            )}
            <Timeline
              items={[
                detailMode === "production" ? "车间完成生产" : "生产完成进入打包",
                detailMode === "production" ? "办公室/生产管理确认合格数量" : "打包工确认实际包裹",
                detailMode === "production" ? "入库并生成订单占用" : "生成包裹和标签下一步",
                detailMode === "production" ? "进入待打包" : "出库/拉走时再扣库存",
              ]}
            />
          </>
        ) : (
          <div className="empty-row">暂无生产或打包任务</div>
        )}
      </DetailPane>
    </section>
  );
}

function PrinterDeviceQaPanel({
  qaState = {},
  saveState = {},
  deviceModeSaveState = {},
  onRefresh,
  onSelectDevice,
  onChangeField,
  onChangeCheck,
  onChangeEvidence,
  onSaveDeviceMode,
  onSave,
}) {
  const devices = Array.isArray(qaState.devices) ? qaState.devices : [];
  const checks = Array.isArray(qaState.checks) ? qaState.checks : [];
  const selectedDevice = devices.find((item) => item.printDeviceId === qaState.selectedDeviceId) ?? null;
  const latestRecord = qaState.latestRecord ?? selectedDevice?.latestFieldTestRecord ?? null;
  const summary = getPrinterDeviceFieldTestSummary(checks);
  const evidence = qaState.evidence ?? latestRecord?.evidence ?? latestRecord?.summary?.evidence ?? {};
  const evidenceSummary = getPrinterDeviceFieldTestEvidenceSummary(evidence);
  const currentDriverMode = getPrinterDeviceDriverMode(selectedDevice);
  const draftDriverMode = qaState.driverModeDraft || currentDriverMode;
  const driverModeChanged = Boolean(selectedDevice && draftDriverMode !== currentDriverMode);
  const sourceLabel = getPrinterDeviceQaSourceLabel(qaState);
  const sourceTone = qaState.error ? "danger" : qaState.source === "api" || qaState.recordSource === "api" ? "success" : qaState.source === "idle" ? "neutral" : "warning";
  const saveDisabled = Boolean(saveState.disabled || qaState.loading || qaState.saving || !qaState.selectedDeviceId);
  const saveModeDisabled = Boolean(
    deviceModeSaveState.disabled ||
      qaState.loading ||
      qaState.savingDeviceMode ||
      !qaState.selectedDeviceId ||
      !driverModeChanged,
  );
  const saveTitle =
    saveState.title ||
    (!qaState.selectedDeviceId
      ? "请先选择打印设备"
      : qaState.loading
        ? "设备验收记录刷新中"
        : "");
  const statusText = qaState.error
    ? qaState.error
    : latestRecord
      ? `最新记录 ${latestRecord.recordId} · ${formatPrinterDeviceQaDateTime(latestRecord.checkedAt)}`
      : qaState.loading
        ? "正在读取打印设备和验收记录"
        : "暂无已保存验收记录";

  return (
    <section className="detail-section driver-field-test-section printer-device-qa-section">
      <div className="section-title-row printer-device-qa-head">
        <div>
          <h3>打印设备验收</h3>
          <small>{statusText}</small>
        </div>
        <div className="printer-device-qa-head-actions">
          <StatusPill tone={sourceTone}>{sourceLabel}</StatusPill>
          <button type="button" onClick={onRefresh} disabled={qaState.loading}>
            {qaState.loading ? "刷新中" : "刷新"}
          </button>
        </div>
      </div>
      <div className="printer-device-qa-select-row">
        <label>
          <span>设备</span>
          <select
            value={qaState.selectedDeviceId ?? ""}
            onChange={(event) => onSelectDevice?.(event.target.value)}
            disabled={qaState.loading || !devices.length}
          >
            {devices.length ? null : <option value="">未配置打印设备</option>}
            {devices.map((device) => (
              <option value={device.printDeviceId} key={device.printDeviceId}>
                {device.name || device.printDeviceId}
              </option>
            ))}
          </select>
        </label>
        <span className={`driver-device-summary ${summary.tone}`}>{summary.label}</span>
      </div>
      <div className="printer-device-mode-row">
        <div className={`printer-device-mode-current ${currentDriverMode === "system_printer" ? "success" : "warning"}`}>
          <span>当前模式</span>
          <strong>{getPrintDriverModeLabel(currentDriverMode)}</strong>
          <small>{currentDriverMode === "system_printer" ? "允许真实系统打印" : "仅预览，不出纸"}</small>
        </div>
        <label>
          <span>目标模式</span>
          <select
            value={draftDriverMode}
            onChange={(event) => onChangeField?.("driverModeDraft", event.target.value)}
            disabled={qaState.loading || qaState.savingDeviceMode || !qaState.selectedDeviceId}
          >
            {PRINT_DRIVER_MODE_OPTIONS.map((option) => (
              <option value={option.value} key={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={onSaveDeviceMode}
          disabled={saveModeDisabled}
          title={
            deviceModeSaveState.title ||
            (!qaState.selectedDeviceId
              ? "请先选择打印设备"
              : !driverModeChanged
                ? "设备模式没有变化"
                : "")
          }
        >
          {qaState.savingDeviceMode ? "保存中" : "保存设备模式"}
        </button>
      </div>
      <small className="printer-device-mode-note">
        切到系统打印只代表 ERP 允许派发真实打印，仍需 V1 门禁、spool 回读和现场 QA 通过。
      </small>
      <div className="driver-field-test-form printer-device-qa-form">
        <label>
          <span>设备标签</span>
          <input
            value={qaState.deviceLabel ?? ""}
            onChange={(event) => onChangeField?.("deviceLabel", event.target.value)}
            placeholder="如 标签机A"
          />
        </label>
        <label>
          <span>驱动/连接</span>
          <input
            value={qaState.driverLabel ?? ""}
            onChange={(event) => onChangeField?.("driverLabel", event.target.value)}
            placeholder="如 EPSON LQ-610KII/615KII / USB"
          />
        </label>
        <label>
          <span>纸张</span>
          <input
            value={qaState.paperLabel ?? ""}
            onChange={(event) => onChangeField?.("paperLabel", event.target.value)}
            placeholder="如 80x60 热敏标签"
          />
        </label>
      </div>
      <div className="driver-field-test-list printer-device-qa-checks">
        {checks.map((item) => (
          <label className={`driver-field-test-row ${item.tone}`} key={item.key}>
            <div>
              <strong>{item.label}</strong>
              <span>{item.target}</span>
              <small>现场手动确认，保存后生成 PDQA 验收记录</small>
            </div>
            <select value={item.status} onChange={(event) => onChangeCheck?.(item.key, event.target.value)}>
              {PRINTER_DEVICE_FIELD_TEST_STATUS_OPTIONS.map((option) => (
                <option value={option.value} key={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="printer-device-qa-evidence">
        <div className="printer-device-qa-evidence-head">
          <strong>验收证据</strong>
          <span className={`driver-device-summary ${evidenceSummary.tone}`}>{evidenceSummary.label}</span>
        </div>
        <div className="printer-device-qa-evidence-grid">
          {PRINTER_DEVICE_FIELD_TEST_EVIDENCE_ITEMS.map((item) => (
            <label key={item.key}>
              <span>{item.label}</span>
              <input
                value={evidence[item.key] ?? ""}
                onChange={(event) => onChangeEvidence?.(item.key, event.target.value)}
                placeholder={item.placeholder}
              />
            </label>
          ))}
        </div>
      </div>
      <div className="driver-field-test-note printer-device-qa-note">
        <input
          value={qaState.note ?? ""}
          onChange={(event) => onChangeField?.("note", event.target.value)}
          placeholder="记录样张、扫码、驱动回写、作废重打问题"
        />
        <button type="button" onClick={onSave} disabled={saveDisabled} title={saveTitle}>
          {qaState.saving ? "保存中" : "保存验收"}
        </button>
      </div>
      {latestRecord ? (
        <div className="driver-field-test-record printer-device-qa-record">
          <strong>{latestRecord.recordId}</strong>
          <span>{latestRecord.summary?.label ?? "已记录"}</span>
          <small>
            {[latestRecord.deviceLabel, latestRecord.driverLabel, latestRecord.paperLabel, latestRecord.operatorName]
              .filter(Boolean)
              .join(" · ")}
          </small>
          {latestRecord.evidence ? (
            <small>{getPrinterDeviceFieldTestEvidenceSummary(latestRecord.evidence).label}</small>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function getPrinterDeviceDriverMode(printDevice = {}) {
  if (!printDevice || typeof printDevice !== "object") return "preview_only";
  return String(printDevice.settings?.driverMode ?? printDevice.driverMode ?? "preview_only").trim() || "preview_only";
}

function getPrintDriverModeLabel(driverMode) {
  const option = PRINT_DRIVER_MODE_OPTIONS.find((item) => item.value === driverMode);
  return option?.label ?? driverMode ?? "待补";
}

function getPrinterDeviceQaSourceLabel(qaState = {}) {
  if (qaState.loading) return "刷新中";
  if (qaState.saving) return "保存中";
  if (qaState.error) return "验收异常";
  if (qaState.recordSource === "api" || qaState.source === "api") return "后端验收";
  if (qaState.source === "local_fallback" || qaState.recordSource === "local_fallback") return "本地降级";
  if (qaState.source === "idle") return "未读取";
  return "待确认";
}

function formatPrinterDeviceQaDateTime(value) {
  if (!value) return "时间待补";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PrintDriverV1ReadinessPanel({ readinessState = {}, onRefresh }) {
  const readiness = readinessState.readiness;
  const summary = getPrintDriverV1ReadinessSummary(readinessState);
  const sourceLabel = getPrintDriverV1ReadinessSourceLabel(readinessState);
  const statusText = readinessState.error
    ? readinessState.error
    : readinessState.loading
      ? "正在读取 V1 打印上线门禁"
      : readinessState.lastSyncedAt
        ? `最新同步 ${readinessState.lastSyncedAt}`
        : "待刷新上线门禁";
  const rows = buildPrintDriverV1ReadinessRows(readiness);
  const criteria = Array.isArray(readiness?.criteria) ? readiness.criteria : [];
  const deviceReadiness = Array.isArray(readiness?.deviceReadiness) ? readiness.deviceReadiness : [];
  const remainingRisks = Array.isArray(readiness?.remainingV1Risks) ? readiness.remainingV1Risks : [];

  return (
    <section className={`detail-section print-driver-diagnostics-section print-driver-v1-readiness-section ${summary.tone}`}>
      <div className="section-title-row print-driver-diagnostics-head">
        <div>
          <h3>V1 打印上线门禁</h3>
          <small>{statusText}</small>
        </div>
        <div className="printer-device-qa-head-actions">
          <StatusPill tone={summary.tone}>{summary.label}</StatusPill>
          <button type="button" onClick={onRefresh} disabled={readinessState.loading}>
            {readinessState.loading ? "刷新中" : "刷新"}
          </button>
        </div>
      </div>
      <div className="print-driver-diagnostics-meta">
        <span>{sourceLabel}</span>
        <span>{getPrintDriverV1ReadinessSafetyLabel(readiness)}</span>
      </div>
      <div className="print-driver-diagnostics-grid">
        {rows.map((row) => (
          <div className={row.tone ?? ""} key={row.label}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
            <small>{row.meta}</small>
          </div>
        ))}
      </div>
      <div className="print-driver-readiness">
        <div className="print-driver-readiness-head">
          <strong>上线阻塞项</strong>
          <span className={summary.tone}>{readiness?.summary?.label ?? "未读取"}</span>
        </div>
        {criteria.length ? (
          <div className="print-driver-readiness-list">
            {criteria.map((item) => (
              <div className={`print-driver-readiness-row ${item.tone}`} key={item.key}>
                <span>{item.statusLabel}</span>
                <strong>{item.label}</strong>
                <small>{item.detail || "详情待补"}</small>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-row compact-empty">刷新后显示配置、spool、CUPS、设备和现场 QA 门禁。</div>
        )}
      </div>
      <div className="print-driver-readiness print-driver-v1-device-list">
        <div className="print-driver-readiness-head">
          <strong>必需设备组</strong>
          <span className={summary.tone}>{formatPrintDriverV1DeviceSummary(deviceReadiness)}</span>
        </div>
        {deviceReadiness.length ? (
          <div className="print-driver-readiness-list">
            {deviceReadiness.map((item) => (
              <div className={`print-driver-readiness-row ${item.ready ? "success" : "warning"}`} key={item.key}>
                <span>{item.ready ? "通过" : "阻塞"}</span>
                <strong>{item.label}</strong>
                <small>{formatPrintDriverV1DeviceDetail(item)}</small>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-row compact-empty">暂无设备门禁结果。</div>
        )}
      </div>
      {remainingRisks.length ? (
        <div className="print-driver-v1-risks">
          {remainingRisks.slice(0, 4).map((risk) => (
            <span key={risk}>{risk}</span>
          ))}
        </div>
      ) : null}
      <p className="print-driver-diagnostics-note">{getPrintDriverV1ReadinessNote(readinessState)}</p>
    </section>
  );
}

function getPrintDriverV1ReadinessSummary(readinessState = {}) {
  if (readinessState.loading) return { label: "读取中", tone: "neutral" };
  if (readinessState.source === "local_fallback") return { label: "后端未连", tone: "warning" };
  if (readinessState.error || readinessState.source === "api_error") return { label: "门禁异常", tone: "danger" };
  const readiness = readinessState.readiness;
  if (!readiness) return { label: "未读取", tone: "neutral" };
  if (readiness.ready) return { label: "V1 可验收", tone: "success" };
  const blockingCount = Number(readiness.summary?.blockingCount ?? 0);
  return { label: blockingCount ? `${blockingCount} 项阻塞` : "未就绪", tone: "danger" };
}

function getPrintDriverV1ReadinessSourceLabel(readinessState = {}) {
  if (readinessState.loading) return "读取中";
  if (readinessState.source === "api") return "后端门禁";
  if (readinessState.source === "local_fallback") return "本地降级";
  if (readinessState.source === "api_error") return "后端拒绝";
  if (readinessState.source === "idle") return "未读取";
  return "待确认";
}

function buildPrintDriverV1ReadinessRows(readiness = null) {
  const summary = readiness?.summary ?? {};
  const documents = Array.isArray(readiness?.requiredDocumentTypes) ? readiness.requiredDocumentTypes : [];
  const devices = Array.isArray(readiness?.deviceReadiness) ? readiness.deviceReadiness : [];
  const readyDevices = devices.filter((item) => item.ready).length;
  return [
    {
      label: "门禁状态",
      value: readiness?.ready ? "满足 V1 条件" : "未满足",
      meta: summary.label || "刷新后判断",
      tone: readiness?.ready ? "success" : "warning",
    },
    {
      label: "阻塞项",
      value: `${Number(summary.blockingCount ?? 0)} 项`,
      meta: `${Number(summary.passedCount ?? 0)}/${Number(summary.totalCount ?? 0)} 已通过`,
      tone: Number(summary.blockingCount ?? 0) ? "warning" : "success",
    },
    {
      label: "覆盖单据",
      value: `${documents.length} 类`,
      meta: documents.map(getPrintDriverDocumentTypeLabel).join(" / ") || "范围待补",
      tone: documents.length ? "success" : "warning",
    },
    {
      label: "设备组",
      value: `${readyDevices}/${devices.length} 通过`,
      meta: devices.map((item) => item.label).join(" / ") || "设备待补",
      tone: devices.length && readyDevices === devices.length ? "success" : "warning",
    },
  ];
}

function getPrintDriverV1ReadinessSafetyLabel(readiness = null) {
  if (!readiness) return "未读取安全护栏";
  const safeguards = readiness.safeguards ?? {};
  if (safeguards.physicalPrinterCalled) return "已触发物理打印：需检查";
  if (safeguards.commandValueExposed || safeguards.commandArgsExposed || safeguards.spoolPathExposed || safeguards.payloadExposed) {
    return "敏感信息暴露：需检查";
  }
  return safeguards.nonPrinting ? "门禁检查不触发实体打印" : "门禁安全状态待确认";
}

function formatPrintDriverV1DeviceSummary(devices = []) {
  if (!devices.length) return "0/0 通过";
  const readyCount = devices.filter((item) => item.ready).length;
  return `${readyCount}/${devices.length} 通过`;
}

function formatPrintDriverV1DeviceDetail(item = {}) {
  const device = item.printDevice;
  const qaLabel = item.latestFieldTestSummary?.label || (item.latestFieldTestRecord ? "QA 已记录" : "QA 待补");
  const paperLabel = [device?.paperName, device?.paperWidthMm && device?.paperHeightMm ? `${device.paperWidthMm}x${device.paperHeightMm}mm` : ""]
    .filter(Boolean)
    .join(" ");
  return [
    device?.name || "设备资料待补",
    `模式 ${device?.driverMode || "待补"}`,
    qaLabel,
    paperLabel,
  ].filter(Boolean).join(" · ");
}

function getPrintDriverDocumentTypeLabel(value) {
  const normalized = String(value ?? "").trim();
  const labels = {
    express_ltl_label: "快递快运标签",
    package_label: "包裹标签",
    outbound_note: "出库单",
    pickup_note: "自提单",
    delivery_note: "送货单",
  };
  return labels[normalized] ?? normalized;
}

function getPrintDriverV1ReadinessNote(readinessState = {}) {
  if (readinessState.source === "local_fallback") return "后端不可用时不能证明打印链路已满足 V1 上线条件。";
  const readiness = readinessState.readiness;
  if (!readiness) return "刷新后汇总配置、spool、CUPS 队列、设备模式和现场 QA。";
  if (readiness.ready) return "系统证据满足 V1 打印上线门禁；真实出纸、纸张对位和扫码仍按现场 QA 记录保留。";
  return "门禁仍有阻塞项，默认不能按真实打印链路上线。";
}

function PrintDriverDiagnosticsPanel({ driverState = {}, cupsDiagnosticsState = {}, onRefresh }) {
  const config = driverState.config;
  const summary = getPrintDriverDiagnosticsSummary(driverState);
  const sourceLabel = getPrintDriverDiagnosticsSourceLabel(driverState);
  const readinessChecklist = buildPrintDriverReadinessChecklist(config);
  const readinessSummary = getPrintDriverReadinessSummary(config);
  const cupsDiagnostics = cupsDiagnosticsState.diagnostics;
  const cupsSummary = getPrintDriverCupsDiagnosticsSummary(cupsDiagnosticsState);
  const cupsRows = buildPrintDriverCupsDiagnosticsRows(cupsDiagnostics);
  const cupsBlockers = Array.isArray(cupsDiagnostics?.blockers) ? cupsDiagnostics.blockers : [];
  const environmentPreflight = getPrintDriverEnvironmentPreflight(config);
  const integrationKit = buildOfficePrintDriverIntegrationKit({ config });
  const integrationKitSummary = getOfficePrintDriverIntegrationKitSummary(integrationKit);
  const statusText = driverState.error
    ? driverState.error
    : driverState.loading
      ? "正在读取后端打印驱动配置"
      : driverState.lastSyncedAt
        ? `最新同步 ${driverState.lastSyncedAt}`
        : "待刷新驱动诊断";
  const rows = buildPrintDriverDiagnosticsRows(config);

  return (
    <section className={`detail-section print-driver-diagnostics-section ${summary.tone}`}>
      <div className="section-title-row print-driver-diagnostics-head">
        <div>
          <h3>打印驱动诊断</h3>
          <small>{statusText}</small>
        </div>
        <div className="printer-device-qa-head-actions">
          <StatusPill tone={summary.tone}>{summary.label}</StatusPill>
          <button type="button" onClick={onRefresh} disabled={driverState.loading}>
            {driverState.loading ? "刷新中" : "刷新"}
          </button>
        </div>
      </div>
      <div className="print-driver-diagnostics-meta">
        <span>{sourceLabel}</span>
        <span>{getPrintDriverDiagnosticsSafetyLabel(config)}</span>
      </div>
      <div className="print-driver-diagnostics-grid">
        {rows.map((row) => (
          <div className={row.tone ?? ""} key={row.label}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
            <small>{row.meta}</small>
          </div>
        ))}
      </div>
      <div className="print-driver-readiness">
        <div className="print-driver-readiness-head">
          <strong>配置检查清单</strong>
          <span className={readinessSummary.tone}>{readinessSummary.label}</span>
        </div>
        <div className="print-driver-readiness-list">
          {readinessChecklist.map((item) => (
            <div className={`print-driver-readiness-row ${item.tone}`} key={item.key}>
              <span>{item.status}</span>
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </div>
          ))}
        </div>
      </div>
      <div className="print-driver-readiness print-driver-cups-diagnostics">
        <div className="print-driver-readiness-head">
          <strong>CUPS 队列预检</strong>
          <span className={cupsSummary.tone}>{cupsSummary.label}</span>
        </div>
        {cupsRows.length ? (
          <div className="print-driver-readiness-list">
            {cupsRows.map((item) => (
              <div className={`print-driver-readiness-row ${item.tone}`} key={item.key}>
                <span>{item.status}</span>
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-row compact-empty">刷新后显示 CUPS 队列状态预检。</div>
        )}
        {cupsBlockers.length ? (
          <div className="print-driver-v1-risks">
            {cupsBlockers.slice(0, 3).map((item) => (
              <span key={item.key}>{item.detail || item.label}</span>
            ))}
          </div>
        ) : null}
      </div>
      {environmentPreflight.items.length ? (
        <div className="print-driver-readiness print-driver-environment-preflight">
          <div className="print-driver-readiness-head">
            <strong>本机环境预检</strong>
            <span className={environmentPreflight.summary.tone}>{environmentPreflight.summary.label}</span>
          </div>
          <div className="print-driver-readiness-list">
            {environmentPreflight.items.map((item) => (
              <div className={`print-driver-readiness-row ${item.tone}`} key={item.key}>
                <span>{item.statusLabel}</span>
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="print-driver-integration-kit">
        <div className="print-driver-readiness-head">
          <strong>{integrationKit.title}</strong>
          <span className={integrationKit.ready ? "success" : "warning"}>{integrationKit.version}</span>
        </div>
        <div className="print-driver-integration-summary">
          <strong>{integrationKitSummary}</strong>
          <small>
            模式 {integrationKit.commandBridge.mode} · 参数 {integrationKit.commandBridge.argumentTemplate.join(" ")} · 状态 pending→sent / completed→printed / failed→failed / canceled→canceled
          </small>
        </div>
        <div className="print-driver-integration-list">
          {integrationKit.items.map((item) => (
            <div className={`print-driver-integration-row ${item.tone}`} key={item.key}>
              <span>{item.ready ? "可联调" : "待配置"}</span>
              <strong>{item.label}</strong>
              <small>{item.description}</small>
            </div>
          ))}
        </div>
      </div>
      <p className="print-driver-diagnostics-note">{getPrintDriverDiagnosticsNote(driverState)}</p>
    </section>
  );
}

function getPrintDriverCupsDiagnosticsSummary(cupsDiagnosticsState = {}) {
  if (cupsDiagnosticsState.loading) return { label: "读取中", tone: "neutral" };
  if (cupsDiagnosticsState.source === "local_fallback") return { label: "后端未连", tone: "warning" };
  if (cupsDiagnosticsState.error || cupsDiagnosticsState.source === "api_error") return { label: "预检异常", tone: "danger" };
  const diagnostics = cupsDiagnosticsState.diagnostics;
  if (!diagnostics) return { label: "未读取", tone: "neutral" };
  if (diagnostics.ready) return { label: "队列可访问", tone: "success" };
  if (diagnostics.status === "not_configured") return { label: "未配置", tone: "warning" };
  return { label: "未通过", tone: "danger" };
}

function buildPrintDriverCupsDiagnosticsRows(diagnostics = null) {
  if (!diagnostics) return [];
  const preflight = diagnostics.preflightResult;
  const safeguardsOk =
    diagnostics.safeguards?.nonPrinting !== false &&
    !diagnostics.safeguards?.physicalPrinterCalled &&
    !diagnostics.safeguards?.printFileCreated &&
    !diagnostics.safeguards?.commandValueExposed &&
    !diagnostics.safeguards?.commandArgsExposed &&
    !diagnostics.safeguards?.stdoutExposed &&
    !diagnostics.safeguards?.stderrExposed &&
    !diagnostics.safeguards?.payloadExposed;
  return [
    {
      key: "cups-printer-configured",
      label: "CUPS 打印机名",
      status: diagnostics.cupsPrinterConfigured ? "通过" : "待配置",
      detail: diagnostics.cupsPrinterConfigured ? "后端已配置目标队列名" : "需配置目标 CUPS 打印机名",
      tone: diagnostics.cupsPrinterConfigured ? "success" : "warning",
    },
    {
      key: "cups-printer-allowlist",
      label: "队列白名单",
      status: diagnostics.cupsPrinterAllowed ? "通过" : "阻塞",
      detail: diagnostics.cupsPrinterAllowed
        ? "目标队列命中后端白名单"
        : "目标队列未命中白名单，不能进入真实打印验收",
      tone: diagnostics.cupsPrinterAllowed ? "success" : "warning",
    },
    {
      key: "cups-status-command",
      label: "状态命令",
      status: diagnostics.cupsStatusCommandRunnable ? "通过" : "阻塞",
      detail: diagnostics.cupsStatusCommandRunnable
        ? `状态命令可运行，仅回传字节数 stdout ${preflight?.stdoutBytes ?? 0} / stderr ${preflight?.stderrBytes ?? 0}`
        : `状态命令未通过${preflight?.errorCode ? `：${preflight.errorCode}` : ""}`,
      tone: diagnostics.cupsStatusCommandRunnable ? "success" : "warning",
    },
    {
      key: "cups-non-printing-safeguards",
      label: "安全护栏",
      status: safeguardsOk ? "通过" : "需检查",
      detail: safeguardsOk
        ? "不读取 payload、不生成打印文件、不提交实体打印、不暴露命令或输出内容"
        : "预检安全护栏异常，需检查命令、输出或实体打印调用是否暴露",
      tone: safeguardsOk ? "success" : "danger",
    },
  ];
}

function getPrintDriverEnvironmentPreflight(config = null) {
  const fallback = {
    summary: {
      label: "0/0 通过",
      tone: "warning",
      passedCount: 0,
      totalCount: 0,
      blockingCount: 0,
    },
    items: [],
  };
  if (!config?.environmentPreflight || !Array.isArray(config.environmentPreflight.items)) return fallback;
  return {
    ...fallback,
    ...config.environmentPreflight,
    summary: {
      ...fallback.summary,
      ...(config.environmentPreflight.summary ?? {}),
    },
  };
}

function getPrintDriverDiagnosticsSummary(driverState = {}) {
  if (driverState.loading) return { label: "读取中", tone: "neutral" };
  if (driverState.source === "local_fallback") return { label: "后端未连", tone: "warning" };
  if (driverState.error || driverState.source === "api_error") return { label: "配置异常", tone: "danger" };
  const config = driverState.config;
  if (!config) return { label: "未读取", tone: "neutral" };
  if (config.realDispatchAvailable && config.commandBridgeStatusReadbackAvailable) {
    return { label: "命令桥+回读", tone: "success" };
  }
  if (config.realDispatchAvailable) return { label: "可提交命令桥", tone: "blue" };
  if (config.dryRunEnabled) return { label: "Dry-run", tone: "warning" };
  if (!config.systemPrinterEnabled) return { label: "系统打印未启用", tone: "warning" };
  return { label: "真实派发已保护", tone: "warning" };
}

function getPrintDriverDiagnosticsSourceLabel(driverState = {}) {
  if (driverState.loading) return "读取中";
  if (driverState.source === "api") return "后端配置";
  if (driverState.source === "local_fallback") return "本地降级";
  if (driverState.source === "api_error") return "后端拒绝";
  if (driverState.source === "idle") return "未读取";
  return "待确认";
}

function buildPrintDriverDiagnosticsRows(config = null) {
  const safeConfig = config ?? {};
  const allowList = Array.isArray(safeConfig.allowedPrinterNames) ? safeConfig.allowedPrinterNames : [];
  return [
    {
      label: "适配器",
      value: getPrintDriverAdapterKindLabel(safeConfig.kind),
      meta: safeConfig.adapterName || "名称待补",
      tone: safeConfig.dryRunEnabled ? "warning" : "",
    },
    {
      label: "系统打印",
      value: safeConfig.systemPrinterEnabled ? "已启用" : "未启用",
      meta: safeConfig.dryRunEnabled ? "Dry-run 不触碰实体打印机" : "实体打印需后端环境变量开启",
      tone: safeConfig.systemPrinterEnabled ? "success" : "warning",
    },
    {
      label: "桥接方式",
      value: getPrintDriverBridgeKindLabel(safeConfig.systemPrinterAdapterKind),
      meta: safeConfig.systemPrinterCommandConfigured ? "命令已配置" : "命令未配置",
      tone: safeConfig.systemPrinterCommandConfigured ? "success" : "warning",
    },
    {
      label: "状态回读",
      value: safeConfig.commandBridgeStatusReadbackAvailable ? "可读本地 spool" : "未启用",
      meta: safeConfig.systemPrinterCommandTimeoutMs ? `${safeConfig.systemPrinterCommandTimeoutMs}ms 超时` : "无超时配置",
      tone: safeConfig.commandBridgeStatusReadbackAvailable ? "success" : "warning",
    },
    {
      label: "打印机白名单",
      value: allowList.length ? `${allowList.length} 台` : "未配置",
      meta: allowList.join(" / ") || "真实派发前必须限制目标设备",
      tone: allowList.length ? "success" : "warning",
    },
    {
      label: "真实派发",
      value: safeConfig.realDispatchAvailable ? "可提交命令桥" : "已保护",
      meta: safeConfig.safeguards?.physicalPrinterCallsBlocked ? "实体打印调用被保护" : "实体打印调用可达",
      tone: safeConfig.realDispatchAvailable ? "success" : "warning",
    },
  ];
}

function getPrintDriverAdapterKindLabel(value) {
  const normalized = String(value ?? "").trim();
  if (normalized === "dry_run_adapter") return "Dry-run";
  if (normalized === "guarded_adapter") return "Guarded";
  if (normalized === "unknown") return "未知";
  return normalized || "未读取";
}

function getPrintDriverBridgeKindLabel(value) {
  const normalized = String(value ?? "").trim();
  if (normalized === "command_bridge") return "命令桥";
  if (normalized === "none") return "未选择";
  if (normalized === "unsupported") return "不支持";
  if (normalized === "unknown") return "未知";
  return normalized || "未读取";
}

function getPrintDriverDiagnosticsSafetyLabel(config = null) {
  if (!config) return "未读取驱动保护状态";
  if (config.safeguards?.commandValueExposed) return "命令值暴露：需检查";
  if (config.safeguards?.physicalPrinterCallsBlocked) return "实体打印调用受保护";
  return "实体打印调用可达";
}

function getPrintDriverDiagnosticsNote(driverState = {}) {
  const config = driverState.config;
  if (driverState.source === "local_fallback") return "后端不可用时只显示保护性降级状态，不能据此判断实体打印已完成。";
  if (!config) return "刷新后查看后端驱动模式、命令桥和状态回读能力。";
  if (config.realDispatchAvailable && config.commandBridgeStatusReadbackAvailable) {
    return "可提交命令桥；是否完成仍以本地 spool 状态回读和现场验收为准。";
  }
  if (config.realDispatchAvailable) return "可提交命令桥；提交成功不等于纸张已打出，仍需现场验收。";
  return "真实派发当前被保护；打印作业可预览或排队，但不能视为实体打印完成。";
}

function PrintJobQueuePanel({
  queueState = {},
  dispatchState = {},
  retryState = {},
  onRefresh,
  onDispatch,
  onRetry,
}) {
  const items = Array.isArray(queueState.items) ? queueState.items.filter(Boolean) : [];
  const visibleItems = items.slice(0, 6);
  const failedCount = items.filter((item) => item.jobStatus === "failed").length;
  const queuedCount = items.filter((item) => item.jobStatus === "queued").length;
  const sourceLabel = getPrintJobQueueSourceLabel(queueState);
  const sourceTone = queueState.error ? "danger" : queueState.source === "api" ? "success" : queueState.source === "idle" ? "neutral" : "warning";
  const statusText = queueState.error
    ? queueState.error
    : queueState.loading
      ? "正在读取后端打印作业状态"
      : queueState.lastSyncedAt
        ? `最新同步 ${queueState.lastSyncedAt}`
        : "待刷新打印作业";

  return (
    <section className="detail-section print-job-queue-section">
      <div className="section-title-row print-job-queue-head">
        <div>
          <h3>打印作业池</h3>
          <small>{statusText}</small>
        </div>
        <div className="printer-device-qa-head-actions">
          <StatusPill tone={sourceTone}>{sourceLabel}</StatusPill>
          <button type="button" onClick={onRefresh} disabled={queueState.loading}>
            {queueState.loading ? "刷新中" : "刷新"}
          </button>
        </div>
      </div>
      <div className="print-job-stats">
        <span>最近 {items.length}</span>
        <span>待派发 {queuedCount}</span>
        <span className={failedCount ? "danger" : ""}>失败 {failedCount}</span>
      </div>
      {visibleItems.length ? (
        <div className="print-job-list">
          {visibleItems.map((printJob) => {
            const statusTone = getPrintJobStatusTone(printJob.jobStatus);
            const canDispatch = printJob.jobStatus === "queued";
            const canRetry = printJob.jobStatus === "failed" || printJob.jobStatus === "canceled";
            const actionState = canDispatch ? dispatchState : canRetry ? retryState : {};
            const busy = queueState.actionJobId === printJob.printJobId;
            const actionBlockedByOther = Boolean(queueState.actionJobId && !busy);
            const actionDisabled = Boolean(actionState.disabled || queueState.loading || actionBlockedByOther || (!canDispatch && !canRetry));
            const actionTitle =
              actionState.title ||
              (actionBlockedByOther
                ? "已有打印作业操作进行中"
                : !canDispatch && !canRetry
                  ? "当前状态不需要办公室手动操作"
                  : "");
            return (
              <div className={`print-job-row ${statusTone}`} key={printJob.printJobId}>
                <div className="print-job-main">
                  <div>
                    <strong>{printJob.printJobId}</strong>
                    <StatusPill tone={statusTone}>{getPrintJobStatusLabel(printJob.jobStatus)}</StatusPill>
                  </div>
                  <span>{getPrintJobSummary(printJob)}</span>
                  <small>{getPrintJobMetaText(printJob)}</small>
                  {printJob.errorMessage ? <em>{printJob.errorMessage}</em> : null}
                </div>
                <div className="print-job-actions">
                  {canDispatch ? (
                    <button type="button" disabled={actionDisabled} title={actionTitle} onClick={() => onDispatch?.(printJob.printJobId)}>
                      {busy ? "派发中" : "派发"}
                    </button>
                  ) : canRetry ? (
                    <button type="button" disabled={actionDisabled} title={actionTitle} onClick={() => onRetry?.(printJob.printJobId)}>
                      {busy ? "重试中" : "重试"}
                    </button>
                  ) : (
                    <span>{getPrintJobActionHint(printJob.jobStatus)}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-row">暂无打印作业，打印单据后会在这里显示队列状态。</div>
      )}
    </section>
  );
}

function getPrintJobQueueSourceLabel(queueState = {}) {
  if (queueState.loading) return "刷新中";
  if (queueState.error) return "作业异常";
  if (queueState.source === "api") return "后端作业";
  if (queueState.source === "local_fallback") return "本地降级";
  if (queueState.source === "idle") return "未读取";
  return "待确认";
}

function getPrintJobStatusLabel(status) {
  const normalized = String(status ?? "").trim();
  const labels = {
    queued: "待派发",
    sent: "已派发",
    printed: "已打印",
    failed: "失败",
    canceled: "已取消",
    preview_only: "仅预览",
  };
  return (labels[normalized] ?? normalized) || "状态待补";
}

function getPrintJobStatusTone(status) {
  if (status === "printed") return "success";
  if (status === "sent") return "blue";
  if (status === "queued") return "warning";
  if (status === "failed") return "danger";
  if (status === "canceled") return "neutral";
  return "neutral";
}

function getPrintJobDocumentLabel(documentType) {
  const normalized = String(documentType ?? "").trim();
  const labels = {
    express_ltl_label: "包裹标签",
    package_label: "包裹标签",
    pickup_note: "自提单",
    delivery_note: "送货单",
    outbound_note: "出库单",
  };
  return (labels[normalized] ?? normalized) || "单据待补";
}

function getPrintJobSummary(printJob = {}) {
  return [
    getPrintJobDocumentLabel(printJob.documentType),
    printJob.targetId,
    printJob.printDeviceName || printJob.printDeviceId || "设备待补",
  ].filter(Boolean).join(" / ");
}

function getPrintJobMetaText(printJob = {}) {
  const attemptNo = Number(printJob.attemptNo ?? 0);
  return [
    printJob.printRecordId,
    attemptNo > 0 ? `第 ${attemptNo} 次` : "首次",
    printJob.driverMode || "驱动待补",
    formatPrintJobTimeLabel(printJob.updatedAt || printJob.finishedAt || printJob.sentAt || printJob.queuedAt || printJob.createdAt),
  ].filter(Boolean).join(" · ");
}

function getPrintJobActionHint(status) {
  if (status === "preview_only") return "预览";
  if (status === "sent") return "等回写";
  if (status === "printed") return "完成";
  return "无操作";
}

function formatPrintJobTimeLabel(value) {
  if (!value) return "时间待补";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ProductionPackingSourceDetailCard({ detailState, detailMode }) {
  const sourceLabel = getProductionPackingDetailSourceLabel(detailState?.source);
  const sourceTone = detailState?.source === "api" ? "success" : detailState?.error ? "danger" : "warning";
  const rows = buildProductionPackingSourceDetailRows(detailState, detailMode);

  return (
    <section className="detail-section production-source-detail-section">
      <div className="section-head-row">
        <h3>来源详情</h3>
        <StatusPill tone={sourceTone}>{sourceLabel}</StatusPill>
      </div>
      <InfoGrid rows={rows} />
    </section>
  );
}

export function WorkshopMobilePage({ orderLines, inventoryRecords, productionPacking, onAction, helpers }) {
  const {
    buildProductionTaskId,
    findCustomer,
    findProductionInventoryItem,
    getLineColorSpecLabel,
    getLinePrintSide,
    getLineRemark,
    getOrderLineShortNo,
    getUiActionState,
    statusTone,
  } = helpers;
  const taskListFromApi = isProductionPackingTaskListFromApi(productionPacking);
  const taskListStatusText = getProductionPackingTaskListStatusText(productionPacking);
  const apiProductionLines = Array.isArray(productionPacking.productionTasks) ? productionPacking.productionTasks.filter(Boolean) : [];
  const productionLines = taskListFromApi ? apiProductionLines.filter(isProductionReportCandidate) : orderLines.filter(isProductionReportCandidate);
  const allPackingTasks = buildPackingTaskRows({
    orderLines,
    packingTasks: productionPacking.packingTasks,
    includeLocalProjections: !taskListFromApi,
  });
  const openPackingTasks = allPackingTasks.filter((task) => task.status !== "已完成");
  const [mode, setMode] = useState(productionLines.length ? "生产报工" : "打包任务");
  const [selectedProductionLineId, setSelectedProductionLineId] = useState(productionLines[0]?.id ?? "");
  const [selectedPackingTaskId, setSelectedPackingTaskId] = useState(openPackingTasks[0]?.packingTaskId ?? "");
  const [reportInputs, setReportInputs] = useState({});
  const [packingInputs, setPackingInputs] = useState({});
  const [finishedPhotoInputs, setFinishedPhotoInputs] = useState({});
  const selectedProductionLine = productionLines.find((item) => item.id === selectedProductionLineId) ?? productionLines[0] ?? null;
  const selectedPackingTask = openPackingTasks.find((item) => item.packingTaskId === selectedPackingTaskId) ?? openPackingTasks[0] ?? null;
  const resolveInventoryItem = (line, task = null) => findProductionInventoryItem(line, inventoryRecords) ?? line?.inventoryItem ?? task?.inventoryItem ?? null;
  const selectedLine = mode === "打包任务" ? selectedPackingTask?.orderLine : selectedProductionLine;
  const selectedInventoryItem = selectedLine ? resolveInventoryItem(selectedLine, selectedPackingTask) : null;
  const reportState = getUiActionState("workshopMobile", "报工完成");
  const reportDailyState = getUiActionState("workshopMobile", "报当日数量");
  const uploadFinishedPhotoState = getUiActionState("workshopMobile", "上传成品图");
  const packingState = getUiActionState("workshopMobile", "提交打包完成");
  const selectedFinishedGoodsPhoto = getProductionFinishedGoodsPhoto(selectedProductionLine);
  const selectedFinishedGoodsPhotoFile = selectedProductionLine ? finishedPhotoInputs[selectedProductionLine.id]?.file ?? null : null;
  const selectedFinishedGoodsPhotoRequired = isProductionFinishedGoodsPhotoRequired(selectedProductionLine);
  const reportQualifiedQty = getNumericInput(reportInputs, selectedProductionLine?.id, "qualifiedQty", selectedProductionLine?.qty ?? 0);
  const reportExceptionQty = getNumericInput(reportInputs, selectedProductionLine?.id, "exceptionQty", 0);
  const reportMachineCount = getNumericInput(reportInputs, selectedProductionLine?.id, "machineCount", "");
  const packingActualQty = getNumericInput(packingInputs, selectedPackingTask?.packingTaskId, "actualPackedQty", selectedPackingTask?.plannedQty ?? 0);
  const packingPackageCount = getNumericInput(packingInputs, selectedPackingTask?.packingTaskId, "packageCount", selectedPackingTask?.packageCount ?? inferPackageCountFromQty(selectedPackingTask?.plannedQty));
  const packingLabelsPrinted = getBooleanInput(packingInputs, selectedPackingTask?.packingTaskId, "labelsPrinted", false);
  const stats = [
    ["生产待报工", productionLines.length, productionLines.length ? "warning" : "success"],
    ["跨日继续", productionLines.filter((line) => getProductionDailyProgress(line)?.carryOver).length, "blue"],
    ["打包待提交", openPackingTasks.length, openPackingTasks.length ? "blue" : "success"],
    ["已打包", allPackingTasks.filter((task) => task.status === "已完成").length, "success"],
  ];
  const reportDisabled = reportState.disabled || !selectedProductionLine || !selectedInventoryItem;
  const reportTitle = reportState.title || (!selectedInventoryItem ? "未找到匹配库存键，不能报工入库" : "");
  const reportDailyDisabled = reportDailyState.disabled || !selectedProductionLine;
  const reportDailyTitle = reportDailyState.title || "";
  const finishedPhotoUploadDisabled = uploadFinishedPhotoState.disabled || !selectedProductionLine || !selectedFinishedGoodsPhotoRequired;
  const finishedPhotoUploadTitle =
    uploadFinishedPhotoState.title ||
    (!selectedProductionLine
      ? "请先选择生产任务"
      : !selectedFinishedGoodsPhotoRequired
        ? "当前任务不强制上传成品图"
        : selectedFinishedGoodsPhotoFile
          ? `上传 ${selectedFinishedGoodsPhotoFile.name || "所选成品图"}`
          : "未选择文件时会登记一张样张，用于原型验证");
  const packingDisabled = packingState.disabled || !selectedPackingTask;
  const packingTitle = packingState.title || "";

  function selectProductionLine(lineId) {
    setSelectedProductionLineId(lineId);
    setMode("生产报工");
  }

  function selectPackingTask(taskId) {
    setSelectedPackingTaskId(taskId);
    setMode("打包任务");
  }

  function updateReportInput(field, value) {
    if (!selectedProductionLine) return;
    setReportInputs((current) => ({
      ...current,
      [selectedProductionLine.id]: {
        ...(current[selectedProductionLine.id] ?? {}),
        [field]: value,
      },
    }));
  }

  function updateFinishedPhotoFile(file) {
    if (!selectedProductionLine) return;
    setFinishedPhotoInputs((current) => ({
      ...current,
      [selectedProductionLine.id]: {
        ...(current[selectedProductionLine.id] ?? {}),
        file: file ?? null,
      },
    }));
  }

  function updatePackingInput(field, value) {
    if (!selectedPackingTask) return;
    setPackingInputs((current) => ({
      ...current,
      [selectedPackingTask.packingTaskId]: {
        ...(current[selectedPackingTask.packingTaskId] ?? {}),
        [field]: value,
      },
    }));
  }

  return (
    <section className="page-grid workshop-mobile-layout">
      <div className="table-pane">
        <MetricStrip items={stats} />
        <div className="panel-head compact mobile-work-head">
          <div>
            <h2>移动任务池</h2>
            <span>车间只报合格数和机器计数；打包只报实包数和包裹数。{taskListStatusText}</span>
          </div>
          <Segmented value={mode} onChange={setMode} items={["生产报工", "打包任务"]} />
        </div>
        <div className="mobile-task-list">
          {mode === "生产报工" ? (
            productionLines.length ? productionLines.map((line) => {
              const customer = findCustomer(line.customerId);
              const inventoryItem = resolveInventoryItem(line);
              const lineTitle = `${getProductionProcessLabel(line)} · ${getOrderLineShortNo(line)}`;
              return (
                <button className={`mobile-task-row ${line.id === selectedProductionLine?.id ? "active" : ""}`} key={line.id} onClick={() => selectProductionLine(line.id)}>
                  <div>
                    <strong>{lineTitle}</strong>
                    <span>{customer.name} · {line.product} {line.size}</span>
                    <small>{getLineColorSpecLabel(line)} · {line.qty} 个 · {formatProductionDailyProgressLabel(line) || line.latest}</small>
                  </div>
                  <StatusPill tone={inventoryItem ? statusTone(line.status) : "danger"}>{inventoryItem ? line.status : "缺库存键"}</StatusPill>
                </button>
              );
            }) : <div className="empty-row">暂无待报工生产任务</div>
          ) : (
            openPackingTasks.length ? openPackingTasks.map((task) => {
              const line = task.orderLine;
              const customer = findCustomer(line.customerId);
              return (
                <button className={`mobile-task-row ${task.packingTaskId === selectedPackingTask?.packingTaskId ? "active" : ""}`} key={task.packingTaskId} onClick={() => selectPackingTask(task.packingTaskId)}>
                  <div>
                    <strong>打包 · {getOrderLineShortNo(line)}</strong>
                    <span>{customer.name} · {line.product} {line.size}</span>
                    <small>{getLineColorSpecLabel(line)} · 计划 {task.plannedQty} 个 · {task.packageCount ?? inferPackageCountFromQty(task.plannedQty)} 包</small>
                  </div>
                  <StatusPill tone={statusTone(task.status)}>{task.status}</StatusPill>
                </button>
              );
            }) : <div className="empty-row">暂无待打包任务</div>
          )}
        </div>
      </div>
      <DetailPane
        title={mode === "打包任务" ? selectedPackingTask?.packingTaskId ?? "打包任务" : selectedProductionLine ? buildProductionTaskId(selectedProductionLine) : "生产报工"}
        subtitle={selectedLine ? `${findCustomer(selectedLine.customerId).name} · ${selectedLine.id}` : "未选择"}
      >
        {selectedLine ? (
          <>
            <InfoGrid
              rows={[
                ["岗位入口", mode === "打包任务" ? "打包工手机端" : `${getProductionProcessLabel(selectedLine)}手机端`],
                ["货品", `${selectedLine.product} / ${selectedLine.size}`],
                ["颜色/单双面", `${getLineColorSpecLabel(selectedLine)} / ${getLinePrintSide(selectedLine)}`],
                ["数量", `${selectedLine.qty} 个`],
                ["交付", `${selectedLine.fulfillment} · ${selectedLine.latest}`],
                ["库存键", selectedInventoryItem ? `${selectedInventoryItem.id} / ${selectedInventoryItem.zone}` : "未找到匹配库存键"],
                ["跨日进度", formatProductionDailyProgressLabel(selectedLine) || "暂无日报数"],
                ["成品图", mode === "生产报工" ? formatProductionFinishedGoodsPhotoLabel(selectedFinishedGoodsPhoto) : "生产侧确认"],
                ["备注", getLineRemark(selectedLine) || "无"],
              ]}
            />
            {mode === "生产报工" ? (
              <>
                <section className="detail-section">
                  <h3>车间报工</h3>
                  <div className="detail-form">
                    <label>
                      <span>合格数量</span>
                      <input type="number" min="1" value={reportQualifiedQty} onChange={(event) => updateReportInput("qualifiedQty", event.target.value)} />
                    </label>
                    <label>
                      <span>异常/废品数</span>
                      <input type="number" min="0" value={reportExceptionQty} onChange={(event) => updateReportInput("exceptionQty", event.target.value)} />
                    </label>
                    <label>
                      <span>机器计数/动作次数</span>
                      <input type="number" min="0" placeholder="只作凭证" value={reportMachineCount} onChange={(event) => updateReportInput("machineCount", event.target.value)} />
                    </label>
                  </div>
                  <p>报当日数量只记录跨日继续和剩余数量，不入库；报工完成才会进入库存和后续打包。</p>
                </section>
                <section className="detail-section finished-goods-photo-section">
                  <div className="section-title-row">
                    <h3>定制成品图</h3>
                    <StatusPill tone={getProductionFinishedGoodsPhotoTone(selectedFinishedGoodsPhoto)}>
                      {selectedFinishedGoodsPhoto.status}
                    </StatusPill>
                  </div>
                  <InfoGrid
                    rows={[
                      ["当前附件", selectedFinishedGoodsPhoto.fileName || selectedFinishedGoodsPhoto.attachmentId || "未上传"],
                      ["上传时间", selectedFinishedGoodsPhoto.uploadedAt ? formatCompactDateTime(selectedFinishedGoodsPhoto.uploadedAt) : "未上传"],
                      ["办公室复核", selectedFinishedGoodsPhoto.reviewedAt ? formatCompactDateTime(selectedFinishedGoodsPhoto.reviewedAt) : "待确认"],
                      ["退回原因", selectedFinishedGoodsPhoto.rejectedReason || "无"],
                    ]}
                  />
                  <div className="detail-form single">
                    <label>
                      <span>拍照/选择图片</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        disabled={finishedPhotoUploadDisabled}
                        onChange={(event) => updateFinishedPhotoFile(event.target.files?.[0] ?? null)}
                      />
                    </label>
                  </div>
                  <p>车间只上传或重拍成品图；是否合格和是否通知客户由办公室复核确认。</p>
                  <div className="action-row">
                    <button
                      disabled={finishedPhotoUploadDisabled}
                      title={finishedPhotoUploadTitle}
                      onClick={() =>
                        onAction("上传成品图", {
                          entryLabel: "车间手机端",
                          orderLineId: selectedProductionLine.id,
                          orderLine: selectedProductionLine,
                          productionTaskId: selectedProductionLine.productionTaskId || buildProductionTaskId(selectedProductionLine),
                          photoFile: selectedFinishedGoodsPhotoFile,
                        })
                      }
                    >
                      {selectedFinishedGoodsPhoto.attachmentId ? "重拍/重传成品图" : "上传成品图"}
                    </button>
                  </div>
                </section>
                <div className="action-row">
                  <button
                    disabled={reportDailyDisabled}
                    title={reportDailyTitle}
                    onClick={() =>
                      onAction("报当日数量", {
                        entryLabel: "车间手机端",
                        orderLineId: selectedProductionLine.id,
                        orderLine: selectedProductionLine,
                        dailyQualifiedQty: Number(reportQualifiedQty || 0),
                        exceptionQty: Number(reportExceptionQty || 0),
                        machineCount: reportMachineCount === "" ? undefined : Number(reportMachineCount),
                      })
                    }
                  >
                    报当日数量
                  </button>
                  <button
                    className="primary-action"
                    disabled={reportDisabled}
                    title={reportTitle}
                    onClick={() =>
                      onAction("报工完成", {
                        entryLabel: "车间手机端",
                        orderLineId: selectedProductionLine.id,
                        orderLine: selectedProductionLine,
                        qualifiedQty: Number(reportQualifiedQty || 0),
                        exceptionQty: Number(reportExceptionQty || 0),
                        machineCount: reportMachineCount === "" ? undefined : Number(reportMachineCount),
                      })
                    }
                  >
                    报工完成
                  </button>
                </div>
              </>
            ) : (
              <>
                <section className="detail-section">
                  <h3>打包提交</h3>
                  <div className="detail-form">
                    <label>
                      <span>实际打包数量</span>
                      <input type="number" min="1" value={packingActualQty} onChange={(event) => updatePackingInput("actualPackedQty", event.target.value)} />
                    </label>
                    <label>
                      <span>包裹数</span>
                      <input type="number" min="1" value={packingPackageCount} onChange={(event) => updatePackingInput("packageCount", event.target.value)} />
                    </label>
                    <label>
                      <span>标签状态</span>
                      <select value={packingLabelsPrinted ? "已打印" : "未打印"} onChange={(event) => updatePackingInput("labelsPrinted", event.target.value === "已打印")}>
                        <option>未打印</option>
                        <option>已打印</option>
                      </select>
                    </label>
                  </div>
                  <p>打包完成生成包裹和标签下一步；不会扣库存，仍由出库完成或快递快运拉走确认扣减。</p>
                </section>
                <div className="action-row">
                  <button
                    className="primary-action"
                    disabled={packingDisabled}
                    title={packingTitle}
                    onClick={() =>
                      onAction("提交打包完成", {
                        entryLabel: "打包手机端",
                        packingTaskId: selectedPackingTask.packingTaskId,
                        packingTask: selectedPackingTask,
                        orderLineId: selectedPackingTask.orderLineId,
                        orderLine: selectedPackingTask.orderLine,
                        actualPackedQty: Number(packingActualQty || 0),
                        packageCount: Number(packingPackageCount || 1),
                        labelsPrinted: packingLabelsPrinted,
                      })
                    }
                  >
                    提交打包完成
                  </button>
                </div>
              </>
            )}
            <Timeline
              items={[
                mode === "打包任务" ? "生产完成进入打包手机端" : "发布任务到车间手机端",
                mode === "打包任务" ? "打包工填写实包数量和包裹数" : "岗位工填写合格数量和机器计数",
                mode === "打包任务" ? "包裹进入标签/出库下一步" : "合格品入库并占用给订单",
                "关键动作写后端 API 和操作日志",
              ]}
            />
          </>
        ) : (
          <div className="empty-row">当前岗位暂无任务</div>
        )}
      </DetailPane>
    </section>
  );
}

export function DriverMobilePage({ tasks = [], selectedTaskId, setSelectedTaskId, meta = {}, onAction, helpers }) {
  const { currentUser, getUiActionState, statusTone } = helpers;
  const [view, setView] = useState("待送货");
  const [taskInputs, setTaskInputs] = useState({});
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState({ watermarked: "", signature: "" });
  const packageCameraVideoRef = useRef(null);
  const packageCameraScannerRef = useRef(null);
  const deliveryPhotoVideoRef = useRef(null);
  const deliveryPhotoCameraRef = useRef(null);
  const visibleTasks = tasks.filter((task) => view === "全部" || task.status === view);
  const selectedTask =
    visibleTasks.find((item) => item.fulfillmentId === selectedTaskId) ??
    visibleTasks[0] ??
    tasks.find((item) => item.fulfillmentId === selectedTaskId) ??
    tasks[0] ??
    null;
  const currentInput = taskInputs[selectedTask?.fulfillmentId] ?? {};
  const watermarkedPhotoFile = currentInput.watermarkedPhotoFile ?? null;
  const signaturePhotoFile = currentInput.signaturePhotoFile ?? null;
  const watermarkedPhotoAttachmentId = currentInput.watermarkedPhotoAttachmentId ?? selectedTask?.watermarkedPhotoAttachmentId ?? "";
  const signaturePhotoAttachmentId = currentInput.signaturePhotoAttachmentId ?? selectedTask?.signaturePhotoAttachmentId ?? "";
  const watermarkedPhotoAttached =
    currentInput.watermarkedPhotoAttached === true ||
    Boolean(watermarkedPhotoFile) ||
    Boolean(watermarkedPhotoAttachmentId) ||
    selectedTask?.watermarkedPhotoAttached === true;
  const signaturePhotoAttached =
    currentInput.signaturePhotoAttached === true ||
    Boolean(signaturePhotoFile) ||
    Boolean(signaturePhotoAttachmentId) ||
    selectedTask?.signaturePhotoAttached === true;
  const receiverName = currentInput.receiverName ?? selectedTask?.receiverName ?? "";
  const paperNoteStatus = currentInput.paperNoteStatus ?? selectedTask?.paperNoteStatus ?? "已交回";
  const watermarkLocationLabel = currentInput.watermarkLocationLabel ?? selectedTask?.watermarkLocationLabel ?? selectedTask?.addressArea ?? "";
  const watermarkGeoPoint = currentInput.watermarkGeoPoint ?? selectedTask?.watermarkGeoPoint ?? "";
  const watermarkLocationStatus = currentInput.watermarkLocationStatus ?? "";
  const deliveryPhotoCameraActive = currentInput.deliveryPhotoCameraActive === true;
  const deliveryPhotoCameraStatus = currentInput.deliveryPhotoCameraStatus ?? "";
  const exceptionReason = currentInput.exceptionReason ?? "装车少货";
  const remark = currentInput.remark ?? "";
  const actualQty = currentInput.actualQty ?? selectedTask?.qty ?? 0;
  const checkedPackageIds = currentInput.checkedPackageIds ?? selectedTask?.packageChecklist?.filter((item) => item.checked === true).map((item) => item.packageId) ?? [];
  const packageScanText = currentInput.packageScanText ?? "";
  const packageScanStatus = currentInput.packageScanStatus ?? "";
  const packageCameraScanActive = currentInput.packageCameraScanActive === true;
  const packageCameraScanStatus = currentInput.packageCameraScanStatus ?? "";
  const packageNativeScanActive = currentInput.packageNativeScanActive === true;
  const nativePackageScanSupport = getDriverNativePackageScannerSupport();
  const packageNativeScanStatus = currentInput.packageNativeScanStatus ?? nativePackageScanSupport.message;
  const nativeNavigationActive = currentInput.nativeNavigationActive === true;
  const nativeNavigationSupport = getDriverNativeNavigationSupport();
  const nativeNavigationStatus = currentInput.nativeNavigationStatus ?? nativeNavigationSupport.message;
  const nativeNavigationStatusTone = currentInput.nativeNavigationStatusTone ?? (nativeNavigationSupport.supported ? "success" : "neutral");
  const nativeCapabilityDiagnostics = getDriverNativeCapabilityDiagnostics();
  const watermarkPreview = selectedTask
    ? buildDriverWatermarkPreview({
        task: selectedTask,
        currentUser,
        watermarkLocationLabel,
        watermarkGeoPoint,
      })
    : null;
  const watermarkPreviewLines = getDriverWatermarkOverlayLines(watermarkPreview?.text);
  const routeContext = selectedTask ? getDriverRouteExecutionContext(tasks, selectedTask) : null;
  const navigationUrl = selectedTask ? getDriverNavigationUrl(selectedTask) : "";
  const nativeIntegrationKit = selectedTask
    ? buildDriverNativeIntegrationKit({
        task: selectedTask,
        operatorId: currentUser.userId ?? currentUser.id,
        navigationUrl,
        geoPoint: watermarkGeoPoint,
      })
    : null;
  const nativeIntegrationKitSummary = getDriverNativeIntegrationKitSummary(nativeIntegrationKit);
  const packageCheckState = selectedTask ? getDriverLoadPackageCheckState(selectedTask, checkedPackageIds) : { checklist: [], allChecked: true, summary: "无包裹" };
  const loadBlockedByPackageCheck = selectedTask?.status === "待送货" && !packageCheckState.allChecked;
  const loadState = getUiActionState("driverMobile", "确认已装车");
  const completeState = getUiActionState("driverMobile", "提交送达");
  const exceptionAction = selectedTask?.status === "待送货" ? "装车异常" : "送货异常";
  const exceptionState = getUiActionState("driverMobile", exceptionAction);
  const fieldTestSaveState = getUiActionState("driverMobile", "保存验收");
  const stats = [
    ["待送货", tasks.filter((item) => item.status === "待送货").length, "warning"],
    ["配送中", tasks.filter((item) => item.status === "配送中").length, "blue"],
    ["已完成", tasks.filter((item) => item.status === "已完成").length, "success"],
    ["异常", tasks.filter((item) => item.status === "送货异常").length, "danger"],
  ];
  const sourceText = meta.loading
    ? "同步中"
    : meta.source === "api"
      ? `后端 API${meta.lastSyncedAt ? ` · ${meta.lastSyncedAt}` : ""}`
      : "本地任务";
  const deviceReadiness = getDriverDeviceReadiness();
  const fieldTestContext = getDriverDeviceFieldTestContext();
  const deviceFieldTestChecks = currentInput.deviceFieldTestChecks ?? createDriverDeviceFieldTestChecks(deviceReadiness);
  const deviceFieldTestSummary = getDriverDeviceFieldTestSummary(deviceFieldTestChecks);
  const deviceFieldTestRecord = currentInput.deviceFieldTestRecord ?? selectedTask?.deviceFieldTestRecord ?? null;
  const packageLabelScanSample = currentInput.packageLabelScanSample ?? deviceFieldTestRecord?.packageLabelScanSample ?? null;
  const packageLabelScanSampleSummary = getDriverPackageLabelScanSampleSummary(packageLabelScanSample);
  const nativeBridgeFieldTestSnapshot =
    currentInput.nativeBridgeDiagnostics ?? deviceFieldTestRecord?.nativeBridgeDiagnostics ?? nativeCapabilityDiagnostics;
  const nativeBridgeFieldTestSnapshotText = (nativeBridgeFieldTestSnapshot?.items ?? [])
    .map((item) => `${item.label}${item.statusLabel} · ${item.bridgeTypeLabel}`)
    .join("；");
  const deviceFieldTestDeviceLabel = currentInput.deviceFieldTestDeviceLabel ?? fieldTestContext.deviceLabel;
  const deviceFieldTestBrowserLabel = currentInput.deviceFieldTestBrowserLabel ?? fieldTestContext.browserLabel;
  const deviceFieldTestNote = currentInput.deviceFieldTestNote ?? "";
  const deviceFieldTestStatus = currentInput.deviceFieldTestStatus ?? (deviceFieldTestRecord ? `已保存：${deviceFieldTestRecord.summary?.label ?? "现场验收记录"}` : "未保存现场验收记录");

  useEffect(() => {
    const nextUrls = { watermarked: "", signature: "" };
    if (typeof URL !== "undefined" && watermarkedPhotoFile) {
      nextUrls.watermarked = URL.createObjectURL(watermarkedPhotoFile);
    }
    if (typeof URL !== "undefined" && signaturePhotoFile) {
      nextUrls.signature = URL.createObjectURL(signaturePhotoFile);
    }
    setPhotoPreviewUrls(nextUrls);
    return () => {
      Object.values(nextUrls).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, [selectedTask?.fulfillmentId, watermarkedPhotoFile, signaturePhotoFile]);

  useEffect(() => {
    return () => {
      stopPackageCameraScan({ silent: true });
      stopDeliveryPhotoCamera({ silent: true });
    };
  }, [selectedTask?.fulfillmentId]);

  function selectTask(taskId) {
    setSelectedTaskId(taskId);
  }

  function updateTaskInput(field, value) {
    if (!selectedTask) return;
    setTaskInputs((current) => ({
      ...current,
      [selectedTask.fulfillmentId]: {
        ...(current[selectedTask.fulfillmentId] ?? {}),
        [field]: value,
      },
    }));
  }

  function updateDeviceFieldTestCheck(key, status) {
    if (!selectedTask) return;
    setTaskInputs((current) => {
      const currentTaskInput = current[selectedTask.fulfillmentId] ?? {};
      const currentChecks = currentTaskInput.deviceFieldTestChecks ?? createDriverDeviceFieldTestChecks(deviceReadiness);
      return {
        ...current,
        [selectedTask.fulfillmentId]: {
          ...currentTaskInput,
          deviceFieldTestChecks: updateDriverDeviceFieldTestCheck(currentChecks, key, status, deviceReadiness),
          deviceFieldTestStatus: "现场验收记录未保存",
        },
      };
    });
  }

  function applyPackageCameraFieldTestSignal(taskId, signal) {
    if (!taskId) return;
    setTaskInputs((current) => {
      const currentTaskInput = current[taskId] ?? {};
      const currentChecks = currentTaskInput.deviceFieldTestChecks ?? createDriverDeviceFieldTestChecks(deviceReadiness);
      const nextChecks = applyDriverPackageCameraFieldTestSignal(currentChecks, signal, deviceReadiness);
      const nextTaskInput = {
        ...currentTaskInput,
        deviceFieldTestChecks: nextChecks,
        deviceFieldTestStatus: "现场验收记录未保存",
      };
      if (signal.message) {
        nextTaskInput.deviceFieldTestNote = appendDriverDeviceFieldTestNote(currentTaskInput.deviceFieldTestNote, signal.message);
      }
      return {
        ...current,
        [taskId]: nextTaskInput,
      };
    });
  }

  async function saveDeviceFieldTestRecord() {
    if (!selectedTask) return;
    const taskSnapshot = selectedTask;
    const currentTaskInput = taskInputs[taskSnapshot.fulfillmentId] ?? {};
    const currentChecks = currentTaskInput.deviceFieldTestChecks ?? createDriverDeviceFieldTestChecks(deviceReadiness);
    const record = buildDriverDeviceFieldTestRecord({
      task: taskSnapshot,
      currentUser,
      deviceLabel: currentTaskInput.deviceFieldTestDeviceLabel ?? deviceFieldTestDeviceLabel,
      browserLabel: currentTaskInput.deviceFieldTestBrowserLabel ?? deviceFieldTestBrowserLabel,
      note: currentTaskInput.deviceFieldTestNote ?? deviceFieldTestNote,
      readiness: deviceReadiness,
      checks: currentChecks,
      packageLabelScanSample: currentTaskInput.packageLabelScanSample ?? deviceFieldTestRecord?.packageLabelScanSample,
      nativeBridgeDiagnostics: nativeCapabilityDiagnostics,
    });
    updateTaskInput("deviceFieldTestStatus", "现场验收保存中");
    const result = await onAction?.("保存验收", {
      fulfillmentId: taskSnapshot.fulfillmentId,
      task: taskSnapshot,
      record,
    });
    if (result?.blocked) {
      updateTaskInput("deviceFieldTestStatus", "现场验收保存失败");
      return;
    }
    const savedRecord = result?.record ?? record;
    setTaskInputs((current) => {
      const nextTaskInput = current[taskSnapshot.fulfillmentId] ?? {};
      return {
        ...current,
        [taskSnapshot.fulfillmentId]: {
          ...nextTaskInput,
          deviceFieldTestChecks: savedRecord.checks,
          deviceFieldTestRecord: savedRecord,
          deviceFieldTestDeviceLabel: savedRecord.deviceLabel,
          deviceFieldTestBrowserLabel: savedRecord.browserLabel,
          packageLabelScanSample: savedRecord.packageLabelScanSample,
          nativeBridgeDiagnostics: savedRecord.nativeBridgeDiagnostics,
          deviceFieldTestStatus: `已保存：${savedRecord.summary.label}`,
        },
      };
    });
  }

  function togglePackageCheck(packageId) {
    if (!selectedTask) return;
    const safePackageId = String(packageId ?? "").trim();
    if (!safePackageId) return;
    setTaskInputs((current) => {
      const currentTaskInput = current[selectedTask.fulfillmentId] ?? {};
      const currentIds = Array.isArray(currentTaskInput.checkedPackageIds)
        ? currentTaskInput.checkedPackageIds
        : selectedTask.packageChecklist?.filter((item) => item.checked === true).map((item) => item.packageId) ?? [];
      const exists = currentIds.includes(safePackageId);
      const nextIds = exists ? currentIds.filter((item) => item !== safePackageId) : [...currentIds, safePackageId];
      return {
        ...current,
        [selectedTask.fulfillmentId]: {
          ...currentTaskInput,
          checkedPackageIds: nextIds,
        },
      };
    });
  }

  function setAllPackagesChecked(checked) {
    if (!selectedTask) return;
    setTaskInputs((current) => ({
      ...current,
      [selectedTask.fulfillmentId]: {
        ...(current[selectedTask.fulfillmentId] ?? {}),
        checkedPackageIds: checked ? packageCheckState.checklist.map((item) => item.packageId) : [],
      },
    }));
  }

  function applyPackageScan(scanTextOverride) {
    if (!selectedTask) return;
    setTaskInputs((current) => {
      const currentTaskInput = current[selectedTask.fulfillmentId] ?? {};
      const currentIds = Array.isArray(currentTaskInput.checkedPackageIds)
        ? currentTaskInput.checkedPackageIds
        : selectedTask.packageChecklist?.filter((item) => item.checked === true).map((item) => item.packageId) ?? [];
      const scanText = String(
        typeof scanTextOverride === "string" ? scanTextOverride : (currentTaskInput.packageScanText ?? packageScanText),
      );
      const scanResult = applyDriverPackageScan(selectedTask, currentIds, scanText);
      const scanSucceeded = scanResult.status === "matched" || scanResult.status === "duplicate";
      const shouldRecordScanSample = scanResult.status !== "empty";
      const packageLabelScanSample = shouldRecordScanSample
        ? buildDriverPackageLabelScanSample({
            task: selectedTask,
            checkedPackageIds: currentIds,
            scannedText: scanText,
            scanResult,
            method: "scanner_wedge",
          })
        : currentTaskInput.packageLabelScanSample;
      const nextTaskInput = {
        ...currentTaskInput,
        checkedPackageIds: scanResult.checkedPackageIds,
        packageScanStatus: scanResult.message,
        packageScanStatusTone: scanSucceeded ? "success" : "danger",
        packageScanText: scanResult.status === "matched" ? "" : scanText,
      };
      if (shouldRecordScanSample) {
        const fieldTestMessage = scanSucceeded
          ? `扫码枪/键盘口识别通过：${scanResult.matchedPackageId || scanText}`
          : `扫码枪/键盘口识别异常：${scanResult.message}`;
        nextTaskInput.packageLabelScanSample = packageLabelScanSample;
        nextTaskInput.deviceFieldTestChecks = applyDriverPackageLabelScanFieldTestSignal(
          currentTaskInput.deviceFieldTestChecks ?? createDriverDeviceFieldTestChecks(deviceReadiness),
          { type: "package_scan_result", scanStatus: scanResult.status },
          deviceReadiness,
        );
        nextTaskInput.deviceFieldTestNote = appendDriverDeviceFieldTestNote(currentTaskInput.deviceFieldTestNote, fieldTestMessage);
        nextTaskInput.deviceFieldTestStatus = "现场验收记录未保存";
      }
      return {
        ...current,
        [selectedTask.fulfillmentId]: nextTaskInput,
      };
    });
  }

  async function startPackageCameraScan() {
    if (!selectedTask) return;
    const taskSnapshot = selectedTask;
    const taskId = taskSnapshot.fulfillmentId;
    packageCameraScannerRef.current?.stop?.();
    packageCameraScannerRef.current = null;
    setTaskInputs((current) => ({
      ...current,
      [taskId]: {
        ...(current[taskId] ?? {}),
        packageCameraScanActive: true,
        packageCameraScanStatus: "正在打开相机...",
        packageCameraScanStatusTone: "success",
      },
    }));

    try {
      const session = await startDriverPackageCameraScanner({
        videoElement: packageCameraVideoRef.current,
        onReady: () => {
          applyPackageCameraFieldTestSignal(taskId, {
            type: "camera_opened",
            message: "相机权限已授权，扫码取景框已打开。",
          });
        },
        onStatus: (message) => {
          setTaskInputs((current) => ({
            ...current,
            [taskId]: {
              ...(current[taskId] ?? {}),
              packageCameraScanActive: true,
              packageCameraScanStatus: message,
              packageCameraScanStatusTone: "success",
            },
          }));
        },
        onCode: (code) => {
          packageCameraScannerRef.current = null;
          setTaskInputs((current) => {
            const currentTaskInput = current[taskId] ?? {};
            const currentIds = Array.isArray(currentTaskInput.checkedPackageIds)
              ? currentTaskInput.checkedPackageIds
              : taskSnapshot.packageChecklist?.filter((item) => item.checked === true).map((item) => item.packageId) ?? [];
            const scanResult = applyDriverPackageScan(taskSnapshot, currentIds, code);
            const scanSucceeded = scanResult.status === "matched" || scanResult.status === "duplicate";
            const packageLabelScanSample = buildDriverPackageLabelScanSample({
              task: taskSnapshot,
              checkedPackageIds: currentIds,
              scannedText: code,
              scanResult,
              method: "camera",
            });
            const fieldTestChecks = applyDriverPackageCameraFieldTestSignal(
              currentTaskInput.deviceFieldTestChecks ?? createDriverDeviceFieldTestChecks(deviceReadiness),
              { type: "camera_scan_result", scanStatus: scanResult.status },
              deviceReadiness,
            );
            const fieldTestMessage = scanSucceeded
              ? `相机扫码识别通过：${code}`
              : `相机识别到 ${code}，但不属于当前装车清单。`;
            return {
              ...current,
              [taskId]: {
                ...currentTaskInput,
                checkedPackageIds: scanResult.checkedPackageIds,
                packageScanStatus: scanResult.message,
                packageScanStatusTone: scanSucceeded ? "success" : "danger",
                packageScanText: scanResult.status === "matched" ? "" : code,
                packageCameraScanActive: false,
                packageCameraScanStatus: scanSucceeded ? `相机识别：${code}` : scanResult.message,
                packageCameraScanStatusTone: scanSucceeded ? "success" : "danger",
                packageLabelScanSample,
                deviceFieldTestChecks: fieldTestChecks,
                deviceFieldTestNote: appendDriverDeviceFieldTestNote(currentTaskInput.deviceFieldTestNote, fieldTestMessage),
                deviceFieldTestStatus: "现场验收记录未保存",
              },
            };
          });
        },
      });
      packageCameraScannerRef.current = session?.stopped ? null : session;
    } catch (error) {
      packageCameraScannerRef.current = null;
      const message = error?.message ?? "相机扫码启动失败，请继续用扫描枪或手输包裹号。";
      const packageLabelScanSample = buildDriverPackageLabelScanSample({
        task: taskSnapshot,
        checkedPackageIds: taskSnapshot.packageChecklist?.filter((item) => item.checked === true).map((item) => item.packageId) ?? [],
        method: "camera",
        result: "camera_error",
        message,
      });
      setTaskInputs((current) => ({
        ...current,
        [taskId]: {
          ...(current[taskId] ?? {}),
          packageCameraScanActive: false,
          packageCameraScanStatus: message,
          packageCameraScanStatusTone: "danger",
          packageLabelScanSample,
          deviceFieldTestChecks: applyDriverPackageCameraFieldTestSignal(
            current[taskId]?.deviceFieldTestChecks ?? createDriverDeviceFieldTestChecks(deviceReadiness),
            { type: "camera_error", errorCode: error?.code },
            deviceReadiness,
          ),
          deviceFieldTestNote: appendDriverDeviceFieldTestNote(current[taskId]?.deviceFieldTestNote, message),
          deviceFieldTestStatus: "现场验收记录未保存",
        },
      }));
    }
  }

  async function startNativePackageScan() {
    if (!selectedTask) return;
    const taskSnapshot = selectedTask;
    const taskId = taskSnapshot.fulfillmentId;
    const support = getDriverNativePackageScannerSupport();
    if (!support.supported) {
      setTaskInputs((current) => ({
        ...current,
        [taskId]: {
          ...(current[taskId] ?? {}),
          packageNativeScanActive: false,
          packageNativeScanStatus: support.message,
          packageNativeScanStatusTone: "danger",
        },
      }));
      return;
    }

    setTaskInputs((current) => ({
      ...current,
      [taskId]: {
        ...(current[taskId] ?? {}),
        packageNativeScanActive: true,
        packageNativeScanStatus: "正在调用原生扫码 SDK...",
        packageNativeScanStatusTone: "success",
      },
    }));

    try {
      const nativeResult = await requestDriverNativePackageLabelScan({
        task: taskSnapshot,
        operatorId: currentUser.userId ?? currentUser.id,
      });
      const code = nativeResult.scannedText;
      if (!code) {
        setTaskInputs((current) => ({
          ...current,
          [taskId]: {
            ...(current[taskId] ?? {}),
            packageNativeScanActive: false,
            packageNativeScanStatus: nativeResult.message || "原生扫码 SDK 未返回包裹码。",
            packageNativeScanStatusTone: nativeResult.status === "canceled" ? "success" : "danger",
          },
        }));
        return;
      }

      setTaskInputs((current) => {
        const currentTaskInput = current[taskId] ?? {};
        const currentIds = Array.isArray(currentTaskInput.checkedPackageIds)
          ? currentTaskInput.checkedPackageIds
          : taskSnapshot.packageChecklist?.filter((item) => item.checked === true).map((item) => item.packageId) ?? [];
        const scanResult = applyDriverPackageScan(taskSnapshot, currentIds, code);
        const scanSucceeded = scanResult.status === "matched" || scanResult.status === "duplicate";
        const packageLabelScanSample = buildDriverPackageLabelScanSample({
          task: taskSnapshot,
          checkedPackageIds: currentIds,
          scannedText: code,
          scanResult,
          method: "native_sdk",
          checkedAt: nativeResult.checkedAt,
          message: nativeResult.message || scanResult.message,
        });
        const fieldTestMessage = scanSucceeded
          ? `原生扫码SDK识别通过：${scanResult.matchedPackageId || code}`
          : `原生扫码SDK识别异常：${scanResult.message}`;
        return {
          ...current,
          [taskId]: {
            ...currentTaskInput,
            checkedPackageIds: scanResult.checkedPackageIds,
            packageScanStatus: scanResult.message,
            packageScanStatusTone: scanSucceeded ? "success" : "danger",
            packageScanText: scanResult.status === "matched" ? "" : code,
            packageNativeScanActive: false,
            packageNativeScanStatus: scanSucceeded ? `原生SDK识别：${code}` : scanResult.message,
            packageNativeScanStatusTone: scanSucceeded ? "success" : "danger",
            packageLabelScanSample,
            deviceFieldTestChecks: applyDriverPackageLabelScanFieldTestSignal(
              currentTaskInput.deviceFieldTestChecks ?? createDriverDeviceFieldTestChecks(deviceReadiness),
              { type: "package_scan_result", scanStatus: scanResult.status },
              deviceReadiness,
            ),
            deviceFieldTestNote: appendDriverDeviceFieldTestNote(currentTaskInput.deviceFieldTestNote, fieldTestMessage),
            deviceFieldTestStatus: "现场验收记录未保存",
          },
        };
      });
    } catch (error) {
      const message = error?.message ?? "原生扫码 SDK 调用失败，请继续用扫码枪、手输或相机扫码。";
      setTaskInputs((current) => {
        const currentTaskInput = current[taskId] ?? {};
        const currentIds = Array.isArray(currentTaskInput.checkedPackageIds)
          ? currentTaskInput.checkedPackageIds
          : taskSnapshot.packageChecklist?.filter((item) => item.checked === true).map((item) => item.packageId) ?? [];
        return {
          ...current,
          [taskId]: {
            ...currentTaskInput,
            packageNativeScanActive: false,
            packageNativeScanStatus: message,
            packageNativeScanStatusTone: "danger",
            packageLabelScanSample: buildDriverPackageLabelScanSample({
              task: taskSnapshot,
              checkedPackageIds: currentIds,
              method: "native_sdk",
              result: "failed",
              message,
            }),
            deviceFieldTestChecks: applyDriverPackageLabelScanFieldTestSignal(
              currentTaskInput.deviceFieldTestChecks ?? createDriverDeviceFieldTestChecks(deviceReadiness),
              { type: "package_scan_result", scanStatus: "failed" },
              deviceReadiness,
            ),
            deviceFieldTestNote: appendDriverDeviceFieldTestNote(currentTaskInput.deviceFieldTestNote, `原生扫码SDK异常：${message}`),
            deviceFieldTestStatus: "现场验收记录未保存",
          },
        };
      });
    }
  }

  async function startNativeNavigation() {
    if (!selectedTask) return;
    const taskSnapshot = selectedTask;
    const taskId = taskSnapshot.fulfillmentId;
    const support = getDriverNativeNavigationSupport();
    if (!navigationUrl) {
      setTaskInputs((current) => ({
        ...current,
        [taskId]: {
          ...(current[taskId] ?? {}),
          nativeNavigationActive: false,
          nativeNavigationStatus: "导航地址待补，无法调用原生导航。",
          nativeNavigationStatusTone: "danger",
        },
      }));
      return;
    }
    if (!support.supported) {
      setTaskInputs((current) => ({
        ...current,
        [taskId]: {
          ...(current[taskId] ?? {}),
          nativeNavigationActive: false,
          nativeNavigationStatus: support.message,
          nativeNavigationStatusTone: "neutral",
        },
      }));
      return;
    }

    setTaskInputs((current) => ({
      ...current,
      [taskId]: {
        ...(current[taskId] ?? {}),
        nativeNavigationActive: true,
        nativeNavigationStatus: "正在调用原生导航 SDK...",
        nativeNavigationStatusTone: "success",
      },
    }));

    try {
      const nativeResult = await requestDriverNativeNavigation({
        task: taskSnapshot,
        navigationUrl,
        geoPoint: watermarkGeoPoint,
        operatorId: currentUser.userId ?? currentUser.id,
      });
      const opened = nativeResult.status === "opened";
      const canceled = nativeResult.status === "canceled";
      const message = nativeResult.message || (opened ? "原生导航 SDK 已打开导航。" : "原生导航 SDK 未返回明确结果。");
      setTaskInputs((current) => {
        const currentTaskInput = current[taskId] ?? {};
        const currentChecks = currentTaskInput.deviceFieldTestChecks ?? createDriverDeviceFieldTestChecks(deviceReadiness);
        const nextTaskInput = {
          ...currentTaskInput,
          nativeNavigationActive: false,
          nativeNavigationStatus: message,
          nativeNavigationStatusTone: opened ? "success" : canceled ? "neutral" : "warning",
        };
        if (opened) {
          nextTaskInput.deviceFieldTestChecks = updateDriverDeviceFieldTestCheck(currentChecks, "navigation", "passed", deviceReadiness);
          nextTaskInput.deviceFieldTestNote = appendDriverDeviceFieldTestNote(
            currentTaskInput.deviceFieldTestNote,
            `原生导航SDK打开成功：${nativeResult.mapApp || "系统地图"} · ${taskSnapshot.address}`,
          );
          nextTaskInput.deviceFieldTestStatus = "现场验收记录未保存";
        } else if (nativeResult.status === "failed" || nativeResult.status === "unavailable") {
          nextTaskInput.deviceFieldTestChecks = updateDriverDeviceFieldTestCheck(currentChecks, "navigation", "failed", deviceReadiness);
          nextTaskInput.deviceFieldTestNote = appendDriverDeviceFieldTestNote(currentTaskInput.deviceFieldTestNote, `原生导航SDK异常：${message}`);
          nextTaskInput.deviceFieldTestStatus = "现场验收记录未保存";
        }
        return {
          ...current,
          [taskId]: nextTaskInput,
        };
      });
    } catch (error) {
      const message = error?.message ?? "原生导航 SDK 调用失败，请继续使用外部地图链接。";
      setTaskInputs((current) => {
        const currentTaskInput = current[taskId] ?? {};
        const currentChecks = currentTaskInput.deviceFieldTestChecks ?? createDriverDeviceFieldTestChecks(deviceReadiness);
        return {
          ...current,
          [taskId]: {
            ...currentTaskInput,
            nativeNavigationActive: false,
            nativeNavigationStatus: message,
            nativeNavigationStatusTone: "danger",
            deviceFieldTestChecks: updateDriverDeviceFieldTestCheck(currentChecks, "navigation", "failed", deviceReadiness),
            deviceFieldTestNote: appendDriverDeviceFieldTestNote(currentTaskInput.deviceFieldTestNote, `原生导航SDK异常：${message}`),
            deviceFieldTestStatus: "现场验收记录未保存",
          },
        };
      });
    }
  }

  function stopPackageCameraScan(options = {}) {
    const taskSnapshot = selectedTask;
    packageCameraScannerRef.current?.stop?.();
    packageCameraScannerRef.current = null;
    if (!taskSnapshot) return;
    setTaskInputs((current) => {
      const currentTaskInput = current[taskSnapshot.fulfillmentId] ?? {};
      const nextTaskInput = {
        ...currentTaskInput,
        packageCameraScanActive: false,
      };
      if (!options.silent) {
        nextTaskInput.packageCameraScanStatus = options.message ?? "相机扫码已停止。";
        nextTaskInput.packageCameraScanStatusTone = options.tone ?? "success";
      }
      return {
        ...current,
        [taskSnapshot.fulfillmentId]: nextTaskInput,
      };
    });
  }

  async function startDeliveryPhotoCamera() {
    if (!selectedTask) return;
    const taskId = selectedTask.fulfillmentId;
    deliveryPhotoCameraRef.current?.stop?.();
    deliveryPhotoCameraRef.current = null;
    setTaskInputs((current) => ({
      ...current,
      [taskId]: {
        ...(current[taskId] ?? {}),
        deliveryPhotoCameraActive: true,
        deliveryPhotoCameraStatus: "正在打开相机...",
        deliveryPhotoCameraStatusTone: "success",
      },
    }));

    try {
      const session = await startDriverDeliveryPhotoCamera({
        videoElement: deliveryPhotoVideoRef.current,
        onStatus: (message) => {
          setTaskInputs((current) => ({
            ...current,
            [taskId]: {
              ...(current[taskId] ?? {}),
              deliveryPhotoCameraActive: true,
              deliveryPhotoCameraStatus: message,
              deliveryPhotoCameraStatusTone: "success",
            },
          }));
        },
      });
      deliveryPhotoCameraRef.current = session?.stopped ? null : session;
    } catch (error) {
      deliveryPhotoCameraRef.current = null;
      setTaskInputs((current) => ({
        ...current,
        [taskId]: {
          ...(current[taskId] ?? {}),
          deliveryPhotoCameraActive: false,
          deliveryPhotoCameraStatus: error?.message ?? "相机拍照启动失败，请继续用文件上传水印照片。",
          deliveryPhotoCameraStatusTone: "danger",
        },
      }));
    }
  }

  async function captureDeliveryPhotoFromCamera() {
    if (!selectedTask) return;
    const taskId = selectedTask.fulfillmentId;
    try {
      const photo = await captureDriverDeliveryPhotoFromVideo({
        videoElement: deliveryPhotoVideoRef.current,
        fileName: `delivery-watermark-${taskId}.jpg`,
      });
      setTaskInputs((current) => ({
        ...current,
        [taskId]: {
          ...(current[taskId] ?? {}),
          watermarkedPhotoFile: photo.file,
          watermarkedPhotoAttached: true,
          watermarkedPhotoAttachmentId: "",
          deliveryPhotoCameraStatus: `已拍照：${photo.fileName}`,
          deliveryPhotoCameraStatusTone: "success",
        },
      }));
    } catch (error) {
      setTaskInputs((current) => ({
        ...current,
        [taskId]: {
          ...(current[taskId] ?? {}),
          deliveryPhotoCameraStatus: error?.message ?? "拍照失败，请稍后再试或用文件上传。",
          deliveryPhotoCameraStatusTone: "danger",
        },
      }));
    }
  }

  function stopDeliveryPhotoCamera(options = {}) {
    const taskSnapshot = selectedTask;
    deliveryPhotoCameraRef.current?.stop?.();
    deliveryPhotoCameraRef.current = null;
    if (!taskSnapshot) return;
    setTaskInputs((current) => {
      const currentTaskInput = current[taskSnapshot.fulfillmentId] ?? {};
      const nextTaskInput = {
        ...currentTaskInput,
        deliveryPhotoCameraActive: false,
      };
      if (!options.silent) {
        nextTaskInput.deliveryPhotoCameraStatus = options.message ?? "相机拍照已停止。";
        nextTaskInput.deliveryPhotoCameraStatusTone = options.tone ?? "success";
      }
      return {
        ...current,
        [taskSnapshot.fulfillmentId]: nextTaskInput,
      };
    });
  }

  function captureLocation() {
    if (!selectedTask) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      updateTaskInput("watermarkLocationStatus", "当前浏览器不支持定位，已使用送货区域。");
      updateTaskInput("watermarkLocationLabel", watermarkLocationLabel || selectedTask.addressArea || "定位待补");
      return;
    }
    updateTaskInput("watermarkLocationStatus", "正在读取定位...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = Number(position.coords.latitude);
        const longitude = Number(position.coords.longitude);
        const geoPoint = `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
        setTaskInputs((current) => ({
          ...current,
          [selectedTask.fulfillmentId]: {
            ...(current[selectedTask.fulfillmentId] ?? {}),
            watermarkGeoPoint: geoPoint,
            watermarkLocationLabel: watermarkLocationLabel || selectedTask.addressArea || "已读取 GPS",
            watermarkLocationStatus: `已读取 GPS：${geoPoint}`,
          },
        }));
      },
      () => {
        setTaskInputs((current) => ({
          ...current,
          [selectedTask.fulfillmentId]: {
            ...(current[selectedTask.fulfillmentId] ?? {}),
            watermarkLocationLabel: watermarkLocationLabel || selectedTask.addressArea || "定位未授权",
            watermarkLocationStatus: "定位未授权，提交时会保留地址/区域快照。",
          },
        }));
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  }

  function submit(action) {
    if (!selectedTask) return;
    onAction(action, {
      task: selectedTask,
      fulfillmentId: selectedTask.fulfillmentId,
      actualQty,
      receiverName,
      paperNoteStatus,
      watermarkedPhotoAttached,
      signaturePhotoAttached,
      watermarkedPhotoFile,
      signaturePhotoFile,
      watermarkedPhotoAttachmentId,
      signaturePhotoAttachmentId,
      watermarkLocationLabel,
      watermarkGeoPoint,
      watermarkPreviewText: watermarkPreview?.text ?? "",
      routeLabel: routeContext?.hasRoute ? routeContext.routeLabel : "",
      routeStopLabel: routeContext?.hasRoute ? routeContext.stopLabel : "",
      routeProgressLabel: routeContext?.routeProgressLabel ?? "",
      navigationUrl,
      checkedPackageIds,
      packageChecklist: packageCheckState.checklist,
      packageCheckSummary: packageCheckState.summary,
      packageCheckAllDone: packageCheckState.allChecked,
      reason: exceptionReason,
      remark,
    });
  }

  return (
    <section className="page-grid workshop-mobile-layout">
      <div className="table-pane">
        <MetricStrip items={stats} />
        <div className="panel-head compact mobile-work-head">
          <div>
            <h2>司机送货任务</h2>
            <span>{sourceText} · {meta.total ?? tasks.length} 条</span>
          </div>
          <Segmented value={view} onChange={setView} items={["待送货", "配送中", "已完成", "送货异常", "全部"]} />
        </div>
        <div className="mobile-task-list">
          {visibleTasks.length ? visibleTasks.map((task) => (
            <button
              className={`mobile-task-row ${task.fulfillmentId === selectedTask?.fulfillmentId ? "active" : ""}`}
              key={task.fulfillmentId}
              onClick={() => selectTask(task.fulfillmentId)}
            >
              <div>
                <strong>[送货] {task.customerName} · {task.orderTail || task.orderLineId.slice(-5)}</strong>
                <span>{task.addressArea} · {getDriverRouteStopLabel(task)} · {task.packageSummary} · {task.qty} 个</span>
                <small>{getDriverRouteLabel(task)} · {task.latest} · {task.goodsSummary}</small>
              </div>
              <StatusPill tone={task.status === "配送中" ? "blue" : task.status === "送货异常" ? "danger" : statusTone(task.status)}>
                {task.status}
              </StatusPill>
            </button>
          )) : <div className="empty-row">当前视图没有司机送货任务</div>}
        </div>
      </div>
      <DetailPane title={selectedTask ? `${selectedTask.customerName} · ${selectedTask.status}` : "司机送货"} subtitle={selectedTask?.orderLineId ?? "未选择"}>
        {selectedTask ? (
          <>
            <InfoGrid
              rows={[
                ["联系人", `${selectedTask.contactName} ${selectedTask.contactPhone}`],
                ["地址", selectedTask.address],
                ["导航区域", selectedTask.addressArea],
                ["路线/站序", `${routeContext?.routeLabel ?? "未排路线"} / ${routeContext?.stopLabel ?? "未排站序"}`],
                ["计划发车", formatDriverDateTime(selectedTask.plannedDepartureAt) || "未排"],
                ["送货单号", selectedTask.deliveryNoteNo],
                ["货品", selectedTask.goodsSummary],
                ["数量/包裹", `${selectedTask.qty} 个 / ${selectedTask.packageSummary}`],
                ["库存来源", selectedTask.inventorySource || "待确认"],
                ["下一步", selectedTask.nextStep],
                ["客户备注", selectedTask.customerNote || "无"],
                ["办公室备注", selectedTask.officeNote || "无"],
              ]}
            />
            <section className="detail-section driver-route-section">
              <h3>路线执行</h3>
              <div className="driver-route-summary">
                <div>
                  <span>当前路线</span>
                  <strong>{routeContext?.routeLabel ?? "未排路线"}</strong>
                  <small>{routeContext?.stopLabel ?? "未排站序"} · {routeContext?.routeProgressLabel ?? "未排"} · {formatDriverDateTime(selectedTask.plannedDepartureAt) || "计划发车未排"}</small>
                </div>
                <div className="driver-route-neighbors">
                  <span>前一站：{formatDriverRouteNeighbor(routeContext?.previousTask)}</span>
                  <span>下一站：{formatDriverRouteNeighbor(routeContext?.nextTask)}</span>
                </div>
                <p>
                  {routeContext?.pendingBeforeCount
                    ? `前方还有 ${routeContext.pendingBeforeCount} 个未装车/未完成站点，装车前注意核对站序。`
                    : routeContext?.hasRoute
                      ? "当前站序可执行；如货物或单据不一致，走装车异常退回办公室处理。"
                      : "该任务尚未排路线；司机可按办公室临时通知执行，后续由办公室补派单。"}
                </p>
                <div className="driver-route-actions">
                  {navigationUrl ? (
                    <a className="route-nav-button" href={navigationUrl} target="_blank" rel="noreferrer">
                      打开导航
                    </a>
                  ) : (
                    <span className="route-nav-button disabled">导航地址待补</span>
                  )}
                  <button
                    type="button"
                    className="route-nav-button secondary"
                    onClick={startNativeNavigation}
                    disabled={!navigationUrl || !nativeNavigationSupport.supported || nativeNavigationActive}
                    title={nativeNavigationSupport.supported ? "调用手机原生地图 SDK" : nativeNavigationSupport.message}
                  >
                    {nativeNavigationActive ? "调用中" : "原生导航"}
                  </button>
                  <span>{selectedTask.address}</span>
                </div>
                <small className={`driver-native-navigation-status ${nativeNavigationStatusTone}`}>
                  {nativeNavigationStatus}
                </small>
              </div>
            </section>
            <section className="detail-section driver-device-section">
              <div className="section-title-row">
                <h3>设备自检</h3>
                <span className={`driver-device-summary ${deviceReadiness.summary.tone}`}>
                  {deviceReadiness.summary.label}
                </span>
              </div>
              <div className="driver-device-grid">
                {deviceReadiness.items.map((item) => (
                  <div className={`driver-device-item ${item.tone}`} key={item.key}>
                    <strong>{item.label}</strong>
                    <span>{item.statusLabel}</span>
                    <small>{item.message}</small>
                  </div>
                ))}
              </div>
              <div className="driver-native-diagnostics">
                <div className="driver-native-diagnostics-head">
                  <strong>原生桥接</strong>
                  <span className={`driver-device-summary ${nativeCapabilityDiagnostics.tone}`}>
                    {nativeCapabilityDiagnostics.label}
                  </span>
                </div>
                <div className="driver-native-diagnostics-grid">
                  {nativeCapabilityDiagnostics.items.map((item) => (
                    <div className={`driver-device-item ${item.tone}`} key={item.key}>
                      <strong>{item.label}</strong>
                      <span>{item.statusLabel} · {item.bridgeTypeLabel}</span>
                      <small>{item.version}</small>
                    </div>
                  ))}
                </div>
                <small>{nativeCapabilityDiagnostics.message}</small>
                {nativeIntegrationKit ? (
                  <div className="driver-native-integration-kit">
                    <strong>{nativeIntegrationKit.title}</strong>
                    <span>{nativeIntegrationKitSummary}</span>
                    <small>{nativeIntegrationKit.eventNames.join(" / ")}</small>
                  </div>
                ) : null}
              </div>
            </section>
            <section className="detail-section driver-field-test-section">
              <div className="section-title-row">
                <h3>现场验收</h3>
                <span className={`driver-device-summary ${deviceFieldTestSummary.tone}`}>
                  {deviceFieldTestSummary.label}
                </span>
              </div>
              <div className="driver-field-test-form">
                <label>
                  <span>手机型号</span>
                  <input
                    value={deviceFieldTestDeviceLabel}
                    onChange={(event) => updateTaskInput("deviceFieldTestDeviceLabel", event.target.value)}
                    placeholder="如 iPhone 15 / 华为 Mate"
                  />
                </label>
                <label>
                  <span>浏览器</span>
                  <input
                    value={deviceFieldTestBrowserLabel}
                    onChange={(event) => updateTaskInput("deviceFieldTestBrowserLabel", event.target.value)}
                    placeholder="如 Chrome / Safari"
                  />
                </label>
              </div>
              <div className="driver-field-test-list">
                {deviceFieldTestChecks.map((item) => (
                  <label className={`driver-field-test-row ${item.tone}`} key={item.key}>
                    <div>
                      <strong>{item.label}</strong>
                      <span>{item.target}</span>
                      <small>{item.readinessMessage ? `自检：${item.readinessMessage}` : "现场手动确认"}</small>
                    </div>
                    <select value={item.status} onChange={(event) => updateDeviceFieldTestCheck(item.key, event.target.value)}>
                      {DRIVER_DEVICE_FIELD_TEST_STATUS_OPTIONS.map((option) => (
                        <option value={option.value} key={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <div className="driver-field-test-note">
                <input
                  value={deviceFieldTestNote}
                  onChange={(event) => updateTaskInput("deviceFieldTestNote", event.target.value)}
                  placeholder="记录手机、权限、扫码或拍照问题"
                />
                <button
                  type="button"
                  onClick={saveDeviceFieldTestRecord}
                  disabled={fieldTestSaveState.disabled}
                  title={fieldTestSaveState.title}
                >
                  保存验收
                </button>
              </div>
              <div className={`driver-field-test-sample ${packageLabelScanSample?.tone ?? "neutral"}`}>
                <strong>标签样本</strong>
                <span>{packageLabelScanSampleSummary}</span>
                <small>
                  {packageLabelScanSample
                    ? `预期 ${packageLabelScanSample.expectedPackageId || "待确认"} · 实扫 ${packageLabelScanSample.scannedText || "未取到码"} · ${formatDriverDateTime(packageLabelScanSample.checkedAt)}`
                    : "扫码枪、手输或相机扫过纸质标签后自动记录。"}
                </small>
              </div>
              <div className={`driver-field-test-sample ${nativeBridgeFieldTestSnapshot?.tone ?? "neutral"}`}>
                <strong>原生快照</strong>
                <span>{nativeBridgeFieldTestSnapshot?.label ?? "未记录原生桥接"}</span>
                <small>{nativeBridgeFieldTestSnapshotText || "保存验收时记录原生壳接入状态。"}</small>
              </div>
              <small className={`driver-field-test-status ${deviceFieldTestRecord?.summary?.tone ?? deviceFieldTestSummary.tone}`}>
                {deviceFieldTestStatus}
              </small>
              {deviceFieldTestRecord ? (
                <div className="driver-field-test-record">
                  <strong>{deviceFieldTestRecord.recordId}</strong>
                  <span>{formatDriverDateTime(deviceFieldTestRecord.checkedAt)}</span>
                  <small>{deviceFieldTestRecord.deviceLabel} · {deviceFieldTestRecord.browserLabel} · {deviceFieldTestRecord.summary.label}</small>
                </div>
              ) : null}
            </section>
            <section className="detail-section driver-load-check-section">
              <div className="section-title-row">
                <h3>装车清单</h3>
                <button type="button" onClick={() => setAllPackagesChecked(!packageCheckState.allChecked)}>
                  {packageCheckState.allChecked ? "取消全选" : "全部核对"}
                </button>
              </div>
              <div className="driver-load-check-summary">
                <strong>{packageCheckState.summary}</strong>
                <span>{packageCheckState.allChecked ? "包裹已核对，可确认装车。" : `还有 ${packageCheckState.missingCount} 包未核对，不能确认装车。`}</span>
              </div>
              <div className="driver-load-scan-row">
                <label>
                  <span>扫码核包</span>
                  <div className="inline-control driver-load-scan-actions">
                    <input
                      value={packageScanText}
                      onChange={(event) => updateTaskInput("packageScanText", event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          applyPackageScan(event.currentTarget.value);
                        }
                      }}
                      placeholder="扫描或输入包裹号"
                    />
                    <button type="button" onClick={applyPackageScan}>核对</button>
                    <button type="button" onClick={packageCameraScanActive ? () => stopPackageCameraScan() : startPackageCameraScan}>
                      {packageCameraScanActive ? "停止相机" : "相机扫码"}
                    </button>
                    <button
                      type="button"
                      onClick={startNativePackageScan}
                      disabled={packageNativeScanActive || !nativePackageScanSupport.supported}
                      title={nativePackageScanSupport.message}
                    >
                      {packageNativeScanActive ? "原生扫码中" : "原生扫码"}
                    </button>
                  </div>
                  <small className={currentInput.packageScanStatusTone === "danger" ? "scan-error" : ""}>
                    {packageScanStatus || "扫描枪回车或手输包裹号后自动勾选。"}
                  </small>
                  <small className={currentInput.packageCameraScanStatusTone === "danger" ? "scan-error" : ""}>
                    {packageCameraScanStatus || "相机未启动。"}
                  </small>
                  <small className={currentInput.packageNativeScanStatusTone === "danger" ? "scan-error" : ""}>
                    {packageNativeScanStatus}
                  </small>
                  <video
                    ref={packageCameraVideoRef}
                    className={packageCameraScanActive ? "driver-camera-scan-preview" : "driver-camera-scan-preview hidden"}
                    muted
                    playsInline
                  />
                </label>
              </div>
              <div className="driver-load-package-list">
                {packageCheckState.checklist.map((item) => {
                  const checked = checkedPackageIds.includes(item.packageId);
                  return (
                    <label className={checked ? "driver-load-package checked" : "driver-load-package"} key={item.packageId}>
                      <input type="checkbox" checked={checked} onChange={() => togglePackageCheck(item.packageId)} />
                      <strong>{item.labelText}</strong>
                      <span>{item.quantityText}</span>
                      <small title={item.packageId}>{[item.status, item.packageId].filter(Boolean).join(" · ")}</small>
                    </label>
                  );
                })}
              </div>
            </section>
            <section className="detail-section">
              <h3>送达凭证</h3>
              <div className="detail-form driver-proof-form">
                <label>
                  <span>实际数量</span>
                  <input type="number" min="0" value={actualQty} onChange={(event) => updateTaskInput("actualQty", event.target.value)} />
                </label>
                <label>
                  <span>收货人</span>
                  <input value={receiverName} onChange={(event) => updateTaskInput("receiverName", event.target.value)} placeholder="客户签收人" />
                </label>
                <label>
                  <span>纸质联状态</span>
                  <select value={paperNoteStatus} onChange={(event) => updateTaskInput("paperNoteStatus", event.target.value)}>
                    <option>已交回</option>
                    <option>客户留存</option>
                    <option>未带回</option>
                  </select>
                </label>
                <label className="driver-location-row">
                  <span>定位备注</span>
                  <div className="inline-control">
                    <input value={watermarkLocationLabel} onChange={(event) => updateTaskInput("watermarkLocationLabel", event.target.value)} placeholder="门店、门岗、仓库区域" />
                    <button type="button" onClick={captureLocation}>读取定位</button>
                  </div>
                  <small>{watermarkGeoPoint || watermarkLocationStatus || "提交时写入地址/定位快照"}</small>
                </label>
                <label className="evidence-row">
                  <span>水印照片</span>
                  <input
                    accept="image/*"
                    capture="environment"
                    type="file"
                    onChange={(event) => updateTaskInput("watermarkedPhotoFile", event.target.files?.[0] ?? null)}
                  />
                  <div className="delivery-photo-camera-actions">
                    <button type="button" onClick={deliveryPhotoCameraActive ? () => stopDeliveryPhotoCamera() : startDeliveryPhotoCamera}>
                      {deliveryPhotoCameraActive ? "停止相机" : "打开相机"}
                    </button>
                    <button type="button" disabled={!deliveryPhotoCameraActive} onClick={captureDeliveryPhotoFromCamera}>
                      拍照
                    </button>
                  </div>
                  <small className={currentInput.deliveryPhotoCameraStatusTone === "danger" ? "scan-error" : ""}>
                    {deliveryPhotoCameraStatus || "可直接拍送货水印照片，也可继续上传文件。"}
                  </small>
                  <video
                    ref={deliveryPhotoVideoRef}
                    className={deliveryPhotoCameraActive ? "delivery-photo-camera-preview" : "delivery-photo-camera-preview hidden"}
                    muted
                    playsInline
                  />
                  <small>{watermarkedPhotoFile?.name || (watermarkedPhotoAttached ? "已记录水印照片" : "必须上传")}</small>
                  {photoPreviewUrls.watermarked ? (
                    <div className="photo-proof-preview watermarked-preview">
                      <img alt="送货水印照片预览" src={photoPreviewUrls.watermarked} />
                      <div className="photo-watermark-overlay">
                        {watermarkPreviewLines.map((line) => <span key={line}>{line}</span>)}
                      </div>
                    </div>
                  ) : null}
                </label>
                <label className="evidence-row">
                  <span>签收照片</span>
                  <input
                    accept="image/*"
                    capture="environment"
                    type="file"
                    onChange={(event) => updateTaskInput("signaturePhotoFile", event.target.files?.[0] ?? null)}
                  />
                  <small>{signaturePhotoFile?.name || (signaturePhotoAttached ? "已记录签收照片" : "可选")}</small>
                  {photoPreviewUrls.signature ? (
                    <div className="photo-proof-preview">
                      <img alt="签收照片预览" src={photoPreviewUrls.signature} />
                    </div>
                  ) : null}
                </label>
                <label>
                  <span>备注</span>
                  <input value={remark} onChange={(event) => updateTaskInput("remark", event.target.value)} placeholder="楼层、门岗、客户补充说明" />
                </label>
                {watermarkPreview ? (
                  <div className="watermark-preview">
                    <span>水印信息</span>
                    <strong>{watermarkPreview.title}</strong>
                    <p>{watermarkPreview.text}</p>
                  </div>
                ) : null}
              </div>
            </section>
            <section className="detail-section">
              <h3>异常</h3>
              <div className="detail-form">
                <label>
                  <span>原因</span>
                  <select value={exceptionReason} onChange={(event) => updateTaskInput("exceptionReason", event.target.value)}>
                    <option>装车少货</option>
                    <option>地址不清</option>
                    <option>客户不在</option>
                    <option>拒收</option>
                    <option>其他</option>
                  </select>
                </label>
              </div>
            </section>
            <div className="action-row">
              <button
                className="primary-action"
                disabled={loadState.disabled || selectedTask.status !== "待送货" || loadBlockedByPackageCheck}
                title={
                  loadState.title ||
                  (selectedTask.status !== "待送货"
                    ? "只有待送货任务可确认装车"
                    : loadBlockedByPackageCheck
                      ? "请先核对全部包裹"
                      : "")
                }
                onClick={() => submit("确认已装车")}
              >
                确认已装车{routeContext?.hasRoute ? `（${routeContext.stopLabel}）` : ""}
              </button>
              <button
                className="primary-action"
                disabled={completeState.disabled || selectedTask.status !== "配送中" || !watermarkedPhotoAttached}
                title={completeState.title || (selectedTask.status !== "配送中" ? "配送中任务才能提交送达" : !watermarkedPhotoAttached ? "完成送货必须有水印照片" : "")}
                onClick={() => submit("提交送达")}
              >
                提交送达
              </button>
              <button disabled={exceptionState.disabled || selectedTask.status === "已完成"} title={exceptionState.title} onClick={() => submit(exceptionAction)}>
                {exceptionAction}
              </button>
            </div>
            <Timeline
              items={[
                "办公室创建送货任务",
                routeContext?.hasRoute ? `办公室派单：${routeContext.routeLabel} ${routeContext.stopLabel}` : "路线未排，按临时通知执行",
                selectedTask.loadedAt ? "司机已装车" : "等待司机装车",
                selectedTask.status,
                selectedTask.completedAt ? "回单进入办公室复核" : "等待送达凭证",
              ]}
            />
          </>
        ) : (
          <div className="empty-row">当前没有送货任务</div>
        )}
      </DetailPane>
    </section>
  );
}

function buildDriverWatermarkPreview({ task, currentUser, watermarkLocationLabel, watermarkGeoPoint }) {
  const orderRef = task.orderTail || task.orderLineId || task.fulfillmentId;
  const timeText = task.watermarkCapturedAt ? formatDriverWatermarkTime(task.watermarkCapturedAt) : "提交时生成";
  const locationText = [watermarkLocationLabel || task.addressArea || "定位待补", watermarkGeoPoint].filter(Boolean).join(" / ");
  const watermarkId = task.watermarkId || "提交时生成";
  const driverName = currentUser?.displayName || currentUser?.loginName || task.driverId || "当前司机";
  const existingText = String(task.watermarkText ?? "").trim();
  const text =
    existingText ||
    [
      `${task.customerName} ${orderRef}`,
      task.deliveryNoteNo ? `单据 ${task.deliveryNoteNo}` : "",
      task.address ? `地址 ${task.address}` : "",
      `司机 ${driverName}`,
      `时间 ${timeText}`,
      `定位 ${locationText}`,
      `水印 ${watermarkId}`,
    ]
      .filter(Boolean)
      .join(" / ");
  return {
    title: `水印编号：${watermarkId}`,
    text,
  };
}

function formatDriverRouteNeighbor(task) {
  if (!task) return "无";
  return `${getDriverRouteStopLabel(task)} ${task.customerName || "客户待确认"} ${task.addressArea || ""}`.trim();
}

function formatDriverWatermarkTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value ?? "");
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDriverDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value ?? "");
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function getDriverWatermarkOverlayLines(text) {
  const parts = String(text ?? "")
    .split(" / ")
    .map((item) => item.trim())
    .filter(Boolean);
  return parts.length ? parts.slice(0, 6) : ["水印信息提交时生成"];
}

function isProductionReportCandidate(line) {
  const status = String(line?.status ?? line?.lineStatus ?? "");
  if (!line || String(line.orderType ?? "").includes("外加工")) return false;
  return (
    status.includes("制袋") ||
    status.includes("丝印") ||
    status.includes("待排产") ||
    status.includes("待补印") ||
    status.includes("跨日继续") ||
    status.includes("待完工确认")
  );
}

function findFocusedProductionLine(orderLines, focusTarget, buildProductionTaskId) {
  if (!focusTarget) return null;
  const orderLineId = String(focusTarget.orderLineId ?? "").trim();
  const taskId = String(focusTarget.taskId ?? focusTarget.productionTaskId ?? "").trim();
  return (orderLines ?? []).find((line) => {
    const lineId = String(line?.id ?? line?.orderLineId ?? "").trim();
    return (orderLineId && lineId === orderLineId) || (taskId && buildProductionTaskId(line) === taskId);
  }) ?? null;
}

function getProductionPackingFocusNotice(focusTarget, context) {
  if (!focusTarget?.focusKey) return "";
  const sourceId = String(focusTarget.sourceId ?? "").trim();
  if (focusTarget.mode === "packing") {
    const selectedTaskId = String(context.selectedPackingTask?.packingTaskId ?? "").trim();
    if (selectedTaskId && selectedTaskId === String(focusTarget.taskId ?? "").trim()) {
      return `库存流水定位：${focusTarget.sourceLabel || "打包完成"} / ${sourceId}`;
    }
  }
  if (focusTarget.mode === "production") {
    const selectedLine = context.selectedProductionLine;
    const selectedTaskId = selectedLine ? context.buildProductionTaskId(selectedLine) : "";
    const selectedLineId = String(selectedLine?.id ?? "").trim();
    if (
      selectedTaskId === String(focusTarget.taskId ?? "").trim() ||
      (selectedLineId && selectedLineId === String(focusTarget.orderLineId ?? "").trim())
    ) {
      return `库存流水定位：${focusTarget.sourceLabel || "生产报工"} / ${sourceId}`;
    }
  }
  return "";
}

function getVisibleProductionPackingSourceDetail(sourceDetailState, context) {
  if (!sourceDetailState?.requestedType || !sourceDetailState?.requestedId) return null;
  if (context.detailMode === "production" && sourceDetailState.requestedType === "production") {
    const selectedTaskId = context.selectedProductionLine ? context.buildProductionTaskId(context.selectedProductionLine) : "";
    if (selectedTaskId && selectedTaskId === sourceDetailState.requestedId) return sourceDetailState;
  }
  if (context.detailMode === "packing" && sourceDetailState.requestedType === "packing") {
    const selectedTaskId = String(context.selectedPackingTask?.packingTaskId ?? "").trim();
    if (selectedTaskId && selectedTaskId === sourceDetailState.requestedId) return sourceDetailState;
  }
  return null;
}

function buildProductionPackingSourceDetailRows(detailState, detailMode) {
  if (detailState?.loading) {
    return [
      ["读取状态", "正在读取后端详情"],
      ["来源任务", detailState.requestedId],
    ];
  }

  if (detailState?.error && !detailState?.detail) {
    return [
      ["读取状态", detailState.error],
      ["来源任务", detailState.requestedId],
    ];
  }

  const detail = detailState?.detail;
  if (!detail) {
    return [["读取状态", "暂无来源详情"]];
  }

  if (detailMode === "packing") {
    const task = detail.packingTask ?? {};
    const packageCount = detail.packages?.length || task.packageCount || 0;
    return [
      ["任务状态", task.status || "未同步"],
      ["实际/计划", `${Number(task.actualPackedQty ?? 0)} / ${Number(task.plannedQty ?? 0)}`],
      ["包裹", `${packageCount} 包`],
      ["交付状态", detail.fulfillment?.status || "未生成"],
      ["库存流水", `${detail.inventoryLedgerEntries?.length ?? 0} 条`],
      ["库存扣减", detail.inventoryDeducted ? "已扣减" : "未扣减，出库/拉走再扣"],
    ];
  }

  const task = detail.productionTask ?? {};
  const report = detail.latestReport ?? detail.reports?.[0] ?? {};
  const machineCountLabel =
    report.machineCount === null || report.machineCount === undefined || report.machineCount === ""
      ? "未填"
      : `${report.machineCount}（动作次数，不入库）`;
  return [
    ["任务状态", task.taskStatus || task.status || "未同步"],
    ["报工单", report.reportId || "未生成"],
    ["合格/异常", `${Number(report.qualifiedQty ?? 0)} / ${Number(report.exceptionQty ?? 0)}`],
    ["机器计数", machineCountLabel],
    ["库存流水", `${detail.inventoryLedgerEntries?.length ?? 0} 条`],
    ["后续打包", detail.packingTask?.packingTaskId || "未生成"],
  ];
}

function getProductionPackingDetailSourceLabel(source) {
  if (source === "api") return "后端 API";
  if (source === "local_fallback") return "本地降级";
  if (source === "api_error") return "后端错误";
  return "本地状态";
}

function isProductionPackingTaskListFromApi(productionPacking) {
  return productionPacking?.taskListSource === "api";
}

function getProductionPackingTaskListStatusText(productionPacking) {
  if (productionPacking?.taskListLoading) return "任务池刷新中";
  const source = productionPacking?.taskListSource ?? "local";
  const time = productionPacking?.taskListLastSyncedAt ? ` · ${productionPacking.taskListLastSyncedAt}` : "";
  if (productionPacking?.taskListError) return `任务池异常：${productionPacking.taskListError}`;
  if (source === "api") return `后端任务池${time}`;
  if (source === "api_error") return `后端任务池异常${time}`;
  if (source === "local_fallback") return `本地降级任务池${time}`;
  return "本地任务池";
}

function getProductionScheduleQueueStatusText(productionPacking) {
  if (productionPacking?.taskListLoading) return "排产队列刷新中";
  const source = productionPacking?.scheduleQueueSource ?? "local";
  const time = productionPacking?.scheduleQueueLastSyncedAt ? ` · ${productionPacking.scheduleQueueLastSyncedAt}` : "";
  if (productionPacking?.scheduleQueueError) return `排产队列异常：${productionPacking.scheduleQueueError}`;
  if (source === "api") return `机台队列${time}`;
  if (source === "api_error") return `机台队列异常${time}`;
  if (source === "local_fallback") return `本地降级队列${time}`;
  return "本地队列";
}

function formatProductionScheduleQueueSpec(item) {
  const product = String(item?.productName ?? "").trim() || "未匹配货品";
  const size = String(item?.size ?? "").trim();
  const colorParts = [
    String(item?.bagColor ?? "").trim(),
    String(item?.handleType ?? "").trim(),
    String(item?.style ?? "").trim(),
  ].filter(Boolean);
  return [product, size, colorParts.join("/")].filter(Boolean).join(" ");
}

function formatProductionScheduleQueueQty(item) {
  const plannedQty = Math.max(0, Math.trunc(Number(item?.plannedQty ?? 0)));
  const remainingQty = Math.max(0, Math.trunc(Number(item?.remainingQty ?? plannedQty)));
  return `计划 ${plannedQty} / 剩 ${remainingQty}`;
}

const queueMoveReasonOptions = [
  { value: "supervisor_order", label: "主管安排" },
  { value: "urgent_insert", label: "急单插入" },
  { value: "delivery_risk", label: "交期风险" },
  { value: "material_wait", label: "等料调整" },
  { value: "machine_issue", label: "机器问题" },
  { value: "capacity_balance", label: "机台平衡" },
  { value: "other", label: "其他" },
];

function getQueueMoveReason(reasonCode) {
  const safeReasonCode = String(reasonCode ?? "").trim();
  return queueMoveReasonOptions.find((item) => item.value === safeReasonCode) ?? queueMoveReasonOptions[0];
}

function getQueueMoveImpactSummary({
  selectedItem,
  sourceItems,
  sourceIndex,
  targetMachineId,
  targetItems,
  targetSeq,
  reasonLabel,
}) {
  if (!selectedItem) {
    return {
      text: "影响预览：先选择机台排产队列中的任务。",
      remark: "未选择队列任务，未计算影响范围",
    };
  }

  const safeReasonLabel = String(reasonLabel ?? "").trim() || "未填原因";
  const sourceMachineId = String(selectedItem.machineId ?? "").trim() || "未分配";
  const targetMachine = String(targetMachineId ?? "").trim() || "未分配";
  const safeTargetSeq = Math.max(1, Math.trunc(Number(targetSeq ?? 1)));
  const selectedSeq = Math.max(1, Math.trunc(Number(selectedItem.queueSeq ?? sourceIndex + 1)));
  const sourceRows = Array.isArray(sourceItems) ? sourceItems : [];
  const targetRows = Array.isArray(targetItems) ? targetItems : [];
  const sourceItemIndex = sourceIndex >= 0 ? sourceIndex : sourceRows.findIndex((item) => item.productionTaskId === selectedItem.productionTaskId);
  const sameMachine = sourceMachineId === targetMachine;

  if (sameMachine) {
    const affectedCount = Math.abs(selectedSeq - safeTargetSeq);
    const summary = `${sourceMachineId} 内从 #${selectedSeq} 插到 #${safeTargetSeq}，约 ${affectedCount} 条任务顺序受影响`;
    return {
      text: `影响预览：${safeReasonLabel}，${summary}。`,
      remark: summary,
    };
  }

  const sourceAffectedCount = sourceItemIndex >= 0 ? Math.max(0, sourceRows.length - sourceItemIndex - 1) : 0;
  const targetAffectedCount = Math.max(0, targetRows.length - safeTargetSeq + 1);
  const summary = `${sourceMachineId} 移出后 ${sourceAffectedCount} 条重排；${targetMachine} 插入 #${safeTargetSeq} 后 ${targetAffectedCount} 条顺延`;
  return {
    text: `影响预览：${safeReasonLabel}，${summary}。`,
    remark: summary,
  };
}

function getProductionScheduleRecordSourceLabel(source) {
  const safeSource = String(source ?? "").trim();
  if (safeSource === "manual_resequence") return "手工调序";
  if (safeSource === "machine_reassignment") return "换机台";
  if (safeSource === "queue_insert") return "手工插队";
  return "";
}

function formatProductionScheduleQueueStatus(item) {
  const base = `${item?.queueReason || "已发布排产"} / ${item?.status || "待执行"}`;
  const sourceLabel = getProductionScheduleRecordSourceLabel(item?.scheduleRecordSource);
  return sourceLabel ? `${base} · ${sourceLabel}` : base;
}

function findScheduleQueueItemForLine(queueItems, line, buildProductionTaskId) {
  if (!line) return null;
  const lineTaskId = buildProductionTaskId(line);
  return queueItems.find((item) =>
    item.orderLineId === line.id ||
    item.orderLineId === line.orderLineId ||
    item.productionTaskId === line.productionTaskId ||
    item.productionTaskId === lineTaskId
  ) ?? null;
}

function sortScheduleQueueItemsBySeq(left, right) {
  const leftSeq = Math.max(0, Math.trunc(Number(left?.queueSeq ?? 0)));
  const rightSeq = Math.max(0, Math.trunc(Number(right?.queueSeq ?? 0)));
  if (leftSeq !== rightSeq) return leftSeq - rightSeq;
  return String(left?.productionTaskId ?? "").localeCompare(String(right?.productionTaskId ?? ""));
}

function getScheduleQueueMachineOptions(queueItems, productionLines) {
  const machineIds = new Set();
  const addMachineId = (value) => {
    const machineId = String(value ?? "").trim();
    if (machineId) machineIds.add(machineId);
  };

  for (const item of queueItems ?? []) addMachineId(item?.machineId);
  for (const line of productionLines ?? []) addMachineId(getProductionMachineIdLabel(line));
  for (const fallbackMachineId of ["BAG-01", "BAG-02", "PRINT-01"]) addMachineId(fallbackMachineId);

  return [...machineIds].sort((left, right) => left.localeCompare(right, "zh-CN", { numeric: true }));
}

function getDefaultQueueMoveTargetMachineId(machineOptions, sourceMachineId) {
  const safeSourceMachineId = String(sourceMachineId ?? "").trim();
  return machineOptions.find((machineId) => machineId && machineId !== safeSourceMachineId) ?? machineOptions[0] ?? "";
}

function getScheduleQueueItemsForMachine(queueItems, machineId, excludedProductionTaskId) {
  const safeMachineId = String(machineId ?? "").trim();
  const safeExcludedProductionTaskId = String(excludedProductionTaskId ?? "").trim();
  if (!safeMachineId) return [];
  return (queueItems ?? [])
    .filter((item) => {
      const itemMachineId = String(item?.machineId ?? "").trim();
      const itemProductionTaskId = String(item?.productionTaskId ?? "").trim();
      return itemMachineId === safeMachineId && itemProductionTaskId !== safeExcludedProductionTaskId;
    })
    .sort(sortScheduleQueueItemsBySeq);
}

function getQueueMovePositionOptions(targetItems) {
  const count = Math.max(1, (targetItems ?? []).length + 1);
  return Array.from({ length: count }, (_, index) => index + 1);
}

function getNormalizedQueueMoveSeq(value, optionCount) {
  const maxSeq = Math.max(1, Math.trunc(Number(optionCount ?? 1)));
  const seq = Math.trunc(Number(value ?? 1));
  if (!Number.isFinite(seq) || seq < 1) return 1;
  return Math.min(seq, maxSeq);
}

function moveScheduleQueueItem(items, productionTaskId, direction) {
  const rows = [...(items ?? [])].sort(sortScheduleQueueItemsBySeq);
  const currentIndex = rows.findIndex((item) => item.productionTaskId === productionTaskId);
  const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= rows.length) return [];
  const nextRows = [...rows];
  [nextRows[currentIndex], nextRows[nextIndex]] = [nextRows[nextIndex], nextRows[currentIndex]];
  return nextRows;
}

function buildPackingTaskRows({ orderLines, packingTasks, includeLocalProjections = true }) {
  const rows = [];
  const seen = new Set();
  for (const task of packingTasks ?? []) {
    const packingTaskId = String(task?.packingTaskId ?? "").trim();
    if (!packingTaskId) continue;
    const line = orderLines.find((item) => item.id === task.orderLineId || item.orderLineId === task.orderLineId) ?? task.orderLine;
    if (!line) continue;
    rows.push({
      ...task,
      orderLine: line,
      plannedQty: Number(task.plannedQty ?? line.qty ?? 0),
      packageCount: Number(task.packageCount ?? 0) || inferPackageCountFromQty(task.plannedQty ?? line.qty),
    });
    seen.add(packingTaskId);
  }
  if (!includeLocalProjections) return rows;
  for (const line of orderLines.filter((item) => String(item.status ?? "").includes("待打包"))) {
    const packingTaskId = `PKT-${line.id}`;
    if (seen.has(packingTaskId)) continue;
    rows.push({
      packingTaskId,
      orderLineId: line.id,
      orderLine: line,
      plannedQty: Number(line.qty ?? 0),
      actualPackedQty: 0,
      packageCount: inferPackageCountFromQty(line.qty),
      status: "待打包",
      source: "local_projection",
    });
  }
  return rows;
}

function getProductionProcessLabel(line) {
  if (line?.taskType) return line.taskType;
  const status = String(line?.status ?? "");
  if (status.includes("丝印") || status.includes("补印")) return "丝印";
  return "制袋";
}

function getProductionMachineIdLabel(line) {
  const machineId = String(line?.machineId ?? line?.productionTask?.machineId ?? "").trim();
  if (machineId) return machineId;
  return getProductionProcessLabel(line) === "丝印" ? "PRINT-01" : "BAG-01";
}

function getProductionPublishedScheduleId(line) {
  return String(line?.publishedScheduleId ?? line?.productionTask?.publishedScheduleId ?? "").trim();
}

function getProductionDailyProgress(line) {
  const progress = line?.dailyProgress;
  if (!progress || typeof progress !== "object") return null;
  const cumulativeQualifiedQty = Number(progress.cumulativeQualifiedQty ?? 0);
  const remainingQty = Number(progress.remainingQty ?? 0);
  if (!Number.isFinite(cumulativeQualifiedQty) && !Number.isFinite(remainingQty)) return null;
  return progress;
}

function formatProductionDailyProgressLabel(line) {
  const progress = getProductionDailyProgress(line);
  if (!progress) return "";
  const cumulativeQualifiedQty = Math.max(0, Math.trunc(Number(progress.cumulativeQualifiedQty ?? 0)));
  const remainingQty = Math.max(0, Math.trunc(Number(progress.remainingQty ?? 0)));
  const latestDailyQualifiedQty = Math.max(0, Math.trunc(Number(progress.latestDailyQualifiedQty ?? 0)));
  const prefix = latestDailyQualifiedQty > 0 ? `今日 ${latestDailyQualifiedQty}` : "已报";
  return `${prefix} / 累计 ${cumulativeQualifiedQty} / 剩 ${remainingQty}`;
}

function getProductionFinishedGoodsPhoto(line) {
  const photo = line?.finishedGoodsPhoto ?? line?.productionTask?.finishedGoodsPhoto ?? null;
  if (!photo || typeof photo !== "object") {
    return {
      status: "未上传",
      required: isProductionFinishedGoodsPhotoRequired(line),
      attachmentId: "",
      fileName: "",
      uploadedAt: "",
      uploadedBy: "",
      reviewedAt: "",
      reviewedBy: "",
      rejectedReason: "",
      history: [],
    };
  }
  return {
    status: String(photo.status || "未上传").trim(),
    required: photo.required === true || isProductionFinishedGoodsPhotoRequired(line),
    attachmentId: String(photo.attachmentId || "").trim(),
    fileName: String(photo.fileName || "").trim(),
    uploadedAt: String(photo.uploadedAt || "").trim(),
    uploadedBy: String(photo.uploadedBy || "").trim(),
    reviewedAt: String(photo.reviewedAt || "").trim(),
    reviewedBy: String(photo.reviewedBy || "").trim(),
    rejectedReason: String(photo.rejectedReason || "").trim(),
    history: Array.isArray(photo.history) ? photo.history : [],
  };
}

function isProductionFinishedGoodsPhotoRequired(line) {
  const orderType = String(line?.orderType ?? "").trim();
  const printFlag = String(line?.print ?? line?.printFlag ?? "").trim();
  const status = String(line?.status ?? line?.lineStatus ?? "").trim();
  return orderType.includes("定制") || orderType.includes("印刷") || printFlag === "是" || status.includes("丝印") || status.includes("制袋");
}

function formatProductionFinishedGoodsPhotoLabel(photo) {
  if (!photo?.attachmentId) return photo?.required ? "必须上传 / 未上传" : "不强制 / 未上传";
  const fileLabel = photo.fileName || photo.attachmentId;
  return `${photo.status || "待确认"} / ${fileLabel}`;
}

function getProductionFinishedGoodsPhotoTone(photo) {
  if (photo?.status === "已接受") return "success";
  if (photo?.status === "需重拍") return "danger";
  if (photo?.attachmentId || photo?.status === "待确认") return "warning";
  return "neutral";
}

function formatCompactDateTime(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return text.slice(5, 16).replace("T", " ");
}

function getNumericInput(inputs, id, field, fallback) {
  if (!id) return fallback ?? "";
  return inputs[id]?.[field] ?? fallback ?? "";
}

function getBooleanInput(inputs, id, field, fallback) {
  if (!id) return Boolean(fallback);
  return inputs[id]?.[field] ?? Boolean(fallback);
}

function inferPackageCountFromQty(qty) {
  const amount = Number(qty || 0);
  if (amount >= 1800) return 4;
  if (amount >= 1000) return 3;
  if (amount >= 500) return 2;
  return 1;
}

export { StatementPage } from "../../features/statements/StatementPage.jsx";
