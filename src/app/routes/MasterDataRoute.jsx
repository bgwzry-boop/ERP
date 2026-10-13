import "../../styles/features/master-data.css";
import { MasterDataMaintenancePage } from "../../features/master-data/MasterDataMaintenancePage.jsx";

export function MasterDataRoute({ state = {}, actions = {} }) {
  return (
    <MasterDataMaintenancePage
      authState={state.authState}
      currentUser={state.currentUser}
      customers={state.customers}
      employeeAccountReadiness={state.employeeAccountReadiness}
      employeeAccountReviews={state.employeeAccountReviews}
      employeeAssignmentOptions={state.employeeAssignmentOptions}
      helpers={state.helpers}
      importExecutions={state.importExecutions}
      importReviewDrafts={state.importReviewDrafts}
      inventoryRecords={state.inventoryRecords}
      maintenanceDrafts={state.maintenanceDrafts}
      onBatchEnableEmployeeAccounts={actions.onBatchEnableEmployeeAccounts}
      onOpenImportTemplate={actions.onOpenImportTemplate}
      onSaveDraft={actions.onSaveDraft}
      onSaveMachine={actions.onSaveMachine}
      onUpdateEmployeeAssignment={actions.onUpdateEmployeeAssignment}
      onUpdateEmployeeProfile={actions.onUpdateEmployeeProfile}
      orderLines={state.orderLines}
      selectedId={state.selectedId}
      selectedTab={state.selectedTab}
      setSelectedId={actions.setSelectedId}
      setSelectedTab={actions.setSelectedTab}
      statements={state.statements}
    />
  );
}
