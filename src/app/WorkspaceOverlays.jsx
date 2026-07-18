import {
  ActionModal,
  AttachmentViewerModal,
  MasterDataImportTemplateModal,
  OrderLineActionModal,
} from "./AppViews.jsx";

export function WorkspaceOverlays({
  attachmentViewer,
  closeAttachmentViewer,
  closeMasterDataTemplatePanel,
  closeModal,
  closeOrderActionModal,
  confirmModal,
  confirmOrderLineAction,
  confirmMasterDataEmployeeIdentity,
  commitMasterDataImportExecutionFromPlan,
  createMasterDataFailedRowsCorrectionDraft,
  createMasterDataImportConfirmationPlanFromDraft,
  createMasterDataImportExecutionFromPlan,
  createMasterDataImportReviewDraftFromPrecheck,
  downloadMasterDataImportFailedRows,
  downloadMasterDataTemplate,
  downloadViewedAttachment,
  employeeAccountReviews,
  enableMasterDataEmployeeAccount,
  findCustomer,
  fulfillments,
  getStatementBlockingAmount,
  getUiActionState,
  importExecutions,
  lastIssuedEmployeeCredential,
  masterDataConfirmationPlans,
  masterDataPrecheckState,
  masterDataReviewDrafts,
  masterDataTemplatePanel,
  modal,
  onRefreshEmployeeAccountReviews,
  onPrecheckMasterDataTemplate,
  orderActionModal,
  orderLines,
  revokeMasterDataEmployeeAccountPassword,
  statements,
  issueMasterDataEmployeeAccountPassword,
}) {
  return (
    <>
      {modal && (
        <ActionModal
          modal={modal}
          fulfillments={fulfillments}
          statements={statements}
          orderLines={orderLines}
          findCustomer={findCustomer}
          getStatementBlockingAmount={getStatementBlockingAmount}
          onClose={closeModal}
          onConfirm={confirmModal}
        />
      )}
      {orderActionModal && <OrderLineActionModal modal={orderActionModal} onClose={closeOrderActionModal} onConfirm={confirmOrderLineAction} />}
      {attachmentViewer && <AttachmentViewerModal attachment={attachmentViewer} onClose={closeAttachmentViewer} onDownload={downloadViewedAttachment} />}
      {masterDataTemplatePanel && (
        <MasterDataImportTemplateModal
          panel={masterDataTemplatePanel}
          onClose={closeMasterDataTemplatePanel}
          onDownload={downloadMasterDataTemplate}
          onPrecheck={onPrecheckMasterDataTemplate}
          precheckState={masterDataPrecheckState}
          reviewDrafts={masterDataReviewDrafts}
          onCreateReviewDraft={createMasterDataImportReviewDraftFromPrecheck}
          confirmationPlans={masterDataConfirmationPlans}
          onCreateConfirmationPlan={createMasterDataImportConfirmationPlanFromDraft}
          importExecutions={importExecutions}
          employeeAccountReviews={employeeAccountReviews}
          lastIssuedEmployeeCredential={lastIssuedEmployeeCredential}
          getUiActionState={getUiActionState}
          onCreateImportExecution={createMasterDataImportExecutionFromPlan}
          onCommitImportExecution={commitMasterDataImportExecutionFromPlan}
          onDownloadFailedRows={downloadMasterDataImportFailedRows}
          onCreateFailedRowsCorrectionDraft={createMasterDataFailedRowsCorrectionDraft}
          onRefreshEmployeeAccountReviews={onRefreshEmployeeAccountReviews}
          onEnableEmployeeAccount={enableMasterDataEmployeeAccount}
          onConfirmEmployeeIdentity={confirmMasterDataEmployeeIdentity}
          onIssueEmployeePassword={issueMasterDataEmployeeAccountPassword}
          onRevokeEmployeePassword={revokeMasterDataEmployeeAccountPassword}
        />
      )}
    </>
  );
}
