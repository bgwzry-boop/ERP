import {
  SEMANTIC_TAG_CATALOG,
  createReactUsage,
  createSemanticTagMarkup,
  getSemanticTagDefinition,
} from "./semantic-tags.js";

const catalogRows = document.querySelector("#catalogRows");
const previewStage = document.querySelector("#previewStage");
const deviceButtons = [...document.querySelectorAll("[data-device-button]")];
const devicePreviews = [...document.querySelectorAll("[data-device-preview]")];
const kindSelect = document.querySelector("#kindSelect");
const valueSelect = document.querySelector("#valueSelect");
const sizeSelect = document.querySelector("#sizeSelect");
const playgroundPreview = document.querySelector("#playgroundPreview");
const componentCode = document.querySelector("#componentCode");
const copyButton = document.querySelector("#copyButton");
const copyFeedback = document.querySelector("#copyFeedback");

function renderCatalog() {
  catalogRows.innerHTML = Object.entries(SEMANTIC_TAG_CATALOG)
    .map(([kind, category]) => {
      const tags = category.values
        .map((item) => createSemanticTagMarkup({ kind, value: item.value, label: item.label }))
        .join("");
      return `
        <article class="catalog-row">
          <div class="catalog-row__identity">
            <strong>${category.label}</strong>
            <span>回答：${category.question}</span>
          </div>
          <div class="catalog-row__samples">${tags}</div>
          <p class="catalog-row__rule">${category.rule}</p>
        </article>`;
    })
    .join("");
}

function setDevice(device) {
  previewStage.dataset.device = device;
  deviceButtons.forEach((button) => {
    const active = button.dataset.deviceButton === device;
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  devicePreviews.forEach((preview) => {
    preview.hidden = preview.dataset.devicePreview !== device;
  });
}

function populateKinds() {
  kindSelect.innerHTML = Object.entries(SEMANTIC_TAG_CATALOG)
    .map(([kind, category]) => `<option value="${kind}">${category.label}</option>`)
    .join("");
}

function populateValues() {
  const category = SEMANTIC_TAG_CATALOG[kindSelect.value];
  valueSelect.innerHTML = category.values
    .map((item) => `<option value="${item.value}">${item.label}</option>`)
    .join("");
}

function updatePlayground() {
  const kind = kindSelect.value;
  const value = valueSelect.value;
  const size = sizeSelect.value;
  const definition = getSemanticTagDefinition(kind, value);
  playgroundPreview.innerHTML = createSemanticTagMarkup({ kind, value, size });
  componentCode.textContent = createReactUsage({ kind, value, size });
  playgroundPreview.setAttribute("aria-label", `${definition.categoryLabel}：${definition.label}`);
  copyFeedback.textContent = "";
}

async function copyComponentCode() {
  const value = componentCode.textContent;
  try {
    await navigator.clipboard.writeText(value);
    copyFeedback.textContent = "已复制，可粘贴到 React 页面。";
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(componentCode);
    selection.removeAllRanges();
    selection.addRange(range);
    copyFeedback.textContent = "浏览器未授权剪贴板，组件代码已选中。";
  }
}

deviceButtons.forEach((button, index) => {
  button.addEventListener("click", () => setDevice(button.dataset.deviceButton));
  button.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (index + direction + deviceButtons.length) % deviceButtons.length;
    deviceButtons[nextIndex].focus();
    setDevice(deviceButtons[nextIndex].dataset.deviceButton);
  });
});

kindSelect.addEventListener("change", () => {
  populateValues();
  updatePlayground();
});
valueSelect.addEventListener("change", updatePlayground);
sizeSelect.addEventListener("change", updatePlayground);
copyButton.addEventListener("click", copyComponentCode);

renderCatalog();
populateKinds();
populateValues();
updatePlayground();
setDevice("pc");
