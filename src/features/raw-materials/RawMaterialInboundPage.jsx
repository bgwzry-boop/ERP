import { lazy, Suspense } from "react";
import { RawMaterialInboundListPane, RawMaterialRollInventoryWorkbench } from "./RawMaterialInboundWorkbench.jsx";
import { RawMaterialMobileReceiving } from "./RawMaterialMobileReceiving.jsx";
import { RawMaterialLabelPrintSheet } from "./RawMaterialLabelPrintSheet.jsx";
const RawMaterialSupplierColorMappingDialog = lazy(() => import("./RawMaterialSupplierColorMappingDialog.jsx").then((module) => ({
  default: module.RawMaterialSupplierColorMappingDialog,
})));

import { useInboundPageState } from "./useInboundPageState.js";
import { InboundDetail } from "./InboundDetail.jsx";

export function RawMaterialInboundPage(props) {
  const state = useInboundPageState(props);
  const {
    authState,
    currentUser,
    inbounds,
    meta,
    printerDeviceQa,
    firstReleaseMode,
    activeTab,
    keyword,
    setKeyword,
    deliveryNoteOcrLoading,
    deliveryNoteOcrError,
    deliveryNoteOcrProgress,
    deliveryNoteOcrResult,
    deliveryNoteCapturePages,
    deliveryNoteDirectionHint,
    setDeliveryNoteDirectionHint,
    deliveryNoteSupplierHint,
    setDeliveryNoteSupplierHint,
    mobileStage,
    mobileMessage,
    printSheetInbound,
    desktopView,
    setDesktopView,
    colorMappingOpen,
    colorMappingContext,
    deliveryNoteSupplierOptions,
    records,
    visibleRecords,
    selected,
    reviewState,
    printState,
    attachState,
    colorMappingState,
    metrics,
    mobileOcrReviewOpen,
    mobileSelected,
    openSupplierColorMapping,
    closeSupplierColorMapping,
    applySavedSupplierColorMapping,
    handleSelectInbound,
    handleOpenRollSource,
    handleMobileStageChange,
    handleDeliveryNotePageSelect,
    handleDeliveryNoteRecognize,
    handleDeliveryNotePagesClear,
    handleDeliveryNotePageRemove,
    handlePrintLabels,
    handleDeferLabels,
    handleMobileAttach,
    handleMobileOneClickInbound,
    changeTab
  } = state;
  return (<section className={`page-grid split-detail operational-split-workbench raw-material-inbound-page raw-material-workbench ${desktopView === "卷料库存" ? "is-roll-inventory-view" : "is-receiving-view"} ${mobileOcrReviewOpen ? "is-mobile-detail-open" : ""}`}>
      <RawMaterialLabelPrintSheet inbound={printSheetInbound} />
      {colorMappingOpen ? (
        <Suspense fallback={null}>
          <RawMaterialSupplierColorMappingDialog
            authState={authState}
            currentUser={currentUser}
            initialValues={colorMappingContext}
            onClose={closeSupplierColorMapping}
            onSaved={colorMappingContext ? applySavedSupplierColorMapping : undefined}
          />
        </Suspense>
      ) : null}
      <RawMaterialMobileReceiving
        attachState={attachState}
        deliveryNoteOcrError={deliveryNoteOcrError}
        deliveryNoteOcrLoading={deliveryNoteOcrLoading}
        deliveryNoteOcrProgress={deliveryNoteOcrProgress}
        deliveryNoteOcrResult={deliveryNoteOcrResult}
        capturedPages={deliveryNoteCapturePages}
        mobileMessage={mobileMessage}
        mobileStage={mobileStage}
        documentDirectionHint={deliveryNoteDirectionHint}
        supplierNameHint={deliveryNoteSupplierHint}
        supplierOptions={deliveryNoteSupplierOptions}
        onAttach={handleMobileAttach}
        onOneClickInbound={handleMobileOneClickInbound}
        onDeliveryNotePageSelect={handleDeliveryNotePageSelect}
        onDeliveryNotePageRemove={handleDeliveryNotePageRemove}
        onDeliveryNotePagesClear={handleDeliveryNotePagesClear}
        onDocumentDirectionHintChange={(direction) => {
          setDeliveryNoteDirectionHint(direction);
          if (direction !== "supplier_return") setDeliveryNoteSupplierHint("");
        }}
        onSupplierNameHintChange={setDeliveryNoteSupplierHint}
        onDeferPrint={handleDeferLabels}
        onDeliveryNoteRecognize={() => handleDeliveryNoteRecognize()}
        onPrint={handlePrintLabels}
        onStageChange={handleMobileStageChange}
        printState={printState}
        printerDeviceQa={printerDeviceQa}
        records={inbounds}
        reviewState={reviewState}
        selected={mobileSelected}
      />
      <RawMaterialRollInventoryWorkbench
        colorMappingState={colorMappingState}
        inbounds={inbounds}
        meta={meta}
        onOpenColorMappings={() => openSupplierColorMapping()}
        onOpenReceiving={() => setDesktopView("收货录入")}
        onOpenSource={handleOpenRollSource}
      />
      <RawMaterialInboundListPane
        activeTab={activeTab}
        inbounds={inbounds}
        keyword={keyword}
        meta={meta}
        metrics={metrics}
        onKeywordChange={setKeyword}
        onSelect={handleSelectInbound}
        onTabChange={changeTab}
        records={records}
        selectedId={selected?.id}
        visibleRecords={visibleRecords}
        firstReleaseMode={firstReleaseMode}
        onOpenInventory={() => setDesktopView("卷料库存")}
      />
      <InboundDetail state={state} />
    </section>);
}
