import { excludedMobileRoles, flows, formatRawMaterialSpec, getFlow, getScreen, rawMaterialRolls, reviewedRawMaterialRolls } from "./flows.js";
import { buildRawMaterialCode39Bars } from "../../../src/domain/rawMaterialLabelBarcode.js";
import {
  getBusinessTypeTagValue,
  getOperationalStateTagValue,
  getRequirementTagValue,
  getSemanticTagDefinition,
} from "../../../src/shared/labels.js";
import { crossDeviceOrders } from "../shared/cross-device-orders.js";

const app = document.querySelector("#app");

const iconPaths = {
  "alert-triangle": '<path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  "arrow-left": '<path d="m15 18-6-6 6-6"/>',
  "arrow-right": '<path d="m9 18 6-6-6-6"/>',
  briefcase: '<rect width="20" height="14" x="2" y="7" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M12 12v.01"/><path d="M2 12a18 18 0 0 0 20 0"/>',
  calendar: '<path d="M8 2v4M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  camera: '<path d="M14.5 4 16 6h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3l1.5-2z"/><circle cx="12" cy="13" r="3"/>',
  "check-circle": '<path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/><path d="m9 11 3 3L22 4"/>',
  clipboard: '<rect width="14" height="18" x="5" y="4" rx="2"/><path d="M9 4.5V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1.5"/><path d="M9 9h6M9 13h6M9 17h4"/>',
  "cloud-off": '<path d="m2 2 20 20"/><path d="M5.8 5.8A7 7 0 0 0 5 19h11.2"/><path d="M17.7 17.7A5 5 0 0 0 16 8.3 7 7 0 0 0 8.4 5"/>',
  factory: '<path d="M2 20h20"/><path d="M4 20V10l5 3V9l5 3V6l6 3v11"/><path d="M17 14h1M17 17h1M7 17h1M11 17h1"/>',
  "file-search": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8"/><path d="M14 2v6h6"/><circle cx="17" cy="17" r="3"/><path d="m21 21-1.9-1.9"/>',
  "file-text": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8M8 9h2"/>',
  grid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="m5.5 5.1-3.5 6.9v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1Z"/>',
  layers: '<path d="m12.8 2.6 8.5 4.7a1.5 1.5 0 0 1 0 2.6l-8.5 4.7a1.7 1.7 0 0 1-1.6 0L2.7 9.9a1.5 1.5 0 0 1 0-2.6l8.5-4.7a1.7 1.7 0 0 1 1.6 0Z"/><path d="m22 14.1-9.2 5.1a1.7 1.7 0 0 1-1.6 0L2 14.1"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  "map-pin": '<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  package: '<path d="m7.5 4.3 9 5.2M3.3 7.5 12 12l8.7-4.5M12 22V12"/><path d="m5 5 7-3 7 3 3 5-3 9-7 3-7-3-3-9z"/>',
  play: '<path d="m5 3 14 9-14 9z"/>',
  printer: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>',
  "refresh-cw": '<path d="M21 12a9 9 0 0 0-15-6.7L3 8"/><path d="M3 3v5h5M3 12a9 9 0 0 0 15 6.7L21 16"/><path d="M21 21v-5h-5"/>',
  "rotate-ccw": '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  "scan-line": '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M10 8v8M14 8v8M17 8v8"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  settings: '<path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.2a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.8v.5a2 2 0 0 1-1 1.8l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.2a2 2 0 0 1 1 1.7v.2a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.2a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.8v-.5a2 2 0 0 1 1-1.8l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.2a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2Z"/><circle cx="12" cy="12" r="3"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3z"/><path d="m9 12 2 2 4-4"/>',
  smartphone: '<rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/>',
  tag: '<path d="M12.6 2.6H5a2 2 0 0 0-2 2v7.6a2 2 0 0 0 .6 1.4l7.4 7.4a2 2 0 0 0 2.8 0l7.2-7.2a2 2 0 0 0 0-2.8l-7-7a2 2 0 0 0-1.4-.6Z"/><circle cx="8" cy="8" r="1"/>',
  truck: '<path d="M10 17h4V5H2v12h3M14 8h4l4 4v5h-3M14 17h1"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  user: '<path d="M19 21a7 7 0 0 0-14 0"/><circle cx="12" cy="7" r="4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  warehouse: '<path d="M3 21V8l9-5 9 5v13M3 10h18M7 14h2M7 18h2M13 14h4M13 18h4"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-3-3z"/>',
};

const SILK_PLAN_QUANTITY = 1200;
const SILK_REPORT_DEFAULTS = Object.freeze({
  machineActions: "1210",
  estimatedQualified: "1180",
  manualWaste: null,
  note: "",
});
const EMPTY_SILK_REPORT = Object.freeze({ machineActions: "", estimatedQualified: "", manualWaste: null, note: "" });
const BAG_PLAN_QUANTITY = 1200;
const BAG_BASE_QUALIFIED = 620;
const BAG_REPORT_DEFAULTS = Object.freeze({ machineActions: "302", estimatedQualified: "280", manualWaste: null, note: "调机损耗 22 个" });
const EMPTY_BAG_REPORT = Object.freeze({ machineActions: "", estimatedQualified: "", manualWaste: null, note: "" });

const pageParams = new URLSearchParams(location.search);

function flowStartScreen(flow) {
  return flow.screens.some((screen) => screen.id === flow.startScreen) ? flow.startScreen : flow.screens[0].id;
}

function createRawDraft(sequence = 1, sourceRolls = rawMaterialRolls) {
  return {
    draftId: `RM-DRAFT-260704-${String(sequence).padStart(2, "0")}`,
    rolls: sourceRolls.map((roll) => {
      const confirmed = roll.confirmed === true;
      return {
        ...roll,
        rollId: roll.rollId || `RM-260704-${String(roll.index).padStart(2, "0")}`,
        confirmed,
        status: confirmed ? "已确认" : "待确认",
        tone: confirmed ? "success" : "warning",
      };
    }),
  };
}

const initialFlow = getFlow(pageParams.get("role") || "office");
const requestedInitialScreen = pageParams.get("screen");
const initialScreenId = initialFlow.screens.some((screen) => screen.id === requestedInitialScreen) ? requestedInitialScreen : flowStartScreen(initialFlow);
const reviewedOfficeScreens = new Set(["print", "print-result", "print-retry", "attach", "receive-partial", "receive-complete"]);
const initialRawRolls = initialFlow.id !== "office"
  ? rawMaterialRolls
  : reviewedOfficeScreens.has(initialScreenId)
    ? reviewedRawMaterialRolls
    : initialScreenId === "review-edit"
      ? rawMaterialRolls.map((roll) => ({ ...roll, confirmed: roll.index !== 7 }))
      : rawMaterialRolls;

const state = {
  mode: pageParams.get("mode") === "board" ? "board" : "prototype",
  flowId: initialFlow.id,
  screenId: initialScreenId,
  checklistStatus: {},
  evidenceStatus: {},
  evidenceAttempts: {},
  rawDraftSequence: 1,
  rawDraft: createRawDraft(1, initialRawRolls),
  selectedRollIndex: null,
  attachRollStatus: {},
  officePrintCompleted: false,
  officePrintRetryCompleted: false,
  officeReceiveVariant: null,
  roleReceipts: {},
  materialIssue: { rollId: "RM-260704-08", destination: "制袋 3 号机" },
  silkClaimed: false,
  silkPlanOrder: ["customer-a", "outsourced"],
  silkReport: { ...EMPTY_SILK_REPORT },
  silkSubmittedReports: [],
  silkDailySaved: null,
  silkCompletedReceipt: null,
  silkPaused: false,
  silkCompleted: false,
  bagReport: { ...EMPTY_BAG_REPORT },
  bagSubmittedReports: [],
  decisionChoices: {},
};

let fieldSerial = 0;
const navigationStack = [];

function icon(name, className = "") {
  const path = iconPaths[name] || iconPaths.inbox;
  return `<svg class="icon ${className}" aria-hidden="true" viewBox="0 0 24 24">${path}</svg>`;
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseWholeCount(value) {
  if (value === "" || value === null || value === undefined) return null;
  const count = Number(value);
  return Number.isFinite(count) && Number.isInteger(count) && count >= 0 ? count : null;
}

function formatCount(value) {
  return value === null ? "—" : new Intl.NumberFormat("zh-CN").format(value);
}

function getSilkReportSnapshot(board = false) {
  const draft = board ? SILK_REPORT_DEFAULTS : state.silkReport;
  const machineActions = parseWholeCount(draft.machineActions);
  const estimatedQualified = parseWholeCount(draft.estimatedQualified);
  const formulaReady = machineActions !== null && estimatedQualified !== null && machineActions >= estimatedQualified;
  const calculatedWaste = formulaReady ? machineActions - estimatedQualified : null;
  const wasteOverridden = draft.manualWaste !== null;
  const manualWaste = wasteOverridden ? parseWholeCount(draft.manualWaste) : null;
  const reportedWaste = wasteOverridden ? manualWaste : calculatedWaste;
  const submittedQualified = board ? 0 : state.silkSubmittedReports.reduce((sum, report) => sum + report.estimatedQualified, 0);
  const submittedWaste = board ? 0 : state.silkSubmittedReports.reduce((sum, report) => sum + report.reportedWaste, 0);
  const submittedMachineActions = board ? 0 : state.silkSubmittedReports.reduce((sum, report) => sum + report.machineActions, 0);
  const cumulativeQualified = estimatedQualified === null ? submittedQualified : submittedQualified + estimatedQualified;
  const cumulativeWaste = reportedWaste === null ? submittedWaste : submittedWaste + reportedWaste;
  const cumulativeMachineActions = machineActions === null ? submittedMachineActions : submittedMachineActions + machineActions;
  const plannedDifference = cumulativeQualified === 0 && estimatedQualified === null ? null : SILK_PLAN_QUANTITY - cumulativeQualified;
  return {
    draft,
    machineActions,
    estimatedQualified,
    calculatedWaste,
    manualWaste,
    reportedWaste,
    submittedQualified,
    cumulativeQualified,
    cumulativeWaste,
    cumulativeMachineActions,
    plannedDifference,
    formulaReady,
    wasteOverridden,
  };
}

function silkPlanDifferenceLabel(snapshot) {
  if (snapshot.plannedDifference === null) return "—";
  if (snapshot.plannedDifference === 0) return "与计划一致";
  return snapshot.plannedDifference > 0
    ? `较计划少 ${formatCount(snapshot.plannedDifference)} 个`
    : `较计划多 ${formatCount(Math.abs(snapshot.plannedDifference))} 个`;
}

function silkPlanRemainingLabel(snapshot) {
  if (snapshot.plannedDifference === null) return "—";
  if (snapshot.plannedDifference === 0) return "已达到计划";
  return snapshot.plannedDifference > 0
    ? `还差 ${formatCount(snapshot.plannedDifference)} 个`
    : `超出计划 ${formatCount(Math.abs(snapshot.plannedDifference))} 个`;
}

function getBagReportSnapshot(board = false) {
  const draft = board ? BAG_REPORT_DEFAULTS : state.bagReport;
  const machineActions = parseWholeCount(draft.machineActions);
  const estimatedQualified = parseWholeCount(draft.estimatedQualified);
  const formulaReady = machineActions !== null && estimatedQualified !== null && machineActions >= estimatedQualified;
  const calculatedWaste = formulaReady ? machineActions - estimatedQualified : null;
  const wasteOverridden = draft.manualWaste !== null;
  const manualWaste = wasteOverridden ? parseWholeCount(draft.manualWaste) : null;
  const reportedWaste = wasteOverridden ? manualWaste : calculatedWaste;
  const submittedQualified = board ? 0 : state.bagSubmittedReports.reduce((sum, report) => sum + report.estimatedQualified, 0);
  const cumulativeQualified = BAG_BASE_QUALIFIED + submittedQualified + (estimatedQualified ?? 0);
  return {
    draft,
    machineActions,
    estimatedQualified,
    calculatedWaste,
    reportedWaste,
    formulaReady,
    wasteOverridden,
    submittedQualified,
    cumulativeQualified,
    remaining: BAG_PLAN_QUANTITY - cumulativeQualified,
  };
}

function boardTracksFor(flow) {
  if (!flow.boardTracks?.length) {
    return [{ key: "main", title: flow.title, summary: flow.summary, screens: flow.screens }];
  }
  return flow.boardTracks.filter((track) => !track.hideFromBoard).map((track) => {
    const resolveScreens = (screenIds = []) => screenIds
      .map((screenId) => flow.screens.find((screen) => screen.id === screenId))
      .filter(Boolean);
    return {
      ...track,
      screens: resolveScreens(track.screenIds),
      groups: (track.groups || []).map((group) => ({ ...group, screens: resolveScreens(group.screenIds) })),
    };
  });
}

function boardScreenCount() {
  return flows.reduce((sum, flow) => sum + boardScreenCountForFlow(flow), 0);
}

function boardScreenCountForFlow(flow) {
  const ids = new Set();
  boardTracksFor(flow).forEach((track) => {
    track.screens.forEach((screen) => ids.add(screen.atlasVariantOf || screen.id));
    track.groups.forEach((group) => group.screens.forEach((screen) => ids.add(screen.atlasVariantOf || screen.id)));
  });
  return ids.size;
}

function operationalRoleCount() {
  return flows.filter((flow) => flow.atlasSection !== "appendix").length;
}

const boardActionOutcomes = Object.freeze({
  "complete-material-issue": "回到扫码发料；后台保留卷码、真实去向、经手人和时间。",
  "save-silk-daily": "回到当前丝印任务；今天的分段报数写入后台，任务保持未完成。",
  "complete-silk-task": "回到我的今日顺序；后台保留试印照片、累计报数、机台和操作记录。",
  "save-bag-daily": "回到本机队列；今天的分段报数写入后台，任务保持未完成。",
  "complete-bag": "回到本机队列；合格品进入待打包，完整任务记录留在后台。",
  "complete-packing": "回到待打包任务；后台生成包裹记录，库存仍等待实物出库。",
  "complete-warehouse": "回到出库任务；库存流水、纸单版本、执行人和时间写入后台。",
  "complete-warehouse-adjusted": "回到出库任务；按新版纸单落账，并保留原差异与决定依据。",
  "complete-driver": "进入下一站任务；后台保留交付凭证、收货人、定位和时间。",
  "complete-maintenance": "回到设备任务；维修记录、照片、实际技术人员和完成时间留在后台。",
  "complete-inspection": "回到设备任务；巡检结论、照片和执行时间留在后台。",
  "complete-preventive": "回到设备任务；维护参数写入设备履历并生成下一周期任务。",
  "enter-authorized-role": "进入服务器授权的本人岗位；本页不扩大任何权限。",
});

function boardOutcomeFor(flow, segment) {
  if (segment.outcome) return segment.outcome;
  const lastScreen = segment.screens?.at(-1);
  const action = lastScreen?.primary;
  if (!action) return "只读参考状态，不产生业务写入。";
  if (action.action && boardActionOutcomes[action.action]) return boardActionOutcomes[action.action];
  if (action.target) {
    const target = flow.screens.find((screen) => screen.id === action.target);
    return `${action.label}后进入“${target?.title || action.target}”；业务状态以服务器返回为准。`;
  }
  return `执行“${action.label}”后等待服务器结果；成功、失败和实际操作人都必须留痕。`;
}

function renderBoardOutcome(flow, segment) {
  const firstScreen = segment.screens?.[0];
  if (!firstScreen) return "";
  return `
    <div class="board-flow-outcome" aria-label="${esc(segment.title)}链路收口">
      <span><b>入口</b>${esc(firstScreen.title)}</span>
      ${icon("arrow-right")}
      <span><b>提交后</b>${esc(boardOutcomeFor(flow, segment))}</span>
    </div>
  `;
}

function activeBoardTrackFor(flow, screen) {
  const tracks = boardTracksFor(flow);
  return tracks.find((track) => track.screens.some((item) => item.id === screen.id)) || tracks[0];
}

function updateUrl() {
  const params = new URLSearchParams();
  params.set("mode", state.mode);
  if (state.mode === "prototype") {
    params.set("role", state.flowId);
    params.set("screen", state.screenId);
  }
  history.replaceState({}, "", `${location.pathname}?${params}`);
}

function rememberLocation() {
  const last = navigationStack.at(-1);
  if (last?.flowId === state.flowId && last?.screenId === state.screenId) return;
  navigationStack.push({ flowId: state.flowId, screenId: state.screenId });
  if (navigationStack.length > 50) navigationStack.shift();
}

function resetRawDraft() {
  state.rawDraftSequence += 1;
  state.rawDraft = createRawDraft(state.rawDraftSequence);
  state.selectedRollIndex = null;
  state.officePrintCompleted = false;
  state.officePrintRetryCompleted = false;
  state.officeReceiveVariant = null;
}

function prepareScreenTransition(nextFlowId, nextScreenId) {
  const currentDraftFinished = state.rawDraft.rolls.every((roll) => {
    const status = state.attachRollStatus[`${state.rawDraft.draftId}:${roll.rollId}`];
    return status === "confirmed" || status === "mismatch";
  });
  const leavingCompletedRawDraft = state.flowId === "office"
    && (["receive-partial", "receive-complete"].includes(state.screenId)
      || (state.screenId === "attach" && Boolean(state.officeReceiveVariant)))
    && nextFlowId === "office"
    && nextScreenId === "capture";
  const returningAfterRoleSwitch = state.flowId !== "office"
    && nextFlowId === "office"
    && nextScreenId === "capture"
    && currentDraftFinished;
  if (leavingCompletedRawDraft || returningAfterRoleSwitch) resetRawDraft();
}

function guardedScreenId(flow, requestedScreenId) {
  if (flow.id !== "silk") return requestedScreenId;
  const executionScreens = new Set(["task", "started", "report", "confirm-daily", "confirm", "exception"]);
  if (state.silkCompleted && executionScreens.has(requestedScreenId)) return "my-plan";
  if (state.silkPaused && new Set(["started", "report", "confirm-daily", "confirm"]).has(requestedScreenId)) return "task";
  return requestedScreenId;
}

function setFlow(flowId, screenId, { remember = true } = {}) {
  const flow = getFlow(flowId);
  const candidateScreenId = screenId && flow.screens.some((item) => item.id === screenId) ? screenId : flowStartScreen(flow);
  const nextScreenId = guardedScreenId(flow, candidateScreenId);
  if (remember && (flow.id !== state.flowId || nextScreenId !== state.screenId)) rememberLocation();
  prepareScreenTransition(flow.id, nextScreenId);
  state.flowId = flow.id;
  state.screenId = nextScreenId;
  state.mode = "prototype";
  updateUrl();
  render();
}

function setScreen(screenId, { remember = true } = {}) {
  const flow = getFlow(state.flowId);
  if (!flow.screens.some((item) => item.id === screenId)) return;
  const nextScreenId = guardedScreenId(flow, screenId);
  if (remember && nextScreenId !== state.screenId) rememberLocation();
  prepareScreenTransition(flow.id, nextScreenId);
  state.screenId = nextScreenId;
  updateUrl();
  render();
}

function syncCurrentView() {
  window.scrollTo({ top: 0, behavior: "auto" });
  const surface = document.querySelector(".mobile-surface");
  const content = surface?.querySelector(":scope > .mobile-content");
  const flow = getFlow(state.flowId);
  const screen = getScreen(flow, state.screenId);
  const focusTarget = screen.boardFocus ? content?.querySelector(screen.boardFocus) : null;
  if (surface && focusTarget) {
    const surfaceRect = surface.getBoundingClientRect();
    const focusRect = focusTarget.getBoundingClientRect();
    const surfaceScrolls = /(auto|scroll)/.test(getComputedStyle(surface).overflowY);
    if (surfaceScrolls) {
      surface.scrollTop = Math.max(0, surface.scrollTop + focusRect.top - surfaceRect.top - 12);
    } else {
      const viewportOffset = Math.min(160, Math.max(72, Math.round(innerHeight * 0.18)));
      window.scrollTo({ top: Math.max(0, scrollY + focusRect.top - viewportOffset), behavior: "auto" });
    }
    const invalidField = focusTarget.querySelector('[aria-invalid="true"]');
    (invalidField || focusTarget).focus({ preventScroll: true });
  } else {
    surface?.scrollTo({ top: 0, behavior: "auto" });
  }
  const activeChip = document.querySelector(".flow-chips .active");
  const chipTrack = activeChip?.parentElement;
  if (!activeChip || !chipTrack) return;
  const target = activeChip.offsetLeft - (chipTrack.clientWidth - activeChip.offsetWidth) / 2;
  chipTrack.scrollTo({ left: Math.max(0, target), behavior: "auto" });
}

function goBack() {
  if (state.flowId === "office" && state.screenId === "review-edit") state.selectedRollIndex = null;
  const previous = navigationStack.pop();
  if (!previous) {
    setScreen(flowStartScreen(getFlow(state.flowId)), { remember: false });
    return;
  }
  setFlow(previous.flowId, previous.screenId, { remember: false });
}

function render() {
  fieldSerial = 0;
  app.innerHTML = state.mode === "board" ? renderBoard() : renderPrototype();
  bindEvents();
  if (state.mode === "prototype") requestAnimationFrame(syncCurrentView);
}

function renderBoardStrategy(flow) {
  const strategy = flow.boardStrategy;
  if (!strategy) return "";
  return `
    <section class="board-role-strategy" aria-labelledby="board-${esc(flow.id)}-strategy-title">
      <header>
        <span>办理方式</span>
        <h2 id="board-${esc(flow.id)}-strategy-title">${esc(strategy.title)}</h2>
        <p>${esc(strategy.summary)}</p>
      </header>
      <div class="board-strategy-modes">
        ${strategy.modes.map((mode) => `
          <article class="board-strategy-mode is-${esc(mode.tone || "default")}">
            <span>${esc(mode.label)}</span>
            <h3>${esc(mode.title)}</h3>
            <p>${esc(mode.text)}</p>
          </article>
        `).join("")}
      </div>
      <p class="board-strategy-audit">${icon("shield")}<span>${esc(strategy.audit)}</span></p>
    </section>
  `;
}

function boardScreenCaption(screen, boardVariant) {
  const variantLabels = {
    "success-dialog": "完成弹窗",
    "complete-dialog": "完成弹窗",
    "retry-complete": "重试成功",
  };
  return boardVariant && variantLabels[boardVariant] ? `${screen.label} · ${variantLabels[boardVariant]}` : screen.label;
}

function renderBoard() {
  return `
    <main class="board-page">
      <header class="board-nav">
        <strong>ERP · 手机岗位流程</strong>
        <button class="board-open-prototype" type="button" data-mode="prototype">打开可点击原型 ${icon("arrow-right")}</button>
      </header>
      <section class="board-hero">
        <span>FLOW ATLAS · ${operationalRoleCount()} 个岗位 · 1 个平台附录 · ${boardScreenCount()} 个评审状态</span>
        <h1>手机岗位全流程</h1>
        <p>每个岗位只保留完成现场任务所需的主线、异常和关键确认；导航页与同页状态不再重复计算。</p>
        <ul class="board-contract" aria-label="全流程完整性口径">
          <li>${icon("check-circle")}<span><b>入口明确</b>每个岗位有固定起点</span></li>
          <li>${icon("check-circle")}<span><b>写入前确认</b>关键提交先核对</span></li>
          <li>${icon("check-circle")}<span><b>失败可恢复</b>保留原记录安全重试</span></li>
          <li>${icon("check-circle")}<span><b>完成有回执</b>回任务池且后台留痕</span></li>
        </ul>
      </section>
      ${flows.map((flow, flowIndex) => {
        const tracks = boardTracksFor(flow);
        const isAppendix = flow.atlasSection === "appendix";
        const roleIndex = flows.slice(0, flowIndex + 1).filter((item) => item.atlasSection !== "appendix").length;
        const flowCode = isAppendix ? "附录" : String(roleIndex).padStart(2, "0");
        return `
          ${isAppendix ? `<section class="board-appendix-heading"><span>平台能力附录</span><h2>账号与设备安全</h2><p>安全能力仍完整保留，但不再与生产岗位业务动线并列统计。</p></section>` : ""}
          ${renderBoardStrategy(flow)}
          ${tracks.map((track, trackIndex) => {
            const trackCode = tracks.length > 1 ? String.fromCharCode(65 + trackIndex) : "";
            const trackType = isAppendix ? "平台安全流程" : track.kind === "reference" ? "异常 / 参考状态" : track.kind === "business" ? "独立业务动线" : "完整岗位动线";
            const firstScreen = track.screens[0] || flow.screens[0];
            return `
              <section class="board-flow board-flow--${esc(track.kind || "main")}" id="board-${esc(flow.id)}-${esc(track.key)}">
                <header class="board-flow-header">
                  <div>
                    <span>${flowCode}${trackCode}${isAppendix ? "" : ` / ${String(operationalRoleCount()).padStart(2, "0")}`} · ${esc(trackType)}</span>
                    <h2>${esc(track.title)}</h2>
                    <p>${esc(track.summary)}</p>
                  </div>
                  <button type="button" data-role="${esc(flow.id)}" data-screen="${esc(firstScreen.id)}">进入流程 ${icon("arrow-right")}</button>
                </header>
                ${track.groups?.length ? `
                  <div class="board-flow-groups">
                    ${track.groups.map((group) => `
                      <section class="board-flow-group" aria-labelledby="board-${esc(flow.id)}-${esc(track.key)}-${esc(group.key)}">
                        <header>
                          <h3 id="board-${esc(flow.id)}-${esc(track.key)}-${esc(group.key)}">${esc(group.title)}</h3>
                          <p>${esc(group.summary)}</p>
                        </header>
                        <div class="board-flow-track" aria-label="${esc(group.title)}页面画板">
                          ${group.screens.map((screen, screenIndex) => `
                            <figure class="board-screen-figure">
                              <figcaption><b>${String(screenIndex + 1).padStart(2, "0")}</b><span>${esc(boardScreenCaption(screen, group.screenVariants?.[screen.id]))}</span></figcaption>
                              ${renderMobileSurface(flow, screen, { board: true, boardPosition: { index: screenIndex, total: group.screens.length }, boardVariant: group.screenVariants?.[screen.id] })}
                            </figure>
                          `).join("")}
                        </div>
                        ${renderBoardOutcome(flow, group)}
                      </section>
                    `).join("")}
                  </div>
                ` : `
                  <div class="board-flow-track" aria-label="${esc(track.title)}页面画板">
                    ${track.screens.map((screen, screenIndex) => `
                      <figure class="board-screen-figure">
                        <figcaption><b>${String(screenIndex + 1).padStart(2, "0")}</b><span>${esc(screen.label)}</span></figcaption>
                        ${renderMobileSurface(flow, screen, { board: true, boardPosition: { index: screenIndex, total: track.screens.length } })}
                      </figure>
                    `).join("")}
                  </div>
                  ${renderBoardOutcome(flow, track)}
                `}
              </section>
            `;
          }).join("")}
        `;
      }).join("")}
      <section class="board-excluded">
        <header><h2>V1 明确不建设的手机端</h2><p>保留真实设备边界，不为完整性虚构终端。</p></header>
        ${excludedMobileRoles.map((item) => `<div><strong>${esc(item.title)}</strong><span>${esc(item.reason)}</span></div>`).join("")}
      </section>
      <footer class="board-footer">手机岗位评审原型 · 2026.07.30 · 主线、异常与关键确认</footer>
    </main>
  `;
}

function renderPrototype() {
  const flow = getFlow(state.flowId);
  const screen = getScreen(flow, state.screenId);
  const activeTrack = activeBoardTrackFor(flow, screen);
  const activeGroup = activeTrack.groups?.find((group) => group.screens.some((item) => item.id === screen.id));
  const activeScreens = activeGroup?.screens || activeTrack.screens;
  const activeFlowTitle = activeGroup ? `${activeTrack.title} · ${activeGroup.title}` : activeTrack.title;
  const currentIndex = activeScreens.findIndex((item) => item.id === screen.id);
  return `
    <main class="prototype-page">
      <aside class="role-index" aria-label="角色流程">
        <div class="role-index-heading">
          <span>手机流程图谱</span>
          <strong>${boardScreenCount()} 个评审状态</strong>
        </div>
        <nav>
          ${flows.map((item) => `
            <button class="role-link ${item.id === flow.id ? "active" : ""}" type="button" data-role="${esc(item.id)}" data-screen="${esc(flowStartScreen(item))}">
              <span>${icon(item.icon)}</span>
              <span><strong>${esc(item.shortTitle)}</strong><small>${boardScreenCountForFlow(item)} 个状态</small></span>
            </button>
          `).join("")}
        </nav>
        <button class="role-index-board" type="button" data-mode="board">${icon("grid")} 查看全部流程画板</button>
      </aside>
      <section class="prototype-workspace">
        <header class="prototype-toolbar">
          <div>
            <button type="button" class="toolbar-menu" data-action="open-role-switcher" aria-label="切换角色">${icon("menu")}</button>
            <span>${esc(flow.title)}${flow.boardTracks?.length ? ` · ${esc(activeFlowTitle)}` : ""}</span>
            <b>${currentIndex + 1} / ${activeScreens.length}</b>
          </div>
          <button type="button" data-mode="board">${icon("grid")} 流程画板</button>
        </header>
        <nav class="flow-chips" aria-label="${esc(activeFlowTitle)}流程步骤">
          ${activeScreens.map((item, index) => `<button class="${item.id === screen.id ? "active" : ""}" type="button" data-screen="${esc(item.id)}"><b>${String(index + 1).padStart(2, "0")}</b>${esc(item.label)}</button>`).join("")}
        </nav>
        <div class="prototype-stage">
          ${renderMobileSurface(flow, screen, { board: false })}
        </div>
      </section>
      ${renderDialogs(flow)}
      <div class="toast" id="toast" role="status" aria-live="polite"></div>
    </main>
  `;
}

function renderMobileSurface(flow, screen, { board, boardPosition, boardVariant }) {
  const currentIndex = flow.screens.findIndex((item) => item.id === screen.id);
  const displayIndex = boardPosition?.index ?? currentIndex;
  const displayTotal = boardPosition?.total ?? flow.screens.length;
  const layout = screenLayout(screen);
  const bottomNav = renderBottomNav(flow, screen, board);
  const headingStatus = mobileScreenStatus(flow, screen, board);
  return `
    <article class="mobile-surface layout-${layout} ${board ? "is-board" : "is-interactive"} ${bottomNav ? "has-bottom-nav" : "has-task-actions"}" data-flow="${esc(flow.id)}" data-role-color="${esc(flow.color)}" data-screen="${esc(screen.id)}" ${board && screen.boardFocus ? `data-board-focus="${esc(screen.boardFocus)}"` : ""} ${board ? `tabindex="0" aria-label="${esc(`${flow.shortTitle} · ${screen.title}，可上下滚动查看完整页面`)}"` : ""}>
      <header class="mobile-role-bar">
        <span class="mobile-role-mark">${icon(flow.icon)}</span>
        <div><strong>${esc(flow.shortTitle)}</strong><small>手机工作台</small></div>
        ${board ? `<span class="screen-count">${displayIndex + 1}/${displayTotal}</span>` : `<button type="button" data-action="open-role-switcher" aria-label="切换角色">${icon("menu")}</button>`}
      </header>
      <header class="mobile-screen-heading">
        ${currentIndex > 0 && !bottomNav ? `<button type="button" data-action="go-back" aria-label="返回上一页" ${board ? "tabindex=\"-1\"" : ""}>${icon("arrow-left")}</button>` : `<span class="heading-spacer"></span>`}
        <div><h2>${esc(screen.title)}</h2></div>
        ${headingStatus.label ? `<em class="status ${esc(headingStatus.tone)}">${esc(headingStatus.label)}</em>` : `<span class="heading-spacer"></span>`}
      </header>
      ${screen.progress ? renderProgress(screen.progress) : ""}
      <div class="mobile-content">
        ${renderRoleReceipt(flow, screen, board)}
        ${renderScreenBlocks(flow, screen, board, boardVariant)}
      </div>
      ${renderActionBar(flow, screen, board, boardVariant)}
      ${bottomNav}
      ${board && flow.id === "office" && screen.id === "print" && boardVariant === "success-dialog"
        ? renderOfficePrintSuccessBoardState(screen)
        : ""}
      ${board && flow.id === "office" && screen.id === "attach" && boardVariant === "complete-dialog"
        ? renderOfficeReceiveBoardState(flow, "complete")
        : ""}
    </article>
  `;
}

function renderScreenBlocks(flow, screen, board, boardVariant) {
  if (flow.id === "office" && screen.id === "capture") {
    return renderOfficeCaptureHome(flow, screen, board);
  }
  if (flow.id === "office") {
    const officeRenderers = {
      "capture-failed": renderOfficeCaptureFailure,
      print: renderOfficePrintBatch,
      "print-result": renderOfficePrintFailure,
      "print-retry": renderOfficePrintRetry,
      attach: renderOfficeAttach,
      "receive-partial": renderOfficeReceiveResult,
      "receive-complete": renderOfficeReceiveResult,
    };
    const renderer = officeRenderers[screen.id];
    if (renderer) return renderer(flow, screen, board, boardVariant);
  }
  return screen.blocks.map((item, blockIndex) => renderBlock(item, board, screen, blockIndex, flow, boardVariant)).join("");
}

function renderOfficeCaptureHome(flow, screen, board) {
  const resumeItems = screen.blocks[0]?.items || [];
  const evidenceItem = screen.blocks[1] || {};
  const historyItems = screen.blocks[2]?.items || [];
  const evidenceIndex = 1;
  const evidenceKey = blockStateKey("evidence", flow, screen, evidenceIndex);
  const evidenceStatus = evidenceItem.previewState || (board ? "idle" : state.evidenceStatus[evidenceKey] || "idle");
  const boardTabIndex = board ? "tabindex=\"-1\"" : "";

  const resumeRows = resumeItems.map((row) => `
    <button class="office-home-resume-card" type="button" ${navigationAttributes(row, "open-list-item")} ${boardTabIndex}>
      <span class="office-home-resume-copy">
        <strong>${esc(row.title)}</strong>
        <small>${esc(row.meta)}</small>
      </span>
      <span class="office-home-resume-action">${esc(row.badge || "继续处理")}${icon("arrow-right")}</span>
    </button>
  `).join("");

  let sourceContent = "";
  if (evidenceStatus === "saved") {
    sourceContent = `
      <div class="office-home-source-state is-saved">
        <span>${icon("check-circle")}</span>
        <div><strong>送货单已保存</strong><small>下一步核对全部卷料</small></div>
        <button type="button" data-action="evidence-retake" data-evidence-key="${esc(evidenceKey)}" ${boardTabIndex}>重拍</button>
      </div>
    `;
  } else if (evidenceStatus === "failed") {
    sourceContent = `
      <div class="office-home-source-state is-failed">
        <span>${icon("alert-triangle")}</span>
        <div><strong>上传失败</strong><small>照片仍保留在本机</small></div>
        <button type="button" data-action="evidence-retry" data-evidence-key="${esc(evidenceKey)}" ${boardTabIndex}>重新上传</button>
      </div>
    `;
  } else {
    sourceContent = `
      <div class="office-home-source-group" role="group" aria-label="选择送货单来源">
        <button class="office-home-source-option" type="button" data-action="evidence-capture" data-evidence-key="${esc(evidenceKey)}" data-evidence-fail-once="${evidenceItem.demoFailure ? "true" : "false"}" ${boardTabIndex}>
          <span>${icon("camera")}</span>
          <span><strong>拍送货单</strong><small>打开相机</small></span>
        </button>
        <button class="office-home-source-option" type="button" ${navigationAttributes(screen.secondary)} ${boardTabIndex}>
          <span>${icon("file-text")}</span>
          <span><strong>相册 / PDF</strong><small>选择已有文件</small></span>
        </button>
      </div>
    `;
  }

  const historyRows = historyItems.map((row) => `
    <li>
      <span><strong>${esc(row.title)}</strong><small>${esc(row.meta)}</small></span>
      <time>${esc(row.badge)}</time>
    </li>
  `).join("");

  return `
    <div class="office-home">
      <section class="office-home-section office-home-resume" aria-labelledby="office-home-resume-heading">
        <header class="office-home-section-heading">
          <h3 id="office-home-resume-heading">继续未完成</h3>
          <span>${resumeItems.length} 单</span>
        </header>
        <div class="office-home-resume-list">${resumeRows}</div>
      </section>
      <section class="office-home-section office-home-intake" aria-labelledby="office-home-intake-heading">
        <header class="office-home-section-heading">
          <h3 id="office-home-intake-heading">录入送货单</h3>
        </header>
        ${sourceContent}
      </section>
      <section class="office-home-section office-home-history" aria-labelledby="office-home-history-heading">
        <header class="office-home-section-heading">
          <h3 id="office-home-history-heading">最近完成</h3>
          <span>${historyItems.length} 条</span>
        </header>
        <ul class="office-home-history-list">${historyRows}</ul>
      </section>
    </div>
  `;
}

function officeScreenBlock(screen, type) {
  return screen.blocks.find((item) => item.type === type) || {};
}

function renderOfficeSectionHeading(screen, key, title, meta = "") {
  const id = `office-${screen.id}-${key}-heading`;
  return `<header class="office-task-section-heading"><h3 id="${esc(id)}">${esc(title)}</h3>${meta ? `<span>${esc(meta)}</span>` : ""}</header>`;
}

function renderOfficeObjectCard({ tone = "neutral", iconName = "package", title, meta, detail = "", status = "", action = null, media = "" }, board) {
  const boardTabIndex = board ? 'tabindex="-1"' : "";
  return `
    <article class="office-object-card is-${esc(tone)}${action ? " has-action" : ""}">
      <span class="office-object-media">${media || icon(iconName)}</span>
      <span class="office-object-copy"><strong>${esc(title)}</strong>${meta ? `<small>${esc(meta)}</small>` : ""}${detail ? `<p>${esc(detail)}</p>` : ""}</span>
      ${status || action ? `<span class="office-object-aside">${status ? `<em class="status ${esc(tone)}">${esc(status)}</em>` : ""}${action ? `<button type="button" ${navigationAttributes(action)} ${boardTabIndex}>${esc(action.label)}</button>` : ""}</span>` : ""}
    </article>
  `;
}

function renderOfficePrinterRow(printer = {}, board) {
  const boardTabIndex = board ? 'tabindex="-1"' : "";
  const connected = printer.connectionState === "connected";
  return `
    <article class="office-printer-row${connected ? " is-connected" : ""}" aria-label="打印设备型号 ${esc(printer.model)}，${esc(printer.connectionLabel)}">
      <span class="office-object-media">${icon("printer")}</span>
      <span class="office-printer-copy">
        <span class="office-printer-model"><small>型号</small><strong>${esc(printer.model)}</strong></span>
        <span class="office-printer-connection">${icon(connected ? "check-circle" : "alert-triangle")}<span>${esc(printer.connectionLabel)}</span></span>
      </span>
      <button type="button" ${navigationAttributes({ label: "更换", action: "device-picker" })} ${boardTabIndex}>更换</button>
    </article>
  `;
}

function renderOfficeQuietList(items = []) {
  return `<ul class="office-quiet-list">${items.map((item) => `
    <li>
      <span><strong>${esc(item.title)}</strong>${item.meta ? `<small>${esc(item.meta)}</small>` : ""}</span>
      ${item.value ? `<em>${esc(item.value)}</em>` : ""}
    </li>
  `).join("")}</ul>`;
}

function officeConfirmedPrintRolls(board) {
  return board ? reviewedRawMaterialRolls : state.rawDraft.rolls;
}

function renderOfficePrintRollList(rolls = []) {
  return `<ol class="office-print-roll-list" aria-label="核对完成的送货单卷料">${rolls.map((roll) => `
    <li>
      <b>第 ${roll.index} 卷</b>
      <span><strong>${esc(roll.color)}</strong><small>${esc(formatRawMaterialSpec(roll.spec))}</small></span>
      <em>${esc(roll.weight)}</em>
    </li>
  `).join("")}</ol>`;
}

function renderOfficeRecordDisclosure(title, rows = [], board) {
  if (!rows.length) return "";
  return `
    <details class="office-record-disclosure">
      <summary ${board ? 'tabindex="-1"' : ""}><span>${esc(title)}</span>${icon("arrow-right")}</summary>
      <dl>${rows.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl>
    </details>
  `;
}

function renderOfficeCaptureFailure(_flow, screen, board) {
  const item = officeScreenBlock(screen, "office-capture-failure");
  const media = item.image
    ? `<img src="${esc(item.image)}" alt="已保留的送货单照片" width="96" height="72" />`
    : icon("camera");
  return `
    <div class="office-task-page office-capture-failure">
      <section class="office-task-section" aria-labelledby="office-${esc(screen.id)}-source-heading">
        ${renderOfficeSectionHeading(screen, "source", "这张送货单")}
        ${renderOfficeObjectCard({
          title: item.title,
          meta: item.state,
          media,
          action: { label: "查看", action: "view-evidence" },
        }, board)}
      </section>
      <div class="office-safety-note is-danger">${icon("alert-triangle")}<span><strong>${esc(item.blocker)}</strong><small>${esc(item.note)}</small></span></div>
      ${renderOfficeRecordDisclosure("上传详情", item.details, board)}
    </div>
  `;
}

function renderOfficePrintBatch(flow, screen, board) {
  const item = officeScreenBlock(screen, "office-print-batch");
  const rolls = officeConfirmedPrintRolls(board);
  const previewRoll = rolls.find((roll) => roll.index === item.previewRollIndex) || rolls[0] || {};
  const printer = item.printer || {};
  return `
    <div class="office-task-page office-print-page">
      <section class="office-task-section office-label-batch" aria-labelledby="office-${esc(screen.id)}-batch-heading">
        ${renderOfficeSectionHeading(screen, "batch", "本次打印", `${rolls.length} 张 · 每卷一张`)}
        ${renderLabelPreview({ ...previewRoll, supplier: item.supplier }, board, screen, 0, flow)}
        <div class="office-print-roll-heading"><strong>送货单逐卷明细</strong><span>已核对</span></div>
        ${renderOfficePrintRollList(rolls)}
      </section>
      <section class="office-task-section" aria-labelledby="office-${esc(screen.id)}-device-heading">
        ${renderOfficeSectionHeading(screen, "device", "打印设备")}
        ${renderOfficePrinterRow(printer, board)}
      </section>
    </div>
  `;
}

function officePrintSuccessReceipt(flow) {
  const printScreen = flow?.screens.find((screen) => screen.id === "print");
  return printScreen ? officeScreenBlock(printScreen, "office-print-batch")?.successReceipt || {} : {};
}

function renderOfficePrintSuccessReceipt(receipt, { board = false, titleId = "", deviceId = "" } = {}) {
  const headingId = titleId ? ` id="${esc(titleId)}"` : "";
  const descriptionId = deviceId ? ` id="${esc(deviceId)}"` : "";
  const action = board
    ? `<span class="office-print-success-primary">${esc(receipt.actionLabel)}</span>`
    : `<button class="office-print-success-primary" type="button" data-screen="${esc(receipt.target)}" autofocus>${esc(receipt.actionLabel)}</button>`;
  return `
    <div class="office-print-success-content">
      <span class="office-print-success-mark">${icon("check-circle")}</span>
      <div class="office-print-success-copy">
        <h2${headingId}>${esc(receipt.title)}</h2>
        <p${descriptionId}><span>打印机</span><strong>${esc(receipt.device)}</strong></p>
      </div>
      ${action}
    </div>
  `;
}

function renderOfficePrintSuccessBoardState(screen) {
  const receipt = officeScreenBlock(screen, "office-print-batch")?.successReceipt || {};
  return `
    <div class="office-print-success-board-state" aria-label="${esc(receipt.title)}弹窗状态">
      <section class="office-print-success-board-panel">
        ${renderOfficePrintSuccessReceipt(receipt, { board: true })}
      </section>
    </div>
  `;
}

function renderOfficePrintFailure(_flow, screen, board, boardVariant) {
  if ((!board && state.officePrintRetryCompleted) || boardVariant === "retry-complete") {
    const retryScreen = _flow.screens.find((item) => item.id === "print-retry");
    return renderOfficePrintRetry(_flow, retryScreen, board);
  }
  const item = officeScreenBlock(screen, "office-print-failure");
  return `
    <div class="office-task-page office-print-result-page">
      <section class="office-task-section" aria-labelledby="office-${esc(screen.id)}-failure-heading">
        ${renderOfficeSectionHeading(screen, "failure", "需要重新打印", "1 张")}
        ${renderOfficeObjectCard({
          tone: "danger",
          iconName: "printer",
          title: item.rollId,
          meta: `第 ${item.rollIndex} 卷 · ${item.reason}`,
          status: "待重试",
        }, board)}
      </section>
      <div class="office-safety-note is-success">${icon("check-circle")}<span><strong>其余 ${esc(item.succeeded)} 张已成功</strong><small>本次只重新打印这一张。</small></span></div>
      ${renderOfficeRecordDisclosure("打印记录", [["作业", item.jobId], ["设备", item.device]], board)}
    </div>
  `;
}

function officeReceiveScreen(flow, variant) {
  return flow?.screens.find((screen) => screen.id === (variant === "partial" ? "receive-partial" : "receive-complete"));
}

function renderOfficeReceiveBoardState(flow, variant) {
  const resultScreen = officeReceiveScreen(flow, variant);
  return `
    <div class="office-print-success-board-state office-receive-board-state" aria-label="${esc(resultScreen?.title || "收货完成")}弹窗状态">
      <section class="office-print-success-board-panel office-receive-board-panel">
        ${resultScreen ? renderOfficeReceiveResult(flow, resultScreen, true) : ""}
        ${resultScreen?.primary ? `<span class="office-print-success-primary">${esc(resultScreen.primary.label)}</span>` : ""}
      </section>
    </div>
  `;
}

function renderOfficeReceiveDialog(flow) {
  const resultScreen = officeReceiveScreen(flow, state.officeReceiveVariant || "complete");
  if (!resultScreen) return "";
  return `
    <dialog class="office-receive-dialog" id="receiveResultDialog" aria-labelledby="receiveResultDialogTitle">
      <button class="office-print-success-close" type="button" data-close-dialog aria-label="关闭收货结果">×</button>
      <h2 id="receiveResultDialogTitle">${esc(resultScreen.title)}</h2>
      ${renderOfficeReceiveResult(flow, resultScreen, false)}
      <div class="office-receive-dialog-actions">
        ${resultScreen.secondary ? `<button type="button" class="secondary" ${navigationAttributes(resultScreen.secondary)}>${esc(resultScreen.secondary.label)}</button>` : ""}
        ${resultScreen.primary ? `<button type="button" class="primary" ${navigationAttributes(resultScreen.primary)}>${esc(resultScreen.primary.label)}</button>` : ""}
      </div>
    </dialog>
  `;
}

function renderOfficePrintRetry(_flow, screen, board) {
  const item = officeScreenBlock(screen, "office-print-retry");
  return `
    <div class="office-task-page office-print-result-page">
      ${renderOfficeObjectCard({
        tone: "success",
        iconName: "check-circle",
        title: `第 ${item.rollIndex} 卷补打成功`,
        meta: `${item.rollId} · ${item.device}`,
        status: `${item.total}/${item.total}`,
      }, board)}
      <div class="office-safety-note is-success">${icon("shield")}<span><strong>全部 ${esc(item.total)} 张可以贴标</strong><small>仅补打 1 张，其他 8 张未重复。</small></span></div>
      ${renderOfficeRecordDisclosure("打印记录", [["原作业", item.originalJobId], ["补打作业", item.retryJobId]], board)}
    </div>
  `;
}

function renderOfficeAttach(flow, screen, board, boardVariant) {
  const locationForm = officeScreenBlock(screen, "form");
  const locationField = locationForm.fields?.[0] || {};
  const rolls = officeScreenBlock(screen, "attach-rolls");
  return `
    <div class="office-task-page office-attach-page">
      <section class="office-task-section" aria-labelledby="office-${esc(screen.id)}-location-heading">
        ${renderOfficeSectionHeading(screen, "location", "收货位置")}
        <label class="office-location-control">
          <span>${icon("warehouse")}</span>
          <select aria-label="收货位置" ${board ? "disabled" : ""}>${(locationField.options || [locationField.value]).map((option) => `<option ${option === locationField.value ? "selected" : ""}>${esc(option)}</option>`).join("")}</select>
        </label>
      </section>
      ${renderAttachRolls(rolls, board, screen, 1, flow, boardVariant)}
    </div>
  `;
}

function renderOfficeReceiveResult(_flow, screen, board) {
  const item = officeScreenBlock(screen, "office-receive-result");
  if (item.variant === "partial") {
    const isolatedRoll = reviewedRawMaterialRolls.find((roll) => roll.rollId === item.isolatedRollId) || {};
    return `
      <div class="office-task-page office-receive-page">
        <section class="office-task-section" aria-labelledby="office-${esc(screen.id)}-received-heading">
          ${renderOfficeSectionHeading(screen, "received", "收货结果", item.inboundId)}
          ${renderOfficeObjectCard({
            tone: "success",
            iconName: "check-circle",
            title: `${item.receivedCount} 卷已入库`,
            meta: `${item.availableWeight} · 库存状态：可用`,
            status: "完成",
          }, board)}
        </section>
        <section class="office-task-section" aria-labelledby="office-${esc(screen.id)}-isolated-heading">
          ${renderOfficeSectionHeading(screen, "isolated", "待处理卷", `${item.isolatedCount} 卷`)}
          ${renderOfficeObjectCard({
            tone: "warning",
            iconName: "alert-triangle",
            title: item.isolatedRollId,
            meta: `${isolatedRoll.color || "大红"} · ${formatRawMaterialSpec(isolatedRoll.spec)} · ${item.isolatedWeight}`,
            detail: "标签/实物不符 · 其他 8 卷不受影响",
            status: "已隔离",
          }, board)}
        </section>
        ${renderOfficeRecordDisclosure("收货记录", [["收货单", item.inboundId], ["已入库", `${item.receivedCount} 卷`], ["已隔离", `${item.isolatedCount} 卷`]], board)}
      </div>
    `;
  }
  return `
    <div class="office-task-page office-receive-page">
      <section class="office-task-section" aria-labelledby="office-${esc(screen.id)}-receipt-heading">
        ${renderOfficeSectionHeading(screen, "receipt", "收货单", item.inboundId)}
        ${renderOfficeObjectCard({
          tone: "success",
          iconName: "check-circle",
          title: item.supplier,
          meta: `${item.receivedCount} 卷 · ${item.totalWeight}`,
          detail: `库存状态：${item.inventoryStatus} · 收货位置：${item.location}`,
          status: "已入库",
        }, board)}
      </section>
      ${renderOfficeRecordDisclosure("收货记录", [["收货单", item.inboundId], ["完成时间", item.completedAt], ["收货位置", item.location]], board)}
    </div>
  `;
}

function mobileScreenStatus(flow, screen, board) {
  if (!board && flow.id === "office" && screen.id === "review-edit") {
    const roll = currentExpandedReviewRoll(screen);
    if (roll) {
      const blockers = rollReviewBlockers(editableRollValues(roll, { useReviewDraft: true }));
      return {
        label: blockers.length ? `第 ${roll.index} 卷需补全` : `第 ${roll.index} 卷待确认`,
        tone: "warning",
      };
    }
  }
  return { label: screen.status || "", tone: screen.statusTone || "neutral" };
}

function renderRoleReceipt(flow, screen, board) {
  if (board) return "";
  const entryScreens = new Set(["queue", "visible", "scan", "capture", "my-plan"]);
  const receipt = state.roleReceipts[flow.id];
  if (!receipt || !entryScreens.has(screen.id)) return "";
  return renderAlert({ title: receipt.title, text: receipt.text, tone: receipt.tone || "success" });
}

function screenLayout(screen) {
  if (screen.blocks.some((item) => item.type.startsWith("office-") || item.type === "attach-rolls" && item.compact)) return "office-task";
  if (screen.blocks[0]?.type === "alert" && screen.blocks[0]?.tone === "success") return "result";
  const cardTypes = new Set(["list", "function-grid", "rolls", "attach-rolls", "scan", "label-preview", "evidence", "delivery-note", "decision-summary", "variance-summary", "financial-summary"]);
  return screen.blocks.some((item) => cardTypes.has(item.type)) ? "feed" : "sheet";
}

function renderProgress(progress) {
  return `
    <ol class="mobile-progress" aria-label="流程进度">
      ${progress.labels.map((label, index) => {
        const className = index < progress.current ? "done" : index === progress.current ? "active" : "";
        const actionIcons = { "拍单": "camera", "核对": "check-circle", "打印": "printer", "贴标": "tag" };
        const mark = actionIcons[label] ? icon(actionIcons[label]) : index < progress.current ? icon("check-circle") : index + 1;
        return `<li class="${className}"><span>${mark}</span><small>${esc(label)}</small></li>`;
      }).join("")}
    </ol>
  `;
}

function recordScope(flow, screen) {
  const rawMaterialScreens = new Set(["capture", "capture-failed", "review", "review-edit", "print", "print-result", "print-retry", "attach", "receive-partial", "receive-complete"]);
  return flow.id === "office" && rawMaterialScreens.has(screen.id) ? state.rawDraft.draftId : "default";
}

function blockStateKey(kind, flow, screen, blockIndex) {
  return `${kind}:${flow.id}:${screen.id}:${blockIndex}:${recordScope(flow, screen)}`;
}

function checklistEntry(entry) {
  if (typeof entry === "string") return { text: entry, required: false };
  return {
    text: entry.label ?? entry.text ?? entry.title ?? entry.value ?? "待核对事项",
    required: Boolean(entry.required || entry.critical),
  };
}

function checklistRequiresGate(item, screen) {
  return Boolean(item.required || item.critical || screen.requireChecklist || screen.requiredChecklist);
}

function isReadOnlyChecklist(item) {
  return Boolean(item.readOnly || item.readonly || (!item.required && !item.critical));
}

function isCaptureEvidence(item) {
  return Boolean(item.source || item.capture || item.upload || /(拍|上传|相机)/.test(item.actionLabel || ""));
}

function evidenceRequiresGate(item) {
  return isCaptureEvidence(item) && Boolean(
    item.required
    || item.critical
    || item.source
    || /(必需|必须|至少.{0,8}(?:张|拍)|提交.{0,12}前.{0,8}拍)/.test(`${item.title || ""}${item.text || ""}`),
  );
}

function rawReviewStats(board = false) {
  const rolls = board ? rawMaterialRolls : state.rawDraft.rolls;
  const confirmed = board ? 0 : rolls.filter((roll) => roll.confirmed).length;
  return { confirmed, total: rolls.length };
}

function screenGateStatus(flow, screen, board = false) {
  if (flow.id === "office" && screen.id === "review") {
    const stats = rawReviewStats(board);
    if (stats.confirmed < stats.total) return { blocked: true, reason: `还要确认 ${stats.total - stats.confirmed} 卷` };
  }
  for (let blockIndex = 0; blockIndex < screen.blocks.length; blockIndex += 1) {
    const item = screen.blocks[blockIndex];
    if (item.type === "checklist" && !isReadOnlyChecklist(item)) {
      const gateWholeList = checklistRequiresGate(item, screen);
      const missing = item.items
        .map((entry, index) => ({ ...checklistEntry(entry), index }))
        .filter((entry) => (gateWholeList || entry.required)
          && !(board ? false : state.checklistStatus[`${blockStateKey("check", flow, screen, blockIndex)}:${entry.index}`]));
      if (missing.length) return { blocked: true, reason: `还有 ${missing.length} 项必须核对` };
    }
    if (item.type === "evidence" && evidenceRequiresGate(item)) {
      const saved = !board && state.evidenceStatus[blockStateKey("evidence", flow, screen, blockIndex)] === "saved";
      if (!saved) return { blocked: true, reason: "请先保存必需照片" };
    }
  }
  return { blocked: false, reason: "" };
}

function renderActionBar(flow, screen, board, boardVariant) {
  let primary = screen.primary;
  let candidateSecondary = screen.secondary;
  let actionNote = screen.actionNote || "";
  if (flow.id === "office" && screen.id === "capture") {
    const evidenceIndex = screen.blocks.findIndex((item) => item.type === "evidence");
    const evidenceKey = evidenceIndex >= 0 ? blockStateKey("evidence", flow, screen, evidenceIndex) : "";
    const evidenceSaved = !board && evidenceKey && state.evidenceStatus[evidenceKey] === "saved";
    candidateSecondary = null;
    if (!evidenceSaved) primary = null;
  }
  if (flow.id === "office" && screen.id === "review") {
    const stats = rawReviewStats(board);
    primary = { label: `已确认 ${stats.confirmed}/${stats.total} · 进入打印`, action: "complete-roll-review" };
  }
  if (flow.id === "office" && screen.id === "review-edit") {
    const stats = board ? screen.demoReviewStats : rawReviewStats(false);
    const nextIndex = board ? screen.demoReviewStats?.nextIndex : state.selectedRollIndex || screen.demoReviewStats?.nextIndex;
    primary = { label: `确认送货单（${stats?.confirmed || 0}/${stats?.total || 0}）`, disabled: true };
    actionNote = `还要确认第 ${nextIndex || 1} 卷`;
  }
  if (!board && flow.id === "office" && screen.id === "print" && state.officePrintCompleted) {
    primary = { label: "查看打印结果", action: "show-print-success" };
  }
  if (flow.id === "office" && screen.id === "print-result" && ((!board && state.officePrintRetryCompleted) || boardVariant === "retry-complete")) {
    primary = { label: "开始贴标", target: "attach" };
    candidateSecondary = null;
  }
  if (!board && flow.id === "silk" && screen.id === "task" && state.silkPaused) {
    primary = { label: "等待办公室处理", disabled: true };
    candidateSecondary = { label: "查看我的顺序", target: "my-plan" };
  }
  const secondary = candidateSecondary || null;
  if (!primary && !secondary) return "";
  return `
    <aside class="mobile-action-bar ${board ? "is-static" : ""} ${actionNote ? "has-note" : ""}">
      ${actionNote ? `<p class="mobile-action-note">${esc(actionNote)}</p>` : ""}
      ${secondary ? renderActionButton(secondary, "secondary", board, flow, screen, boardVariant) : ""}
      ${primary ? renderActionButton(primary, "primary", board, flow, screen, boardVariant) : ""}
    </aside>
  `;
}

function renderActionButton(action, variant, board, flow, screen, boardVariant) {
  const attrs = navigationAttributes(action);
  const attachStats = action.action === "complete-attach" ? getAttachStats(board, boardVariant) : null;
  const label = attachStats ? `完成整单 · ${attachStats.processed}/${attachStats.total}` : action.label;
  const gate = variant === "primary" ? screenGateStatus(flow, screen, board) : { blocked: false, reason: "" };
  const attachBlocked = Boolean(attachStats && attachStats.processed < attachStats.total);
  const isDisabled = action.disabled || attachBlocked || gate.blocked;
  const disabled = isDisabled ? "disabled aria-disabled=\"true\"" : "";
  const gateReason = gate.reason ? `data-gate-reason="${esc(gate.reason)}" title="${esc(gate.reason)}"` : "";
  return `<button class="action-button ${variant}" type="button" ${attrs} data-base-disabled="${action.disabled ? "true" : "false"}" data-attach-blocked="${attachBlocked ? "true" : "false"}" ${disabled} ${gateReason} ${board ? "tabindex=\"-1\"" : ""}>${esc(label)}</button>`;
}

function navigationAttributes(item = {}, fallbackAction = "prototype-placeholder") {
  if (item.targetRole) return `data-role="${esc(item.targetRole)}" data-screen="${esc(item.target || "")}"`;
  if (item.target) return `data-screen="${esc(item.target)}"`;
  if (item.action) return `data-action="${esc(item.action)}"`;
  return fallbackAction ? `data-action="${esc(fallbackAction)}"` : "";
}

function renderBottomNav(flow, screen, board) {
  if (flow.hideBottomNav) return "";
  const defaultTabs = [
    { key: "current", label: "当前任务", icon: "inbox" },
    { key: "pending", label: "待处理", icon: "list" },
    ...(flow.tabs?.material ? [{ key: "material", label: "录原材料", icon: "camera" }] : []),
    { key: "all", label: "全部功能", icon: "grid" },
  ];
  const tabs = (flow.bottomNav?.length ? flow.bottomNav : defaultTabs).map((tab, index) => {
    if (Array.isArray(tab)) {
      const [key, label, iconName, target, count] = tab;
      return { key, label, icon: iconName, target, count, index };
    }
    return { ...tab, index };
  });
  const resolveTabTarget = (tab) => {
    const ref = tab.target ?? flow.tabs?.[tab.key];
    if (typeof ref === "string") return flow.screens.find((item) => item.id === ref)?.id || flowStartScreen(flow);
    return flow.screens[ref ?? 0]?.id || flowStartScreen(flow);
  };
  const active = tabs.find((tab) => resolveTabTarget(tab) === screen.id)?.key;
  if (!active) return "";
  return `
    <nav class="mobile-bottom-nav" aria-label="${esc(flow.shortTitle)}手机导航" style="--mobile-nav-count: ${tabs.length}">
      ${tabs.map((tab) => {
        const target = resolveTabTarget(tab);
        const count = Number(tab.count ?? (tab.key === "pending" ? flow.pendingCount : 0) ?? 0);
        return `<button class="${active === tab.key ? "active" : ""}" type="button" data-screen="${esc(target)}" ${board ? "tabindex=\"-1\"" : ""}>${icon(tab.icon || "inbox")}<span>${esc(tab.label)}</span>${count > 0 ? `<b>${count}</b>` : ""}</button>`;
      }).join("")}
    </nav>
  `;
}

function renderBlock(item, board, screen, blockIndex, flow, boardVariant) {
  const renderers = {
    alert: renderAlert,
    facts: renderFacts,
    "decision-summary": renderDecisionSummary,
    "decision-choice-confirmation": renderDecisionChoiceConfirmation,
    "decision-reason": renderDecisionReason,
    "decision-result": renderDecisionResult,
    "variance-summary": renderVarianceSummary,
    "financial-summary": renderFinancialSummary,
    list: renderList,
    "silk-marker-roster": renderSilkMarkerRoster,
    "silk-task-pool": renderSilkTaskPool,
    "silk-marker-confirm": renderSilkMarkerConfirm,
    "silk-my-plan": renderSilkMyPlan,
    "silk-production-brief": renderSilkProductionBrief,
    "silk-task-strip": renderSilkTaskStrip,
    "silk-report-form": renderSilkReportForm,
    "silk-report-summary": renderSilkReportSummary,
    "silk-daily-saved": renderSilkDailySaved,
    "silk-pause-receipt": renderSilkPauseReceipt,
    "silk-complete-confirmation": renderSilkCompleteConfirmation,
    "silk-complete-receipt": renderSilkCompleteReceipt,
    "bag-task-brief": renderBagTaskBrief,
    "bag-report-form": renderBagReportForm,
    "bag-report-summary": renderBagReportSummary,
    form: renderForm,
    checklist: renderChecklist,
    timeline: renderTimeline,
    evidence: renderEvidence,
    "delivery-note": renderDeliveryNote,
    rolls: renderRolls,
    "material-issue-summary": renderMaterialIssueSummary,
    "attach-rolls": renderAttachRolls,
    "label-preview": renderLabelPreview,
    "function-grid": renderFunctionGrid,
    "permission-list": renderPermissionList,
    "choice-grid": renderChoiceGrid,
    scan: renderScan,
  };
  return (renderers[item.type] || renderUnknown)(item, board, screen, blockIndex, flow, boardVariant);
}

function renderAlert(item) {
  return `<section class="content-alert ${esc(item.tone || "info")}">${icon(item.tone === "success" ? "check-circle" : item.tone === "danger" || item.tone === "warning" ? "alert-triangle" : "shield")}<div><strong>${esc(item.title)}</strong><p>${esc(item.text)}</p></div></section>`;
}

function factVisualRole(label, value, metadata = {}) {
  if (metadata.role) return metadata.role;
  if (/差异|未结余额|异常|缺口|故障现象|需要配件|当前缺少|需要决定|最急交期/.test(label)) return "critical";
  if (/^(客户|客户 \/ 订单类型|订单类型|货品|当前货品|工作内容|机台|设备|任务 \/ 机台|材料范围)$/.test(label)) return "primary";
  if (/编号|版本|对账单|纸单|决定渠道|决定时间|执行人|操作人|账号|会话|权限来源|来源|打印记录|收货单|作业$/.test(label)) return "secondary";
  if (String(value).length > 24) return "supporting";
  return "standard";
}

function renderFacts(item) {
  const structuredRows = item.items.map(([label, value, metadata = {}]) => ({
    label,
    value,
    metadata,
    role: factVisualRole(label, value, metadata),
  }));
  if (!structuredRows.some(({ role }) => ["primary", "critical"].includes(role))) {
    const anchor = structuredRows.find(({ role }) => role !== "secondary");
    if (anchor) anchor.role = "primary";
  }
  const rows = structuredRows.map(({ label, value, metadata, role }) => {
    const wide = metadata.wide || ["primary", "critical", "supporting"].includes(role);
    return `<div class="fact-row is-${esc(role)}${wide ? " is-wide" : ""}"><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
  }).join("");
  return `<section class="content-section facts-section">${item.title ? `<header><h3>${esc(item.title)}</h3></header>` : ""}<dl>${rows}</dl></section>`;
}

function renderDecisionSummary(item) {
  const keyFacts = item.keyFacts || [];
  const signals = item.signals || [];
  const impactBrief = item.variant === "impact-brief";
  const accessibleSummary = [
    item.customer,
    item.orderType,
    item.product,
    item.productMeta,
    ...keyFacts.map(([, value]) => value),
    ...signals.map(([, value]) => value),
  ].filter(Boolean).join("，");
  return `
    <section class="decision-summary${impactBrief ? " is-impact-brief" : ""}" aria-label="${esc(accessibleSummary)}">
      <header>
        <div><span>${esc(item.scope || "客户")}</span><strong>${esc(item.customer)}</strong></div>
        <em class="status ${esc(item.statusTone || "warning")}">${esc(item.status || "待决定")}</em>
      </header>
      <div class="decision-order-identity">
        ${impactBrief
          ? `<div class="decision-order-heading"><span>${esc(item.orderType)}</span>${item.product ? `<strong>${esc(item.product)}</strong>` : ""}</div>${item.productMeta ? `<p>${esc(item.productMeta)}</p>` : ""}`
          : `<span>${esc(item.identityLabel || "订单类型")}</span><strong>${esc(item.orderType)}</strong>${item.product ? `<p>${esc(item.product)}</p>` : ""}`}
      </div>
      <dl class="decision-key-facts">
        ${keyFacts.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("")}
      </dl>
      <div class="decision-signals">
        ${signals.map(([label, value, tone = "neutral"]) => `<div class="${esc(tone)}"><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`).join("")}
      </div>
      ${(item.trace || []).length ? `<footer aria-label="追溯信息">${item.trace.map(([label, value]) => `<span><small>${esc(label)}</small>${esc(value)}</span>`).join("")}</footer>` : ""}
    </section>
  `;
}

function selectedDecision(item, board = false) {
  return board ? item.defaultDecision : state.decisionChoices[item.decisionId] || item.defaultDecision;
}

function renderDecisionChoiceConfirmation(item, board) {
  return renderFacts({
    title: "本次决定",
    items: [
      ["决定", selectedDecision(item, board)],
      ["决定人", "当前授权决策人"],
      ["当前版本", "v4"],
    ],
  });
}

function renderDecisionReason(item, board) {
  const decision = selectedDecision(item, board);
  const value = item.values?.[decision] || item.values?.[item.defaultDecision] || "";
  return renderForm({ title: "决定说明", fields: [{ label: "处理依据", value, type: "textarea" }] }, board);
}

function renderDecisionResult(item, board) {
  const decision = selectedDecision(item, board);
  const isDefault = decision === item.defaultDecision;
  const text = isDefault
    ? item.text
    : `“${decision}”已按当前授权人、证据版本和服务器版本记录；不会套用另一种处理方式的执行结果。`;
  const nextSteps = isDefault
    ? item.nextSteps
    : ["办公室 A/B 收到本次决定", "按所选处理方式生成或更新执行待办", "执行结果继续由对应岗位独立回执"];
  return [
    renderAlert({ title: item.title, text, tone: "success" }),
    renderFacts({ items: [["本次决定", decision], ["实际决定人", "按本次登录与授权记录"], ["决定渠道", "本人手机 / 办公室代录"], ["决定时间", "提交成功时记录"], ["有效版本", "服务器返回"]] }),
    renderTimeline({ title: "下一步", items: nextSteps }),
  ].join("");
}

function renderVarianceSummary(item) {
  const unit = item.unit || "个";
  const accessibleSummary = [item.customer, item.orderType, item.product, `应出 ${item.expected} ${unit}`, `现场实数 ${item.actual} ${unit}`, item.difference].filter(Boolean).join("，");
  return `
    <section class="variance-summary" aria-label="${esc(accessibleSummary)}">
      <header>
        <div><span>客户</span><strong>${esc(item.customer)}</strong></div>
        <em class="status ${esc(item.statusTone || "warning")}">${esc(item.status)}</em>
      </header>
      ${item.orderType || item.product || item.due ? `<div class="variance-business-context">
        ${item.orderType ? `<span><small>订单类型</small><strong>${esc(item.orderType)}</strong></span>` : ""}
        ${item.product ? `<span><small>货品</small><strong>${esc(item.product)}</strong></span>` : ""}
        ${item.due ? `<span><small>交期</small><strong>${esc(item.due)}</strong></span>` : ""}
      </div>` : ""}
      <div class="variance-quantity" aria-hidden="true">
        <div><span>应出</span><strong>${esc(item.expected)}<small>${esc(unit)}</small></strong></div>
        <b>${icon("arrow-right")}</b>
        <div><span>现场实数</span><strong>${esc(item.actual)}<small>${esc(unit)}</small></strong></div>
      </div>
      <div class="variance-difference"><span>本次差异</span><strong>${esc(item.difference)}</strong></div>
      <footer aria-label="追溯信息">
        ${(item.trace || []).map(([label, value]) => `<span><small>${esc(label)}</small>${esc(value)}</span>`).join("")}
      </footer>
    </section>
  `;
}

function renderFinancialSummary(item) {
  const accessibleSummary = [
    item.customer,
    `${item.leftLabel} ${item.leftValue}`,
    `${item.rightLabel} ${item.rightValue}`,
    `${item.differenceLabel} ${item.difference}`,
    item.subject,
  ].filter(Boolean).join("，");
  return `
    <section class="financial-summary" aria-label="${esc(accessibleSummary)}">
      <header>
        <div><span>客户</span><strong>${esc(item.customer)}</strong></div>
        <em class="status ${esc(item.statusTone || "warning")}">${esc(item.status || "待决定")}</em>
      </header>
      <div class="financial-comparison" aria-hidden="true">
        <div><span>${esc(item.leftLabel)}</span><strong>${esc(item.leftValue)}</strong></div>
        <b>${icon("arrow-right")}</b>
        <div><span>${esc(item.rightLabel)}</span><strong>${esc(item.rightValue)}</strong></div>
      </div>
      <div class="financial-difference"><span>${esc(item.differenceLabel)}</span><strong>${esc(item.difference)}</strong></div>
      ${item.subject ? `<div class="financial-subject"><span>${esc(item.subjectLabel || "说明")}</span><strong>${esc(item.subject)}</strong></div>` : ""}
      ${(item.trace || []).length ? `<footer aria-label="追溯信息">${item.trace.map(([label, value]) => `<span><small>${esc(label)}</small>${esc(value)}</span>`).join("")}</footer>` : ""}
    </section>
  `;
}

function resolveSemanticTag(tag = {}) {
  const kind = String(tag.kind || "state");
  const rawValue = tag.value;
  const normalizedValue = kind === "business"
    ? getBusinessTypeTagValue(rawValue)
    : kind === "requirement"
      ? getRequirementTagValue(rawValue)
      : kind === "state"
        ? getOperationalStateTagValue(rawValue)
        : rawValue;
  const definition = getSemanticTagDefinition(kind, normalizedValue);
  return {
    ...definition,
    label: tag.label || definition.label,
  };
}

function renderSemanticTags(tags = [], size = "compact") {
  if (!tags.length) return "";
  return `<span class="erp-semantic-tags">${tags.map((tag) => {
    const definition = resolveSemanticTag(tag);
    return `<em class="erp-semantic-tag" data-kind="${esc(definition.kind)}" data-value="${esc(definition.value)}" data-known="${definition.known ? "true" : "false"}" data-size="${esc(size)}">${esc(definition.label)}</em>`;
  }).join("")}</span>`;
}

function renderTaskRowCopy(row) {
  const metaLead = row.metaLead || row.meta || "";
  return `<span class="task-row-copy"><strong>${esc(row.title)}</strong>${metaLead || row.semanticTags?.length || row.metaTail ? `<span class="task-row-meta">${metaLead ? `<small>${esc(metaLead)}</small>` : ""}${renderSemanticTags(row.semanticTags)}${row.metaTail ? `<small>${esc(row.metaTail)}</small>` : ""}</span>` : ""}</span>`;
}

function renderList(item, board, screen, _blockIndex, flow) {
  const receipt = !board ? state.roleReceipts[flow?.id] : null;
  let rows = receipt?.removeCurrent && ["queue", "visible"].includes(screen?.id)
    ? item.items.filter((row) => receipt.removeTask ? !row.title.includes(receipt.removeTask) : !row.selected)
    : item.items;
  if (!board && flow?.id === "bag" && screen?.id === "queue") {
    const submitted = state.bagSubmittedReports.reduce((sum, report) => sum + report.estimatedQualified, 0);
    const completed = BAG_BASE_QUALIFIED + submitted;
    rows = rows.map((row) => row.selected ? {
      ...row,
      metaLead: "30 × 38 × 10 · 蓝印白",
      metaTail: `已完成 ${formatCount(completed)} · 剩余 ${formatCount(Math.max(0, BAG_PLAN_QUANTITY - completed))}`,
    } : row);
  }
  const content = rows.length
    ? rows.map((row) => {
      const inner = `${renderTaskRowCopy(row)}<em class="status ${esc(row.tone)}">${esc(row.badge)}</em>`;
      if (row.static) return `<div class="task-row is-static ${row.selected ? "selected" : ""}">${inner}</div>`;
      return `<button class="task-row ${row.selected ? "selected" : ""}" type="button" ${navigationAttributes({ ...item, ...row }, "open-list-item")} ${board ? "tabindex=\"-1\"" : ""}>${inner}</button>`;
    }).join("")
    : `<p class="task-list-empty">当前没有下一项已发布任务</p>`;
  return `<section class="content-section task-list"><header><h3>${esc(item.title)}</h3><span>${rows.length}</span></header><div>${content}</div></section>`;
}

function renderSilkMarkerRoster(item, board) {
  return `
    <section class="content-section silk-marker-roster">
      <header><div><h3>${esc(item.title)}</h3><p>${esc(item.summary)}</p></div><span>颜色 + 文字码</span></header>
      <div class="silk-marker-grid">
        ${item.markers.map((marker) => {
          const queued = marker.current && !board
            ? state.silkCompleted
              ? state.silkClaimed ? "1 项" : "0 项"
              : state.silkClaimed ? "2 项" : marker.queued
            : marker.queued;
          return `<div class="silk-marker-key tone-${esc(marker.tone)} ${marker.current ? "is-current" : ""}"><i aria-hidden="true"></i><span><strong>${esc(marker.code)} 号机${marker.current ? " · 我" : ""}</strong><small>${esc(marker.machine)} · ${esc(marker.color)}</small></span><b>${esc(queued)}</b></div>`;
        }).join("")}
      </div>
    </section>
  `;
}

function renderSilkTaskPool(item, board) {
  const claimed = board ? item.boardClaimed : state.silkClaimed;
  const availableTasks = item.tasks.filter((row) => board || !state.silkCompleted || row.id !== "customer-a");
  return `
    <section class="content-section silk-task-pool">
      <header><h3>${esc(item.title)}</h3><span>${availableTasks.length}</span></header>
      <div>
        ${availableTasks.map((row) => {
          const marker = row.claimId && claimed ? row.claimedMarker : row.marker;
          const target = row.claimId && claimed ? "my-plan" : row.target;
          return `<button class="silk-task-row ${row.selected ? "selected" : ""}" type="button" ${navigationAttributes({ target }, "open-list-item")} ${board ? "tabindex=\"-1\"" : ""}>
            ${renderTaskRowCopy(row)}
            ${marker
              ? `<em class="silk-owner-badge tone-${esc(marker.tone)}"><i aria-hidden="true"></i><b>${esc(marker.code)}</b><small>${esc(marker.label)}</small></em>`
              : `<em class="silk-task-unmarked">未标记</em>`}
          </button>`;
        }).join("")}
      </div>
    </section>
  `;
}

function renderSilkMarkerConfirm(item) {
  const marker = item.marker;
  return `
    <section class="silk-marker-confirm tone-${esc(marker.tone)}">
      <header><h3>${esc(item.title)}</h3><span><i aria-hidden="true"></i>${esc(marker.color)}</span></header>
      <div><strong>${esc(marker.code)}</strong><p>${esc(marker.machine)} · 当前登录账号</p></div>
      <dl><div><dt>排在前面</dt><dd>${esc(item.before)}</dd></div><div><dt>排在后面</dt><dd>${esc(item.after)}</dd></div></dl>
    </section>
  `;
}

function renderSilkMyPlan(item, board) {
  const availableItems = item.items.filter((row) => (board || !row.claimed || state.silkClaimed) && (board || !state.silkCompleted || row.id !== "customer-a"));
  const orderedItems = board
    ? availableItems
    : [...availableItems].sort((a, b) => state.silkPlanOrder.indexOf(a.id) - state.silkPlanOrder.indexOf(b.id));
  return `
    <section class="silk-my-plan">
      <header><div><h3>${esc(item.title)}</h3><p>${esc(item.marker.machine)} · ${esc(item.marker.color)} · 只排我的任务</p></div><span>${orderedItems.length} 项</span></header>
      <div class="silk-plan-list">
        ${orderedItems.length ? orderedItems.map((row, index) => {
          const code = `${item.marker.code}-${String(index + 1).padStart(2, "0")}`;
          return `<article class="silk-plan-row tone-${esc(item.marker.tone)}">
            <div><span class="silk-plan-code"><i aria-hidden="true"></i><b>${esc(code)}</b></span>${renderTaskRowCopy(row)}</div>
            <footer>
              <button type="button" data-screen="${esc(row.target)}" ${board ? "tabindex=\"-1\"" : ""}>打开任务</button>
              <button type="button" data-action="move-silk-task" data-task-id="${esc(row.id)}" data-direction="up" ${index === 0 ? "disabled" : ""} ${board ? "tabindex=\"-1\"" : ""}>上移</button>
              <button type="button" data-action="move-silk-task" data-task-id="${esc(row.id)}" data-direction="down" ${index === orderedItems.length - 1 ? "disabled" : ""} ${board ? "tabindex=\"-1\"" : ""}>下移</button>
            </footer>
          </article>`;
        }).join("") : `<p class="silk-plan-empty">我这里暂时没有待印任务，可返回共享任务池继续选择。</p>`}
      </div>
    </section>
  `;
}

function renderSilkArtworkCanvas(item, expanded = false) {
  return `
    <span class="silk-artwork-canvas tone-bag-${esc(item.bagTone)} tone-print-${esc(item.printTone)} ${expanded ? "is-expanded" : ""}" aria-hidden="true">
      <span class="silk-artwork-sheet">
        <span class="silk-artwork-centerline"></span>
        <span class="silk-artwork-mark"><b>客户图案</b><small>${esc(item.printMethod)}</small></span>
      </span>
    </span>
  `;
}

function renderSilkArtworkButton(item, board) {
  const artwork = item.artwork || {};
  const accessibleName = `放大查看印刷稿件，${artwork.fileName || "稿件"}，${artwork.version || ""}，${artwork.reviewStatus || ""}`;
  return `
    <figure class="silk-artwork-preview">
      <button class="silk-artwork-thumb" type="button" data-action="open-artwork" aria-label="${esc(accessibleName)}" ${board ? "tabindex=\"-1\"" : ""}>${renderSilkArtworkCanvas(item)}</button>
      <figcaption class="silk-artwork-caption">
        <span><strong>印刷稿件</strong><small>${esc(artwork.previewLabel || "稿件缩略图")} · ${esc(artwork.fileName)} · ${esc(artwork.version)} · ${esc(artwork.reviewStatus)}</small></span>
        <em>点击缩略图放大</em>
      </figcaption>
    </figure>
  `;
}

function renderSilkProductionBrief(item, board) {
  return `
    <section class="content-section silk-production-brief">
      <header><div><h3>生产要求</h3><p>试印前核对这 5 项</p></div><em class="status success">稿件已复核</em></header>
      <div class="silk-production-main">
        <div class="silk-production-size"><span>尺寸</span><strong>${esc(item.size)}</strong></div>
        <div class="silk-production-quantity"><span>计划数量</span><strong>${esc(item.quantity)}<small>${esc(item.unit)}</small></strong></div>
        <div class="silk-production-color"><span>袋子颜色</span><strong><i class="silk-color-swatch tone-bag-${esc(item.bagTone)}" aria-hidden="true"></i>${esc(item.bagColor)}</strong></div>
        <div class="silk-production-color"><span>印刷颜色</span><strong><i class="silk-color-swatch tone-print-${esc(item.printTone)}" aria-hidden="true"></i>${esc(item.printColor)}</strong></div>
        <div class="silk-production-method"><span>印刷方式</span><strong>${esc(item.printMethod)}</strong></div>
      </div>
      ${renderSilkArtworkButton(item, board)}
      <details class="silk-secondary-details">
        <summary>订单与机台信息</summary>
        <dl>${(item.secondary || []).map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl>
      </details>
    </section>
  `;
}

function renderSilkTaskStrip(item, board) {
  const snapshot = getSilkReportSnapshot(board);
  const result = item.reportResult === "daily"
    ? `本次 ${formatCount(snapshot.estimatedQualified)} 个 · 累计 ${formatCount(snapshot.cumulativeQualified)} 个`
    : item.reportResult === "complete"
      ? `累计合格 ${formatCount(snapshot.cumulativeQualified)} 个 / 计划 ${formatCount(SILK_PLAN_QUANTITY)} 个`
      : item.result;
  return `
    <section class="silk-task-strip">
      <div class="silk-task-strip-code"><b>${esc(item.taskCode)}</b><span>当前任务</span></div>
      <div class="silk-task-strip-copy"><strong>${esc(item.size)} · ${esc(item.bagColor)}袋</strong><span>${esc(item.printColor)} · ${esc(item.printMethod)} · 计划 ${esc(item.quantity)} ${esc(item.unit)}</span>${result ? `<em>${esc(result)}</em>` : ""}</div>
      ${item.artworkAction ? `<button type="button" data-action="open-artwork" aria-label="放大查看${esc(item.artwork?.version || "当前")}印刷稿件" ${board ? "tabindex=\"-1\"" : ""}>${icon("image")}<span>看稿件</span></button>` : ""}
    </section>
  `;
}

function silkReportFormulaText(snapshot) {
  const { draft } = snapshot;
  if (draft.machineActions === "" || draft.estimatedQualified === "") return "填完前两项后自动计算";
  if (snapshot.machineActions === null || snapshot.estimatedQualified === null) return "请输入 0 或正整数";
  if (snapshot.machineActions < snapshot.estimatedQualified) return "预计合格数量不能大于机器动作数";
  if (snapshot.wasteOverridden) {
    const reported = snapshot.reportedWaste === null ? "待填写" : formatCount(snapshot.reportedWaste);
    return `已手动修改：系统计算 ${formatCount(snapshot.calculatedWaste)}，当前填报 ${reported}`;
  }
  return `自动计算：${formatCount(snapshot.machineActions)} − ${formatCount(snapshot.estimatedQualified)} = ${formatCount(snapshot.calculatedWaste)}`;
}

function renderSilkReportNumberField({ id, name, label, helper, value, suffix, board, wide = false, describedBy = "" }) {
  return `
    <label class="silk-report-field ${wide ? "is-wide" : ""}" for="${id}">
      <span>${esc(label)}</span>
      <span class="input-with-suffix">
        <input id="${id}" type="number" inputmode="numeric" min="0" step="1" autocomplete="off" value="${esc(value ?? "")}" data-silk-report-field="${esc(name)}" ${describedBy ? `aria-describedby="${esc(describedBy)}"` : ""} ${board ? "disabled" : ""} />
        <b>${esc(suffix)}</b>
      </span>
      <small data-silk-report-help data-default="${esc(helper)}">${esc(helper)}</small>
    </label>
  `;
}

function renderSilkReportForm(_item, board) {
  const snapshot = getSilkReportSnapshot(board);
  const machineId = `field-${++fieldSerial}`;
  const qualifiedId = `field-${++fieldSerial}`;
  const wasteId = `field-${++fieldSerial}`;
  const noteId = `field-${++fieldSerial}`;
  const formulaId = `silk-report-formula-${fieldSerial}`;
  const modeClass = snapshot.wasteOverridden ? "warning" : "info";
  const modeLabel = snapshot.wasteOverridden ? "已手动修改" : "自动计算";
  const formulaError = snapshot.draft.machineActions !== "" && snapshot.draft.estimatedQualified !== "" && !snapshot.formulaReady;
  return `
    <section class="content-section silk-report-form" data-report-mode="${snapshot.wasteOverridden ? "manual" : "auto"}">
      <header>
        <div><h3>本次报数</h3><p>填前两项，异常数自动算</p></div>
        <em class="status ${modeClass}" data-silk-report-mode>${modeLabel}</em>
      </header>
      <div class="silk-report-primary-fields">
        ${renderSilkReportNumberField({ id: machineId, name: "machineActions", label: "机器动作数", helper: "设备计数器总数", value: snapshot.draft.machineActions, suffix: "次", board })}
        ${renderSilkReportNumberField({ id: qualifiedId, name: "estimatedQualified", label: "预计合格数量", helper: "检查合格的数量", value: snapshot.draft.estimatedQualified, suffix: "个", board })}
      </div>
      <div class="silk-report-calculation">
        ${renderSilkReportNumberField({ id: wasteId, name: "reportedWaste", label: "预计异常 / 废品数量", helper: "可直接修改", value: snapshot.reportedWaste, suffix: "个", board, wide: true, describedBy: formulaId })}
        <p id="${formulaId}" class="silk-report-formula ${formulaError ? "is-error" : ""}" data-silk-report-formula role="status" aria-live="polite">${esc(silkReportFormulaText(snapshot))}</p>
        <button type="button" data-action="restore-silk-report-auto" data-silk-report-restore ${snapshot.wasteOverridden ? "" : "hidden"} ${board ? "disabled" : ""}>恢复自动计算</button>
      </div>
      <label class="silk-report-note" for="${noteId}">
        <span>生产备注 <small>有情况再填</small></span>
        <textarea id="${noteId}" data-silk-report-field="note" placeholder="例如：前 60 个位置偏右，停机校正后继续" ${board ? "disabled" : ""}>${esc(snapshot.draft.note)}</textarea>
        <small class="silk-report-note-help">数量差异、试印调整或中途停机原因写在这里，随本任务记录保存。</small>
      </label>
    </section>
  `;
}

function renderSilkReportSummary(item, board) {
  const snapshot = getSilkReportSnapshot(board);
  const wasteValue = `${formatCount(snapshot.reportedWaste)} 个 · ${snapshot.wasteOverridden ? "手动修改" : "自动计算"}`;
  const commonItems = [
    [item.mode === "daily" ? "今天做出合格品" : "预计合格", `${formatCount(snapshot.estimatedQualified)} 个`],
    ["预计异常 / 废品", wasteValue],
    ["机器动作", `${formatCount(snapshot.machineActions)} 次`],
    [item.mode === "daily" ? "距离计划" : "较计划", item.mode === "daily" ? silkPlanRemainingLabel(snapshot) : silkPlanDifferenceLabel(snapshot)],
  ];
  if (snapshot.submittedQualified > 0 || item.mode === "complete") commonItems.push(["整批累计合格", `${formatCount(snapshot.cumulativeQualified)} / ${formatCount(SILK_PLAN_QUANTITY)} 个`]);
  if (snapshot.wasteOverridden) commonItems.push(["系统计算", `${formatCount(snapshot.calculatedWaste)} 个`]);
  if (snapshot.draft.note.trim()) commonItems.push(["生产备注", snapshot.draft.note.trim()]);
  if (item.mode === "complete") commonItems.push(["试印照片", "1 张 · 已关联"], ["任务追溯", "PRINT-TASK-260720-03"]);
  return renderFacts({ title: item.mode === "daily" ? "今天做到这里" : "完成记录", items: commonItems });
}

function renderBagTaskBrief(_item, board) {
  const submittedQualified = board ? 0 : state.bagSubmittedReports.reduce((sum, report) => sum + report.estimatedQualified, 0);
  const completed = BAG_BASE_QUALIFIED + submittedQualified;
  return renderFacts({
    items: [
      ["客户", crossDeviceOrders.urgentProduction.customer],
      ["货品 / 类型", `${crossDeviceOrders.urgentProduction.product} · ${crossDeviceOrders.urgentProduction.businessType} · 加急`],
      ["机台 / 顺序", `${crossDeviceOrders.urgentProduction.machine} · 今日第 1 单`],
      ["规格 / 印刷", `${crossDeviceOrders.urgentProduction.specification} · ${crossDeviceOrders.urgentProduction.colorCombination}`],
      ["袋身", crossDeviceOrders.urgentProduction.bagColor],
      ["印刷", `${crossDeviceOrders.urgentProduction.printColor} · ${crossDeviceOrders.urgentProduction.printSide}`],
      ["订单计划", `${formatCount(BAG_PLAN_QUANTITY)} 个`],
      ["此前累计", `${formatCount(completed)} 个`],
      ["还需合格", `${formatCount(Math.max(0, BAG_PLAN_QUANTITY - completed))} 个`],
    ],
  });
}

function bagReportFormulaText(snapshot) {
  const { draft } = snapshot;
  if (draft.machineActions === "" || draft.estimatedQualified === "") return "填完前两项后自动计算";
  if (snapshot.machineActions === null || snapshot.estimatedQualified === null) return "请输入 0 或正整数";
  if (snapshot.machineActions < snapshot.estimatedQualified) return "预计合格数量不能大于机器动作数";
  if (snapshot.wasteOverridden) {
    const reported = snapshot.reportedWaste === null ? "待填写" : formatCount(snapshot.reportedWaste);
    return `已手动修改：系统计算 ${formatCount(snapshot.calculatedWaste)}，当前填报 ${reported}`;
  }
  return `自动计算：${formatCount(snapshot.machineActions)} − ${formatCount(snapshot.estimatedQualified)} = ${formatCount(snapshot.calculatedWaste)}`;
}

function renderBagReportNumberField({ id, name, label, helper, value, wide = false, describedBy = "", board }) {
  return `
    <label class="silk-report-field ${wide ? "is-wide" : ""}" for="${id}">
      <span>${esc(label)}</span>
      <span class="input-with-suffix">
        <input id="${id}" type="number" inputmode="numeric" min="0" step="1" autocomplete="off" value="${esc(value ?? "")}" data-bag-report-field="${esc(name)}" ${describedBy ? `aria-describedby="${esc(describedBy)}"` : ""} ${board ? "disabled" : ""} />
        <b>${name === "machineActions" ? "次" : "个"}</b>
      </span>
      <small data-bag-report-help data-default="${esc(helper)}">${esc(helper)}</small>
    </label>
  `;
}

function renderBagReportForm(_item, board) {
  const snapshot = getBagReportSnapshot(board);
  const machineId = `field-${++fieldSerial}`;
  const qualifiedId = `field-${++fieldSerial}`;
  const wasteId = `field-${++fieldSerial}`;
  const noteId = `field-${++fieldSerial}`;
  const formulaId = `bag-report-formula-${fieldSerial}`;
  const formulaError = snapshot.draft.machineActions !== "" && snapshot.draft.estimatedQualified !== "" && !snapshot.formulaReady;
  return `
    <section class="content-section silk-report-form" data-bag-report-form data-report-mode="${snapshot.wasteOverridden ? "manual" : "auto"}">
      <header><div><h3>本次报数</h3><p>填前两项，异常数自动算</p></div><em class="status ${snapshot.wasteOverridden ? "warning" : "info"}" data-bag-report-mode>${snapshot.wasteOverridden ? "已手动修改" : "自动计算"}</em></header>
      <div class="silk-report-primary-fields">
        ${renderBagReportNumberField({ id: machineId, name: "machineActions", label: "机器动作数", helper: "设备计数器总数", value: snapshot.draft.machineActions, board })}
        ${renderBagReportNumberField({ id: qualifiedId, name: "estimatedQualified", label: "预计合格数量", helper: "检查合格的数量", value: snapshot.draft.estimatedQualified, board })}
      </div>
      <div class="silk-report-calculation">
        ${renderBagReportNumberField({ id: wasteId, name: "reportedWaste", label: "预计异常 / 废品数量", helper: "自动计算后仍可手动修改", value: snapshot.reportedWaste, wide: true, describedBy: formulaId, board })}
        <p id="${formulaId}" class="silk-report-formula ${formulaError ? "is-error" : ""}" data-bag-report-formula role="status" aria-live="polite">${esc(bagReportFormulaText(snapshot))}</p>
        <button type="button" data-action="restore-bag-report-auto" data-bag-report-restore ${snapshot.wasteOverridden ? "" : "hidden"} ${board ? "disabled" : ""}>恢复自动计算</button>
      </div>
      <label class="silk-report-note" for="${noteId}"><span>生产备注 <small>有情况再填</small></span><textarea id="${noteId}" data-bag-report-field="note" placeholder="例如：调机损耗、停机原因" ${board ? "disabled" : ""}>${esc(snapshot.draft.note)}</textarea><small class="silk-report-note-help">数量差异、调机或中途停机原因随本次报数保存。</small></label>
    </section>
  `;
}

function renderBagReportSummary(item, board) {
  const snapshot = getBagReportSnapshot(board);
  const previous = BAG_BASE_QUALIFIED + snapshot.submittedQualified;
  const difference = BAG_PLAN_QUANTITY - snapshot.cumulativeQualified;
  const differenceLabel = difference === 0 ? "与计划一致" : difference > 0 ? `还差 ${formatCount(difference)} 个` : `超出 ${formatCount(Math.abs(difference))} 个`;
  const items = [
    ["客户", crossDeviceOrders.urgentProduction.customer],
    ["货品 / 类型", `${crossDeviceOrders.urgentProduction.product} · ${crossDeviceOrders.urgentProduction.businessType} · 加急`],
    ["规格 / 印刷", `${crossDeviceOrders.urgentProduction.specification} · ${crossDeviceOrders.urgentProduction.colorCombination}`],
    ["此前累计", `${formatCount(previous)} 个`],
    ["本次预计合格", `${formatCount(snapshot.estimatedQualified)} 个`],
    ["整批累计 / 计划", `${formatCount(snapshot.cumulativeQualified)} / ${formatCount(BAG_PLAN_QUANTITY)} 个 · ${differenceLabel}`],
    ["机器动作", `${formatCount(snapshot.machineActions)} 次`],
    ["预计异常 / 废品", `${formatCount(snapshot.reportedWaste)} 个 · ${snapshot.wasteOverridden ? "手动修改" : "自动计算"}`],
  ];
  if (snapshot.wasteOverridden) items.push(["系统计算", `${formatCount(snapshot.calculatedWaste)} 个`]);
  if (snapshot.draft.note.trim()) items.push(["生产备注", snapshot.draft.note.trim()]);
  if (item.mode === "complete") items.push(["成品图", "1 张 · 已保存"], ["任务 / 机台", `${crossDeviceOrders.urgentProduction.id} · ${crossDeviceOrders.urgentProduction.machine}`]);
  return renderFacts({ title: item.mode === "daily" ? "今天做到这里" : "整批完成记录", items });
}

function renderSilkDailySaved(_item, board) {
  if (board || !state.silkDailySaved) return "";
  const saved = state.silkDailySaved;
  return renderAlert({
    title: "今天进度已保存",
    text: `本次合格 ${formatCount(saved.estimatedQualified)} 个，整批累计 ${formatCount(saved.cumulativeQualified)} 个，还差 ${formatCount(Math.max(0, SILK_PLAN_QUANTITY - saved.cumulativeQualified))} 个。任务仍在 ${crossDeviceOrders.printProduction.machineCode}。`,
    tone: "info",
  });
}

function renderSilkPauseReceipt(_item, board) {
  if (board || !state.silkPaused) return "";
  return renderAlert({
    title: "任务已暂停，办公室处理中",
    text: `任务仍留在 ${crossDeviceOrders.printProduction.machineCode}，暂时不能继续报数或完工；处理结果会回到当前任务。`,
    tone: "warning",
  });
}

function renderSilkCompleteReceipt(_item, board) {
  if (board || !state.silkCompleted || !state.silkCompletedReceipt) return "";
  const saved = state.silkCompletedReceipt;
  const difference = SILK_PLAN_QUANTITY - saved.cumulativeQualified;
  const differenceLabel = difference === 0 ? "与计划一致" : difference > 0 ? `较计划少 ${formatCount(difference)} 个` : `较计划多 ${formatCount(Math.abs(difference))} 个`;
  return renderAlert({
    title: "3-01 已完成并交给制袋",
    text: `累计合格 ${formatCount(saved.cumulativeQualified)} 个，${differenceLabel}。完整分段报数记录已保存，办公室可在后台查看。`,
    tone: "success",
  });
}

function renderSilkCompleteConfirmation(_item, board) {
  const snapshot = getSilkReportSnapshot(board);
  const wasteMode = snapshot.wasteOverridden ? "手动修改" : "自动计算";
  const difference = silkPlanDifferenceLabel(snapshot);
  const accessibleSummary = `订单计划 ${formatCount(SILK_PLAN_QUANTITY)} 个，累计交给制袋 ${formatCount(snapshot.cumulativeQualified)} 个，${difference}，累计异常或废品 ${formatCount(snapshot.cumulativeWaste)} 个，累计机器动作 ${formatCount(snapshot.cumulativeMachineActions)} 次`;
  return `
    ${renderAlert({
      title: "确认后，这批丝印结束",
      text: `整批累计 ${formatCount(snapshot.cumulativeQualified)} 个合格品交给制袋；${difference}，由办公室继续处理。还需要继续印，请点“还没印完”。`,
      tone: "warning",
    })}
    <section class="content-section silk-complete-confirmation" aria-label="${esc(accessibleSummary)}">
      <header><div><h3>最后核对数量</h3><p>确认交给制袋的实际数量</p></div></header>
      <div class="silk-complete-quantity" aria-hidden="true">
        <div><span>订单计划</span><strong>${formatCount(SILK_PLAN_QUANTITY)}<small>个</small></strong></div>
        <b>${icon("arrow-right")}</b>
        <div><span>累计交给制袋</span><strong>${formatCount(snapshot.cumulativeQualified)}<small>个</small></strong></div>
      </div>
      <div class="silk-complete-difference">
        <span>数量差异</span>
        <strong>${esc(difference)}</strong>
        <small>办公室继续处理</small>
      </div>
      <dl class="silk-complete-evidence">
        <div><dt>本次异常 / 废品</dt><dd>${formatCount(snapshot.reportedWaste)} 个 · ${esc(wasteMode)}</dd></div>
        <div><dt>整批累计异常 / 废品</dt><dd>${formatCount(snapshot.cumulativeWaste)} 个</dd></div>
        <div><dt>整批累计机器动作</dt><dd>${formatCount(snapshot.cumulativeMachineActions)} 次 · 仅作记录</dd></div>
        ${snapshot.draft.note.trim() ? `<div><dt>生产备注</dt><dd>${esc(snapshot.draft.note.trim())}</dd></div>` : ""}
        <div><dt>试印照片</dt><dd>1 张 · 已关联</dd></div>
      </dl>
    </section>
  `;
}

function renderForm(item, board) {
  return `<section class="content-section form-section"><header><h3>${esc(item.title)}</h3></header><div class="form-grid">${item.fields.map((input) => renderField(input, board)).join("")}</div></section>`;
}

function renderField(input, board) {
  const id = `field-${++fieldSerial}`;
  const disabled = board ? "disabled" : "";
  const required = input.required ? `required aria-required="true" data-field-required="true"` : "";
  const value = input.decisionId && !board ? state.decisionChoices[input.decisionId] || input.value : input.value;
  const decisionBinding = input.decisionId ? `data-decision-id="${esc(input.decisionId)}"` : "";
  if (input.type === "textarea") {
    return `<label class="field field-wide" for="${id}"><span>${esc(input.label)}</span><textarea id="${id}" ${required} ${decisionBinding} ${disabled}>${esc(value)}</textarea><small aria-hidden="true">&nbsp;</small></label>`;
  }
  if (input.type === "select") {
    return `<label class="field" for="${id}"><span>${esc(input.label)}</span><select id="${id}" ${required} ${decisionBinding} ${disabled}>${(input.options || [value]).map((option) => `<option ${option === value ? "selected" : ""}>${esc(option)}</option>`).join("")}</select><small aria-hidden="true">&nbsp;</small></label>`;
  }
  return `<label class="field" for="${id}"><span>${esc(input.label)}</span><span class="input-with-suffix"><input id="${id}" type="${esc(input.type || "text")}" value="${esc(value)}" ${required} ${decisionBinding} ${disabled}/>${input.suffix ? `<b>${esc(input.suffix)}</b>` : ""}</span><small aria-hidden="true">&nbsp;</small></label>`;
}

function renderChecklist(item, board, screen, blockIndex, flow) {
  const checklistKey = blockStateKey("check", flow, screen, blockIndex);
  const listRequired = checklistRequiresGate(item, screen);
  const rows = item.items.map((entry, index) => {
    const details = checklistEntry(entry);
    if (isReadOnlyChecklist(item)) return `<div class="check-row is-read-only"><span aria-hidden="true">${index + 1}</span><strong>${esc(details.text)}</strong></div>`;
    const key = `${checklistKey}:${index}`;
    const checked = !board && Boolean(state.checklistStatus[key]);
    const required = listRequired || details.required;
    return `<button type="button" class="check-row ${checked ? "checked" : ""}" data-check-key="${esc(key)}" data-check-required="${required ? "true" : "false"}" aria-pressed="${checked ? "true" : "false"}" ${board ? "tabindex=\"-1\"" : ""}><span>${icon("check-circle")}</span><strong>${esc(details.text)}</strong></button>`;
  }).join("");
  return `<section class="content-section checklist-section"><header><h3>${esc(item.title)}</h3></header><div>${rows}</div></section>`;
}

function renderTimeline(item) {
  return `<section class="content-section timeline-section"><header><h3>${esc(item.title)}</h3></header><ol>${item.items.map((text, index) => `<li><span>${index + 1}</span><p>${esc(text)}</p></li>`).join("")}</ol></section>`;
}

function renderEvidence(item, board, screen, blockIndex, flow) {
  const key = blockStateKey("evidence", flow, screen, blockIndex);
  const capture = isCaptureEvidence(item);
  const status = item.previewState || (board ? "idle" : state.evidenceStatus[key] || "idle");
  const required = evidenceRequiresGate(item);
  let text = item.text;
  let action = capture ? "evidence-capture" : "view-evidence";
  let actionLabel = item.actionLabel;
  let statusLabel = required && status === "idle" ? "必需" : "";
  let tone = required ? "warning" : "info";

  if (capture && status === "saved") {
    text = "已保存到当前任务；重拍会保留替换记录。";
    action = "evidence-retake";
    actionLabel = "重拍";
    statusLabel = "已保存";
    tone = "success";
  } else if (capture && status === "failed") {
    text = "上传失败，照片仍保留在本机；请重新上传。";
    action = "evidence-retry";
    actionLabel = "重新上传";
    statusLabel = "保存失败";
    tone = "danger";
  }

  return `<section class="evidence-block is-${esc(status)}" data-evidence-key="${esc(key)}"><span class="evidence-icon">${icon(status === "saved" ? "check-circle" : item.icon || "image")}</span><div><strong>${esc(item.title)}${statusLabel ? ` · <em class="status ${tone}">${esc(statusLabel)}</em>` : ""}</strong><p>${esc(text)}</p></div>${actionLabel ? `<button type="button" data-action="${esc(action)}" data-evidence-key="${esc(key)}" data-evidence-fail-once="${item.demoFailure || /水印照片/.test(item.title || "") ? "true" : "false"}" ${board ? "tabindex=\"-1\"" : ""}>${esc(actionLabel)}</button>` : ""}</section>`;
}

function renderDeliveryNote(item, board) {
  return `<section class="content-section delivery-note-section"><header><div><h3>${esc(item.title)}</h3><span>${esc(item.meta)}</span></div><button type="button" data-action="open-source" ${board ? "tabindex=\"-1\"" : ""}>放大查看</button></header><button class="delivery-note-image" type="button" data-action="open-source" ${board ? "tabindex=\"-1\"" : ""}><img src="${esc(item.image)}" alt="原材料送货单演示原图" width="1536" height="864" /></button></section>`;
}

function numericRollValue(value) {
  const match = String(value ?? "").replace(",", ".").match(/\d+(?:\.\d+)?/);
  return match ? match[0] : "";
}

function editableRollValues(roll, { useReviewDraft = false } = {}) {
  const sourceSpec = String(useReviewDraft && roll.reviewDraftSpec ? roll.reviewDraftSpec : roll.spec || "").trim();
  const rawSpec = isStripRoll(roll) && !/\d/.test(sourceSpec)
    ? String(roll.reviewDraftSpec || "78克*5宽").trim()
    : sourceSpec;
  return {
    color: String(roll.color || "").trim(),
    spec: /没看清|不清楚/.test(rawSpec) ? "" : formatRawMaterialSpec(rawSpec),
    weight: numericRollValue(roll.weight),
  };
}

function isStripRoll(roll = {}) {
  return roll.materialCategory === "提手条" || /(?:提手条|把条|布条|条料|条类|条)\s*$/u.test(String(roll.rawSpec || roll.spec || "").trim());
}

function rollSpecSummary(roll = {}) {
  const rawSpec = String(roll.spec || "").trim();
  if (isStripRoll(roll) && !/\d/.test(rawSpec)) return "78克 · 5cm宽";
  return formatRawMaterialSpec(rawSpec);
}

function rollReviewBlockers(values) {
  const blockers = [];
  const spec = String(values.spec || "").trim();
  const weight = Number(values.weight);
  if (!String(values.color || "").trim()) blockers.push("颜色");
  if (!spec || !/\d/.test(spec) || /没看清|不清楚/.test(spec)) blockers.push("规格 / 宽幅");
  if (!Number.isFinite(weight) || weight <= 0) blockers.push("重量");
  return blockers;
}

function currentExpandedReviewRoll(screen = getScreen(getFlow(state.flowId), state.screenId)) {
  const rollsBlock = screen?.blocks?.find((item) => item.type === "rolls");
  const rollIndex = state.selectedRollIndex || rollsBlock?.expandedRollIndex;
  return state.rawDraft.rolls.find((roll) => roll.index === rollIndex) || null;
}

function renderExpandedRollEditor(roll, board) {
  const values = editableRollValues(roll, { useReviewDraft: true });
  const blockers = rollReviewBlockers(values);
  const blockerId = `roll-editor-blocker-${roll.index}`;
  const boardInputAttrs = board ? 'readonly tabindex="-1"' : "";
  const field = (key, label, value, options = {}) => {
    const blockerLabel = { color: "颜色", spec: "规格 / 宽幅", weight: "重量" }[key];
    return `
    <label>
      <span>${esc(label)}</span>
      <input
        data-roll-edit-field="${esc(key)}"
        ${options.inputMode ? `inputmode="${esc(options.inputMode)}"` : ""}
        ${options.placeholder ? `placeholder="${esc(options.placeholder)}"` : ""}
        ${blockers.includes(blockerLabel) ? `aria-invalid="true" aria-describedby="${blockerId}"` : ""}
        value="${esc(value)}"
        ${boardInputAttrs}
      />
    </label>
  `;
  };
  return `
    <section id="roll-editor-${roll.index}" class="roll-inline-editor" aria-label="第 ${roll.index} 卷编辑" tabindex="-1">
      ${isStripRoll(roll) ? `<div class="roll-classification"><span>系统归类</span><strong>提手条 · 固定 78克 / 5cm宽</strong><small>依据：${esc(roll.classificationBasis || "厂家文字含“条”")}</small></div>` : ""}
      <div class="roll-editor-key-fields">
        ${field("color", "颜色", values.color)}
        ${field("spec", "规格 / 宽幅", values.spec, { placeholder: isStripRoll(roll) ? "78克*5宽；有米数时再追加" : "例如：78克*76宽*1500米" })}
        ${field("weight", "重量 kg", values.weight, { inputMode: "decimal" })}
      </div>
      <p class="roll-editor-blocker" id="${blockerId}" role="alert" ${blockers.length ? "" : "hidden"}>${blockers.length ? `还需填写：${esc(blockers.join("、"))}` : "资料已补齐，可以确认这一卷"}</p>
      <details class="roll-editor-more">
        <summary ${board ? 'tabindex="-1"' : ""}><span>其他字段与 OCR 原文</span><em>展开</em></summary>
        <dl>
          <div><dt>品名</dt><dd>${isStripRoll(roll) ? "提手条" : "无纺布卷料"}</dd></div>
          <div><dt>材料</dt><dd>${isStripRoll(roll) ? "提手" : "无纺布"}</dd></div>
          <div><dt>单位</dt><dd>kg</dd></div>
          <div><dt>OCR 原文</dt><dd>${esc(roll.ocrSource || `${roll.color} | ${roll.rawSpec || roll.spec} | ${roll.weight}`)}</dd></div>
        </dl>
      </details>
      <div class="roll-editor-actions">
        <button type="button" data-action="collapse-roll-editor" ${board ? 'tabindex="-1"' : ""}>收起</button>
        <button class="primary" type="button" data-action="confirm-expanded-roll" ${blockers.length ? "disabled aria-disabled=\"true\"" : ""} ${board ? 'tabindex="-1"' : ""}>${icon("check-circle")}这卷正确</button>
      </div>
    </section>
  `;
}

function renderRolls(item, board) {
  const confirmedRollIndices = new Set(item.confirmedRollIndices || []);
  const rolls = board
    ? item.items.map((roll) => {
      const confirmed = confirmedRollIndices.has(roll.index);
      return {
        ...roll,
        confirmed,
        status: confirmed ? "已确认" : "待确认",
        tone: confirmed ? "success" : "warning",
      };
    })
    : state.rawDraft.rolls;
  const stats = { confirmed: rolls.filter((roll) => roll.confirmed).length, total: rolls.length };
  const expandedRollIndex = item.expandedRollIndex
    ? board ? item.expandedRollIndex : state.selectedRollIndex || item.expandedRollIndex
    : null;
  return `<section class="roll-ledger"><header><h3>${esc(item.title)}</h3><span>已确认 ${stats.confirmed}/${stats.total}</span></header>${rolls.map((roll) => {
    const expanded = roll.index === expandedRollIndex;
    const reviewValues = editableRollValues(roll, { useReviewDraft: expanded });
    const compactSpec = expanded && reviewValues.spec
      ? rollSpecSummary({ ...roll, spec: reviewValues.spec })
      : rollSpecSummary(roll);
    const blockers = rollReviewBlockers(reviewValues);
    const compactStatus = roll.confirmed
      ? "已确认"
      : blockers.length === 1 && blockers[0] === "规格 / 宽幅"
        ? "缺规格"
        : blockers.length ? `缺 ${blockers.length} 项` : "待确认";
    const actionLabel = expanded ? "收起" : roll.confirmed ? "修改" : blockers.length ? "补全" : "核对";
    const action = expanded ? "collapse-roll-editor" : "edit-roll";
    const tone = roll.confirmed ? "success" : "warning";
    const rowState = `${blockers.length ? "needs-review" : roll.confirmed ? "is-confirmed" : ""} ${expanded ? "is-expanded" : ""}`;
    return `<article class="roll-row ${rowState}" data-roll-index="${roll.index}"><div class="roll-source"><b>${roll.index}</b><img src="./assets/roll-crops/roll-${String(roll.index).padStart(2, "0")}.jpg" alt="原送货单第 ${roll.index} 行" /></div><div class="roll-facts"><i class="color-dot ${roll.color.includes("红") ? "red" : "white"}" aria-hidden="true"></i><strong>${esc(roll.color)}</strong><span>${esc(compactSpec)}</span><b>${esc(roll.weight)}</b><em class="status ${tone}">${esc(compactStatus)}</em><button type="button" aria-expanded="${expanded ? "true" : "false"}" ${expanded ? `aria-controls="roll-editor-${roll.index}"` : ""} data-action="${action}" data-roll-index="${roll.index}" ${board ? "tabindex=\"-1\"" : ""}>${esc(actionLabel)}</button></div>${expanded ? renderExpandedRollEditor(roll, board) : ""}</article>`;
  }).join("")}</section>`;
}

function getAttachRollStatus(roll, board, boardVariant) {
  if (board) {
    if (boardVariant === "mismatch") return roll.index === 7 ? "mismatch" : "confirmed";
    if (boardVariant === "complete-dialog") return "confirmed";
    if (roll.index === 1) return "pending";
    return "confirmed";
  }
  const rollId = roll.rollId || `RM-260704-${String(roll.index).padStart(2, "0")}`;
  return state.attachRollStatus[`${state.rawDraft.draftId}:${rollId}`] || "pending";
}

function getAttachStats(board = false, boardVariant) {
  const rolls = board ? rawMaterialRolls : state.rawDraft.rolls;
  const statuses = rolls.map((roll) => getAttachRollStatus(roll, board, boardVariant));
  const confirmed = statuses.filter((status) => status === "confirmed").length;
  const mismatch = statuses.filter((status) => status === "mismatch").length;
  const processed = confirmed + mismatch;
  return { total: statuses.length, confirmed, mismatch, pending: statuses.length - processed, processed };
}

function renderAttachRolls(item, board, _screen, _blockIndex, _flow, boardVariant) {
  const stats = getAttachStats(board, boardVariant);
  const rolls = board ? item.items : state.rawDraft.rolls;
  const compact = item.compact === true;
  return `
    <section class="attach-ledger${compact ? " is-compact" : ""}">
      <header>
        <div><h3>${esc(item.title)}${compact ? "（顺序不限）" : ""}</h3>${compact ? "" : "<p>一张卡固定一卷，拿到哪一卷就处理哪张</p>"}</div>
        ${compact ? `<button type="button" class="attach-confirm-all" aria-label="${esc(stats.pending ? `一键确认剩余 ${stats.pending} 卷已贴` : `已确认 ${stats.confirmed} 卷`)}" data-action="confirm-all-attach" ${stats.pending ? "" : "disabled aria-disabled=\"true\""} ${board ? "tabindex=\"-1\"" : ""}>${stats.pending ? "一键确认" : "已确认"} <strong>${stats.confirmed}/${stats.total}</strong></button>` : `<strong>${stats.processed}/${stats.total}</strong>`}
      </header>
      ${compact ? "" : `<div class="attach-ledger-note">${icon("scan-line")}<span>按卷码、颜色、规格或本卷重量找到对应卡片</span>${stats.mismatch ? `<em>${stats.mismatch} 卷异常</em>` : ""}</div>`}
      <div class="attach-roll-list">
        ${rolls.map((roll) => {
          const status = getAttachRollStatus(roll, board, boardVariant);
          const rollId = roll.rollId || `RM-260704-${String(roll.index).padStart(2, "0")}`;
          const statusLabel = status === "confirmed" ? compact ? "已贴" : "已确认" : status === "mismatch" ? compact ? "已隔离" : "信息不符" : compact ? "待贴" : "待贴标";
          const tone = status === "confirmed" ? "success" : status === "mismatch" ? "danger" : "warning";
          const statusBadge = status === "pending" && compact ? "" : `<em class="status ${tone}">${statusLabel}</em>`;
          const actions = status === "pending"
            ? `<div class="attach-roll-actions"><button type="button" class="mismatch" aria-label="${esc(`${rollId} 标签与实物不符`)}" data-action="mark-attach-mismatch" data-roll-index="${roll.index}" ${board ? "tabindex=\"-1\"" : ""}>标签/实物不符</button><button type="button" class="confirm" aria-label="${esc(`确认 ${rollId} 已贴`)}" data-action="confirm-attach-roll" data-roll-index="${roll.index}" ${board ? "tabindex=\"-1\"" : ""}>确认已贴</button></div>`
            : status === "confirmed"
              ? compact ? "" : `<div class="attach-roll-result">${icon("check-circle")}<span>已贴标并核对实物</span></div>`
              : `<div class="attach-roll-result mismatch">${icon("alert-triangle")}<span>${compact ? "标签/实物不符" : "本卷已隔离，不影响其他卷"}</span><button type="button" aria-label="重新核对 ${esc(rollId)}" data-action="reset-attach-roll" data-roll-index="${roll.index}" ${board ? "tabindex=\"-1\"" : ""}>重新核对</button></div>`;
          return `<article class="attach-roll-card is-${status}"><header><b>${String(roll.index).padStart(2, "0")}</b><div><strong>${esc(rollId)}</strong><p><span>${esc(roll.color)}</span><span>${esc(formatRawMaterialSpec(roll.spec))}</span><em>${esc(roll.weight)}</em></p></div>${statusBadge}</header>${actions}</article>`;
        }).join("")}
      </div>
    </section>
  `;
}

function materialRollFacts(rollId) {
  const known = {
    "RM-260704-02": { color: "本白", spec: "78 × 70 × 2000", weight: "109.8 kg", supplier: "腾胜无纺布" },
    "RM-260704-06": { color: "大红", spec: "70 × 78 × 2000", weight: "83.4 kg", supplier: "腾胜无纺布" },
    "RM-260704-08": { color: "大红", spec: "76 × 78 × 1500", weight: "91.9 kg", supplier: "腾胜无纺布" },
    "RM-260704-09": { color: "大红", spec: "76 × 78 × 1500", weight: "92 kg", supplier: "腾胜无纺布" },
  };
  return known[rollId] || null;
}

function renderMaterialIssueSummary(item = {}) {
  const roll = materialRollFacts(state.materialIssue.rollId) || materialRollFacts("RM-260704-08");
  const items = item.mode === "verify" ? [
    ["卷码", state.materialIssue.rollId],
    ["颜色 / 规格", `${roll.color} · ${formatRawMaterialSpec(roll.spec)}`],
    ["重量", roll.weight],
    ["入库来源", "IN-RM-260704-01"],
    ["当前库位", "原料库-可用区"],
    ["状态", "可用库存"],
  ] : [
    ["卷码", state.materialIssue.rollId],
    ["颜色 / 规格", `${roll.color} · ${formatRawMaterialSpec(roll.spec)}`],
    ["重量", roll.weight],
    ["目标", state.materialIssue.destination],
    ["领料人", "当前登录员工"],
  ];
  return renderFacts({ items });
}

function renderRawMaterialCode39(value) {
  const barcode = buildRawMaterialCode39Bars(value);
  if (!barcode.normalizedValue) {
    return `<div class="label-barcode-empty">卷码待生成</div>`;
  }
  const quietZone = 10;
  const barcodeWidth = barcode.width + quietZone * 2;
  return `
    <div class="label-barcode-block">
      <svg class="label-barcode" role="img" aria-label="卷码 ${esc(barcode.normalizedValue)}" preserveAspectRatio="none" viewBox="0 0 ${barcodeWidth} 50">
        ${barcode.bars.map((bar) => `<rect x="${bar.x + quietZone}" y="0" width="${bar.width}" height="50"></rect>`).join("")}
      </svg>
      <b class="label-barcode-text">${esc(barcode.normalizedValue)}</b>
    </div>
  `;
}

function renderLabelPreview(item, _board, _screen, _blockIndex, flow) {
  const dynamicRoll = flow?.id === "material" ? materialRollFacts(state.materialIssue.rollId) : null;
  const view = dynamicRoll ? { ...item, ...dynamicRoll, rollId: state.materialIssue.rollId } : item;
  return `
    <figure class="label-preview">
      <figcaption>卷料标签预览</figcaption>
      <div class="label-paper">
        <header class="label-header"><small>${esc(view.supplier)}</small></header>
        <div class="label-facts">
          <div class="label-weight"><span>本卷重量</span><b>${esc(view.weight)}</b></div>
          <div class="label-material"><strong>${esc(view.color)}</strong><span>${esc(formatRawMaterialSpec(view.spec))}</span></div>
        </div>
        ${renderRawMaterialCode39(view.rollId)}
      </div>
    </figure>
  `;
}

function renderFunctionGrid(item, board) {
  return `<section class="function-grid">${item.items.map(([title, meta, iconName, navigation = {}]) => {
    const target = typeof navigation === "string" ? { target: navigation } : navigation;
    return `<button type="button" ${navigationAttributes(target, "open-function")} ${board ? "tabindex=\"-1\"" : ""}><span>${icon(iconName)}</span><strong>${esc(title)}</strong><small>${esc(meta)}</small></button>`;
  }).join("")}</section>`;
}

function renderPermissionList(item) {
  return `<section class="content-section permission-list"><header><h3>授权范围</h3></header>${item.items.map(([title, value]) => `<div><strong>${esc(title)}</strong><span class="${value.includes("无权限") ? "danger-text" : ""}">${esc(value)}</span></div>`).join("")}</section>`;
}

function renderChoiceGrid(item, board, _screen, _blockIndex, flow) {
  const selectedValue = flow?.id === "material" ? state.materialIssue.destination : item.items[2];
  return `<section class="content-section choice-section"><header><h3>${esc(item.title)}</h3></header><div>${item.items.map((value) => {
    const selected = value === selectedValue;
    return `<button type="button" class="${selected ? "selected" : ""}" data-choice-value="${esc(value)}" ${board ? "tabindex=\"-1\"" : ""}>${icon("factory")}<strong>${esc(value)}</strong>${selected ? icon("check-circle") : ""}</button>`;
  }).join("")}</div></section>`;
}

function renderScan(item, board, _screen, _blockIndex, flow) {
  const id = `scan-${++fieldSerial}`;
  const materialAttrs = flow?.id === "material" ? `data-material-roll-input value="${esc(state.materialIssue.rollId)}"` : "";
  return `<section class="scan-block"><span class="scan-visual">${icon("scan-line")}</span><label for="${id}">${esc(item.title)}</label><div><span>${icon("search")}</span><input id="${id}" placeholder="${esc(item.placeholder)}" ${materialAttrs} ${board ? "disabled" : ""}/><button type="button" ${flow?.id === "material" ? "data-action=\"material-scan\"" : ""} ${board ? "tabindex=\"-1\"" : ""}>查找</button></div><small>${esc(item.hint)}</small></section>`;
}

function renderUnknown(item) {
  return `<section class="content-section"><p>${esc(item.type)}</p></section>`;
}

function renderDialogs(flow) {
  const printReceipt = flow.id === "office" ? officePrintSuccessReceipt(flow) : null;
  return `
    ${printReceipt ? `
      <dialog class="office-print-success-dialog" id="printSuccessDialog" aria-labelledby="printSuccessDialogTitle" aria-describedby="printSuccessDialogDevice">
        <button class="office-print-success-close" type="button" data-close-dialog aria-label="关闭打印完成弹窗">×</button>
        ${renderOfficePrintSuccessReceipt(printReceipt, {
          titleId: "printSuccessDialogTitle",
          deviceId: "printSuccessDialogDevice",
        })}
      </dialog>
    ` : ""}
    ${flow.id === "office" ? renderOfficeReceiveDialog(flow) : ""}
    <dialog class="role-dialog" id="roleDialog" aria-labelledby="roleDialogTitle">
      <header><div><span>切换岗位</span><h2 id="roleDialogTitle">手机流程</h2></div><button type="button" data-close-dialog aria-label="关闭">×</button></header>
      <div class="role-dialog-list">${flows.map((item) => `<button class="${item.id === flow.id ? "active" : ""}" type="button" data-role="${esc(item.id)}" data-screen="${esc(flowStartScreen(item))}"><span>${icon(item.icon)}</span><span><strong>${esc(item.title)}</strong><small>${esc(item.summary)}</small></span><b>${boardScreenCountForFlow(item)} 状态</b></button>`).join("")}</div>
    </dialog>
    <dialog class="source-dialog" id="sourceDialog" aria-labelledby="sourceDialogTitle">
      <header><div><span>腾胜无纺布 · 2026-07-04</span><h2 id="sourceDialogTitle">原送货单</h2></div><button type="button" data-close-dialog aria-label="关闭">×</button></header>
      <img src="../raw-material-ocr-hallmark/assets/delivery-note-upright.jpg" width="1536" height="864" alt="原材料送货单演示原图放大查看" />
    </dialog>
    <dialog class="artwork-dialog" id="artworkDialog" aria-labelledby="artworkDialogTitle">
      <header><div><span>logo_final.pdf · 第 3 版 · 办公室已复核</span><h2 id="artworkDialogTitle">印刷稿件</h2></div><button type="button" data-close-dialog aria-label="关闭">×</button></header>
      <figure>
        ${renderSilkArtworkCanvas({ bagTone: "red", printTone: "black", printMethod: "单面 · 正面居中" }, true)}
        <figcaption><strong>当前印刷稿件</strong><span>缩略图与当前任务版本一致，可放大核对。</span></figcaption>
      </figure>
    </dialog>
  `;
}

function readExpandedRollEditor() {
  const values = {};
  document.querySelectorAll("[data-roll-edit-field]").forEach((input) => {
    values[input.dataset.rollEditField] = input.value.trim();
  });
  return values;
}

function syncExpandedRollEditor() {
  const editor = document.querySelector(".roll-inline-editor");
  if (!editor) return;
  const values = readExpandedRollEditor();
  const blockers = rollReviewBlockers(values);
  const blockerFields = {
    "颜色": "color",
    "规格 / 宽幅": "spec",
    "重量": "weight",
  };
  const blocker = editor.querySelector(".roll-editor-blocker");
  const button = editor.querySelector('[data-action="confirm-expanded-roll"]');
  editor.querySelectorAll("[data-roll-edit-field]").forEach((input) => {
    input.removeAttribute("aria-invalid");
    input.removeAttribute("aria-describedby");
  });
  blockers.forEach((label) => {
    const input = editor.querySelector(`[data-roll-edit-field="${blockerFields[label]}"]`);
    input?.setAttribute("aria-invalid", "true");
    input?.setAttribute("aria-describedby", blocker?.id || "");
  });
  if (blocker) {
    blocker.hidden = blockers.length === 0;
    blocker.textContent = blockers.length ? `还需填写：${blockers.join("、")}` : "资料已补齐，可以确认这一卷";
  }
  if (button) {
    button.disabled = blockers.length > 0;
    button.setAttribute("aria-disabled", blockers.length ? "true" : "false");
  }
}

function syncExpandedRollDraft(event) {
  if (!event.target.matches("[data-roll-edit-field]")) return;
  const roll = currentExpandedReviewRoll();
  if (!roll) return;
  const values = readExpandedRollEditor();
  const blockers = rollReviewBlockers(values);
  if (!String(roll.rawSpec || "").trim()) roll.rawSpec = String(roll.spec || "").trim();
  roll.color = values.color;
  roll.spec = values.spec;
  delete roll.reviewDraftSpec;
  roll.weight = values.weight ? `${values.weight} kg` : "";
  roll.confirmed = false;
  roll.status = blockers.includes("规格 / 宽幅") ? "待补规格" : blockers.length ? "待补资料" : "待确认";
  roll.tone = "warning";
}

function saveExpandedRoll() {
  const rollIndex = state.selectedRollIndex || 7;
  const roll = state.rawDraft.rolls.find((item) => item.index === rollIndex);
  if (!roll) return false;
  const values = readExpandedRollEditor();
  const blockers = rollReviewBlockers(values);
  if (blockers.length) {
    const fieldKey = blockers[0] === "规格 / 宽幅" ? "spec" : blockers[0] === "重量" ? "weight" : "color";
    const invalid = document.querySelector(`[data-roll-edit-field="${fieldKey}"]`);
    invalid?.setAttribute("aria-invalid", "true");
    invalid?.focus();
    showToast(`请先补齐${blockers.join("、")}`, "warning");
    return false;
  }
  if (!String(roll.rawSpec || "").trim()) roll.rawSpec = String(roll.spec || "").trim();
  roll.color = values.color;
  roll.spec = formatRawMaterialSpec(values.spec);
  delete roll.reviewDraftSpec;
  roll.weight = `${Number(values.weight)} kg`;
  roll.confirmed = true;
  roll.status = "已确认";
  roll.tone = "success";
  return true;
}

function syncPrimaryGate() {
  const button = document.querySelector(".mobile-action-bar .action-button.primary");
  if (!button || state.mode !== "prototype") return;
  const flow = getFlow(state.flowId);
  const screen = getScreen(flow, state.screenId);
  const gate = screenGateStatus(flow, screen, false);
  const disabled = button.dataset.baseDisabled === "true" || button.dataset.attachBlocked === "true" || gate.blocked;
  button.disabled = disabled;
  button.setAttribute("aria-disabled", disabled ? "true" : "false");
  if (gate.reason) {
    button.dataset.gateReason = gate.reason;
    button.title = gate.reason;
  } else {
    delete button.dataset.gateReason;
    button.removeAttribute("title");
  }
}

function validateRequiredFormFields() {
  const requiredFields = [...document.querySelectorAll(".mobile-content [data-field-required='true']")];
  requiredFields.forEach((field) => field.removeAttribute("aria-invalid"));
  const invalid = requiredFields.find((field) => !field.value.trim() || field.value === "请选择");
  if (!invalid) return true;
  invalid.setAttribute("aria-invalid", "true");
  invalid.focus({ preventScroll: true });
  invalid.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  const label = invalid.closest(".field")?.querySelector(":scope > span:first-child")?.textContent || "必填项";
  showToast(`请先填写${label}`, "warning");
  return false;
}

function bindEvents() {
  document.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => {
    state.mode = button.dataset.mode;
    if (state.mode === "prototype") {
      const flow = getFlow(state.flowId);
      state.screenId = flow.screens.some((item) => item.id === state.screenId) ? state.screenId : flowStartScreen(flow);
    }
    updateUrl();
    render();
    scrollTo({ top: 0, behavior: "auto" });
  }));

  document.querySelectorAll("[data-role]").forEach((button) => button.addEventListener("click", () => setFlow(button.dataset.role, button.dataset.screen)));
  document.querySelectorAll("button[data-screen]:not([data-role])").forEach((button) => button.addEventListener("click", () => {
    if (button.matches(".mobile-action-bar .primary") && !validateRequiredFormFields()) return;
    setScreen(button.dataset.screen);
  }));

  app.onclick = (event) => {
    const actionButton = event.target.closest("[data-action]");
    if (actionButton && app.contains(actionButton)) handleAction(actionButton.dataset.action, actionButton);
  };
  app.oninput = (event) => {
    handleSilkReportInput(event);
    handleBagReportInput(event);
    syncExpandedRollDraft(event);
    syncExpandedRollEditor();
  };
  document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => button.closest("dialog")?.close()));
  document.querySelectorAll(".check-row[data-check-key]").forEach((button) => button.addEventListener("click", () => {
    const checked = button.getAttribute("aria-pressed") !== "true";
    state.checklistStatus[button.dataset.checkKey] = checked;
    button.classList.toggle("checked", checked);
    button.setAttribute("aria-pressed", checked ? "true" : "false");
    syncPrimaryGate();
  }));
  document.querySelectorAll(".choice-section button").forEach((button) => button.addEventListener("click", () => {
    button.parentElement.querySelectorAll("button").forEach((item) => item.classList.remove("selected"));
    button.classList.add("selected");
    if (state.flowId === "material" && button.dataset.choiceValue) state.materialIssue.destination = button.dataset.choiceValue;
  }));
  document.querySelectorAll("[data-field-required='true']").forEach((field) => field.addEventListener("input", () => {
    if (field.value.trim() && field.value !== "请选择") field.removeAttribute("aria-invalid");
  }));
  document.querySelectorAll("[data-decision-id]").forEach((field) => field.addEventListener("change", () => {
    state.decisionChoices[field.dataset.decisionId] = field.value;
  }));

  bindBoardFrameScrolling();
  syncExpandedRollEditor();

  removeEventListener("keydown", handleKeyboard);
  addEventListener("keydown", handleKeyboard);
}

function bindBoardFrameScrolling() {
  const keyDistance = 48;
  document.querySelectorAll(".mobile-surface.is-board").forEach((surface) => {
    const content = surface.querySelector(":scope > .mobile-content");
    const focusSelector = surface.dataset.boardFocus;
    if (content && focusSelector) {
      requestAnimationFrame(() => {
        const focusTarget = content.querySelector(focusSelector);
        if (!focusTarget) return;
        const contentRect = content.getBoundingClientRect();
        const focusRect = focusTarget.getBoundingClientRect();
        content.scrollTop = Math.max(0, content.scrollTop + focusRect.top - contentRect.top - 12);
      });
    }
    surface.addEventListener("keydown", (event) => {
      if (event.target !== surface) return;
      if (!content || content.scrollHeight <= content.clientHeight + 1) return;

      const pageDistance = Math.max(keyDistance, Math.round(content.clientHeight * 0.8));
      let nextTop;
      if (event.key === "ArrowDown") nextTop = content.scrollTop + keyDistance;
      if (event.key === "ArrowUp") nextTop = content.scrollTop - keyDistance;
      if (event.key === "PageDown") nextTop = content.scrollTop + pageDistance;
      if (event.key === "PageUp") nextTop = content.scrollTop - pageDistance;
      if (event.key === "Home") nextTop = 0;
      if (event.key === "End") nextTop = content.scrollHeight;
      if (nextTop === undefined) return;

      event.preventDefault();
      content.scrollTo({ top: Math.max(0, nextTop), behavior: "auto" });
    });
  });
}

function resetSilkReportFieldMessage(input) {
  input.removeAttribute("aria-invalid");
  const helper = input.closest(".silk-report-field")?.querySelector("[data-silk-report-help]");
  if (!helper) return;
  helper.textContent = helper.dataset.default || "";
  helper.classList.remove("is-error");
}

function syncSilkReportForm() {
  const form = document.querySelector(".silk-report-form");
  if (!form) return;
  const snapshot = getSilkReportSnapshot(false);
  const wasteInput = form.querySelector('[data-silk-report-field="reportedWaste"]');
  const mode = form.querySelector("[data-silk-report-mode]");
  const formula = form.querySelector("[data-silk-report-formula]");
  const restore = form.querySelector("[data-silk-report-restore]");
  if (!snapshot.wasteOverridden && wasteInput) wasteInput.value = snapshot.reportedWaste ?? "";
  form.dataset.reportMode = snapshot.wasteOverridden ? "manual" : "auto";
  if (mode) {
    mode.textContent = snapshot.wasteOverridden ? "已手动修改" : "自动计算";
    mode.className = `status ${snapshot.wasteOverridden ? "warning" : "info"}`;
  }
  if (formula) {
    formula.textContent = silkReportFormulaText(snapshot);
    formula.classList.toggle("is-error", snapshot.draft.machineActions !== "" && snapshot.draft.estimatedQualified !== "" && !snapshot.formulaReady);
  }
  if (snapshot.formulaReady) {
    ["machineActions", "estimatedQualified"].forEach((fieldName) => {
      const input = form.querySelector(`[data-silk-report-field="${fieldName}"]`);
      if (input) resetSilkReportFieldMessage(input);
    });
  }
  if (restore) restore.hidden = !snapshot.wasteOverridden;
}

function handleSilkReportInput(event) {
  const input = event.target.closest("[data-silk-report-field]");
  if (!input || !app.contains(input)) return;
  const fieldName = input.dataset.silkReportField;
  resetSilkReportFieldMessage(input);
  if (fieldName === "note") {
    state.silkReport.note = input.value;
    return;
  }
  if (fieldName === "machineActions" || fieldName === "estimatedQualified") {
    state.silkReport[fieldName] = input.value;
  }
  if (fieldName === "reportedWaste") {
    const snapshot = getSilkReportSnapshot(false);
    const enteredWaste = parseWholeCount(input.value);
    state.silkReport.manualWaste = snapshot.formulaReady && enteredWaste === snapshot.calculatedWaste ? null : input.value;
  }
  syncSilkReportForm();
}

function resetBagReportFieldMessage(input) {
  input.removeAttribute("aria-invalid");
  const helper = input.closest(".silk-report-field")?.querySelector("[data-bag-report-help]");
  if (!helper) return;
  helper.textContent = helper.dataset.default || "";
  helper.classList.remove("is-error");
}

function syncBagReportForm() {
  const form = document.querySelector("[data-bag-report-form]");
  if (!form) return;
  const snapshot = getBagReportSnapshot(false);
  const wasteInput = form.querySelector('[data-bag-report-field="reportedWaste"]');
  const mode = form.querySelector("[data-bag-report-mode]");
  const formula = form.querySelector("[data-bag-report-formula]");
  const restore = form.querySelector("[data-bag-report-restore]");
  if (!snapshot.wasteOverridden && wasteInput) wasteInput.value = snapshot.reportedWaste ?? "";
  form.dataset.reportMode = snapshot.wasteOverridden ? "manual" : "auto";
  if (mode) {
    mode.textContent = snapshot.wasteOverridden ? "已手动修改" : "自动计算";
    mode.className = `status ${snapshot.wasteOverridden ? "warning" : "info"}`;
  }
  if (formula) {
    formula.textContent = bagReportFormulaText(snapshot);
    formula.classList.toggle("is-error", snapshot.draft.machineActions !== "" && snapshot.draft.estimatedQualified !== "" && !snapshot.formulaReady);
  }
  if (snapshot.formulaReady) {
    ["machineActions", "estimatedQualified"].forEach((fieldName) => {
      const input = form.querySelector(`[data-bag-report-field="${fieldName}"]`);
      if (input) resetBagReportFieldMessage(input);
    });
  }
  if (restore) restore.hidden = !snapshot.wasteOverridden;
}

function handleBagReportInput(event) {
  const input = event.target.closest("[data-bag-report-field]");
  if (!input || !app.contains(input)) return;
  const fieldName = input.dataset.bagReportField;
  resetBagReportFieldMessage(input);
  if (fieldName === "note") {
    state.bagReport.note = input.value;
    return;
  }
  if (fieldName === "machineActions" || fieldName === "estimatedQualified") state.bagReport[fieldName] = input.value;
  if (fieldName === "reportedWaste") {
    const snapshot = getBagReportSnapshot(false);
    const enteredWaste = parseWholeCount(input.value);
    state.bagReport.manualWaste = snapshot.formulaReady && enteredWaste === snapshot.calculatedWaste ? null : input.value;
  }
  syncBagReportForm();
}

function showBagReportFieldError(fieldName, message) {
  const input = document.querySelector(`[data-bag-report-field="${fieldName}"]`);
  if (!input) {
    showToast(`${message}，请返回报数量页面。`, "warning");
    return;
  }
  input.setAttribute("aria-invalid", "true");
  const helper = input.closest(".silk-report-field")?.querySelector("[data-bag-report-help]");
  if (helper) {
    helper.textContent = message;
    helper.classList.add("is-error");
  }
  input.focus({ preventScroll: true });
  input.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  showToast(message, "warning");
}

function validateBagReport() {
  const snapshot = getBagReportSnapshot(false);
  if (state.bagReport.machineActions === "") {
    showBagReportFieldError("machineActions", "请输入机器动作数");
    return false;
  }
  if (snapshot.machineActions === null) {
    showBagReportFieldError("machineActions", "机器动作数要填 0 或正整数");
    return false;
  }
  if (state.bagReport.estimatedQualified === "") {
    showBagReportFieldError("estimatedQualified", "请输入预计合格数量");
    return false;
  }
  if (snapshot.estimatedQualified === null) {
    showBagReportFieldError("estimatedQualified", "预计合格数量要填 0 或正整数");
    return false;
  }
  if (snapshot.machineActions < snapshot.estimatedQualified) {
    showBagReportFieldError("estimatedQualified", "预计合格数量不能大于机器动作数");
    return false;
  }
  if (snapshot.reportedWaste === null) {
    showBagReportFieldError("reportedWaste", "预计异常 / 废品数量要填 0 或正整数");
    return false;
  }
  return true;
}

function showSilkReportFieldError(fieldName, message) {
  const input = document.querySelector(`[data-silk-report-field="${fieldName}"]`);
  if (!input) return;
  input.setAttribute("aria-invalid", "true");
  const helper = input.closest(".silk-report-field")?.querySelector("[data-silk-report-help]");
  if (helper) {
    helper.textContent = message;
    helper.classList.add("is-error");
  }
  input.focus({ preventScroll: true });
  input.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  showToast(message, "warning");
}

function validateSilkReport() {
  const snapshot = getSilkReportSnapshot(false);
  if (state.silkReport.machineActions === "") {
    showSilkReportFieldError("machineActions", "请输入机器动作数");
    return false;
  }
  if (snapshot.machineActions === null) {
    showSilkReportFieldError("machineActions", "机器动作数要填 0 或正整数");
    return false;
  }
  if (state.silkReport.estimatedQualified === "") {
    showSilkReportFieldError("estimatedQualified", "请输入预计合格数量");
    return false;
  }
  if (snapshot.estimatedQualified === null) {
    showSilkReportFieldError("estimatedQualified", "预计合格数量要填 0 或正整数");
    return false;
  }
  if (snapshot.machineActions < snapshot.estimatedQualified) {
    showSilkReportFieldError("estimatedQualified", "预计合格数量不能大于机器动作数");
    return false;
  }
  if (snapshot.reportedWaste === null) {
    showSilkReportFieldError("reportedWaste", "预计异常 / 废品数量要填 0 或正整数");
    return false;
  }
  return true;
}

function handleAction(action, actionButton) {
  if (actionButton?.matches(".mobile-action-bar .primary") && !validateRequiredFormFields()) return;
  if (action === "go-back") {
    goBack();
    return;
  }
  if (action === "open-role-switcher") {
    document.querySelector("#roleDialog")?.showModal();
    return;
  }
  if (action === "show-print-success") {
    state.officePrintCompleted = true;
    render();
    requestAnimationFrame(() => document.querySelector("#printSuccessDialog")?.showModal());
    return;
  }
  if (action === "retry-office-print") {
    state.officePrintRetryCompleted = true;
    render();
    return;
  }
  if (action === "material-scan") {
    const input = document.querySelector("[data-material-roll-input]");
    const rollId = input?.value.trim().toUpperCase();
    if (!materialRollFacts(rollId)) {
      input?.setAttribute("aria-invalid", "true");
      input?.focus();
      showToast("没有找到这卷，或当前状态不可领用。", "warning");
      return;
    }
    state.materialIssue.rollId = rollId;
    setScreen("verify");
    return;
  }
  if (action === "review-material-destination") {
    setScreen("confirm");
    return;
  }
  if (action === "complete-material-issue") {
    state.roleReceipts.material = {
      title: `${state.materialIssue.rollId} 发料已记录`,
      text: `目标为${state.materialIssue.destination}；卷码、经手人和时间已保存，没有虚构订单关联。`,
      tone: "success",
    };
    setFlow("material", "scan");
    return;
  }
  if (action === "edit-roll") {
    const rollIndex = Number(actionButton?.dataset.rollIndex || state.selectedRollIndex || 1);
    if (!state.rawDraft.rolls.some((roll) => roll.index === rollIndex)) return;
    state.selectedRollIndex = rollIndex;
    setScreen("review-edit");
    return;
  }
  if (action === "collapse-roll-editor") {
    state.selectedRollIndex = null;
    setScreen("review");
    return;
  }
  if (action === "confirm-expanded-roll") {
    const confirmedIndex = state.selectedRollIndex || 7;
    if (!saveExpandedRoll()) return;
    state.selectedRollIndex = null;
    setScreen("review");
    requestAnimationFrame(() => showToast(`第 ${confirmedIndex} 卷已确认，继续核对其他卷。`, "info"));
    return;
  }
  if (action === "complete-roll-review") {
    const stats = rawReviewStats(false);
    if (stats.confirmed < stats.total) {
      showToast(`还有 ${stats.total - stats.confirmed} 卷没有逐卷确认。`, "warning");
      return;
    }
    setScreen("print");
    return;
  }
  if (action === "retry-raw-capture-upload") {
    setFlow("office", "review");
    requestAnimationFrame(() => showToast("原照片已安全重传，服务器已生成同一份 OCR 草稿。", "info"));
    return;
  }
  if (action === "import-raw-document") {
    const officeFlow = getFlow("office");
    const captureScreen = getScreen(officeFlow, "capture");
    const evidenceIndex = captureScreen.blocks.findIndex((item) => item.type === "evidence");
    if (evidenceIndex >= 0) {
      const key = blockStateKey("evidence", officeFlow, captureScreen, evidenceIndex);
      state.evidenceAttempts[key] = (state.evidenceAttempts[key] || 0) + 1;
      state.evidenceStatus[key] = "saved";
    }
    setFlow("office", "review");
    requestAnimationFrame(() => showToast("文件已导入并保存，开始逐卷核对。", "info"));
    return;
  }
  if (["evidence-capture", "evidence-retry", "evidence-retake"].includes(action)) {
    const key = actionButton?.dataset.evidenceKey;
    if (!key) return;
    state.evidenceAttempts[key] = (state.evidenceAttempts[key] || 0) + 1;
    const failFirstAttempt = action === "evidence-capture"
      && actionButton.dataset.evidenceFailOnce === "true"
      && state.evidenceAttempts[key] === 1;
    state.evidenceStatus[key] = failFirstAttempt ? "failed" : "saved";
    render();
    requestAnimationFrame(() => showToast(
      failFirstAttempt ? "照片已拍下，但上传失败；可重新上传。" : action === "evidence-retake" ? "新照片已替换并保留重拍记录。" : "照片已保存到当前任务。",
      failFirstAttempt ? "warning" : "info",
    ));
    return;
  }
  if (action === "view-evidence") {
    showToast("证据已打开；查看不会改变业务状态。", "info");
    return;
  }
  if (action === "open-source") {
    document.querySelector("#sourceDialog")?.showModal();
    return;
  }
  if (action === "open-artwork") {
    document.querySelector("#artworkDialog")?.showModal();
    return;
  }
  if (action === "restore-silk-report-auto") {
    state.silkReport.manualWaste = null;
    syncSilkReportForm();
    document.querySelector('[data-silk-report-field="reportedWaste"]')?.focus();
    return;
  }
  if (action === "restore-bag-report-auto") {
    state.bagReport.manualWaste = null;
    syncBagReportForm();
    document.querySelector('[data-bag-report-field="reportedWaste"]')?.focus();
    return;
  }
  if (action === "review-bag-complete" || action === "review-bag-daily") {
    if (!validateBagReport()) return;
    setScreen(action === "review-bag-daily" ? "confirm-daily" : "confirm");
    return;
  }
  if (action === "review-silk-complete" || action === "review-silk-daily") {
    if (!validateSilkReport()) return;
    if (action === "review-silk-complete") state.silkDailySaved = null;
    setScreen(action === "review-silk-daily" ? "confirm-daily" : "confirm");
    return;
  }
  if (action === "save-silk-daily") {
    const snapshot = getSilkReportSnapshot(false);
    state.silkSubmittedReports.push({
      machineActions: snapshot.machineActions,
      estimatedQualified: snapshot.estimatedQualified,
      reportedWaste: snapshot.reportedWaste,
      note: snapshot.draft.note.trim(),
    });
    state.silkDailySaved = {
      estimatedQualified: snapshot.estimatedQualified,
      cumulativeQualified: snapshot.cumulativeQualified,
    };
    state.silkReport = { ...EMPTY_SILK_REPORT };
    setScreen("task");
    return;
  }
  if (action === "pause-silk-task") {
    state.silkPaused = true;
    setScreen("task");
    return;
  }
  if (action === "resume-silk-after-resolution") {
    state.silkPaused = false;
    setScreen("started");
    return;
  }
  if (action === "complete-silk-task") {
    const snapshot = getSilkReportSnapshot(false);
    state.silkSubmittedReports.push({
      machineActions: snapshot.machineActions,
      estimatedQualified: snapshot.estimatedQualified,
      reportedWaste: snapshot.reportedWaste,
      note: snapshot.draft.note.trim(),
    });
    state.silkCompletedReceipt = {
      cumulativeQualified: snapshot.cumulativeQualified,
      cumulativeWaste: snapshot.cumulativeWaste,
      cumulativeMachineActions: snapshot.cumulativeMachineActions,
    };
    state.silkCompleted = true;
    state.silkDailySaved = null;
    state.silkReport = { ...EMPTY_SILK_REPORT };
    state.silkPlanOrder = state.silkPlanOrder.filter((taskId) => taskId !== "customer-a");
    setScreen("my-plan");
    return;
  }
  if (action === "save-bag-daily") {
    if (!validateBagReport()) return;
    const snapshot = getBagReportSnapshot(false);
    state.bagSubmittedReports.push({
      machineActions: snapshot.machineActions,
      estimatedQualified: snapshot.estimatedQualified,
      reportedWaste: snapshot.reportedWaste,
      note: snapshot.draft.note.trim(),
    });
    state.roleReceipts.bag = {
      flow: "bag",
      screen: "queue",
      title: "今天进度已保存",
      text: `本次合格 ${formatCount(snapshot.estimatedQualified)} 个，整批累计 ${formatCount(snapshot.cumulativeQualified)} / ${formatCount(BAG_PLAN_QUANTITY)} 个；任务没有被当成完工。`,
      tone: "info",
      removeCurrent: false,
    };
    state.bagReport = { ...EMPTY_BAG_REPORT };
    setFlow("bag", "queue");
    return;
  }
  if (action === "complete-bag") {
    if (!validateBagReport()) return;
    const snapshot = getBagReportSnapshot(false);
    state.roleReceipts.bag = {
      flow: "bag",
      screen: "queue",
      title: "制袋任务已完成",
      text: `${formatCount(snapshot.cumulativeQualified)} 个合格品已进入待打包；完整分段报数、照片、机台和操作记录保留在后台。`,
      removeCurrent: true,
    };
    setFlow("bag", "queue");
    return;
  }
  const routineCompletions = {
    "complete-packing": { flow: "packing", screen: "queue", title: "打包已完成", text: "已生成 24 个包裹记录，共 2,400 个；库存仍等待实物出库确认。", removeCurrent: true },
    "complete-warehouse": { flow: "warehouse", screen: "visible", title: "实物出库已记录", text: "2,400 个、24 包已按当前纸单出库；最终送达仍单独记录。", removeCurrent: true },
    "complete-warehouse-adjusted": { flow: "warehouse", screen: "visible", title: "按实际 2,320 个出库", text: "第 3 版纸单、80 个差异、决定依据和现场执行记录已保存。", removeCurrent: true },
    "complete-driver": { flow: "driver", screen: "queue", title: "第 1 站已送达", text: "凭证、收货人、纸质联和时间已保存；第 2 站成为下一项，资料不全时仍不可装车。", removeCurrent: true },
    "complete-maintenance": { flow: "maintenance", screen: "queue", title: "1 号丝印机已恢复", text: "检查、措施、处理后照片和实际技术人员已保存。", removeCurrent: true, removeTask: "1 号丝印机" },
    "complete-inspection": { flow: "maintenance", screen: "queue", title: "日常巡检已保存", text: "逐项检查、结论、照片和执行时间已记入设备记录。", removeCurrent: true, removeTask: "日常巡检" },
    "complete-preventive": { flow: "maintenance", screen: "queue", title: "预防维护已保存", text: "维护项目与运行参数已记录，并生成下一周期任务。", removeCurrent: true, removeTask: "预防维护" },
  };
  if (routineCompletions[action]) {
    const receipt = routineCompletions[action];
    state.roleReceipts[receipt.flow] = receipt;
    setFlow(receipt.flow, receipt.screen);
    return;
  }
  if (["confirm-attach-roll", "mark-attach-mismatch", "reset-attach-roll"].includes(action)) {
    const rollIndex = Number(actionButton?.dataset.rollIndex);
    if (!rollIndex) return;
    const roll = state.rawDraft.rolls.find((item) => item.index === rollIndex);
    if (!roll) return;
    const key = `${state.rawDraft.draftId}:${roll.rollId}`;
    state.attachRollStatus[key] = action === "confirm-attach-roll" ? "confirmed" : action === "mark-attach-mismatch" ? "mismatch" : "pending";
    render();
    requestAnimationFrame(() => showToast(
      action === "confirm-attach-roll" ? `第 ${rollIndex} 卷已确认，可继续处理任意一卷。` : action === "mark-attach-mismatch" ? `第 ${rollIndex} 卷已标记异常，其他卷继续贴标。` : `第 ${rollIndex} 卷已恢复为待核对。`,
      action === "mark-attach-mismatch" ? "warning" : "info",
    ));
    return;
  }
  if (action === "confirm-all-attach") {
    const pendingRolls = state.rawDraft.rolls.filter((roll) => getAttachRollStatus(roll, false) === "pending");
    if (!pendingRolls.length) return;
    pendingRolls.forEach((roll) => {
      state.attachRollStatus[`${state.rawDraft.draftId}:${roll.rollId}`] = "confirmed";
    });
    render();
    return;
  }
  if (action === "complete-attach") {
    const stats = getAttachStats(false);
    if (stats.processed < stats.total) {
      showToast(`还有 ${stats.total - stats.processed} 卷未处理。`, "warning");
      return;
    }
    state.officeReceiveVariant = stats.mismatch ? "partial" : "complete";
    render();
    requestAnimationFrame(() => document.querySelector("#receiveResultDialog")?.showModal());
    return;
  }
  if (action === "maintenance-submit") {
    const status = [...document.querySelectorAll(".form-section select")]
      .find((select) => [...select.options].some((option) => ["等待配件", "需要停机", "转办公室协调"].includes(option.value)))?.value;
    setScreen(["等待配件", "需要停机", "转办公室协调"].includes(status) ? "blocked" : "confirm");
    return;
  }
  if (action === "confirm-silk-marker") {
    state.silkClaimed = true;
    setScreen("my-plan");
    requestAnimationFrame(() => showToast("已标记为 2-02，其他三台机已能看到。", "info"));
    return;
  }
  if (action === "move-silk-task") {
    const taskId = actionButton?.dataset.taskId;
    const direction = actionButton?.dataset.direction;
    const currentIndex = state.silkPlanOrder.indexOf(taskId);
    const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= state.silkPlanOrder.length) return;
    [state.silkPlanOrder[currentIndex], state.silkPlanOrder[nextIndex]] = [state.silkPlanOrder[nextIndex], state.silkPlanOrder[currentIndex]];
    render();
    requestAnimationFrame(() => showToast("我的未开工任务已重新编号。", "info"));
    return;
  }
  const messages = {
    "show-note": "单据信息与 OCR 原文在正式页面中折叠显示。",
    "device-picker": "这里只显示预先批准且能返回打印结果的设备。",
    "show-mismatch": "当前卷将转入隔离区，其他正确卷可以继续入库。",
    "open-list-item": "该列表项会打开同一业务编号的详情；当前原型只展开主要案例。",
    "open-function": "该入口复用当前角色的同类任务页面；主要业务链路已单独画出。",
    "prototype-placeholder": "这是辅助原型入口，不执行真实业务写入。",
    "enter-authorized-role": "正式系统会按服务器返回的本人角色进入岗位；当前原型没有绑定真实员工账号，不模拟越权跳转。",
  };
  showToast(messages[action] || "这是原型交互，未执行真实业务写入。", action === "show-mismatch" ? "warning" : "info");
}

function handleKeyboard(event) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    document.querySelector("#roleDialog")?.showModal();
  }
}

function showToast(message, tone = "info") {
  const toast = document.querySelector("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast visible ${tone}`;
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove("visible"), 3200);
}

render();
