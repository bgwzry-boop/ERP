export function MobileRoleShellHeader({
  currentUser,
  currentUserId,
  demoMode = false,
  logoutLoading = false,
  onLogout,
  onUserChange,
  pageKey,
  userOptions = [],
}) {
  const title = getMobileRoleTitle(pageKey, currentUser);

  return (
    <header className="mobile-role-shell-header">
      <div className="mobile-role-shell-identity">
        <span>{title}</span>
        <strong>{currentUser?.displayName || "当前员工"}</strong>
      </div>
      <div className="mobile-role-shell-session">
        {demoMode ? (
          <label className="mobile-role-demo-switcher">
            <span>演示角色</span>
            <select aria-label="切换演示角色" value={currentUserId} onChange={(event) => onUserChange?.(event.target.value)}>
              {userOptions.map((item) => (
                <option key={item.userId} value={item.userId}>{item.displayName} · {item.roleLabel}</option>
              ))}
            </select>
          </label>
        ) : (
          <button disabled={logoutLoading} onClick={onLogout} type="button">
            {logoutLoading ? "退出中" : "退出登录"}
          </button>
        )}
      </div>
    </header>
  );
}

function getMobileRoleTitle(pageKey, currentUser = {}) {
  if (pageKey === "officeMobile" || pageKey === "rawMaterials") return "办公室手机";
  if (pageKey === "driverMobile") return "司机任务";
  if (pageKey === "warehouseMobile") return "成品库房任务";
  if (pageKey === "rawMaterialScanner") return "原材料扫码出库";
  if (pageKey === "decisionMobile") return "经营决策";
  if (pageKey === "maintenanceMobile") return "设备机修";
  if (pageKey === "desktopRequiredMobile") return "电脑端岗位";
  if (pageKey === "roleBoundary") {
    return currentUser.defaultRole === "warehouse" ? "纸质出库说明" : "岗位说明";
  }
  if (currentUser.defaultRole === "packing") return "打包任务";
  if (String(currentUser.defaultMachineId || "").startsWith("PRINT-")) return "丝印任务";
  return "制袋任务";
}
