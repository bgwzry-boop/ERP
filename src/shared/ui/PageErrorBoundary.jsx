import { Component } from "react";

// 页面级错误边界：单个页面渲染出错时，只替换该页面区域，导航和顶栏保持可用。
// resetKey 变化（例如切换页面）时自动清除错误状态。
export class PageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.handleRetry = this.handleRetry.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[PageErrorBoundary]", this.props.scope ?? "page", error, info?.componentStack);
    this.props.onError?.(error, info);
  }

  componentDidUpdate(previousProps) {
    if (this.state.error && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  handleRetry() {
    this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const message = String(this.state.error?.message ?? "").trim();
    return (
      <div className="data-state danger page-error-boundary" role="alert">
        <span className="data-state-marker" aria-hidden="true" />
        <div>
          <strong>{this.props.title ?? "这个页面出错了"}</strong>
          <span>
            已保存的业务数据不受影响。可以先重试；如果反复出现，请截图发给管理员。
            {message ? `（${message}）` : ""}
          </span>
          <div className="page-error-boundary-actions">
            <button type="button" className="ghost-button" onClick={this.handleRetry}>
              重试
            </button>
            <button type="button" className="ghost-button" onClick={() => window.location.reload()}>
              刷新整页
            </button>
          </div>
        </div>
      </div>
    );
  }
}
