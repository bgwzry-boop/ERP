import { InfoGrid } from "../../shared/ui/operational.jsx";
import { getDriverRouteStopLabel } from "../../services/driverMobileApiClient.js";
import { formatDriverDateTime, formatDriverRouteNeighbor } from "./driverMobilePresentation.js";

export function DriverRouteStage({
  task,
  routeContext,
  navigationUrl,
  nativeNavigationSupport,
  nativeNavigationActive,
  nativeNavigationStatus,
  nativeNavigationStatusTone,
  exceptionReason,
  exceptionAction,
  exceptionState,
  onNativeNavigation,
  onExceptionReasonChange,
  onSubmit,
}) {
  return (
    <section className="mobile-role-stage driver-route-stage">
      <InfoGrid
        rows={[
          ["联系人", `${task.contactName} ${task.contactPhone}`],
          ["地址", task.address],
          ["导航区域", task.addressArea],
          ["路线/站序", `${routeContext?.routeLabel ?? "未排路线"} / ${routeContext?.stopLabel ?? "未排站序"}`],
          ["计划发车", formatDriverDateTime(task.plannedDepartureAt) || "未排"],
          ["送货单号", task.deliveryNoteNo],
          ["货品", task.goodsSummary],
          ["数量/包裹", `${task.qty} 个 / ${task.packageSummary}`],
          ["库存来源", task.inventorySource || "待确认"],
          ["下一步", task.nextStep],
          ["客户备注", task.customerNote || "无"],
          ["办公室备注", task.officeNote || "无"],
        ]}
      />
      <section className="detail-section driver-route-section">
        <h3>路线执行</h3>
        <div className="driver-route-summary">
          <div>
            <span>当前路线</span>
            <strong>{routeContext?.routeLabel ?? "未排路线"}</strong>
            <small>{routeContext?.stopLabel ?? "未排站序"} · {routeContext?.routeProgressLabel ?? "未排"} · {formatDriverDateTime(task.plannedDepartureAt) || "计划发车未排"}</small>
          </div>
          <div className="driver-route-neighbors">
            <span>前一站：{formatDriverRouteNeighbor(routeContext?.previousTask, getDriverRouteStopLabel)}</span>
            <span>下一站：{formatDriverRouteNeighbor(routeContext?.nextTask, getDriverRouteStopLabel)}</span>
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
              onClick={onNativeNavigation}
              disabled={!navigationUrl || !nativeNavigationSupport.supported || nativeNavigationActive}
              title={nativeNavigationSupport.supported ? "调用手机原生地图 SDK" : nativeNavigationSupport.message}
            >
              {nativeNavigationActive ? "调用中" : "原生导航"}
            </button>
            <span>{task.address}</span>
          </div>
          <small className={`driver-native-navigation-status ${nativeNavigationStatusTone}`}>
            {nativeNavigationStatus}
          </small>
        </div>
      </section>
      <section className="detail-section driver-exception-section">
        <h3>异常上报</h3>
        <div className="detail-form">
          <label>
            <span>原因</span>
            <select value={exceptionReason} onChange={(event) => onExceptionReasonChange(event.target.value)}>
              <option>装车少货</option>
              <option>地址不清</option>
              <option>客户不在</option>
              <option>拒收</option>
              <option>其他</option>
            </select>
          </label>
        </div>
        <div className="action-row mobile-role-stage-actions">
          <button disabled={exceptionState.disabled || task.status === "已完成"} title={exceptionState.title} onClick={() => onSubmit(exceptionAction)}>
            {exceptionAction}
          </button>
        </div>
      </section>
    </section>
  );
}
