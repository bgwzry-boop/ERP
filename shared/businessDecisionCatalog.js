export const businessDecisionScopes = Object.freeze([
  "order_priority",
  "production_schedule",
  "raw_material_purchase",
  "fulfillment_quantity_variance",
  "statement_variance",
  "statement_write_off",
  "major_exception",
]);

export const businessDecisionScopeLabels = Object.freeze({
  order_priority: "订单优先级",
  production_schedule: "生产排产",
  raw_material_purchase: "原材料采购",
  fulfillment_quantity_variance: "出库数量差异",
  statement_variance: "对账差额处理",
  statement_write_off: "对账抹零 / 核销",
  major_exception: "重大异常",
});

export const businessDecisionChannels = Object.freeze([
  "in_person",
  "phone",
  "wechat",
  "paper",
  "self_system",
]);

export const businessDecisionChannelLabels = Object.freeze({
  in_person: "当面",
  phone: "电话",
  wechat: "微信",
  paper: "纸面",
  self_system: "本人系统操作",
});

export const businessDecisionTypeLabels = Object.freeze({
  direct: "管理人员直接决定",
  delegated: "办公室代录决定",
});

export const businessDecisionStatusLabels = Object.freeze({
  active: "当前有效",
  superseded: "已被新决定取代",
  historical_missing: "历史证据缺失",
  historical_review_required: "历史待复核",
});

const channelAliases = Object.freeze({
  "当面": "in_person",
  in_person: "in_person",
  "电话": "phone",
  phone: "phone",
  "微信": "wechat",
  wechat: "wechat",
  "纸面": "paper",
  paper: "paper",
  "本人系统操作": "self_system",
  self_system: "self_system",
});

export function normalizeBusinessDecisionChannel(value) {
  return channelAliases[String(value ?? "").trim()] ?? "";
}

export function getBusinessDecisionScopeLabel(scope) {
  return businessDecisionScopeLabels[String(scope ?? "").trim()] ?? "未知授权范围";
}

export function getBusinessDecisionChannelLabel(channel) {
  return businessDecisionChannelLabels[normalizeBusinessDecisionChannel(channel)] ?? "未知决定渠道";
}

export function getBusinessDecisionTypeLabel(type) {
  return businessDecisionTypeLabels[String(type ?? "").trim()] ?? "未知决定方式";
}

export function getBusinessDecisionStatusLabel(status) {
  return businessDecisionStatusLabels[String(status ?? "").trim()] ?? "未知状态";
}
