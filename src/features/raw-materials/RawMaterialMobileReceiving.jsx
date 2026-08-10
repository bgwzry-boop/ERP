import {
  ArrowLeftOutlined,
  CameraOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  ExclamationCircleOutlined,
  FileImageOutlined,
  PrinterOutlined,
  TagOutlined,
} from "@ant-design/icons";
import { useMemo, useState } from "react";
import {
  canConfirmRawMaterialAttachment,
  canPrintRawMaterialLabels,
  canReviewRawMaterialInbound,
  formatRawMaterialDeliveryNoteNo,
} from "../../domain/rawMaterialInboundListState.js";
import { formatRawMaterialWeight } from "./RawMaterialInboundWorkbench.jsx";
import { RawMaterialCode39 } from "./RawMaterialLabelPrintSheet.jsx";
import { formatRawMaterialMobileSpec } from "../../../shared/rawMaterialSpec.js";

export const RAW_MATERIAL_RECEIVING_STEPS = [
  ["拍单", CameraOutlined],
  ["核对", CheckCircleOutlined],
  ["打印", PrinterOutlined],
  ["贴标", TagOutlined],
];

const RAW_MATERIAL_RETURN_STEPS = [
  ["拍单", CameraOutlined],
  ["核对", CheckCircleOutlined],
  ["完成", CheckCircleOutlined],
];

export function RawMaterialMobileReceiving({
  attachState,
  deliveryNoteOcrError,
  deliveryNoteOcrLoading,
  deliveryNoteOcrResult,
  mobileMessage,
  mobileStage = "home",
  onAttach,
  onDeliveryNoteRecognize,
  onPrint,
  onStageChange,
  printState,
  printerDeviceQa = {},
  records = [],
  reviewState,
  selected,
}) {
  const pendingRecords = useMemo(
    () => records.filter((item) => {
      const step = getReceivingStep(item);
      return step >= 2 && step <= 4;
    }),
    [records],
  );
  const completedRecords = useMemo(
    () => records.filter((item) => getReceivingStep(item) === 5).slice(0, 2),
    [records],
  );
  const resumableRecord = pendingRecords[0] ?? null;
  const stage = selected || mobileStage === "home" ? mobileStage : "home";
  const isSupplierReturn = selected?.documentDirection === "supplier_return";
  const currentStep = getStageStep(stage);

  function openRecord(record) {
    onStageChange?.(getMobileStageForRecord(record), record.id);
  }

  return (
    <section className={`raw-material-mobile-receiving is-stage-${stage}`} aria-label="原材料手机收货">
      <MobilePageHeader
        onBack={stage === "home" ? null : () => onStageChange?.("home")}
        pendingCount={pendingRecords.length}
        stage={stage}
      />
      <ReceivingProgress currentStep={currentStep} isSupplierReturn={isSupplierReturn} />

      {stage === "home" ? (
        <>
          {resumableRecord ? (
            <section className="raw-material-mobile-resume" aria-label="未完成的原材料收货单">
              <header>
                <h2>继续未完成</h2>
                <span>{pendingRecords.length} 单</span>
              </header>
              <div>
                <article key={resumableRecord.id}>
                  <div>
                    <strong>{resumableRecord.supplierName || "供应商待确认"}</strong>
                    <span>{resumableRecord.rollCount || resumableRecord.rolls?.length || 0} {getRecordUnit(resumableRecord)}</span>
                  </div>
                  <button onClick={() => openRecord(resumableRecord)} type="button">
                    {getRecordActionLabel(resumableRecord)}
                  </button>
                </article>
              </div>
              {pendingRecords.length > 1 ? (
                <details className="raw-material-mobile-resume-more">
                  <summary>其他 {pendingRecords.length - 1} 单</summary>
                  <div>
                    {pendingRecords.slice(1).map((record) => (
                      <button key={record.id} onClick={() => openRecord(record)} type="button">
                        <span><strong>{record.supplierName || "供应商待确认"}</strong><small>{record.rollCount || record.rolls?.length || 0} {getRecordUnit(record)}</small></span>
                        <em>{getRecordActionLabel(record)}</em>
                      </button>
                    ))}
                  </div>
                </details>
              ) : null}
            </section>
          ) : null}

          <CaptureDeliveryNote
            deliveryNoteOcrError={deliveryNoteOcrError}
            deliveryNoteOcrLoading={deliveryNoteOcrLoading}
            deliveryNoteOcrResult={deliveryNoteOcrResult}
            onDeliveryNoteRecognize={onDeliveryNoteRecognize}
            reviewState={reviewState}
          />

          {completedRecords.length ? (
            <section className="raw-material-mobile-recent" aria-label="最近完成的原材料收货单">
              <header><h2>最近完成</h2><span>{completedRecords.length} 条</span></header>
              {completedRecords.map((record) => (
                <button key={record.id} onClick={() => openRecord(record)} type="button">
                  <span>
                    <strong>{record.supplierName || "供应商待确认"}</strong>
                    <small>{record.rollCount || record.rolls?.length || 0} {getRecordUnit(record)} · {formatRawMaterialWeight(record)}</small>
                  </span>
                  <em>{formatCompletionTime(record)}</em>
                </button>
              ))}
            </section>
          ) : null}
        </>
      ) : null}

      {stage === "print" ? (
        <MobilePrintStage
          mobileMessage={mobileMessage}
          onPrint={onPrint}
          printState={printState}
          printerDeviceQa={printerDeviceQa}
          selected={selected}
        />
      ) : null}

      {stage === "print-success" ? (
        <MobilePrintStage
          mobileMessage={mobileMessage}
          onPrint={onPrint}
          onSuccessClose={() => onStageChange?.("print", selected?.id)}
          onSuccessNext={() => onStageChange?.("attach", selected?.id)}
          printState={printState}
          printerDeviceQa={printerDeviceQa}
          selected={selected}
          showSuccess
        />
      ) : null}

      {stage === "print-result" ? (
        <MobilePrintResult
          message={mobileMessage}
          onHome={() => onStageChange?.("home")}
          onNext={() => onStageChange?.("print", selected?.id)}
          printerDeviceQa={printerDeviceQa}
          selected={selected}
        />
      ) : null}

      {stage === "attach" ? (
        <section className="raw-material-mobile-stage-sheet" aria-label="逐卷贴标页面">
          <StageHeading
            badge={`${countResolvedRolls(selected)}/${selected?.rolls?.length || 0}`}
            title="逐卷贴标"
          />
          <MobileLabelVerification attachState={attachState} onAttach={onAttach} selected={selected} />
        </section>
      ) : null}

      {stage === "receive-partial" || stage === "receive-complete" ? (
        <MobileReceiveResult
          onHome={() => onStageChange?.("home")}
          onReview={() => onStageChange?.("attach", selected?.id)}
          partial={stage === "receive-partial"}
          selected={selected}
        />
      ) : null}

      {stage === "return-complete" ? (
        <MobileReturnComplete onHome={() => onStageChange?.("home")} selected={selected} />
      ) : null}
    </section>
  );
}

function MobilePageHeader({ onBack, pendingCount, stage }) {
  return (
    <header className="raw-material-mobile-header">
      {onBack ? (
        <button aria-label="返回录原材料首页" onClick={onBack} type="button">
          <ArrowLeftOutlined aria-hidden="true" />
        </button>
      ) : null}
      <div>
        <h1>录原材料</h1>
      </div>
      {stage === "home" ? (
        <strong>{pendingCount ? `${pendingCount} 单未完成` : "可开始拍单"}</strong>
      ) : (
        <strong>{getStageLabel(stage)}</strong>
      )}
    </header>
  );
}

function CaptureDeliveryNote({
  deliveryNoteOcrError,
  deliveryNoteOcrLoading,
  deliveryNoteOcrResult,
  onDeliveryNoteRecognize,
  reviewState,
}) {
  const disabled = reviewState.disabled || deliveryNoteOcrLoading;
  return (
    <section className="raw-material-mobile-capture-card" aria-label="拍摄厂家送货单">
      <header><h2>录入送货单</h2></header>
      <div className="raw-material-mobile-capture-actions">
        <label className={`raw-material-mobile-camera ${disabled ? "is-disabled" : ""}`}>
          <i><CameraOutlined aria-hidden="true" /></i>
          <span><strong>{deliveryNoteOcrLoading ? "正在识别" : "拍送货单"}</strong><small>打开相机</small></span>
          <input
            accept="image/jpeg,image/png,image/bmp"
            capture="environment"
            disabled={disabled}
            hidden
            onChange={onDeliveryNoteRecognize}
            type="file"
          />
        </label>
        <label className={`raw-material-mobile-gallery ${disabled ? "is-disabled" : ""}`}>
          <i><FileImageOutlined aria-hidden="true" /></i>
          <span><strong>相册 / PDF</strong><small>选择已有文件</small></span>
          <input
            accept="image/png,image/jpeg,image/bmp,application/pdf"
            disabled={disabled}
            hidden
            onChange={onDeliveryNoteRecognize}
            type="file"
          />
        </label>
      </div>
      {deliveryNoteOcrResult ? <p className="raw-material-mobile-success" role="status">{deliveryNoteOcrResult}</p> : null}
      {deliveryNoteOcrError ? (
        <div className="raw-material-mobile-action-message is-danger" role="alert">
          <ExclamationCircleOutlined aria-hidden="true" />
          <div><strong>这张送货单没有识别成功</strong><span>{deliveryNoteOcrError}</span></div>
        </div>
      ) : null}
    </section>
  );
}

function ReceivingProgress({ currentStep, isSupplierReturn = false }) {
  const steps = isSupplierReturn ? RAW_MATERIAL_RETURN_STEPS : RAW_MATERIAL_RECEIVING_STEPS;
  return (
    <ol className={`raw-material-mobile-steps ${isSupplierReturn ? "is-return" : ""}`} aria-label={isSupplierReturn ? "原材料退货进度" : "原材料收货进度"}>
      {steps.map(([label, Icon], index) => {
        const stepNumber = index + 1;
        const state = currentStep > stepNumber ? "done" : currentStep === stepNumber ? "active" : "pending";
        return (
          <li className={state} key={label}>
            <span><Icon aria-hidden="true" /></span>
            <small>{label}</small>
          </li>
        );
      })}
    </ol>
  );
}

function StageHeading({ badge, description, title }) {
  return (
    <header className="raw-material-mobile-stage-heading">
      <div>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {badge ? <em>{badge}</em> : null}
    </header>
  );
}

function MobilePrintStage({
  mobileMessage,
  onPrint,
  onSuccessClose,
  onSuccessNext,
  printState,
  printerDeviceQa,
  selected,
  showSuccess = false,
}) {
  const printer = getMobilePrinter(printerDeviceQa);
  const rolls = selected?.rolls ?? [];
  const pendingRolls = rolls.filter((roll) => (
    roll.inventoryStatus !== "可用" && !String(roll.labelStatus || "").includes("已打印")
  ));
  const displayRolls = pendingRolls.length ? pendingRolls : rolls;
  const previewRoll = displayRolls[0] ?? null;
  const printedCount = (selected?.rolls ?? []).filter((roll) => String(roll.labelStatus || "").includes("已打印")).length
    || selected?.rolls?.length
    || 0;
  return (
    <section className="raw-material-mobile-stage-sheet" aria-label="卷标打印设置">
      <StageHeading
        badge={`${displayRolls.length} 张不同卷标`}
        title="打印卷标"
      />

      <section className="raw-material-mobile-label-preview" aria-label="卷料标签预览">
        <header>{selected?.supplierName || "供应商待确认"}</header>
        <div className="raw-material-mobile-label-facts">
          <span>本卷重量</span>
          <b>{previewRoll?.weightKg ? `${previewRoll.weightKg} kg` : "重量待补"}</b>
          <strong>{getRollColor(previewRoll, selected)}</strong>
          <small>{getRollSpec(previewRoll, selected)}</small>
        </div>
        <div className="raw-material-mobile-barcode-preview"><RawMaterialCode39 value={previewRoll?.id || ""} /></div>
        <footer>{previewRoll?.id || "卷码待生成"}</footer>
      </section>

      <section className="raw-material-mobile-print-list" aria-label="本次不同卷标">
        <header><h3>送货单逐卷明细</h3><span>已核对</span></header>
        {displayRolls.map((roll, index) => (
          <div key={roll.id}>
            <span>第 {index + 1} 卷</span>
            <strong>{getRollColor(roll, selected)} · {getRollSpec(roll, selected)}</strong>
            <small>{roll.weightKg ? `${roll.weightKg} kg` : "重量待补"}</small>
          </div>
        ))}
      </section>

      <MobilePrinterFacts printer={printer} />

      {mobileMessage ? <MobileActionMessage message={mobileMessage} /> : null}
      {!printer.ready ? <p className="raw-material-mobile-stage-note">当前打印机不可用，可更换设备或回办公室电脑打印。</p> : null}
      <button
        className="raw-material-mobile-next"
        disabled={printState.disabled || printerDeviceQa.loading || !printer.ready || pendingRolls.length === 0}
        onClick={onPrint}
        type="button"
      >
        <PrinterOutlined aria-hidden="true" /> {pendingRolls.length ? `打印 ${pendingRolls.length} 张卷标` : "卷标已打印"}
      </button>
      {showSuccess ? (
        <div className="raw-material-mobile-print-success" role="dialog" aria-modal="true" aria-label="打印完成">
          <section>
            <button aria-label="关闭打印完成提示" onClick={onSuccessClose} type="button"><CloseOutlined aria-hidden="true" /></button>
            <CheckCircleOutlined aria-hidden="true" />
            <strong>{printedCount} 张卷标已打印</strong>
            <span>{printer.name}</span>
            <button className="primary" onClick={onSuccessNext} type="button">开始贴标</button>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function MobilePrinterFacts({ printer }) {
  return (
    <section className="raw-material-mobile-printer-facts" aria-label="打印设备">
      <i><PrinterOutlined aria-hidden="true" /></i>
      <div>
        <small>型号</small>
        <strong>{printer.name}</strong>
        <span className={printer.ready ? "is-ready" : ""}>{printer.connection}</span>
      </div>
      <button type="button">更换</button>
    </section>
  );
}

function MobilePrintResult({ message, onHome, onNext, printerDeviceQa, selected, success = false }) {
  const printer = getMobilePrinter(printerDeviceQa);
  const printedRolls = (selected?.rolls ?? []).filter((roll) => (
    roll.inventoryStatus === "可用" || String(roll.labelStatus || "").includes("已打印")
  ));
  const count = printedRolls.length || selected?.rolls?.length || 0;
  return (
    <section className="raw-material-mobile-stage-sheet raw-material-mobile-result-sheet" aria-label={success ? "打印完成" : "打印未确认"}>
      <div className={`raw-material-mobile-result-banner ${success ? "is-success" : "is-warning"}`}>
        {success ? <CheckCircleOutlined aria-hidden="true" /> : <ExclamationCircleOutlined aria-hidden="true" />}
        <div>
          <strong>{success ? `${count} 张不同卷标已确认输出` : "本次打印没有确认成功"}</strong>
          <span>{success ? "每卷只有一张当前有效标签，打印设备和操作人已由后台记录。" : message?.body || "库存状态没有改变，可以检查设备后重试。"}</span>
        </div>
      </div>
      <dl className="raw-material-mobile-result-facts">
        <div><dt>收货单</dt><dd>{formatRawMaterialDeliveryNoteNo(selected)}</dd></div>
        <div><dt>打印机</dt><dd>{printer.name}</dd></div>
        <div><dt>标签数</dt><dd>{count} 张不同卷标</dd></div>
        <div><dt>下一步</dt><dd>{success ? "到实物旁逐卷贴标" : "检查连接后重新打印"}</dd></div>
      </dl>
      <div className="raw-material-mobile-result-actions">
        <button onClick={onHome} type="button">返回首页</button>
        <button onClick={onNext} type="button">{success ? "开始逐卷贴标" : "重新打印"}</button>
      </div>
    </section>
  );
}

function MobileLabelVerification({ attachState, onAttach, selected }) {
  const [location, setLocation] = useState("原料库-待上架区");
  const [mismatchRollId, setMismatchRollId] = useState("");
  const [mismatchDrafts, setMismatchDrafts] = useState({});
  const [submittingRollId, setSubmittingRollId] = useState("");
  const rolls = selected?.rolls ?? [];
  const pendingRolls = rolls.filter((roll) => roll.labelStatus === "已打印待贴标" && roll.inventoryStatus !== "可用");

  async function submitRoll(roll, matchResult, draft = {}) {
    if (!roll || attachState.disabled || submittingRollId) return;
    setSubmittingRollId(roll.id);
    try {
      const updatedInbound = await onAttach?.({
        rollId: roll.id,
        matchResult,
        checkedWeightKg: draft.checkedWeightKg ?? roll.weightKg ?? "",
        checkedColor: draft.checkedColor ?? roll.factoryColor ?? selected?.factoryColor ?? selected?.supplierColor ?? "",
        checkedSpec: draft.checkedSpec ?? roll.spec ?? selected?.spec ?? "",
        location: matchResult === "mismatched" ? "原料隔离区" : location,
        verificationNote: draft.verificationNote ?? "",
      });
      if (!updatedInbound?.id) return;
      setMismatchRollId("");
    } finally {
      setSubmittingRollId("");
    }
  }

  function openMismatch(roll) {
    setMismatchRollId(roll.id);
    setMismatchDrafts((current) => ({
      ...current,
      [roll.id]: current[roll.id] ?? {
        checkedWeightKg: roll.weightKg ?? "",
        checkedColor: roll.factoryColor ?? selected?.factoryColor ?? selected?.supplierColor ?? "",
        checkedSpec: roll.spec ?? selected?.spec ?? "",
        verificationNote: "",
      },
    }));
  }

  function updateMismatch(rollId, key, value) {
    setMismatchDrafts((current) => ({
      ...current,
      [rollId]: { ...(current[rollId] ?? {}), [key]: value },
    }));
  }

  async function submitAllPending() {
    if (attachState.disabled || submittingRollId || pendingRolls.length === 0) return;
    setSubmittingRollId("__all__");
    try {
      for (const roll of pendingRolls) {
        await onAttach?.({
          rollId: roll.id,
          matchResult: "matched",
          checkedWeightKg: roll.weightKg ?? "",
          checkedColor: roll.factoryColor ?? roll.supplierColor ?? selected?.factoryColor ?? selected?.supplierColor ?? "",
          checkedSpec: roll.spec ?? selected?.spec ?? "",
          location,
          verificationNote: "办公室一键确认本单已逐卷贴标。",
        });
      }
    } finally {
      setSubmittingRollId("");
    }
  }

  if (!rolls.length) {
    return <p className="raw-material-mobile-error" role="alert">这张收货单还没有生成卷料明细，暂时不能贴标。</p>;
  }

  return (
    <section className="raw-material-mobile-verification" aria-label="逐卷无序贴标">
      <label className="raw-material-mobile-location">收货位置
        <select onChange={(event) => setLocation(event.target.value)} value={location}>
          <option value="原料库-待上架区">原料库-待上架区</option>
          <option value="原料库-可用区">原料库-可用区</option>
          <option value="原料隔离区">原料隔离区</option>
        </select>
      </label>
      <button
        className="raw-material-mobile-attach-all"
        disabled={attachState.disabled || Boolean(submittingRollId) || pendingRolls.length === 0}
        onClick={submitAllPending}
        type="button"
      >
        <CheckCircleOutlined aria-hidden="true" /> {submittingRollId === "__all__" ? "正在确认…" : `一键确认 ${pendingRolls.length} 卷已贴`}
      </button>
      <div className="raw-material-mobile-roll-list">
        {rolls.map((roll, index) => {
          const completed = roll.inventoryStatus === "可用";
          const mismatch = roll.labelStatus === "标签或实物不符/待确认";
          const pending = roll.labelStatus === "已打印待贴标" && !completed;
          const draft = mismatchDrafts[roll.id] ?? {};
          const editingMismatch = mismatchRollId === roll.id;
          const submitting = submittingRollId === roll.id;
          return (
            <article className={completed ? "is-complete" : mismatch ? "is-blocked" : pending ? "is-pending" : "is-blocked"} key={roll.id}>
              <header>
                <div>
                  <span>第 {index + 1} 卷</span>
                  <strong>{roll.id}</strong>
                </div>
                <em>{completed ? "已确认" : mismatch ? "异常已隔离" : pending ? "待贴标" : roll.labelStatus || "待处理"}</em>
              </header>
              <p>{getRollColor(roll, selected)} · {getRollSpec(roll, selected)} · {roll.weightKg ? `${roll.weightKg} kg` : "重量待补"}</p>
              {mismatch ? <small className="raw-material-mobile-roll-warning">这一卷已隔离，不影响其他正确卷继续入库。</small> : null}
              {!completed && pending ? (
                <div className="raw-material-mobile-roll-actions">
                  <button disabled={attachState.disabled || Boolean(submittingRollId)} onClick={() => submitRoll(roll, "matched")} type="button">
                    <CheckCircleOutlined aria-hidden="true" /> {submitting ? "提交中…" : "确认已贴"}
                  </button>
                  <button disabled={attachState.disabled || Boolean(submittingRollId)} onClick={() => openMismatch(roll)} type="button">
                    <ExclamationCircleOutlined aria-hidden="true" /> 标签/实物不符
                  </button>
                </div>
              ) : null}
              {editingMismatch ? (
                <form onSubmit={(event) => { event.preventDefault(); submitRoll(roll, "mismatched", draft); }}>
                  <p role="alert">只隔离这一卷，其他正确卷可以继续确认。</p>
                  <div>
                    <label>实物重量<input min="0" onChange={(event) => updateMismatch(roll.id, "checkedWeightKg", event.target.value)} step="0.001" type="number" value={draft.checkedWeightKg ?? ""} /></label>
                    <label>实物颜色<input onChange={(event) => updateMismatch(roll.id, "checkedColor", event.target.value)} value={draft.checkedColor ?? ""} /></label>
                    <label>实物规格<input onChange={(event) => updateMismatch(roll.id, "checkedSpec", event.target.value)} value={draft.checkedSpec ?? ""} /></label>
                  </div>
                  <label>不符说明<textarea onChange={(event) => updateMismatch(roll.id, "verificationNote", event.target.value)} placeholder="写清哪里不一致" value={draft.verificationNote ?? ""} /></label>
                  <footer>
                    <button onClick={() => setMismatchRollId("")} type="button">取消</button>
                    <button disabled={!String(draft.verificationNote || "").trim() || Boolean(submittingRollId)} type="submit">确认隔离这卷</button>
                  </footer>
                </form>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function MobileReceiveResult({ onHome, onReview, partial, selected }) {
  const rolls = selected?.rolls ?? [];
  const availableCount = rolls.filter((roll) => roll.inventoryStatus === "可用").length;
  const mismatchCount = rolls.filter((roll) => roll.labelStatus === "标签或实物不符/待确认").length;
  return (
    <section className="raw-material-mobile-stage-sheet raw-material-mobile-result-sheet" aria-label={partial ? "部分卷已入库" : "原材料入库完成"}>
      <div className={`raw-material-mobile-result-banner ${partial ? "is-warning" : "is-success"}`}>
        {partial ? <ExclamationCircleOutlined aria-hidden="true" /> : <CheckCircleOutlined aria-hidden="true" />}
        <div>
          <strong>{partial ? `${availableCount} 卷已入库，${mismatchCount} 卷已隔离` : `${availableCount} 卷全部入库完成`}</strong>
          <span>{partial ? "异常卷单独等待处理，已确认的正确卷可以正常使用。" : "标签、实物、操作人和时间均已由后台留痕。"}</span>
        </div>
      </div>
      <dl className="raw-material-mobile-result-facts">
        <div><dt>供应商</dt><dd>{selected?.supplierName || "供应商待确认"}</dd></div>
        <div><dt>收货单</dt><dd>{formatRawMaterialDeliveryNoteNo(selected)}</dd></div>
        <div><dt>可用库存</dt><dd>{availableCount} 卷</dd></div>
        <div><dt>异常隔离</dt><dd>{mismatchCount} 卷</dd></div>
      </dl>
      <div className="raw-material-mobile-result-actions">
        {partial ? <button onClick={onReview} type="button">查看贴标清单</button> : <span />}
        <button onClick={onHome} type="button">继续拍下一张</button>
      </div>
    </section>
  );
}

function MobileReturnComplete({ onHome, selected }) {
  const itemCount = Number(selected?.rollCount) || selected?.ocrLines?.reduce((total, line) => total + (Number(line?.values?.rollCount) || 0), 0) || 0;
  const totalWeightKg = Number(selected?.totalWeightKg) || 0;
  const amount = Number(selected?.amount) || 0;
  return (
    <section className="raw-material-mobile-stage-sheet raw-material-mobile-result-sheet" aria-label="退货单已复核">
      <div className="raw-material-mobile-result-banner is-success">
        <CheckCircleOutlined aria-hidden="true" />
        <div>
          <strong>退货单已复核</strong>
          <span>本单只保存退货复核和原单证据，不进入原材料入库流程。</span>
        </div>
      </div>
      <dl className="raw-material-mobile-result-facts">
        <div><dt>供应商</dt><dd>{selected?.supplierName || "供应商待确认"}</dd></div>
        <div><dt>退货单</dt><dd>{formatRawMaterialDeliveryNoteNo(selected)}</dd></div>
        <div><dt>退货合计</dt><dd>{itemCount} 件 · {totalWeightKg} kg</dd></div>
        <div><dt>票面金额</dt><dd>{amount}</dd></div>
        <div><dt>后续处理</dt><dd>不生成进货卷码、标签和库存；作为负数厂家对账依据</dd></div>
      </dl>
      <div className="raw-material-mobile-result-actions">
        <span />
        <button onClick={onHome} type="button">继续拍下一张</button>
      </div>
    </section>
  );
}

function MobileActionMessage({ message }) {
  if (!message) return null;
  return (
    <div className={`raw-material-mobile-action-message is-${message.tone || "warning"}`} role={message.tone === "danger" ? "alert" : "status"}>
      <ExclamationCircleOutlined aria-hidden="true" />
      <div><strong>{message.title || "需要处理"}</strong><span>{message.body || ""}</span></div>
    </div>
  );
}

function getMobilePrinter(printerDeviceQa = {}) {
  const selectedDevice = (printerDeviceQa.devices ?? []).find((item) => item.printDeviceId === printerDeviceQa.selectedDeviceId)
    ?? printerDeviceQa.devices?.[0]
    ?? null;
  const accepted = selectedDevice?.latestFieldTestRecord?.summary?.acceptance?.ready === true
    || printerDeviceQa.latestRecord?.summary?.acceptance?.ready === true;
  const mobilePrinterReady = Boolean(selectedDevice && accepted);
  const connectionType = selectedDevice?.connectionType || printerDeviceQa.driverLabel || "";
  const connection = mobilePrinterReady
    ? `${connectionType || "设备"}${String(connectionType).includes("已连接") ? "" : "已连接"}`
    : connectionType || "待读取";
  return {
    connection,
    name: selectedDevice?.name || printerDeviceQa.deviceLabel || "未选择打印机",
    ready: mobilePrinterReady,
    status: printerDeviceQa.loading
      ? "读取中"
      : printerDeviceQa.error
        ? "读取失败"
        : selectedDevice && accepted
          ? "已连接 · 已验收"
          : selectedDevice
            ? "待现场验收"
            : "未选择设备",
  };
}

function getRollColor(roll = {}, selected = {}) {
  return roll.factoryColor || roll.supplierColor || selected.factoryColor || selected.supplierColor || "颜色待补";
}

function getRollSpec(roll = {}, selected = {}) {
  const value = roll.spec || selected.spec || "";
  return formatRawMaterialMobileSpec(value) || "规格待补";
}

function formatCompletionTime(record = {}) {
  const value = String(record.completedAt || record.updatedAt || record.receivedAt || "").trim();
  if (!value) return "已完成";
  const time = value.match(/(?:今天\s*)?(\d{1,2}:\d{2})/u)?.[1];
  return time ? `今天 ${time}` : value.slice(0, 10);
}

function countResolvedRolls(selected = {}) {
  return (selected.rolls ?? []).filter((roll) => (
    roll.inventoryStatus === "可用" || roll.labelStatus === "标签或实物不符/待确认"
  )).length;
}

function getRecordActionLabel(record) {
  const step = getReceivingStep(record);
  if (step === 2) return record?.documentDirection === "supplier_return" ? "核对退货明细" : "核对全部卷材";
  if (step === 3) return "打印卷标";
  if (step === 4) {
    return (record.rolls ?? []).some((roll) => roll.labelStatus === "已打印待贴标")
      ? "继续贴标"
      : "查看隔离卷";
  }
  return "查看";
}

function getRecordUnit(record) {
  return record?.documentDirection === "supplier_return" ? "件" : "卷";
}

function getMobileStageForRecord(record) {
  const step = getReceivingStep(record);
  if (record?.documentDirection === "supplier_return" && step === 5) return "return-complete";
  if (step === 2) return "review";
  if (step === 3) return "print";
  if (step === 4) return "attach";
  if (step === 5) return "receive-complete";
  return "home";
}

function getStageLabel(stage) {
  return {
    attach: "第 4 步",
    print: "第 3 步",
    "print-result": "打印待重试",
    "print-success": "打印完成",
    "receive-complete": "收货完成",
    "receive-partial": "部分完成",
    "return-complete": "退货已复核",
  }[stage] || "处理中";
}

function getStageStep(stage) {
  if (stage === "return-complete") return 3;
  if (stage === "print" || stage === "print-result") return 3;
  if (stage === "print-success" || stage === "attach" || stage === "receive-partial" || stage === "receive-complete") return 4;
  return 1;
}

export function getReceivingStep(selected) {
  if (!selected) return 1;
  if (canReviewRawMaterialInbound(selected)) return 2;
  if (selected.documentDirection === "supplier_return" && selected.status === "退货单已复核") return 5;
  if (canPrintRawMaterialLabels(selected)) return 3;
  if (canConfirmRawMaterialAttachment(selected)) return 4;
  const rolls = selected.rolls ?? [];
  if (rolls.some((roll) => (
    roll.labelStatus === "已打印待贴标"
    || roll.labelStatus === "标签或实物不符/待确认"
    || roll.inventoryStatus === "待确认"
  ))) return 4;
  if (rolls.length && rolls.every((roll) => roll.inventoryStatus === "可用")) return 5;
  return 1;
}
