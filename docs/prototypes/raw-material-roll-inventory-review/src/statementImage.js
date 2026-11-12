// 负责人 2026-11-08：月底对账单要发到客户群。把对账明细画成一张图，复制后直接粘到微信群，或下载。
const PAD = 32;
const WIDTH = 1000;
const ROW_H = 40;
const COLS = [
  { label: "单号", x: PAD, w: 150, align: "left" },
  { label: "订单", x: PAD + 150, w: 440, align: "left" },
  { label: "送货 / 计费", x: PAD + 730, w: 130, align: "right" },
  { label: "金额（元）", x: WIDTH - PAD, w: 104, align: "right" },
];
const text = (value) => String(value ?? "").trim();
const money = (value) => (Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "—");

function fit(ctx, value, width) {
  let out = text(value);
  if (ctx.measureText(out).width <= width) return out;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > width) out = out.slice(0, -1);
  return `${out}…`;
}

/** Plain data the image shows; kept separate so it can be checked without a canvas. */
export function buildStatementImageModel(detail = {}, { now = new Date() } = {}) {
  const lines = (detail.statementLines ?? []).map((row) => ({
    order: text(row.orderNo) || "—",
    spec: text(row.goodsSpec) || text(row.productName) || "—",
    qty: `${text(row.deliveredQty) || "—"} / ${text(row.chargeableQty) || "—"}`,
    amount: money(row.finalAmount),
  }));
  const summary = [
    ["本期应收", money(detail.receivable)],
    ["本期已收", money(detail.received)],
    ...(Number(detail.roundingAmount) > 0 ? [["抹零", money(detail.roundingAmount)]] : []),
    ["本期未收", money(detail.currentUnpaid)],
    ...(Number(detail.historicalDebt) > 0 ? [["历史欠款", money(detail.historicalDebt)]] : []),
  ];
  const date = new Date(now.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  return {
    title: `${text(detail.customerName || detail.customerId) || "客户"} · ${text(detail.period) || "本期"} 对账单`,
    lines,
    summary,
    footer: `${date} 生成 · 请核对，有疑问在群里说`,
  };
}

/** Draws the statement and resolves a PNG Blob. */
export function renderStatementImage(detail, { documentRef = document, now } = {}) {
  const model = buildStatementImageModel(detail, { now });
  const height = PAD * 2 + 56 + ROW_H * (model.lines.length + 1) + 24 + 34 * model.summary.length + 40;
  const scale = 2;
  const canvas = documentRef.createElement("canvas");
  canvas.width = WIDTH * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, WIDTH, height);
  const font = (size, weight = 400) => `${weight} ${size}px "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif`;
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#1e2633";
  ctx.font = font(24, 600);
  ctx.fillText(fit(ctx, model.title, WIDTH - PAD * 2), PAD, PAD + 18);
  let y = PAD + 56;
  ctx.fillStyle = "#f3f5f8";
  ctx.fillRect(PAD, y, WIDTH - PAD * 2, ROW_H);
  ctx.font = font(14, 600);
  ctx.fillStyle = "#4f5866";
  for (const col of COLS) {
    ctx.textAlign = col.align;
    ctx.fillText(col.label, col.align === "right" ? col.x : col.x + 8, y + ROW_H / 2);
  }
  ctx.font = font(15);
  for (const row of model.lines) {
    y += ROW_H;
    ctx.fillStyle = "#e3e7ed";
    ctx.fillRect(PAD, y + ROW_H - 1, WIDTH - PAD * 2, 1);
    ctx.fillStyle = "#1e2633";
    const values = [row.order, row.spec, row.qty, row.amount];
    COLS.forEach((col, index) => {
      ctx.textAlign = col.align;
      ctx.fillText(fit(ctx, values[index], col.w - 12), col.align === "right" ? col.x : col.x + 8, y + ROW_H / 2);
    });
  }
  y += ROW_H + 24;
  for (const [label, value] of model.summary) {
    ctx.textAlign = "right";
    ctx.font = font(15);
    ctx.fillStyle = "#4f5866";
    ctx.fillText(label, WIDTH - PAD - 150, y + 14);
    ctx.font = font(label === "本期未收" ? 20 : 16, 600);
    ctx.fillStyle = label === "本期未收" ? "#a33a12" : "#1e2633";
    ctx.fillText(value, WIDTH - PAD, y + 14);
    y += 34;
  }
  ctx.textAlign = "left";
  ctx.font = font(13);
  ctx.fillStyle = "#7a8594";
  ctx.fillText(model.footer, PAD, height - PAD + 4);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("对账图生成失败。"))), "image/png"));
}

/** Copies the image so it can be pasted into WeChat; falls back to a download. Returns a message. */
export async function shareStatementImage(detail, { documentRef = document, navigatorRef = navigator } = {}) {
  const blob = await renderStatementImage(detail, { documentRef });
  const name = `${buildStatementImageModel(detail).title}.png`.replace(/[\\/:*?"<>|]/gu, "_");
  try {
    if (navigatorRef?.clipboard?.write && typeof ClipboardItem !== "undefined") {
      await navigatorRef.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      return { copied: true, message: "对账图已复制，到微信群里直接粘贴（Ctrl+V）就能发。" };
    }
  } catch {
    // 浏览器不让复制时改成下载。
  }
  const url = URL.createObjectURL(blob);
  const anchor = documentRef.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { copied: false, message: `对账图已下载（${name}），发到客户群即可。` };
}
