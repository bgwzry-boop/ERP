import {rawMaterialRecordIdentitySuffix} from "../../../shared/rawMaterialRecordIdentity.js";
import {readFiniteRawMaterialNumber} from "../../../shared/rawMaterialNumbers.js";
import {readRawMaterialConsumptionMeasurement} from "../../../shared/rawMaterialConsumptionMeasurement.js";
import {normalizeRawMaterialCostUnit} from "../../../shared/rawMaterialCostUnit.js";
import {readRawMaterialLeftoverReviewWeight} from "../../../shared/rawMaterialLeftoverMeasurement.js";
import {selectUncalibratedRawMaterialConfirmations, matchesRawMaterialLossCalibrationScope} from "../../../shared/rawMaterialLossScope.js";
import {useEffect, useRef, useState} from 'react';
import {readRawMaterialLossMeasurement} from '../../../shared/rawMaterialMeasurements.js';
import '../../styles/features/raw-material-measurement.css';

export function RawMaterialMeasurementDialog({request, actionState, onSubmit, onClose}) {
  const {action, source, options} = request;
  const loss = action === '校准损耗';
  const leftover = action === '复核余料可用';
  const confirmations = selectUncalibratedRawMaterialConfirmations(source.rawMaterialCostAllocationConfirmations, source.rawMaterialCostLossCalibrations);
  const roll = source.rolls?.find(item => item.id === options.rollId);
  const [draft, setDraft] = useState({reviewedWeightKg: '', consumedWeightKg: '', expectedOutputQuantity: '', actualQualifiedOutputQuantity: '', note: ''});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const busyRef = useRef(false);
  const requestKey = useRef(options.idempotencyKey || null);
  const live = useRef(true);
  const dialog = useRef(null);
  const wholePiece = !loss && !leftover && readFiniteRawMaterialNumber(roll?.weightKg) === 0 && normalizeRawMaterialCostUnit(roll?.unit || source.unit) === "件";
  useEffect(() => {
    live.current = true;
    const previous = document.activeElement;
    dialog.current?.showModal?.();
    dialog.current?.querySelector('input, textarea')?.focus();
    return () => { live.current = false; if (previous?.isConnected) previous.focus?.(); };
  }, []);
  function close() { if (!busyRef.current) onClose(); }
  function update(key, value) { if (!busyRef.current) setDraft(current => ({...current, [key]: value})); }
  async function submit(event) {
    event.preventDefault();
    if (busyRef.current || actionState.disabled || !live.current) return;
    let measured;
    try {
      if (!draft.note.trim()) throw new Error('请填写实测依据或报工记录说明。');
      if (loss) {
        if (!confirmations.length) throw new Error('当前没有待校准的成本确认记录，请刷新后核实。');
        measured = readRawMaterialLossMeasurement(draft);
      }
      else if (leftover) {
        if (!roll || roll.inventoryStatus !== '余料待复核') throw new Error('当前卷不是待复核余料，请刷新后核实。');
        measured = {reviewedWeightKg: readRawMaterialLeftoverReviewWeight(draft, Number(roll.leftoverWeightKg) || 0)};
      }
      else if (wholePiece) { readRawMaterialConsumptionMeasurement(roll, {consumedQuantity:1}, source.unit); measured = {consumedQuantity: 1}; }
      else {
        const weight = Number(draft.consumedWeightKg);
        const available = Number(roll.weightKg);
        if (!draft.consumedWeightKg.trim() || !Number.isFinite(weight) || weight <= 0 || weight > available || (options.partialConsumption && weight >= available)) throw new Error(options.partialConsumption ? '部分消耗须大于零且小于当前机边重量。' : '实测消耗须大于零且不超过当前机边重量。');
        measured = {consumedWeightKg: readRawMaterialConsumptionMeasurement(roll, {consumedWeightKg:weight}, source.unit).consumedWeightKg};
      }
    } catch (err) { setError(err.message); return; }
    busyRef.current = true; setBusy(true); setError('');
    try {
      // Keep identity after uncertain failures, even if input is edited. The
      // server replays the original receipt or rejects a changed saved payload.
      requestKey.current ??= `erp-raw-${rawMaterialRecordIdentitySuffix()}`;
      const result = await onSubmit(action, source.id, {...options, ...measured, note: draft.note.trim(), expectedRevision: source.revision, idempotencyKey: requestKey.current});
      const saved = loss
        ? (result?.rawMaterialCostLossCalibrations || []).some(item => item.lossCalibrationId && !(source.rawMaterialCostLossCalibrations || []).some(previous => previous.lossCalibrationId === item.lossCalibrationId) && matchesRawMaterialLossCalibrationScope(item, confirmations) && Number(item.expectedOutputQuantity) === measured.expectedOutputQuantity && Number(item.actualQualifiedOutputQuantity) === measured.actualQualifiedOutputQuantity)
        : leftover
          ? result?.rolls?.some(item => item.id === options.rollId && item.leftoverReviewRecordId && item.leftoverReviewRecordId !== roll?.leftoverReviewRecordId && !(source.rawMaterialLeftoverReviewRecords || []).some(previous => previous.leftoverReviewRecordId === item.leftoverReviewRecordId) && item.inventoryStatus === '可用' && Number(item.weightKg) === measured.reviewedWeightKg && Number(item.leftoverReviewedWeightKg) === measured.reviewedWeightKg)
        : result?.projectionScope === 'stock_only'
          ? result?.rolls?.some(item => item.id === options.rollId && item.consumptionRecordId && item.consumptionRecordId !== roll?.consumptionRecordId && (wholePiece
            ? item.inventoryStatus === '已消耗' && Number(item.lastConsumedQuantity) === 1
            : Number(item.lastConsumedWeightKg) === measured.consumedWeightKg && (Number(roll?.weightKg) > measured.consumedWeightKg
              ? item.inventoryStatus === '机边领用' && Math.abs(Number(item.weightKg) - (Number(roll.weightKg) - measured.consumedWeightKg)) < 0.001
              : item.inventoryStatus === '已消耗' && Number(item.remainingMachineSideWeightKg) === 0)))
          : (result?.rawMaterialConsumptionRecords || []).some(item => item.consumptionRecordId && item.rollId === options.rollId && (wholePiece ? Number(item.consumedQuantity) === 1 : Number(item.consumedWeightKg) === measured.consumedWeightKg) && !(source.rawMaterialConsumptionRecords || []).some(previous => previous.consumptionRecordId === item.consumptionRecordId));
      if (result?.id !== source.id || !saved) throw new Error('未收到本次保存的完整结果。输入已保留，请核实记录后再操作。');
      if (live.current) onClose();
    } catch (err) { if (live.current) setError(err.message || '保存失败，实测输入已保留。'); }
    finally { busyRef.current = false; if (live.current) setBusy(false); }
  }
  return <dialog ref={dialog} className="raw-material-measurement-dialog" aria-labelledby="raw-material-measurement-title" onCancel={event => {event.preventDefault(); close();}}>
    <header><h2 id="raw-material-measurement-title">{loss ? '核对产量与损耗' : leftover ? '余料重新称重复核' : options.partialConsumption ? '登记部分消耗' : '登记实际消耗'}</h2><button type="button" disabled={busy} onClick={close} aria-label="关闭实测核对">关闭</button></header>
    <p>{source.deliveryNoteNo || source.id}{loss ? '' : leftover ? ` · ${roll?.id || '卷料待核实'} · 退回记录 ${Number(roll?.leftoverWeightKg) > 0 ? `${roll.leftoverWeightKg} kg` : '重量未记录'}` : ` · ${roll?.id || '卷料待核实'} · 机边 ${roll?.weightKg || 1}${roll?.weightKg ? ' kg' : source.unit || '件'}`}</p>
    {loss ? <section className="measurement-scope" aria-label="本次校准范围">
      <h3>本次校准范围 · {confirmations.length} 条成本确认</h3>
      <p>以下记录将合并校准，请按同一范围填写产量。</p>
      {confirmations.length ? <ul>{confirmations.map(record => <li key={record.costConfirmationId}>
        <strong>{record.costConfirmationId}</strong>
        <span>生产任务：{record.productionTaskIds?.join('、') || '未记录'}</span>
        <details><summary>查看来源 · {record.consumptionRecordIds?.length || 0} 条消耗记录</summary>
          <span>订单行：{record.orderLineIds?.join('、') || '未记录'}</span>
          <span>消耗记录：{record.consumptionRecordIds?.join('、') || '未记录'}</span>
          <span>原料重量：{record.confirmedWeightKg ?? '未记录'} kg{Number(record.confirmedQuantity) > 0 ? ` · 原料件数：${record.confirmedQuantity}` : ''}</span>
        </details>
      </li>)}</ul> : <p role="alert">没有待校准记录，请刷新核实。</p>}
    </section> : null}
    <form onSubmit={submit}>
      <fieldset disabled={busy || actionState.disabled}>
        {loss ? <><label>预计产量<input autoFocus type="number" min="0" step="any" value={draft.expectedOutputQuantity} onChange={event => update('expectedOutputQuantity', event.target.value)} /></label><label>实际合格产量<input type="number" min="0" step="any" value={draft.actualQualifiedOutputQuantity} onChange={event => update('actualQualifiedOutputQuantity', event.target.value)} /></label><p>损耗按预计产量减实际合格产量计算，最低为零。本次仅更新成本校准记录。</p></> : leftover ? <><label>本次实称余料重量（kg）<input autoFocus type="number" min="0.001" max={Number(roll?.leftoverWeightKg) > 0 ? roll.leftoverWeightKg : undefined} step="0.001" value={draft.reviewedWeightKg} onChange={event => update('reviewedWeightKg', event.target.value)} /></label><p>重新称重并核对本卷标签。保存后转回可用库存；上方退回重量仅供对照。</p></> : wholePiece ? <p>确认当前这一整件已实际消耗；部分件数请走余料退回流程。</p> : <label>本次实测消耗（kg）<input autoFocus type="number" min="0.001" max={roll?.weightKg} step="0.001" value={draft.consumedWeightKg} onChange={event => update('consumedWeightKg', event.target.value)} /></label>}
        <label>{leftover ? '称重与标签核对说明' : '实测依据 / 报工记录说明'}<textarea value={draft.note} onChange={event => update('note', event.target.value)} /></label>
      </fieldset>
      {actionState.disabled ? <p role="alert">{actionState.title || '当前账号不能执行此操作。'}</p> : null}
      {error ? <p className="measurement-error" role="alert">{error}</p> : null}
      <footer><button type="button" disabled={busy} onClick={close}>取消</button><button className="primary-action" type="submit" disabled={busy || actionState.disabled || (loss && !confirmations.length)}>{busy ? '保存中…' : loss ? '确认实测并校准' : leftover ? '确认复核并转回可用' : '确认实测消耗'}</button></footer>
    </form>
  </dialog>;
}


export function useRawMaterialMeasurement({inbounds, selectedId, scope, getUiActionState, onAction}) {
  const [request, setRequest] = useState(null);
  useEffect(() => { setRequest(null); }, [selectedId, scope]);
  function handleMeasuredAction(action, inboundId, options = {}) {
    if (action === "复核余料可用" || action === "余料退回") return null;
    if (!["确认消耗", "校准损耗"].includes(action)) return onAction?.(action, inboundId, options);
    const source = inbounds.find(item => item.id === inboundId);
    if (!source || getUiActionState("rawMaterial", action).disabled) return null;
    setRequest({action, source: structuredClone(source), options: {...options}, scope});
    return null;
  }
  const measurementDialog = request && request.source.id === selectedId && request.scope === scope ? <RawMaterialMeasurementDialog
    key={`${request.source.id}:${request.action}:${request.options.rollId || "loss"}`}
    request={request} actionState={getUiActionState("rawMaterial", request.action)} onSubmit={onAction} onClose={() => setRequest(null)}
  /> : null;
  return {handleMeasuredAction, measurementDialog};
}
