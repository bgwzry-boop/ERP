import { formatRawMaterialColorDisplay } from "./rawMaterialColorDisplay.js";

export function RawMaterialColorDisplay({ factoryColor = "", supplierColor = "" }) {
  const factory = String(factoryColor || "").trim();
  const supplier = String(supplierColor || "").trim();
  // 括号外是我厂颜色，括号里是送货单上的颜色；只有送货颜色时只显示括号部分。
  if (supplier) {
    return [
      factory ? <span key="factory" className="raw-material-factory-color">{factory}</span> : null,
      <span key="ticket" className="raw-material-ticket-color">{`（${supplier}）`}</span>,
    ];
  }
  return formatRawMaterialColorDisplay(factoryColor, supplierColor);
}
