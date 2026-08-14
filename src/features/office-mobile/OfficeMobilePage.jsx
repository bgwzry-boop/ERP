import {
  CameraOutlined,
  CheckCircleOutlined,
  PrinterOutlined,
  TagOutlined,
} from "@ant-design/icons";

const FIELD_STEPS = [
  ["拍单", CameraOutlined],
  ["核对", CheckCircleOutlined],
  ["打印", PrinterOutlined],
  ["贴标", TagOutlined],
];

export function OfficeMobilePage({ onNavigate }) {
  return (
    <section className="office-mobile-page office-mobile-field-utility" aria-label="办公室手机现场工具">
      <header className="office-mobile-field-header">
        <h1>办公室手机</h1>
        <p>手机只做必须到现场、必须拍照或连接打印机的工作。</p>
      </header>

      <section className="office-mobile-field-card">
        <div className="office-mobile-field-title">
          <span><CameraOutlined aria-hidden="true" /></span>
          <div>
            <h2>录原材料</h2>
            <p>拍送货单、核对全部卷材、打印卷标，再到实物旁逐卷确认。</p>
          </div>
        </div>
        <ol aria-label="原材料录入四步">
          {FIELD_STEPS.map(([label, Icon], index) => (
            <li key={label}>
              <span>{index + 1}</span>
              <Icon aria-hidden="true" />
              <strong>{label}</strong>
            </li>
          ))}
        </ol>
        <button onClick={() => onNavigate?.("rawMaterials")} type="button">进入原材料录入</button>
      </section>

      <p className="office-mobile-desktop-note">订单、待办、对账和异常处理继续在办公室电脑完成。</p>
    </section>
  );
}
