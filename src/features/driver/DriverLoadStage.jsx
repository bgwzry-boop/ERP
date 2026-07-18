export function DriverLoadStage({
  task,
  routeContext,
  packageCheckState,
  checkedPackageIds,
  loadState,
  loadBlockedByPackageCheck,
  packageScanText,
  packageScanStatus,
  packageScanStatusTone,
  packageCameraScanActive,
  packageCameraScanStatus,
  packageCameraScanStatusTone,
  packageNativeScanActive,
  packageNativeScanStatus,
  packageNativeScanStatusTone,
  nativePackageScanSupport,
  packageCameraVideoRef,
  onSetAllChecked,
  onSubmit,
  onUpdateInput,
  onApplyPackageScan,
  onTogglePackageCamera,
  onNativePackageScan,
  onTogglePackageCheck,
}) {
  return (
    <section className="detail-section driver-load-check-section mobile-role-stage driver-load-stage">
      <div className="section-title-row">
        <h3>装车清单</h3>
        <button type="button" onClick={() => onSetAllChecked(!packageCheckState.allChecked)}>{packageCheckState.allChecked ? "取消全选" : "全部核对"}</button>
      </div>
      <div className="driver-load-check-summary">
        <strong>{packageCheckState.summary}</strong>
        <span>{packageCheckState.allChecked ? "包裹已核对，可确认装车。" : `还有 ${packageCheckState.missingCount} 包未核对，不能确认装车。`}</span>
      </div>
      <div className="action-row mobile-role-stage-actions driver-stage-action-bar">
        <button
          className="primary-action"
          disabled={loadState.disabled || task.status !== "待送货" || loadBlockedByPackageCheck}
          title={loadState.title || (task.status !== "待送货" ? "只有待送货任务可确认装车" : loadBlockedByPackageCheck ? "请先核对全部包裹" : "")}
          onClick={() => onSubmit("确认已装车")}
        >
          确认已装车{routeContext?.hasRoute ? `（${routeContext.stopLabel}）` : ""}
        </button>
      </div>
      <div className="driver-load-scan-row">
        <label>
          <span>扫码核包</span>
          <div className="inline-control driver-load-scan-actions">
            <input
              value={packageScanText}
              onChange={(event) => onUpdateInput("packageScanText", event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onApplyPackageScan(event.currentTarget.value);
                }
              }}
              placeholder="扫描或输入包裹号"
            />
            <button type="button" onClick={() => onApplyPackageScan()}>核对</button>
            <button type="button" onClick={onTogglePackageCamera}>{packageCameraScanActive ? "停止相机" : "相机扫码"}</button>
            <button type="button" onClick={onNativePackageScan} disabled={packageNativeScanActive || !nativePackageScanSupport.supported} title={nativePackageScanSupport.message}>
              {packageNativeScanActive ? "原生扫码中" : "原生扫码"}
            </button>
          </div>
          <small className={packageScanStatusTone === "danger" ? "scan-error" : ""}>{packageScanStatus || "扫描枪回车或手输包裹号后自动勾选。"}</small>
          <small className={packageCameraScanStatusTone === "danger" ? "scan-error" : ""}>{packageCameraScanStatus || "相机未启动。"}</small>
          <small className={packageNativeScanStatusTone === "danger" ? "scan-error" : ""}>{packageNativeScanStatus}</small>
          <video ref={packageCameraVideoRef} className={packageCameraScanActive ? "driver-camera-scan-preview" : "driver-camera-scan-preview hidden"} muted playsInline />
        </label>
      </div>
      <div className="driver-load-package-list">
        {packageCheckState.checklist.map((item) => {
          const checked = checkedPackageIds.includes(item.packageId);
          return (
            <label className={checked ? "driver-load-package checked" : "driver-load-package"} key={item.packageId}>
              <input type="checkbox" checked={checked} onChange={() => onTogglePackageCheck(item.packageId)} />
              <strong>{item.labelText}</strong>
              <span>{item.quantityText}</span>
              <small title={item.packageId}>{[item.status, item.packageId].filter(Boolean).join(" · ")}</small>
            </label>
          );
        })}
      </div>
    </section>
  );
}
