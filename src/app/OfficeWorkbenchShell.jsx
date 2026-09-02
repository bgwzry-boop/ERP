import { MenuFoldOutlined } from "@ant-design/icons";
import bagwinSidebarLogoUrl from "../assets/brand/BAGWIN_ERP_sidebar_horizontal_color.svg";
import bagwinSymbolUrl from "../assets/brand/BAGWIN_symbol_color.svg";
import { seedUserOptions, getUiActionState } from "../auth/seedPermissions.js";
import { WorkspaceNotice, WorkspacePageHeader } from "../shared/ui/operational.jsx";
import { AppNavigation, ContextNavigationStrip } from "./AppNavigation.jsx";
import { MobileRoleShellHeader } from "./MobileRoleShellHeader.jsx";
import { Topbar } from "./AppViews.jsx";
import { OfficeWorkspacePages } from "./OfficeWorkspacePages.jsx";
import { WorkspaceOverlayController } from "./WorkspaceOverlayController.jsx";

export function OfficeWorkbenchShell({ runtime }) {
  const {
    activeMeta,
    authSourceLabel,
    authState,
    createOrderFromTopbar,
    currentUser,
    currentUserId,
    firstReleaseMode,
    formalLoginRequired,
    logoutRuntimeUserSession,
    overlayRuntime,
    pageRuntime,
    permissionContext,
    refreshActivePage,
    renderedPage,
    roleFocusedShellPage,
    runtimeLoginLoading,
    runtimeNotice,
    setActivePage,
    setSidebarCollapsed,
    sidebarCollapsed,
    switchSeedUser,
    toast,
    unhandledTodos,
  } = runtime;

  return (
    <div className={`app-shell app-shell-${renderedPage}${roleFocusedShellPage ? " app-shell-mobile-role" : ""}${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      {!roleFocusedShellPage ? <aside className="sidebar">
        <div className="brand">
          <img alt="袋袋赢 BAGWIN" className="brand-logo-horizontal" src={bagwinSidebarLogoUrl} />
          <img alt="袋袋赢 BAGWIN" className="brand-logo-symbol" src={bagwinSymbolUrl} />
        </div>
        <AppNavigation
          activePage={renderedPage}
          collapsed={sidebarCollapsed}
          permissionContext={permissionContext}
          todoCount={unhandledTodos}
          onNavigate={setActivePage}
        />
        <button
          aria-expanded={!sidebarCollapsed}
          className="collapse-menu"
          onClick={() => setSidebarCollapsed((current) => !current)}
          title={sidebarCollapsed ? "展开菜单" : "收起菜单"}
          type="button"
        >
          <MenuFoldOutlined aria-hidden="true" />
          <span>{sidebarCollapsed ? "展开菜单" : "收起菜单"}</span>
        </button>
      </aside> : null}

      <div className="workspace">
        {roleFocusedShellPage ? (
          <MobileRoleShellHeader
            canViewOwnAttendance={permissionContext.actionPermissions?.includes("attendance.self.read") === true}
            currentUser={currentUser}
            currentUserId={currentUserId}
            demoMode={!formalLoginRequired}
            logoutLoading={runtimeLoginLoading}
            onLogout={logoutRuntimeUserSession}
            onNavigate={setActivePage}
            onUserChange={switchSeedUser}
            pageKey={renderedPage}
            userOptions={seedUserOptions}
          />
        ) : <Topbar
          authSourceLabel={authSourceLabel}
          currentUserId={currentUserId}
          currentUser={currentUser}
          firstReleaseMode={firstReleaseMode}
          onCreateOrder={createOrderFromTopbar}
          onLogout={formalLoginRequired && authState.authenticated ? logoutRuntimeUserSession : undefined}
          onOpenTodos={() => setActivePage("todos")}
          onUserChange={switchSeedUser}
          logoutLoading={runtimeLoginLoading}
          todoCount={unhandledTodos}
          userOptions={formalLoginRequired ? [currentUser] : seedUserOptions}
          getUiActionState={(surface, action) => getUiActionState(permissionContext, surface, action)}
        />}
        <main className="content">
          {runtimeNotice ? <WorkspaceNotice>{runtimeNotice}</WorkspaceNotice> : null}
          {toast && toast !== runtimeNotice ? <WorkspaceNotice>{toast}</WorkspaceNotice> : null}
          {!roleFocusedShellPage ? <WorkspacePageHeader
            title={activeMeta.label}
            onRefresh={renderedPage === "entry" ? undefined : refreshActivePage}
          /> : null}
          {!roleFocusedShellPage ? (
            <ContextNavigationStrip
              activePage={renderedPage}
              onNavigate={setActivePage}
              permissionContext={permissionContext}
              todoCount={unhandledTodos}
            />
          ) : null}
          <OfficeWorkspacePages renderedPage={renderedPage} runtime={pageRuntime} />
        </main>
      </div>

      <WorkspaceOverlayController {...overlayRuntime} />
    </div>
  );
}
