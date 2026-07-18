import { useEffect, useState } from "react";
import { listOfficeBusinessDecisions } from "../services/officeBusinessDecisionApiClient.js";
import { downloadOfficeAttachmentContent } from "../services/officeAttachmentApiClient.js";
import { formatOperationalError } from "../shared/ui/errorPresentation.js";

export function BusinessDecisionHistoryPanel({ authState, operatorId, businessType, businessId, title = "决定与授权记录" }) {
  const [state, setState] = useState({ loading: false, items: [], error: "" });
  const authDependencyKey = buildAuthDependencyKey(authState);
  useEffect(() => {
    let active = true;
    if (!businessId) {
      setState({ loading: false, items: [], error: "" });
      return undefined;
    }
    setState((current) => ({ ...current, loading: true, error: "" }));
    listOfficeBusinessDecisions({ authState, operatorId, businessType, businessId }).then((result) => {
      if (!active) return;
      setState({ loading: false, items: result.items ?? [], error: result.blocked ? formatOperationalError(result.error, "决定记录读取失败，请稍后重试。") : "" });
    });
    return () => { active = false; };
  }, [authDependencyKey, operatorId, businessType, businessId]);

  async function viewAttachment(attachment) {
    const result = await downloadOfficeAttachmentContent({ authState, operatorId, attachmentId: attachment.attachmentId });
    if (result.blocked || !result.contentBlob) {
      setState((current) => ({ ...current, error: formatOperationalError(result.error, "凭据读取失败，请稍后重试。") }));
      return;
    }
    const objectUrl = URL.createObjectURL(result.contentBlob);
    window.open(objectUrl, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }

  return (
    <section className="business-decision-history" aria-label={title}>
      <header><strong>{title}</strong><span>{state.items.length} 条</span></header>
      <div className="business-decision-history__scroll">
        {state.loading ? <p>正在读取…</p> : null}
        {state.error ? <p className="business-decision-fields__error">{state.error}</p> : null}
        {!state.loading && !state.error && state.items.length === 0 ? <p>暂无决定记录</p> : null}
        {state.items.map((item) => (
          <article key={item.businessDecisionId}>
            <div className="business-decision-history__title">
              <strong>{item.decisionContent?.summary || item.decisionScopeLabel}</strong>
              <span>{item.statusLabel}</span>
            </div>
            <dl>
              <div><dt>决定人</dt><dd>{item.decisionMakerName || item.decisionMakerEmployeeNo}</dd></div>
              <div><dt>系统操作人</dt><dd>{item.enteredByName || item.enteredByUserName || item.enteredByUserId}</dd></div>
              <div><dt>渠道 / 决定时间</dt><dd>{item.decisionChannelLabel} · {formatDateTime(item.decidedAt)}</dd></div>
              <div><dt>授权依据</dt><dd>{item.authorizationBasis || "未记录"}</dd></div>
              <div><dt>授权范围</dt><dd>{item.decisionScopeLabel}{item.amountSnapshot != null ? ` · ¥${item.amountSnapshot}` : ""}</dd></div>
              <div><dt>决定凭据</dt><dd>{item.evidenceAttachments?.length ? item.evidenceAttachments.map((attachment) => (
                <button type="button" key={attachment.attachmentId} onClick={() => viewAttachment(attachment)}>{attachment.fileName} · 查看</button>
              )) : "未附凭据"}</dd></div>
              <div><dt>替代关系</dt><dd>{item.supersedesDecisionId ? `替代 ${item.supersedesDecisionId}` : item.status === "superseded" ? "已被后续决定替代" : "当前有效"}</dd></div>
              <div><dt>录入时间 / 日志</dt><dd>{formatDateTime(item.enteredAt)} · {item.operationLogId || "—"}</dd></div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

function buildAuthDependencyKey(authState) {
  return [
    authState?.source,
    authState?.session?.accessToken,
    authState?.permissions?.user?.userId,
  ].map((value) => String(value ?? "")).join(":");
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("zh-CN", { hour12: false });
}
