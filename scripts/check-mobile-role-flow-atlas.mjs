import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { flows, formatRawMaterialSpec, rawMaterialRolls, reviewedRawMaterialRolls } from "../docs/prototypes/mobile-role-flow-atlas/flows.js";
import { crossDeviceOrders } from "../docs/prototypes/shared/cross-device-orders.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const atlasDir = path.join(root, "docs/prototypes/mobile-role-flow-atlas");
const errors = [];
const expectedRoles = ["office", "decision", "material", "silk", "bag", "packing", "warehouse", "driver", "maintenance", "account"];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function walkTargets(value, visit) {
  if (!value || typeof value !== "object") return;
  if (!Array.isArray(value) && typeof value.target === "string") visit(value.target, value.targetRole);
  if (Array.isArray(value)) {
    for (const item of value) walkTargets(item, visit);
    return;
  }
  for (const child of Object.values(value)) walkTargets(child, visit);
}

assert(flows.length === expectedRoles.length, `岗位数应为 ${expectedRoles.length}，实际为 ${flows.length}`);
assert(expectedRoles.every((roleId) => flows.some((flow) => flow.id === roleId)), "缺少约定的手机岗位");

const flowMap = new Map(flows.map((flow) => [flow.id, flow]));
let businessTrackCount = 0;
let screenCount = 0;

for (const flow of flows) {
  const screenIds = flow.screens.map((screen) => screen.id);
  const screenSet = new Set(screenIds);
  screenCount += screenIds.length;

  assert(typeof flow.startScreen === "string", `${flow.id} 缺少明确 startScreen`);
  assert(screenSet.has(flow.startScreen), `${flow.id} 的 startScreen 不存在：${flow.startScreen}`);
  assert(screenSet.size === screenIds.length, `${flow.id} 存在重复 screen id`);
  assert(Array.isArray(flow.boardTracks) && flow.boardTracks.length > 0, `${flow.id} 缺少 boardTracks`);

  const covered = new Set();
  for (const track of flow.boardTracks || []) {
    if (track.kind === "business" && !track.hideFromBoard) businessTrackCount += 1;
    assert(Array.isArray(track.screenIds) && track.screenIds.length > 0, `${flow.id}/${track.key} 没有页面`);
    for (const id of track.screenIds || []) {
      covered.add(id);
      assert(screenSet.has(id), `${flow.id}/${track.key} 引用了不存在的页面 ${id}`);
    }
    for (const group of track.groups || []) {
      assert(Array.isArray(group.screenIds) && group.screenIds.length > 0, `${flow.id}/${track.key}/${group.key} 没有页面`);
      for (const id of group.screenIds || []) {
        covered.add(id);
        assert(screenSet.has(id), `${flow.id}/${track.key}/${group.key} 引用了不存在的页面 ${id}`);
      }
    }
  }

  for (const screen of flow.screens) {
    assert(covered.has(screen.id) || screen.atlasHidden || screen.atlasVariantOf, `${flow.id}/${screen.id} 没有出现在流程画板，也没有声明为同页状态或隐藏工具页`);
  }

  for (const screen of flow.screens) {
    walkTargets(screen, (target, targetRole) => {
      const targetFlow = targetRole ? flowMap.get(targetRole) : flow;
      assert(Boolean(targetFlow), `${flow.id}/${screen.id} 指向不存在的岗位 ${targetRole}`);
      if (targetFlow) assert(targetFlow.screens.some((item) => item.id === target), `${flow.id}/${screen.id} 指向不存在的页面 ${targetRole ? `${targetRole}/` : ""}${target}`);
    });
    for (const block of screen.blocks || []) {
      if (block.type !== "function-grid") continue;
      for (const item of block.items || []) {
        const target = Array.isArray(item) ? item[3] : item.target;
        if (target) assert(screenSet.has(target), `${flow.id}/${screen.id} 功能入口指向不存在的页面 ${target}`);
      }
    }
  }
}

const requiredScreens = {
  office: ["capture", "review", "label-deferred", "print", "print-success", "print-result", "attach", "receive-partial", "receive-complete", "return-complete"],
  silk: ["queue", "my-plan", "task", "started", "report", "confirm-daily", "confirm", "exception", "resolution"],
  bag: ["resolution", "resolution-ready"],
  packing: ["resolution", "resolution-ready"],
  warehouse: ["variance", "variance-submitted", "decision-received", "wait-new-paper", "paper-check-new", "confirm-adjusted"],
  driver: ["resolution", "resolution-ready"],
  maintenance: ["resolution", "resolution-ready"],
  account: ["login", "login-failed", "first-password", "trust", "replace", "rebind-pending", "rebind-failed", "rebind-result"],
};

for (const [flowId, ids] of Object.entries(requiredScreens)) {
  const screenSet = new Set(flowMap.get(flowId)?.screens.map((screen) => screen.id));
  for (const id of ids) assert(screenSet.has(id), `${flowId} 缺少闭环页面 ${id}`);
}

const office = flowMap.get("office");
const decision = flowMap.get("decision");
const rushEvidenceScreen = decision?.screens.find((screen) => screen.id === "evidence");
assert(!rushEvidenceScreen?.status, "插单交期已在业务摘要中展示，页面标题栏不得重复");
assert(rushEvidenceScreen?.blocks[0]?.status === "今天 16:00 前", "插单交期必须保留在客户业务摘要内");
assert(!rushEvidenceScreen?.blocks.some((item) => item.type === "alert" && item.title === "排程测算参考（系统计算）"), "插单影响已在业务摘要中展示，不得再占用独立测算提示卡");
const rushScheduleNotes = rushEvidenceScreen?.blocks.find((item) => item.type === "checklist" && item.title === "排程要点")?.items || [];
assert(rushScheduleNotes.includes("PRINT-02 同色红色任务可连排，少换一次色"), "删除重复测算卡后必须保留不同含义的同色连排收益");
const rushConfirmScreen = decision?.screens.find((screen) => screen.id === "confirm");
assert(rushConfirmScreen?.blocks[0]?.status === "今天 16:00 前", "最终确认必须复核业务交期，不能换成泛化的提交提示");
const generatedDecisionEvidenceIds = ["outbound-evidence", "statement-evidence", "rounding-evidence", "purchase-evidence", "major-evidence"];
for (const screenId of generatedDecisionEvidenceIds) {
  const screen = decision?.screens.find((item) => item.id === screenId);
  assert(!screen?.blocks.some((item) => item.type === "alert" && item.title === "决定前"), `${screenId} 不得重复显示泛化的决定前提示`);
}
for (const screenId of ["outbound-evidence", "rounding-evidence", "major-evidence"]) {
  const screen = decision?.screens.find((item) => item.id === screenId);
  assert(!screen?.status, `${screenId} 的主摘要已显示当前状态，标题栏不得再次重复`);
}
const decisionResultIds = ["return-result", "result", "outbound-result", "statement-result", "rounding-result", "purchase-result", "major-result"];
for (const screenId of decisionResultIds) {
  const screen = decision?.screens.find((item) => item.id === screenId);
  assert(!screen?.status, `${screenId} 的结果只应在结果块出现一次，标题栏不得重复“已记录/等待”状态`);
  const outcomeBlock = screen?.blocks.find((item) => item.type === "decision-result" || item.type === "alert");
  assert(outcomeBlock && screen?.title !== outcomeBlock.title, `${screenId} 的页面标题不得逐字重复结果块结论`);
}
for (const screenId of ["confirm", "outbound-confirm", "statement-confirm", "rounding-confirm", "purchase-confirm", "major-confirm"]) {
  const screen = decision?.screens.find((item) => item.id === screenId);
  assert(screen?.status === "提交后决定生效" && screen?.blocks.some((item) => item.type === "decision-choice-confirmation"), `${screenId} 必须保留高风险提交前的决定复核`);
}
const decisionHistoryScreen = decision?.screens.find((screen) => screen.id === "history");
assert(decisionHistoryScreen?.blocks.some((item) => item.type === "alert" && item.title === "需要调整时新建事项"), "决定历史提示必须提供调整动作，不能只重复只读状态");
const decisionConflictScreen = decision?.screens.find((screen) => screen.id === "conflict");
assert(!JSON.stringify(decisionConflictScreen?.blocks.find((item) => item.type === "checklist") || {}).includes("不能覆盖原决定"), "冲突页可执行操作不得再次重复顶部已说明的覆盖限制");
assert(office.hideBottomNav === true, "办公室原材料手机动线必须隐藏通用底部导航");
assert(office.boardTracks.length === 1 && office.boardTracks[0].key === "raw-material", "办公室手机端只能保留原材料录入业务动线");
assert(office.mobileHeaderTitle === "办公室手机"
  && office.fixedPreviewIdentity === "管理A"
  && office.fixedPreviewBadge === "内测固定身份", "办公室内测入口必须展示后端签发的固定预览身份，不能退回岗位切换器");
const officeScreenMap = new Map(office.screens.map((screen) => [screen.id, screen]));
const deployedOfficeStages = ["capture", "review", "label-deferred", "print", "print-success", "print-result", "attach", "receive-partial", "receive-complete", "return-complete"];
assert(JSON.stringify([...officeScreenMap.keys()]) === JSON.stringify(deployedOfficeStages), "办公室图谱必须只保留当前部署版的 10 个真实 mobileStage，顺序也要一致");
assert(office.deployedBaseline?.commit === "fa45ed0f127cf73f8877ad5eb184c0d817dc4fb0"
  && office.deployedBaseline?.version === "v0.8.307-preview.28", "办公室图谱必须记录本次同步的不可变部署提交和版本");
const forbiddenOfficePages = ["capture-pages", "capture-failed", "review-edit", "review-color", "print-retry", "return-capture", "return-review"];
for (const screenId of forbiddenOfficePages) assert(!officeScreenMap.has(screenId), `办公室不得把部署版同页状态另造为 ${screenId} 页面`);
const officeTrack = office.boardTracks[0];
assert(JSON.stringify(officeTrack.screenIds) === JSON.stringify(deployedOfficeStages), "办公室画板的页面集合必须与部署版 mobileStage 完全一致");

const captureScreen = officeScreenMap.get("capture");
const capturePages = captureScreen?.variants?.["delivery-pages"]?.blocks.find((block) => block.type === "office-mobile-capture");
assert(capturePages?.direction === "supplier_delivery"
  && capturePages?.maxPages === 4
  && capturePages?.pages?.length === 3, "收货拍单必须在同一个 capture 页面还原部署版 3 页逐页预览");
const supplierReturnGroup = office.boardTracks[0].groups.find((group) => group.key === "supplier-return");
const returnCapture = captureScreen?.variants?.["supplier-return"]?.blocks.find((block) => block.type === "office-mobile-capture");
const returnResult = officeScreenMap.get("return-complete")?.blocks.find((block) => block.type === "office-return-result");
assert(supplierReturnGroup?.screenIds?.join(",") === "capture,review,return-complete"
  && supplierReturnGroup?.screenVariants?.capture === "supplier-return"
  && supplierReturnGroup?.screenVariants?.review === "supplier-return", "供应商退货必须复用部署版 capture/review 页面，只在画板中切换同页变体");
assert(returnCapture?.direction === "supplier_return"
  && returnCapture?.supplierNameHint === "腾胜无纺布"
  && returnCapture?.supplierOptions?.includes("腾胜无纺布"), "当前部署版退货必须在 capture 页面先选择正式供应商归属");
const returnReviewVariant = officeScreenMap.get("review")?.variants?.["supplier-return"];
const returnReview = returnReviewVariant?.blocks.find((block) => block.type === "rolls");
const returnReviewSource = returnReviewVariant?.blocks.find((block) => block.type === "delivery-note-pages");
assert(returnReviewVariant?.documentDirection === "supplier_return"
  && returnReview?.itemUnit === "件"
  && returnReview?.items?.length === 3, "同一个 review 页面必须按部署版切换为退货逐件核对");
assert(returnReviewSource?.pages?.length === 1, "退货核对页必须在供应商确认前保留可放大的原退货单图片");
assert(returnReview?.items?.every((item) => item.weight && item.unitPrice), "退货逐件数据必须保留重量和部署版折叠字段中的单价");
assert(returnResult
  && supplierReturnGroup?.summary?.includes("负数对账证据"), "供应商退货结果必须明确只留负数对账证据");
const deliveryReview = officeScreenMap.get("review");
const deliveryPages = deliveryReview?.blocks.find((block) => block.type === "delivery-note-pages");
assert(deliveryPages?.pages?.length === 3 && deliveryPages?.activePage === 1, "OCR 核对必须还原部署版 3 页原单和当前来源页");
assert(deliveryPages?.meta === "宁晋县腾胜无纺布有限公司 · 2026-08-14"
  && deliveryReview?.ocrNotice?.includes("RMI-OCR-D6BCA7541B6E（3 页）"), "OCR 核对必须显示当前部署单的供应商、日期、草稿号和页数");
const twoConfirmedReview = deliveryReview?.variants?.["two-confirmed"];
const twoConfirmedRolls = twoConfirmedReview?.blocks?.find((block) => block.type === "rolls");
assert(JSON.stringify(twoConfirmedRolls?.confirmedRollIndices) === JSON.stringify([1, 2])
  && twoConfirmedReview?.primary?.label === "已确认 2/22 · 进入打印", "当前内测画板必须还原真机截图中的 2/22 核对状态");
assert(rawMaterialRolls.every((roll) => Number.isInteger(roll.sourcePageIndex)
  && roll.supplierColor
  && Object.prototype.hasOwnProperty.call(roll, "factoryColor")), "每个物理卷必须保留来源页、厂家票面颜色与厂内标准色字段");
assert(rawMaterialRolls.some((roll) => !roll.factoryColor && roll.mappingStatus === "unmatched"), "部署版未匹配颜色必须保留为空并阻断人工核对");
const resumeItems = captureScreen?.blocks[0]?.items || [];
const resumeReceipt = resumeItems[0] || {};
assert(resumeItems.length === 1, "拍单首页必须只突出一张可续办送货单");
assert(resumeReceipt.title === "宁晋县腾胜无纺布有限公司" && resumeReceipt.meta === "22 卷", "未完成卡只保留当前部署单的供应商身份与卷数");
assert(resumeReceipt.badge === "补打卷标" && resumeReceipt.target === "print", "当前部署版未完成卡必须直接进入打印阶段补打卷标");
assert(!Object.prototype.hasOwnProperty.call(resumeReceipt, "status"), "未完成卡不得重复显示待贴标状态");
assert(!JSON.stringify(resumeReceipt).includes("标签已打印"), "未完成卡不得用打印里程碑重复继续贴标动作");
const distilledOfficeScreens = new Map([["print", "office-print-batch"], ["print-success", "office-print-batch"], ["print-result", "office-print-failure"], ["receive-partial", "office-receive-result"], ["receive-complete", "office-receive-result"]]);
for (const [screenId, blockType] of distilledOfficeScreens) {
  const screen = office.screens.find((item) => item.id === screenId);
  assert(screen?.blocks.length === 1 && screen.blocks[0].type === blockType, `${screenId} 必须使用部署版对应阶段模块`);
}
assert(officeScreenMap.get("print")?.secondary?.target === "label-deferred", "部署版打印页必须保留暂不打印并保存待补标动作");
assert(officeScreenMap.get("print-success")?.blocks[0]?.successReceipt?.target === "attach", "部署版 print-success 必须显示开始贴标动作");
assert(officeScreenMap.get("print-result")?.primary?.target === "print", "部署版打印未确认结果必须返回打印页重试");
assert(officeScreenMap.get("receive-partial")?.secondary?.target === "attach", "部分收货结果必须能查看贴标清单");
assert(office.screens.find((screen) => screen.id === "attach")?.blocks.find((block) => block.type === "attach-rolls")?.compact === true, "逐卷贴标必须使用连续紧凑清单");
const labelResumeGroup = office.boardTracks[0].groups.find((group) => group.key === "label-resume");
const printScreen = office.screens.find((screen) => screen.id === "print");
const printBatch = printScreen?.blocks.find((block) => block.type === "office-print-batch");
const printBatchPrinter = printBatch?.printer || {};
const printSuccessReceipt = printBatch?.successReceipt || {};
const unmatchedColorRoll = rawMaterialRolls.find((roll) => roll.index === 9);
assert(unmatchedColorRoll?.supplierColor === "白"
  && unmatchedColorRoll?.factoryColor === ""
  && unmatchedColorRoll?.status === "待补资料", "第 9 卷必须忠实保留部署版未匹配厂内标准色状态");
assert(!printBatch?.groups, "打印页不得再使用按颜色合并的抽象卷号范围");
assert(printScreen?.primary?.action === "show-print-success" && !printScreen?.primary?.target, "打印主动作必须进入部署版 print-success 状态");
assert(printSuccessReceipt.title === "22 张卷标已打印"
  && printSuccessReceipt.device === "BT-TT-01"
  && printSuccessReceipt.actionLabel === "开始贴标"
  && printSuccessReceipt.target === "attach", "打印完成弹窗必须只保留完成数量、打印机身份和开始贴标动作");
assert(labelResumeGroup?.screenIds?.join(",") === "capture,print,print-success,attach,receive-complete", "待补标续办必须按部署版真实阶段完整展示");
assert(printBatchPrinter.model === "BT-TT-01", "打印设备主行必须把 BT-TT-01 明确作为型号数据");
assert(printBatchPrinter.connectionState === "connected" && printBatchPrinter.connectionLabel === "蓝牙已连接", "打印设备主行必须只显示一个明确的书面连接状态");
for (const legacyField of ["status", "meta", "consumable"]) {
  assert(!Object.prototype.hasOwnProperty.call(printBatchPrinter, legacyField), `打印设备主行不得保留旧展示字段 ${legacyField}`);
}
for (const forbiddenCopy of ["已验收", "防水面材", "树脂碳带", "可打印"]) {
  assert(!JSON.stringify(printBatchPrinter).includes(forbiddenCopy), `打印设备主行不得出现“${forbiddenCopy}”`);
}
assert(rawMaterialRolls.length === 22, "OCR 核对必须还原部署版 22 个物理卷记录");
assert(new Set(rawMaterialRolls.map((roll) => roll.rollId)).size === rawMaterialRolls.length, "每个物理卷必须有唯一卷码");
assert(rawMaterialRolls.every((roll) => !Object.prototype.hasOwnProperty.call(roll, "count")), "逐卷记录不应再保留可编辑卷数；一条记录固定代表一卷");
const rawMaterialRollWeightTotal = rawMaterialRolls.reduce((total, roll) => total + Number.parseFloat(roll.weight), 0);
assert(Math.abs(rawMaterialRollWeightTotal - 2192.1) < 0.001, "22 个物理卷的本卷重量合计必须等于整单 2192.1 kg");
assert(reviewedRawMaterialRolls.length === rawMaterialRolls.length, "正常打印与贴标必须沿用全部 22 个已核对物理卷");
assert(reviewedRawMaterialRolls.every((roll) => roll.confirmed === true && roll.status === "已确认"), "正常打印与贴标不能复用待确认卷数据");
assert(reviewedRawMaterialRolls.find((roll) => roll.index === 9)?.factoryColor === "本白", "第 9 卷经人工核对后才可带入本白厂内标准色");
assert(formatRawMaterialSpec("78 × 30 × 2000") === "78克*30宽*2000米", "原材料规格必须支持克重*宽度*米数的明确展示格式");
assert(formatRawMaterialSpec("78 × 70 × 2000") === "78克*70宽*2000米", "克重在第一段时必须显示为克重*宽度*米数");
assert(formatRawMaterialSpec("70 × 78 × 2000") === "78克*70宽*2000米", "克重在第二段时必须调回克重*宽度*米数");
assert(formatRawMaterialSpec("76 × 78 × 1500") === "78克*76宽*1500米", "卷标与领料页必须沿用统一的显式单位格式");
assert(formatRawMaterialSpec("78克*70宽*2000米") === "78克*70宽*2000米", "已经规范化的原材料规格不应再次改写");
assert(formatRawMaterialSpec("70 × 80 × 2000") === "70×80×2000", "无法确认克重与宽度时不得猜测字段含义");
assert(formatRawMaterialSpec("条") === "条", "厂家未写完整规格时必须保留原文，不能编造数值");
const attachScreen = office.screens.find((screen) => screen.id === "attach");
const attachRolls = attachScreen?.blocks.find((block) => block.type === "attach-rolls")?.items || [];
assert(attachRolls === reviewedRawMaterialRolls, "正常贴标页必须复用已核对卷数据，不能回退到第 7 卷待补状态");

const officeSerialized = JSON.stringify(office);
for (const forbiddenCopy of ["厂家少写字段时", "厂家颜色没有匹配时", "直接拍退货单", "确认供应商及 3 件退货"]) {
  assert(!officeSerialized.includes(forbiddenCopy), `办公室同步版不得保留自增文案“${forbiddenCopy}”`);
}
assert(!flowMap.get("silk").screens.some((screen) => screen.id === "done"), "丝印完成不得恢复为冗余独立成功页");

for (const roleId of ["silk", "bag", "packing", "warehouse", "driver", "maintenance"]) {
  const toolsTrack = flowMap.get(roleId)?.boardTracks.find((track) => track.key === "tools");
  assert(toolsTrack?.hideFromBoard === true, `${roleId} 的全部功能页不得继续计入业务流程画板`);
}
for (const [roleId, variants] of Object.entries({
  bag: [["confirm-daily", "report"], ["confirm", "report"], ["resolution-ready", "resolution"]],
  packing: [["confirm", "input"], ["resolution-ready", "resolution"]],
  warehouse: [["wait-paper", "prepare"], ["confirm", "paper-check"], ["wait-new-paper", "decision-received"], ["confirm-adjusted", "paper-check-new"]],
  driver: [["confirm", "proof"], ["resolution-ready", "resolution"]],
  maintenance: [["confirm", "record"], ["resolution-ready", "resolution"]],
})) {
  for (const [screenId, canonical] of variants) {
    assert(flowMap.get(roleId)?.screens.find((screen) => screen.id === screenId)?.atlasVariantOf === canonical, `${roleId}/${screenId} 必须声明为 ${canonical} 的同页状态`);
  }
}
assert(flowMap.get("account")?.atlasSection === "appendix", "账号与设备安全必须作为平台附录，不能计入生产岗位动线");
assert(flowMap.get("decision")?.boardTracks.find((track) => track.key === "insert-return")?.hideFromBoard === true, "插单补资料必须收为同一事项的处理分支，不能重复展示独立主线");
assert(!flowMap.get("material")?.screens.find((screen) => screen.id === "scan")?.blocks.some((item) => item.type === "alert"), "原料扫码默认页不得重复解释一期边界");
assert(!flowMap.get("driver")?.screens.find((screen) => screen.id === "queue")?.blocks.some((item) => item.type === "alert"), "司机任务池不得重复解释岗位权限边界");

const appSource = fs.readFileSync(path.join(atlasDir, "app.js"), "utf8");
const stylesSource = fs.readFileSync(path.join(atlasDir, "styles.css"), "utf8");
const cssSource = fs.readFileSync(path.join(atlasDir, "mobile-miniapp-redesign.css"), "utf8");
const solutionSource = fs.readFileSync(path.join(atlasDir, "SOLUTION.md"), "utf8");

assert(appSource.includes("function boardScreenCountForFlow")
  && appSource.includes('track.hideFromBoard')
  && appSource.includes('flow.atlasSection !== "appendix"'), "流程图谱统计必须排除工具页、同页状态和平台附录");
assert(appSource.includes('pageParams.get("variant")')
  && appSource.includes('requestedInitialVariant === "two-confirmed"'), "办公室真机状态必须支持用深链单独验收拍单和 2/22 核对变体");
assert(appSource.includes("office-mobile-role-bar")
  && appSource.includes("office-mobile-ocr-notice")
  && cssSource.includes('[data-flow="office"] > .office-mobile-role-bar')
  && cssSource.includes('[data-flow="office"] > .office-mobile-ocr-notice'), "办公室拍单页身份区与核对页 OCR 提示必须使用真机同构结构，并限制在办公室作用域");
assert(appSource.includes('setScreen("print-success")')
  && appSource.includes('setScreen(stats.mismatch ? "receive-partial" : "receive-complete")'), "办公室交互必须进入部署版真实打印/收货结果阶段");
for (const forbiddenPage of ["review-edit", "review-color", "return-review", "capture-failed", "print-retry"]) {
  assert(!appSource.includes(`setScreen("${forbiddenPage}")`), `办公室交互不得导航到自增页面 ${forbiddenPage}`);
}
assert(cssSource.includes(".office-result-banner") && cssSource.includes(".office-result-facts"), "部署版结果阶段缺少统一结果结构样式");

const decisionSummaryRendererSource = appSource.match(/function renderDecisionSummary\([\s\S]*?(?=\nfunction selectedDecision)/)?.[0] || "";
assert(decisionSummaryRendererSource.includes('item.variant === "impact-brief"')
  && decisionSummaryRendererSource.includes("decision-order-heading"), "插单依据必须使用客户、订单对象和影响清单组成的紧凑决策卡");
assert(stylesSource.includes(".decision-summary.is-impact-brief .decision-signals")
  && stylesSource.includes("grid-template-columns: 4.75rem minmax(0, 1fr)"), "插单影响必须按标签和值纵向对齐，不能再使用不完整的 2+1 色块网格");
assert(rushEvidenceScreen?.blocks[0]?.product === crossDeviceOrders.urgentProduction.product
  && JSON.stringify(rushEvidenceScreen?.blocks[0]?.signals) === JSON.stringify([["生产缺口", "还需生产 600 个", "danger"], ["排程影响", "2 个已排任务顺延约半天", "warning"], ["生产条件", "原料、印版、稿件已齐", "success"]]), "插单决策卡必须复用跨端订单身份，并先呈现缺口和排程影响，再补充生产条件");

const serializedFlows = JSON.stringify(flows);
assert(!/客户 [A-D]/u.test(serializedFlows), "手机任务不得再使用客户 A/B/C/D 占位身份");
for (const [roleId, order, screenId] of [
  ["bag", crossDeviceOrders.urgentProduction, "queue"],
  ["silk", crossDeviceOrders.printProduction, "queue"],
  ["packing", crossDeviceOrders.packing, "queue"],
  ["warehouse", crossDeviceOrders.outbound, "visible"],
  ["driver", crossDeviceOrders.outbound, "queue"],
]) {
  const screen = flowMap.get(roleId)?.screens.find((item) => item.id === screenId);
  const serializedScreen = JSON.stringify(screen);
  assert(serializedScreen.includes(order.customer) && serializedScreen.includes(order.product), `${roleId}/${screenId} 必须复用 PC 发布任务的客户与货品身份`);
}
assert(appSource.includes("getBusinessTypeTagValue")
  && appSource.includes("getRequirementTagValue")
  && appSource.includes("getSemanticTagDefinition")
  && appSource.includes("function renderSemanticTags"), "手机任务行必须直接消费共享语义标签契约");

const attachRendererSource = appSource.match(/function renderAttachRolls\([\s\S]*?(?=\nfunction materialRollFacts)/)?.[0] || "";
assert(attachRendererSource.includes('status === "pending" && compact ? ""'), "紧凑贴标清单不得在每卷重复展示章节已经说明的待贴状态");
assert(attachRendererSource.includes('（顺序不限）')
  && attachRendererSource.includes('data-action="confirm-all-attach"')
  && attachRendererSource.includes('${stats.confirmed}/${stats.total}'), "紧凑贴标标题必须合并顺序说明，并在右侧提供动态一键确认进度");
assert(appSource.includes('if (action === "confirm-all-attach")')
  && appSource.includes('getAttachRollStatus(roll, false) === "pending"'), "一键确认必须只处理仍待贴的卷，不能覆盖已隔离卷");
const confirmAllAttachHandler = appSource.match(/if \(action === "confirm-all-attach"\) \{[\s\S]*?\n {2}\}/)?.[0] || "";
assert(!confirmAllAttachHandler.includes("showToast"), "一键确认的完成状态已在页面可见，不得再弹出遮挡卷卡的重复成功提示");
const compactAttachListCss = cssSource.match(/\.attach-ledger\.is-compact \.attach-roll-list\s*\{[\s\S]*?\n\}/)?.[0] || "";
const compactAttachCardCss = cssSource.match(/\.attach-ledger\.is-compact \.attach-roll-card\s*\{[\s\S]*?\n\}/)?.[0] || "";
const compactAttachActionsCss = cssSource.match(/\.attach-ledger\.is-compact \.attach-roll-actions\s*\{[\s\S]*?\n\}/)?.[0] || "";
assert(/gap:\s*var\(--space-2xs\)/.test(compactAttachListCss) && /border:\s*0/.test(compactAttachListCss), "逐卷清单必须用轻量组间距区分 01/02，不能再粘成一个整块边框");
assert(/border:\s*1px solid var\(--color-rule\)/.test(compactAttachCardCss) && /border-radius:\s*var\(--radius-md\)/.test(compactAttachCardCss), "每卷必须使用一致的轻量业务记录边界");
assert(/grid-template-columns:\s*minmax\(0, 2fr\) minmax\(0, 3fr\)/.test(compactAttachActionsCss)
  && /gap:\s*var\(--space-2xs\)/.test(compactAttachActionsCss)
  && /padding:/.test(compactAttachActionsCss), "每卷操作区必须与事实区关联，并用 40/60 主次比例避免两条满宽色块互相粘连");

const captureHomeRendererSource = appSource.match(/function renderOfficeCaptureHome\([\s\S]*?(?=\nfunction officeScreenBlock)/)?.[0] || "";
assert(captureHomeRendererSource.includes('<span class="office-home-resume-copy">')
  && captureHomeRendererSource.includes('<strong>${esc(row.title)}</strong>')
  && captureHomeRendererSource.includes('<small>${esc(row.meta)}</small>'), "未完成卡必须以供应商和卷数组成单行身份");
assert(!captureHomeRendererSource.includes("row.status") && !captureHomeRendererSource.includes('<em class="status'), "未完成卡不得重新渲染重复状态行");
const resumeCardCss = cssSource.match(/\.office-home-resume-card\s*\{[\s\S]*?\n\}/)?.[0] || "";
const resumeCopyCss = cssSource.match(/\.office-home-resume-copy\s*\{[\s\S]*?\n\}/)?.[0] || "";
assert(/min-height:\s*4\.5rem/.test(resumeCardCss), "精简后的未完成卡必须收紧到一行卡片高度");
assert(/display:\s*flex/.test(resumeCopyCss) && /align-items:\s*baseline/.test(resumeCopyCss), "供应商与卷数必须在同一信息行");

assert(appSource.includes('tabindex="0"') && appSource.includes("可上下滚动查看完整页面"), "画板手机框缺少键盘滚动入口");
assert(/\.mobile-surface\.is-board\s*>\s*\.mobile-content[\s\S]*?overflow-y:\s*auto/.test(cssSource), "画板长页面没有内部纵向滚动");
assert(appSource.includes("boardActionOutcomes") && appSource.includes("board-flow-outcome"), "画板没有统一展示提交后去向与后台留痕");
for (const label of ["厂内标准色", "规格 / 宽幅", "本卷重量 kg", "其他字段与 OCR 原文", "isSupplierReturn ? \"件\" : \"卷\""]) {
  assert(appSource.includes(label), `异常行编辑缺少 ${label}`);
}
for (const label of ["卷标只写本卷重量", "不写整单总重", "一张卡固定一卷"]) {
  assert(appSource.includes(label) || JSON.stringify(office).includes(label), `逐卷规则说明缺少 ${label}`);
}
assert(!appSource.includes('field("count", "卷数"'), "异常行编辑不应出现卷数输入；一张卡固定一卷");
assert(!appSource.includes("compactCount") && !appSource.includes("roll.count"), "逐卷卡不应显示冗余的 1 卷或读取行级卷数");
for (const label of ["系统归类", "提手条", "默认 65克 / 固定 5cm宽", "依据：", "65克 · 5cm宽"]) {
  assert(appSource.includes(label), `条类缺项说明缺少 ${label}`);
}
assert(!appSource.includes("规格没看清"), "图谱不应再把厂家未写完整规格误称为 OCR 没看清");
assert(appSource.includes("state.selectedRollIndex = rollIndex")
  && appSource.includes("state.selectedRollIndex = null"), "点击卷料补全/修改后必须只切换 review 页内展开状态");
assert(appSource.includes('roll.index === 9 ? "mismatch" : "confirmed"'), "贴标不符演示必须与部分收货结果一致地指向第 9 卷");
const labelRendererSource = appSource.match(/function renderRawMaterialCode39\([\s\S]*?(?=\nfunction renderFunctionGrid)/)?.[0] || "";
assert(appSource.includes('import { buildRawMaterialCode39Bars } from "../../../src/domain/rawMaterialLabelBarcode.js"'), "手机图谱卷标必须复用系统真实 Code 39 编码器");
assert(labelRendererSource.includes("buildRawMaterialCode39Bars(value)") && labelRendererSource.includes("quietZone = 10"), "卷标条码必须使用真实编码并保留左右静区");
assert(labelRendererSource.includes('class="label-barcode" role="img" aria-label="卷码 ${esc(barcode.normalizedValue)}"')
  && labelRendererSource.includes('class="label-barcode-text"'), "卷标条码必须同时提供可访问名称和可人工输入的卷码");
for (const labelClass of ["label-header", "label-facts", "label-weight", "label-material", "label-barcode-block"]) {
  assert(labelRendererSource.includes(`class="${labelClass}"`), `专业卷标缺少 ${labelClass} 信息层级`);
}
assert(labelRendererSource.includes("view.weight")
  && labelRendererSource.includes("view.color")
  && labelRendererSource.includes("formatRawMaterialSpec(view.spec)")
  && labelRendererSource.includes("view.supplier"), "卷标必须保留本卷重量、颜色、规范规格和供应商");
assert(!labelRendererSource.includes(">原材料卷标<"), "卷标内部不得重复页面已表达的原材料卷标类型");
assert(!appSource.includes("label-qr"), "手机图谱不得继续使用不可扫描的方块伪二维码");
assert(appSource.includes("return board ? reviewedRawMaterialRolls : state.rawDraft.rolls"), "打印页必须读取核对后的逐卷草稿，不能回读手写颜色汇总");
assert(appSource.includes('aria-label="核对完成的送货单卷料"') && appSource.includes("formatRawMaterialSpec(roll.spec)"), "打印页必须逐卷显示送货单颜色、规范规格和本卷重量");
const printReceiptRendererSource = appSource.match(/function renderOfficePrintSuccessReceipt\([\s\S]*?(?=\nfunction renderOfficePrintSuccessBoardState)/)?.[0] || "";
const printSuccessActionSource = appSource.match(/if \(action === "show-print-success"\)[\s\S]*?return;\n {2}\}/)?.[0] || "";
assert(officeScreenMap.has("print-success")
  && appSource.includes('screen.id === "print-success"'), "打印完成必须使用部署版真实 print-success 阶段");
assert(printReceiptRendererSource.includes("office-print-success-mark")
  && printReceiptRendererSource.includes("receipt.title")
  && printReceiptRendererSource.includes("receipt.device")
  && printReceiptRendererSource.includes("receipt.actionLabel"), "打印完成弹窗缺少数量、打印机或开始贴标动作");
assert(!printReceiptRendererSource.includes("renderOfficePrintRollList")
  && !printReceiptRendererSource.includes("jobId")
  && !printReceiptRendererSource.includes("送货单逐卷明细"), "完成弹窗不得重复逐卷明细或审计记录");
assert(printSuccessActionSource.includes('setScreen("print-success")'), "打印成功必须进入部署版 print-success 阶段");
assert(appSource.includes('renderOfficePrintSuccessBoardState(surfaceScreen, board)'), "流程画板必须展示部署版打印完成状态");
assert(cssSource.includes(".office-print-success-board-state")
  && cssSource.includes("z-index: var(--z-modal)"), "画板缺少手机框内的弹窗遮罩层");
const printerRendererSource = appSource.match(/function renderOfficePrinterRow\([\s\S]*?(?=\nfunction renderOfficeQuietList)/)?.[0] || "";
assert(printerRendererSource.includes("office-printer-model") && printerRendererSource.includes("printer.model"), "打印设备主行必须建立型号层级，不能把设备字段平铺成说明句");
assert(printerRendererSource.includes("office-printer-connection") && printerRendererSource.includes("printer.connectionLabel"), "打印设备主行必须使用独立的书面连接状态");
assert(printerRendererSource.includes('action: "device-picker"') && printerRendererSource.includes(">更换</button>"), "打印设备主行必须保留更换入口");
assert(!printerRendererSource.includes("printer.status") && !printerRendererSource.includes("printer.meta") && !printerRendererSource.includes("printer.consumable"), "打印设备主行不得重新混入验收、耗材或重复就绪状态");
assert(/\.office-printer-row\s*\{[\s\S]*?grid-template-columns:\s*2\.5rem minmax\(0, 1fr\) auto/.test(cssSource), "打印设备主行必须沿用小程序的图标、身份状态、更换三列结构");
assert(/\[data-flow="office"\] \.office-label-batch \.label-paper\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/.test(cssSource), "办公室卷标预览必须使用适合线性条码的单列结构");
assert(/\[data-flow="office"\] \.office-label-batch \.label-barcode\s*\{[\s\S]*?width:\s*100%/.test(cssSource), "办公室卷标必须给线性条码完整可扫描宽度");
assert(appSource.includes('"print-success": renderOfficePrintBatch')
  && appSource.includes('"receive-complete": renderOfficeReceiveResult')
  && !appSource.includes('"capture-failed": renderOfficeCaptureFailure'), "办公室真实阶段必须接入部署版渲染器，且不得恢复自增失败页");
assert(appSource.includes("syncExpandedRollDraft(event)"), "异常行输入没有保存到当前草稿，收起后会丢失");
assert(appSource.includes("surface.scrollTop = Math.max")
  && appSource.includes("window.scrollTo({ top: Math.max"), "交互原型没有兼容桌面框与手机整页的自动定位");
assert(appSource.includes('input?.setAttribute("aria-describedby", blocker?.id || "")'), "异常字段的实时校验没有关联说明文字");
assert(!appSource.includes('id="rollDialog"') && !appSource.includes('querySelector("#rollDialog")'), "图谱仍残留旧的单卷弹窗编辑入口");
assert(solutionSource.includes(`${screenCount} 个状态页`), `SOLUTION.md 页面总数未更新为 ${screenCount}`);

if (errors.length) {
  console.error(`手机流程图谱检查失败（${errors.length} 项）：`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`手机流程图谱检查通过：${flows.length} 个岗位，${businessTrackCount} 条独立业务动线，${screenCount} 个状态页。`);
console.log("入口、确认、失败恢复、跨岗回执、结果回跳、后台留痕与画板滚动均已覆盖。");
