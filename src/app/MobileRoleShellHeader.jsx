import { getMobileRoleHomePage, getMobileRoleTitle } from "./navigation.js";

export function MobileRoleShellHeader({
  currentUser,
  currentUserId,
  demoMode = false,
  logoutLoading = false,
  onLogout,
  onNavigate,
  onUserChange,
  pageKey,
  canViewOwnAttendance = false,
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
        {canViewOwnAttendance ? <button onClick={() => onNavigate?.(pageKey === "attendanceMobile" ? getMobileRoleHomePage(currentUser) : "attendanceMobile")} type="button">
          {pageKey === "attendanceMobile" ? "返回任务" : "我的考勤"}
        </button> : null}
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
