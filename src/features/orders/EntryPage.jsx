import {
  DataState,
  DetailPane,
  InfoGrid,
  OperationalPanel,
  PanelHeader,
  StatusPill,
} from "../../shared/ui/operational.jsx";

export function EntryPage({ entryText, setEntryText, draftRows, draftStatus, selectedDraftId, setSelectedDraftId, onRecognize, onDraftFieldChange, onDraftCommand, onAction, helpers }) {
  const { editableColors, getDraftColorSpecLabel, getDraftMissingFields, getDraftNote, getDraftStatusTone, getDraftTypeLabel, getUiActionState, money, sampleText } = helpers;
  const selected = draftRows.find((item) => item.id === selectedDraftId) ?? draftRows[0];
  const selectedMissing = selected ? getDraftMissingFields(selected) : [];
  const recognizeState = getUiActionState("entry", "识别");
  return (
    <section className="page-stack entry-workbench">
      <OperationalPanel className="entry-source-panel" ariaLabel="订单原文">
        <PanelHeader title="订单原文" summary={`${entryText.trim().length} 字`} />
        <div className="entry-capture-body">
          <textarea aria-label="订单原文" value={entryText} onChange={(event) => setEntryText(event.target.value)} />
          <div className="entry-actions entry-capture-actions">
            <button className="primary-button" disabled={recognizeState.disabled} title={recognizeState.title} onClick={onRecognize}>识别</button>
            <button onClick={() => setEntryText("")}>清空</button>
            <button onClick={() => setEntryText(sampleText)}>填入样例</button>
          </div>
        </div>
      </OperationalPanel>
      <section className="page-grid split-detail entry-detail-grid">
        <OperationalPanel className="table-pane entry-table-panel" ariaLabel="识别明细">
          <PanelHeader
            eyebrow={<StatusPill tone={getDraftStatusTone(draftStatus)}>{draftStatus}</StatusPill>}
            title="识别明细"
            summary={`${draftRows.length} 行 · 当前 ${selected?.id ?? "未选择"}`}
            actions={(
              <div className="tool-actions">
                <button onClick={() => onDraftCommand("合并下一行")}>合并下一行</button>
                <button onClick={() => onDraftCommand("拆分当前行")}>拆分当前行</button>
                <button onClick={() => onDraftCommand("删除当前行")}>删除当前行</button>
              </div>
            )}
          />
          <EntryDraftTable rows={draftRows} selectedId={selected?.id} onSelect={setSelectedDraftId} onChange={onDraftFieldChange} helpers={helpers} />
          <div className="footer-actions">
            {["保存草稿", "保存并确认", "拆分订单", "作废草稿"].map((item) => {
              const actionState = getUiActionState("entry", item);
              return <button className={item === "保存并确认" ? "primary-action" : ""} disabled={actionState.disabled} key={item} title={actionState.title} onClick={() => onAction(item)}>{item}</button>;
            })}
          </div>
        </OperationalPanel>
        <DetailPane className="entry-detail-pane" title="识别详情" subtitle={selected?.id ?? "未选择"}>
          {selected ? (
            <>
              <InfoGrid
                rows={[
                  ["置信度", selected.confidence === "high" ? "高" : selected.confidence === "medium" ? "中，需要确认" : "低，必须补充"],
                  ["草稿状态", draftStatus],
                  ["业务类型", getDraftTypeLabel(selected)],
                  ["底袋款式", selected.style],
                  ["颜色短写", getDraftColorSpecLabel(selected)],
                  ["备注", getDraftNote(selected) || "无"],
                  ["原文片段", selected.source],
                  ["印刷图/稿件", selected.artworkStatus ?? (selected.print === "是" ? "待上传" : "非印刷不需要")],
                  ["客户备注", "从原文识别，文员可补充"],
                  ["价格快照", `${money(selected.amount)}，正式保存前重算`],
                ]}
              />
              <section className="detail-section">
                <h3>印刷 / 提手 / 备注</h3>
                <div className="detail-form">
                  {selected.print === "是" ? (
                    <>
                    <label>
                      <span>印刷颜色</span>
                      <select value={selected.printColor ?? "待确认"} onChange={(event) => onDraftFieldChange(selected.id, "printColor", event.target.value)}>
                        <option>待确认</option>
                        {editableColors.map((color) => <option key={color}>{color}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>印刷面</span>
                      <select value={selected.printSide ?? "待确认"} onChange={(event) => onDraftFieldChange(selected.id, "printSide", event.target.value)}>
                        <option>待确认</option>
                        <option>单面</option>
                        <option>双面</option>
                      </select>
                    </label>
                    <label>
                      <span>印刷图/稿件</span>
                      <select value={selected.artworkStatus ?? "待上传"} onChange={(event) => onDraftFieldChange(selected.id, "artworkStatus", event.target.value)}>
                        <option>待上传</option>
                        <option>客户待补</option>
                        <option>已上传</option>
                        <option>已有稿件</option>
                      </select>
                    </label>
                    </>
                  ) : (
                    <p>非印刷单不需要填写印刷图、印刷颜色或印刷面。</p>
                  )}
                  <label>
                    <span>提手颜色</span>
                    <select value={selected.handleColor ?? ""} onChange={(event) => onDraftFieldChange(selected.id, "handleColor", event.target.value)}>
                      <option value="">同袋色/未特殊</option>
                      <option>待确认</option>
                      {editableColors.map((color) => <option key={color}>{color}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>备注</span>
                    <input value={selected.note ?? ""} onChange={(event) => onDraftFieldChange(selected.id, "note", event.target.value)} placeholder="加长提、提手颜色更换、其他" />
                  </label>
                </div>
              </section>
              <section className="detail-section">
                <h3>缺字段检查</h3>
                <StatusPill tone={selectedMissing.length ? "danger" : selected.confidence === "medium" ? "warning" : "success"}>
                  {selectedMissing.length ? `缺 ${selectedMissing.join("、")}` : selected.confidence === "medium" ? "可保存前需复核库存/时间" : "可保存确认"}
                </StatusPill>
              </section>
            </>
          ) : <DataState title="未选择识别明细" detail="识别订单原文后可在此复核印刷、提手和备注。" compact />}
        </DetailPane>
      </section>
    </section>
  );
}

function EntryDraftTable({ rows, selectedId, onSelect, onChange, helpers }) {
  const { customers, getDraftTypeLabel, getDraftTypeTone, money, statusTone } = helpers;
  const columns = ["客户", "品名/印刷", "尺寸", "颜色", "提手", "款式/类型", "印刷", "数量", "交付", "最晚", "库存", "预估"];
  if (!rows.length) return <DataState title="暂无识别明细" detail="录入订单原文并执行识别后显示。" compact />;
  return (
    <div className="data-table entry-table" style={{ "--cols": columns.length }}>
      <div className="data-row head">
        {columns.map((column) => <span key={column}>{column}</span>)}
      </div>
      {rows.map((row) => (
        <div className={`data-row entry-edit-row ${row.id === selectedId ? "active" : ""} ${row.confidence}`} key={row.id} onClick={() => onSelect(row.id)}>
          <span>
            <select value={row.customerId} onChange={(event) => onChange(row.id, "customerId", event.target.value)}>
              <option value="">待确认</option>
              {customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.name}</option>)}
            </select>
          </span>
          <span><input value={row.product} onChange={(event) => onChange(row.id, "product", event.target.value)} /></span>
          <span><input value={row.size} onChange={(event) => onChange(row.id, "size", event.target.value)} /></span>
          <span><input value={row.color} onChange={(event) => onChange(row.id, "color", event.target.value)} /></span>
          <span>
            <select value={row.handle} onChange={(event) => onChange(row.id, "handle", event.target.value)}>
              <option>普通提</option>
              <option>加长提</option>
            </select>
          </span>
          <span>
            {getDraftTypeLabel(row) === row.style ? (
              <select value={row.style} onChange={(event) => onChange(row.id, "style", event.target.value)}>
                <option>空白袋</option>
                <option>小熊袋</option>
                <option>喜</option>
                <option>福</option>
                <option>外加工</option>
              </select>
            ) : (
              <StatusPill tone={getDraftTypeTone(row)}>{getDraftTypeLabel(row)}</StatusPill>
            )}
          </span>
          <span>
            <select value={row.print} onChange={(event) => onChange(row.id, "print", event.target.value)}>
              <option>否</option>
              <option>是</option>
            </select>
          </span>
          <span><input type="number" min="0" value={row.qty} onChange={(event) => onChange(row.id, "qty", event.target.value)} /></span>
          <span>
            <select value={row.fulfillment} onChange={(event) => onChange(row.id, "fulfillment", event.target.value)}>
              <option>待确认</option>
              <option>自提</option>
              <option>送货</option>
              <option>快递快运</option>
            </select>
          </span>
          <span><input value={row.latest} onChange={(event) => onChange(row.id, "latest", event.target.value)} /></span>
          <span><StatusPill tone={statusTone(row.inventory)}>{row.inventory}</StatusPill></span>
          <span>{money(row.amount)}</span>
        </div>
      ))}
    </div>
  );
}
