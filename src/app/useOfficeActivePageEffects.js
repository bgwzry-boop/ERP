import { useEffect } from "react";
import { getOfficeOrderLineDetail } from "../services/officeOrderPoolLazyApi.js";
import { useRawMaterialInboundAutoRefresh } from "./useRawMaterialInboundAutoRefresh.js";

export function useOfficeActivePageEffects({
  activePage,
  authState,
  canUsePrintDiagnostics,
  currentUserId,
  fulfillments,
  orderLinesRef,
  refreshDriverDeliveryTasks,
  refreshFulfillments,
  refreshInventoryCorrectionQueue,
  refreshInventoryIntents,
  refreshInventoryLedgerEntries,
  refreshInventoryRecords,
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
  selectedOrderId,
  selectedStatementId,
  selectedStockId,
  setOrderPoolMeta,
  setSelectedOrderDetail,
  statements,
  syncStatementCustomerAttachmentsFromSource,
  syncStatementPaymentAttachmentsFromSource,
}) {
  useEffect(() => {
    if (activePage !== "v1Status") return;
    void refreshV1GoLiveStatus();
  }, [activePage, refreshV1GoLiveStatus]);

  useEffect(() => {
    let cancelled = false;
    refreshOrderPool({ showToast: false }).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [refreshOrderPool]);

  useEffect(() => {
    if (activePage !== "driverMobile") return undefined;
    let cancelled = false;
    refreshDriverDeliveryTasks({ showToast: false }).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [activePage, refreshDriverDeliveryTasks]);

  useRawMaterialInboundAutoRefresh({
    activePage,
    refreshRawMaterialInbounds,
    refreshRawMaterialSupplierStatementReviews,
  });

  useEffect(() => {
    if (activePage !== "todos") return undefined;
    let cancelled = false;
    refreshTodos({ showToast: false }).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [activePage, refreshTodos]);

  useEffect(() => {
    if (activePage !== "orders" || !selectedOrderId) return undefined;
    let cancelled = false;
    setOrderPoolMeta((current) => ({ ...current, detailLoading: true, detailError: "" }));
    getOfficeOrderLineDetail({
      authState,
      orderLineId: selectedOrderId,
      operatorId: currentUserId,
      localOrderLines: orderLinesRef.current,
      localFulfillments: fulfillments,
      localStatements: statements,
    }).then((result) => {
      if (cancelled) return;
      if (result.blocked) {
        setSelectedOrderDetail(null);
        setOrderPoolMeta((current) => ({
          ...current,
          detailSource: result.source,
          detailLoading: false,
          detailError: result.error?.message ?? "订单明细详情 API 返回错误。",
        }));
        return;
      }
      setSelectedOrderDetail(result.detail);
      setOrderPoolMeta((current) => ({
        ...current,
        detailSource: result.source,
        detailLoading: false,
        detailError: result.error?.message ?? "",
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [activePage, authState, currentUserId, fulfillments, selectedOrderId, statements]);

  useEffect(() => {
    if (activePage !== "inventory") return undefined;
    let cancelled = false;
    refreshInventoryRecords({ showToast: false }).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [activePage, refreshInventoryRecords]);

  useEffect(() => {
    if (activePage !== "fulfillment") return undefined;
    let cancelled = false;
    refreshFulfillments({ showToast: false }).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [activePage, refreshFulfillments]);

  useEffect(() => {
    if (activePage !== "inventory") return undefined;
    let cancelled = false;
    Promise.all([refreshInventoryCorrectionQueue({ showToast: false }), refreshInventoryIntents({ showToast: false })])
      .then(() => { if (cancelled) return; });
    return () => { cancelled = true; };
  }, [activePage, refreshInventoryCorrectionQueue, refreshInventoryIntents]);

  useEffect(() => {
    if (activePage !== "inventory" || !selectedStockId) return undefined;
    let cancelled = false;
    refreshInventoryLedgerEntries({ stockId: selectedStockId, showToast: false }).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [activePage, refreshInventoryLedgerEntries, selectedStockId]);

  useEffect(() => {
    if (!["packing", "workshopMobile", "rawMaterialScanner"].includes(activePage)) return undefined;
    let cancelled = false;
    refreshProductionPackingTaskLists({ showToast: false }).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [activePage, refreshProductionPackingTaskLists]);

  useEffect(() => {
    if (activePage !== "packing" || !canUsePrintDiagnostics) return undefined;
    let cancelled = false;
    refreshPrintDriverConfig({ showToast: false }).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [activePage, canUsePrintDiagnostics, refreshPrintDriverConfig]);

  useEffect(() => {
    if (activePage !== "packing" || !canUsePrintDiagnostics) return undefined;
    let cancelled = false;
    refreshPrintDriverReadiness({ showToast: false }).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [activePage, canUsePrintDiagnostics, refreshPrintDriverReadiness]);

  useEffect(() => {
    if (activePage !== "packing" || !canUsePrintDiagnostics) return undefined;
    let cancelled = false;
    refreshPrintDriverCupsDiagnostics({ showToast: false }).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [activePage, canUsePrintDiagnostics, refreshPrintDriverCupsDiagnostics]);

  useEffect(() => {
    if (activePage !== "packing") return undefined;
    let cancelled = false;
    refreshPrinterDeviceQa({ showToast: false }).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [activePage, refreshPrinterDeviceQa]);

  useEffect(() => {
    if (activePage !== "packing") return undefined;
    let cancelled = false;
    refreshOfficePrintJobQueue({ showToast: false }).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [activePage, refreshOfficePrintJobQueue]);

  useEffect(() => {
    if (activePage !== "statements") return undefined;
    let cancelled = false;
    refreshStatements({ showToast: false }).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [activePage, refreshStatements]);

  useEffect(() => {
    if (activePage !== "statements" || !selectedStatementId) return undefined;
    let cancelled = false;
    refreshStatementDetail({ statementId: selectedStatementId, showToast: false }).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [activePage, refreshStatementDetail, selectedStatementId]);

  const selectedStatementPaymentAttachmentKey = (statements.find(
    (item) => item.id === selectedStatementId,
  )?.paymentAttachmentIds ?? []).join("|");

  useEffect(() => {
    if (activePage !== "statements" || !selectedStatementId) return undefined;
    let cancelled = false;
    void syncStatementPaymentAttachmentsFromSource(selectedStatementId, {
      isCancelled: () => cancelled,
      cacheKey: selectedStatementPaymentAttachmentKey,
    });
    return () => {
      cancelled = true;
    };
  }, [activePage, authState, currentUserId, selectedStatementId, selectedStatementPaymentAttachmentKey]);

  useEffect(() => {
    if (activePage !== "statements" || !selectedStatementId) return undefined;
    let cancelled = false;
    void syncStatementCustomerAttachmentsFromSource(selectedStatementId, {
      isCancelled: () => cancelled,
    });
    return () => {
      cancelled = true;
    };
  }, [activePage, authState, currentUserId, selectedStatementId]);
}
