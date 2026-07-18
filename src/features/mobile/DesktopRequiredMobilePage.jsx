import {
  BankOutlined,
  DesktopOutlined,
  SafetyCertificateOutlined,
  ToolOutlined,
} from "@ant-design/icons";

const ROLE_COPY = Object.freeze({
  management: {
    label: "老板 / 管理岗位",
    title: "请使用老板电脑",
    description: "客户对账、财务确认、正式核销和重大异常需要在办公室受控电脑上处理。",
    icon: SafetyCertificateOutlined,
    facts: ["完整经营与财务工作台", "高风险确认与审计记录", "不把整套桌面功能复制到手机"],
  },
  finance: {
    label: "财务岗位",
    title: "请使用财务工作台",
    description: "对账、到账证据、差额和正式核销保留在电脑端，避免在狭窄屏幕上误操作。",
    icon: BankOutlined,
    facts: ["客户对账与到账证据", "差额、抹零和核销确认", "完整金额与审计信息"],
  },
  technical_operations: {
    label: "系统运维岗位",
    title: "请使用部署电脑",
    description: "上线门禁、驱动诊断和环境配置属于系统运维，不等同于现场机修手机任务。",
    icon: ToolOutlined,
    facts: ["上线状态与发布门禁", "打印驱动和设备诊断", "生产环境配置与审计"],
  },
});

export function DesktopRequiredMobilePage({ currentUser = {} }) {
  const presentation = ROLE_COPY[currentUser.defaultRole] ?? {
    label: "当前岗位",
    title: "请使用已配置终端",
    description: "该岗位暂未配置手机操作流程。",
    icon: DesktopOutlined,
    facts: ["按岗位终端进入", "保留个人账号审计", "不共用设备或账号"],
  };
  const Icon = presentation.icon;

  return (
    <section className="desktop-required-mobile-page" aria-label="电脑端使用说明">
      <div className="desktop-required-mobile-icon"><Icon aria-hidden="true" /></div>
      <span>{presentation.label}</span>
      <h1>{presentation.title}</h1>
      <p>{presentation.description}</p>
      <section aria-label="电脑端处理范围">
        {presentation.facts.map((fact) => <div key={fact}><SafetyCertificateOutlined aria-hidden="true" /><span>{fact}</span></div>)}
      </section>
      <aside><DesktopOutlined aria-hidden="true" /><span>手机端不会显示压缩后的办公室菜单，也不会在本机保存待提交的高风险业务数据。</span></aside>
    </section>
  );
}
