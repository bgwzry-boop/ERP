import {
  AppstoreOutlined,
  BarcodeOutlined,
  CheckCircleOutlined,
  InboxOutlined,
  SearchOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildRawMaterialIssuePurpose,
  listRawMaterialIssueTaskOptions,
  resolveRawMaterialRollScan,
  getRawMaterialScanOutboundBlocker,
  RAW_MATERIAL_ISSUE_PURPOSES,
  RAW_MATERIAL_MACHINE_OPTIONS,
} from "../../domain/rawMaterialScanOutbound.js";
import { getDriverPackageCameraScannerSupport, startDriverPackageCameraScanner } from "../../services/driverPackageCameraScannerClient.js";
import { MobileRoleBottomNavigation } from "../../shared/ui/MobileRoleBottomNavigation.jsx";

const MOBILE_VIEWS = [
  ["current", "当前任务", InboxOutlined],
  ["pending", "待处理", UnorderedListOutlined],
  ["all", "全部功能", AppstoreOutlined],
];

export function RawMaterialScannerPage({ inbounds = [], onAction, helpers = {}, productionState = {} }) {
  const { getUiActionState = () => ({ disabled: false, title: "" }) } = helpers;
  const issueState = getUiActionState("rawMaterial", "扫码出库");
  const scanInputRef = useRef(null);
  const [scanCode, setScanCode] = useState("");
  const [matchedCode, setMatchedCode] = useState("");
  const [machineId, setMachineId] = useState("");
  const [purposeKey, setPurposeKey] = useState("");
  const [productionTaskId, setProductionTaskId] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraMessage, setCameraMessage] = useState("");
  const cameraVideoRef = useRef(null);
  const cameraSessionRef = useRef(null);
  const cameraSupported = useMemo(() => getDriverPackageCameraScannerSupport().supported, []);
  const taskOptions = useMemo(
    () => listRawMaterialIssueTaskOptions(productionState?.productionTasks, machineId),
    [machineId, productionState?.productionTasks],
  );
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [mobileView, setMobileView] = useState("current");
  const scanResolution = useMemo(() => resolveRawMaterialRollScan(inbounds, matchedCode), [inbounds, matchedCode]);
  const match = scanResolution.match;
  const blocker = matchedCode ? getRawMaterialScanOutboundBlocker(match) : "";
  const availableRolls = useMemo(() => inbounds.flatMap((inbound) => (
    (inbound.rolls ?? []).map((roll) => ({ inbound, roll, scanCode: roll.id }))
  )).filter((item) => !getRawMaterialScanOutboundBlocker(item)), [inbounds]);

  useEffect(() => {
    scanInputRef.current?.focus();
    return () => cameraSessionRef.current?.stop?.();
  }, []);

  useEffect(() => {
    if (productionTaskId && !taskOptions.some((option) => option.id === productionTaskId)) setProductionTaskId("");
  }, [productionTaskId, taskOptions]);

  function stopCamera() {
    cameraSessionRef.current?.stop?.();
    cameraSessionRef.current = null;
    setCameraActive(false);
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
    if (!found) {
      setMatchedCode(scanCode);
      return;
    }
    setMatchedCode(found.scanCode);
    setScanCode("");
  }

  async function handleConfirmOutbound() {
    if (!match || blocker || !machineId || !purposeKey || submitting || issueState.disabled) return;
    setSubmitting(true);
    try {
      const result = await onAction?.("扫码出库", match.inbound.id, {
        rollId: match.roll.id,
        machineId,
        productionTaskId,
        issuePurpose: buildRawMaterialIssuePurpose(purposeKey, productionTaskId),
        issuedQuantity: match.roll.weightKg ? undefined : 1,
        note: note || `扫描卷码 ${match.roll.id}，整卷领到 ${machineId} 用于${buildRawMaterialIssuePurpose(purposeKey, productionTaskId)}${productionTaskId ? `，关联生产任务 ${productionTaskId}` : ""}。`,
      });
      if (!result) return;
      setFeedback({
        tone: "success",
        message: `${match.roll.id} 已扫码出库到 ${machineId}。颜色、规格、宽幅和重量已由系统自动留痕，不需要再手抄。`,
      });
      setMatchedCode("");
      setMachineId("");
      setPurposeKey("");
      setProductionTaskId("");
      setNote("");
      requestAnimationFrame(() => scanInputRef.current?.focus());
    } finally {
      setSubmitting(false);
    }
  }

  function openRoll(scanCode) {
    setMatchedCode(scanCode);
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
        <li className={!match ? "active" : "done"}><b>1</b><span>扫描卷码</span></li>
        <li className={match && (!machineId || !purposeKey) ? "active" : match ? "done" : ""}><b>2</b><span>选择机台和用途</span></li>
        <li className={match && machineId && purposeKey ? "active" : ""}><b>3</b><span>确认出库</span></li>
      </ol>

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
      {match ? (
        <section className="raw-material-scan-result">
          <div className="raw-material-scan-result-head">
            <div><span>已识别布卷</span><strong>{match.roll.id}</strong></div>
            <em className={blocker ? "danger" : "success"}>{blocker ? "不可出库" : "可出库"}</em>
          </div>
          <dl>
            <div><dt>颜色</dt><dd>{match.roll.factoryColor || match.inbound.factoryColor || match.inbound.supplierColor || "待补"}</dd></div>
            <div><dt>规格</dt><dd>{match.roll.spec || match.inbound.spec || "待补"}</dd></div>
            <div><dt>宽幅</dt><dd>{match.roll.widthCm || match.inbound.widthCm ? `${match.roll.widthCm || match.inbound.widthCm}cm` : "待补"}</dd></div>
            <div><dt>重量</dt><dd>{match.roll.weightKg ? `${match.roll.weightKg}kg` : match.inbound.unit || "待补"}</dd></div>
            <div><dt>供应商</dt><dd>{match.inbound.supplierName || "待补"}</dd></div>
            <div><dt>入库单</dt><dd>{match.inbound.deliveryNoteNo || match.inbound.id}</dd></div>
          </dl>
          {blocker ? <p className="raw-material-scan-feedback danger">{blocker}</p> : (
            <>
              <label className="raw-material-machine-field">推到哪台机
                <select
                  aria-label="推到哪台机"
                  onChange={(event) => setMachineId(event.target.value)}
                  value={machineId}
                >
                  <option value="">请选择 1号机 到 9号机</option>
                  {RAW_MATERIAL_MACHINE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <fieldset className="raw-material-machine-field raw-material-purpose-field">
                <legend>这卷用来做什么</legend>
                {RAW_MATERIAL_ISSUE_PURPOSES.map((purpose) => (
                  <label key={purpose.key}>
                    <input checked={purposeKey === purpose.key} name="raw-material-issue-purpose" onChange={() => setPurposeKey(purpose.key)} type="radio" value={purpose.key} />
                    {purpose.label}
                  </label>
                ))}
              </fieldset>
              <label className="raw-material-machine-field">关联订单（可选；试用期暂不关联订单也能出库）
                <select aria-label="关联订单" disabled={!taskOptions.length} onChange={(event) => setProductionTaskId(event.target.value)} value={productionTaskId}>
                  <option value="">{taskOptions.length ? "暂不关联" : "这台机暂无进行中的生产任务"}</option>
                  {taskOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              </label>
              <label className="raw-material-machine-field">备注（可不填）
                <textarea onChange={(event) => setNote(event.target.value)} placeholder="有特殊情况再填写" value={note} />
              </label>
              <div className="raw-material-scan-confirmation">
                <strong>确认后会发生什么</strong>
                <span>确认后可用库存减少 1 卷，这卷整卷改为机边，不再计入可用库存；不拆卷。</span>
              </div>
              <button
                className="raw-material-scan-submit"
                disabled={!machineId.trim() || !purposeKey || submitting || issueState.disabled}
                onClick={handleConfirmOutbound}
                title={issueState.title || ""}
                type="button"
              >
                <CheckCircleOutlined /> {submitting ? "正在出库…" : "确认扫码出库"}
              </button>
            </>
          )}
        </section>
      ) : null}

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
            <button onClick={() => setMobileView("current")} type="button"><BarcodeOutlined /><strong>扫码领料</strong><span>立即开始</span></button>
            <button disabled={!availableRolls.length} onClick={() => setMobileView("pending")} type="button"><InboxOutlined /><strong>可用卷料</strong><span>{availableRolls.length} 卷</span></button>
            <button disabled type="button"><UnorderedListOutlined /><strong>领料记录</strong><span>后端记录</span></button>
          </div>
        </section>
      ) : null}

      <MobileRoleBottomNavigation
        ariaLabel="原材料经手人手机导航"
        badgeCount={(key) => key === "pending" ? availableRolls.length : 0}
        items={MOBILE_VIEWS}
        onChange={setMobileView}
        value={mobileView}
      />
    </section>
  );
}
