import { buildRawMaterialCode39Bars } from "../../domain/rawMaterialLabelBarcode.js";
import { buildRawMaterialQrMatrix } from "../../domain/rawMaterialLabelQr.js";
import { buildRawMaterialRollLabelModel } from "../../domain/rawMaterialRollLabel.js";
import { RAW_MATERIAL_ROLL_LABEL_FIT_CELLS, fitRollLabelCellText } from "../../domain/rawMaterialRollLabelTemplate.js";
import { createPortal } from "react-dom";
import "../../styles/features/raw-material-roll-label.css";

export function RawMaterialLabelPrintSheet({ inbound, preview = false }) {
  if (!inbound) return null;
  const printableRolls = (inbound.rolls ?? []).filter((roll) => roll.inventoryStatus !== "可用");
  if (!printableRolls.length) return null;
  const sheet = (
    <section
      aria-hidden={preview ? undefined : "true"}
      className={`raw-material-label-print-sheet${preview ? " is-screen-preview" : ""}`}
    >
      {printableRolls.map((roll) => (
        // One 76×130mm page per roll; the artwork sits in the middle of it.
        <div className="raw-material-roll-print-page" key={roll.id}>
          <RawMaterialRollPrintLabel inbound={inbound} roll={roll} />
        </div>
      ))}
    </section>
  );
  // Printing renders the sheet as a direct child of <body> so the rest of the
  // app can be removed from the print layout (display: none). Otherwise the
  // wide desktop layout makes the browser shrink the label to ~70%.
  if (preview || typeof document === "undefined" || !document.body) return sheet;
  return createPortal(sheet, document.body);
}

export function RawMaterialCode39({ quietZone = 0, value }) {
  const barcode = buildRawMaterialCode39Bars(value);
  if (!barcode.normalizedValue) return null;
  const quiet = Math.max(0, Number(quietZone) || 0);
  const width = barcode.width + quiet * 2;
  return (
    <svg
      aria-label={`卷码 ${barcode.normalizedValue}`}
      className="raw-material-code39"
      preserveAspectRatio="none"
      role="img"
      shapeRendering="crispEdges"
      viewBox={`0 0 ${width} 50`}
    >
      {barcode.bars.map((bar, index) => (
        <rect height="50" key={`${bar.x}-${index}`} width={bar.width} x={bar.x + quiet} y="0" />
      ))}
    </svg>
  );
}

export function RawMaterialQrCode({ quietZone = 4, value }) {
  const qr = buildRawMaterialQrMatrix(value);
  if (!qr) return null;
  const quiet = Math.max(0, Number(quietZone) || 0);
  const size = qr.size + quiet * 2;
  const rects = [];
  qr.modules.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x += 1;
        continue;
      }
      let width = 1;
      while (x + width < row.length && row[x + width]) width += 1;
      rects.push({ x: x + quiet, y: y + quiet, width });
      x += width;
    }
  });
  return (
    <svg
      aria-label={`卷码二维码 ${value}`}
      className="raw-material-qr"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      shapeRendering="crispEdges"
      viewBox={`0 0 ${size} ${size}`}
    >
      {rects.map((rect) => (
        <rect height="1" key={`${rect.y}-${rect.x}`} width={rect.width} x={rect.x} y={rect.y} />
      ))}
    </svg>
  );
}

function RawMaterialRollPrintLabel({ inbound, roll }) {
  const label = buildRawMaterialRollLabelModel(inbound, roll);
  const supplierFit = fitRollLabelCellText(label.supplierName, RAW_MATERIAL_ROLL_LABEL_FIT_CELLS.supplier);
  const inboundFit = fitRollLabelCellText(label.inboundNo, RAW_MATERIAL_ROLL_LABEL_FIT_CELLS.inboundNo);
  return (
    <article className="raw-material-roll-print-label">
      <header className="raw-material-roll-label-header">
        <div className="raw-material-roll-label-brand">
          <BagwinLabelMark />
          <strong>袋袋赢</strong>
        </div>
        <h1>卷料标签</h1>
      </header>
      <table className="raw-material-roll-label-grid">
        <colgroup>
          <col className="raw-material-roll-label-col-a" />
          <col className="raw-material-roll-label-col-b" />
          <col className="raw-material-roll-label-col-c" />
          <col className="raw-material-roll-label-col-d" />
          <col className="raw-material-roll-label-col-e" />
        </colgroup>
        <tbody>
          <tr className="is-product">
            <th>品名称</th>
            <td colSpan="4">{label.productName}</td>
          </tr>
          <tr className="is-standard">
            <th>执行标准</th>
            <td colSpan="3">{label.executionStandard}</td>
            <td className="is-qr" rowSpan="5">
              <RawMaterialQrCode quietZone={2} value={label.rollCode} />
            </td>
          </tr>
          <tr className="is-spec">
            <th rowSpan="4">产品规格</th>
            <th>幅宽cm</th>
            <td className="is-measure" colSpan="2">{label.widthText}</td>
          </tr>
          <tr className="is-spec">
            <th>卷长m</th>
            <td className="is-measure" colSpan="2">{label.lengthText}</td>
          </tr>
          <tr className="is-spec">
            <th>克重g/㎡</th>
            <td className="is-measure" colSpan="2">{label.gramWeightText}</td>
          </tr>
          <tr className="is-spec">
            <th>重量kg</th>
            <td className="is-measure" colSpan="2">{label.weightText}</td>
          </tr>
          <tr className="is-pair">
            <th>颜色</th>
            <td colSpan="2">{label.color}</td>
            <th>供应商</th>
            <td className={supplierFit.wrap ? "is-fit-wrap" : undefined} style={{ fontSize: `${supplierFit.fontPt}pt` }}>{label.supplierName}</td>
          </tr>
          <tr className="is-pair">
            <th>入库单</th>
            <td className={`is-inbound-no${inboundFit.wrap ? " is-fit-wrap" : ""}`} colSpan="2" style={{ fontSize: `${inboundFit.fontPt}pt` }}>{label.inboundNo}</td>
            <th>日期</th>
            <td className="is-date">{label.date}</td>
          </tr>
          <tr className="is-banner">
            <td colSpan="5">出库时扫描本卷码</td>
          </tr>
          <tr className="is-company">
            <th>公司名称</th>
            <td colSpan="4">{label.companyName}</td>
          </tr>
          <tr className="is-company">
            <th>联系方式</th>
            <td colSpan="4">{label.companyPhone}</td>
          </tr>
          <tr className="is-company">
            <th>公司地址</th>
            <td colSpan="4">{label.companyAddress}</td>
          </tr>
          <tr className="is-barcode">
            <td colSpan="5">
              <RawMaterialCode39 quietZone={12} value={label.rollCode} />
              <b className="raw-material-roll-code-text">{label.rollCode || "卷码待补"}</b>
            </td>
          </tr>
        </tbody>
      </table>
    </article>
  );
}

function BagwinLabelMark() {
  return (
    <svg aria-hidden="true" className="raw-material-roll-label-mark" viewBox="14 8 192 184">
      <rect fill="none" height="176" rx="22" stroke="#111" strokeWidth="7" width="184" x="18" y="12" />
      <g fill="#111">
        <g transform="translate(5 3)">
          <path d="M29.0,83 L29.0,58 C29.0,17 95.0,17 95.0,58 L95.0,83 L78.0,83 L78.0,58 C78.0,39 46.0,39 46.0,58 L46.0,83 Z" />
          <path d="M125.0,83 L125.0,58 C125.0,17 191.0,17 191.0,58 L191.0,83 L174.0,83 L174.0,58 C174.0,39 142.0,39 142.0,58 L142.0,83 Z" />
        </g>
        <path d="M52.0 184.0H96.2L109.2 137.02C111.4 128.755 113.2 120.055 115.2 111.935H116.0C117.4 120.055 119.4 128.755 121.8 137.02L135.2 184.0H180.2L206.0 75.975H172.2L162.4 125.275C160.6 136.44 158.6 147.895 156.8 159.495H155.8C152.8 147.895 150.2 136.295 147.2 125.275L131.8 75.975H101.6L86.4 125.275C83.4 136.44 80.4 147.895 77.6 159.495H76.8C74.8 147.895 72.8 136.585 70.8 125.275L61.4 75.975H25.0Z" />
      </g>
    </svg>
  );
}
