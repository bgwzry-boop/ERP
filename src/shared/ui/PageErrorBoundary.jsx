import { Component } from "react";

// 页面级错误边界：单个页面渲染出错时，只替换该页面区域，导航和顶栏保持可用。
// resetKey 变化（例如切换页面）时自动清除错误状态。
function buildErrorRef(now = new Date()) {
  return `ERR-${now.getTime().toString(36).toUpperCase()}`;
}

export class PageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, errorRef: "" };
    this.handleRetry = this.handleRetry.bind(this);
  }

  static getDerivedStateFromError(error) {
    // 2026-11-07：不把英文技术异常直接摊给文员看，只给一个可对照的错误编号。
    return { error, errorRef: buildErrorRef() };
  }

  componentDidCatch(error, info) {
    // 2026-11-07：错误编号必须一起进日志，否则用户报编号时对不上具体异常。
    const errorRef = this.state.errorRef;
    console.error(`[PageErrorBoundary] ${errorRef}`, this.props.scope ?? "page", error, info?.componentStack);
    this.props.onError?.({ errorRef, error, info });
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
    const errorRef = this.state.errorRef;
    return (
      <div className="data-state danger page-error-boundary" role="alert">
        <span className="data-state-marker" aria-hidden="true" />
        <div>
          <strong>{this.props.title ?? "这个页面出错了"}</strong>
          <span>
            已保存的业务数据不受影响。可以先重试；如果反复出现，请截图发给管理员
            {errorRef ? `，并附上错误编号 ${errorRef}` : ""}。
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
