import { buildRawMaterialCode39Bars } from "../../domain/rawMaterialLabelBarcode.js";

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
  const spec = roll.spec || inbound.spec || "规格待补";
  const weight = Number(roll.weightKg || 0);
  const width = Number(roll.widthCm || inbound.widthCm || 0);
  const gramWeight = Number(roll.gramWeightGsm || inbound.gramWeightGsm || 0);
  return (
    <article className="raw-material-roll-print-label">
      <header>
        <strong>{roll.id}</strong>
        <span>原材料卷标 · V{Math.max(1, Number(roll.labelVersion || 0) + 1)}</span>
      </header>
      <RawMaterialCode39 value={roll.id} />
      <b className="raw-material-roll-code-text">{roll.id}</b>
      <dl>
        <div><dt>原料</dt><dd>{roll.productName || inbound.productName || inbound.materialType || "待补"}</dd></div>
        <div><dt>颜色</dt><dd>{color}</dd></div>
        <div><dt>规格</dt><dd>{spec}</dd></div>
        <div><dt>宽幅</dt><dd>{width ? `${width}cm` : "待补"}</dd></div>
        <div><dt>克重</dt><dd>{gramWeight ? `${gramWeight}g` : "待补"}</dd></div>
        <div><dt>重量</dt><dd>{weight ? `${weight}kg` : inbound.unit || "待补"}</dd></div>
      </dl>
      <footer>
        <span>{inbound.supplierName || "供应商待补"}</span>
        <span>{inbound.deliveryNoteNo || inbound.id}</span>
        <strong>出库时扫描本卷码</strong>
      </footer>
    </article>
  );
}
