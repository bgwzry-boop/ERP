import { enrichDraftRow } from "../lib/orderParser.js";
import { isArtworkReady, joinUniqueNotes } from "../domain/officeRules.js";

export function updateDraftRowsField(rows, { id, field, value, customers, inventoryRecords }) {
  return rows.map((row) => {
    if (row.id !== id) return row;
    const next = { ...row, [field]: field === "qty" ? Number(value || 0) : value };
    if (field === "customerId") {
      const customer = value ? customers.find((item) => item.id === value) : null;
      next.customer = customer?.name ?? "待确认客户";
    }
    if (field === "print") {
      if (value === "否") {
        next.printColor = "非印刷";
        next.printSide = "非印刷";
        next.artworkStatus = "非印刷";
      } else {
        next.printColor = row.printColor === "非印刷" ? "待确认" : row.printColor || "待确认";
        next.printSide = row.printSide === "非印刷" ? "待确认" : row.printSide || "待确认";
        next.artworkStatus = row.artworkStatus === "非印刷" ? "待上传" : row.artworkStatus || "待上传";
      }
    }
    return enrichDraftRow(next, inventoryRecords);
  });
}

export function deleteDraftRow(rows, selectedId) {
  const selectedIndex = rows.findIndex((row) => row.id === selectedId);
  if (selectedIndex < 0) return null;
  const nextRows = rows.filter((row) => row.id !== selectedId);
  const nextSelected = nextRows[Math.min(selectedIndex, nextRows.length - 1)];
  return {
    rows: nextRows,
    selectedId: nextSelected?.id ?? "",
    status: nextRows.length ? "已调整待确认" : "空草稿",
    toast: nextRows.length ? "已删除当前行，保存前仍会重新校验库存和价格。" : "已删除最后一行，草稿为空。",
  };
}

export function splitDraftRow(rows, selectedId, inventoryRecords, splitId) {
  const selectedIndex = rows.findIndex((row) => row.id === selectedId);
  if (selectedIndex < 0) return null;
  const row = rows[selectedIndex];
  const qty = Number(row.qty || 0);
  if (qty < 2) {
    return {
      blocked: true,
      toast: "当前行数量小于 2，不能自动拆分；可直接手动修改数量。",
    };
  }

  const firstQty = Math.ceil(qty / 2);
  const secondQty = qty - firstQty;
  const first = enrichDraftRow({ ...row, qty: firstQty, source: `${row.source}（手动拆分）` }, inventoryRecords);
  const second = enrichDraftRow({ ...row, id: splitId, qty: secondQty, source: `${row.source}（手动拆分）` }, inventoryRecords);
  const nextRows = [...rows];
  nextRows.splice(selectedIndex, 1, first, second);

  return {
    rows: nextRows,
    selectedId: splitId,
    status: "已调整待确认",
    toast: `已把当前行拆成 ${firstQty} 和 ${secondQty} 两行。`,
  };
}

export function mergeDraftRowWithNext(rows, selectedId, inventoryRecords) {
  const selectedIndex = rows.findIndex((row) => row.id === selectedId);
  if (selectedIndex < 0) return null;
  if (selectedIndex >= rows.length - 1) {
    return {
      blocked: true,
      toast: "当前行下面没有可合并的明细。",
    };
  }

  const row = rows[selectedIndex];
  const next = rows[selectedIndex + 1];
  const merged = enrichDraftRow(
    {
      ...row,
      product: row.product === next.product ? row.product : `${row.product}/${next.product}`,
      size: row.size === next.size ? row.size : "待确认",
      color: row.color === next.color ? row.color : "待确认",
      handle: row.handle === next.handle ? row.handle : row.handle,
      style: row.style === next.style ? row.style : row.style,
      print: row.print === "是" || next.print === "是" ? "是" : "否",
      qty: Number(row.qty || 0) + Number(next.qty || 0),
      fulfillment: row.fulfillment === next.fulfillment ? row.fulfillment : "待确认",
      latest: row.latest === next.latest ? row.latest : row.latest !== "待确认" ? row.latest : next.latest,
      printColor: row.printColor === next.printColor ? row.printColor : "待确认",
      printSide: row.printSide === next.printSide ? row.printSide : "待确认",
      handleColor: row.handleColor === next.handleColor ? row.handleColor : "待确认",
      note: joinUniqueNotes([row.note, next.note, row.handle !== "普通提" ? row.handle : "", next.handle !== "普通提" ? next.handle : ""]),
      artworkStatus: isArtworkReady(row.artworkStatus) || isArtworkReady(next.artworkStatus) ? "已有稿件" : row.artworkStatus === "客户待补" || next.artworkStatus === "客户待补" ? "客户待补" : "待上传",
      source: `${row.source}；${next.source}（手动合并）`,
    },
    inventoryRecords,
  );
  const nextRows = [...rows];
  nextRows.splice(selectedIndex, 2, merged);

  return {
    rows: nextRows,
    selectedId: merged.id,
    status: "已调整待确认",
    toast: "已合并当前行和下一行；不同的尺寸、颜色、交付或印刷字段已标记为待确认。",
  };
}
