export function buildMasterDataRouteContract(runtime = {}) {
  return {
    state: {
      authState: runtime.authState,
      currentUser: runtime.currentUser,
      customers: runtime.customers,
      employeeAccountReadiness: runtime.masterDataEmployeeAccountReadiness,
      employeeAccountReviews: runtime.masterDataEmployeeAccountReviews,
      employeeAssignmentOptions: runtime.masterDataEmployeeAssignmentOptions,
      helpers: runtime.pageHelpers,
      importExecutions: runtime.masterDataImportExecutions,
      importReviewDrafts: runtime.masterDataImportReviewDrafts,
      inventoryRecords: runtime.inventoryRecords,
      maintenanceDrafts: runtime.masterDataMaintenanceDrafts,
      orderLines: runtime.orderLines,
      selectedId: runtime.selectedMasterDataId,
      selectedTab: runtime.masterDataMaintenanceTab,
      statements: runtime.statements,
    },
    actions: {
      onBatchEnableEmployeeAccounts: runtime.enableMasterDataEmployeeAccounts,
      onOpenImportTemplate: runtime.openMasterDataTemplatePanel,
      onSaveDraft: runtime.saveMasterDataMaintenanceDraft,
      onSaveMachine: runtime.saveMasterDataMachine,
      onUpdateEmployeeAssignment: runtime.updateMasterDataEmployeeAssignment,
      onUpdateEmployeeProfile: runtime.updateMasterDataEmployeeProfile,
      setSelectedId: runtime.setSelectedMasterDataId,
      setSelectedTab: runtime.setMasterDataMaintenanceTab,
    },
  };
}
