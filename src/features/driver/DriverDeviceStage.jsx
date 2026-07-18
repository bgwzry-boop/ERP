import { DRIVER_DEVICE_FIELD_TEST_STATUS_OPTIONS } from "../../services/driverDeviceFieldTestClient.js";
import { formatDriverDateTime } from "./driverMobilePresentation.js";

export function DriverDeviceStage({
  deviceReadiness,
  nativeCapabilityDiagnostics,
  nativeIntegrationKit,
  nativeIntegrationKitSummary,
  deviceFieldTestSummary,
  deviceFieldTestDeviceLabel,
  deviceFieldTestBrowserLabel,
  deviceFieldTestChecks,
  deviceFieldTestNote,
  fieldTestSaveState,
  packageLabelScanSample,
  packageLabelScanSampleSummary,
  nativeBridgeFieldTestSnapshot,
  nativeBridgeFieldTestSnapshotText,
  nativeNavigationSample,
  deviceFieldTestStatus,
  deviceFieldTestRecord,
  onUpdateInput,
  onUpdateCheck,
  onSave,
}) {
  return (
    <section className="mobile-role-stage driver-device-stage">
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
            <input value={deviceFieldTestDeviceLabel} onChange={(event) => onUpdateInput("deviceFieldTestDeviceLabel", event.target.value)} placeholder="如 iPhone 15 / 华为 Mate" />
          </label>
          <label>
            <span>浏览器</span>
            <input value={deviceFieldTestBrowserLabel} onChange={(event) => onUpdateInput("deviceFieldTestBrowserLabel", event.target.value)} placeholder="如 Chrome / Safari" />
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
              <select value={item.status} onChange={(event) => onUpdateCheck(item.key, event.target.value)}>
                {DRIVER_DEVICE_FIELD_TEST_STATUS_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
              </select>
            </label>
          ))}
        </div>
        <div className="driver-field-test-note">
          <input value={deviceFieldTestNote} onChange={(event) => onUpdateInput("deviceFieldTestNote", event.target.value)} placeholder="记录手机、权限、扫码或拍照问题" />
          <button type="button" onClick={onSave} disabled={fieldTestSaveState.disabled} title={fieldTestSaveState.title}>保存验收</button>
        </div>
        <div className={`driver-field-test-sample ${packageLabelScanSample?.tone ?? "neutral"}`}>
          <strong>标签样本</strong>
          <span>{packageLabelScanSampleSummary}</span>
          <small>{packageLabelScanSample ? `预期 ${packageLabelScanSample.expectedPackageId || "待确认"} · 实扫 ${packageLabelScanSample.scannedText || "未取到码"} · ${formatDriverDateTime(packageLabelScanSample.checkedAt)}` : "扫码枪、手输或相机扫过纸质标签后自动记录。"}</small>
        </div>
        <div className={`driver-field-test-sample ${nativeBridgeFieldTestSnapshot?.tone ?? "neutral"}`}>
          <strong>原生快照</strong>
          <span>{nativeBridgeFieldTestSnapshot?.label ?? "未记录原生桥接"}</span>
          <small>{nativeBridgeFieldTestSnapshotText || "保存验收时记录原生壳接入状态。"}</small>
        </div>
        <div className={`driver-field-test-sample ${nativeNavigationSample?.status === "opened" ? "success" : "neutral"}`}>
          <strong>导航回执</strong>
          <span>{nativeNavigationSample?.status === "opened" ? "原生导航已打开" : "未记录原生导航成功回执"}</span>
          <small>{nativeNavigationSample?.message || "点击原生导航并成功打开地图后自动记录。"}</small>
        </div>
        <small className="driver-field-test-rule">完整验收必须关联当前任务，由原生 SDK 扫描任务内真实包裹标签，并保留原生导航成功回执。</small>
        <small className={`driver-field-test-status ${deviceFieldTestRecord?.summary?.tone ?? deviceFieldTestSummary.tone}`}>{deviceFieldTestStatus}</small>
        {deviceFieldTestRecord ? (
          <div className="driver-field-test-record">
            <strong>{deviceFieldTestRecord.recordId}</strong>
            <span>{formatDriverDateTime(deviceFieldTestRecord.checkedAt)}</span>
            <small>{deviceFieldTestRecord.deviceLabel} · {deviceFieldTestRecord.browserLabel} · {deviceFieldTestRecord.summary.label}</small>
          </div>
        ) : null}
      </section>
    </section>
  );
}
