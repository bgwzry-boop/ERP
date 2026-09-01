import "../../styles/features/print-documents.css";
import "../../styles/features/raw-material.css";
import "../../styles/features/raw-material-color-mapping.css";
import { RawMaterialInboundPage } from "../../features/raw-materials/RawMaterialInboundPage.jsx";
import { RawMaterialScannerPage } from "../../features/raw-materials/RawMaterialScannerPage.jsx";

/** Keeps the raw-material feature code and styles out of the initial desktop shell. */
export function RawMaterialRoute({ view = "inbound", state = {}, actions = {}, firstReleaseMode = false }) {
  if (view === "scanner") {
    return (
      <RawMaterialScannerPage
        helpers={state.helpers}
        inbounds={state.inbounds}
        onAction={actions.onAction}
        productionState={state.productionState}
      />
    );
  }
  return (
    <RawMaterialInboundPage
      authState={state.authState}
      currentUser={state.currentUser}
      firstReleaseMode={firstReleaseMode}
      helpers={state.helpers}
      inbounds={state.inbounds}
      meta={state.meta}
      onAction={actions.onAction}
      onDeliveryNoteRecognize={actions.onDeliveryNoteRecognize}
      onPayableDraftGenerate={actions.onPayableDraftGenerate}
      onPaymentConfirm={actions.onPaymentConfirm}
      onStatementConfirm={actions.onStatementConfirm}
      onStatementReviewConfirm={actions.onStatementReviewConfirm}
      onStatementReviewDraftCreate={actions.onStatementReviewDraftCreate}
      printerDeviceQa={state.printerDeviceQa}
      productionTasks={state.productionTasks}
      selectedId={state.selectedId}
      setSelectedId={actions.setSelectedId}
      statementReviewMeta={state.statementReviewMeta}
      statementReviews={state.statementReviews}
    />
  );
}
