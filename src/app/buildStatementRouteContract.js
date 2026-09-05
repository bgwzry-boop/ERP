export function buildStatementRouteContract(runtime = {}) {
  return {
    actionController: runtime.statementActionController,
    actions: {
      onRefresh: () => runtime.refreshStatementDetail?.({
        statementId: runtime.selectedStatementId,
        showToast: false,
      }),
    },
    state: {
      authState: runtime.authState,
      currentUser: runtime.currentUser,
      helpers: runtime.pageHelpers,
      orderLines: runtime.orderLines,
      readMeta: runtime.statementReadMeta,
      selectedId: runtime.selectedStatementId,
      setSelectedId: runtime.setSelectedStatementId,
      statements: runtime.statements,
    },
  };
}
