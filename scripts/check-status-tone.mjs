// 状态颜色统一为四级 + 中性：同一状态只能有一级，6 个列表页出现的状态都要被覆盖。
import assert from "node:assert/strict";
import { STATUS_TONE_TABLE, statusTone } from "../docs/prototypes/raw-material-roll-inventory-review/src/status-tone.js";

const tiers = new Set(["blocked", "todo", "doing", "done", "neutral"]);
const seen = new Map();
for (const [text, tone] of STATUS_TONE_TABLE) {
  assert.ok(tiers.has(tone), `未知级别 ${tone}（${text}）`);
  assert.equal(seen.has(text), false, `状态「${text}」重复出现`);
  seen.set(text, tone);
  assert.equal(statusTone(text), tone, `statusTone("${text}") 应返回 ${tone}`);
}

// 6 个列表页的代表状态（来自各页状态列）
const pageStatuses = {
  "order-pool": ["待出库", "缺货待处理", "已备货", "制袋中", "已交付", "待对账", "待打包", "待收款确认", "数量差异", "丝印中"],
  "outbound-delivery": ["待出库", "已备货", "待打印标签", "待确认拉走", "数量不符", "已交付"],
  "material-receiving": ["待核对", "待贴标", "异常", "待确认"],
  "production-tasks": ["丝印中", "待补印", "待排产", "制袋中", "已完成"],
  "customer-statements": ["本期待对账", "有欠款/差异", "收款待确认", "已结清"],
  "customer-records": ["正常", "停用"],
};
for (const [page, statuses] of Object.entries(pageStatuses)) {
  for (const text of statuses) {
    assert.ok(seen.has(text), `${page} 的状态「${text}」未进入映射表`);
    assert.ok(tiers.has(statusTone(text)), `${page}「${text}」级别非法`);
  }
}

// 兜底：未知状态归中性，不得误判成阻塞
assert.equal(statusTone("完全没见过的状态"), "neutral");
assert.equal(statusTone(""), "neutral");
assert.equal(statusTone("异常暂停"), "blocked", "含异常关键词应归阻塞");
assert.equal(statusTone("配送中"), "doing");

// 重点口径：阻塞级只能是要人处理的事
for (const text of ["缺货待处理", "数量差异", "数量不符", "异常", "疑似重复", "读取失败"]) {
  assert.equal(statusTone(text), "blocked", `「${text}」必须是阻塞级`);
}
for (const text of ["已交付", "已结清", "正常", "可用"]) {
  assert.equal(statusTone(text), "done", `「${text}」必须是完成级`);
}

console.log(`Status tone checks passed: ${STATUS_TONE_TABLE.length} 条映射，6 页代表状态全部覆盖，未知状态归中性。`);
