function getRefreshSource(result) {
  return result?.source ?? result?.devices?.source ?? "";
}

function getRefreshError(result) {
  return result?.feedback || result?.error?.message || "后端刷新结果不可用";
}

export function createOfficePageRefreshActions({
  activeMetaLabel,
  activePage,
  allowLocalFallback,
  canUsePrintDiagnostics,
  refreshDriverDeliveryTasks,
  refreshFulfillments,
  refreshInventoryLedgerEntries,
  refreshInventoryRecords,
  refreshMasterDataEmployeeAccountReviews,
  refreshMasterDataImportReviewDrafts,
  refreshOfficePrintJobQueue,
  refreshOrderPool,
  refreshPrintDriverConfig,
  refreshPrintDriverCupsDiagnostics,
  refreshPrintDriverReadiness,
  refreshPrinterDeviceQa,
  refreshProductionPackingTaskLists,
  refreshRawMaterialInbounds,
  refreshRawMaterialSupplierStatementReviews,
  refreshStatementDetail,
  refreshStatements,
  refreshTodos,
  refreshV1GoLiveStatus,
  selectedStatementId,
  selectedStockIdRef,
  setToast,
}) {
  function isTrusted(result) {
    if (!result || result.blocked) return false;
    if (allowLocalFallback) return true;
    return getRefreshSource(result) === "api";
  }

  async function runSingle(action, fallbackSuccess) {
    const result = await action();
    if (!isTrusted(result)) {
      setToast(`刷新未完成：${getRefreshError(result)}。`);
      return { ...(result ?? {}), blocked: true, source: "api_error" };
    }
    setToast(result.feedback || fallbackSuccess);
    return result;
  }

  async function runGroup(label, actions, successMessage) {
    const results = await Promise.all(actions.map((action) => action()));
    const failed = results.filter((result) => !isTrusted(result));
    if (failed.length) {
      setToast(`${label}刷新未完成：${failed.map(getRefreshError).join("；")}。`);
      return { source: "api_error", blocked: true, results };
    }
    setToast(successMessage);
    return { source: allowLocalFallback && results.some((result) => getRefreshSource(result) !== "api") ? "local_fallback" : "api", results };
  }

  async function refreshActivePage() {
    if (activePage === "todos") {
      return runSingle(() => refreshTodos({ showToast: true }), "公共待办已刷新。");
    }
    if (activePage === "orders") {
      return runSingle(() => refreshOrderPool({ showToast: true }), "订单池已刷新。");
    }
    if (activePage === "driverMobile") {
      return runSingle(() => refreshDriverDeliveryTasks({ showToast: true }), "司机送货任务已刷新。");
    }
    if (activePage === "inventory") {
      const inventoryResult = await refreshInventoryRecords({ showToast: false });
      if (!isTrusted(inventoryResult)) {
        setToast(`库存刷新未完成：${getRefreshError(inventoryResult)}。`);
        return { ...(inventoryResult ?? {}), blocked: true, source: "api_error" };
      }
      const stockId = inventoryResult.selectedStockId ?? selectedStockIdRef.current;
      return runGroup(
        "库存与流水",
        [() => Promise.resolve(inventoryResult), () => refreshInventoryLedgerEntries({ stockId, showToast: false })],
        "库存和当前货品流水已从可信来源刷新。",
      );
    }
    if (activePage === "fulfillment") {
      return runSingle(() => refreshFulfillments({ showToast: true }), "出库交付记录已刷新。");
    }
    if (activePage === "statements") {
      const statementResult = await refreshStatements({ showToast: false });
      if (!isTrusted(statementResult)) {
        setToast(`对账刷新未完成：${getRefreshError(statementResult)}。`);
        return { ...(statementResult ?? {}), blocked: true, source: "api_error" };
      }
      const statementId = statementResult.selectedStatementId ?? selectedStatementId;
      const actions = [() => Promise.resolve(statementResult)];
      if (statementId) actions.push(() => refreshStatementDetail({ statementId, showToast: false }));
      return runGroup("对账", actions, "客户对账列表和当前对账单详情已刷新。");
    }
    if (activePage === "masterData") {
      return runGroup(
        "基础资料",
        [
          () => refreshMasterDataImportReviewDrafts({ silent: true }),
          () => refreshMasterDataEmployeeAccountReviews({ silent: true }),
        ],
        "基础资料维护页已刷新：导入草稿和员工账号复核状态已同步。",
      );
    }
    if (activePage === "rawMaterials") {
      return runGroup(
        "原材料",
        [
          () => refreshRawMaterialInbounds({ showToast: false }),
          () => refreshRawMaterialSupplierStatementReviews({ showToast: false }),
        ],
        "原材料入库单和供应商月结复核草稿已刷新；月结草稿仍不影响库存或付款。",
      );
    }
    if (activePage === "v1Status") {
      return runSingle(() => refreshV1GoLiveStatus({ showToast: true }), "V1 上线状态已刷新。");
    }
    if (activePage === "packing") {
      const actions = [
        () => refreshProductionPackingTaskLists({ showToast: false }),
        () => refreshPrintDriverConfig({ showToast: false }),
        () => refreshPrinterDeviceQa({ showToast: false }),
        () => refreshOfficePrintJobQueue({ showToast: false }),
      ];
      if (canUsePrintDiagnostics) {
        actions.push(
          () => refreshPrintDriverReadiness({ showToast: false }),
          () => refreshPrintDriverCupsDiagnostics({ showToast: false }),
        );
      }
      return runGroup(
        "打包/标签",
        actions,
        "打包/标签任务池、打印上线门禁、驱动诊断、设备验收和打印作业池已刷新。",
      );
    }
    if (activePage === "workshopMobile") {
      return runSingle(
        () => refreshProductionPackingTaskLists({ showToast: true }),
        "车间生产任务已刷新。",
      );
    }
    if (activePage === "entry") {
      const result = { source: "ui", skipped: true, reason: "draft_editor" };
      setToast("订单录入是当前草稿编辑区，未执行后端刷新；保存确认后会刷新订单读模型。");
      return result;
    }
    const result = { source: "ui", skipped: true, reason: "unsupported_page" };
    setToast(`${activeMetaLabel || "当前页面"}没有可执行的刷新动作。`);
    return result;
  }

  return { refreshActivePage };
}
