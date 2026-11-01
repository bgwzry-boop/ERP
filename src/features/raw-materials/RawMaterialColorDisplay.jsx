import { formatRawMaterialColorDisplay } from "./rawMaterialColorDisplay.js";

export function RawMaterialColorDisplay({ factoryColor = "", supplierColor = "" }) {
  const factory = String(factoryColor || "").trim();
  const supplier = String(supplierColor || "").trim();
  if (factory && supplier) {
    return [
      <span key="factory" className="raw-material-factory-color">{factory}</span>,
      <span key="ticket" className="raw-material-ticket-color">{`（${supplier}）`}</span>,
    ];
  }
  return formatRawMaterialColorDisplay(factoryColor, supplierColor);
}
