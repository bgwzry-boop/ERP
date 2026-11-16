export function SignedPreviewSessionNotice({ status }) {
  if (!status?.blocked) return null;
  return <div role="alert" style={{ position: "fixed", inset: "0 0 auto", zIndex: 10000, padding: "16px 24px", background: "#fff4df", color: "#593b13", boxShadow: "0 2px 8px #0002" }}>
    <span>{status.message}</span>{!status.pending && status.canRetry !== false ? <button type="button" onClick={status.retry} style={{ marginLeft: 16 }}>重新验证身份</button> : null}
  </div>;
}
