import { Component } from "react";
import { FileTextOutlined, ReloadOutlined, WarningOutlined } from "@ant-design/icons";

export function EmptyWorkspace({ title, description, actionLabel, onAction, error = false }) {
  return <div className={`workspace-empty${error ? " is-error" : ""}`} role={error ? "alert" : "status"}>
    {error ? <WarningOutlined aria-hidden="true" /> : <FileTextOutlined aria-hidden="true" />}
    <strong>{title}</strong>{description ? <p>{description}</p> : null}
    {onAction && actionLabel ? <button type="button" onClick={onAction}><ReloadOutlined aria-hidden="true" />{actionLabel}</button> : null}
  </div>;
}

export function CollectionFeedback({ state, label = "数据", onRetry }) {
  if (!state) return null;
  if (state.error) return <div className="workspace-read-notice error" role="alert"><WarningOutlined aria-hidden="true" /><span>{label}读取失败。{state.hasLoaded ? "已保留上次读取的内容，请刷新后再核对。" : "请检查连接后重新读取。"}</span><button type="button" onClick={onRetry} disabled={state.loading}>重新读取</button></div>;
  if (state.loading) return <div className="workspace-read-notice" role="status"><ReloadOutlined aria-hidden="true" /><span>{state.hasLoaded ? `正在更新${label}…` : `正在读取${label}…`}</span></div>;
  return null;
}

export class WorkspaceErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidUpdate(previous) {
    if (previous.workspaceKey !== this.props.workspaceKey && this.state.failed) this.setState({ failed: false });
  }
  render() {
    if (this.state.failed) return <EmptyWorkspace error title="这个页面暂时无法显示" description="可以先使用左侧其他功能，或重新打开本页。未保存的填写请重新核对。" actionLabel="重新打开本页" onAction={() => this.setState({ failed: false })} />;
    return this.props.children;
  }
}
