import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getOfficeRawMaterialInbound, listOfficeRawMaterialInbounds } from "../../../../src/services/officeRawMaterialApiClient.js";
import { createReadGenerationGuard } from "./read-complete-collection.js";
import { UNLOADED_READ, beginRead, finishRead, invalidateRead, normalizeReceiptQuery, validateReceiptPage } from "./formal-workspace-read-state.js";

const options = Object.freeze({ serverRequired: true });
const queryKey = query => JSON.stringify(query);
const emptyPage = () => ({ ...UNLOADED_READ, items: [], total: 0, stageCounts: null, metrics: null, resultQuery: null });

// List reads annotate duplicateSummary. A single-record detail or command
// response omits that annotation; keep the hint already shown in the queue.
function retainReceiptDuplicateHint(previous, incoming) {
  if (!incoming || !previous) return incoming;
  const next = { ...incoming };
  if (incoming.duplicateSummary == null && previous.duplicateSummary) next.duplicateSummary = previous.duplicateSummary;
  if (incoming.duplicate == null && previous.duplicate) next.duplicate = previous.duplicate;
  if (!Array.isArray(incoming.duplicateCandidates) && Array.isArray(previous.duplicateCandidates)) {
    next.duplicateCandidates = previous.duplicateCandidates;
  }
  return next;
}

export function useReceivingData({ authState, active, operatorId }) {
  const [query, setQuery] = useState(() => normalizeReceiptQuery());
  const [pageState, setPageState] = useState(emptyPage);
  const [selectedId, setSelectedId] = useState("");
  const [details, setDetails] = useState({});
  const authRef = useRef(authState);
  const activeRef = useRef(active);
  const queryRef = useRef(query);
  const selectionRef = useRef(selectedId);
  const cache = useRef(new Map());
  const detailStates = useRef({});
  const guard = useRef(createReadGenerationGuard());
  const inFlight = useRef(new Map());
  const live = useRef(false);
  authRef.current = authState;
  activeRef.current = active;
  queryRef.current = query;
  selectionRef.current = selectedId;
  const session = authState?.session?.accessToken || "";

  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const updateDetailState = useCallback((id, next) => {
    detailStates.current = { ...detailStates.current, [id]: next };
    setDetails(detailStates.current);
  }, []);

  const readDetail = useCallback((id, { force = false } = {}) => {
    const currentAuth = authRef.current;
    if (!id || !currentAuth?.authenticated) return Promise.resolve({ source: "blocked" });
    const key = `detail:${id}`;
    const token = currentAuth.session.accessToken;
    const pendingKey = `${token}:${key}`;
    if (!force && inFlight.current.has(pendingKey)) return inFlight.current.get(pendingKey);
    const version = guard.current.begin(key);
    updateDetailState(id, beginRead(detailStates.current[id]));
    const promise = (async () => {
      const result = await getOfficeRawMaterialInbound({ authState: currentAuth, operatorId, inboundId: id }, options);
      if (!live.current || authRef.current?.session?.accessToken !== token || !guard.current.current(key, version)) return { source: "superseded" };
      if (result.source === "api" && !result.blocked) {
        const cached = cache.current.get(id);
        if (!cached || Number(result.inbound.revision || 0) >= Number(cached.revision || 0)) {
          cache.current.set(id, retainReceiptDuplicateHint(cached, result.inbound));
        }
      }
      updateDetailState(id, finishRead(detailStates.current[id], result));
      return result;
    })();
    inFlight.current.set(pendingKey, promise);
    void promise.finally(() => { if (inFlight.current.get(pendingKey) === promise) inFlight.current.delete(pendingKey); });
    return promise;
  }, [operatorId, updateDetailState]);

  const refreshReceiptPage = useCallback(async () => {
    const currentAuth = authRef.current;
    if (!currentAuth?.authenticated) return { source: "blocked" };
    const requested = queryRef.current;
    const token = currentAuth.session.accessToken;
    const version = guard.current.begin("page");
    setPageState(previous => beginRead(previous));
    const result = validateReceiptPage(await listOfficeRawMaterialInbounds({
      authState: currentAuth, operatorId, page: requested.page, pageSize: requested.pageSize,
      filters: { keyword: requested.keyword, receiptStage: requested.receiptStage },
    }, options), requested);
    if (!live.current || authRef.current?.session?.accessToken !== token || !guard.current.current("page", version)
      || queryKey(requested) !== queryKey(queryRef.current)) return { source: "superseded" };
    if (result.source === "api" && !result.blocked) {
      const lastPage = Math.max(1, Math.ceil(result.total / requested.pageSize));
      if (requested.page > lastPage) {
        const adjusted = { ...requested, page: lastPage };
        queryRef.current = adjusted;
        setQuery(adjusted);
        return { source: "superseded" };
      }
      for (const inbound of result.items) {
        const previous = cache.current.get(inbound.id);
        if (!previous || Number(inbound.revision || 0) >= Number(previous.revision || 0)) cache.current.set(inbound.id, inbound);
      }
      setPageState(previous => ({ ...finishRead(previous, result), items: result.items, total: result.total,
        stageCounts: result.receiptStageCounts, metrics: result.metrics, resultQuery: requested }));
    } else setPageState(previous => ({ ...previous, ...finishRead(previous, result) }));
    return result;
  }, [operatorId]);

  const refreshReceipts = useCallback(async () => {
    const [page, detail] = await Promise.all([refreshReceiptPage(), selectionRef.current ? readDetail(selectionRef.current) : null]);
    return page.source === "api" && detail && detail.source !== "api" ? detail : page;
  }, [refreshReceiptPage, readDetail]);

  const setReceiptQuery = useCallback(patch => {
    const next = normalizeReceiptQuery({ ...queryRef.current, ...patch, page: 1 });
    if (queryKey(next) === queryKey(queryRef.current)) return;
    guard.current.begin("page");
    queryRef.current = next;
    setQuery(next);
  }, []);
  const changeReceiptPage = useCallback(page => {
    const next = normalizeReceiptQuery({ ...queryRef.current, page });
    if (queryKey(next) === queryKey(queryRef.current)) return;
    guard.current.begin("page");
    queryRef.current = next;
    setQuery(next);
  }, []);
  const selectReceipt = useCallback(id => {
    const next = String(id || "");
    selectionRef.current = next;
    setSelectedId(next);
    return next ? readDetail(next) : Promise.resolve({ source: "api" });
  }, [readDetail]);

  const acceptInbound = useCallback(inbound => {
    if (!inbound?.id) return;
    guard.current.begin("page");
    guard.current.begin(`detail:${inbound.id}`);
    const retained = retainReceiptDuplicateHint(cache.current.get(inbound.id), inbound);
    cache.current.set(inbound.id, retained);
    updateDetailState(inbound.id, finishRead(detailStates.current[inbound.id], { source: "api" }));
    setPageState(previous => ({ ...previous, ...invalidateRead(previous),
      items: previous.items.map(item => item.id === inbound.id ? retainReceiptDuplicateHint(item, inbound) : item) }));
    if (activeRef.current) void refreshReceiptPage();
  }, [refreshReceiptPage, updateDetailState]);
  const lookupInbound = useCallback(id => cache.current.get(id), []);
  const getDetailState = useCallback(id => detailStates.current[id] || UNLOADED_READ, []);

  useEffect(() => {
    guard.current.begin("page");
    cache.current.clear();
    detailStates.current = {};
    setDetails({});
    setPageState(emptyPage());
  }, [session]);

  useEffect(() => {
    if (!active || !session) return;
    void refreshReceiptPage();
  }, [active, session, query, refreshReceiptPage]);
  useEffect(() => {
    if (active && session && selectedId) void readDetail(selectedId);
  }, [active, session, selectedId, readDetail]);

  useEffect(() => {
    if (!active || !session) return;
    let pending = false;
    const refreshVisible = async () => {
      if (pending || document.visibilityState === "hidden") return;
      pending = true;
      try {
        await refreshReceipts();
      } finally { pending = false; }
    };
    const timer = window.setInterval(refreshVisible, 15_000);
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [active, session, refreshReceipts]);

  const actions = useMemo(() => ({ setReceiptQuery, changeReceiptPage, selectReceipt, refreshReceipts, refreshReceiptDetail: readDetail }),
    [setReceiptQuery, changeReceiptPage, selectReceipt, refreshReceipts, readDetail]);

  const matchesQuery = pageState.resultQuery && queryKey(pageState.resultQuery) === queryKey(query);
  return {
    receiving: { ...pageState, ...query, query, items: matchesQuery ? pageState.items : [],
      total: matchesQuery ? pageState.total : null, stageCounts: matchesQuery ? pageState.stageCounts : null,
      previousItems: pageState.items, matchesQuery: Boolean(matchesQuery), selectedId,
      selectedInbound: cache.current.get(selectedId) || null, detailState: details[selectedId] || UNLOADED_READ },
    actions,
    acceptInbound, lookupInbound, getDetailState,
  };
}
