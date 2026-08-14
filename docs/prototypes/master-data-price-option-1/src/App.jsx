/**
 * THESIS: The factory-wide price source reads as one continuous ledger, not a dashboard of equal boxes.
 * OWN-WORLD: Quiet moss paper, an anchored forest rail, restrained mint selection, and white working sheets.
 * STORY: Office A/B scan one category, choose one specification, edit one record, and submit it for review.
 * FIRST VIEWPORT: Global shell at left/top, category index, price ledger, and a fixed single-record editor.
 * FORM: Operate-mode Workbench; the selected ImageGen option is the visual authority.
 */
import {
  ArrowClockwise,
  Bell,
  CaretDown,
  CaretRight,
  CaretUp,
  ChartBar,
  Check,
  CheckCircle,
  ClockCounterClockwise,
  Coins,
  Cube,
  Database,
  DownloadSimple,
  Factory,
  Gear,
  House,
  List,
  MagnifyingGlass,
  Package,
  Plus,
  SpinnerGap,
  UploadSimple,
  Users,
  WarningCircle,
} from "@phosphor-icons/react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

const categories = [
  { id: "nonwoven", name: "无纺布袋" },
  { id: "laminated", name: "覆膜无纺布袋" },
  { id: "dog", name: "小狗袋" },
  { id: "fu", name: "福字袋" },
  { id: "xi", name: "喜字袋" },
];

const initialRecords = [
  {
    id: "nw-303710",
    categoryId: "nonwoven",
    size: "30×37×10",
    price: "0.34",
    rule: "加长提 ¥0.37",
    description: "30×38、30×38×10、30×37 为历史识别别名",
    version: "V2026.07.16",
    effectiveAt: "2026-07-16 07:30",
    status: "active",
  },
  {
    id: "nw-253210",
    categoryId: "nonwoven",
    size: "25×32×10",
    price: "0.29",
    rule: "加长提 ¥0.32",
    description: "常规竖款小号",
    version: "V2026.07.16",
    effectiveAt: "2026-07-16 07:30",
    status: "active",
  },
  {
    id: "nw-403010",
    categoryId: "nonwoven",
    size: "40×30×10",
    price: "0.36",
    rule: "加长提 ¥0.39",
    description: "常规横款中号",
    version: "V2026.07.16",
    effectiveAt: "2026-07-16 07:30",
    status: "active",
  },
  {
    id: "nw-354112",
    categoryId: "nonwoven",
    size: "35×41×12",
    price: "0.48",
    rule: "加长提 ¥0.51",
    description: "常规竖款大号",
    version: "V2026.07.16",
    effectiveAt: "2026-07-16 07:30",
    status: "active",
  },
  {
    id: "nw-504012",
    categoryId: "nonwoven",
    size: "50×40×12",
    price: "0.60",
    rule: "加长提 ¥0.63",
    description: "常规横款特大号",
    version: "V2026.07.16",
    effectiveAt: "2026-07-16 07:30",
    status: "active",
  },
  {
    id: "lm-302710",
    categoryId: "laminated",
    size: "30×27×10",
    price: "0.60",
    rule: "金银膜 ¥0.63",
    description: "覆膜竖款中号",
    version: "V2026.07.16",
    effectiveAt: "2026-07-16 07:30",
    status: "active",
  },
  {
    id: "lm-322510",
    categoryId: "laminated",
    size: "32×25×10",
    price: "0.45",
    rule: "金银膜 ¥0.49",
    description: "覆膜横款小号",
    version: "V2026.07.16",
    effectiveAt: "2026-07-16 07:30",
    status: "active",
  },
  {
    id: "lm-403010",
    categoryId: "laminated",
    size: "40×30×10",
    price: "0.58",
    rule: "金银膜 ¥0.62",
    description: "覆膜横款中号",
    version: "V2026.07.16",
    effectiveAt: "2026-07-16 07:30",
    status: "active",
  },
  {
    id: "lm-453510",
    categoryId: "laminated",
    size: "45×35×10",
    price: "0.72",
    rule: "金银膜 ¥0.76",
    description: "覆膜横款大号",
    version: "V2026.07.16",
    effectiveAt: "2026-07-16 07:30",
    status: "active",
  },
  {
    id: "lm-504012",
    categoryId: "laminated",
    size: "50×40×12",
    price: "1.00",
    rule: "金银膜 ¥1.03",
    description: "覆膜横款特大号",
    version: "V2026.07.16",
    effectiveAt: "2026-07-16 07:30",
    status: "active",
  },
  {
    id: "dog-25238",
    categoryId: "dog",
    size: "25×23×8",
    price: "0.45",
    rule: "按扣规则另计",
    description: "小狗袋小号",
    version: "V2026.07.16",
    effectiveAt: "2026-07-16 07:30",
    status: "active",
  },
  {
    id: "dog-302710",
    categoryId: "dog",
    size: "30×27×10",
    price: "0.51",
    rule: "按扣规则另计",
    description: "小狗袋常用尺寸",
    version: "V2026.07.16",
    effectiveAt: "2026-07-16 07:30",
    status: "active",
  },
  {
    id: "dog-353212",
    categoryId: "dog",
    size: "35×32×12",
    price: "0.57",
    rule: "按扣规则另计",
    description: "小狗袋中号",
    version: "V2026.07.16",
    effectiveAt: "2026-07-16 07:30",
    status: "active",
  },
  {
    id: "dog-403512",
    categoryId: "dog",
    size: "40×35×12",
    price: "0.69",
    rule: "按扣规则另计",
    description: "小狗袋大号",
    version: "V2026.07.16",
    effectiveAt: "2026-07-16 07:30",
    status: "active",
  },
  {
    id: "dog-504012",
    categoryId: "dog",
    size: "50×40×12",
    price: "0.80",
    rule: "按扣规则另计",
    description: "小狗袋特大号",
    version: "V2026.07.16",
    effectiveAt: "2026-07-16 07:30",
    status: "active",
  },
  {
    id: "fu-253010",
    categoryId: "fu",
    size: "25×30×10",
    price: "0.51",
    rule: "附加价 —",
    description: "福字袋小号",
    version: "V2026.07.16",
    effectiveAt: "2026-07-16 07:30",
    status: "active",
  },
  {
    id: "fu-303710",
    categoryId: "fu",
    size: "30×37×10",
    price: "0.56",
    rule: "附加价 —",
    description: "福字袋常用尺寸",
    version: "V2026.07.16",
    effectiveAt: "2026-07-16 07:30",
    status: "active",
  },
  {
    id: "fu-354112",
    categoryId: "fu",
    size: "35×41×12",
    price: "0.76",
    rule: "附加价 —",
    description: "福字袋大号",
    version: "V2026.07.16",
    effectiveAt: "2026-07-16 07:30",
    status: "active",
  },
  {
    id: "xi-253010",
    categoryId: "xi",
    size: "25×30×10",
    price: "0.51",
    rule: "附加价 —",
    description: "喜字袋小号",
    version: "V2026.07.16",
    effectiveAt: "2026-07-16 07:30",
    status: "active",
  },
  {
    id: "xi-303710",
    categoryId: "xi",
    size: "30×37×10",
    price: "0.56",
    rule: "附加价 —",
    description: "喜字袋常用尺寸",
    version: "V2026.07.16",
    effectiveAt: "2026-07-16 07:30",
    status: "active",
  },
  {
    id: "xi-354112",
    categoryId: "xi",
    size: "35×41×12",
    price: "0.76",
    rule: "附加价 —",
    description: "喜字袋大号",
    version: "V2026.07.16",
    effectiveAt: "2026-07-16 07:30",
    status: "active",
  },
];

const navigation = [
  { label: "首页", icon: House },
  { label: "客户", icon: Users },
  { label: "订单", icon: List },
  { label: "生产", icon: Factory },
  { label: "基础资料", icon: Database, active: true },
  { label: "库存", icon: Cube },
  { label: "财务", icon: Coins },
  { label: "报表", icon: ChartBar },
  { label: "设置", icon: Gear },
];

function recordToDraft(record) {
  const source = record.pendingDraft ?? record;
  return {
    categoryId: source.categoryId,
    size: source.size,
    price: source.price,
    rule: source.rule,
    description: source.description,
    reason: source.reason ?? "",
    effectMode: source.effectMode ?? "afterReview",
    scheduledAt: source.scheduledAt ?? "2026-07-28T08:00",
  };
}

function comparableDraft(draft) {
  return {
    categoryId: draft.categoryId,
    size: draft.size.trim(),
    price: draft.price.trim(),
    rule: draft.rule.trim(),
    description: draft.description.trim(),
    reason: draft.reason.trim(),
    effectMode: draft.effectMode,
    scheduledAt: draft.effectMode === "scheduled" ? draft.scheduledAt : "",
  };
}

function canonicalSize(value) {
  return value
    .trim()
    .toLocaleLowerCase("zh-CN")
    .replace(/[x×*＊]/g, "×")
    .replace(/\s+/g, "");
}

function Highlight({ value, query }) {
  if (!query) return value;
  const source = String(value);
  const index = source.toLocaleLowerCase("zh-CN").indexOf(query.toLocaleLowerCase("zh-CN"));
  if (index < 0) return source;

  return (
    <>
      {source.slice(0, index)}
      <mark>{source.slice(index, index + query.length)}</mark>
      {source.slice(index + query.length)}
    </>
  );
}

function StatusNote({ status }) {
  if (status === "review") {
    return (
      <span className="status-note status-note--review">
        <ClockCounterClockwise aria-hidden="true" />
        待复核
      </span>
    );
  }
  if (status === "scheduled") {
    return (
      <span className="status-note status-note--scheduled">
        <ClockCounterClockwise aria-hidden="true" />
        待生效
      </span>
    );
  }
  if (status === "expired") {
    return (
      <span className="status-note status-note--expired">
        <WarningCircle aria-hidden="true" />
        已失效
      </span>
    );
  }
  return null;
}

export function App() {
  const [records, setRecords] = useState(initialRecords);
  const [selectedId, setSelectedId] = useState(initialRecords[0].id);
  const [draft, setDraft] = useState(recordToDraft(initialRecords[0]));
  const [draftBaseVersion, setDraftBaseVersion] = useState(initialRecords[0].version);
  const [activeCategory, setActiveCategory] = useState(categories[0].id);
  const [globalSearchInput, setGlobalSearchInput] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [toolMenuOpen, setToolMenuOpen] = useState(false);
  const [pendingSelection, setPendingSelection] = useState(null);
  const [submitState, setSubmitState] = useState("idle");
  const [submittedMessage, setSubmittedMessage] = useState("");
  const [conflictMessage, setConflictMessage] = useState("");
  const [formAttempted, setFormAttempted] = useState(false);
  const [shellNotice, setShellNotice] = useState("");
  const groupRefs = useRef({});
  const ledgerRef = useRef(null);
  const searchRef = useRef(null);
  const ignoreObserverUntilRef = useRef(0);

  const selectedRecord = useMemo(
    () => records.find((record) => record.id === selectedId) ?? records[0],
    [records, selectedId],
  );

  const baselineDraft = useMemo(() => recordToDraft(selectedRecord), [selectedRecord]);
  const reviewLocked = selectedRecord.status === "review";
  const isDirty =
    JSON.stringify(comparableDraft(draft)) !== JSON.stringify(comparableDraft(baselineDraft));
  const priceIsValid = Number.isFinite(Number(draft.price)) && Number(draft.price) > 0;
  const duplicateRecord = useMemo(() => {
    const sizeKey = canonicalSize(draft.size);
    if (!sizeKey) return null;
    return records.find(
      (record) =>
        record.id !== selectedRecord.id &&
        record.categoryId === draft.categoryId &&
        canonicalSize(record.size) === sizeKey,
    );
  }, [draft.categoryId, draft.size, records, selectedRecord.id]);
  const duplicateConflict = Boolean(duplicateRecord);
  const formIsValid =
    draft.categoryId &&
    draft.size.trim().length > 0 &&
    !duplicateConflict &&
    priceIsValid &&
    draft.rule.trim().length > 0 &&
    draft.reason.trim().length > 0 &&
    (draft.effectMode !== "scheduled" || draft.scheduledAt);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(searchInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;

      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        searchRef.current?.focus();
      }

      if (event.key === "Escape") {
        setToolMenuOpen(false);
        setPendingSelection(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const filteredByCategory = useMemo(() => {
    const needle = searchQuery.toLocaleLowerCase("zh-CN");
    return categories.map((category) => {
      const categoryRecords = records.filter((record) => record.categoryId === category.id);
      if (!needle) return { ...category, records: categoryRecords };

      const categoryMatches = category.name.toLocaleLowerCase("zh-CN").includes(needle);
      return {
        ...category,
        records: categoryMatches
          ? categoryRecords
          : categoryRecords.filter((record) =>
              [record.size, record.price, record.rule]
                .join(" ")
                .toLocaleLowerCase("zh-CN")
                .includes(needle),
            ),
      };
    });
  }, [records, searchQuery]);

  const visibleCount = filteredByCategory.reduce(
    (total, category) => total + category.records.length,
    0,
  );

  useEffect(() => {
    const root = ledgerRef.current;
    if (!root || searchQuery) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (Date.now() < ignoreObserverUntilRef.current) return;
        const rootTop = entries[0]?.rootBounds?.top ?? 0;
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) =>
              Math.abs(a.boundingClientRect.top - rootTop) -
              Math.abs(b.boundingClientRect.top - rootTop),
          )[0];
        if (visible?.target.dataset.category) {
          setActiveCategory(visible.target.dataset.category);
        }
      },
      { root, threshold: [0.2, 0.5, 0.8], rootMargin: "-8px 0px -58% 0px" },
    );

    Object.values(groupRefs.current).forEach((element) => {
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [searchQuery, filteredByCategory]);

  function selectRecord(record) {
    if (record.id === selectedId) return;
    if (isDirty) {
      setPendingSelection(record.id);
      return;
    }
    setSelectedId(record.id);
    setDraft(recordToDraft(record));
    setDraftBaseVersion(record.version);
    setHistoryOpen(false);
    setSubmittedMessage("");
    setConflictMessage("");
    setFormAttempted(false);
  }

  function confirmPendingSelection() {
    const record = records.find((item) => item.id === pendingSelection);
    if (!record) return;
    setSelectedId(record.id);
    setDraft(recordToDraft(record));
    setDraftBaseVersion(record.version);
    setPendingSelection(null);
    setHistoryOpen(false);
    setSubmittedMessage("");
    setConflictMessage("");
    setFormAttempted(false);
  }

  function jumpToCategory(categoryId) {
    ignoreObserverUntilRef.current = Date.now() + 800;
    setActiveCategory(categoryId);
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    groupRefs.current[categoryId]?.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    });
  }

  function updateDraft(field, value) {
    if (reviewLocked) return;
    setDraft((current) => ({ ...current, [field]: value }));
    setSubmittedMessage("");
    setConflictMessage("");
    if (formAttempted) setFormAttempted(false);
  }

  function cancelChanges() {
    setDraft(baselineDraft);
    setFormAttempted(false);
    setSubmittedMessage("");
    setConflictMessage("");
  }

  function withdrawPendingDraft() {
    const returnedDraft = recordToDraft(selectedRecord);
    setRecords((current) =>
      current.map((record) =>
        record.id === selectedRecord.id
          ? {
              ...record,
              pendingDraft: undefined,
              status: "active",
            }
          : record,
      ),
    );
    setDraft(returnedDraft);
    setDraftBaseVersion(selectedRecord.version);
    setSubmitState("idle");
    setFormAttempted(false);
    setConflictMessage("");
    setSubmittedMessage("已撤回待复核修改，可继续编辑后重新提交。");
  }

  async function submitDraft(event) {
    event.preventDefault();
    setFormAttempted(true);
    if (reviewLocked || !formIsValid || !isDirty || submitState === "loading") return;

    setSubmitState("loading");
    await new Promise((resolve) => window.setTimeout(resolve, 760));
    const latestRecord = records.find((record) => record.id === selectedRecord.id);
    if (
      !latestRecord ||
      latestRecord.version !== draftBaseVersion ||
      latestRecord.status === "review"
    ) {
      setSubmitState("idle");
      setConflictMessage("这条价格已被其他修改占用，请重新选择记录后再编辑。");
      return;
    }
    const pendingDraft = comparableDraft(draft);

    setRecords((current) =>
      current.map((record) =>
        record.id === selectedRecord.id
          ? {
              ...record,
              pendingDraft,
              status: "review",
            }
          : record,
      ),
    );
    setSubmitState("success");
    setSubmittedMessage("已提交复核，当前在用价格保持不变。");
    setFormAttempted(false);
    window.setTimeout(() => setSubmitState("idle"), 1200);
  }

  function showShellNotice(message) {
    setShellNotice(message);
    window.setTimeout(() => {
      setShellNotice((current) => (current === message ? "" : current));
    }, 2600);
  }

  return (
    <div className="app-shell">
      <aside className="side-rail" aria-label="主要导航">
        <button
          type="button"
          className="brand-mark"
          aria-label="ERP 首页"
          onClick={() => showShellNotice("当前预览聚焦基础资料。")}
        >
          ERP
        </button>

        <nav className="primary-nav">
          {navigation.map(({ label, icon: Icon, active }) => (
            <button
              key={label}
              type="button"
              className={`nav-item${active ? " is-active" : ""}`}
              aria-current={active ? "page" : undefined}
              onClick={() => {
                if (!active) showShellNotice(`“${label}”不在本次价格表预览范围内。`);
              }}
            >
              <Icon aria-hidden="true" weight={active ? "fill" : "regular"} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <header className="topbar">
        <div className="factory-switcher">
          <strong>虎门工厂</strong>
          <CaretDown aria-hidden="true" />
        </div>

        <label className="global-search">
          <MagnifyingGlass aria-hidden="true" />
          <input
            type="search"
            value={globalSearchInput}
            onChange={(event) => setGlobalSearchInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                showShellNotice("全局搜索不在本次价格表预览范围内。");
              }
            }}
            placeholder="搜索客户 / 订单 / 尺寸 / 颜色 / 单据"
            aria-label="全局搜索"
          />
          <kbd>/</kbd>
        </label>

        <div className="topbar-actions">
          <button
            type="button"
            className="button button--primary topbar-create"
            onClick={() => showShellNotice("新建订单不在本次价格表预览范围内。")}
          >
            <Plus aria-hidden="true" weight="bold" />
            新建订单
          </button>
          <button type="button" className="icon-button notification-button" aria-label="查看通知">
            <Bell aria-hidden="true" />
            <span className="notification-count">8</span>
          </button>
          <button type="button" className="user-menu">
            <span className="user-copy">
              <strong>办公室A</strong>
              <small>办公室A · 录单 / 对账</small>
            </span>
            <span className="avatar" aria-hidden="true">
              A
            </span>
            <CaretDown aria-hidden="true" />
          </button>
        </div>
      </header>

      <main className="page">
        <div className="mobile-page-head">
          <div>
            <span>虎门工厂</span>
            <strong>基础资料</strong>
          </div>
          <button type="button" className="icon-button" aria-label="打开菜单">
            <List aria-hidden="true" />
          </button>
        </div>

        <header className="page-heading">
          <div>
            <p>更多工作台 / 基础资料</p>
            <h1>基础资料</h1>
          </div>
          {shellNotice ? (
            <div className="shell-notice" role="status">
              {shellNotice}
            </div>
          ) : null}
        </header>

        <section className="price-workbench" aria-label="通用价格维护工作台">
          <aside className="category-index" aria-label="品类索引">
            <div className="category-index__label">品类</div>
            <div className="category-list">
              {categories.map((category) => {
                const count = records.filter(
                  (record) => record.categoryId === category.id,
                ).length;
                const isActive = activeCategory === category.id;
                return (
                  <button
                    type="button"
                    key={category.id}
                    className={`category-button${isActive ? " is-active" : ""}`}
                    aria-pressed={isActive}
                    onClick={() => jumpToCategory(category.id)}
                  >
                    <span>{category.name}</span>
                    <span className="category-count">{count}</span>
                  </button>
                );
              })}
            </div>
            <div className="category-index__foot">
              <CheckCircle aria-hidden="true" />
              <span>全厂统一通用价</span>
            </div>
          </aside>

          <section className="ledger-panel">
            <header className="ledger-toolbar">
              <div className="ledger-toolbar__title">
                <div>
                  <h2>通用价格表</h2>
                  <p>点选一条规格，右侧直接修改</p>
                </div>
                <div className="tool-menu">
                  <button
                    type="button"
                    className="button button--quiet"
                    aria-expanded={toolMenuOpen}
                    onClick={() => setToolMenuOpen((open) => !open)}
                  >
                    <UploadSimple aria-hidden="true" />
                    首次建库 / 批量导入
                    <CaretDown aria-hidden="true" />
                  </button>
                  {toolMenuOpen ? (
                    <div className="tool-menu__popover" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setToolMenuOpen(false);
                          showShellNotice("首次建库入口已保留为次要工具。");
                        }}
                      >
                        <UploadSimple aria-hidden="true" />
                        <span>
                          <strong>首次建库</strong>
                          <small>第一次启用系统时使用</small>
                        </span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setToolMenuOpen(false);
                          showShellNotice("批量导入只用于真正的批量变更。");
                        }}
                      >
                        <DownloadSimple aria-hidden="true" />
                        <span>
                          <strong>批量导入</strong>
                          <small>多条价格同时变更时使用</small>
                        </span>
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="ledger-search-row">
                <label className="price-search">
                  <MagnifyingGlass aria-hidden="true" />
                  <input
                    ref={searchRef}
                    type="search"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="搜索品类 / 规格 / 价格"
                    aria-label="搜索通用价格"
                  />
                  {searchInput ? (
                    <button
                      type="button"
                      className="search-clear"
                      onClick={() => setSearchInput("")}
                    >
                      清除
                    </button>
                  ) : (
                    <kbd>/</kbd>
                  )}
                </label>
                <span className="result-count" aria-live="polite">
                  {visibleCount} 条价格
                </span>
              </div>
            </header>

            <div className="ledger-scroll" ref={ledgerRef}>
              {visibleCount === 0 ? (
                <div className="empty-state">
                  <MagnifyingGlass aria-hidden="true" />
                  <h3>没有匹配的价格</h3>
                  <p>换一个品类、规格或价格关键词。</p>
                  <button type="button" className="button button--quiet" onClick={() => setSearchInput("")}>
                    清除搜索
                  </button>
                </div>
              ) : (
                <table className="price-table">
                  <thead>
                    <tr>
                      <th scope="col">规格（宽×高×侧）</th>
                      <th scope="col">通用价</th>
                      <th scope="col">附加价或规则</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredByCategory.map((category) => {
                      if (!category.records.length) return null;
                      return (
                        <Fragment key={category.id}>
                          <tr
                            className="category-row"
                            data-category={category.id}
                            ref={(element) => {
                              groupRefs.current[category.id] = element;
                            }}
                          >
                            <th colSpan="3" scope="rowgroup">
                              <Package aria-hidden="true" />
                              <Highlight value={category.name} query={searchQuery} />
                              <span>{category.records.length} 条</span>
                            </th>
                          </tr>
                          {category.records.map((record) => {
                            const selected = record.id === selectedId;
                            return (
                              <tr
                                key={record.id}
                                className={`price-row${selected ? " is-selected" : ""}`}
                                aria-selected={selected}
                                onClick={() => selectRecord(record)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    selectRecord(record);
                                  }
                                }}
                                tabIndex="0"
                              >
                                <td data-label="规格">
                                  <span className="row-select-indicator" aria-hidden="true">
                                    {selected ? <Check weight="bold" /> : null}
                                  </span>
                                  <strong>
                                    <Highlight value={record.size} query={searchQuery} />
                                  </strong>
                                </td>
                                <td data-label="通用价" className="price-value">
                                  ¥<Highlight value={record.price} query={searchQuery} />
                                </td>
                                <td data-label="附加价或规则">
                                  <span className="rule-cell">
                                    <Highlight value={record.rule} query={searchQuery} />
                                    <StatusNote status={record.status} />
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <aside
            className={`editor-panel${reviewLocked ? " is-review-locked" : ""}`}
            aria-label="编辑通用价格"
          >
            <form onSubmit={submitDraft} noValidate>
              <header className="editor-head">
                <div>
                  <p>单条维护</p>
                  <h2>编辑通用价格</h2>
                </div>
                <span className="review-hint">{reviewLocked ? "待复核" : "提交后复核"}</span>
              </header>

              {reviewLocked ? (
                <div className="review-banner" role="status">
                  <ClockCounterClockwise aria-hidden="true" />
                  <span className="review-banner__copy">
                    <strong>这条修改正在复核</strong>
                    <small>当前在用价格仍为 ¥{selectedRecord.price}</small>
                  </span>
                </div>
              ) : null}

              {conflictMessage ? (
                <div className="dirty-guard" role="alert">
                  <WarningCircle aria-hidden="true" />
                  <div>
                    <strong>记录已发生冲突</strong>
                    <p>{conflictMessage}</p>
                  </div>
                </div>
              ) : null}

              {pendingSelection ? (
                <div className="dirty-guard" role="alert">
                  <WarningCircle aria-hidden="true" />
                  <div>
                    <strong>还有未保存的修改</strong>
                    <p>切换价格前，先继续编辑或放弃本次修改。</p>
                    <div className="dirty-guard__actions">
                      <button
                        type="button"
                        className="button button--quiet button--small"
                        onClick={() => setPendingSelection(null)}
                      >
                        继续编辑
                      </button>
                      <button
                        type="button"
                        className="button button--text button--small"
                        onClick={confirmPendingSelection}
                      >
                        放弃并切换
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="editor-scroll">
                <div className="selected-record-summary">
                  <div>
                    <span>{categories.find((category) => category.id === selectedRecord.categoryId)?.name}</span>
                    <strong>{selectedRecord.size}</strong>
                  </div>
                  <div>
                    <span>当前通用价</span>
                    <strong>¥{selectedRecord.price}</strong>
                  </div>
                </div>

                <div className="form-grid">
                  <label className="field">
                    <span>品类</span>
                    <select
                      value={draft.categoryId}
                      onChange={(event) => updateDraft("categoryId", event.target.value)}
                      disabled={reviewLocked}
                    >
                      {categories.map((category) => (
                        <option value={category.id} key={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                    <small>五个平级价格品类</small>
                  </label>

                  <label className="field">
                    <span>规格（宽×高×侧）</span>
                    <input
                      type="text"
                      value={draft.size}
                      onChange={(event) => updateDraft("size", event.target.value)}
                      disabled={reviewLocked}
                      aria-invalid={
                        duplicateConflict || (formAttempted && !draft.size.trim())
                          ? "true"
                          : undefined
                      }
                      aria-describedby="size-helper"
                    />
                    <small id="size-helper">
                      {duplicateConflict
                        ? `该品类已有 ${duplicateRecord.size}，不能建立重复价格。`
                        : formAttempted && !draft.size.trim()
                          ? "规格不能为空，请填写标准尺寸。"
                          : "使用标准尺寸，例如 30×37×10"}
                    </small>
                  </label>

                  <label className="field">
                    <span>通用单价（元/个）</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0.01"
                      value={draft.price}
                      onChange={(event) => updateDraft("price", event.target.value)}
                      disabled={reviewLocked}
                      aria-invalid={formAttempted && !priceIsValid ? "true" : undefined}
                      aria-describedby="price-helper"
                    />
                    <small id="price-helper">
                      {formAttempted && !priceIsValid
                        ? "价格必须大于 0，请重新填写。"
                        : "全厂共用，不按客户区分"}
                    </small>
                  </label>

                  <label className="field">
                    <span>附加价或规则</span>
                    <input
                      type="text"
                      value={draft.rule}
                      onChange={(event) => updateDraft("rule", event.target.value)}
                      disabled={reviewLocked}
                      aria-invalid={formAttempted && !draft.rule.trim() ? "true" : undefined}
                      aria-describedby="rule-helper"
                    />
                    <small id="rule-helper">
                      {formAttempted && !draft.rule.trim()
                        ? "请填写适用附加价或明确写“无”。"
                        : "例如：加长提 ¥0.37"}
                    </small>
                  </label>
                </div>

                <label className="field field--wide">
                  <span>价格说明</span>
                  <textarea
                    rows="3"
                    value={draft.description}
                    onChange={(event) => updateDraft("description", event.target.value)}
                    disabled={reviewLocked}
                  />
                  <small>可记录历史叫法、适用说明，不写起订量。</small>
                </label>

                <label className="field field--wide">
                  <span>修改原因</span>
                  <textarea
                    rows="3"
                    value={draft.reason}
                    onChange={(event) => updateDraft("reason", event.target.value)}
                    placeholder="例如：调整加长提附加价"
                    disabled={reviewLocked}
                    aria-required="true"
                    aria-invalid={formAttempted && !draft.reason.trim() ? "true" : undefined}
                    aria-describedby="reason-helper"
                  />
                  <small id="reason-helper">
                    {formAttempted && !draft.reason.trim()
                      ? "修改原因是复核依据，请填写后再提交。"
                      : "发生修改后必填，供复核与审计使用。"}
                  </small>
                </label>

                <section className="history-disclosure">
                  <button
                    type="button"
                    className="history-toggle"
                    aria-expanded={historyOpen}
                    onClick={() => setHistoryOpen((open) => !open)}
                  >
                    <span>
                      <ClockCounterClockwise aria-hidden="true" />
                      价格历史与生效信息
                    </span>
                    {historyOpen ? <CaretUp aria-hidden="true" /> : <CaretRight aria-hidden="true" />}
                  </button>

                  {historyOpen ? (
                    <div className="history-content">
                      <dl>
                        <div>
                          <dt>当前版本</dt>
                          <dd>{selectedRecord.version}</dd>
                        </div>
                        <div>
                          <dt>当前生效时间</dt>
                          <dd>{selectedRecord.effectiveAt}</dd>
                        </div>
                      </dl>

                      <fieldset>
                        <legend>新修改如何生效</legend>
                        <label className="radio-row">
                          <input
                            type="radio"
                            name="effectMode"
                            value="afterReview"
                            checked={draft.effectMode === "afterReview"}
                            onChange={(event) => updateDraft("effectMode", event.target.value)}
                            disabled={reviewLocked}
                          />
                          <span>
                            <strong>复核通过后立即生效</strong>
                            <small>日常单条修改默认使用</small>
                          </span>
                        </label>
                        <label className="radio-row">
                          <input
                            type="radio"
                            name="effectMode"
                            value="scheduled"
                            checked={draft.effectMode === "scheduled"}
                            onChange={(event) => updateDraft("effectMode", event.target.value)}
                            disabled={reviewLocked}
                          />
                          <span>
                            <strong>指定时间生效</strong>
                            <small>需要提前准备新价格时使用</small>
                          </span>
                        </label>
                      </fieldset>

                      {draft.effectMode === "scheduled" ? (
                        <label className="field field--wide">
                          <span>计划生效时间</span>
                          <input
                            type="datetime-local"
                            value={draft.scheduledAt}
                            onChange={(event) => updateDraft("scheduledAt", event.target.value)}
                            disabled={reviewLocked}
                          />
                          <small>复核通过后，在指定时间切换价格。</small>
                        </label>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              </div>

              <footer className="editor-actions">
                <div className="editor-actions__status" aria-live="polite">
                  {reviewLocked ? (
                    <>
                      <ClockCounterClockwise aria-hidden="true" />
                      <span>待复核期间不可修改，撤回后可继续编辑</span>
                    </>
                  ) : submittedMessage ? (
                    <>
                      <CheckCircle aria-hidden="true" />
                      <span>{submittedMessage}</span>
                    </>
                  ) : isDirty ? (
                    <>
                      <ArrowClockwise aria-hidden="true" />
                      <span>有未提交的修改</span>
                    </>
                  ) : (
                    <span>修改字段后可提交复核</span>
                  )}
                </div>
                {reviewLocked ? (
                  <div className="editor-actions__buttons editor-actions__buttons--single">
                    <button
                      type="button"
                      className="button button--quiet"
                      onClick={withdrawPendingDraft}
                    >
                      撤回后继续编辑
                    </button>
                  </div>
                ) : (
                  <div className="editor-actions__buttons">
                    <button
                      type="button"
                      className="button button--quiet"
                      onClick={cancelChanges}
                      disabled={!isDirty || submitState === "loading"}
                    >
                      取消修改
                    </button>
                    <button
                      type="submit"
                      className="button button--primary submit-button"
                      disabled={!isDirty || submitState === "loading"}
                    >
                      {submitState === "loading" ? (
                        <>
                          <SpinnerGap className="spinner" aria-hidden="true" />
                          正在提交
                        </>
                      ) : submitState === "success" ? (
                        <>
                          <CheckCircle aria-hidden="true" weight="fill" />
                          已提交复核
                        </>
                      ) : (
                        "保存并提交复核"
                      )}
                    </button>
                  </div>
                )}
              </footer>
            </form>
          </aside>
        </section>
      </main>
    </div>
  );
}
