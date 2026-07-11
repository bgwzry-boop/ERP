import { useEffect, useRef, useState } from "react";
import {
  DataState,
  DetailPane,
  InfoGrid,
  MetricStrip,
  OperationalPanel,
  PanelHeader,
  Segmented,
  StatusPill,
  Timeline,
} from "../../shared/ui/operational.jsx";
import {
  applyDriverPackageScan,
  getDriverLoadPackageCheckState,
  getDriverNavigationUrl,
  getDriverRouteExecutionContext,
  getDriverRouteLabel,
  getDriverRouteStopLabel,
} from "../../services/driverMobileApiClient.js";
import {
  DRIVER_DEVICE_FIELD_TEST_STATUS_OPTIONS,
  appendDriverDeviceFieldTestNote,
  applyDriverPackageCameraFieldTestSignal,
  applyDriverPackageLabelScanFieldTestSignal,
  buildDriverDeviceFieldTestRecord,
  buildDriverPackageLabelScanSample,
  createDriverDeviceFieldTestChecks,
  getDriverDeviceFieldTestContext,
  getDriverDeviceFieldTestSummary,
  getDriverPackageLabelScanSampleSummary,
  updateDriverDeviceFieldTestCheck,
} from "../../services/driverDeviceFieldTestClient.js";
import {
  captureDriverDeliveryPhotoFromVideo,
  startDriverDeliveryPhotoCamera,
} from "../../services/driverCameraPhotoClient.js";
import { getDriverDeviceReadiness } from "../../services/driverDeviceReadinessClient.js";
import { startDriverPackageCameraScanner } from "../../services/driverPackageCameraScannerClient.js";
import {
  getDriverNativePackageScannerSupport,
  requestDriverNativePackageLabelScan,
} from "../../services/driverNativeBridgeClient.js";
import {
  getDriverNativeNavigationSupport,
  requestDriverNativeNavigation,
} from "../../services/driverNativeNavigationBridgeClient.js";
import { getDriverNativeCapabilityDiagnostics } from "../../services/driverNativeCapabilityClient.js";
import {
  buildDriverNativeIntegrationKit,
  getDriverNativeIntegrationKitSummary,
} from "../../services/driverNativeIntegrationKitClient.js";

export function DriverMobilePage({ tasks = [], selectedTaskId, setSelectedTaskId, meta = {}, onAction, helpers }) {
  const { currentUser, getUiActionState, statusTone } = helpers;
  const [view, setView] = useState("待送货");
  const [taskInputs, setTaskInputs] = useState({});
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState({ watermarked: "", signature: "" });
  const packageCameraVideoRef = useRef(null);
  const packageCameraScannerRef = useRef(null);
  const deliveryPhotoVideoRef = useRef(null);
  const deliveryPhotoCameraRef = useRef(null);
  const visibleTasks = tasks.filter((task) => view === "全部" || task.status === view);
  const selectedTask =
    visibleTasks.find((item) => item.fulfillmentId === selectedTaskId) ??
    visibleTasks[0] ??
    null;
  const currentInput = taskInputs[selectedTask?.fulfillmentId] ?? {};
  const watermarkedPhotoFile = currentInput.watermarkedPhotoFile ?? null;
  const signaturePhotoFile = currentInput.signaturePhotoFile ?? null;
  const watermarkedPhotoAttachmentId = currentInput.watermarkedPhotoAttachmentId ?? selectedTask?.watermarkedPhotoAttachmentId ?? "";
  const signaturePhotoAttachmentId = currentInput.signaturePhotoAttachmentId ?? selectedTask?.signaturePhotoAttachmentId ?? "";
  const watermarkedPhotoAttached =
    currentInput.watermarkedPhotoAttached === true ||
    Boolean(watermarkedPhotoFile) ||
    Boolean(watermarkedPhotoAttachmentId) ||
    selectedTask?.watermarkedPhotoAttached === true;
  const signaturePhotoAttached =
    currentInput.signaturePhotoAttached === true ||
    Boolean(signaturePhotoFile) ||
    Boolean(signaturePhotoAttachmentId) ||
    selectedTask?.signaturePhotoAttached === true;
  const receiverName = currentInput.receiverName ?? selectedTask?.receiverName ?? "";
  const paperNoteStatus = currentInput.paperNoteStatus ?? selectedTask?.paperNoteStatus ?? "已交回";
  const watermarkLocationLabel = currentInput.watermarkLocationLabel ?? selectedTask?.watermarkLocationLabel ?? selectedTask?.addressArea ?? "";
  const watermarkGeoPoint = currentInput.watermarkGeoPoint ?? selectedTask?.watermarkGeoPoint ?? "";
  const watermarkLocationStatus = currentInput.watermarkLocationStatus ?? "";
  const deliveryPhotoCameraActive = currentInput.deliveryPhotoCameraActive === true;
  const deliveryPhotoCameraStatus = currentInput.deliveryPhotoCameraStatus ?? "";
  const exceptionReason = currentInput.exceptionReason ?? "装车少货";
  const remark = currentInput.remark ?? "";
  const actualQty = currentInput.actualQty ?? selectedTask?.qty ?? 0;
  const checkedPackageIds = currentInput.checkedPackageIds ?? selectedTask?.packageChecklist?.filter((item) => item.checked === true).map((item) => item.packageId) ?? [];
  const packageScanText = currentInput.packageScanText ?? "";
  const packageScanStatus = currentInput.packageScanStatus ?? "";
  const packageCameraScanActive = currentInput.packageCameraScanActive === true;
  const packageCameraScanStatus = currentInput.packageCameraScanStatus ?? "";
  const packageNativeScanActive = currentInput.packageNativeScanActive === true;
  const nativePackageScanSupport = getDriverNativePackageScannerSupport();
  const packageNativeScanStatus = currentInput.packageNativeScanStatus ?? nativePackageScanSupport.message;
  const nativeNavigationActive = currentInput.nativeNavigationActive === true;
  const nativeNavigationSupport = getDriverNativeNavigationSupport();
  const nativeNavigationStatus = currentInput.nativeNavigationStatus ?? nativeNavigationSupport.message;
  const nativeNavigationStatusTone = currentInput.nativeNavigationStatusTone ?? (nativeNavigationSupport.supported ? "success" : "neutral");
  const nativeCapabilityDiagnostics = getDriverNativeCapabilityDiagnostics();
  const watermarkPreview = selectedTask
    ? buildDriverWatermarkPreview({
        task: selectedTask,
        currentUser,
        watermarkLocationLabel,
        watermarkGeoPoint,
      })
    : null;
  const watermarkPreviewLines = getDriverWatermarkOverlayLines(watermarkPreview?.text);
  const routeContext = selectedTask ? getDriverRouteExecutionContext(tasks, selectedTask) : null;
  const navigationUrl = selectedTask ? getDriverNavigationUrl(selectedTask) : "";
  const nativeIntegrationKit = selectedTask
    ? buildDriverNativeIntegrationKit({
        task: selectedTask,
        operatorId: currentUser.userId ?? currentUser.id,
        navigationUrl,
        geoPoint: watermarkGeoPoint,
      })
    : null;
  const nativeIntegrationKitSummary = getDriverNativeIntegrationKitSummary(nativeIntegrationKit);
  const packageCheckState = selectedTask ? getDriverLoadPackageCheckState(selectedTask, checkedPackageIds) : { checklist: [], allChecked: true, summary: "无包裹" };
  const loadBlockedByPackageCheck = selectedTask?.status === "待送货" && !packageCheckState.allChecked;
  const loadState = getUiActionState("driverMobile", "确认已装车");
  const completeState = getUiActionState("driverMobile", "提交送达");
  const exceptionAction = selectedTask?.status === "待送货" ? "装车异常" : "送货异常";
  const exceptionState = getUiActionState("driverMobile", exceptionAction);
  const fieldTestSaveState = getUiActionState("driverMobile", "保存验收");
  const stats = [
    ["待送货", tasks.filter((item) => item.status === "待送货").length, "warning"],
    ["配送中", tasks.filter((item) => item.status === "配送中").length, "blue"],
    ["已完成", tasks.filter((item) => item.status === "已完成").length, "success"],
    ["异常", tasks.filter((item) => item.status === "送货异常").length, "danger"],
  ];
  const sourceText = meta.loading
    ? "同步中"
    : meta.source === "api"
      ? `后端 API${meta.lastSyncedAt ? ` · ${meta.lastSyncedAt}` : ""}`
      : "本地任务";
  const deviceReadiness = getDriverDeviceReadiness();
  const fieldTestContext = getDriverDeviceFieldTestContext();
  const deviceFieldTestChecks = currentInput.deviceFieldTestChecks ?? createDriverDeviceFieldTestChecks(deviceReadiness);
  const deviceFieldTestSummary = getDriverDeviceFieldTestSummary(deviceFieldTestChecks);
  const deviceFieldTestRecord = currentInput.deviceFieldTestRecord ?? selectedTask?.deviceFieldTestRecord ?? null;
  const packageLabelScanSample = currentInput.packageLabelScanSample ?? deviceFieldTestRecord?.packageLabelScanSample ?? null;
  const packageLabelScanSampleSummary = getDriverPackageLabelScanSampleSummary(packageLabelScanSample);
  const nativeBridgeFieldTestSnapshot =
    currentInput.nativeBridgeDiagnostics ?? deviceFieldTestRecord?.nativeBridgeDiagnostics ?? nativeCapabilityDiagnostics;
  const nativeBridgeFieldTestSnapshotText = (nativeBridgeFieldTestSnapshot?.items ?? [])
    .map((item) => `${item.label}${item.statusLabel} · ${item.bridgeTypeLabel}`)
    .join("；");
  const deviceFieldTestDeviceLabel = currentInput.deviceFieldTestDeviceLabel ?? fieldTestContext.deviceLabel;
  const deviceFieldTestBrowserLabel = currentInput.deviceFieldTestBrowserLabel ?? fieldTestContext.browserLabel;
  const deviceFieldTestNote = currentInput.deviceFieldTestNote ?? "";
  const deviceFieldTestStatus = currentInput.deviceFieldTestStatus ?? (deviceFieldTestRecord ? `已保存：${deviceFieldTestRecord.summary?.label ?? "现场验收记录"}` : "未保存现场验收记录");

  useEffect(() => {
    const nextUrls = { watermarked: "", signature: "" };
    if (typeof URL !== "undefined" && watermarkedPhotoFile) {
      nextUrls.watermarked = URL.createObjectURL(watermarkedPhotoFile);
    }
    if (typeof URL !== "undefined" && signaturePhotoFile) {
      nextUrls.signature = URL.createObjectURL(signaturePhotoFile);
    }
    setPhotoPreviewUrls(nextUrls);
    return () => {
      Object.values(nextUrls).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, [selectedTask?.fulfillmentId, watermarkedPhotoFile, signaturePhotoFile]);

  useEffect(() => {
    return () => {
      stopPackageCameraScan({ silent: true });
      stopDeliveryPhotoCamera({ silent: true });
    };
  }, [selectedTask?.fulfillmentId]);

  function selectTask(taskId) {
    setSelectedTaskId(taskId);
  }

  function updateTaskInput(field, value) {
    if (!selectedTask) return;
    setTaskInputs((current) => ({
      ...current,
      [selectedTask.fulfillmentId]: {
        ...(current[selectedTask.fulfillmentId] ?? {}),
        [field]: value,
      },
    }));
  }

  function updateDeviceFieldTestCheck(key, status) {
    if (!selectedTask) return;
    setTaskInputs((current) => {
      const currentTaskInput = current[selectedTask.fulfillmentId] ?? {};
      const currentChecks = currentTaskInput.deviceFieldTestChecks ?? createDriverDeviceFieldTestChecks(deviceReadiness);
      return {
        ...current,
        [selectedTask.fulfillmentId]: {
          ...currentTaskInput,
          deviceFieldTestChecks: updateDriverDeviceFieldTestCheck(currentChecks, key, status, deviceReadiness),
          deviceFieldTestStatus: "现场验收记录未保存",
        },
      };
    });
  }

  function applyPackageCameraFieldTestSignal(taskId, signal) {
    if (!taskId) return;
    setTaskInputs((current) => {
      const currentTaskInput = current[taskId] ?? {};
      const currentChecks = currentTaskInput.deviceFieldTestChecks ?? createDriverDeviceFieldTestChecks(deviceReadiness);
      const nextChecks = applyDriverPackageCameraFieldTestSignal(currentChecks, signal, deviceReadiness);
      const nextTaskInput = {
        ...currentTaskInput,
        deviceFieldTestChecks: nextChecks,
        deviceFieldTestStatus: "现场验收记录未保存",
      };
      if (signal.message) {
        nextTaskInput.deviceFieldTestNote = appendDriverDeviceFieldTestNote(currentTaskInput.deviceFieldTestNote, signal.message);
      }
      return {
        ...current,
        [taskId]: nextTaskInput,
      };
    });
  }

  async function saveDeviceFieldTestRecord() {
    if (!selectedTask) return;
    const taskSnapshot = selectedTask;
    const currentTaskInput = taskInputs[taskSnapshot.fulfillmentId] ?? {};
    const currentChecks = currentTaskInput.deviceFieldTestChecks ?? createDriverDeviceFieldTestChecks(deviceReadiness);
    const record = buildDriverDeviceFieldTestRecord({
      task: taskSnapshot,
      currentUser,
      deviceLabel: currentTaskInput.deviceFieldTestDeviceLabel ?? deviceFieldTestDeviceLabel,
      browserLabel: currentTaskInput.deviceFieldTestBrowserLabel ?? deviceFieldTestBrowserLabel,
      note: currentTaskInput.deviceFieldTestNote ?? deviceFieldTestNote,
      readiness: deviceReadiness,
      checks: currentChecks,
      packageLabelScanSample: currentTaskInput.packageLabelScanSample ?? deviceFieldTestRecord?.packageLabelScanSample,
      nativeBridgeDiagnostics: nativeCapabilityDiagnostics,
    });
    updateTaskInput("deviceFieldTestStatus", "现场验收保存中");
    const result = await onAction?.("保存验收", {
      fulfillmentId: taskSnapshot.fulfillmentId,
      task: taskSnapshot,
      record,
    });
    if (result?.blocked) {
      updateTaskInput("deviceFieldTestStatus", "现场验收保存失败");
      return;
    }
    const savedRecord = result?.record ?? record;
    setTaskInputs((current) => {
      const nextTaskInput = current[taskSnapshot.fulfillmentId] ?? {};
      return {
        ...current,
        [taskSnapshot.fulfillmentId]: {
          ...nextTaskInput,
          deviceFieldTestChecks: savedRecord.checks,
          deviceFieldTestRecord: savedRecord,
          deviceFieldTestDeviceLabel: savedRecord.deviceLabel,
          deviceFieldTestBrowserLabel: savedRecord.browserLabel,
          packageLabelScanSample: savedRecord.packageLabelScanSample,
          nativeBridgeDiagnostics: savedRecord.nativeBridgeDiagnostics,
          deviceFieldTestStatus: `已保存：${savedRecord.summary.label}`,
        },
      };
    });
  }

  function togglePackageCheck(packageId) {
    if (!selectedTask) return;
    const safePackageId = String(packageId ?? "").trim();
    if (!safePackageId) return;
    setTaskInputs((current) => {
      const currentTaskInput = current[selectedTask.fulfillmentId] ?? {};
      const currentIds = Array.isArray(currentTaskInput.checkedPackageIds)
        ? currentTaskInput.checkedPackageIds
        : selectedTask.packageChecklist?.filter((item) => item.checked === true).map((item) => item.packageId) ?? [];
      const exists = currentIds.includes(safePackageId);
      const nextIds = exists ? currentIds.filter((item) => item !== safePackageId) : [...currentIds, safePackageId];
      return {
        ...current,
        [selectedTask.fulfillmentId]: {
          ...currentTaskInput,
          checkedPackageIds: nextIds,
        },
      };
    });
  }

  function setAllPackagesChecked(checked) {
    if (!selectedTask) return;
    setTaskInputs((current) => ({
      ...current,
      [selectedTask.fulfillmentId]: {
        ...(current[selectedTask.fulfillmentId] ?? {}),
        checkedPackageIds: checked ? packageCheckState.checklist.map((item) => item.packageId) : [],
      },
    }));
  }

  function applyPackageScan(scanTextOverride) {
    if (!selectedTask) return;
    setTaskInputs((current) => {
      const currentTaskInput = current[selectedTask.fulfillmentId] ?? {};
      const currentIds = Array.isArray(currentTaskInput.checkedPackageIds)
        ? currentTaskInput.checkedPackageIds
        : selectedTask.packageChecklist?.filter((item) => item.checked === true).map((item) => item.packageId) ?? [];
      const scanText = String(
        typeof scanTextOverride === "string" ? scanTextOverride : (currentTaskInput.packageScanText ?? packageScanText),
      );
      const scanResult = applyDriverPackageScan(selectedTask, currentIds, scanText);
      const scanSucceeded = scanResult.status === "matched" || scanResult.status === "duplicate";
      const shouldRecordScanSample = scanResult.status !== "empty";
      const packageLabelScanSample = shouldRecordScanSample
        ? buildDriverPackageLabelScanSample({
            task: selectedTask,
            checkedPackageIds: currentIds,
            scannedText: scanText,
            scanResult,
            method: "scanner_wedge",
          })
        : currentTaskInput.packageLabelScanSample;
      const nextTaskInput = {
        ...currentTaskInput,
        checkedPackageIds: scanResult.checkedPackageIds,
        packageScanStatus: scanResult.message,
        packageScanStatusTone: scanSucceeded ? "success" : "danger",
        packageScanText: scanResult.status === "matched" ? "" : scanText,
      };
      if (shouldRecordScanSample) {
        const fieldTestMessage = scanSucceeded
          ? `扫码枪/键盘口识别通过：${scanResult.matchedPackageId || scanText}`
          : `扫码枪/键盘口识别异常：${scanResult.message}`;
        nextTaskInput.packageLabelScanSample = packageLabelScanSample;
        nextTaskInput.deviceFieldTestChecks = applyDriverPackageLabelScanFieldTestSignal(
          currentTaskInput.deviceFieldTestChecks ?? createDriverDeviceFieldTestChecks(deviceReadiness),
          { type: "package_scan_result", scanStatus: scanResult.status },
          deviceReadiness,
        );
        nextTaskInput.deviceFieldTestNote = appendDriverDeviceFieldTestNote(currentTaskInput.deviceFieldTestNote, fieldTestMessage);
        nextTaskInput.deviceFieldTestStatus = "现场验收记录未保存";
      }
      return {
        ...current,
        [selectedTask.fulfillmentId]: nextTaskInput,
      };
    });
  }

  async function startPackageCameraScan() {
    if (!selectedTask) return;
    const taskSnapshot = selectedTask;
    const taskId = taskSnapshot.fulfillmentId;
    packageCameraScannerRef.current?.stop?.();
    packageCameraScannerRef.current = null;
    setTaskInputs((current) => ({
      ...current,
      [taskId]: {
        ...(current[taskId] ?? {}),
        packageCameraScanActive: true,
        packageCameraScanStatus: "正在打开相机...",
        packageCameraScanStatusTone: "success",
      },
    }));

    try {
      const session = await startDriverPackageCameraScanner({
        videoElement: packageCameraVideoRef.current,
        onReady: () => {
          applyPackageCameraFieldTestSignal(taskId, {
            type: "camera_opened",
            message: "相机权限已授权，扫码取景框已打开。",
          });
        },
        onStatus: (message) => {
          setTaskInputs((current) => ({
            ...current,
            [taskId]: {
              ...(current[taskId] ?? {}),
              packageCameraScanActive: true,
              packageCameraScanStatus: message,
              packageCameraScanStatusTone: "success",
            },
          }));
        },
        onCode: (code) => {
          packageCameraScannerRef.current = null;
          setTaskInputs((current) => {
            const currentTaskInput = current[taskId] ?? {};
            const currentIds = Array.isArray(currentTaskInput.checkedPackageIds)
              ? currentTaskInput.checkedPackageIds
              : taskSnapshot.packageChecklist?.filter((item) => item.checked === true).map((item) => item.packageId) ?? [];
            const scanResult = applyDriverPackageScan(taskSnapshot, currentIds, code);
            const scanSucceeded = scanResult.status === "matched" || scanResult.status === "duplicate";
            const packageLabelScanSample = buildDriverPackageLabelScanSample({
              task: taskSnapshot,
              checkedPackageIds: currentIds,
              scannedText: code,
              scanResult,
              method: "camera",
            });
            const fieldTestChecks = applyDriverPackageCameraFieldTestSignal(
              currentTaskInput.deviceFieldTestChecks ?? createDriverDeviceFieldTestChecks(deviceReadiness),
              { type: "camera_scan_result", scanStatus: scanResult.status },
              deviceReadiness,
            );
            const fieldTestMessage = scanSucceeded
              ? `相机扫码识别通过：${code}`
              : `相机识别到 ${code}，但不属于当前装车清单。`;
            return {
              ...current,
              [taskId]: {
                ...currentTaskInput,
                checkedPackageIds: scanResult.checkedPackageIds,
                packageScanStatus: scanResult.message,
                packageScanStatusTone: scanSucceeded ? "success" : "danger",
                packageScanText: scanResult.status === "matched" ? "" : code,
                packageCameraScanActive: false,
                packageCameraScanStatus: scanSucceeded ? `相机识别：${code}` : scanResult.message,
                packageCameraScanStatusTone: scanSucceeded ? "success" : "danger",
                packageLabelScanSample,
                deviceFieldTestChecks: fieldTestChecks,
                deviceFieldTestNote: appendDriverDeviceFieldTestNote(currentTaskInput.deviceFieldTestNote, fieldTestMessage),
                deviceFieldTestStatus: "现场验收记录未保存",
              },
            };
          });
        },
      });
      packageCameraScannerRef.current = session?.stopped ? null : session;
    } catch (error) {
      packageCameraScannerRef.current = null;
      const message = error?.message ?? "相机扫码启动失败，请继续用扫描枪或手输包裹号。";
      const packageLabelScanSample = buildDriverPackageLabelScanSample({
        task: taskSnapshot,
        checkedPackageIds: taskSnapshot.packageChecklist?.filter((item) => item.checked === true).map((item) => item.packageId) ?? [],
        method: "camera",
        result: "camera_error",
        message,
      });
      setTaskInputs((current) => ({
        ...current,
        [taskId]: {
          ...(current[taskId] ?? {}),
          packageCameraScanActive: false,
          packageCameraScanStatus: message,
          packageCameraScanStatusTone: "danger",
          packageLabelScanSample,
          deviceFieldTestChecks: applyDriverPackageCameraFieldTestSignal(
            current[taskId]?.deviceFieldTestChecks ?? createDriverDeviceFieldTestChecks(deviceReadiness),
            { type: "camera_error", errorCode: error?.code },
            deviceReadiness,
          ),
          deviceFieldTestNote: appendDriverDeviceFieldTestNote(current[taskId]?.deviceFieldTestNote, message),
          deviceFieldTestStatus: "现场验收记录未保存",
        },
      }));
    }
  }

  async function startNativePackageScan() {
    if (!selectedTask) return;
    const taskSnapshot = selectedTask;
    const taskId = taskSnapshot.fulfillmentId;
    const support = getDriverNativePackageScannerSupport();
    if (!support.supported) {
      setTaskInputs((current) => ({
        ...current,
        [taskId]: {
          ...(current[taskId] ?? {}),
          packageNativeScanActive: false,
          packageNativeScanStatus: support.message,
          packageNativeScanStatusTone: "danger",
        },
      }));
      return;
    }

    setTaskInputs((current) => ({
      ...current,
      [taskId]: {
        ...(current[taskId] ?? {}),
        packageNativeScanActive: true,
        packageNativeScanStatus: "正在调用原生扫码 SDK...",
        packageNativeScanStatusTone: "success",
      },
    }));

    try {
      const nativeResult = await requestDriverNativePackageLabelScan({
        task: taskSnapshot,
        operatorId: currentUser.userId ?? currentUser.id,
      });
      const code = nativeResult.scannedText;
      if (!code) {
        setTaskInputs((current) => ({
          ...current,
          [taskId]: {
            ...(current[taskId] ?? {}),
            packageNativeScanActive: false,
            packageNativeScanStatus: nativeResult.message || "原生扫码 SDK 未返回包裹码。",
            packageNativeScanStatusTone: nativeResult.status === "canceled" ? "success" : "danger",
          },
        }));
        return;
      }

      setTaskInputs((current) => {
        const currentTaskInput = current[taskId] ?? {};
        const currentIds = Array.isArray(currentTaskInput.checkedPackageIds)
          ? currentTaskInput.checkedPackageIds
          : taskSnapshot.packageChecklist?.filter((item) => item.checked === true).map((item) => item.packageId) ?? [];
        const scanResult = applyDriverPackageScan(taskSnapshot, currentIds, code);
        const scanSucceeded = scanResult.status === "matched" || scanResult.status === "duplicate";
        const packageLabelScanSample = buildDriverPackageLabelScanSample({
          task: taskSnapshot,
          checkedPackageIds: currentIds,
          scannedText: code,
          scanResult,
          method: "native_sdk",
          checkedAt: nativeResult.checkedAt,
          message: nativeResult.message || scanResult.message,
        });
        const fieldTestMessage = scanSucceeded
          ? `原生扫码SDK识别通过：${scanResult.matchedPackageId || code}`
          : `原生扫码SDK识别异常：${scanResult.message}`;
        return {
          ...current,
          [taskId]: {
            ...currentTaskInput,
            checkedPackageIds: scanResult.checkedPackageIds,
            packageScanStatus: scanResult.message,
            packageScanStatusTone: scanSucceeded ? "success" : "danger",
            packageScanText: scanResult.status === "matched" ? "" : code,
            packageNativeScanActive: false,
            packageNativeScanStatus: scanSucceeded ? `原生SDK识别：${code}` : scanResult.message,
            packageNativeScanStatusTone: scanSucceeded ? "success" : "danger",
            packageLabelScanSample,
            deviceFieldTestChecks: applyDriverPackageLabelScanFieldTestSignal(
              currentTaskInput.deviceFieldTestChecks ?? createDriverDeviceFieldTestChecks(deviceReadiness),
              { type: "package_scan_result", scanStatus: scanResult.status },
              deviceReadiness,
            ),
            deviceFieldTestNote: appendDriverDeviceFieldTestNote(currentTaskInput.deviceFieldTestNote, fieldTestMessage),
            deviceFieldTestStatus: "现场验收记录未保存",
          },
        };
      });
    } catch (error) {
      const message = error?.message ?? "原生扫码 SDK 调用失败，请继续用扫码枪、手输或相机扫码。";
      setTaskInputs((current) => {
        const currentTaskInput = current[taskId] ?? {};
        const currentIds = Array.isArray(currentTaskInput.checkedPackageIds)
          ? currentTaskInput.checkedPackageIds
          : taskSnapshot.packageChecklist?.filter((item) => item.checked === true).map((item) => item.packageId) ?? [];
        return {
          ...current,
          [taskId]: {
            ...currentTaskInput,
            packageNativeScanActive: false,
            packageNativeScanStatus: message,
            packageNativeScanStatusTone: "danger",
            packageLabelScanSample: buildDriverPackageLabelScanSample({
              task: taskSnapshot,
              checkedPackageIds: currentIds,
              method: "native_sdk",
              result: "failed",
              message,
            }),
            deviceFieldTestChecks: applyDriverPackageLabelScanFieldTestSignal(
              currentTaskInput.deviceFieldTestChecks ?? createDriverDeviceFieldTestChecks(deviceReadiness),
              { type: "package_scan_result", scanStatus: "failed" },
              deviceReadiness,
            ),
            deviceFieldTestNote: appendDriverDeviceFieldTestNote(currentTaskInput.deviceFieldTestNote, `原生扫码SDK异常：${message}`),
            deviceFieldTestStatus: "现场验收记录未保存",
          },
        };
      });
    }
  }

  async function startNativeNavigation() {
    if (!selectedTask) return;
    const taskSnapshot = selectedTask;
    const taskId = taskSnapshot.fulfillmentId;
    const support = getDriverNativeNavigationSupport();
    if (!navigationUrl) {
      setTaskInputs((current) => ({
        ...current,
        [taskId]: {
          ...(current[taskId] ?? {}),
          nativeNavigationActive: false,
          nativeNavigationStatus: "导航地址待补，无法调用原生导航。",
          nativeNavigationStatusTone: "danger",
        },
      }));
      return;
    }
    if (!support.supported) {
      setTaskInputs((current) => ({
        ...current,
        [taskId]: {
          ...(current[taskId] ?? {}),
          nativeNavigationActive: false,
          nativeNavigationStatus: support.message,
          nativeNavigationStatusTone: "neutral",
        },
      }));
      return;
    }

    setTaskInputs((current) => ({
      ...current,
      [taskId]: {
        ...(current[taskId] ?? {}),
        nativeNavigationActive: true,
        nativeNavigationStatus: "正在调用原生导航 SDK...",
        nativeNavigationStatusTone: "success",
      },
    }));

    try {
      const nativeResult = await requestDriverNativeNavigation({
        task: taskSnapshot,
        navigationUrl,
        geoPoint: watermarkGeoPoint,
        operatorId: currentUser.userId ?? currentUser.id,
      });
      const opened = nativeResult.status === "opened";
      const canceled = nativeResult.status === "canceled";
      const message = nativeResult.message || (opened ? "原生导航 SDK 已打开导航。" : "原生导航 SDK 未返回明确结果。");
      setTaskInputs((current) => {
        const currentTaskInput = current[taskId] ?? {};
        const currentChecks = currentTaskInput.deviceFieldTestChecks ?? createDriverDeviceFieldTestChecks(deviceReadiness);
        const nextTaskInput = {
          ...currentTaskInput,
          nativeNavigationActive: false,
          nativeNavigationStatus: message,
          nativeNavigationStatusTone: opened ? "success" : canceled ? "neutral" : "warning",
        };
        if (opened) {
          nextTaskInput.deviceFieldTestChecks = updateDriverDeviceFieldTestCheck(currentChecks, "navigation", "passed", deviceReadiness);
          nextTaskInput.deviceFieldTestNote = appendDriverDeviceFieldTestNote(
            currentTaskInput.deviceFieldTestNote,
            `原生导航SDK打开成功：${nativeResult.mapApp || "系统地图"} · ${taskSnapshot.address}`,
          );
          nextTaskInput.deviceFieldTestStatus = "现场验收记录未保存";
        } else if (nativeResult.status === "failed" || nativeResult.status === "unavailable") {
          nextTaskInput.deviceFieldTestChecks = updateDriverDeviceFieldTestCheck(currentChecks, "navigation", "failed", deviceReadiness);
          nextTaskInput.deviceFieldTestNote = appendDriverDeviceFieldTestNote(currentTaskInput.deviceFieldTestNote, `原生导航SDK异常：${message}`);
          nextTaskInput.deviceFieldTestStatus = "现场验收记录未保存";
        }
        return {
          ...current,
          [taskId]: nextTaskInput,
        };
      });
    } catch (error) {
      const message = error?.message ?? "原生导航 SDK 调用失败，请继续使用外部地图链接。";
      setTaskInputs((current) => {
        const currentTaskInput = current[taskId] ?? {};
        const currentChecks = currentTaskInput.deviceFieldTestChecks ?? createDriverDeviceFieldTestChecks(deviceReadiness);
        return {
          ...current,
          [taskId]: {
            ...currentTaskInput,
            nativeNavigationActive: false,
            nativeNavigationStatus: message,
            nativeNavigationStatusTone: "danger",
            deviceFieldTestChecks: updateDriverDeviceFieldTestCheck(currentChecks, "navigation", "failed", deviceReadiness),
            deviceFieldTestNote: appendDriverDeviceFieldTestNote(currentTaskInput.deviceFieldTestNote, `原生导航SDK异常：${message}`),
            deviceFieldTestStatus: "现场验收记录未保存",
          },
        };
      });
    }
  }

  function stopPackageCameraScan(options = {}) {
    const taskSnapshot = selectedTask;
    packageCameraScannerRef.current?.stop?.();
    packageCameraScannerRef.current = null;
    if (!taskSnapshot) return;
    setTaskInputs((current) => {
      const currentTaskInput = current[taskSnapshot.fulfillmentId] ?? {};
      const nextTaskInput = {
        ...currentTaskInput,
        packageCameraScanActive: false,
      };
      if (!options.silent) {
        nextTaskInput.packageCameraScanStatus = options.message ?? "相机扫码已停止。";
        nextTaskInput.packageCameraScanStatusTone = options.tone ?? "success";
      }
      return {
        ...current,
        [taskSnapshot.fulfillmentId]: nextTaskInput,
      };
    });
  }

  async function startDeliveryPhotoCamera() {
    if (!selectedTask) return;
    const taskId = selectedTask.fulfillmentId;
    deliveryPhotoCameraRef.current?.stop?.();
    deliveryPhotoCameraRef.current = null;
    setTaskInputs((current) => ({
      ...current,
      [taskId]: {
        ...(current[taskId] ?? {}),
        deliveryPhotoCameraActive: true,
        deliveryPhotoCameraStatus: "正在打开相机...",
        deliveryPhotoCameraStatusTone: "success",
      },
    }));

    try {
      const session = await startDriverDeliveryPhotoCamera({
        videoElement: deliveryPhotoVideoRef.current,
        onStatus: (message) => {
          setTaskInputs((current) => ({
            ...current,
            [taskId]: {
              ...(current[taskId] ?? {}),
              deliveryPhotoCameraActive: true,
              deliveryPhotoCameraStatus: message,
              deliveryPhotoCameraStatusTone: "success",
            },
          }));
        },
      });
      deliveryPhotoCameraRef.current = session?.stopped ? null : session;
    } catch (error) {
      deliveryPhotoCameraRef.current = null;
      setTaskInputs((current) => ({
        ...current,
        [taskId]: {
          ...(current[taskId] ?? {}),
          deliveryPhotoCameraActive: false,
          deliveryPhotoCameraStatus: error?.message ?? "相机拍照启动失败，请继续用文件上传水印照片。",
          deliveryPhotoCameraStatusTone: "danger",
        },
      }));
    }
  }

  async function captureDeliveryPhotoFromCamera() {
    if (!selectedTask) return;
    const taskId = selectedTask.fulfillmentId;
    try {
      const photo = await captureDriverDeliveryPhotoFromVideo({
        videoElement: deliveryPhotoVideoRef.current,
        fileName: `delivery-watermark-${taskId}.jpg`,
      });
      setTaskInputs((current) => ({
        ...current,
        [taskId]: {
          ...(current[taskId] ?? {}),
          watermarkedPhotoFile: photo.file,
          watermarkedPhotoAttached: true,
          watermarkedPhotoAttachmentId: "",
          deliveryPhotoCameraStatus: `已拍照：${photo.fileName}`,
          deliveryPhotoCameraStatusTone: "success",
        },
      }));
    } catch (error) {
      setTaskInputs((current) => ({
        ...current,
        [taskId]: {
          ...(current[taskId] ?? {}),
          deliveryPhotoCameraStatus: error?.message ?? "拍照失败，请稍后再试或用文件上传。",
          deliveryPhotoCameraStatusTone: "danger",
        },
      }));
    }
  }

  function stopDeliveryPhotoCamera(options = {}) {
    const taskSnapshot = selectedTask;
    deliveryPhotoCameraRef.current?.stop?.();
    deliveryPhotoCameraRef.current = null;
    if (!taskSnapshot) return;
    setTaskInputs((current) => {
      const currentTaskInput = current[taskSnapshot.fulfillmentId] ?? {};
      const nextTaskInput = {
        ...currentTaskInput,
        deliveryPhotoCameraActive: false,
      };
      if (!options.silent) {
        nextTaskInput.deliveryPhotoCameraStatus = options.message ?? "相机拍照已停止。";
        nextTaskInput.deliveryPhotoCameraStatusTone = options.tone ?? "success";
      }
      return {
        ...current,
        [taskSnapshot.fulfillmentId]: nextTaskInput,
      };
    });
  }

  function captureLocation() {
    if (!selectedTask) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      updateTaskInput("watermarkLocationStatus", "当前浏览器不支持定位，已使用送货区域。");
      updateTaskInput("watermarkLocationLabel", watermarkLocationLabel || selectedTask.addressArea || "定位待补");
      return;
    }
    updateTaskInput("watermarkLocationStatus", "正在读取定位...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = Number(position.coords.latitude);
        const longitude = Number(position.coords.longitude);
        const geoPoint = `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
        setTaskInputs((current) => ({
          ...current,
          [selectedTask.fulfillmentId]: {
            ...(current[selectedTask.fulfillmentId] ?? {}),
            watermarkGeoPoint: geoPoint,
            watermarkLocationLabel: watermarkLocationLabel || selectedTask.addressArea || "已读取 GPS",
            watermarkLocationStatus: `已读取 GPS：${geoPoint}`,
          },
        }));
      },
      () => {
        setTaskInputs((current) => ({
          ...current,
          [selectedTask.fulfillmentId]: {
            ...(current[selectedTask.fulfillmentId] ?? {}),
            watermarkLocationLabel: watermarkLocationLabel || selectedTask.addressArea || "定位未授权",
            watermarkLocationStatus: "定位未授权，提交时会保留地址/区域快照。",
          },
        }));
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  }

  function submit(action) {
    if (!selectedTask) return;
    onAction(action, {
      task: selectedTask,
      fulfillmentId: selectedTask.fulfillmentId,
      actualQty,
      receiverName,
      paperNoteStatus,
      watermarkedPhotoAttached,
      signaturePhotoAttached,
      watermarkedPhotoFile,
      signaturePhotoFile,
      watermarkedPhotoAttachmentId,
      signaturePhotoAttachmentId,
      watermarkLocationLabel,
      watermarkGeoPoint,
      watermarkPreviewText: watermarkPreview?.text ?? "",
      routeLabel: routeContext?.hasRoute ? routeContext.routeLabel : "",
      routeStopLabel: routeContext?.hasRoute ? routeContext.stopLabel : "",
      routeProgressLabel: routeContext?.routeProgressLabel ?? "",
      navigationUrl,
      checkedPackageIds,
      packageChecklist: packageCheckState.checklist,
      packageCheckSummary: packageCheckState.summary,
      packageCheckAllDone: packageCheckState.allChecked,
      reason: exceptionReason,
      remark,
    });
  }

  return (
    <section className="page-grid workshop-mobile-layout driver-mobile-workbench">
      <OperationalPanel className="table-pane mobile-role-task-panel driver-task-panel" ariaLabel="司机送货任务列表">
        <MetricStrip items={stats} ariaLabel="司机送货任务摘要" />
        <PanelHeader
          title="司机送货任务"
          summary={`${sourceText} · ${meta.total ?? tasks.length} 条`}
          actions={<Segmented ariaLabel="司机任务状态" value={view} onChange={setView} items={["待送货", "配送中", "已完成", "送货异常", "全部"]} />}
        />
        <div className="mobile-task-list">
          {visibleTasks.length ? visibleTasks.map((task) => (
            <button
              className={`mobile-task-row ${task.fulfillmentId === selectedTask?.fulfillmentId ? "active" : ""}`}
              key={task.fulfillmentId}
              onClick={() => selectTask(task.fulfillmentId)}
            >
              <div>
                <strong>[送货] {task.customerName} · {task.orderTail || task.orderLineId.slice(-5)}</strong>
                <span>{task.addressArea} · {getDriverRouteStopLabel(task)} · {task.packageSummary} · {task.qty} 个</span>
                <small>{getDriverRouteLabel(task)} · {task.latest} · {task.goodsSummary}</small>
              </div>
              <StatusPill tone={task.status === "配送中" ? "blue" : task.status === "送货异常" ? "danger" : statusTone(task.status)}>
                {task.status}
              </StatusPill>
            </button>
          )) : <DataState title="当前视图没有司机送货任务" detail="切换任务状态或刷新后重试。" compact />}
        </div>
      </OperationalPanel>
      <DetailPane className="mobile-role-detail-pane driver-detail-pane" title={selectedTask ? `${selectedTask.customerName} · ${selectedTask.status}` : "司机送货"} subtitle={selectedTask?.orderLineId ?? "未选择"}>
        {selectedTask ? (
          <>
            <InfoGrid
              rows={[
                ["联系人", `${selectedTask.contactName} ${selectedTask.contactPhone}`],
                ["地址", selectedTask.address],
                ["导航区域", selectedTask.addressArea],
                ["路线/站序", `${routeContext?.routeLabel ?? "未排路线"} / ${routeContext?.stopLabel ?? "未排站序"}`],
                ["计划发车", formatDriverDateTime(selectedTask.plannedDepartureAt) || "未排"],
                ["送货单号", selectedTask.deliveryNoteNo],
                ["货品", selectedTask.goodsSummary],
                ["数量/包裹", `${selectedTask.qty} 个 / ${selectedTask.packageSummary}`],
                ["库存来源", selectedTask.inventorySource || "待确认"],
                ["下一步", selectedTask.nextStep],
                ["客户备注", selectedTask.customerNote || "无"],
                ["办公室备注", selectedTask.officeNote || "无"],
              ]}
            />
            <section className="detail-section driver-route-section">
              <h3>路线执行</h3>
              <div className="driver-route-summary">
                <div>
                  <span>当前路线</span>
                  <strong>{routeContext?.routeLabel ?? "未排路线"}</strong>
                  <small>{routeContext?.stopLabel ?? "未排站序"} · {routeContext?.routeProgressLabel ?? "未排"} · {formatDriverDateTime(selectedTask.plannedDepartureAt) || "计划发车未排"}</small>
                </div>
                <div className="driver-route-neighbors">
                  <span>前一站：{formatDriverRouteNeighbor(routeContext?.previousTask)}</span>
                  <span>下一站：{formatDriverRouteNeighbor(routeContext?.nextTask)}</span>
                </div>
                <p>
                  {routeContext?.pendingBeforeCount
                    ? `前方还有 ${routeContext.pendingBeforeCount} 个未装车/未完成站点，装车前注意核对站序。`
                    : routeContext?.hasRoute
                      ? "当前站序可执行；如货物或单据不一致，走装车异常退回办公室处理。"
                      : "该任务尚未排路线；司机可按办公室临时通知执行，后续由办公室补派单。"}
                </p>
                <div className="driver-route-actions">
                  {navigationUrl ? (
                    <a className="route-nav-button" href={navigationUrl} target="_blank" rel="noreferrer">
                      打开导航
                    </a>
                  ) : (
                    <span className="route-nav-button disabled">导航地址待补</span>
                  )}
                  <button
                    type="button"
                    className="route-nav-button secondary"
                    onClick={startNativeNavigation}
                    disabled={!navigationUrl || !nativeNavigationSupport.supported || nativeNavigationActive}
                    title={nativeNavigationSupport.supported ? "调用手机原生地图 SDK" : nativeNavigationSupport.message}
                  >
                    {nativeNavigationActive ? "调用中" : "原生导航"}
                  </button>
                  <span>{selectedTask.address}</span>
                </div>
                <small className={`driver-native-navigation-status ${nativeNavigationStatusTone}`}>
                  {nativeNavigationStatus}
                </small>
              </div>
            </section>
            <section className="detail-section driver-device-section">
              <div className="section-title-row">
                <h3>设备自检</h3>
                <span className={`driver-device-summary ${deviceReadiness.summary.tone}`}>
                  {deviceReadiness.summary.label}
                </span>
              </div>
              <div className="driver-device-grid">
                {deviceReadiness.items.map((item) => (
                  <div className={`driver-device-item ${item.tone}`} key={item.key}>
                    <strong>{item.label}</strong>
                    <span>{item.statusLabel}</span>
                    <small>{item.message}</small>
                  </div>
                ))}
              </div>
              <div className="driver-native-diagnostics">
                <div className="driver-native-diagnostics-head">
                  <strong>原生桥接</strong>
                  <span className={`driver-device-summary ${nativeCapabilityDiagnostics.tone}`}>
                    {nativeCapabilityDiagnostics.label}
                  </span>
                </div>
                <div className="driver-native-diagnostics-grid">
                  {nativeCapabilityDiagnostics.items.map((item) => (
                    <div className={`driver-device-item ${item.tone}`} key={item.key}>
                      <strong>{item.label}</strong>
                      <span>{item.statusLabel} · {item.bridgeTypeLabel}</span>
                      <small>{item.version}</small>
                    </div>
                  ))}
                </div>
                <small>{nativeCapabilityDiagnostics.message}</small>
                {nativeIntegrationKit ? (
                  <div className="driver-native-integration-kit">
                    <strong>{nativeIntegrationKit.title}</strong>
                    <span>{nativeIntegrationKitSummary}</span>
                    <small>{nativeIntegrationKit.eventNames.join(" / ")}</small>
                  </div>
                ) : null}
              </div>
            </section>
            <section className="detail-section driver-field-test-section">
              <div className="section-title-row">
                <h3>现场验收</h3>
                <span className={`driver-device-summary ${deviceFieldTestSummary.tone}`}>
                  {deviceFieldTestSummary.label}
                </span>
              </div>
              <div className="driver-field-test-form">
                <label>
                  <span>手机型号</span>
                  <input
                    value={deviceFieldTestDeviceLabel}
                    onChange={(event) => updateTaskInput("deviceFieldTestDeviceLabel", event.target.value)}
                    placeholder="如 iPhone 15 / 华为 Mate"
                  />
                </label>
                <label>
                  <span>浏览器</span>
                  <input
                    value={deviceFieldTestBrowserLabel}
                    onChange={(event) => updateTaskInput("deviceFieldTestBrowserLabel", event.target.value)}
                    placeholder="如 Chrome / Safari"
                  />
                </label>
              </div>
              <div className="driver-field-test-list">
                {deviceFieldTestChecks.map((item) => (
                  <label className={`driver-field-test-row ${item.tone}`} key={item.key}>
                    <div>
                      <strong>{item.label}</strong>
                      <span>{item.target}</span>
                      <small>{item.readinessMessage ? `自检：${item.readinessMessage}` : "现场手动确认"}</small>
                    </div>
                    <select value={item.status} onChange={(event) => updateDeviceFieldTestCheck(item.key, event.target.value)}>
                      {DRIVER_DEVICE_FIELD_TEST_STATUS_OPTIONS.map((option) => (
                        <option value={option.value} key={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <div className="driver-field-test-note">
                <input
                  value={deviceFieldTestNote}
                  onChange={(event) => updateTaskInput("deviceFieldTestNote", event.target.value)}
                  placeholder="记录手机、权限、扫码或拍照问题"
                />
                <button
                  type="button"
                  onClick={saveDeviceFieldTestRecord}
                  disabled={fieldTestSaveState.disabled}
                  title={fieldTestSaveState.title}
                >
                  保存验收
                </button>
              </div>
              <div className={`driver-field-test-sample ${packageLabelScanSample?.tone ?? "neutral"}`}>
                <strong>标签样本</strong>
                <span>{packageLabelScanSampleSummary}</span>
                <small>
                  {packageLabelScanSample
                    ? `预期 ${packageLabelScanSample.expectedPackageId || "待确认"} · 实扫 ${packageLabelScanSample.scannedText || "未取到码"} · ${formatDriverDateTime(packageLabelScanSample.checkedAt)}`
                    : "扫码枪、手输或相机扫过纸质标签后自动记录。"}
                </small>
              </div>
              <div className={`driver-field-test-sample ${nativeBridgeFieldTestSnapshot?.tone ?? "neutral"}`}>
                <strong>原生快照</strong>
                <span>{nativeBridgeFieldTestSnapshot?.label ?? "未记录原生桥接"}</span>
                <small>{nativeBridgeFieldTestSnapshotText || "保存验收时记录原生壳接入状态。"}</small>
              </div>
              <small className={`driver-field-test-status ${deviceFieldTestRecord?.summary?.tone ?? deviceFieldTestSummary.tone}`}>
                {deviceFieldTestStatus}
              </small>
              {deviceFieldTestRecord ? (
                <div className="driver-field-test-record">
                  <strong>{deviceFieldTestRecord.recordId}</strong>
                  <span>{formatDriverDateTime(deviceFieldTestRecord.checkedAt)}</span>
                  <small>{deviceFieldTestRecord.deviceLabel} · {deviceFieldTestRecord.browserLabel} · {deviceFieldTestRecord.summary.label}</small>
                </div>
              ) : null}
            </section>
            <section className="detail-section driver-load-check-section">
              <div className="section-title-row">
                <h3>装车清单</h3>
                <button type="button" onClick={() => setAllPackagesChecked(!packageCheckState.allChecked)}>
                  {packageCheckState.allChecked ? "取消全选" : "全部核对"}
                </button>
              </div>
              <div className="driver-load-check-summary">
                <strong>{packageCheckState.summary}</strong>
                <span>{packageCheckState.allChecked ? "包裹已核对，可确认装车。" : `还有 ${packageCheckState.missingCount} 包未核对，不能确认装车。`}</span>
              </div>
              <div className="driver-load-scan-row">
                <label>
                  <span>扫码核包</span>
                  <div className="inline-control driver-load-scan-actions">
                    <input
                      value={packageScanText}
                      onChange={(event) => updateTaskInput("packageScanText", event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          applyPackageScan(event.currentTarget.value);
                        }
                      }}
                      placeholder="扫描或输入包裹号"
                    />
                    <button type="button" onClick={applyPackageScan}>核对</button>
                    <button type="button" onClick={packageCameraScanActive ? () => stopPackageCameraScan() : startPackageCameraScan}>
                      {packageCameraScanActive ? "停止相机" : "相机扫码"}
                    </button>
                    <button
                      type="button"
                      onClick={startNativePackageScan}
                      disabled={packageNativeScanActive || !nativePackageScanSupport.supported}
                      title={nativePackageScanSupport.message}
                    >
                      {packageNativeScanActive ? "原生扫码中" : "原生扫码"}
                    </button>
                  </div>
                  <small className={currentInput.packageScanStatusTone === "danger" ? "scan-error" : ""}>
                    {packageScanStatus || "扫描枪回车或手输包裹号后自动勾选。"}
                  </small>
                  <small className={currentInput.packageCameraScanStatusTone === "danger" ? "scan-error" : ""}>
                    {packageCameraScanStatus || "相机未启动。"}
                  </small>
                  <small className={currentInput.packageNativeScanStatusTone === "danger" ? "scan-error" : ""}>
                    {packageNativeScanStatus}
                  </small>
                  <video
                    ref={packageCameraVideoRef}
                    className={packageCameraScanActive ? "driver-camera-scan-preview" : "driver-camera-scan-preview hidden"}
                    muted
                    playsInline
                  />
                </label>
              </div>
              <div className="driver-load-package-list">
                {packageCheckState.checklist.map((item) => {
                  const checked = checkedPackageIds.includes(item.packageId);
                  return (
                    <label className={checked ? "driver-load-package checked" : "driver-load-package"} key={item.packageId}>
                      <input type="checkbox" checked={checked} onChange={() => togglePackageCheck(item.packageId)} />
                      <strong>{item.labelText}</strong>
                      <span>{item.quantityText}</span>
                      <small title={item.packageId}>{[item.status, item.packageId].filter(Boolean).join(" · ")}</small>
                    </label>
                  );
                })}
              </div>
            </section>
            <section className="detail-section">
              <h3>送达凭证</h3>
              <div className="detail-form driver-proof-form">
                <label>
                  <span>实际数量</span>
                  <input type="number" min="0" value={actualQty} onChange={(event) => updateTaskInput("actualQty", event.target.value)} />
                </label>
                <label>
                  <span>收货人</span>
                  <input value={receiverName} onChange={(event) => updateTaskInput("receiverName", event.target.value)} placeholder="客户签收人" />
                </label>
                <label>
                  <span>纸质联状态</span>
                  <select value={paperNoteStatus} onChange={(event) => updateTaskInput("paperNoteStatus", event.target.value)}>
                    <option>已交回</option>
                    <option>客户留存</option>
                    <option>未带回</option>
                  </select>
                </label>
                <label className="driver-location-row">
                  <span>定位备注</span>
                  <div className="inline-control">
                    <input value={watermarkLocationLabel} onChange={(event) => updateTaskInput("watermarkLocationLabel", event.target.value)} placeholder="门店、门岗、仓库区域" />
                    <button type="button" onClick={captureLocation}>读取定位</button>
                  </div>
                  <small>{watermarkGeoPoint || watermarkLocationStatus || "提交时写入地址/定位快照"}</small>
                </label>
                <label className="evidence-row">
                  <span>水印照片</span>
                  <input
                    accept="image/*"
                    capture="environment"
                    type="file"
                    onChange={(event) => updateTaskInput("watermarkedPhotoFile", event.target.files?.[0] ?? null)}
                  />
                  <div className="delivery-photo-camera-actions">
                    <button type="button" onClick={deliveryPhotoCameraActive ? () => stopDeliveryPhotoCamera() : startDeliveryPhotoCamera}>
                      {deliveryPhotoCameraActive ? "停止相机" : "打开相机"}
                    </button>
                    <button type="button" disabled={!deliveryPhotoCameraActive} onClick={captureDeliveryPhotoFromCamera}>
                      拍照
                    </button>
                  </div>
                  <small className={currentInput.deliveryPhotoCameraStatusTone === "danger" ? "scan-error" : ""}>
                    {deliveryPhotoCameraStatus || "可直接拍送货水印照片，也可继续上传文件。"}
                  </small>
                  <video
                    ref={deliveryPhotoVideoRef}
                    className={deliveryPhotoCameraActive ? "delivery-photo-camera-preview" : "delivery-photo-camera-preview hidden"}
                    muted
                    playsInline
                  />
                  <small>{watermarkedPhotoFile?.name || (watermarkedPhotoAttached ? "已记录水印照片" : "必须上传")}</small>
                  {photoPreviewUrls.watermarked ? (
                    <div className="photo-proof-preview watermarked-preview">
                      <img alt="送货水印照片预览" src={photoPreviewUrls.watermarked} />
                      <div className="photo-watermark-overlay">
                        {watermarkPreviewLines.map((line) => <span key={line}>{line}</span>)}
                      </div>
                    </div>
                  ) : null}
                </label>
                <label className="evidence-row">
                  <span>签收照片</span>
                  <input
                    accept="image/*"
                    capture="environment"
                    type="file"
                    onChange={(event) => updateTaskInput("signaturePhotoFile", event.target.files?.[0] ?? null)}
                  />
                  <small>{signaturePhotoFile?.name || (signaturePhotoAttached ? "已记录签收照片" : "可选")}</small>
                  {photoPreviewUrls.signature ? (
                    <div className="photo-proof-preview">
                      <img alt="签收照片预览" src={photoPreviewUrls.signature} />
                    </div>
                  ) : null}
                </label>
                <label>
                  <span>备注</span>
                  <input value={remark} onChange={(event) => updateTaskInput("remark", event.target.value)} placeholder="楼层、门岗、客户补充说明" />
                </label>
                {watermarkPreview ? (
                  <div className="watermark-preview">
                    <span>水印信息</span>
                    <strong>{watermarkPreview.title}</strong>
                    <p>{watermarkPreview.text}</p>
                  </div>
                ) : null}
              </div>
            </section>
            <section className="detail-section">
              <h3>异常</h3>
              <div className="detail-form">
                <label>
                  <span>原因</span>
                  <select value={exceptionReason} onChange={(event) => updateTaskInput("exceptionReason", event.target.value)}>
                    <option>装车少货</option>
                    <option>地址不清</option>
                    <option>客户不在</option>
                    <option>拒收</option>
                    <option>其他</option>
                  </select>
                </label>
              </div>
            </section>
            <div className="action-row">
              <button
                className="primary-action"
                disabled={loadState.disabled || selectedTask.status !== "待送货" || loadBlockedByPackageCheck}
                title={
                  loadState.title ||
                  (selectedTask.status !== "待送货"
                    ? "只有待送货任务可确认装车"
                    : loadBlockedByPackageCheck
                      ? "请先核对全部包裹"
                      : "")
                }
                onClick={() => submit("确认已装车")}
              >
                确认已装车{routeContext?.hasRoute ? `（${routeContext.stopLabel}）` : ""}
              </button>
              <button
                className="primary-action"
                disabled={completeState.disabled || selectedTask.status !== "配送中" || !watermarkedPhotoAttached}
                title={completeState.title || (selectedTask.status !== "配送中" ? "配送中任务才能提交送达" : !watermarkedPhotoAttached ? "完成送货必须有水印照片" : "")}
                onClick={() => submit("提交送达")}
              >
                提交送达
              </button>
              <button disabled={exceptionState.disabled || selectedTask.status === "已完成"} title={exceptionState.title} onClick={() => submit(exceptionAction)}>
                {exceptionAction}
              </button>
            </div>
            <Timeline
              items={[
                "办公室创建送货任务",
                routeContext?.hasRoute ? `办公室派单：${routeContext.routeLabel} ${routeContext.stopLabel}` : "路线未排，按临时通知执行",
                selectedTask.loadedAt ? "司机已装车" : "等待司机装车",
                selectedTask.status,
                selectedTask.completedAt ? "回单进入办公室复核" : "等待送达凭证",
              ]}
            />
          </>
        ) : (
          <DataState title="当前没有送货任务" detail="当前状态筛选没有匹配任务。" compact />
        )}
      </DetailPane>
    </section>
  );
}

function buildDriverWatermarkPreview({ task, currentUser, watermarkLocationLabel, watermarkGeoPoint }) {
  const orderRef = task.orderTail || task.orderLineId || task.fulfillmentId;
  const timeText = task.watermarkCapturedAt ? formatDriverWatermarkTime(task.watermarkCapturedAt) : "提交时生成";
  const locationText = [watermarkLocationLabel || task.addressArea || "定位待补", watermarkGeoPoint].filter(Boolean).join(" / ");
  const watermarkId = task.watermarkId || "提交时生成";
  const driverName = currentUser?.displayName || currentUser?.loginName || task.driverId || "当前司机";
  const existingText = String(task.watermarkText ?? "").trim();
  const text =
    existingText ||
    [
      `${task.customerName} ${orderRef}`,
      task.deliveryNoteNo ? `单据 ${task.deliveryNoteNo}` : "",
      task.address ? `地址 ${task.address}` : "",
      `司机 ${driverName}`,
      `时间 ${timeText}`,
      `定位 ${locationText}`,
      `水印 ${watermarkId}`,
    ]
      .filter(Boolean)
      .join(" / ");
  return {
    title: `水印编号：${watermarkId}`,
    text,
  };
}

function formatDriverRouteNeighbor(task) {
  if (!task) return "无";
  return `${getDriverRouteStopLabel(task)} ${task.customerName || "客户待确认"} ${task.addressArea || ""}`.trim();
}

function formatDriverWatermarkTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value ?? "");
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDriverDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value ?? "");
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function getDriverWatermarkOverlayLines(text) {
  const parts = String(text ?? "")
    .split(" / ")
    .map((item) => item.trim())
    .filter(Boolean);
  return parts.length ? parts.slice(0, 6) : ["水印信息提交时生成"];
}
