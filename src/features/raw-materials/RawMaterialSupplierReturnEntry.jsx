import { useCallback, useEffect, useRef, useState } from "react";
import { getSupplierReturnAccess, supplierReturnShipped, supplierReturnStaged } from "../../../shared/rawMaterialSupplierReturnStock.js";
import { normalizeRawMaterialScanCode } from "../../../shared/rawMaterialRollScanCode.js";
import { createOfficeIdempotencyKey } from "../../services/officeApiClientCore.js";
import { getDriverPackageCameraScannerSupport, startDriverPackageCameraScanner } from "../../services/driverPackageCameraScannerClient.js";
import { updateOfficeRawMaterialInboundAction } from "../../services/officeRawMaterialApiClient.js";
import { listOfficeSupplierReturnStock } from "../../services/officeRawMaterialStockApiClient.js";
import "./raw-material-supplier-return.css";

export function RawMaterialSupplierReturnEntry({ authState, className, onChanged }) {
  const [open, setOpen] = useState(false);
  const access = getSupplierReturnAccess(authState?.permissions);
  const account = authState?.permissions?.user?.userId;
  if (!account || !authState?.session?.accessToken || (!access.canStage && !access.canShip)) return null;
  return <>
    <button className={className} onClick={() => setOpen(true)} type="button">原料退厂</button>
    {open ? <SupplierReturnDialog key={account} authState={authState} access={access} onChanged={onChanged} onClose={() => setOpen(false)} /> : null}
  </>;
}

function SupplierReturnDialog({ authState, access, onChanged, onClose }) {
  const dialog = useRef(null);
  const input = useRef(null);
  const live = useRef(false);
  const readGeneration = useRef(0);
  const writing = useRef(false);
  const [queue, setQueue] = useState(null);
  const [inputCode, setInputCode] = useState("");
  const [matchedCode, setMatchedCode] = useState("");
  const [match, setMatch] = useState(null);
  const [sourceId, setSourceId] = useState("");
  const [checked, setChecked] = useState(false);
  const [pending, setPending] = useState(null);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const operatorId = authState.permissions.user.userId;

  const read = useCallback(async (page = 1, rollCode = "") => {
    const generation = ++readGeneration.current;
    setReading(true);
    setError("");
    const result = await listOfficeSupplierReturnStock({ authState, operatorId, page, rollCode });
    if (!live.current || generation !== readGeneration.current) return;
    setReading(false);
    if (result.source !== "api") {
      setMatch(null);
      setError(result.error.message);
      return;
    }
    setQueue(result);
    if (rollCode) {
      setMatch(result);
      if (!result.matchedRoll) setError(result.ambiguous ? "找到重复卷码，请联系库房核实原标签。" : "没有找到该卷码，请扫描或输入 ERP 卷标上的完整卷码。");
    }
  }, [authState, operatorId]);

  useEffect(() => {
    live.current = true;
    const element = dialog.current;
    const previous = document.activeElement;
    element?.showModal();
    input.current?.focus();
    return () => { live.current = false; readGeneration.current += 1; element?.close(); if (previous?.isConnected) previous.focus?.(); };
  }, []);
  useEffect(() => { void read(); }, [read]);

  function scan(code) {
    const normalized = normalizeRawMaterialScanCode(code);
    if (!normalized || writing.current || pending) return;
    setInputCode(normalized);
    setMatchedCode(normalized);
    setMatch(null);
    setChecked(false);
    setSourceId("");
    setNotice("");
    void read(queue?.page, normalized);
  }

  const roll = match?.matchedRoll;
  const viewedRoll = roll && normalizeRawMaterialScanCode(roll.id) === matchedCode && inputCode === matchedCode ? roll : null;
  const stage = viewedRoll?.status === "可用" && access.canStage && viewedRoll.labelStatus?.includes("已贴标");
  const ship = viewedRoll?.status === supplierReturnStaged && access.canShip && viewedRoll.returnRecord?.id;
  const disabled = reading || busy || Boolean(pending);

  async function submit(request) {
    if (writing.current) return;
    const authorized = request.action === "stage-supplier-return" ? access.canStage : access.canShip;
    if (!authorized) return;
    writing.current = true;
    setBusy(true);
    setError("");
    const result = await updateOfficeRawMaterialInboundAction({ authState, operatorId, ...request });
    writing.current = false;
    if (!live.current) return;
    setBusy(false);
    const expectedStatus = request.action === "stage-supplier-return" ? supplierReturnStaged : supplierReturnShipped;
    const savedRoll = result.inbound?.id === request.inboundId && result.inbound.rolls?.find((entry) => entry.id === request.rollId);
    if (result.source !== "api" || savedRoll?.inventoryStatus !== expectedStatus || !result.operationLogId) {
      const status = result.error?.status;
      const definiteRejection = status >= 400 && status < 500 && status !== 408;
      if (definiteRejection) {
        setPending(null);
        await read(queue?.page, normalizeRawMaterialScanCode(request.rollId));
        if (live.current) setError(result.error?.message || "当前卷料已变化，请重新核对。");
      } else {
        setPending(request);
        setError("暂未收到操作回执。请按原操作重试，或关闭后重新扫描核对状态。");
      }
      return;
    }
    setPending(null);
    setMatch(null);
    setMatchedCode("");
    setInputCode("");
    setSourceId("");
    setChecked(false);
    setNotice(expectedStatus === supplierReturnStaged
      ? `${request.rollId} 已移入退货暂存区。交还供应商时再扫此卷。`
      : `${request.rollId} 已确认退厂。`);
    input.current?.focus();
    void read();
    onChanged?.();
  }

  function write() {
    if (disabled || !checked || !viewedRoll || !Number.isSafeInteger(viewedRoll.revision) || (!ship && !(stage && sourceId))) return;
    if (stage && !match.returnNotes.some((note) => note.id === sourceId)) return;
    void submit({
      inboundId: viewedRoll.inboundId, rollId: viewedRoll.id, expectedRevision: viewedRoll.revision,
      action: stage ? "stage-supplier-return" : "confirm-supplier-return-shipment",
      ...(stage ? { sourceReturnInboundId: sourceId } : { physicalReturnConfirmed: true }),
      idempotencyKey: createOfficeIdempotencyKey(),
    });
  }

  function close() {
    if (!writing.current) onClose();
  }

  return <dialog aria-labelledby="supplier-return-title" className="supplier-return-dialog" onCancel={(event) => { event.preventDefault(); close(); }} ref={dialog}>
    <header><h2 id="supplier-return-title">原料退厂</h2><button disabled={busy} onClick={close} type="button">关闭</button></header>
    <div className="supplier-return-body">
      <p>先扫卷码移入暂存区，实际交还供应商时再扫卷确认退厂。</p>
      <form onSubmit={(event) => { event.preventDefault(); scan(inputCode); }}>
        <label htmlFor="supplier-return-roll-code">实物卷码</label>
        <div className="supplier-return-actions">
          <input autoComplete="off" disabled={disabled} id="supplier-return-roll-code" maxLength={272} onChange={(event) => { setInputCode(event.target.value); setChecked(false); }} ref={input} value={inputCode} />
          <button disabled={disabled || !inputCode.trim()} type="submit">核对卷码</button>
          <ReturnCamera disabled={disabled} onScan={scan} />
        </div>
      </form>
      {reading ? <p role="status">正在读取退厂记录…</p> : null}
      {error ? <p className="supplier-return-error" role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {pending ? <button disabled={busy} onClick={() => void submit(pending)} type="button">按原操作重试</button> : null}
      {viewedRoll ? <section aria-label="当前实物卷" className="supplier-return-current">
        <h3>{viewedRoll.id} · {viewedRoll.status || "状态待确认"}</h3>
        <p>{[viewedRoll.supplierName, viewedRoll.color, viewedRoll.spec, viewedRoll.weightKg > 0 ? `${viewedRoll.weightKg} kg` : viewedRoll.unit].filter(Boolean).join(" · ")}</p>
        {viewedRoll.returnRecord ? <p>关联退货单 {viewedRoll.returnRecord.documentNo || viewedRoll.returnRecord.sourceId}</p> : null}
        {stage ? <label>已复核的供应商退货单
          <select disabled={disabled} onChange={(event) => { setSourceId(event.target.value); setChecked(false); }} value={sourceId}>
            <option value="">{match.returnNotes.length ? "请选择实物对应的退货单" : "该供应商暂无已复核退货单"}</option>
            {match.returnNotes.map((note) => <option key={note.id} value={note.id}>{[note.documentNo || note.id, note.date?.slice(0, 10), note.weightKg > 0 ? `${note.weightKg} kg` : ""].filter(Boolean).join(" · ")}</option>)}
          </select>
        </label> : null}
        {stage || ship ? <>
          <label className="supplier-return-check"><input checked={checked} disabled={disabled || Boolean(stage && !sourceId)} onChange={(event) => setChecked(event.target.checked)} type="checkbox" />
            {stage ? "实物已核对并移到供应商退货暂存区" : "已将该卷实物交还供应商"}
          </label>
          <button className="supplier-return-primary" disabled={disabled || !checked || (stage && !sourceId)} onClick={write} type="button">{stage ? "确认暂存" : "确认退厂"}</button>
        </> : <p>{viewedRoll.status === supplierReturnShipped ? "这卷已经退厂。" : "当前状态或账号权限不允许办理此卷退厂。"}</p>}
      </section> : null}
      <section aria-label="待确认退厂卷">
        <div className="supplier-return-actions"><h3>待确认退厂{queue ? `（${queue.total}）` : ""}</h3><button disabled={disabled} onClick={() => void read(queue?.page, matchedCode)} type="button">刷新</button></div>
        {queue?.items.length ? <ul className="supplier-return-queue">{queue.items.map((item) => <li key={`${item.inboundId}:${item.id}`}>
          <strong>{item.id}</strong><span>{item.supplierName} · {item.returnRecord?.documentNo || item.returnRecord?.sourceId || "关联退货单待核实"}</span>
        </li>)}</ul> : queue ? <p>暂存区没有待退厂的卷料。</p> : null}
        {queue?.total > queue?.pageSize ? <div className="supplier-return-actions">
          <button disabled={disabled || queue.page <= 1} onClick={() => void read(queue.page - 1, matchedCode)} type="button">上一页</button>
          <span>第 {queue.page} 页</span>
          <button disabled={disabled || queue.page * queue.pageSize >= queue.total} onClick={() => void read(queue.page + 1, matchedCode)} type="button">下一页</button>
        </div> : null}
      </section>
    </div>
  </dialog>;
}

function ReturnCamera({ disabled, onScan }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const video = useRef(null);
  const supported = getDriverPackageCameraScannerSupport().supported;
  const onScanRef = useRef(onScan);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);
  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    let camera;
    void startDriverPackageCameraScanner({
      videoElement: video.current,
      onCode: (code) => { if (active) { setOpen(false); onScanRef.current(code); } },
    }).then((session) => { camera = session; if (!active) camera.stop(); }).catch(() => {
      if (active) { setOpen(false); setError("相机无法扫码，请使用扫码枪或输入标签上的完整卷码。"); }
    });
    return () => { active = false; camera?.stop(); };
  }, [open]);
  return <>
    {supported ? <button disabled={disabled} onClick={() => { setError(""); setOpen((current) => !current); }} type="button">{open ? "关闭相机" : "相机扫码"}</button> : null}
    {open ? <video aria-label="卷码扫码预览" autoPlay muted playsInline ref={video} /> : null}
    {error ? <span role="alert">{error}</span> : null}
  </>;
}
