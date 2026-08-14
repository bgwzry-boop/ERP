import { useEffect, useRef, useState } from "react";
import {
  AppstoreOutlined,
  CarOutlined,
  CheckCircleOutlined,
  EnvironmentOutlined,
  InboxOutlined,
  SafetyCertificateOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import {
  DataState,
  DetailPane,
  OperationalPanel,
  PanelHeader,
  Segmented,
  Timeline,
} from "../../shared/ui/operational.jsx";
import { MobileRoleBottomNavigation } from "../../shared/ui/MobileRoleBottomNavigation.jsx";
import {
  applyDriverPackageScan,
  getDriverLoadPackageCheckState,
  getDriverNavigationUrl,
  getDriverRouteExecutionContext,
} from "../../services/driverMobileApiClient.js";
import {
  appendDriverDeviceFieldTestNote,
  applyDriverPackageCameraFieldTestSignal,
  applyDriverPackageLabelScanFieldTestSignal,
  buildDriverDeviceFieldTestRecord,
  buildDriverNativeNavigationSample,
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
import { buildDriverDeliveryCompletionSummary } from "../../services/driverDeliveryCompletionClient.js";
import { DriverDeliveryStage } from "./DriverDeliveryStage.jsx";
import { DriverDeviceStage } from "./DriverDeviceStage.jsx";
import { DriverLoadStage } from "./DriverLoadStage.jsx";
import { DriverRouteStage } from "./DriverRouteStage.jsx";
import { DriverTaskList } from "./DriverTaskList.jsx";

const MOBILE_VIEWS = [
  ["current", "当前任务", InboxOutlined],
  ["pending", "待处理", UnorderedListOutlined],
  ["all", "全部功能", AppstoreOutlined],
];

export function DriverMobilePage({ tasks = [], selectedTaskId, setSelectedTaskId, meta = {}, onAction, helpers }) {
  const { currentUser, getUiActionState, statusTone } = helpers;
  const [view, setView] = useState("待送货");
  const [mobileView, setMobileView] = useState("current");
  const [detailView, setDetailView] = useState("装车");
  const [taskInputs, setTaskInputs] = useState({});
  const [deliveryCompletionConfirmation, setDeliveryCompletionConfirmation] = useState(null);
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState({ watermarked: "", signature: "" });
  const packageCameraVideoRef = useRef(null);
  const packageCameraScannerRef = useRef(null);
  const deliveryPhotoVideoRef = useRef(null);
  const deliveryPhotoCameraRef = useRef(null);
  const deliveryCompletionConfirmationRef = useRef(null);
  const deliveryCompletionTriggerRef = useRef(null);
  const restoreDeliveryCompletionTriggerFocusRef = useRef(false);
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
  const deviceReadiness = getDriverDeviceReadiness();
  const fieldTestContext = getDriverDeviceFieldTestContext();
  const deviceFieldTestChecks = currentInput.deviceFieldTestChecks ?? createDriverDeviceFieldTestChecks(deviceReadiness);
  const deviceFieldTestSummary = getDriverDeviceFieldTestSummary(deviceFieldTestChecks);
  const deviceFieldTestRecord = currentInput.deviceFieldTestRecord ?? selectedTask?.deviceFieldTestRecord ?? null;
  const packageLabelScanSample = currentInput.packageLabelScanSample ?? deviceFieldTestRecord?.packageLabelScanSample ?? null;
  const packageLabelScanSampleSummary = getDriverPackageLabelScanSampleSummary(packageLabelScanSample);
  const nativeNavigationSample = currentInput.nativeNavigationSample ?? deviceFieldTestRecord?.nativeNavigationSample ?? null;
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

  useEffect(() => {
    setDetailView(getDriverDefaultDetailView(selectedTask?.status));
    setDeliveryCompletionConfirmation(null);
  }, [selectedTask?.fulfillmentId, selectedTask?.status]);

  useEffect(() => {
    if (deliveryCompletionConfirmation) {
      deliveryCompletionConfirmationRef.current?.focus();
      return;
    }
    if (restoreDeliveryCompletionTriggerFocusRef.current) {
      restoreDeliveryCompletionTriggerFocusRef.current = false;
      deliveryCompletionTriggerRef.current?.focus();
    }
  }, [deliveryCompletionConfirmation]);

  function selectTask(taskId) {
    setSelectedTaskId(taskId);
    setMobileView("current");
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
      nativeNavigationSample: currentTaskInput.nativeNavigationSample ?? deviceFieldTestRecord?.nativeNavigationSample,
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
          nativeNavigationSample: savedRecord.nativeNavigationSample,
          nativeBridgeDiagnostics: savedRecord.nativeBridgeDiagnostics,
          deviceFieldTestStatus: result?.acceptance?.ready
            ? `验收通过：${savedRecord.summary.label}`
            : `记录已保存，验收未通过：${savedRecord.summary.label}`,
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
          requestId: nativeResult.requestId,
          source: nativeResult.source,
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
          nextTaskInput.nativeNavigationSample = buildDriverNativeNavigationSample({
            task: taskSnapshot,
            result: nativeResult,
          });
        } else if (nativeResult.status === "failed" || nativeResult.status === "unavailable") {
          nextTaskInput.deviceFieldTestChecks = updateDriverDeviceFieldTestCheck(currentChecks, "navigation", "failed", deviceReadiness);
          nextTaskInput.deviceFieldTestNote = appendDriverDeviceFieldTestNote(currentTaskInput.deviceFieldTestNote, `原生导航SDK异常：${message}`);
          nextTaskInput.deviceFieldTestStatus = "现场验收记录未保存";
          nextTaskInput.nativeNavigationSample = buildDriverNativeNavigationSample({
            task: taskSnapshot,
            result: nativeResult,
          });
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
            nativeNavigationSample: buildDriverNativeNavigationSample({
              task: taskSnapshot,
              status: "failed",
              source: "native_navigation_sdk",
              message,
            }),
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

  function buildActionPayload() {
    if (!selectedTask) return null;
    return {
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
    };
  }

  function submit(action) {
    if (!selectedTask) return;
    const payload = buildActionPayload();
    if (!payload) return;
    if (action === "提交送达") {
      setDeliveryCompletionConfirmation({
        payload,
        summary: buildDriverDeliveryCompletionSummary({ task: selectedTask, payload }),
      });
      return;
    }
    onAction(action, payload);
  }

  function confirmDeliveryCompletion() {
    if (!deliveryCompletionConfirmation) return;
    const { payload } = deliveryCompletionConfirmation;
    setDeliveryCompletionConfirmation(null);
    onAction("提交送达", { ...payload, deliveryCompletionConfirmed: true });
  }

  function returnToDeliveryCompletionEdit() {
    restoreDeliveryCompletionTriggerFocusRef.current = true;
    setDeliveryCompletionConfirmation(null);
  }

  function handleDeliveryCompletionConfirmationKeyDown(event) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    returnToDeliveryCompletionEdit();
  }

  const pendingCount = tasks.filter((task) => !["已完成", "已交付"].includes(task.status)).length;

  function openDriverFunction(nextDetailView) {
    setDetailView(nextDetailView);
    setMobileView("current");
  }

  return (
    <section className={`guided-mobile-page driver-mobile-workbench view-${mobileView}`}>
      <header className="guided-mobile-hero driver-guided-hero">
        <div>
          <h1>{selectedTask ? `${selectedTask.customerName}送货` : "今日送货"}</h1>
        </div>
        <strong>{pendingCount}<small>待处理</small></strong>
      </header>

      {mobileView === "pending" ? <OperationalPanel className="table-pane mobile-role-task-panel driver-task-panel" ariaLabel="司机送货任务列表">
        <PanelHeader
          title="送货任务"
          summary={`${meta.total ?? tasks.length} 条`}
          actions={<Segmented ariaLabel="司机任务状态" value={view} onChange={setView} items={["待送货", "配送中", "已完成", "送货异常", "全部"]} />}
        />
        <DriverTaskList
          stats={stats}
          visibleTasks={visibleTasks}
          selectedTask={selectedTask}
          onSelect={selectTask}
          statusTone={statusTone}
        />
      </OperationalPanel> : null}
      {mobileView === "current" ? <DetailPane className="mobile-role-detail-pane driver-detail-pane" title={selectedTask ? `${selectedTask.customerName} · ${selectedTask.status}` : "司机送货"} subtitle={selectedTask?.orderLineId ?? "未选择"}>
        {selectedTask ? (
          <>
            <div className="mobile-role-detail-tabs driver-detail-tabs">
              <Segmented ariaLabel="司机任务详情" value={detailView} onChange={setDetailView} items={["路线", "装车", "送达", "设备", "记录"]} />
            </div>
            {detailView === "路线" ? (
              <DriverRouteStage
                task={selectedTask}
                routeContext={routeContext}
                navigationUrl={navigationUrl}
                nativeNavigationSupport={nativeNavigationSupport}
                nativeNavigationActive={nativeNavigationActive}
                nativeNavigationStatus={nativeNavigationStatus}
                nativeNavigationStatusTone={nativeNavigationStatusTone}
                exceptionReason={exceptionReason}
                exceptionAction={exceptionAction}
                exceptionState={exceptionState}
                onNativeNavigation={startNativeNavigation}
                onExceptionReasonChange={(value) => updateTaskInput("exceptionReason", value)}
                onSubmit={submit}
              />
            ) : null}
            {detailView === "设备" ? (
              <DriverDeviceStage
                deviceReadiness={deviceReadiness}
                nativeCapabilityDiagnostics={nativeCapabilityDiagnostics}
                nativeIntegrationKit={nativeIntegrationKit}
                nativeIntegrationKitSummary={nativeIntegrationKitSummary}
                deviceFieldTestSummary={deviceFieldTestSummary}
                deviceFieldTestDeviceLabel={deviceFieldTestDeviceLabel}
                deviceFieldTestBrowserLabel={deviceFieldTestBrowserLabel}
                deviceFieldTestChecks={deviceFieldTestChecks}
                deviceFieldTestNote={deviceFieldTestNote}
                fieldTestSaveState={fieldTestSaveState}
                packageLabelScanSample={packageLabelScanSample}
                packageLabelScanSampleSummary={packageLabelScanSampleSummary}
                nativeBridgeFieldTestSnapshot={nativeBridgeFieldTestSnapshot}
                nativeBridgeFieldTestSnapshotText={nativeBridgeFieldTestSnapshotText}
                nativeNavigationSample={nativeNavigationSample}
                deviceFieldTestStatus={deviceFieldTestStatus}
                deviceFieldTestRecord={deviceFieldTestRecord}
                onUpdateInput={updateTaskInput}
                onUpdateCheck={updateDeviceFieldTestCheck}
                onSave={saveDeviceFieldTestRecord}
              />
            ) : null}
            {detailView === "装车" ? (
              <DriverLoadStage
                task={selectedTask}
                routeContext={routeContext}
                packageCheckState={packageCheckState}
                checkedPackageIds={checkedPackageIds}
                loadState={loadState}
                loadBlockedByPackageCheck={loadBlockedByPackageCheck}
                packageScanText={packageScanText}
                packageScanStatus={packageScanStatus}
                packageScanStatusTone={currentInput.packageScanStatusTone}
                packageCameraScanActive={packageCameraScanActive}
                packageCameraScanStatus={packageCameraScanStatus}
                packageCameraScanStatusTone={currentInput.packageCameraScanStatusTone}
                packageNativeScanActive={packageNativeScanActive}
                packageNativeScanStatus={packageNativeScanStatus}
                packageNativeScanStatusTone={currentInput.packageNativeScanStatusTone}
                nativePackageScanSupport={nativePackageScanSupport}
                packageCameraVideoRef={packageCameraVideoRef}
                onSetAllChecked={setAllPackagesChecked}
                onSubmit={submit}
                onUpdateInput={updateTaskInput}
                onApplyPackageScan={applyPackageScan}
                onTogglePackageCamera={packageCameraScanActive ? () => stopPackageCameraScan() : startPackageCameraScan}
                onNativePackageScan={startNativePackageScan}
                onTogglePackageCheck={togglePackageCheck}
              />
            ) : null}
            {detailView === "送达" ? (
              <DriverDeliveryStage
                task={selectedTask}
                completeState={completeState}
                watermarkedPhotoAttached={watermarkedPhotoAttached}
                deliveryCompletionConfirmation={deliveryCompletionConfirmation}
                deliveryCompletionTriggerRef={deliveryCompletionTriggerRef}
                deliveryCompletionConfirmationRef={deliveryCompletionConfirmationRef}
                onSubmit={submit}
                onReturnToEdit={returnToDeliveryCompletionEdit}
                onConfirm={confirmDeliveryCompletion}
                onConfirmationKeyDown={handleDeliveryCompletionConfirmationKeyDown}
                actualQty={actualQty}
                receiverName={receiverName}
                paperNoteStatus={paperNoteStatus}
                watermarkLocationLabel={watermarkLocationLabel}
                watermarkGeoPoint={watermarkGeoPoint}
                watermarkLocationStatus={watermarkLocationStatus}
                watermarkedPhotoFile={watermarkedPhotoFile}
                signaturePhotoFile={signaturePhotoFile}
                signaturePhotoAttached={signaturePhotoAttached}
                deliveryPhotoCameraActive={deliveryPhotoCameraActive}
                deliveryPhotoCameraStatus={deliveryPhotoCameraStatus}
                deliveryPhotoCameraStatusTone={currentInput.deliveryPhotoCameraStatusTone}
                photoPreviewUrls={photoPreviewUrls}
                watermarkPreview={watermarkPreview}
                watermarkPreviewLines={watermarkPreviewLines}
                remark={remark}
                deliveryPhotoVideoRef={deliveryPhotoVideoRef}
                onUpdateInput={updateTaskInput}
                onCaptureLocation={captureLocation}
                onToggleDeliveryPhotoCamera={deliveryPhotoCameraActive ? () => stopDeliveryPhotoCamera() : startDeliveryPhotoCamera}
                onCaptureDeliveryPhoto={captureDeliveryPhotoFromCamera}
              />
            ) : null}
            {detailView === "记录" ? (
              <section className="mobile-role-stage mobile-role-history-stage">
                <Timeline
                  items={[
                    "办公室创建送货任务",
                    routeContext?.hasRoute ? `办公室派单：${routeContext.routeLabel} ${routeContext.stopLabel}` : "路线未排，按临时通知执行",
                    selectedTask.loadedAt ? "司机已装车" : "等待司机装车",
                    selectedTask.status,
                    selectedTask.completedAt ? "回单进入办公室复核" : "等待送达凭证",
                  ]}
                />
              </section>
            ) : null}
          </>
        ) : (
          <DataState title="当前没有送货任务" detail="当前状态筛选没有匹配任务。" compact />
        )}
      </DetailPane> : null}

      {mobileView === "all" ? (
        <section className="guided-mobile-functions" aria-label="司机全部功能">
          <header><h2>全部功能</h2></header>
          <div>
            <button disabled={!selectedTask} onClick={() => openDriverFunction("路线")} type="button"><EnvironmentOutlined /><strong>今日路线</strong><span>{tasks.length} 单</span></button>
            <button disabled={!selectedTask} onClick={() => openDriverFunction("装车")} type="button"><CarOutlined /><strong>装车核对</strong><span>{tasks.filter((task) => task.status === "待送货").length} 单</span></button>
            <button disabled={!selectedTask} onClick={() => openDriverFunction("送达")} type="button"><CheckCircleOutlined /><strong>送达回单</strong><span>{tasks.filter((task) => task.status === "配送中").length} 单</span></button>
            <button disabled={!selectedTask} onClick={() => openDriverFunction("设备")} type="button"><SafetyCertificateOutlined /><strong>设备检查</strong><span>定位/相机</span></button>
            <button disabled={!selectedTask} onClick={() => openDriverFunction("记录")} type="button"><UnorderedListOutlined /><strong>任务记录</strong><span>查看</span></button>
          </div>
        </section>
      ) : null}

      <MobileRoleBottomNavigation
        ariaLabel="司机手机导航"
        badgeCount={(key) => key === "pending" ? pendingCount : 0}
        items={MOBILE_VIEWS}
        onChange={setMobileView}
        value={mobileView}
      />
    </section>
  );
}

function getDriverDefaultDetailView(status) {
  if (status === "待送货") return "装车";
  if (status === "配送中") return "送达";
  if (status === "已完成") return "记录";
  return "路线";
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

function getDriverWatermarkOverlayLines(text) {
  const parts = String(text ?? "")
    .split(" / ")
    .map((item) => item.trim())
    .filter(Boolean);
  return parts.length ? parts.slice(0, 6) : ["水印信息提交时生成"];
}
