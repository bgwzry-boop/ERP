import { useEffect, useState } from "react";
import { requestOfficeApi, readOfficeApiJson } from "../../../../src/services/officeApiClientCore.js";

const sourceReason = (reason) => ({ artifact_missing: "尚未生成或接入该项证据", artifact_read_failed: "证据文件读取失败", artifact_json_invalid: "证据格式无效" })[reason] || (/^[a-z_]+$/.test(reason) ? "证据尚不可用，请核验后端记录" : reason);
const displayTime = (value) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "short", timeStyle: "medium" }).format(new Date(value)) : "未记录";
const sourceState = (state) => ({ loaded: "已读取", missing: "缺少证据", invalid: "证据无效", error: "读取失败" })[state] || "待核验";
export function LaunchStatusWorkspace({ authState }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setResult(null);
    void (async () => {
      try {
        const response = await requestOfficeApi("/system/v1-go-live-status", { authState, serverRequired: true, cache: "no-store", signal: controller.signal });
        const data = await readOfficeApiJson(response);
        if (!response.ok) throw new Error(data?.message || "上线状态读取失败。");
        if (data?.scope !== "v1_go_live_status" || typeof data.ready !== "boolean" || !data.sourceStatus) throw new Error("服务器未返回有效的上线证据，不能判定通过。");
        if (!controller.signal.aborted) setResult(data);
      } catch (failure) { if (!controller.signal.aborted) setError(failure.message); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [authState, refresh]);
  const sources = Object.entries(result?.sourceStatus || {});
  const missing = sources.filter(([, value]) => value.status !== "loaded");
  const ready = result?.ready === true && sources.length > 0 && missing.length === 0 && Boolean(result.generatedAt) && result.releaseCandidate?.gates?.length > 0 && result.releaseCandidate.gates.every((gate) => gate.ready === true);
  return <section className="launch-status-workspace">
    <header><div><h2>上线状态</h2></div><button disabled={loading} onClick={() => setRefresh((value) => value + 1)} type="button">{loading ? "读取中…" : "刷新证据"}</button></header>
    {loading ? <p role="status">正在读取服务器上线证据…</p> : error ? <p className="launch-status-blocked" role="alert">{error} 请重试；当前不能判断为通过。</p> : <>
      <div className={ready ? "launch-status-ready" : "launch-status-blocked"}><h3>{ready ? "后端证据已通过" : "尚未满足上线条件"}</h3><p>{result.conclusion}</p><p>读取时间：{displayTime(result.checkedAt)} · 证据生成时间：{result.generatedAt ? displayTime(result.generatedAt) : "未生成"}</p></div>
      <p>后端只读验收证据；当前环境以顶部版本标记为准。API 可读取不等于已部署或现场验收完成。受控发布仍须匹配前端、API、Git 提交和发布锁。</p>
      <h3>发布门禁</h3>{result.releaseCandidate?.gates?.length ? <ul>{result.releaseCandidate.gates.map((gate, index) => <li key={gate.key || index}>{gate.label || gate.key}：{gate.ready === true ? "通过" : "待完成"}{gate.detail ? ` · ${gate.detail}` : ""}</li>)}</ul> : <p>未提供发布门禁结果，不能视为通过。</p>}
      {result.topBlockers?.length ? <><h3>待处理问题</h3><ul>{result.topBlockers.map((item, index) => <li key={item.key || index}><strong>{item.label}</strong> {item.detail}</li>)}</ul></> : null}
      <h3>证据清单 · {sources.length - missing.length} / {sources.length} 已读取</h3>
      <table><thead><tr><th>检查对象</th><th>状态</th><th>说明</th></tr></thead><tbody>{sources.map(([key, source]) => <tr key={key}><td>{source.label || "未命名证据"}</td><td>{sourceState(source.status)}</td><td>{sourceReason(source.reason) || (source.status === "loaded" ? "已读取服务器证据，具体结论以门禁为准" : "需补齐正式证据")}</td></tr>)}</tbody></table>
    </>}
  </section>;
}
