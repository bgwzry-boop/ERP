import { useEffect, useState } from "react";
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
  getNavigationGroupForPage,
  getVisiblePrimaryNavigationItems,
  getVisibleNavigationGroups,
  laterNavigationItems,
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

const MORE_WORKBENCHES_LABEL = "更多工作台";

export function AppNavigation({ activePage, collapsed = false, permissionContext, todoCount, onNavigate }) {
  const visiblePrimaryNavigationItems = getVisiblePrimaryNavigationItems(permissionContext);
  const navigationGroups = getVisibleNavigationGroups(permissionContext);
  const activeGroup = getNavigationGroupForPage(activePage, permissionContext);
  const [expandedGroupKeys, setExpandedGroupKeys] = useState(() => new Set(activeGroup ? [activeGroup.key] : []));
  const showLaterModules = visiblePrimaryNavigationItems.length > 0;

  useEffect(() => {
    if (!activeGroup?.key) return;
    setExpandedGroupKeys((current) => {
      if (current.has(activeGroup.key)) return current;
      const next = new Set(current);
      next.add(activeGroup.key);
      return next;
    });
  }, [activeGroup?.key]);

  const toggleGroup = (groupKey) => {
    setExpandedGroupKeys((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  return (
    <nav className="nav-list" aria-label="主导航">
      {collapsed ? (
        <CompactNavigationGroups
          activeGroup={activeGroup}
          groups={navigationGroups}
          onNavigate={onNavigate}
          todoCount={todoCount}
        />
      ) : navigationGroups.map((group) => {
        const expanded = expandedGroupKeys.has(group.key);
        return (
          <NavigationGroup
            active={group.key === activeGroup?.key}
            expanded={expanded}
            group={group}
            key={group.key}
            onNavigate={onNavigate}
            onToggle={() => {
              toggleGroup(group.key);
              if (group.key !== activeGroup?.key) onNavigate(group.items[0].key);
            }}
            activePage={activePage}
            todoCount={todoCount}
          />
        );
      })}
      {showLaterModules && <div className="nav-divider">后续模块</div>}
      {showLaterModules && laterNavigationItems.map((item) => {
        const Icon = navigationIcons[item.icon];
        return (
          <button aria-disabled="true" className="nav-item disabled" disabled key={item.label} title={`${item.label}（后续模块）`} type="button">
            <Icon aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function ContextNavigationStrip({ activePage, permissionContext, todoCount, onNavigate }) {
  const activeGroup = getNavigationGroupForPage(activePage, permissionContext);
  if (!activeGroup) return null;
  const GroupIcon = navigationIcons[activeGroup.icon];

  return (
    <nav className="context-nav-strip" aria-label="当前业务域二级导航">
      <span className="context-nav-domain">
        <GroupIcon aria-hidden="true" />
        <span>{activeGroup.label}</span>
      </span>
      <span className="context-nav-divider" aria-hidden="true" />
      <span className="context-nav-items">
        {activeGroup.items.map((item) => {
          const active = item.key === activePage;
          const badge = item.key === "todos" ? todoCount : null;
          return (
            <button
              aria-current={active ? "page" : undefined}
              className={`context-nav-item${active ? " active" : ""}`}
              key={item.key}
              onClick={() => onNavigate(item.key)}
              title={item.label}
              type="button"
            >
              <span>{item.label}</span>
              {badge != null ? <b>{badge}</b> : null}
            </button>
          );
        })}
      </span>
    </nav>
  );
}

function CompactNavigationGroups({ activeGroup, groups, onNavigate, todoCount }) {
  return (
    <>
      {groups.map((group) => {
        const destination = group.items[0];
        const item = {
          ...destination,
          icon: group.icon,
          label: group.kind === "tools" ? MORE_WORKBENCHES_LABEL : group.label,
        };
        return (
          <NavigationButton
            active={activeGroup?.key === group.key}
            item={item}
            key={group.key}
            badge={group.key === "workspace" ? todoCount : null}
            onClick={() => onNavigate(destination.key)}
          />
        );
      })}
    </>
  );
}

function NavigationGroup({ active, activePage, expanded, group, onNavigate, onToggle, todoCount }) {
  const Icon = navigationIcons[group.icon];
  const groupId = `navigation-group-${group.key}`;
  return (
    <section className={`nav-group${active ? " active" : ""}${group.kind === "tools" ? " tools" : ""}`}>
      <button
        aria-controls={groupId}
        aria-expanded={expanded}
        className="nav-group-trigger"
        onClick={onToggle}
        title={group.label}
        type="button"
      >
        <Icon aria-hidden="true" />
        <span>{group.label}</span>
        <RightOutlined aria-hidden="true" className="nav-group-caret" />
      </button>
      <div className={`nav-group-items${expanded ? "" : " collapsed"}`} id={groupId}>
        {group.items.map((item) => (
          <NavigationButton
            active={activePage === item.key}
            item={item}
            key={item.key}
            badge={item.key === "todos" ? todoCount : null}
            secondary
            onClick={() => onNavigate(item.key)}
          />
        ))}
      </div>
    </section>
  );
}

function NavigationButton({ active, item, badge = null, secondary = false, onClick }) {
  const Icon = navigationIcons[item.icon];
  const className = ["nav-item", secondary ? "secondary" : "", active ? "active" : ""].filter(Boolean).join(" ");
  const accessibleLabel = badge != null ? `${item.label} ${badge}` : item.label;
  return (
    <button aria-current={active ? "page" : undefined} aria-label={accessibleLabel} className={className} onClick={onClick} title={item.label} type="button">
      <Icon aria-hidden="true" />
      <span>{item.label}</span>
      {badge != null && <b className="nav-badge">{badge}</b>}
    </button>
  );
}
