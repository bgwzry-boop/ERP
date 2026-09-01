import { StatusPill } from "../../shared/ui/operational.jsx";
import { PrinterDeviceQaPanel, PrintJobQueuePanel } from "./ProductionPrintDevicePanels.jsx";
import { PrintDriverDiagnosticsPanel } from "./ProductionPrintDiagnosticsPanel.jsx";
import { PrintDriverV1ReadinessPanel } from "./ProductionPrintReadinessPanel.jsx";

export function ProductionPrintWorkspaceDetail({
  activePrintWorkspace,
  activePrintWorkspaceTab,
  getUiActionState,
  onChangePrinterDeviceQaCheck,
  onChangePrinterDeviceQaEvidenceField,
  onChangePrinterDeviceQaField,
  onDispatchPrintJob,
  onRefreshPrintDriverConfig,
  onRefreshPrintDriverReadiness,
  onRefreshPrintJobs,
  onRefreshPrinterDeviceQa,
  onRetryPrintJob,
  onSavePrinterDeviceMode,
  onSavePrinterDeviceQa,
  onSelectPrinterDeviceQaDevice,
  printDriverConfig,
  printDriverCupsDiagnostics,
  printDriverReadiness,
  printJobQueue,
  printerDeviceQa,
}) {
  return (
    <>
      <div className="production-print-overview">
        <div>
          <span>打印管理</span>
          <strong>{activePrintWorkspace.label}</strong>
          <p>{activePrintWorkspace.summary}</p>
        </div>
        <StatusPill tone={activePrintWorkspace.tone}>{activePrintWorkspace.status}</StatusPill>
      </div>
      <div className="production-detail-scroll production-print-detail-scroll">
        <div role="tabpanel" aria-label="设备验收" hidden={activePrintWorkspaceTab !== "qa"}>
          <PrinterDeviceQaPanel
            qaState={printerDeviceQa}
            saveState={getUiActionState("productionPacking", "保存打印验收")}
            deviceModeSaveState={getUiActionState("productionPacking", "保存设备模式")}
            onRefresh={onRefreshPrinterDeviceQa}
            onSelectDevice={onSelectPrinterDeviceQaDevice}
            onChangeField={onChangePrinterDeviceQaField}
            onChangeCheck={onChangePrinterDeviceQaCheck}
            onChangeEvidence={onChangePrinterDeviceQaEvidenceField}
            onSaveDeviceMode={onSavePrinterDeviceMode}
            onSave={onSavePrinterDeviceQa}
          />
        </div>
        <div role="tabpanel" aria-label="上线门禁" hidden={activePrintWorkspaceTab !== "readiness"}>
          <PrintDriverV1ReadinessPanel
            readinessState={printDriverReadiness}
            onRefresh={onRefreshPrintDriverReadiness}
          />
        </div>
        <div role="tabpanel" aria-label="驱动诊断" hidden={activePrintWorkspaceTab !== "diagnostics"}>
          <PrintDriverDiagnosticsPanel
            driverState={printDriverConfig}
            cupsDiagnosticsState={printDriverCupsDiagnostics}
            onRefresh={onRefreshPrintDriverConfig}
          />
        </div>
        <div role="tabpanel" aria-label="打印作业" hidden={activePrintWorkspaceTab !== "jobs"}>
          <PrintJobQueuePanel
            queueState={printJobQueue}
            dispatchState={getUiActionState("productionPacking", "派发打印作业")}
            retryState={getUiActionState("productionPacking", "重试打印作业")}
            onRefresh={onRefreshPrintJobs}
            onDispatch={onDispatchPrintJob}
            onRetry={onRetryPrintJob}
          />
        </div>
      </div>
    </>
  );
}
