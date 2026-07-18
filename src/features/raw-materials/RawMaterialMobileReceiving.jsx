import {
  AppstoreOutlined,
  CameraOutlined,
  CheckCircleOutlined,
  DashboardOutlined,
  FileImageOutlined,
  InboxOutlined,
  PrinterOutlined,
  TagsOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { useState } from "react";
import {
  canConfirmRawMaterialAttachment,
  canPrintRawMaterialLabels,
  canReviewRawMaterialInbound,
  formatRawMaterialDeliveryNoteNo,
} from "../../domain/rawMaterialInboundListState.js";
import { formatRawMaterialWeight } from "./RawMaterialInboundWorkbench.jsx";

const RECEIVING_STEPS = [
  ["拍单", CameraOutlined],
  ["核对", CheckCircleOutlined],
  ["打印", PrinterOutlined],
  ["贴标", TagsOutlined],
];

const MOBILE_VIEWS = [
  ["current", "当前任务", InboxOutlined],
  ["pending", "待处理", UnorderedListOutlined],
  ["all", "全部功能", AppstoreOutlined],
];

export function RawMaterialMobileReceiving({
  attachState,
  deliveryNoteOcrError,
  deliveryNoteOcrLoading,
  deliveryNoteOcrResult,
  onAttach,
  onDeliveryNoteRecognize,
  onOpenReview,
  onNavigate,
  onPrint,
  onSelect,
  printState,
  records = [],
  reviewState,
  selected,
}) {
  const [mobileView, setMobileView] = useState("current");
  const currentStep = getReceivingStep(selected);
  const pendingRecords = records.filter((item) => {
    const step = getReceivingStep(item);
    return step >= 2 && step <= 4;
  });

  function openRecord(record) {
    onSelect?.(record.id);
    setMobileView("current");
  }

  function openFirstAtStep(step) {
    const record = records.find((item) => getReceivingStep(item) === step);
    if (record) openRecord(record);
  }

  return (
    <section className="raw-material-mobile-receiving" aria-label="原材料手机收货">
      <header className="raw-material-mobile-header">
        <div>
          <h1>原材料收货</h1>
        </div>
        <button aria-expanded={mobileView === "all"} onClick={() => setMobileView("all")} type="button">全部功能</button>
      </header>

      {mobileView === "current" ? (
        <>
          <ol className="raw-material-mobile-steps" aria-label="原材料收货进度">
            {RECEIVING_STEPS.map(([label, Icon], index) => {
              const stepNumber = index + 1;
              const state = currentStep > stepNumber ? "done" : currentStep === stepNumber ? "active" : "pending";
              return (
                <li className={state} key={label}>
                  <span><Icon /></span>
                  <small>{label}</small>
                </li>
              );
            })}
          </ol>

          <section className="raw-material-mobile-capture-card">
            <div>
              <strong>{deliveryNoteOcrLoading ? "正在识别送货单" : "拍摄厂家送货单"}</strong>
              <span>纸张放平、完整入镜，尽量避免手指遮挡和反光。</span>
            </div>
            <label className={`raw-material-mobile-camera ${reviewState.disabled || deliveryNoteOcrLoading ? "is-disabled" : ""}`}>
              <CameraOutlined />
              {deliveryNoteOcrLoading ? "识别中，请稍候…" : "打开相机拍送货单"}
              <input accept="image/jpeg,image/png,image/bmp" capture="environment" disabled={reviewState.disabled || deliveryNoteOcrLoading} hidden onChange={onDeliveryNoteRecognize} type="file" />
            </label>
            <label className={`raw-material-mobile-gallery ${reviewState.disabled || deliveryNoteOcrLoading ? "is-disabled" : ""}`}>
              <FileImageOutlined /> 从相册或文件选择
              <input accept="image/png,image/jpeg,image/bmp,application/pdf" disabled={reviewState.disabled || deliveryNoteOcrLoading} hidden onChange={onDeliveryNoteRecognize} type="file" />
            </label>
            {deliveryNoteOcrResult ? <p className="raw-material-mobile-success" role="status">{deliveryNoteOcrResult}</p> : null}
            {deliveryNoteOcrError ? <p className="raw-material-mobile-error" role="alert">{deliveryNoteOcrError}</p> : null}
          </section>

          {selected ? (
            <section className="raw-material-mobile-current-card">
              <div className="raw-material-mobile-current-heading">
                <div><h2>{selected.supplierName || "供应商待核对"}</h2></div>
                <em>{selected.status || "等待处理"}</em>
              </div>
              <dl>
                <div><dt>单号</dt><dd>{formatRawMaterialDeliveryNoteNo(selected)}</dd></div>
                <div><dt>卷 / 重量</dt><dd>{selected.rollCount || selected.rolls?.length || 0} 卷 · {formatRawMaterialWeight(selected)}</dd></div>
                <div><dt>识别结果</dt><dd>{selected.ocrStatus || "等待识别"}</dd></div>
              </dl>
              <MobileNextAction attachState={attachState} currentStep={currentStep} onAttach={onAttach} onOpenReview={onOpenReview} onPrint={onPrint} printState={printState} selected={selected} />
            </section>
          ) : <p className="raw-material-mobile-empty">先拍一张送货单，系统会在这里显示下一步。</p>}

        </>
      ) : null}

      {mobileView === "pending" ? (
        <section className="raw-material-mobile-queue" aria-label="原材料待处理">
          <header><div><h2>未完成收货单</h2></div><strong>{pendingRecords.length}</strong></header>
          {pendingRecords.length ? pendingRecords.map((record) => (
            <button key={record.id} onClick={() => openRecord(record)} type="button">
              <span>{record.supplierName || "供应商待确认"}</span>
              <strong>{formatRawMaterialDeliveryNoteNo(record)}</strong>
              <small>{getReceivingStepLabel(getReceivingStep(record))} · {record.rollCount || record.rolls?.length || 0} 卷 · {formatRawMaterialWeight(record)}</small>
            </button>
          )) : <p>当前没有待核对、待打印或待贴标单据。</p>}
        </section>
      ) : null}

      {mobileView === "all" ? (
        <section className="raw-material-mobile-functions" aria-label="原材料全部功能">
          <header><h2>全部功能</h2></header>
          <div>
            <MobileFunction icon={DashboardOutlined} label="办公室待办" count={null} onClick={() => onNavigate?.("todos")} />
            <MobileFunction icon={CameraOutlined} label="拍送货单" count={null} onClick={() => setMobileView("current")} />
            <MobileFunction icon={CheckCircleOutlined} label="待核对" count={records.filter((item) => getReceivingStep(item) === 2).length} onClick={() => openFirstAtStep(2)} />
            <MobileFunction icon={PrinterOutlined} label="待打印" count={records.filter((item) => getReceivingStep(item) === 3).length} onClick={() => openFirstAtStep(3)} />
            <MobileFunction icon={TagsOutlined} label="待贴标" count={records.filter((item) => getReceivingStep(item) === 4).length} onClick={() => openFirstAtStep(4)} />
          </div>
        </section>
      ) : null}

      <nav className="mobile-role-bottom-nav" aria-label="办公室手机原材料导航">
        {MOBILE_VIEWS.map(([key, label, Icon]) => (
          <button aria-current={mobileView === key ? "page" : undefined} className={mobileView === key ? "active" : ""} key={key} onClick={() => setMobileView(key)} type="button">
            <Icon aria-hidden="true" /><span>{label}</span>
            {key === "pending" && pendingRecords.length ? <b>{pendingRecords.length}</b> : null}
          </button>
        ))}
      </nav>
    </section>
  );
}

function MobileFunction({ count, icon: Icon, label, onClick }) {
  const disabled = count === 0;
  return (
    <button disabled={disabled} onClick={onClick} type="button">
      <Icon aria-hidden="true" /><strong>{label}</strong><span>{count == null ? "立即开始" : `${count} 条`}</span>
    </button>
  );
}

function getReceivingStepLabel(step) {
  return ({ 1: "待拍单", 2: "待核对", 3: "待打印", 4: "待贴标", 5: "已完成" })[step] || "待处理";
}

function MobileNextAction({ attachState, currentStep, onAttach, onOpenReview, onPrint, printState, selected }) {
  if (currentStep === 2) {
    return <button className="raw-material-mobile-next" onClick={onOpenReview} type="button">核对识别结果</button>;
  }
  if (currentStep === 3) {
    return (
      <button className="raw-material-mobile-next" disabled={printState.disabled} onClick={onPrint} type="button">
        <PrinterOutlined /> 打印这一单的卷标
      </button>
    );
  }
  if (currentStep === 4) {
    return <MobileLabelVerification attachState={attachState} key={getPendingLabelRoll(selected)?.id || "no-pending-roll"} onAttach={onAttach} selected={selected} />;
  }
  if (currentStep > 3) {
    return <p className="raw-material-mobile-complete"><CheckCircleOutlined /> 这张单已完成逐卷贴标核对，可以继续拍下一张。</p>;
  }
  return <button className="raw-material-mobile-next" disabled type="button">等待送货单识别</button>;
}

function MobileLabelVerification({ attachState, onAttach, selected }) {
  const roll = getPendingLabelRoll(selected);
  const [matchResult, setMatchResult] = useState("");
  const [checkedWeightKg, setCheckedWeightKg] = useState(roll?.weightKg ?? "");
  const [checkedColor, setCheckedColor] = useState(roll?.factoryColor ?? selected?.factoryColor ?? selected?.supplierColor ?? "");
  const [checkedSpec, setCheckedSpec] = useState(roll?.spec ?? selected?.spec ?? "");
  const [location, setLocation] = useState("原料库-可用区");
  const [verificationNote, setVerificationNote] = useState("");

  if (!roll) return null;
  const mismatch = matchResult === "mismatched";
  return (
    <form
      className="raw-material-mobile-verification"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!matchResult || attachState.disabled) return;
        await onAttach?.({
          rollId: roll.id,
          matchResult,
          checkedWeightKg,
          checkedColor,
          checkedSpec,
          location: mismatch && location === "原料库-可用区" ? "原料隔离区" : location,
          verificationNote,
        });
      }}
    >
      <strong>核对 {roll.id}</strong>
      <span>{roll.supplierRollNo || "供应商卷号待补"} · {roll.weightKg ? `${roll.weightKg}kg` : "重量待补"}</span>
      <label>核对结果
        <select onChange={(event) => setMatchResult(event.target.value)} value={matchResult}>
          <option value="">请选择</option>
          <option value="matched">标签与实物一致</option>
          <option value="mismatched">标签与实物不一致</option>
        </select>
      </label>
      <div className="raw-material-mobile-verification-grid">
        <label>实物重量<input min="0" onChange={(event) => setCheckedWeightKg(event.target.value)} step="0.001" type="number" value={checkedWeightKg} /></label>
        <label>实物颜色<input onChange={(event) => setCheckedColor(event.target.value)} value={checkedColor} /></label>
        <label>实物规格<input onChange={(event) => setCheckedSpec(event.target.value)} value={checkedSpec} /></label>
        <label>库位<input onChange={(event) => setLocation(event.target.value)} value={location} /></label>
      </div>
      <label>说明<textarea onChange={(event) => setVerificationNote(event.target.value)} value={verificationNote} /></label>
      <button className="raw-material-mobile-next" disabled={attachState.disabled || !matchResult} type="submit">
        <TagsOutlined /> 确认本卷核对
      </button>
    </form>
  );
}

function getPendingLabelRoll(selected) {
  return (selected?.rolls ?? []).find(
    (roll) => roll.labelStatus === "已打印待贴标" && roll.inventoryStatus !== "可用",
  );
}

export function getReceivingStep(selected) {
  if (!selected) return 1;
  if (canReviewRawMaterialInbound(selected)) return 2;
  if (canPrintRawMaterialLabels(selected)) return 3;
  if (canConfirmRawMaterialAttachment(selected)) return 4;
  if ((selected.rolls ?? []).some((roll) => roll.labelStatus === "已打印待贴标" && roll.inventoryStatus !== "可用")) return 4;
  if ((selected.rolls ?? []).length && (selected.rolls ?? []).every((roll) => roll.inventoryStatus === "可用")) return 5;
  return 1;
}
