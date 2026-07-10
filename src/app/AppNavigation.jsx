import {
  AccountBookOutlined,
  AppstoreOutlined,
  CheckCircleOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  InboxOutlined,
  PlusOutlined,
  RightOutlined,
  SettingOutlined,
  ShoppingCartOutlined,
  UnorderedListOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import {
  getVisibleSecondaryNavigationItems,
  laterNavigationItems,
  primaryNavigationItems,
} from "./navigation.js";

const navigationIcons = {
  accountBook: AccountBookOutlined,
  appstore: AppstoreOutlined,
  checkCircle: CheckCircleOutlined,
  dashboard: DashboardOutlined,
  database: DatabaseOutlined,
  inbox: InboxOutlined,
  plus: PlusOutlined,
  setting: SettingOutlined,
  shoppingCart: ShoppingCartOutlined,
  unorderedList: UnorderedListOutlined,
  upload: UploadOutlined,
};

export function AppNavigation({ activePage, permissionContext, todoCount, onNavigate, onOpenLater }) {
  const roleNavigationItems = getVisibleSecondaryNavigationItems(permissionContext);
  return (
    <nav className="nav-list" aria-label="主导航">
      {primaryNavigationItems.map((item) => (
        <NavigationButton
          active={activePage === item.key}
          item={item}
          key={item.key}
          badge={item.key === "todos" ? todoCount : null}
          onClick={() => onNavigate(item.key)}
        />
      ))}
      {roleNavigationItems.length > 0 && <div className="nav-divider role-tools">角色工具</div>}
      {roleNavigationItems.map((item) => (
        <NavigationButton
          active={activePage === item.key}
          item={item}
          key={item.key}
          secondary
          onClick={() => onNavigate(item.key)}
        />
      ))}
      <div className="nav-divider">后续模块</div>
      {laterNavigationItems.map((item) => {
        const Icon = navigationIcons[item.icon];
        return (
          <button className="nav-item disabled" key={item.label} onClick={() => onOpenLater(item.label)}>
            <Icon />
            <span>{item.label}</span>
            <RightOutlined className="nav-caret" />
          </button>
        );
      })}
    </nav>
  );
}

function NavigationButton({ active, item, badge = null, secondary = false, onClick }) {
  const Icon = navigationIcons[item.icon];
  const className = ["nav-item", secondary ? "secondary" : "", active ? "active" : ""].filter(Boolean).join(" ");
  return (
    <button className={className} onClick={onClick}>
      <Icon />
      <span>{item.label}</span>
      {badge != null && <b className="nav-badge">{badge}</b>}
    </button>
  );
}
