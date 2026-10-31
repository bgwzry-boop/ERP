import { useEffect, useMemo, useRef, useState } from "react";
import { SearchOutlined } from "@ant-design/icons";
import { searchGlobalDesktopRecords } from "./globalSearch.js";

export function GlobalSearch({ allowedNavIds, data, onSelect, pending = false }) {
  const rootRef = useRef(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const trimmed = query.trim();
  const results = useMemo(
    () => searchGlobalDesktopRecords(data, trimmed, { allowedNavIds }),
    [allowedNavIds, data, trimmed],
  );
  const highlighted = results.length ? Math.min(activeIndex, results.length - 1) : 0;

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function choose(result) {
    if (!result) return;
    setQuery("");
    setOpen(false);
    setActiveIndex(0);
    onSelect?.(result);
  }

  function onKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(Boolean(trimmed));
        setActiveIndex(0);
        return;
      }
      setActiveIndex((index) => Math.min(index + 1, Math.max(results.length - 1, 0)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(Boolean(trimmed));
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (results.length) choose(results[highlighted]);
      else setOpen(Boolean(trimmed));
    }
  }

  return <label className="global-search" ref={rootRef}>
    <SearchOutlined aria-hidden="true" />
    <input
      aria-activedescendant={open && results.length ? `global-search-option-${highlighted}` : undefined}
      aria-autocomplete="list"
      aria-controls="global-search-results"
      aria-expanded={open && Boolean(trimmed)}
      aria-label="全局搜索"
      autoComplete="off"
      onChange={(event) => {
        const next = event.target.value;
        setQuery(next);
        setActiveIndex(0);
        setOpen(Boolean(next.trim()));
      }}
      onFocus={() => { if (trimmed) setOpen(true); }}
      onKeyDown={onKeyDown}
      placeholder="搜索 客户 / 订单 / 尺寸 / 颜色 / 单据"
      role="combobox"
      type="text"
      value={query}
    />
    {open && trimmed ? <div className="global-search-panel">
      {results.length ? <ul aria-label="搜索结果" id="global-search-results" role="listbox">
        {results.map((result, index) => <li key={`${result.kind}:${result.recordId}`} role="presentation">
          <button
            aria-selected={index === highlighted}
            id={`global-search-option-${index}`}
            onClick={() => choose(result)}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setActiveIndex(index)}
            role="option"
            type="button"
          >
            <span className="global-search-kind">{result.kind === "customer" ? "客户" : "订单"}</span>
            <strong>{result.title}</strong>
            <small>{result.detail}</small>
          </button>
        </li>)}
      </ul> : <p className="global-search-empty" role="status">{pending ? "正在读取客户和订单…" : "没有匹配的客户或订单"}</p>}
    </div> : null}
  </label>;
}
