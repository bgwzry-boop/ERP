import {
  AppstoreOutlined,
  BarcodeOutlined,
  CheckCircleOutlined,
  InboxOutlined,
  SearchOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildRawMaterialIssuePurpose,
  resolveRawMaterialRollScan,
  getRawMaterialScanOutboundBlocker,
  RAW_MATERIAL_ISSUE_PURPOSES,
  RAW_MATERIAL_MACHINE_OPTIONS,
} from "../../domain/rawMaterialScanOutbound.js";
import {
  PRINT_WORKSHOP,
  RAW_MATERIAL_PICK_WORKSHOPS,
  buildRawMaterialPickList,
  checkRollAgainstPickTask,
} from "../../domain/rawMaterialTaskPicking.js";
import { getDriverPackageCameraScannerSupport, startDriverPackageCameraScanner } from "../../services/driverPackageCameraScannerClient.js";
import { listOfficeProductionMachineQueue } from "../../services/officeProductionPackingLazyApi.js";
import { MobileRoleBottomNavigation } from "../../shared/ui/MobileRoleBottomNavigation.jsx";

const MOBILE_VIEWS = [
  ["current", "当前任务", InboxOutlined],
  ["pending", "待处理", UnorderedListOutlined],
  ["all", "全部功能", AppstoreOutlined],
];
const WORKSHOP_STORAGE_KEY = "erp.rawMaterialScanner.workshop";

function readStoredWorkshop() {
  try {
    const value = globalThis.localStorage?.getItem(WORKSHOP_STORAGE_KEY) || "";
    return RAW_MATERIAL_PICK_WORKSHOPS.includes(value) ? value : "";
  } catch {
    return "";
  }
}

function storeWorkshop(value) {
  try {
    globalThis.localStorage?.setItem(WORKSHOP_STORAGE_KEY, value);
  } catch {
    // Remembering the workshop is only a convenience.
  }
}

export function RawMaterialScannerPage({ authState, inbounds = [], onAction, helpers = {} }) {
  const { getUiActionState = () => ({ disabled: false, title: "" }) } = helpers;
  const issueState = getUiActionState("rawMaterial", "扫码出库");
  const scanInputRef = useRef(null);
  const cameraVideoRef = useRef(null);
  const cameraSessionRef = useRef(null);
  const [workshop, setWorkshop] = useState(readStoredWorkshop);
  const [queue, setQueue] = useState({ loading: false, items: [], error: "" });
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [freeMode, setFreeMode] = useState(false);
  const [scanCode, setScanCode] = useState("");
  const [matchedCode, setMatchedCode] = useState("");
  const [freeTarget, setFreeTarget] = useState("");
  const [purposeKey, setPurposeKey] = useState("");
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraMessage, setCameraMessage] = useState("");
  const [mobileView, setMobileView] = useState("current");
  const cameraSupported = useMemo(() => getDriverPackageCameraScannerSupport().supported, []);

  const loadQueue = useCallback(async () => {
    if (!authState) return;
    setQueue((current) => ({ ...current, loading: true, error: "" }));
    const result = await listOfficeProductionMachineQueue({ authState, query: { pageSize: 200 } }, { serverRequired: true });
    setQueue({
      loading: false,
      items: result?.source === "api" ? result.items || [] : [],
      error: result?.source === "api" ? "" : result?.error?.message || "生产任务读取失败。",
    });
  }, [authState]);

  useEffect(() => { loadQueue(); }, [loadQueue]);
  useEffect(() => () => cameraSessionRef.current?.stop?.(), []);

  const pickList = useMemo(() => buildRawMaterialPickList({ queueItems: queue.items, inbounds, workshop }), [inbounds, queue.items, workshop]);
  const selectedTask = pickList.find((task) => task.productionTaskId === selectedTaskId) || null;
  const scanResolution = useMemo(() => resolveRawMaterialRollScan(inbounds, matchedCode), [inbounds, matchedCode]);
  const match = scanResolution.match;
  const blocker = matchedCode ? getRawMaterialScanOutboundBlocker(match) : "";
  const taskCheck = selectedTask && match && !blocker ? checkRollAgainstPickTask(selectedTask, match.roll, match.inbound) : { ok: true, problems: [] };
  const availableRolls = useMemo(() => inbounds.flatMap((inbound) => (
    (inbound.rolls ?? []).map((roll) => ({ inbound, roll, scanCode: roll.id }))
  )).filter((item) => !getRawMaterialScanOutboundBlocker(item)), [inbounds]);
  const scanning = Boolean(selectedTask || freeMode);

  useEffect(() => {
    if (scanning) scanInputRef.current?.focus();
  }, [scanning]);

  function chooseWorkshop(value) {
    setWorkshop(value);
    storeWorkshop(value);
    setSelectedTaskId("");
  }

  function resetScan() {
    setMatchedCode("");
    setScanCode("");
    setFeedback(null);
  }

  function stopCamera() {
    cameraSessionRef.current?.stop?.();
    cameraSessionRef.current = null;
    setCameraActive(false);
  }

  function leaveScan() {
    stopCamera();
    resetScan();
    setSelectedTaskId("");
    setFreeMode(false);
    setFreeTarget("");
    setPurposeKey("");
    setNote("");
  }

  async function startCamera() {
    if (cameraActive) return;
    setFeedback(null);
    setCameraActive(true);
    setCameraMessage("正在打开相机…");
    try {
      cameraSessionRef.current = await startDriverPackageCameraScanner({
        videoElement: cameraVideoRef.current,
        formats: ["qr_code", "code_39", "code_128"],
        onStatus: setCameraMessage,
        onCode: (code) => {
          stopCamera();
          const found = resolveRawMaterialRollScan(inbounds, code).match;
          setMatchedCode(found ? found.scanCode : code);
          setCameraMessage("");
        },
      });
      setCameraMessage("把卷上的二维码对准取景框");
    } catch (error) {
      stopCamera();
      setCameraMessage(error?.message || "相机打不开，请用扫码枪或手动输入卷号。");
    }
  }

  function handleScanSubmit(event) {
    event.preventDefault();
    const found = resolveRawMaterialRollScan(inbounds, scanCode).match;
    setFeedback(null);
    setMatchedCode(found ? found.scanCode : scanCode);
    if (found) setScanCode("");
  }

  const target = selectedTask ? selectedTask.target : freeTarget;
  const purpose = selectedTask
    ? (selectedTask.workshop === PRINT_WORKSHOP ? "印刷（先印后制袋）" : "制袋")
    : buildRawMaterialIssuePurpose(purposeKey, "");
  const canConfirm = Boolean(match && !blocker && taskCheck.ok && target && purpose && !submitting && !issueState.disabled);

  async function handleConfirmOutbound() {
    if (!canConfirm) return;
    setSubmitting(true);
    try {
      const productionTaskId = selectedTask?.productionTaskId || "";
      const result = await onAction?.("扫码出库", match.inbound.id, {
        rollId: match.roll.id,
        machineId: target,
        productionTaskId,
        issuePurpose: purpose,
        issuedQuantity: match.roll.weightKg ? undefined : 1,
        note: note || (productionTaskId
          ? `按任务 ${productionTaskId} 领料：扫描卷码 ${match.roll.id}，整卷领到 ${target}。`
          : `试用期无任务出库：扫描卷码 ${match.roll.id}，整卷领到 ${target}，用于${purpose}；暂不关联订单。`),
      });
      if (!result) return;
      setFeedback({
        tone: "success",
        message: `${match.roll.id} 已出库到 ${target}${productionTaskId ? `，已绑定任务 ${productionTaskId}` : ""}。颜色、规格、宽幅和重量已由系统自动留痕，不需要再手抄。`,
      });
      setMatchedCode("");
      setNote("");
      if (productionTaskId) {
        setSelectedTaskId("");
        loadQueue();
      }
    } finally {
      setSubmitting(false);
    }
  }

  function openRoll(code) {
    setFreeMode(true);
    setMatchedCode(code);
    setFeedback(null);
    setMobileView("current");
  }

  return (
    <section className={`raw-material-scanner-page guided-mobile-page view-${mobileView}`} aria-label="原材料扫码出库">
      <header className="raw-material-scanner-hero">
        <div>
          <h1>扫码出库</h1>
        </div>
        <InboxOutlined aria-hidden="true" />
      </header>

      {mobileView === "current" ? <>
      <ol className="raw-material-scanner-steps" aria-label="扫码出库步骤">
        <li className={!scanning ? "active" : "done"}><b>1</b><span>选择机台和任务</span></li>
        <li className={scanning && !match ? "active" : match ? "done" : ""}><b>2</b><span>扫描卷码</span></li>
        <li className={match ? "active" : ""}><b>3</b><span>确认出库</span></li>
      </ol>

      {!scanning ? (
        <section className="raw-material-pick-tasks" aria-label="待领料任务">
          <div className="raw-material-workshop-tabs" role="tablist" aria-label="我负责的车间">
            {RAW_MATERIAL_PICK_WORKSHOPS.map((value) => (
              <button aria-selected={workshop === value} className={workshop === value ? "active" : ""} key={value} onClick={() => chooseWorkshop(value)} role="tab" type="button">{value}</button>
            ))}
          </div>
          {!workshop ? <p className="raw-material-scan-feedback">先选你负责的车间，系统会记住。</p> : null}
          {queue.loading ? <p role="status">正在读取生产任务…</p> : null}
          {queue.error ? <p className="raw-material-scan-feedback danger">{queue.error}</p> : null}
          {workshop && !queue.loading ? (pickList.length ? pickList.map((task) => (
            <button className="raw-material-pick-task" key={task.productionTaskId} onClick={() => { setSelectedTaskId(task.productionTaskId); resetScan(); }} type="button">
              <span>{task.target} · {task.taskType}</span>
              <strong>需要：{task.requiredWidthCm ? `${task.requiredWidthCm}cm 宽` : "宽幅待确认"} · {task.requiredColor || "颜色待确认"}</strong>
              <small>{task.customerName || "客户待确认"} · {task.size || "尺寸待确认"} · {task.plannedQty ? `${task.plannedQty} 个` : "数量待确认"} · {task.productionTaskId}</small>
            </button>
          )) : <p className="raw-material-scan-feedback">{workshop} 暂时没有要领料的任务。</p>) : null}
          <button className="raw-material-free-mode" onClick={() => { setFreeMode(true); resetScan(); }} type="button">试用期：没有任务，直接出库</button>
          <small className="raw-material-free-mode-note">第一批只上原材料，暂时还没有生产任务时用这个入口；暂不关联订单。正式上线后关闭。</small>
        </section>
      ) : (
        <>
          <div className="raw-material-pick-current">
            {selectedTask ? <div><span>当前任务 · {selectedTask.target}</span><strong>需要：{selectedTask.requiredWidthCm ? `${selectedTask.requiredWidthCm}cm 宽` : "宽幅待确认"} · {selectedTask.requiredColor || "颜色待确认"}</strong><small>{selectedTask.customerName || "客户待确认"} · {selectedTask.size || ""} · {selectedTask.productionTaskId}</small></div>
              : <div><span>试用期无任务出库</span><strong>暂不关联订单</strong></div>}
            <button onClick={leaveScan} type="button">换任务</button>
          </div>

          <form className="raw-material-scan-form" onSubmit={handleScanSubmit}>
            <label htmlFor="raw-material-scan-code">扫描标签上的卷码</label>
            <div>
              <SearchOutlined aria-hidden="true" />
              <input
                autoComplete="off"
                id="raw-material-scan-code"
                onChange={(event) => setScanCode(event.target.value)}
                placeholder="请扫描或输入卷码"
                ref={scanInputRef}
                value={scanCode}
              />
              <button disabled={!scanCode.trim()} type="submit">查找</button>
            </div>
            <small>可以用手机相机扫二维码，也支持扫码枪 / PDA 回车提交或手工输入卷号。</small>
            {cameraSupported ? <button className="raw-material-camera-button" onClick={cameraActive ? stopCamera : startCamera} type="button">{cameraActive ? "关闭相机" : "用相机扫码"}</button> : <small>这台手机的浏览器不支持相机扫码，请用扫码枪或手动输入。</small>}
            <video aria-label="扫码取景框" className="raw-material-camera-preview" hidden={!cameraActive} muted playsInline ref={cameraVideoRef} />
            {cameraMessage ? <small role="status">{cameraMessage}</small> : null}
          </form>

          {matchedCode && !match ? <p className="raw-material-scan-feedback danger">{scanResolution.ambiguous
            ? `卷码“${matchedCode}”对应多卷，请改扫唯一系统卷标或由库房人工核对；核对前不能领料。`
            : `没有找到卷码“${matchedCode}”，请检查标签后重试。`}</p> : null}

          {match && !taskCheck.ok ? (
            <div className="raw-material-mismatch" role="alertdialog" aria-modal="true" aria-labelledby="raw-material-mismatch-title">
              <div>
                <h2 id="raw-material-mismatch-title">这卷布和任务要求不符</h2>
                <ul>{taskCheck.problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>
                <p>请放回这卷，按任务要求重新拿料再扫。</p>
                <button onClick={resetScan} type="button">知道了，换一卷</button>
              </div>
            </div>
          ) : null}

          {match ? (
            <section className="raw-material-scan-result">
              <div className="raw-material-scan-result-head">
                <div><span>已识别布卷</span><strong>{match.roll.id}</strong></div>
                <em className={blocker || !taskCheck.ok ? "danger" : "success"}>{blocker || !taskCheck.ok ? "不可出库" : "可出库"}</em>
              </div>
              <dl>
                <div><dt>颜色</dt><dd>{match.roll.factoryColor || match.inbound.factoryColor || match.inbound.supplierColor || "待补"}</dd></div>
                <div><dt>规格</dt><dd>{match.roll.spec || match.inbound.spec || "待补"}</dd></div>
                <div><dt>宽幅</dt><dd>{match.roll.widthCm || match.inbound.widthCm ? `${match.roll.widthCm || match.inbound.widthCm}cm` : "待补"}</dd></div>
                <div><dt>重量</dt><dd>{match.roll.weightKg ? `${match.roll.weightKg}kg` : match.inbound.unit || "待补"}</dd></div>
                <div><dt>供应商</dt><dd>{match.inbound.supplierName || "待补"}</dd></div>
                <div><dt>入库单</dt><dd>{match.inbound.deliveryNoteNo || match.inbound.id}</dd></div>
              </dl>
              {blocker ? <p className="raw-material-scan-feedback danger">{blocker}</p> : taskCheck.ok ? (
                <>
                  {!selectedTask ? <>
                    <label className="raw-material-machine-field">推到哪台机
                      <select aria-label="推到哪台机" onChange={(event) => setFreeTarget(event.target.value)} value={freeTarget}>
                        <option value="">请选择 1号机 到 9号机或丝印车间</option>
                        {/* 试用期（还没有生产任务）时的无任务出库目标 */}
                        {[...RAW_MATERIAL_MACHINE_OPTIONS, PRINT_WORKSHOP].map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </label>
                    <fieldset className="raw-material-machine-field raw-material-purpose-field">
                      <legend>这卷用来做什么</legend>
                      {RAW_MATERIAL_ISSUE_PURPOSES.map((item) => (
                        <label key={item.key}>
                          <input checked={purposeKey === item.key} name="raw-material-issue-purpose" onChange={() => setPurposeKey(item.key)} type="radio" value={item.key} />
                          {item.label}
                        </label>
                      ))}
                    </fieldset>
                  </> : null}
                  <label className="raw-material-machine-field">备注（可不填）
                    <textarea onChange={(event) => setNote(event.target.value)} placeholder="有特殊情况再填写" value={note} />
                  </label>
                  <div className="raw-material-scan-confirmation">
                    <strong>确认后会发生什么</strong>
                    <span>可用库存减少 1 卷，这卷整卷转到 {target || "所选机台"}，不拆卷{selectedTask ? `，并绑定任务 ${selectedTask.productionTaskId} 和它的订单` : ""}。</span>
                  </div>
                  <button className="raw-material-scan-submit" disabled={!canConfirm} onClick={handleConfirmOutbound} title={issueState.title || ""} type="button">
                    <CheckCircleOutlined /> {submitting ? "正在出库…" : "确认扫码出库"}
                  </button>
                </>
              ) : null}
            </section>
          ) : null}
        </>
      )}

      {feedback ? <p className={`raw-material-scan-feedback ${feedback.tone}`}>{feedback.message}</p> : null}
      </> : null}

      {mobileView === "pending" ? (
        <section className="guided-mobile-queue" aria-label="可领用原材料卷">
          <header><div><h2>可用卷料</h2></div><strong>{availableRolls.length}</strong></header>
          {availableRolls.length ? availableRolls.map((item) => (
            <button key={item.roll.id} onClick={() => openRoll(item.scanCode)} type="button">
              <span>{item.roll.id}</span>
              <strong>{item.roll.factoryColor || item.inbound.factoryColor || item.inbound.supplierColor || "颜色待补"} · {item.roll.spec || item.inbound.spec || "规格待补"}</strong>
              <small>{item.roll.weightKg ? `${item.roll.weightKg}kg` : item.inbound.unit || "数量待补"} · {item.inbound.supplierName || "供应商待补"}</small>
            </button>
          )) : <p>当前没有可领用卷料。</p>}
        </section>
      ) : null}

      {mobileView === "all" ? (
        <section className="guided-mobile-functions" aria-label="原料经手人全部功能">
          <header><h2>全部功能</h2></header>
          <div>
            <button onClick={() => { leaveScan(); setMobileView("current"); }} type="button"><BarcodeOutlined /><strong>按任务领料</strong><span>{pickList.length} 个任务</span></button>
            <button disabled={!availableRolls.length} onClick={() => setMobileView("pending")} type="button"><InboxOutlined /><strong>可用卷料</strong><span>{availableRolls.length} 卷</span></button>
            <button disabled type="button"><UnorderedListOutlined /><strong>领料记录</strong><span>后端记录</span></button>
          </div>
        </section>
      ) : null}

      <MobileRoleBottomNavigation
        ariaLabel="原材料经手人手机导航"
        badgeCount={(key) => key === "current" ? pickList.length : key === "pending" ? availableRolls.length : 0}
        items={MOBILE_VIEWS}
        onChange={setMobileView}
        value={mobileView}
      />
    </section>
  );
}
