import { latestPriceOrder } from "./orderPricingConfirmation.mjs";
import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  getPublishedOrderPriceSource,
  resolvePublishedRow,
} from "./orderDraftPublishedPricing.mjs";
import { previewSpecialBagQuote } from "./miniapp/miniappErpProjectionAdapter.mjs";
import { resolvedOrderPricingMaterialSnapshot } from "./orderPricingMaterialSource.mjs";
import {
  buildOrderPrintingPriceGroups,
  assertUnstartedPrintingSupplement,
  printingGroupIdentity,
  roundOrderMoney as money,
  orderPricingError as fail,
} from "./orderPrintingPriceGroups.mjs";
import { normalizeOrderType } from "../shared/orderRouting.js";

const clean = (value) => String(value ?? "").trim();
const inputFields = [
  "id",
  "customerId",
  "product",
  "orderType",
  "size",
  "color",
  "handle",
  "handleColor",
  "style",
  "print",
  "qty",
  "printSide",
  "printColor",
  "printContent",
  "specialRequirements",
  "originalOrderGroupId",
  "sourceHoldId",
  "sourceIntentId",
];
export function officePricingInput(rows) {
  return rows.map((row) =>
    Object.fromEntries(
      inputFields.map((key) => [
        key,
        row[key] ?? (key === "specialRequirements" ? [] : ""),
      ]),
    ),
  );
}
export function officePricingDigest(rows) {
  return createHash("sha256")
    .update(JSON.stringify(officePricingInput(rows)))
    .digest("hex");
}
const latestPrice = (workspace, id) =>
  [...(workspace.priceSnapshots ?? [])]
    .filter((price) => price.orderLineId === id)
    .sort(latestPriceOrder)[0];

function amount(value, decimals, label, allowNegative = false) {
  if (!["number", "string"].includes(typeof value) || !String(value).trim())
    throw fail(
      "ORDER_PRICE_OVERRIDE_INVALID",
      `${label}必须明确填写，不能把空值当作零。`,
      422,
    );
  const number = Number(value),
    scale = 10 ** decimals;
  if (
    !Number.isFinite(number) ||
    (!allowNegative && number < 0) ||
    Math.abs(number) > 1_000_000 ||
    Math.abs(number * scale - Math.round(number * scale)) > 0.000001
  )
    throw fail("ORDER_PRICE_OVERRIDE_INVALID", `${label}格式或范围无效。`, 422);
  return number;
}

export async function buildOfficeDraftPricingQuote({
  workspace,
  draft,
  rows,
  body,
  operatorId,
  actionPermissions = [],
  now,
}) {
  const sourceState = workspace.coreWorkspaceReadRepository
    ? await workspace.coreWorkspaceReadRepository.loadState()
    : workspace;
  if (
    !Array.isArray(sourceState.priceTables) ||
    !Array.isArray(sourceState.priceTableItems)
  )
    throw fail(
      "ORDER_PRICE_SOURCE_REQUIRED",
      "通用价格资料读取不完整，请重试；草稿已保留。",
    );
  for (const [key, value] of Object.entries(sourceState))
    if (Array.isArray(value)) workspace[key] = value;
  if (workspace.rawMaterialInboundRepository?.loadState) {
    const state = await workspace.rawMaterialInboundRepository.loadState();
    if (Array.isArray(state?.rawMaterialInbounds))
      workspace.rawMaterialInbounds = state.rawMaterialInbounds;
  }
  const overrides = Array.isArray(body.overrides) ? body.overrides : [];
  if (overrides.length && !actionPermissions.includes("order.price.override"))
    throw fail(
      "ORDER_PRICE_OVERRIDE_FORBIDDEN",
      "当前账号没有本单改价权限。",
      403,
    );
  const overrideMap = new Map();
  for (const entry of overrides) {
    if (
      !rows.some((row) => row.id === entry.draftLineId) ||
      overrideMap.has(entry.draftLineId)
    )
      throw fail(
        "ORDER_PRICE_OVERRIDE_INVALID",
        "改价明细必须对应本草稿唯一的订单行。",
        422,
      );
    if (!clean(entry.reason))
      throw fail(
        "ORDER_PRICE_OVERRIDE_REASON_REQUIRED",
        "本单改价必须填写实际原因。",
        422,
      );
    overrideMap.set(entry.draftLineId, entry);
  }
  let baseSource;
  try {
    baseSource = getPublishedOrderPriceSource(workspace, now);
  } catch {
    baseSource = null;
  }
  const materialSources = [],
    bases = new Map();
  const scopedRows = rows.map((row) => ({
    ...row,
    printingScope: row.originalOrderGroupId || draft.id,
  }));
  const relatedIds = [
    ...new Set(
      Array.isArray(body.supplementation?.orderLineIds)
        ? body.supplementation.orderLineIds.map(clean).filter(Boolean)
        : [],
    ),
  ];
  const relatedRows = relatedIds.map((id) => {
    const row = (workspace.orderLines ?? []).find(
        (row) => (row.id ?? row.orderLineId) === id,
      ),
      prior = latestPrice(workspace, id);
    if (
      !row ||
      !prior ||
      !Number.isSafeInteger(Number(row.revision)) ||
      Number(row.revision) < 1 ||
      prior.sourceEvidence?.intakeId
    )
      throw fail(
        "ORDER_PRINT_SUPPLEMENT_NOT_ELIGIBLE",
        "关联原单、当前版本或价格依据缺失，小程序已锁价原单不能被补单自动重定价。",
      );
    return {
      ...row,
      id,
      printContent:
        prior.sourceEvidence?.officeQuoteInput?.printContent ||
        row.printContent,
      priorPrice: prior,
    };
  });
  if (relatedRows.length) {
    if (!actionPermissions.includes("order.price.override"))
      throw fail(
        "ORDER_PRICE_OVERRIDE_FORBIDDEN",
        "调整关联原单价格需要本单改价权限。",
        403,
      );
    if (
      body.supplementation.confirmedSameBatch !== true ||
      !clean(body.supplementation.reason) ||
      !clean(body.supplementation.batchReference)
    )
      throw fail(
        "ORDER_PRINT_BATCH_CONFIRMATION_REQUIRED",
        "请明确填写同批印刷标识和补单依据，确认原单尚未开印。",
      );
    assertUnstartedPrintingSupplement(
      workspace,
      relatedRows,
      rows[0]?.customerId,
    );
    for (const row of relatedRows) {
      const priorGroup = row.priorPrice.sourceEvidence?.officePricingGroup;
      if (!(priorGroup?.memberCount > 1)) continue;
      const members = (workspace.orderLines ?? []).filter(
        (line) =>
          latestPrice(workspace, line.id ?? line.orderLineId)?.sourceEvidence
            ?.officePricingGroup?.groupId === priorGroup.groupId,
      );
      if (
        members.length !== priorGroup.memberCount ||
        members.some(
          (line) => !relatedIds.includes(line.id ?? line.orderLineId),
        )
      ) {
        throw fail(
          "ORDER_PRINT_EXISTING_GROUP_REQUIRED",
          "所选原单已经合组，请选择该组全部明细后重新核价，不能只调整其中一行。",
        );
      }
    }
    const target =
      scopedRows.find(
        (row) => row.id === body.supplementation.targetDraftLineId,
      ) ?? scopedRows[0];
    const targetIdentity = printingGroupIdentity(target);
    if (!targetIdentity)
      throw fail(
        "ORDER_PRINT_GROUP_NOT_MATCHED",
        "请先明确本次补单的印刷内容与尺寸。",
      );
    for (const row of relatedRows) row.printingScope = targetIdentity.scope;
  }
  const groups = buildOrderPrintingPriceGroups(scopedRows, relatedRows);
  for (const row of scopedRows) {
    let base;
    try {
      if (normalizeOrderType(row.orderType) === "custom_special") {
        const parts = clean(row.size)
          .replace(/[×xX]/gu, "*")
          .split("*")
          .map(Number);
        if (parts.length !== 3)
          throw fail(
            "ORDER_SPECIAL_QUOTE_INVALID",
            "特殊尺寸必须明确填写宽、高、侧宽。",
            422,
          );
        const input = {
          widthCm: parts[0],
          heightCm: parts[1],
          gussetCm: parts[2],
          quantity: row.qty,
          materialType: /覆膜/u.test(`${row.product} ${row.style}`)
            ? "laminated_nonwoven"
            : "nonwoven",
          handleId: /加长|长提/u.test(row.handle) ? "extended" : "regular",
          specialRequirements: [
            ...new Set([
              ...(row.specialRequirements ?? []),
              ...(/加长|长提/u.test(row.handle) ? ["extended_handle"] : []),
            ]),
          ],
          printingMode: row.print === "是" ? "screen" : "none",
          printSide: /双/u.test(row.printSide) ? "double" : "single",
        };
        const facts =
          await workspace.orderDraftRepository.getOrderPricingMaterialFacts({
            workspace,
            input,
          });
        const material = resolvedOrderPricingMaterialSnapshot(facts);
        if (!material)
          throw fail(
            "ORDER_SPECIAL_MATERIAL_PRICE_REQUIRED",
            "缺少已确认材料批次价或正式发布材料快照，请核实后报价，或由有权限人员录入本单价。",
          );
        const quote = previewSpecialBagQuote(input, {}, material);
        if (!quote.available)
          throw fail("ORDER_SPECIAL_QUOTE_UNAVAILABLE", quote.note);
        materialSources.push({ input, facts });
        base = {
          bagPrice:
            Math.round(
              (quote.bagUnitPrice +
                quote.handleUnitAddon +
                quote.snapButtonUnitAddon) *
                10000,
            ) / 10000,
          printPrice: quote.printUnitPrice,
          otherFee: 0,
          amount: quote.estimatedAmount,
          sourceEvidence: {
            kind: "erp_special_price",
            ruleVersion: quote.priceVersion,
            materialPriceVersion: quote.materialPriceVersion,
            specialQuote: quote,
          },
        };
      } else {
        if (!baseSource)
          throw fail(
            "ORDER_PRICE_SOURCE_REQUIRED",
            "尚无有效发布价，请核实报价或由有权限人员录入本单价。",
          );
        base = resolvePublishedRow(baseSource, row);
      }
    } catch (error) {
      if (
        !overrideMap.has(row.id) ||
        ![
          "ORDER_PRICE_SOURCE_REQUIRED",
          "ORDER_SPECIAL_MATERIAL_PRICE_REQUIRED",
          "ORDER_SPECIAL_QUOTE_INVALID",
          "ORDER_SPECIAL_QUOTE_UNAVAILABLE",
        ].includes(error.code)
      )
        throw error;
      base = null;
    }
    bases.set(row.id, base);
  }
  const id = `OQ-${randomUUID()}`;
  const linePrices = scopedRows.map((row) => {
    const base = bases.get(row.id),
      group = groups.find((group) => group.draftLineIds.includes(row.id));
    const automatic = base
      ? {
          bagPrice: base.bagPrice,
          printPrice: group?.unitPrice ?? base.printPrice,
          otherFee: base.otherFee,
          adjustmentAmount: 0,
          chargeableQty: row.qty,
        }
      : null;
    const override = overrideMap.get(row.id),
      resolved = {
        ...(automatic ?? {
          bagPrice: 0,
          printPrice: 0,
          otherFee: 0,
          adjustmentAmount: 0,
          chargeableQty: row.qty,
        }),
      };
    if (override) {
      for (const key of [
        "bagPrice",
        "printPrice",
        "otherFee",
        "adjustmentAmount",
      ])
        if (Object.hasOwn(override, key))
          resolved[key] = amount(
            override[key],
            /Price$/u.test(key) ? 4 : 2,
            key,
            key === "adjustmentAmount",
          );
      if (Object.hasOwn(override, "chargeableQty")) {
        if (
          !Number.isSafeInteger(override.chargeableQty) ||
          override.chargeableQty < 0 ||
          override.chargeableQty > row.qty
        )
          throw fail(
            "ORDER_PRICE_OVERRIDE_INVALID",
            "计费数量须为不超过本行数量的非负整数。",
            422,
          );
        resolved.chargeableQty = override.chargeableQty;
      }
      if (resolved.chargeableQty === 0 && override.freeOfCharge !== true)
        throw fail(
          "ORDER_PRICE_GIFT_BASIS_REQUIRED",
          "零计费必须明确标记赠送/不计费并填写依据。",
          422,
        );
    }
    if (!resolved.chargeableQty && !override)
      throw fail("ORDER_PRICE_SOURCE_REQUIRED", "本行缺少合法计价依据。");
    const finalAmount = money(
      (resolved.bagPrice + resolved.printPrice) * resolved.chargeableQty +
        resolved.otherFee +
        resolved.adjustmentAmount,
    );
    if (
      finalAmount < 0 ||
      finalAmount > 999999999999.99 ||
      !Number.isFinite(finalAmount) ||
      (resolved.chargeableQty > 0 &&
        (normalizeOrderType(row.orderType) === "external_print"
          ? resolved.printPrice
          : resolved.bagPrice) <= 0)
    )
      throw fail(
        "ORDER_PRICE_SOURCE_REQUIRED",
        "本单价不能用缺失或无依据零单价代替；请核实报价。",
      );
    const beforeAmount = automatic
      ? money(
          (automatic.bagPrice + automatic.printPrice) *
            automatic.chargeableQty +
            automatic.otherFee,
        )
      : null;
    const difference =
      beforeAmount === null ? null : money(finalAmount - beforeAmount);
    const overrideEvidence = override
      ? {
          before: automatic,
          after: resolved,
          beforeAmount,
          afterAmount: finalAmount,
          difference,
          reason: clean(override.reason),
          operatorId,
          recordedAt: now,
          managerReviewRequired:
            beforeAmount === null ||
            Math.abs(difference) > 50 ||
            (beforeAmount > 0 && Math.abs(difference) / beforeAmount > 0.05),
        }
      : null;
    return {
      draftLineId: row.id,
      ...resolved,
      finalAmount,
      amount: finalAmount,
      overrideReason: overrideEvidence?.reason ?? "",
      sourceEvidence: {
        kind: "office_price_quote",
        officeQuoteId: id,
        officeQuoteInput: officePricingInput([row])[0],
        base: base?.sourceEvidence ?? null,
        officePricingGroup: group ?? null,
        override: overrideEvidence,
      },
    };
  });
  const relatedRevisions = relatedRows.map((row) => {
    const group = groups.find((group) =>
        group.relatedOrderLineIds.includes(row.id),
      ),
      prior = row.priorPrice;
    const next = {
      ...prior,
      priceSnapshotId: `PS-${id}-${row.id}`,
      id: `PS-${id}-${row.id}`,
      snapshotType: "print_group_revision",
      versionNo: Number(prior.versionNo ?? 1) + 1,
      printPrice: group.unitPrice,
      createdBy: operatorId,
      createdAt: now,
      sourceEvidence: {
        ...prior.sourceEvidence,
        kind: "office_print_group_revision",
        officeQuoteId: id,
        previousPriceSnapshotId: prior.priceSnapshotId ?? prior.id,
        officePricingGroup: group,
        supplementation: structuredClone(body.supplementation),
        operatorId,
        recordedAt: now,
      },
    };
    next.finalAmount = money(
      (Number(next.bagPrice) + next.printPrice) * Number(next.chargeableQty) +
        Number(next.otherFee ?? 0) +
        Number(next.adjustmentAmount ?? 0),
    );
    if (
      !Number.isFinite(next.finalAmount) ||
      next.finalAmount < 0 ||
      next.finalAmount > 999999999999.99
    )
      throw fail(
        "ORDER_PRINT_SUPPLEMENT_REQUOTE_REQUIRED",
        "原单已有增减金额，合组后会出现无效金额，请先核对原单本单价依据，不能自动重定价。",
      );
    next.amount = next.finalAmount;
    return {
      orderLineId: row.id,
      expectedRevision: Number(row.revision),
      priorPrice: prior,
      nextPrice: next,
      productionTasks: (workspace.productionTasks ?? [])
        .filter(
          (task) =>
            (task.orderLineId ?? task.lineId) === row.id &&
            /丝印|印刷/u.test(task.taskType),
        )
        .map((task) => ({
          id: task.id ?? task.productionTaskId,
          revision: task.revision,
          status: task.taskStatus ?? task.status,
        })),
    };
  });
  return {
    id,
    draftId: draft.id,
    draftRevision: Number(draft.revision) + 1,
    inputDigest: officePricingDigest(rows),
    operatorId,
    createdAt: now,
    baseSource,
    materialSources,
    linePrices,
    groups,
    relatedRevisions,
    supplementation: relatedRows.length
      ? structuredClone(body.supplementation)
      : null,
  };
}

export function officeQuoteProjection(quote) {
  return {
    quoteId: quote.id,
    draftId: quote.draftId,
    clientRevision: quote.draftRevision,
    createdAt: quote.createdAt,
    excludedDraftLineIds: quote.excludedDraftLineIds ?? [],
    groups: quote.groups,
    lines: quote.linePrices.map((row) => ({
      draftLineId: row.draftLineId,
      bagPrice: row.bagPrice,
      printPrice: row.printPrice,
      otherFee: row.otherFee,
      adjustmentAmount: row.adjustmentAmount,
      chargeableQty: row.chargeableQty,
      amount: row.finalAmount,
      override: row.sourceEvidence.override,
      ruleVersion: row.sourceEvidence.base?.ruleVersion,
      materialPriceVersion: row.sourceEvidence.base?.materialPriceVersion,
    })),
    affectedOrders: quote.relatedRevisions.map((row) => ({
      orderLineId: row.orderLineId,
      expectedRevision: row.expectedRevision,
      previousAmount: row.priorPrice.finalAmount ?? row.priorPrice.amount,
      revisedAmount: row.nextPrice.finalAmount,
      previousPrintPrice: row.priorPrice.printPrice,
      revisedPrintPrice: row.nextPrice.printPrice,
    })),
  };
}

export function assertOfficeQuoteMatches(
  quote,
  draft,
  rows,
  body,
  permissions = [],
) {
  if (
    !quote ||
    quote.id !== body.pricingQuoteId ||
    quote.draftId !== draft.id ||
    quote.draftRevision !== Number(draft.revision) ||
    quote.inputDigest !== officePricingDigest(rows)
  )
    throw fail(
      "ORDER_PRICE_QUOTE_CHANGED",
      "报价或明细已变化，请重新生成报价并核对，草稿已保留。",
    );
  if (
    (quote.linePrices.some((row) => row.sourceEvidence.override) ||
      quote.relatedRevisions.length) &&
    !permissions.includes("order.price.override")
  )
    throw fail(
      "ORDER_PRICE_OVERRIDE_FORBIDDEN",
      "当前账号没有本单改价权限。",
      403,
    );
  const expected = quote.relatedRevisions.map((row) => row.orderLineId).sort(),
    actual = [...new Set(body.confirmedAffectedOrderLineIds ?? [])].sort();
  if (!isDeepStrictEqual(expected, actual))
    throw fail(
      "ORDER_PRINT_AFFECTED_CONFIRMATION_REQUIRED",
      "请逐项核对并确认所有受影响原单的新报价，原价记录将保留。",
    );
}
