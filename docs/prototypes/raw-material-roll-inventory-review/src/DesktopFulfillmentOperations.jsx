import { useEffect, useRef, useState } from "react";
import { MixedPackageWorkbench } from "../../../../src/features/packing/MixedPackageWorkbench.jsx";
import { completeOfficePackingTask } from "../../../../src/services/officeProductionPackingApiClient.js";
import { completeOfficeFulfillment, confirmOfficeFulfillmentPickup, getOfficeFulfillmentOperatorCandidates, handoffOfficePaperOutbound, printOfficeFulfillment, recordOfficeWarehouseOutboundExecution, updateOfficeFulfillmentDispatch } from "../../../../src/services/officeFulfillmentApiClient.js";
import { createOfficeIdempotencyKey } from "../../../../src/services/officeApiClientCore.js";
import { isStockOrderType } from "../../../../shared/orderRouting.js";
import { normalizeInventoryHoldTimestamp } from "../../../../shared/inventoryHoldTime.js";
import { toFactoryDatetimeLocal } from "../../../../shared/fulfillmentHandoffTime.js";
import { hasWarehouseExecutionReceipt } from "../../../../shared/warehouseExecutionReceipt.js";
import "./desktop-fulfillment-operations.css";

export function DesktopFulfillmentOperations({ fulfillment, formal }) {
  if (!fulfillment) return null;
  return <FulfillmentOperations key={`${fulfillment.id ?? fulfillment.fulfillmentId}:${formal?.authState?.session?.accessToken ?? formal?.operatorId ?? ""}`} fulfillment={fulfillment} formal={formal} />;
}

const terminalFulfillmentStatuses = ["已取消", "已送达", "已完成", "已提货", "快递已揽收"];
const initialStockStatuses = ["待出库", "待库房备货", "已备货", "待打印标签"];

export function operationsOwnStockPackingEntry(fulfillment, formal) {
  if (!fulfillment) return false;
  const permissions = formal?.permissionContext?.actionPermissions ?? [];
  if (!permissions.includes("packing.complete")) return false;
  const terminal = Boolean(fulfillment.finalDeliveryAt) || terminalFulfillmentStatuses.includes(fulfillment.status);
  if (terminal || fulfillment.physicalOutboundAt) return false;
  const lineId = fulfillment.orderLineId ?? fulfillment.lineId;
  const line = (formal?.data?.orderLines ?? []).find(row => (row.id ?? row.orderLineId) === lineId);
  const orderType = fulfillment.orderType ?? line?.orderType;
  if (!isStockOrderType(orderType)) return false;
  const task = fulfillment.packingTask ?? (formal?.data?.packingTasks ?? []).map(row => row.packingTask ?? row).find(row => (row.orderLineId ?? row.lineId) === lineId);
  const stockPacking = !task && !Number(fulfillment.actualPackageCount || 0) && initialStockStatuses.includes(fulfillment.status);
  return task?.status === "待打包" || stockPacking || Number(fulfillment.actualPackageCount || 0) > 0;
}

export function parseActualPackageQuantities(text) {
  const tokens = String(text ?? "").trim().split(/[\s,，;；]+/).filter(Boolean);
  const quantities = tokens.map(Number);
  if (!tokens.length || tokens.length > 10000 || quantities.some(value => !Number.isSafeInteger(value) || value <= 0)) return null;
  return quantities;
}

function FulfillmentOperations({ fulfillment, formal }) {
  const [notice, setNotice] = useState("");
  const [candidates, setCandidates] = useState({ warehouseExecutors: [], drivers: [], loading: true, error: "" });
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [uncertain, setUncertain] = useState(false);
  const attempt = useRef(null);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [packageText, setPackageText] = useState("");
  const [uniformCount, setUniformCount] = useState("");
  const [uniformQty, setUniformQty] = useState("");
  const [checked, setChecked] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [actualQty, setActualQty] = useState("");
  const [execution, setExecution] = useState("已备货");
  const [channel, setChannel] = useState("当面");
  const [note, setNote] = useState("");
  const [driverId, setDriverId] = useState("");
  const [routeDate, setRouteDate] = useState("");
  const [routeNo, setRouteNo] = useState("");
  const [routeSequence, setRouteSequence] = useState("1");
  const [actualHandoffLocal, setActualHandoffLocal] = useState("");
  const [stockPackagesOpen, setStockPackagesOpen] = useState(false);
  const [customPackagesOpen, setCustomPackagesOpen] = useState(false);
  const permissions = formal?.permissionContext?.actionPermissions ?? [];
  const can = key => permissions.includes(key);
  const common = { authState: formal?.authState, operatorId: formal?.operatorId, fulfillment };
  const terminal = Boolean(fulfillment.finalDeliveryAt) || terminalFulfillmentStatuses.includes(fulfillment.status);
  const lineId = fulfillment.orderLineId ?? fulfillment.lineId;
  const line = (formal?.data?.orderLines ?? []).find(row => (row.id ?? row.orderLineId) === lineId);
  const task = fulfillment.packingTask ?? (formal?.data?.packingTasks ?? []).map(row => row.packingTask ?? row).find(row => (row.orderLineId ?? row.lineId) === lineId);
  const paper = fulfillment.paperOutboundDocument;
  const employees = candidates.warehouseExecutors;
  const drivers = candidates.drivers;
  const canReadCandidates = can("fulfillment.warehouse.execute") || can("fulfillment.dispatch.update");
  useEffect(() => {
    if (!canReadCandidates) return;
    let active = true;
    const controller = new AbortController();
    getOfficeFulfillmentOperatorCandidates({authState: formal?.authState, operatorId: formal?.operatorId}, { serverRequired: true, signal: controller.signal }).then(result => {
      if (!active) return;
      setCandidates(result.source === "api" && !result.error ? { warehouseExecutors: result.warehouseExecutors, drivers: result.drivers, loading: false, error: "" } : { warehouseExecutors: [], drivers: [], loading: false, error: "办理人员读取失败，请刷新重试。" });
    });
    return () => { active = false; controller.abort(); };
  }, [canReadCandidates, formal?.authState, formal?.operatorId]);
  const expected = Number(fulfillment.qty ?? fulfillment.expectedQty ?? 0);
  const method = fulfillment.method ?? fulfillment.fulfillmentMethod;
  const packages = parseActualPackageQuantities(packageText);
  const packTotal = packages?.reduce((sum, qty) => sum + qty, 0) ?? 0;
  const orderType = fulfillment.orderType ?? line?.orderType;
  const stockOrder = isStockOrderType(orderType);
  const stockPacking = !task && stockOrder && !fulfillment.actualPackageCount && initialStockStatuses.includes(fulfillment.status);
  const canPack = !terminal && !fulfillment.physicalOutboundAt && (task?.status === "待打包" || stockPacking);
  const showStockPackages = operationsOwnStockPackingEntry(fulfillment, formal);
  const showCustomPackages = canPack && can("packing.complete") && !stockOrder;
  const warehouseResult = paper?.status === "已交库房" ? execution : "已备货";
  const locked = busy || uncertain || Boolean(confirmation);

  function prepare(label, execute, payload, summary) {
    if (pending.current || uncertain) return;
    setNotice("");
    setConfirmation({ label, execute, payload: structuredClone(payload), summary });
  }
  async function commit(retry = false) {
    const current = retry ? attempt.current : confirmation && { ...confirmation, payload: { ...confirmation.payload, idempotencyKey: createOfficeIdempotencyKey() } };
    if (!current || pending.current) return;
    pending.current = true;
    attempt.current = current;
    setBusy(true);
    try {
      const result = await current.execute(current.payload, { serverRequired: true });
      if (!mounted.current) return;
      if (result.source !== "api" || result.blocked || result.error || !hasCompleteFulfillmentReceipt(current, result)) {
        const unknown = !result.error?.status || result.error.status >= 500;
        setUncertain(unknown);
        setNotice(unknown ? "网络未确认结果，请保持当前内容并重试本次操作。" : result.error?.message || "未保存，请核对后再提交。");
        if (!unknown) { attempt.current = null; setConfirmation(null); }
        return;
      }
      attempt.current = null;
      setConfirmation(null);
      setUncertain(false);
      setChecked(false);
      setNotice(current.label === "创建出库单打印任务" ? "打印任务已创建。请在打印中心完成实际打印，再交库房。" : `${current.label}已保存。`);
      await formal.actions.refreshAll();
    } catch {
      if (!mounted.current) return;
      if (!attempt.current) { setNotice("已保存，但列表刷新未完成，请刷新页面核对最新记录。"); return; }
      setUncertain(true);
      setNotice("结果尚未确认，请重试本次操作；系统会使用同一提交编号核对，避免重复登记。");
    } finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  const ask = (label, execute, payload, summary) => prepare(label, execute, { ...common, ...payload }, summary);
  function fillUniform() {
    const count = Number(uniformCount), qty = Number(uniformQty);
    if (!Number.isSafeInteger(count) || count < 1 || count > 10000 || !Number.isSafeInteger(qty) || qty < 1) return setNotice("实际包数和每包数量都要填写正整数。");
    setPackageText(Array(count).fill(qty).join("\n")); setChecked(false);
  }

  return <section className="business-detail-section desktop-fulfillment-operations" aria-label="出库办理">
    {candidates.error && <p role="alert">{candidates.error}</p>}
    {notice && <p className="fulfillment-operation-notice" role="status">{notice}</p>}
    {!terminal && showStockPackages ? <div className="fulfillment-package-entry">
      <button type="button" className="primary" aria-expanded={stockPackagesOpen} onClick={() => setStockPackagesOpen(value => !value)}>{stockPackagesOpen ? "收起实物包裹" : "登记 / 更正实物包裹"}</button>
      <div hidden={!stockPackagesOpen}>
        <details className="fulfillment-note"><summary>混装规则</summary><p>通货可混装，含不足约 1000、来厂自提。逐项登记，并核对包内合计。</p><p>同一订单可混装尺寸和颜色。每个实物包只有一个包码，逐项核实后再打印贴牌。</p></details>
        <MixedPackageWorkbench collapseIntro authState={formal?.authState} fulfillmentId={fulfillment.id ?? fulfillment.fulfillmentId} orderLineId={lineId} onSaved={() => formal?.actions?.refreshAll?.()} onBusyChange={setBusy} />
      </div>
    </div> : null}
    {!terminal && showCustomPackages ? <div className="fulfillment-package-entry">
      <button type="button" className="primary" aria-expanded={customPackagesOpen} onClick={() => setCustomPackagesOpen(value => !value)}>{customPackagesOpen ? "收起本明细包裹" : "登记本明细包裹"}</button>
      <div hidden={!customPackagesOpen}>
      <details className="fulfillment-note"><summary>打包说明</summary><p>本次应交 {expected.toLocaleString()} 个。先按实物核对，再登记每包数量。</p><p>定制单不混装，只登记本明细的独立包裹。</p></details>
      <fieldset disabled={locked}>
        <legend>登记实际包裹</legend>
        <div className="fulfillment-operation-grid"><label>实际包数<input type="number" min="1" step="1" value={uniformCount} onChange={event => setUniformCount(event.target.value)} /></label><label>每包数量<input type="number" min="1" step="1" value={uniformQty} onChange={event => setUniformQty(event.target.value)} /></label></div>
        <button type="button" onClick={fillUniform}>填入逐包明细</button>
        <label>逐包数量（每行一包，可修改）<textarea rows="4" value={packageText} onChange={event => { setPackageText(event.target.value); setChecked(false); }} placeholder={"例如：\n1000\n1000"} /></label>
        <p>{packages ? `${packages.length} 包，合计 ${packTotal.toLocaleString()} 个` : "请填入实际每包数量"}{packages && packTotal !== expected ? "；与应交数量有差异，保存后需继续核对差异。" : ""}</p>
        <label className="fulfillment-operation-check"><input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} />已按实物核对每包内容、数量及挂牌对应关系</label>
        <button type="button" className="primary" disabled={!packages || !checked} onClick={() => ask("登记实际包裹", completeOfficePackingTask, { packingTaskId: task?.packingTaskId ?? task?.id ?? `PKT-F-${fulfillment.id}`, orderLineId: lineId, fulfillmentId: fulfillment.id, actualPackedQty: packTotal, packageCount: packages.length, packages: packages.map(packedQty => ({ packedQty })) }, `${packages.length} 个独立包裹，合计 ${packTotal} 个；保存后按包裹码打印挂牌。`)}>核对并登记包裹</button>
      </fieldset>
      </div>
    </div> : null}
    <h3>出库办理</h3>
    {terminal ? <p>本次交付已结束，保留现有出库与签收记录供核对。</p> : <>
      {task?.status === "已完成" && <p>实包已登记：{fulfillment.actualPackageCount ?? task.packageCount ?? "请在打包明细核对"}。如需改变数量或重打挂牌，请先处理包裹更正，不能重复完成打包。</p>}
      {can("fulfillment.print") && !fulfillment.physicalOutboundAt && <fieldset disabled={locked}><legend>纸质出库单</legend><p>当前：{paper?.status || "尚未创建纸单"}。</p><details className="fulfillment-note"><summary>打印说明</summary><p>出库纸单与包裹挂牌分别打印。</p></details><button type="button" onClick={() => ask("创建出库单打印任务", printOfficeFulfillment, { action: "打印出库单", printAction: "first_print" }, "创建待实际打印的出库单任务；打印完成后才能交库房。")}>创建打印任务</button></fieldset>}
      {can("fulfillment.paper.handoff") && ["已打印", "已重打"].includes(paper?.status) && <fieldset disabled={locked}><legend>交库房</legend><button type="button" onClick={() => ask("纸单交库房", handoffOfficePaperOutbound, { paperOutboundDocument: paper, note }, `确认第 ${paper.documentVersion} 版出库纸单已交到库房。`)}>确认纸单已交库房</button></fieldset>}
      {can("fulfillment.warehouse.execute") && (fulfillment.warehouseTaskVisible || paper?.status === "已交库房") && !fulfillment.physicalOutboundAt && <fieldset disabled={locked}>
        <legend>库房实际执行</legend>
        <label>执行人<select value={employeeId} onChange={event => setEmployeeId(event.target.value)}><option value="">选择实际执行人</option>{employees.map(row => <option key={row.employeeId} value={row.employeeId}>{row.name}</option>)}</select></label>
        {!employees.length && <p>{candidates.loading ? "正在读取在岗员工…" : "暂无可选在岗员工，请先核对员工档案。"}</p>}
        <div className="fulfillment-operation-grid"><label>执行结果<select value={paper?.status === "已交库房" ? warehouseResult : "已备货"} onChange={event => setExecution(event.target.value)}>{(paper?.status === "已交库房" ? ["已备货", "实物已出库", "数量不符", "无法出库"] : ["已备货"]).map(value => <option key={value}>{value}</option>)}</select></label><label>反馈方式<select value={channel} onChange={event => setChannel(event.target.value)}>{["当面", "电话", "微信", "纸面", "其他"].map(value => <option key={value}>{value}</option>)}</select></label></div>
        {warehouseResult !== "已备货" && <label>实际数量<input type="number" min="0" step="1" value={actualQty} onChange={event => setActualQty(event.target.value)} /></label>}
        <label>说明<textarea rows="2" value={note} onChange={event => setNote(event.target.value)} placeholder="差异、无法出库或需要交接的事项" /></label>
        <button type="button" className="primary" disabled={!employeeId || (warehouseResult !== "已备货" && (actualQty === "" || !Number.isSafeInteger(Number(actualQty)) || Number(actualQty) < 0)) || (["数量不符", "无法出库"].includes(warehouseResult) && !note.trim())} onClick={() => ask("登记库房执行", recordOfficeWarehouseOutboundExecution, { paperOutboundDocument: paper, result: warehouseResult, actualQty: warehouseResult === "已备货" ? undefined : Number(actualQty), physicalExecutorEmployeeId: employeeId, feedbackChannel: channel, executedAt: new Date().toISOString(), note }, `${employees.find(row => row.employeeId === employeeId)?.name}：${warehouseResult}${warehouseResult === "已备货" ? "" : ` ${actualQty} 个`}。实物出库将由系统按记录更新库存。`)}>核对执行结果</button>
      </fieldset>}
      {method === "送货" && can("fulfillment.dispatch.update") && <fieldset disabled={locked}>
        <legend>安排送货</legend><details className="fulfillment-note"><summary>送货说明</summary><p>司机在手机逐包扫码装车，并上传送货照片、签字照片或未签原因。</p></details>
        <label>司机<select value={driverId} onChange={event => setDriverId(event.target.value)}><option value="">选择已启用司机账号</option>{drivers.map(row => <option key={row.userId} value={row.userId}>{row.name}</option>)}</select></label>
        {!drivers.length && <p>{candidates.loading ? "正在读取可派单司机…" : "没有已启用的司机账号，请先由管理员核对司机岗位和账号。"}</p>}
        <div className="fulfillment-operation-grid"><label>送货日期<input type="date" value={routeDate} onChange={event => setRouteDate(event.target.value)} /></label><label>车次<input value={routeNo} onChange={event => setRouteNo(event.target.value)} placeholder="填写实际车次" /></label><label>本车顺序<input type="number" min="1" step="1" value={routeSequence} onChange={event => setRouteSequence(event.target.value)} /></label></div>
        <button type="button" disabled={!driverId || !routeDate || !routeNo.trim() || !Number.isSafeInteger(Number(routeSequence)) || Number(routeSequence) < 1} onClick={() => ask("安排送货", updateOfficeFulfillmentDispatch, { driverId, routeDate, routeNo: routeNo.trim(), routeSequence: Number(routeSequence), remark: note }, `${drivers.find(row => row.userId === driverId)?.name}，${routeDate}，车次 ${routeNo}，顺序 ${routeSequence}。`)}>核对并派单</button>
      </fieldset>}
      {fulfillment.physicalOutboundAt && method === "自提" && can("fulfillment.complete") && <button type="button" className="primary" disabled={locked} onClick={() => ask("确认客户自提", completeOfficeFulfillment, { confirmedFinalDelivery: true, actualQty: fulfillment.actualQty ?? expected, remark: note }, "确认客户已实际提走本次货物，完成最终交付。")}>核对客户提货</button>}
      {fulfillment.physicalOutboundAt && ["快递", "物流", "快递快运"].includes(method) && can("fulfillment.pickup.confirm") && <fieldset disabled={locked}>
        <legend>核对快递揽收</legend>
        <label>实际拉走时间（北京时间）<input type="datetime-local" step="1" value={actualHandoffLocal} min={toFactoryDatetimeLocal(fulfillment.physicalOutboundAt)} max={toFactoryDatetimeLocal(new Date().toISOString())} onChange={event => setActualHandoffLocal(event.target.value)} /></label>
        <details className="fulfillment-note"><summary>对账时间说明</summary><p>按实际拉走日期进入对账，系统另外记录本次确认时间；放入待提货区不代表已拉走。</p></details>
        <button type="button" className="primary" disabled={!actualHandoffLocal} onClick={() => {
          const actualHandoffAt = normalizeInventoryHoldTimestamp(actualHandoffLocal);
          if (!actualHandoffAt || Date.parse(actualHandoffAt) < Date.parse(fulfillment.physicalOutboundAt) || Date.parse(actualHandoffAt) > Date.now()) return setNotice("请核对实际拉走时间，不能早于实物出库或晚于现在。");
          ask("确认快递揽收", confirmOfficeFulfillmentPickup, { confirmedFinalDelivery: true, actualHandoffAt, remark: note }, `确认承运方已实际接收本次货物。实际拉走：${actualHandoffLocal.replace("T", " ")}（北京时间）；另记本次确认时间。`);
        }}>核对快递揽收</button>
      </fieldset>}
      {!permissions.some(key => ["packing.complete", "fulfillment.print", "fulfillment.warehouse.execute", "fulfillment.dispatch.update", "fulfillment.complete", "fulfillment.pickup.confirm"].includes(key)) && <p>当前账号仅可查看，请由对应岗位办理。</p>}
    </>}
    {confirmation && <div className="fulfillment-operation-confirm" role="group" aria-label="提交前核对"><strong>{confirmation.label}</strong><p>{confirmation.summary}</p><div><button type="button" disabled={busy || uncertain} onClick={() => setConfirmation(null)}>返回修改</button><button type="button" className="primary" disabled={busy} onClick={() => commit(uncertain)}>{busy ? "正在保存…" : uncertain ? "重试本次操作" : "确认提交"}</button></div></div>}
  </section>;
}

export function hasCompleteFulfillmentReceipt(attempt, result) {
  if (!result?.operationLogId) return false;
  const input = attempt.payload;
  if (attempt.execute === completeOfficePackingTask) return result.packingTaskId === input.packingTaskId && result.fulfillmentId === input.fulfillmentId && result.orderLineId === input.orderLineId && Array.isArray(result.packageIds) && result.packageIds.length === input.packageCount && result.packageIds.every(id => typeof id === "string" && id.length > 0) && new Set(result.packageIds).size === result.packageIds.length;
  if (result.fulfillmentId !== input.fulfillment?.id) return false;
  if (attempt.execute === printOfficeFulfillment) return Boolean((result.printJobId ?? result.printJob?.printJobId) && (result.printRecord?.printRecordId ?? result.printRecord?.id));
  if (attempt.execute === handoffOfficePaperOutbound) return (result.paperOutboundDocument?.paperOutboundDocumentId ?? result.paperOutboundDocument?.id) === (input.paperOutboundDocument?.paperOutboundDocumentId ?? input.paperOutboundDocument?.id);
  if (attempt.execute === recordOfficeWarehouseOutboundExecution) return hasWarehouseExecutionReceipt(result, input);
  if (attempt.execute === updateOfficeFulfillmentDispatch) return result.dispatch?.driverId === input.driverId;
  return Boolean(result.status);
}
