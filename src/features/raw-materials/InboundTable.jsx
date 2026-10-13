import { DataTable, StatusPill } from "../../shared/ui/operational.jsx";
import { formatRawMaterialDeliveryNoteNo, getRawMaterialNextActionLabel, getRawMaterialInboundTone } from "../../domain/rawMaterialInboundListState.js";
import { buildRawMaterialStockLookup } from "../../../shared/rawMaterialInventorySupport.js";
import { formatRawMaterialWeight } from "./rawMaterialWeight.js";

export function InboundTable({ inbounds, records, selectedId, onSelect }) {
  return (
    <DataTable
      className="raw-material-inbound-table"
      columns={["供应商 / 单号", "原料 / 规格", "卷 / 重量", "状态", "下一步"]}
      rows={records.map((item) => {
        const stock = buildRawMaterialStockLookup(inbounds, {
          color: item.factoryColor || item.supplierColor,
          widthCm: item.widthCm,
          gramWeightGsm: item.gramWeightGsm,
        });
        return {
          id: item.id,
          active: item.id === selectedId,
          tone: getRawMaterialInboundTone(item.status),
          onClick: () => onSelect(item.id),
          cells: [
            <RawMaterialTableCell primary={item.supplierName} secondary={formatRawMaterialDeliveryNoteNo(item)} />,
            <RawMaterialTableCell primary={item.productName || item.materialType} secondary={`${item.factoryColor || item.supplierColor} / ${item.widthCm || "?"}cm / 可用${stock.availableWeightKg}kg`} />,
            <RawMaterialTableCell primary={`${item.rollCount || item.rolls?.length || 0}${item.materialType === "提手" ? "件" : "卷"}`} secondary={formatRawMaterialWeight(item)} />,
            <StatusPill tone={getRawMaterialInboundTone(item.status)}>{item.status}</StatusPill>,
            <span className="raw-material-next-step">{getRawMaterialNextActionLabel(item)}</span>,
          ],
        };
      })}
    />
  );
}

function RawMaterialTableCell({ primary, secondary }) {
  return <span className="raw-material-table-cell"><strong>{primary || "待补"}</strong><small>{secondary || "待补"}</small></span>;
}
