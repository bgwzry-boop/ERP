import { useCallback, useEffect, useState } from "react";
import { getOfficeFulfillment } from "../../services/officeFulfillmentApiClient.js";

export function useFulfillmentDetail({ authState, fulfillmentId, read = getOfficeFulfillment }) {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState({ key: "", fulfillment: null, error: "", loading: false });
  const allowed = [...(authState?.permissions?.actionPermissions || []), ...(authState?.permissions?.buttonPermissions || [])].includes("fulfillment.read");
  const token = authState?.session?.accessToken || "";
  const key = JSON.stringify([fulfillmentId, token, allowed, version]);
  useEffect(() => {
    if (!fulfillmentId || !allowed || !token) return;
    let active = true;
    const controller = new AbortController();
    setState({ key, fulfillment: null, error: "", loading: true });
    Promise.resolve().then(() => read({ authState, fulfillmentId }, { serverRequired: true, signal: controller.signal })).then(result => {
      if (!active) return;
      const valid = result?.source === "api" && !result.blocked && result.fulfillment?.id === fulfillmentId;
      setState({ key, fulfillment: valid ? result.fulfillment : null, loading: false,
        error: valid ? "" : result?.error?.message || "未能读取指定出库记录，请重试。" });
    }).catch(() => {
      if (active) setState({ key, fulfillment: null, loading: false, error: "读取关联出库单失败，请重试。" });
    });
    return () => { active = false; controller.abort(); };
  }, [key, read]);
  const refresh = useCallback(() => setVersion(value => value + 1), []);
  if (!fulfillmentId) return { fulfillment: null, loading: false, error: "", refresh };
  if (!allowed || !token) return { fulfillment: null, loading: false, error: "当前账号没有读取出库记录的权限，或会话已失效。", refresh };
  return { ...(state.key === key ? state : { fulfillment: null, loading: true, error: "" }), refresh };
}
