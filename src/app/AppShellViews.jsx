import {
  BellOutlined,
  LockOutlined,
  LogoutOutlined,
  PlusOutlined,
  SearchOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { getRuntimePasswordChangePresentation } from "./runtimeAuthPresentation.js";

export function RuntimeLoginScreen({ error, form, loading, onChange, onSubmit }) {
  return (
    <main className="runtime-login-shell">
      <form className="runtime-login-panel" onSubmit={onSubmit}>
        <div className="runtime-login-brand">
          <div className="brand-mark">ERP</div>
          <div>
            <strong>设计中心小工厂</strong>
            <span>生产系统</span>
          </div>
        </div>
        <div className="runtime-login-heading">
          <h1>账号登录</h1>
          <p>使用已启用的正式员工账号。</p>
        </div>
        <label className="runtime-login-field">
          <span>登录名</span>
          <input
            autoComplete="username"
            autoFocus
            name="loginName"
            onChange={(event) => onChange("loginName", event.target.value)}
            placeholder="请输入登录名"
            value={form.loginName}
          />
        </label>
        <label className="runtime-login-field">
          <span>密码</span>
          <input
            autoComplete="current-password"
            name="password"
            onChange={(event) => onChange("password", event.target.value)}
            placeholder="请输入密码"
            type="password"
            value={form.password}
          />
        </label>
        {error ? <p className="runtime-login-error" role="alert">{error}</p> : null}
        <button className="primary-button runtime-login-submit" disabled={loading} type="submit">
          <UserOutlined aria-hidden="true" />
          {loading ? "登录中" : "登录"}
        </button>
      </form>
    </main>
  );
}

export function RuntimePasswordChangeScreen({ error, form, loading, onChange, onSubmit, passwordPolicy, user }) {
  const policyDescription = passwordPolicy?.description || "新密码至少 10 位，包含字母和数字，不含空格，且不得包含登录名或员工编号。";
  const presentation = getRuntimePasswordChangePresentation(user);
  return (
    <main className="runtime-login-shell">
      <form className="runtime-login-panel runtime-password-change-panel" onSubmit={onSubmit}>
        <div className="runtime-login-brand">
          <div className="brand-mark">ERP</div>
          <div>
            <strong>设计中心小工厂</strong>
            <span>生产系统</span>
          </div>
        </div>
        <div className="runtime-login-heading">
          <h1>{presentation.title}</h1>
          <p>{user?.displayName || user?.loginName || "当前账号"}{presentation.description}</p>
        </div>
        <p className="runtime-password-policy">{policyDescription}</p>
        <label className="runtime-login-field">
          <span>{presentation.currentPasswordLabel}</span>
          <input
            autoComplete="current-password"
            autoFocus
            name="currentPassword"
            onChange={(event) => onChange("currentPassword", event.target.value)}
            placeholder={presentation.currentPasswordPlaceholder}
            type="password"
            value={form.currentPassword}
          />
        </label>
        <label className="runtime-login-field">
          <span>新密码</span>
          <input
            autoComplete="new-password"
            name="newPassword"
            onChange={(event) => onChange("newPassword", event.target.value)}
            placeholder="请输入新密码"
            type="password"
            value={form.newPassword}
          />
        </label>
        <label className="runtime-login-field">
          <span>确认新密码</span>
          <input
            autoComplete="new-password"
            name="confirmPassword"
            onChange={(event) => onChange("confirmPassword", event.target.value)}
            placeholder="请再次输入新密码"
            type="password"
            value={form.confirmPassword}
          />
        </label>
        {error ? <p className="runtime-login-error" role="alert">{error}</p> : null}
        <button className="primary-button runtime-login-submit" disabled={loading} type="submit">
          <LockOutlined aria-hidden="true" />
          {loading ? presentation.submittingLabel : presentation.submitLabel}
        </button>
      </form>
    </main>
  );
}

export function Topbar({ authSourceLabel, currentUserId, currentUser, firstReleaseMode = false, onCreateOrder, onOpenTodos, onLogout, onUserChange, logoutLoading, todoCount, userOptions, getUiActionState }) {
  const createOrderState = getUiActionState("topbar", "新建订单");
  const currentUserOption = userOptions.find((item) => item.userId === currentUserId);
  const currentRoleLabel = currentUserOption?.roleLabel || "正式账号";
  return (
    <header className="topbar">
      <div className="factory-switcher">
        虎门工厂
      </div>
      {!firstReleaseMode ? <>
        <label className="search">
          <SearchOutlined aria-hidden="true" />
          <input aria-label="全局搜索" placeholder="搜索客户 / 订单 / 尺寸 / 颜色 / 单据" />
        </label>
        <button className="primary-button" disabled={createOrderState.disabled} title={createOrderState.title} onClick={onCreateOrder} type="button">
          <PlusOutlined aria-hidden="true" />
          新建订单
        </button>
        <button className="icon-button has-badge" aria-label={`打开公共待办，未处理 ${todoCount} 条`} data-count={todoCount} onClick={onOpenTodos} title="打开公共待办" type="button">
          <BellOutlined aria-hidden="true" />
        </button>
      </> : <strong className="topbar-release-scope">原材料独立首发</strong>}
      {onLogout ? (
        <button
          className="icon-button"
          aria-label="退出登录"
          disabled={logoutLoading}
          title={logoutLoading ? "正在退出登录" : "退出登录"}
          onClick={onLogout}
          type="button"
        >
          <LogoutOutlined aria-hidden="true" />
        </button>
      ) : null}
      <div className="user-block" title={`${currentUser.displayName} · ${currentRoleLabel} · ${authSourceLabel}`}>
        <strong>{currentUser.displayName}</strong>
        {userOptions.length > 1 ? (
          <select aria-label="切换当前账号" value={currentUserId} onChange={(event) => onUserChange(event.target.value)}>
            {userOptions.map((item) => (
              <option key={item.userId} value={item.userId}>{item.displayName} · {item.roleLabel}</option>
            ))}
          </select>
        ) : (
          <span>{currentUser.defaultRole || "正式账号"}</span>
        )}
      </div>
    </header>
  );
}
