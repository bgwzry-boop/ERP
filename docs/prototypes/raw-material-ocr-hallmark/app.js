const rolls = [
  { color: "本白", spec: "78×70×2000", weight: "109.9", count: "1", cropY: "-7.1rem" },
  { color: "本白", spec: "78×70×2000", weight: "109.8", count: "1", cropY: "-8.45rem" },
  { color: "本白", spec: "78×80×2000", weight: "125.3", count: "1", cropY: "-9.8rem" },
  { color: "枣红", spec: "78×80×1500", weight: "83.9", count: "1", cropY: "-11.15rem" },
  { color: "大红", spec: "70×78×2000", weight: "83.6", count: "1", cropY: "-12.5rem" },
  { color: "大红", spec: "70×78×2000", weight: "83.4", count: "1", cropY: "-13.85rem" },
  { color: "大红", spec: "", weight: "74", count: "1", cropY: "-15.2rem" },
  { color: "大红", spec: "76×78×1500", weight: "91.9", count: "1", cropY: "-16.55rem" },
  { color: "大红", spec: "76×78×1500", weight: "92", count: "1", cropY: "-17.9rem" },
];

const appShell = document.querySelector("#appShell");
const rollList = document.querySelector("#rollList");
const issueCount = document.querySelector("#issueCount");
const actionTitle = document.querySelector("#actionTitle");
const actionHint = document.querySelector("#actionHint");
const primaryAction = document.querySelector("#primaryAction");
const sourceDialog = document.querySelector("#sourceDialog");
const editDialog = document.querySelector("#editDialog");
const completeDialog = document.querySelector("#completeDialog");
const editForm = document.querySelector("#editForm");
const editDialogKicker = document.querySelector("#editDialogKicker");
const rowCrop = document.querySelector("#rowCrop");
const editColor = document.querySelector("#editColor");
const editSpec = document.querySelector("#editSpec");
const editWeight = document.querySelector("#editWeight");
const editCount = document.querySelector("#editCount");
const specHelp = document.querySelector("#specHelp");
const toast = document.querySelector("#toast");

let activeIndex = 6;
let toastTimer;

function renderRolls() {
  rollList.innerHTML = rolls.map((roll, index) => {
    const hasIssue = !roll.spec.trim();
    const rowClass = hasIssue ? "roll-row is-issue" : "roll-row";
    const spec = hasIssue ? "规格待补" : roll.spec;
    const status = hasIssue ? "点此补全" : `${roll.count} 卷`;

    return `
      <button class="${rowClass}" type="button" data-index="${index}" aria-label="第 ${index + 1} 卷，${roll.color}，${spec}，${roll.weight} 公斤，${status}">
        <span class="roll-index">${String(index + 1).padStart(2, "0")}</span>
        <span class="roll-main">
          <strong>${roll.color} · ${spec}</strong>
          <span>${status}</span>
        </span>
        <span class="roll-side">
          <strong class="roll-weight">${roll.weight}</strong>
          <span>kg</span>
        </span>
      </button>
    `;
  }).join("");

  rollList.querySelectorAll(".roll-row").forEach((row) => {
    row.addEventListener("click", () => openEditor(Number(row.dataset.index)));
  });

  updateActionBar();
}

function updateActionBar() {
  const missingIndex = rolls.findIndex((roll) => !roll.spec.trim());
  const hasIssue = missingIndex !== -1;

  issueCount.textContent = hasIssue ? "1 处待补" : "9 卷已齐";
  issueCount.classList.toggle("is-clear", !hasIssue);
  actionTitle.textContent = hasIssue ? `还差第 ${missingIndex + 1} 卷规格` : "9 卷信息已齐";
  actionHint.textContent = hasIssue ? "补完就能打印 9 张标签" : "确认后进入标签打印";
  primaryAction.textContent = hasIssue ? `补第 ${missingIndex + 1} 卷` : "去打印标签";
  primaryAction.dataset.mode = hasIssue ? "edit" : "complete";
  primaryAction.dataset.index = hasIssue ? String(missingIndex) : "";
}

function setBackgroundInert(isInert) {
  appShell.inert = isInert;
}

function showDialog(dialog) {
  setBackgroundInert(true);
  dialog.showModal();
}

function closeDialog(dialog) {
  dialog.close();
  setBackgroundInert(false);
}

function openEditor(index) {
  activeIndex = index;
  const roll = rolls[index];
  editDialogKicker.textContent = `第 ${index + 1} 卷`;
  editColor.value = roll.color;
  editSpec.value = roll.spec;
  editWeight.value = roll.weight;
  editCount.value = roll.count;
  rowCrop.style.setProperty("--crop-y", roll.cropY);
  specHelp.textContent = roll.spec ? "" : "原单这一格不清楚，请按纸单补规格。";
  editSpec.setAttribute("aria-invalid", roll.spec ? "false" : "true");
  showDialog(editDialog);
  window.setTimeout(() => (roll.spec ? editColor : editSpec).focus(), 0);
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

function openSourceDialog() {
  showDialog(sourceDialog);
  sourceDialog.querySelector(".source-zoom").scrollTo({ left: 150, top: 30 });
}

document.querySelector("#openSource").addEventListener("click", openSourceDialog);
document.querySelector("#openSourceImage").addEventListener("click", openSourceDialog);
document.querySelector("#closeSource").addEventListener("click", () => closeDialog(sourceDialog));
document.querySelector("#closeEdit").addEventListener("click", () => closeDialog(editDialog));
document.querySelector("#cancelEdit").addEventListener("click", () => closeDialog(editDialog));
document.querySelector("#closeComplete").addEventListener("click", () => closeDialog(completeDialog));

document.querySelector("#backButton").addEventListener("click", () => {
  showToast("原型预览：正式页面这里返回“拍单”。");
});

sourceDialog.addEventListener("click", (event) => {
  if (event.target === sourceDialog) closeDialog(sourceDialog);
});

editDialog.addEventListener("click", (event) => {
  if (event.target === editDialog) closeDialog(editDialog);
});

completeDialog.addEventListener("click", (event) => {
  if (event.target === completeDialog) closeDialog(completeDialog);
});

[sourceDialog, editDialog, completeDialog].forEach((dialog) => {
  dialog.addEventListener("close", () => setBackgroundInert(false));
});

editSpec.addEventListener("input", () => {
  const isInvalid = !editSpec.value.trim();
  editSpec.setAttribute("aria-invalid", String(isInvalid));
  specHelp.textContent = isInvalid ? "请补上规格后保存。" : "";
});

editForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!editSpec.value.trim()) {
    editSpec.setAttribute("aria-invalid", "true");
    specHelp.textContent = "请补上规格后保存。";
    editSpec.focus();
    return;
  }

  rolls[activeIndex] = {
    ...rolls[activeIndex],
    color: editColor.value.trim() || rolls[activeIndex].color,
    spec: editSpec.value.trim(),
    weight: editWeight.value.trim() || rolls[activeIndex].weight,
    count: editCount.value.trim() || rolls[activeIndex].count,
  };

  closeDialog(editDialog);
  renderRolls();
  const editedRow = rollList.querySelector(`[data-index="${activeIndex}"]`);
  editedRow.classList.add("is-edited");
  editedRow.focus({ preventScroll: true });
});

primaryAction.addEventListener("click", () => {
  if (primaryAction.dataset.mode === "edit") {
    openEditor(Number(primaryAction.dataset.index));
    return;
  }

  showDialog(completeDialog);
  document.querySelector("#closeComplete").focus();
});

renderRolls();
