import { useInboundPageState } from "../../../../src/features/raw-materials/useInboundPageState.js";
import { InboundDetail } from "../../../../src/features/raw-materials/InboundDetail.jsx";
import { RawMaterialLabelPrintSheet } from "../../../../src/features/raw-materials/RawMaterialLabelPrintSheet.jsx";
import { getUiActionState } from "../../../../src/auth/seedPermissions.js";
import { recognizeOfficeRawMaterialDeliveryNote } from "../../../../src/services/officeRawMaterialApiClient.js";
import { buildReceiptMaterialPresentation } from "./receipt-presentation.js";
import "../../../../src/styles/shared.css";
import "../../../../src/styles/components.css";
import "../../../../src/styles/features/raw-material.css";
import "../../../../src/styles/features/raw-material-roll-inventory.css";
import "../../../../src/styles/features/raw-material-mobile.css";
import "../../../../src/styles/features/raw-material-foundation.css";
import "../../../../src/styles/features/raw-material-print.css";

export function FormalReceivingWorkspace({ formal, selectedId, setSelectedId }) {
  const [saveError, setSaveError] = useState("");
  const user = formal.permissionContext?.user;
  const selected = formal.data.rawMaterialInbounds.find((item) => item.id === selectedId);
  const material = buildReceiptMaterialPresentation(selected);
  async function updateInbound(action, inboundId, options) {
    setSaveError("");
    try {
      const result = await formal.actions.updateRawMaterialInbound(action, inboundId, options);
      if (result?.source !== "api" || !result.inbound?.id) {
        setSaveError(result?.error?.message || "服务器保存失败，请保留当前填写内容后重试。");
        return null;
      }
      return result.inbound;
    } catch (error) {
      setSaveError(error?.message || "服务器保存失败，请保留当前填写内容后重试。");
      return null;
    }
  }
  async function recognizeDeliveryNote(input) {
    const result = await recognizeOfficeRawMaterialDeliveryNote({
      ...input,
      authState: formal.authState,
      operatorId: formal.operatorId,
    }, { serverRequired: true });
    if (result?.source !== "api" || !result.inbound?.id) throw new Error(result?.error?.message || "送货单识别未生成服务器草稿。");
    await formal.actions.refreshAll();
    setSelectedId(result.inbound.id);
    return result.inbound;
  }
  const state = useInboundPageState({
    authState: formal.authState,
    currentUser: user,
    helpers: { getUiActionState: (surface, action) => getUiActionState(formal.permissionContext, surface, action) },
    inbounds: formal.data.rawMaterialInbounds,
    initialDesktopView: "收货录入",
    meta: { source: formal.meta.errors.rawMaterialInbounds ? "api_error" : "api", loading: formal.meta.loading, error: saveError || formal.meta.errors.rawMaterialInbounds || "", lastSyncedAt: formal.meta.lastSyncedAt },
    onAction: updateInbound,
    onDeliveryNoteRecognize: recognizeDeliveryNote,
    productionTasks: formal.data.productionTasks,
    selectedId,
    setSelectedId,
    statementReviews: formal.data.supplierStatementReviews,
  });
  return <div className="formal-receiving-workspace">
    {selected ? <dl className="receipt-facts"><div><dt>类型</dt><dd>{material.materialType}</dd></div><div><dt>宽幅</dt><dd>{material.widthLabel}</dd></div></dl> : null}
    <RawMaterialLabelPrintSheet inbound={state.printSheetInbound} />
    <InboundDetail state={{ ...state, mobileOcrReviewActive: false }} />
  </div>;
}
import { useState } from "react";
