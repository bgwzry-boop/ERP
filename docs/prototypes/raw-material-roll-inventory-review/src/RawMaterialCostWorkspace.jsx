import { useMemo, useRef, useState } from "react";
import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { getUiActionState } from "../../../../src/auth/seedPermissions.js";
import { canReviewRawMaterialInbound, filterRawMaterialInboundsByKeyword } from "../../../../src/domain/rawMaterialInboundListState.js";
import { RawMaterialCostProcessingSections } from "../../../../src/features/raw-materials/RawMaterialInboundSupportingSections.jsx";
import { useInboundPageState } from "../../../../src/features/raw-materials/useInboundPageState.js";
import { DataState, InfoGrid } from "../../../../src/shared/ui/operational.jsx";
import { hasEffectivePermission } from "./navigation.js";
import "../../../../src/styles/shared.css";
import "../../../../src/styles/components.css";
import "./raw-material-cost.css";

function isReviewedDelivery(item) {
  return Boolean(item?.id && item.status && item.status !== "已作废"
    && item.documentDirection !== "supplier_return" && !item.status.includes("退货")
    && !canReviewRawMaterialInbound(item));
}

function money(value) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? `¥${amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "金额待确认";
}

export function RawMaterialCostWorkspace({ formal }) {
  const [keyword, setKeyword] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const permissionContext = formal.permissionContext || {};
  const canViewCost = hasEffectivePermission(permissionContext, "raw_material.cost.view");
  const readError = formal.meta.errors.rawMaterialInbounds || "";
  const inbounds = useMemo(() => canViewCost
    ? formal.data.rawMaterialInbounds.filter(isReviewedDelivery) : [], [canViewCost, formal.data.rawMaterialInbounds]);
  const records = filterRawMaterialInboundsByKeyword(inbounds, keyword);
  const selected = records.find((item) => item.id === selectedId) || records[0] || null;
  const actionState = (surface, action) => getUiActionState(permissionContext, surface, action);

  async function updateInbound(action, inboundId, options) {
    if (pending.current) return null;
    const permission = actionState("rawMaterial", action);
    if (!canViewCost || permission.disabled || readError || !inbounds.some((item) => item.id === inboundId)) {
      setSaveError(readError || permission.title || "当前单据或权限已变化，请刷新后核对。");
      return null;
    }
    pending.current = true;
    setSaving(true);
    setSaveError("");
    try {
      const result = await formal.actions.updateRawMaterialInbound(action, inboundId, options);
      if (result?.source !== "api" || result.inbound?.id !== inboundId) {
        setSaveError(result?.error?.message || "服务器未确认保存，请刷新核对后重试。");
        return null;
      }
      return result.inbound;
    } catch (error) {
      setSaveError(error?.message || "保存失败，请核对网络后重试。");
      return null;
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  const state = useInboundPageState({
    authState: formal.authState,
    currentUser: permissionContext.user,
    helpers: { getUiActionState: actionState, money },
    inbounds,
    authoritativeSelectedId: true,
    onAction: updateInbound,
    productionTasks: formal.data.productionTasks,
    selectedId: selected?.id || "",
    setSelectedId,
  });
  const blocked = (value) => ({ ...value, disabled: value.disabled || saving || Boolean(readError), title: value.title || readError || (saving ? "正在保存，请稍候。" : "") });

  if (!canViewCost) return <DataState title="无权查看原料成本" detail="请联系管理员核对岗位权限。" />;

  return <div className="raw-material-cost-workspace" aria-label="原料成本">
    <section className="raw-material-cost-list" aria-label="成本来源单据">
      <header><h1>原料成本</h1><button disabled={formal.meta.loading || saving} onClick={() => void formal.actions.refreshAll()} type="button"><ReloadOutlined />刷新</button></header>
      <label className="raw-material-cost-search"><SearchOutlined aria-hidden="true" /><span className="sr-only">搜索供应商或单号</span><input onChange={(event) => { setKeyword(event.target.value); setSaveError(""); }} placeholder="搜索供应商 / 单号" value={keyword} /></label>
      {readError ? <p className="raw-material-cost-error" role="alert">{readError}</p> : null}
      <div className="raw-material-cost-records">
        {records.length ? records.map((item) => <button aria-pressed={selected?.id === item.id} className={selected?.id === item.id ? "selected" : ""} key={item.id} onClick={() => { setSelectedId(item.id); setSaveError(""); }} type="button">
          <strong>{item.supplierName || "供应商待确认"}</strong>
          <span>{item.deliveryNoteNo || item.id}</span>
          <small>{item.costAllocationReviewStatus || item.costAllocationStatus || "未生成成本"}</small>
        </button>) : <DataState title={formal.meta.loading ? "正在读取单据" : keyword ? "未找到单据" : "暂无已复核收货单"} detail={keyword ? "请调整搜索内容。" : "完成收货复核后，可在此查看成本进度。"} compact />}
      </div>
    </section>
    <section className="raw-material-cost-detail" aria-label="所选单据成本">
      {selected ? <>
        <header><h2>{selected.supplierName || "供应商待确认"}</h2><p>{selected.deliveryNoteNo || selected.id}</p></header>
        <div className="raw-material-cost-detail-scroll">
          <section className="detail-section"><InfoGrid rows={[
            ["ERP 入库单", selected.id],
            ["送货日期", String(selected.receivedAt || "").slice(0, 10) || "未记录"],
            ["物料", selected.materialType || selected.productName || "未记录"],
            ["消耗确认", `${selected.rawMaterialConsumptionRecords?.length || 0} 条`],
          ]} /></section>
          {saveError ? <p className="raw-material-cost-error" role="alert">{saveError}</p> : null}
          {saving ? <p className="raw-material-cost-saving" role="status">正在保存…</p> : null}
          <RawMaterialCostProcessingSections
            actionStates={{ costDraft: blocked(state.costDraftState), costConfirm: blocked(state.costConfirmState), lossCalibration: blocked(state.lossCalibrationState), marginSnapshot: blocked(state.marginSnapshotState), marginReview: blocked(state.marginReviewState) }}
            canViewCost={state.canViewCost}
            money={money}
            onAction={state.onAction}
            selected={state.selected}
          />
        </div>
      </> : <DataState title="暂无成本详情" detail="选择左侧已复核收货单后查看。" />}
    </section>
    {state.measurementDialog}
  </div>;
}
