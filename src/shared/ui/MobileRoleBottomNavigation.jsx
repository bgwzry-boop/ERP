export function MobileRoleBottomNavigation({
  ariaLabel,
  badgeCount = () => 0,
  items = [],
  onChange,
  value,
}) {
  return (
    <nav className="mobile-role-bottom-nav" aria-label={ariaLabel}>
      {items.map(([key, label, Icon]) => {
        const count = Number(badgeCount(key) || 0);
        return (
          <button
            aria-current={value === key ? "page" : undefined}
            className={value === key ? "active" : ""}
            key={key}
            onClick={() => onChange?.(key)}
            type="button"
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
            {count > 0 ? <b>{count}</b> : null}
          </button>
        );
      })}
    </nav>
  );
}
