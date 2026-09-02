export function buildV1StatusRouteContract(runtime = {}) {
  const onOpenEmployeeImport = runtime.canOpenMasterData
    ? () => {
      runtime.setMasterDataMaintenanceTab?.("员工机台");
      runtime.setActivePage?.("masterData");
      runtime.openMasterDataTemplatePanel?.("员工机台");
    }
    : undefined;

  return {
    actions: runtime.v1StatusActions?.pageActions,
    state: runtime.v1StatusRouteState,
    onOpenEmployeeImport,
  };
}
