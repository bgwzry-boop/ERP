import { enrichDraftRow, parseOrderText } from "./orderParser.js";

const unconfirmedDraftStatuses = new Set(["", "待录入", "识别中", "已识别待确认", "已调整待确认", "待审核", "待补充信息"]);
const customerConfirmationWords = /^(?:要|要的|留|留着|给我留|算上|一起算上|要了|可以)$/;
const wholeOrderCancelWords = /(?:整单|全部|都不要|整个订单|这单).*取消|取消.*(?:整单|全部|整个订单|这单)/;
const shortageCancelWords = /(?:缺货|没货|没有货|无货).*(?:取消|不要)|(?:取消|不要).*(?:缺货|没货|没有货|无货)/;
const holdWords = /有(?:货)?的话.{0,8}(?:给我)?留|(?:先|帮我|给我)留\s*\d|留货/;
const inquiryWords = /有吗|有没有|有货吗|还有吗|能留吗|能不能留|库存(?:有|够)吗/;
const followUpWords = /^(?:再加|再补|补充|加上|另外加|还要|再来)/;
const explicitOrderWords = /(?:我要|要\s*\d|来\s*\d|下单|算上|拿货|发货|送货|自提|快递|快运)/;
const merchantReplyWords = /^(?:有|有货|没有|没货|缺货|库存有|库存没有|可以|不可以|够|不够)[。！!，,\s]*$/;

const builtInColors = [
  ["安哥拉红", "安哥拉红"],
  ["牛仔蓝", "牛仔蓝色"],
  ["米白", "米白色"],
  ["浅蓝", "浅蓝色"],
  ["宝蓝", "宝蓝色"],
  ["焦糖", "焦糖色"],
  ["橘色", "橘色"],
  ["大红", "大红色"],
  ["咖色", "咖色"],
  ["白", "白色"],
  ["黑", "黑色"],
  ["红", "红色"],
  ["黄", "黄色"],
  ["蓝", "蓝色"],
  ["绿", "绿色"],
  ["粉", "粉色"],
  ["米", "米色"],
  ["咖", "咖色"],
];

const confirmedCompoundAliases = new Map([
  ["焦糖米提", { bagColor: "焦糖色", handleColor: "米色" }],
  ["焦糖米提手", { bagColor: "焦糖色", handleColor: "米色" }],
  ["米白咖提", { bagColor: "米白色", handleColor: "咖色" }],
  ["米白咖提手", { bagColor: "米白色", handleColor: "咖色" }],
]);

export function recognizeOrderConversation(input, options = {}) {
  const messages = normalizeSourceMessages(input, options);
  const seenMessages = new Map();
  const sourceMessages = [];
  const orderRows = [];
  const nonOrderIntents = [];
  const temporaryHolds = [];
  const riskHints = [];
  const draftGroups = [];
  let lastOrderGroup = null;
  let lastInventoryInquiry = null;

  for (const message of messages) {
    const duplicateKey = buildDuplicateKey(message);
    const duplicateOf = seenMessages.get(duplicateKey) ?? "";
    if (!duplicateOf) seenMessages.set(duplicateKey, message.id);

    const classification = duplicateOf
      ? { type: "duplicate_candidate", label: "疑似重复消息" }
      : classifyMessage(message, { lastInventoryInquiry });
    const sourceRecord = {
      ...message,
      intentType: classification.type,
      intentLabel: classification.label,
      duplicateOf,
      orderGroupId: "",
      appendDecision: "",
    };

    if (classification.type === "duplicate_candidate") {
      riskHints.push(buildMessageRisk(message, "duplicate_message", "warning", `消息与 ${duplicateOf} 内容重复，未重复计入订单。`));
      nonOrderIntents.push({ ...sourceRecord, status: "待人工确认" });
      sourceMessages.push(sourceRecord);
      continue;
    }

    if (classification.type === "inventory_inquiry") {
      const inquiry = {
        ...sourceRecord,
        status: "询库存-待客户确认",
        reservesInventory: false,
        parsedCandidates: parseMessageRows(message, buildColorLexicon({ ...options, ...message }), options).rows,
      };
      lastInventoryInquiry = inquiry;
      nonOrderIntents.push(inquiry);
      sourceMessages.push(sourceRecord);
      continue;
    }

    if (classification.type === "merchant_reply") {
      nonOrderIntents.push({
        ...sourceRecord,
        status: "商家库存回复",
        relatedMessageId: lastInventoryInquiry?.id ?? "",
        advancesCustomerIntent: false,
      });
      sourceMessages.push(sourceRecord);
      continue;
    }

    if (classification.type === "inventory_confirmation") {
      nonOrderIntents.push({
        ...sourceRecord,
        status: "客户已确认库存意向-待生成订单或留货",
        relatedMessageId: lastInventoryInquiry?.id ?? "",
        reservesInventory: false,
      });
      sourceMessages.push(sourceRecord);
      continue;
    }

    if (classification.type === "temporary_hold") {
      const parsed = parseMessageRows(message, buildColorLexicon({ ...options, ...message }), options);
      const hold = {
        ...sourceRecord,
        status: "临时留货-待确认",
        holdType: "temporary_inventory_hold",
        expiresAt: resolveHoldExpiry(message.sentAt, options.now),
        reservesInventory: "pending_authorized_hold_creation",
        parsedCandidates: parsed.rows,
      };
      temporaryHolds.push(hold);
      nonOrderIntents.push(hold);
      sourceMessages.push(sourceRecord);
      riskHints.push(...parsed.riskHints);
      continue;
    }

    if (classification.type === "shortage_cancellation") {
      nonOrderIntents.push({
        ...sourceRecord,
        status: "库存不足取消-待关联明细",
        cancellationScope: wholeOrderCancelWords.test(message.text) ? "whole_order" : "shortage_lines_only",
        relatedOrderGroupId: lastOrderGroup?.id ?? "",
      });
      sourceMessages.push(sourceRecord);
      continue;
    }

    if (classification.type === "ordinary_chat") {
      nonOrderIntents.push({ ...sourceRecord, status: "普通消息-不生成订单" });
      sourceMessages.push(sourceRecord);
      continue;
    }

    const parsed = parseMessageRows(message, buildColorLexicon({ ...options, ...message }), options);
    const shouldAppend = classification.type === "follow_up"
      && lastOrderGroup
      && unconfirmedDraftStatuses.has(String(options.currentDraftStatus ?? "").trim());
    const groupId = shouldAppend ? lastOrderGroup.id : createOrderGroupId(message, draftGroups.length + 1);
    const appendDecision = classification.type !== "follow_up"
      ? "new_original_order"
      : shouldAppend
        ? "append_to_unconfirmed_draft"
        : "new_original_order_after_confirmation";
    let group = draftGroups.find((item) => item.id === groupId);
    if (!group) {
      group = {
        id: groupId,
        customerId: message.customerId,
        conversationId: message.conversationId,
        sourceMessageIds: [],
        rowIds: [],
        appendDecision,
      };
      draftGroups.push(group);
    }
    group.sourceMessageIds.push(message.id);
    sourceRecord.orderGroupId = groupId;
    sourceRecord.appendDecision = appendDecision;
    const rows = parsed.rows.map((row, rowIndex) => ({
      ...row,
      id: buildConversationRowId(groupId, message.sequence, rowIndex + 1),
      originalOrderGroupId: groupId,
      intentType: classification.type,
      sourceMessageId: message.id,
      sourceSender: message.sender,
      sourceSenderRole: message.senderRole,
      sourceSentAt: message.sentAt,
      sourceSequence: message.sequence,
      sourceConversationId: message.conversationId,
      source: message.text,
      appendDecision,
    }));
    group.rowIds.push(...rows.map((row) => row.id));
    orderRows.push(...rows);
    riskHints.push(...parsed.riskHints.map((hint) => ({ ...hint, relatedOrderGroupId: groupId })));
    lastOrderGroup = group;
    sourceMessages.push(sourceRecord);
  }

  return {
    version: "wechat-order-conversation-v1",
    sourceMessages,
    orderRows,
    draftGroups,
    nonOrderIntents,
    temporaryHolds,
    riskHints,
    summary: {
      messageCount: sourceMessages.length,
      orderMessageCount: sourceMessages.filter((item) => ["explicit_order", "follow_up"].includes(item.intentType)).length,
      orderRowCount: orderRows.length,
      originalOrderCount: draftGroups.length,
      inventoryInquiryCount: nonOrderIntents.filter((item) => item.intentType === "inventory_inquiry").length,
      temporaryHoldCount: temporaryHolds.length,
      duplicateCandidateCount: sourceMessages.filter((item) => item.intentType === "duplicate_candidate").length,
      reviewCount: riskHints.length,
    },
  };
}

function normalizeSourceMessages(input, options) {
  const rawMessages = Array.isArray(input)
    ? input
    : splitPastedConversation(String(input ?? ""));
  return rawMessages
    .map((value, index) => normalizeSourceMessage(value, index, options))
    .filter((item) => item.text);
}

function splitPastedConversation(text) {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];
  const lines = normalized.split(/\n+/).map((item) => item.trim()).filter(Boolean);
  return lines.length > 1 ? lines.map(parsePastedLine) : [{ text: normalized }];
}

function parsePastedLine(line) {
  const timed = line.match(/^\[?((?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}\s+)?\d{1,2}:\d{2})\]?\s+([^:：]{1,30})[:：]\s*(.+)$/);
  if (timed) return { sentAt: timed[1], sender: timed[2], text: timed[3] };
  const senderOnly = line.match(/^([^:：]{1,20})[:：]\s*(.+)$/);
  if (senderOnly) return { sender: senderOnly[1], text: senderOnly[2] };
  return { text: line };
}

function normalizeSourceMessage(value, index, options) {
  const source = typeof value === "string" ? { text: value } : value ?? {};
  return {
    id: cleanText(source.id ?? source.messageId) || `MSG-${String(index + 1).padStart(3, "0")}`,
    conversationId: cleanText(source.conversationId ?? source.groupId ?? options.conversationId) || "manual-entry",
    customerId: cleanText(source.customerId ?? options.customerId),
    sender: cleanText(source.sender ?? source.senderName),
    senderId: cleanText(source.senderId),
    senderRole: normalizeSenderRole(source.senderRole ?? source.role),
    sentAt: cleanText(source.sentAt ?? source.timestamp),
    sequence: Number.isInteger(Number(source.sequence)) ? Number(source.sequence) : index + 1,
    text: cleanText(source.text ?? source.content),
  };
}

function classifyMessage(message, context) {
  const compact = compactText(message.text);
  if (message.senderRole === "merchant" || message.senderRole === "office" || isMerchantSender(message.sender)) {
    if (merchantReplyWords.test(compact)) return { type: "merchant_reply", label: "商家回复" };
  }
  if (holdWords.test(compact)) return { type: "temporary_hold", label: "临时留货请求" };
  if (inquiryWords.test(compact)) return { type: "inventory_inquiry", label: "库存询问" };
  if (shortageCancelWords.test(compact) || wholeOrderCancelWords.test(compact)) {
    return { type: "shortage_cancellation", label: "库存不足取消" };
  }
  if (context.lastInventoryInquiry && customerConfirmationWords.test(compact)) {
    return { type: "inventory_confirmation", label: "客户确认库存意向" };
  }
  if (followUpWords.test(compact)) return { type: "follow_up", label: "后续追加" };
  if (looksLikeExplicitOrder(compact)) return { type: "explicit_order", label: "明确下单" };
  return { type: "ordinary_chat", label: "普通消息" };
}

function isMerchantSender(value) {
  return /办公室|客服|商家|店铺|我方/.test(cleanText(value));
}

function looksLikeExplicitOrder(text) {
  const hasQuantity = /\d{1,6}\s*(?:个|只|条|包)?/.test(text);
  const hasSpec = /\d{2}\s*[*xX×+]\s*\d{2}|袋|提(?:手)?|覆膜/.test(text);
  return hasQuantity && (hasSpec || explicitOrderWords.test(text));
}

function parseMessageRows(message, colorLexicon, options) {
  const dimension = normalizeLikelyDimensionTypo(message.text);
  const compoundAlias = resolveCompoundAlias(dimension.normalizedText, colorLexicon, message);
  const colorQuantities = extractColorQuantities(dimension.normalizedText, colorLexicon);
  const parser = options.parseOrderText ?? parseOrderText;
  let rows = [];
  if (colorQuantities.length > 1) {
    rows = colorQuantities.flatMap((item) => {
      const parserText = `${stripColorQuantities(dimension.normalizedText, colorLexicon)} 白${item.qty}个`;
      const parsed = parser(parserText, {
        customers: options.customers ?? [],
        inventories: options.inventories ?? [],
      });
      return (parsed.slice(0, 1).length ? parsed.slice(0, 1) : [{}]).map((row) => ({
        ...row,
        color: item.color,
        qty: item.qty,
      }));
    });
  } else {
    rows = parser(dimension.normalizedText, {
      customers: options.customers ?? [],
      inventories: options.inventories ?? [],
    });
  }
  const reviewReasons = [];
  if (dimension.corrected) reviewReasons.push(`疑似尺寸输入错误：${dimension.originalSize}，候选 ${dimension.suggestedSize}`);
  if (compoundAlias?.needsReview) reviewReasons.push("颜色/提手短写需确认");
  if (!compoundAlias && hasUnresolvedColorHandleShorthand(dimension.normalizedText)) {
    reviewReasons.push("未匹配的颜色/提手短写需确认");
  }
  const normalizedRows = rows.map((row) => {
    const customer = (options.customers ?? []).find((item) => item.id === message.customerId);
    const next = {
      ...row,
      customer: customer?.name ?? row.customer,
      customerId: message.customerId || row.customerId,
      source: message.text,
      reviewReasons: [...new Set([...(row.reviewReasons ?? []), ...reviewReasons])],
      dimensionEvidence: dimension.corrected
        ? { original: dimension.originalSize, suggested: dimension.suggestedSize, requiresConfirmation: true }
        : undefined,
      aliasEvidence: compoundAlias?.evidence,
    };
    if (compoundAlias) {
      next.color = compoundAlias.bagColor;
      next.handleColor = compoundAlias.handleColor;
      next.handle = next.handle || "普通提";
    }
    const laminatedBag = /覆膜袋/.test(message.text);
    if (laminatedBag) {
      next.product = "覆膜袋";
      next.style = "覆膜袋";
      next.print = "否";
      next.printColor = "非印刷";
      next.printSide = "非印刷";
      next.artworkStatus = "非印刷";
    }
    const enriched = colorQuantities.length > 1 || compoundAlias || dimension.corrected || laminatedBag
      ? enrichDraftRow(next, options.inventories ?? [])
      : next;
    if (next.reviewReasons.length) enriched.confidence = "low";
    return enriched;
  });
  return {
    rows: normalizedRows,
    riskHints: normalizedRows.flatMap((row, index) => row.reviewReasons.map((reason) => ({
      riskType: reason.startsWith("疑似尺寸") ? "dimension_confirmation" : "alias_confirmation",
      level: "review",
      message: reason,
      relatedMessageId: message.id,
      relatedRowIndex: index,
    }))),
  };
}

function normalizeLikelyDimensionTypo(text) {
  const match = text.match(/(\d{2})\s*\+\s*(\d{2})(?!\s*\+)/);
  if (!match) return { normalizedText: text, corrected: false };
  const originalSize = `${match[1]}+${match[2]}`;
  const suggestedSize = `${match[1]}*${match[2]}`;
  return {
    normalizedText: text.replace(match[0], suggestedSize),
    corrected: true,
    originalSize,
    suggestedSize,
  };
}

function buildColorLexicon(options) {
  const standardColors = new Map((options.standardColors ?? []).map((item) => [cleanText(item.id), cleanText(item.name)]));
  const sourceIds = new Set([cleanText(options.customerId), cleanText(options.conversationId)].filter(Boolean));
  const entries = new Map(builtInColors.map(([alias, color]) => [alias, { color, confirmed: false }]));
  for (const alias of options.colorAliases ?? []) {
    if (alias.enabled === false) continue;
    const sourceType = cleanText(alias.sourceType ?? alias.source_type) || "global";
    const sourceId = cleanText(alias.sourceId ?? alias.source_id);
    if (sourceType !== "global" && sourceId && !sourceIds.has(sourceId)) continue;
    const aliasText = cleanText(alias.alias);
    const standardColor = standardColors.get(cleanText(alias.standardColorId ?? alias.standard_color_id))
      || cleanText(alias.standardColor ?? alias.color);
    if (aliasText && standardColor) entries.set(aliasText, { color: normalizeColor(standardColor), confirmed: true });
  }
  return [...entries.entries()]
    .map(([alias, value]) => ({ alias, color: normalizeColor(value.color), confirmed: value.confirmed }))
    .sort((left, right) => right.alias.length - left.alias.length);
}

function resolveCompoundAlias(text, colorLexicon, message) {
  const compact = compactText(text);
  for (const [alias, value] of confirmedCompoundAliases) {
    if (!compact.includes(alias)) continue;
    return {
      ...value,
      needsReview: false,
      evidence: { alias, sourceScope: message.conversationId, status: "confirmed_business_alias" },
    };
  }
  const repeated = compact.match(/([\u3400-\u9fff]{2,8})\1提手/);
  if (repeated) {
    return {
      bagColor: normalizeColor(repeated[1]),
      handleColor: normalizeColor(repeated[1]),
      needsReview: false,
      evidence: { alias: repeated[0], sourceScope: message.conversationId, status: "confirmed_same_color_pattern" },
    };
  }
  const beforeHandle = compact.match(/([\u3400-\u9fff]{2,16})提(?:手)?/);
  if (!beforeHandle) return null;
  for (const bag of colorLexicon) {
    if (!beforeHandle[1].startsWith(bag.alias)) continue;
    const remainder = beforeHandle[1].slice(bag.alias.length);
    const handle = colorLexicon.find((item) => item.alias === remainder);
    if (!handle) continue;
    const confirmed = bag.confirmed && handle.confirmed;
    return {
      bagColor: bag.color,
      handleColor: handle.color,
      needsReview: !confirmed,
      evidence: {
        alias: beforeHandle[0],
        sourceScope: message.conversationId,
        status: confirmed ? "confirmed_source_alias" : "parsed_unconfirmed_alias",
      },
    };
  }
  return null;
}

function extractColorQuantities(text, colorLexicon) {
  const aliases = colorLexicon.map((item) => escapeRegExp(item.alias)).join("|");
  if (!aliases) return [];
  const colors = new Map(colorLexicon.map((item) => [item.alias, item.color]));
  const matches = [];
  const pattern = new RegExp(`(${aliases})色?\\s*(\\d{1,6})(?:\\s*个)?`, "g");
  for (const match of text.matchAll(pattern)) {
    const prefix = text.slice(Math.max(0, Number(match.index) - 2), Number(match.index));
    if (/印/.test(prefix)) continue;
    matches.push({ color: colors.get(match[1]) ?? normalizeColor(match[1]), qty: Number(match[2]) });
  }
  return matches;
}

function stripColorQuantities(text, colorLexicon) {
  const aliases = colorLexicon.map((item) => escapeRegExp(item.alias)).join("|");
  if (!aliases) return text;
  return text.replace(new RegExp(`(${aliases})色?\\s*\\d{1,6}(?:\\s*个)?`, "g"), " ");
}

function hasUnresolvedColorHandleShorthand(text) {
  const matches = [...compactText(text).matchAll(/([\u3400-\u9fff]{2,12})提(?:手)?(?=\d|个|$)/g)];
  return matches.some((match) => !/(?:自|普通|加长|长|短|手|来|取)$/.test(match[1]));
}

function resolveHoldExpiry(sentAt, now = () => new Date()) {
  const dateMatch = String(sentAt ?? "").match(/(20\d{2})[-/](\d{1,2})[-/](\d{1,2})/);
  if (dateMatch) {
    return `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}T19:30:00+08:00`;
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(now()));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T19:30:00+08:00`;
}

function buildMessageRisk(message, riskType, level, detail) {
  return { riskType, level, message: detail, relatedMessageId: message.id };
}

function createOrderGroupId(message, index) {
  const seed = cleanText(message.id).replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "");
  return `ODG-${seed || String(index).padStart(3, "0")}`;
}

function buildConversationRowId(groupId, sequence, rowIndex) {
  return `${groupId}-${String(sequence).padStart(3, "0")}-${String(rowIndex).padStart(2, "0")}`;
}

function buildDuplicateKey(message) {
  return [message.conversationId, message.customerId, message.senderId || message.sender, compactText(message.text)].join("|");
}

function normalizeSenderRole(value) {
  const role = cleanText(value).toLowerCase();
  if (["merchant", "office", "staff", "seller", "商家", "办公室", "客服"].includes(role)) {
    return role === "merchant" || role === "商家" ? "merchant" : "office";
  }
  return "customer";
}

function normalizeColor(value) {
  const color = cleanText(value);
  return color && !color.endsWith("色") && !color.endsWith("红") && !color.endsWith("蓝") ? `${color}色` : color;
}

function compactText(value) {
  return cleanText(value).replace(/[\s，,。.!！?？；;：:]/g, "");
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
