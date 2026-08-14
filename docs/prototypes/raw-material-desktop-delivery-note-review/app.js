const rolls = [
  { color: "本白", swatch: "#ece8dc", spec: "78g × 70cm × 2000m", weight: "109.9", count: "1", cropY: "31%", confirmed: true },
  { color: "本白", swatch: "#ece8dc", spec: "78g × 70cm × 2000m", weight: "109.8", count: "1", cropY: "35%", confirmed: true },
  { color: "本白", swatch: "#ece8dc", spec: "78g × 80cm × 2000m", weight: "125.3", count: "1", cropY: "39%", confirmed: true },
  { color: "枣红", swatch: "#8f2838", spec: "78g × 80cm × 1500m", weight: "83.9", count: "1", cropY: "43%", confirmed: true },
  { color: "大红", swatch: "#c91f28", spec: "70g × 78cm × 2000m", weight: "83.6", count: "1", cropY: "47%", confirmed: true },
  { color: "大红", swatch: "#c91f28", spec: "70g × 78cm × 2000m", weight: "83.4", count: "1", cropY: "51%", confirmed: true },
  { color: "大红", swatch: "#c91f28", spec: "", weight: "74", count: "1", cropY: "55%", confirmed: false },
  { color: "大红", swatch: "#c91f28", spec: "76g × 78cm × 1500m", weight: "91.9", count: "1", cropY: "59%", confirmed: true },
  { color: "大红", swatch: "#c91f28", spec: "76g × 78cm × 1500m", weight: "92", count: "1", cropY: "63%", confirmed: true },
];

const rollLedger = document.querySelector("#rollLedger");
const pendingFilter = document.querySelector("#pendingFilter");
const confirmedCount = document.querySelector("#confirmedCount");
const confirmedFact = document.querySelector("#confirmedFact");
const issueFact = document.querySelector("#issueFact");
const stripIssueCount = document.querySelector("#stripIssueCount");
const progressCopy = document.querySelector("#progressCopy");
const progressFill = document.querySelector("#progressFill");
const blockerCard = document.querySelector("#blockerCard");
const primaryAction = document.querySelector("#primaryAction");
const sourceDialog = document.querySelector("#sourceDialog");
const completeDialog = document.querySelector("#completeDialog");
const saveState = document.querySelector("#saveState");
const toast = document.querySelector("#toast");
const focusEvidence = document.querySelector("#focusEvidence");

let onlyPending = false;
let activeIndex = null;
let toastTimer;

function getIssues() {
  return rolls.map((roll, index) => ({ roll, index })).filter(({ roll }) => !roll.spec.trim() || !roll.confirmed);
}

function renderLedger() {
  const visible = rolls.map((roll, index) => ({ roll, index })).filter(({ roll }) => !onlyPending || !roll.confirmed || !roll.spec.trim());
  if (!visible.length) {
    rollLedger.innerHTML = '<p class="empty-ledger">没有待处理行。切回“查看全部”可复查 9 行。</p>';
  } else {
    rollLedger.innerHTML = visible.map(({ roll, index }) => renderRow(roll, index)).join("");
  }
  updateProgress();
  renderFocusEvidence(activeIndex ?? getIssues()[0]?.index ?? 0);
}

function renderFocusEvidence(index) {
  const roll = rolls[index];
  const issue = !roll.spec.trim();
  focusEvidence.innerHTML = `
    <header><strong>当前对照 · 第 ${index + 1} 行</strong><span>${issue ? "规格待补" : roll.confirmed ? "已确认" : "待确认"}</span></header>
    <div class="focus-crop" style="--crop-y:${roll.cropY}" role="img" aria-label="原始送货单第 ${index + 1} 行放大裁图"></div>
    <p><strong>${roll.color}</strong> · ${issue ? "规格没看清" : roll.spec} · ${roll.weight} kg · ${roll.count} 卷</p>
  `;
}

function renderRow(roll, index) {
  const issue = !roll.spec.trim();
  const editing = activeIndex === index;
  const state = issue ? "需补规格" : roll.confirmed ? "已确认" : "待确认";
  const action = issue ? "补全" : roll.confirmed ? "修改" : "确认";
  return `
    <article class="ledger-row ${issue ? "is-issue" : ""}" data-index="${index}">
      <div class="ledger-row-main">
        <span class="line-number">${String(index + 1).padStart(2, "0")}</span>
        <span class="source-crop" style="--crop-y:${roll.cropY}" role="img" aria-label="原始送货单第 ${index + 1} 行裁图"></span>
        <span class="material-fact" style="--swatch:${roll.swatch}">
          <i aria-hidden="true"></i>
          <span><strong>${roll.color}</strong><small class="${issue ? "missing" : ""}">${issue ? "规格没看清" : roll.spec}</small></span>
        </span>
        <span class="metric-cell">${roll.weight} kg</span>
        <span class="metric-cell">${roll.count} 卷</span>
        <span class="status-label">${state}</span>
        <button class="row-action" type="button" data-action="edit" data-index="${index}">${action}</button>
      </div>
      ${editing ? renderEditor(roll, index) : ""}
    </article>
  `;
}

function renderEditor(roll, index) {
  return `
    <form class="row-editor" data-index="${index}">
      <label><span>颜色</span><input name="color" value="${roll.color}" autocomplete="off" /></label>
      <label><span>规格</span><input name="spec" value="${roll.spec}" placeholder="例如 70g × 78cm × 2000m" aria-invalid="${roll.spec ? "false" : "true"}" autocomplete="off" /></label>
      <label><span>重量 kg</span><input name="weight" value="${roll.weight}" inputmode="decimal" /></label>
      <label><span>卷数</span><input name="count" value="${roll.count}" inputmode="numeric" /></label>
      <div class="row-editor-actions">
        <button class="secondary-button" type="button" data-action="cancel">取消</button>
        <button class="primary-button" type="submit">保存并确认</button>
      </div>
    </form>
  `;
}

function updateProgress() {
  const issues = getIssues();
  const confirmed = rolls.length - issues.length;
  confirmedCount.textContent = String(confirmed);
  confirmedFact.textContent = `${confirmed} 行`;
  issueFact.textContent = `${issues.length} 行`;
  stripIssueCount.textContent = String(issues.length);
  progressCopy.textContent = issues.length ? `还需处理 ${issues.length} 行` : "全部信息已齐";
  progressFill.style.transform = `scaleX(${confirmed / rolls.length})`;

  if (issues.length) {
    const next = issues[0].index + 1;
    blockerCard.classList.remove("is-clear");
    blockerCard.innerHTML = `
      <span>阻断项</span>
      <strong>第 ${next} 行规格没看清</strong>
      <p>原单这一格不完整，请按纸单补成实际规格后确认。</p>
      <button class="secondary-button" type="button" data-action="fix" data-index="${next - 1}">补全第 ${next} 行</button>
    `;
    primaryAction.textContent = `补全第 ${next} 行`;
    primaryAction.dataset.mode = "fix";
    primaryAction.dataset.index = String(next - 1);
  } else {
    blockerCard.classList.add("is-clear");
    blockerCard.innerHTML = `
      <span>可以进入下一步</span>
      <strong>9 行均已确认</strong>
      <p>颜色、规格、重量和卷数已核对；原始证据与修改记录会继续保留。</p>
    `;
    primaryAction.textContent = "确认 9 卷并进入打印";
    primaryAction.dataset.mode = "complete";
    primaryAction.dataset.index = "";
  }
}

function openEditor(index) {
  activeIndex = index;
  renderLedger();
  requestAnimationFrame(() => {
    const input = rollLedger.querySelector(`form[data-index="${index}"] input[name="spec"]`);
    input?.focus();
  });
}

function saveRow(form) {
  const index = Number(form.dataset.index);
  const color = form.elements.color.value.trim();
  const spec = form.elements.spec.value.trim();
  const weight = form.elements.weight.value.trim();
  const count = form.elements.count.value.trim();
  if (!spec) {
    form.elements.spec.setAttribute("aria-invalid", "true");
    form.elements.spec.focus();
    showToast("请先补全规格。", true);
    return;
  }
  rolls[index] = { ...rolls[index], color: color || rolls[index].color, spec, weight: weight || rolls[index].weight, count: count || rolls[index].count, confirmed: true };
  activeIndex = null;
  saveState.textContent = "刚刚已保存";
  renderLedger();
  showToast(`第 ${index + 1} 行已确认。`);
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

rollLedger.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const index = Number(button.dataset.index ?? button.closest("article")?.dataset.index);
  if (button.dataset.action === "edit") openEditor(index);
  if (button.dataset.action === "cancel") { activeIndex = null; renderLedger(); }
});

rollLedger.addEventListener("submit", (event) => {
  event.preventDefault();
  saveRow(event.target);
});

blockerCard.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action='fix']");
  if (button) openEditor(Number(button.dataset.index));
});

pendingFilter.addEventListener("click", () => {
  onlyPending = !onlyPending;
  pendingFilter.setAttribute("aria-pressed", String(onlyPending));
  pendingFilter.textContent = onlyPending ? "查看全部" : "只看待处理";
  renderLedger();
});

primaryAction.addEventListener("click", () => {
  if (primaryAction.dataset.mode === "fix") {
    openEditor(Number(primaryAction.dataset.index));
    return;
  }
  completeDialog.showModal();
});

document.querySelector("#fixBlocker")?.addEventListener("click", () => openEditor(6));
document.querySelector("#openSource").addEventListener("click", () => sourceDialog.showModal());
document.querySelector("#openSourceImage").addEventListener("click", () => sourceDialog.showModal());
document.querySelector("#closeSource").addEventListener("click", () => sourceDialog.close());
document.querySelector("#stayReview").addEventListener("click", () => completeDialog.close());
document.querySelector("#previewPrint").addEventListener("click", () => {
  completeDialog.close();
  showToast("评审原型：下一步将显示 9 张卷标预览和当前打印机。");
});
document.querySelector("#saveLater").addEventListener("click", () => showToast("进度已保存，办公室 B 也能继续处理。"));
document.querySelector("#replaceSource").addEventListener("click", () => showToast("评审原型：这里会重新选择照片或 PDF。"));
document.querySelector("#recognizeAgain").addEventListener("click", () => showToast("评审原型：重新识别不会覆盖已确认数据，需先确认替换。"));
document.querySelector(".back-link").addEventListener("click", () => showToast("评审原型：这里返回原材料入库单列表。"));

sourceDialog.addEventListener("click", (event) => { if (event.target === sourceDialog) sourceDialog.close(); });
completeDialog.addEventListener("click", (event) => { if (event.target === completeDialog) completeDialog.close(); });

renderLedger();
