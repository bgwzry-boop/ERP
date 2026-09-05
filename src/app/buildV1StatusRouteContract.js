export function buildV1StatusRouteContract(runtime = {}) {
  const onOpenEmployeeImport = runtime.canOpenMasterData
    ? () => {
      runtime.setMasterDataMaintenanceTab?.("员工机台");
      runtime.setActivePage?.("masterData");
      runtime.openMasterDataTemplatePanel?.("员工机台");
    }
    : undefined;

  return {
    actionController: runtime.v1StatusActionController,
    state: runtime.v1StatusRouteState,
    onOpenEmployeeImport,
  };
}
