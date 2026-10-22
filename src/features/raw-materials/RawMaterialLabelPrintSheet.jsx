import { buildRawMaterialCode39Bars } from "../../domain/rawMaterialLabelBarcode.js";
import { formatRawMaterialMobileSpec } from "../../../shared/rawMaterialSpec.js";

export function RawMaterialLabelPrintSheet({ inbound }) {
  if (!inbound) return null;
  const printableRolls = (inbound.rolls ?? []).filter((roll) => roll.inventoryStatus !== "可用");
  if (!printableRolls.length) return null;
  return (
    <section className="raw-material-label-print-sheet" aria-hidden="true">
      {printableRolls.map((roll) => (
        <RawMaterialRollPrintLabel inbound={inbound} key={roll.id} roll={roll} />
      ))}
    </section>
  );
}

export function RawMaterialCode39({ value }) {
  const barcode = buildRawMaterialCode39Bars(value);
  if (!barcode.normalizedValue) return null;
  return (
    <svg
      aria-label={`卷码 ${barcode.normalizedValue}`}
      className="raw-material-code39"
      preserveAspectRatio="none"
      role="img"
      viewBox={`0 0 ${barcode.width} 50`}
    >
      {barcode.bars.map((bar, index) => (
        <rect height="50" key={`${bar.x}-${index}`} width={bar.width} x={bar.x} y="0" />
      ))}
    </svg>
  );
}

function RawMaterialRollPrintLabel({ inbound, roll }) {
  const color = roll.factoryColor || inbound.factoryColor || inbound.supplierColor || "颜色待补";
  const spec = formatRawMaterialMobileSpec(roll.spec || inbound.spec) || "规格待补";
  const weight = Number(roll.weightKg || 0);
  return (
    <article className="raw-material-roll-print-label">
      <p className="raw-material-label-supplier">{inbound.supplierName || "供应商待补"}</p>
      <p className="raw-material-label-weight">{weight ? `${weight}kg` : "重量待补"}</p>
      <p className="raw-material-label-match">{color} · {spec}</p>
      <RawMaterialCode39 value={roll.id} />
      <b className="raw-material-roll-code-text">{roll.id}</b>
    </article>
  );
}
