import {
  BellOutlined,
  DownOutlined,
  PlusOutlined,
  SearchOutlined,
  UserOutlined,
} from "@ant-design/icons";

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
          <UserOutlined />
          {loading ? "登录中" : "登录"}
        </button>
      </form>
    </main>
  );
}
export function Topbar({ authSourceLabel, currentUserId, currentUser, onCreateOrder, onUserChange, todoCount, userOptions, getUiActionState }) {
  const createOrderState = getUiActionState("topbar", "新建订单");
  return (
    <header className="topbar">
      <div className="factory-switcher">
        虎门工厂
        <DownOutlined />
      </div>
      <label className="search">
        <SearchOutlined />
        <input placeholder="搜索客户 / 订单 / 尺寸 / 颜色 / 单据" />
      </label>
      <div className="sync-status">
        <span className="dot" />
        {authSourceLabel}
      </div>
      <span className="last-sync">当前：2026-06-29 10:30</span>
      <button className="primary-button" disabled={createOrderState.disabled} title={createOrderState.title} onClick={onCreateOrder}>
        <PlusOutlined />
        新建订单
      </button>
      <button className="icon-button has-badge" aria-label={`通知 ${todoCount}`} data-count={todoCount}>
        <BellOutlined />
      </button>
      <button className="icon-button" aria-label="用户">
        <UserOutlined />
      </button>
      <div className="user-block">
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
