import { normalizeRawMaterialScanCode } from "../../shared/rawMaterialRollScanCode.js";
import { supplierReturnShipped, supplierReturnStaged } from "../../shared/rawMaterialSupplierReturnStock.js";
import { normalizeRawMaterialInbounds } from "../rawMaterialInboundRecordService.mjs";
import { resolveRollSpecification } from "../../shared/rawMaterialRollInventory.js";
import { suppliersAreEquivalent } from "./rawMaterialSupplierReturnReconciliationService.mjs";

export function readSupplierReturnRollCode(query) {
  const code = normalizeRawMaterialScanCode(query?.get("rollCode"));
  return code.length <= 256 ? code : "";
}

export function buildSupplierReturnStockResponse(inbounds, query, { canStage } = {}) {
  const code = readSupplierReturnRollCode(query);
  const pending = [];
  const matches = [];
  const reviewedNotes = [];
  for (const inbound of normalizeRawMaterialInbounds(inbounds)) {
    if (inbound.status === "已作废") continue;
    if (inbound.documentDirection === "supplier_return") {
      if (inbound.status === "退货单已复核") reviewedNotes.push(inbound);
      continue;
    }
    for (const roll of inbound.rolls ?? []) {
      if (roll.inventoryStatus === supplierReturnStaged && roll.id) pending.push(projectRoll(inbound, roll));
      if (code && roll.id && normalizeRawMaterialScanCode(roll.id) === code) matches.push(projectRoll(inbound, roll));
    }
  }
  pending.sort((left, right) => (right.returnRecord?.stagedAt ?? "").localeCompare(left.returnRecord?.stagedAt ?? "") || left.id.localeCompare(right.id));
  const page = Math.max(1, Number.parseInt(query?.get("page"), 10) || 1);
  const pageSize = 20;
  const matchedRoll = matches.length === 1 ? matches[0] : null;
  const returnNotes = canStage && matchedRoll?.status === "可用"
    ? reviewedNotes.filter((note) => suppliersAreEquivalent(matchedRoll.supplierName, note.supplierName))
      .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt) || left.id.localeCompare(right.id))
      .map((note) => ({
        id: note.id, documentNo: note.deliveryNoteNo, supplierName: note.supplierName,
        date: note.receivedAt, rollCount: Math.abs(note.rollCount), weightKg: Math.abs(note.totalWeightKg),
      }))
    : [];
  return {
    items: pending.slice((page - 1) * pageSize, page * pageSize), total: pending.length, page, pageSize,
    matchedRoll, returnNotes, ambiguous: matches.length > 1,
  };
}

function projectRoll(inbound, roll) {
  const record = (inbound.rawMaterialSupplierReturnRecords ?? []).find((item) =>
    item.supplierReturnRecordId === roll.supplierReturnRecordId && item.rollId === roll.id &&
    item.sourceReturnInboundId === roll.sourceReturnInboundId && item.status === roll.inventoryStatus);
  const spec = resolveRollSpecification(inbound, roll);
  return {
    id: roll.id, inboundId: inbound.id, revision: inbound.revision, status: roll.inventoryStatus,
    supplierName: inbound.supplierName, labelStatus: roll.labelStatus,
    color: roll.factoryColor || roll.supplierColor || inbound.factoryColor || inbound.supplierColor,
    spec: spec.fullLabel, weightKg: roll.weightKg, unit: roll.unit || inbound.unit, location: roll.location || inbound.location,
    returnRecord: record && [supplierReturnStaged, supplierReturnShipped].includes(record.status) ? {
      id: record.supplierReturnRecordId, sourceId: record.sourceReturnInboundId,
      documentNo: record.sourceDocumentNo, documentDate: record.sourceDocumentDate, stagedAt: record.stagedAt,
      shippedAt: record.shippedAt,
    } : null,
  };
}
